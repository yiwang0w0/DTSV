/**
 * Phase 19.3 — Chamber 路径生成器
 *
 * 每 raid 开始时从 chamber_templates 池抽 20-25 个 chamber，按"序曲 → 主体 → 末段
 * → boss" 的节奏组合成一条线性路径（gamevars.raidPath[]）。
 *
 * 路径结构（按 chamber 数）：
 *   [0]      序曲：必 scan_dense（外环维护廊一类）— 起点安全
 *   [1..4]   早期：scan + combat + fragment 混合（污染 0-40%）
 *   [5..14]  中期：combat + hazard 增多（污染 40-70%）
 *   [15..22] 末段：fragment_dense + hazard + Ω-段 chamber（污染 70-95%）
 *   [N-1]    终局：milestone（boss + ending 触发点）
 *
 * 每个 chamber 末尾给 2-3 个分支选项（exit_count）— 玩家选下一段。
 * raidPath 是线性序列（已确定），但客户端展示时只 reveal 当前 chamber +
 * 下面 2-3 个候选（用户选定后真正前进）。
 *
 * Phase 20.2: 接入 unlocks_rules — 玩家已完全解码（decode_level=3）的残片可影响
 *   chamber 抽取权重 + lore 短句注入 + item amount delta。规则在 joinRoom 时
 *   预合并，作为 generateRaidPath 的第二参数传入。
 *
 * research 2026-05-29-B P1: 高危出勤 — 第三参 options.heatLevel 在路径生成末尾上调
 *   每个 chamber 的 maxNpcs + 收紧 omegaWindow（applyHeatToRaidPath，HIGH_RISK.ENABLED 门控）。
 */

import { applyHeatToRaidPath } from './heat'
import { weightedPick } from '@/lib/weightedPick'

const PATH_LENGTH_MIN = 20
const PATH_LENGTH_MAX = 25

// 阶段比例：每个阶段优先抽哪些类型
const STAGE_BIAS = {
  opening:  { scan_dense: 5, exit: 0.5 },                                          // chamber 0
  early:    { scan_dense: 3, combat_dense: 2, fragment_dense: 1, exit: 1 },        // 1-4
  middle:   { combat_dense: 3, hazard: 2, scan_dense: 1.5, fragment_dense: 1 },    // 5-14
  late:     { fragment_dense: 2, hazard: 2, combat_dense: 1.5, scan_dense: 1 },    // 15-22
  finale:   { milestone: 10 },                                                     // 最后一个
}

/**
 * 按阶段偏置筛选 + 抽取一个 chamber
 *
 * Phase 20.2: 加 chamberWeightDelta（{ template_id: delta }），影响最终权重计算
 */
function pickChamberForStage(stage, allChambers, usedIds, chamberWeightDelta = {}) {
  const bias = STAGE_BIAS[stage] || {}
  const candidates = allChambers
    .filter(c => c.enabled !== false)
    .filter(c => !usedIds.has(c.id) || bias[c.type] >= 2)  // 高偏置类型允许复用
    .filter(c => bias[c.type] !== undefined)

  if (candidates.length === 0) {
    // fallback：不限阶段抽（默认权重 spawn_weight||1，与原行为一致）
    return weightedPick(allChambers.filter(c => c.enabled !== false && !usedIds.has(c.id)), (c) => c.spawn_weight || 1)
  }

  return weightedPick(candidates, (c) => {
    const base = (c.spawn_weight || 1) * (bias[c.type] || 1)
    const delta = Number(chamberWeightDelta?.[c.id]) || 0
    return Math.max(0.1, base + delta) // 权重最少 0.1，避免被完全屏蔽
  })
}

/**
 * Phase 20.2: 把多条 unlocks_rules 合并成一份净规则
 *
 * @param {Array<object>} rulesList — 每个元素可以是：
 *   - 旧形式：plain unlocks_rules JSON 对象（向后兼容，sourceFragmentId 会为 null）
 *   - 新形式（Phase 24a）：{ rules: unlocks_rules JSON, fragmentId: number }
 * @returns {{ chamberWeight: object, loreChunkPool: Array<{text, sourceFragmentId}>, npcUnlock: number[], itemAmountDelta: object }}
 *
 * Phase 24a 改造：loreChunkPool 条目从纯字符串变为 { text, sourceFragmentId } 对象，
 * 让客户端可以按"玩家是否完全解码该残片"过滤可见性。
 */
export function mergeUnlocksRules(rulesList) {
  const merged = {
    chamberWeight: {},
    loreChunkPool: [],
    npcUnlock: [],
    itemAmountDelta: {},
  }
  if (!Array.isArray(rulesList)) return merged

  for (const entry of rulesList) {
    // 兼容两种调用方式
    const raw = entry?.rules ?? entry
    const fragmentId = entry?.fragmentId ?? null
    if (!raw || typeof raw !== 'object') continue

    // chamber_weight: 累加
    const cw = raw.chamber_weight || {}
    for (const [k, v] of Object.entries(cw)) {
      const id = Number(k)
      const delta = Number(v) || 0
      if (!Number.isFinite(id)) continue
      merged.chamberWeight[id] = (merged.chamberWeight[id] || 0) + delta
    }

    // lore_chunk_pool: 合并 + 去重（按 text + sourceFragmentId 组合去重）
    const pool = Array.isArray(raw.lore_chunk_pool) ? raw.lore_chunk_pool : []
    for (const chunk of pool) {
      if (typeof chunk !== 'string') continue
      const exists = merged.loreChunkPool.some(c => c.text === chunk && c.sourceFragmentId === fragmentId)
      if (!exists) merged.loreChunkPool.push({ text: chunk, sourceFragmentId: fragmentId })
    }

    // npc_unlock: 合并 + 去重
    const npcs = Array.isArray(raw.npc_unlock) ? raw.npc_unlock : []
    for (const npcId of npcs) {
      const id = Number(npcId)
      if (Number.isFinite(id) && !merged.npcUnlock.includes(id)) {
        merged.npcUnlock.push(id)
      }
    }

    // item_amount_delta: 累加（按名）
    const iad = raw.item_amount_delta || {}
    for (const [name, v] of Object.entries(iad)) {
      const delta = Number(v) || 0
      if (!name) continue
      merged.itemAmountDelta[name] = (merged.itemAmountDelta[name] || 0) + delta
    }
  }

  return merged
}

/**
 * 生成单次 raid 的 chamber 路径
 * @param {Array} allChambers — chamber_templates 全表
 * @param {object} [unlocksMerged] — Phase 20.2: 玩家解锁规则合并结果（可选）
 *        { chamberWeight: { template_id: delta }, loreChunkPool: [text], ... }
 * @param {object} [options] — research 2026-05-29-B P1: { heatLevel } 高危出勤难度修正（可选）
 * @returns {Array} raidPath — chamber 实例化记录数组
 */
export function generateRaidPath(allChambers, unlocksMerged = null, options = {}) {
  if (!allChambers || allChambers.length === 0) return []

  const chamberWeightDelta = unlocksMerged?.chamberWeight || {}
  const loreChunkPool = unlocksMerged?.loreChunkPool || []

  const length = PATH_LENGTH_MIN + Math.floor(Math.random() * (PATH_LENGTH_MAX - PATH_LENGTH_MIN + 1))
  const usedIds = new Set()
  const path = []

  for (let i = 0; i < length; i++) {
    let stage
    if (i === 0) stage = 'opening'
    else if (i <= 4) stage = 'early'
    else if (i <= 14) stage = 'middle'
    else if (i < length - 1) stage = 'late'
    else stage = 'finale'

    let chamber = pickChamberForStage(stage, allChambers, usedIds, chamberWeightDelta)
    if (!chamber) {
      // 全没选到时强制找最低权重的
      chamber = allChambers.find(c => c.enabled !== false) || null
    }
    if (!chamber) break

    usedIds.add(chamber.id)

    // Phase 20.3 / 24a: lore 短句不再直接拼到 description，改存到 loreInjections 数组，
    // 让客户端按"该玩家是否完全解码 sourceFragmentId"过滤可见性
    const description = chamber.description || ''
    const loreInjections = []
    if (loreChunkPool.length > 0 && Math.random() < 0.30) {
      const pick = loreChunkPool[Math.floor(Math.random() * loreChunkPool.length)]
      loreInjections.push({ text: pick.text, sourceFragmentId: pick.sourceFragmentId })
    }

    // 实例化 — 写入 path（快照 chamber 模板的关键字段，避免后续 admin 改模板影响在跑 raid）
    path.push({
      idx: i,
      templateId: chamber.id,
      templateKey: chamber.template_key,
      name: chamber.name,
      type: chamber.type,
      description,
      loreInjections, // Phase 24a: 每条 { text, sourceFragmentId }，客户端按解码状态过滤
      regionLabel: chamber.region_label || null,
      pollutionBase: chamber.pollution_base || 0,
      pollutionAccel: chamber.pollution_accel || 0,
      isExit: !!chamber.is_exit,
      exitCost: chamber.exit_cost || null,
      omegaWindow: chamber.omega_window || 0,
      maxItems: chamber.max_items || 5,
      maxNpcs: chamber.max_npcs || 2,
      exitCount: chamber.exit_count || 2,
    })
  }

  // research 2026-05-29-B P1: 高危出勤难度修正（HIGH_RISK.ENABLED + heatLevel>0 才生效，否则原样返回）
  return applyHeatToRaidPath(path, options?.heatLevel)
}
