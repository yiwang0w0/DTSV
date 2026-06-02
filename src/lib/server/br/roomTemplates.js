/**
 * roomTemplates.js — 把 100 房各采样一个 chamber_template（gamevars 路径 · Phase 31 re-home）
 *
 * 「现有池零改动」的支点：joinRoom 首玩家把 100 房 × chamber_template 的映射写进
 *   gamevars.br.roomTemplates = { [roomId]: templateId }，
 * 之后 getCurrentChamberTemplateId(gamevars, player) 返回 roomTemplates[player.roomId]，
 * 使所有按 templateId 过滤的现有池（item_pool.chamber_template_ids /
 * npc_pool.chamber_template_ids / fragment mapId / 污染 accel 表）零改动继续工作。
 *
 * 纯函数、无 DB、可单测：入参 rooms（br_rooms 拓扑）+ templates（chamber_templates 全表）+ seed，
 * 出 { roomTemplates, templateMeta }。同 seed 同结果（写一次后存 gamevars 永不重算）。
 *
 * 采样策略（按 close_phase stage 偏置，呼应旧 pathGenerator.STAGE_BIAS）：
 *   close_phase 1 (最早收缩=最外圈) : 偏 scan_dense + 保证铺若干 exit（撤离点在外圈合理）
 *   close_phase 2                   : scan / combat 混
 *   close_phase 3                   : combat 为主 + hazard
 *   close_phase 4                   : fragment_dense + hazard
 *   close_phase 5 (最内核)          : fragment / hazard + 至少 1 个 milestone 落在中心房
 */

// 显式 .js 扩展名：与 roomState.js→clock.js 一致，让本纯函数模块可被原生 Node ESM 直接导入单测
//   （webpack/Next 打包下扩展名可省略，两种加载方式都成立）。
import { closePhaseOf, hashSeed, mulberry32 } from './forbidden.js'

// 每个 stage（close_phase 1..5）的类型偏置权重（呼应 pathGenerator.STAGE_BIAS）
const STAGE_TYPE_BIAS = {
  1: { scan_dense: 5, exit: 2, combat_dense: 1 },
  2: { scan_dense: 3, combat_dense: 2, exit: 1, fragment_dense: 1 },
  3: { combat_dense: 3, hazard: 2, scan_dense: 1.5, fragment_dense: 1 },
  4: { fragment_dense: 2, hazard: 2, combat_dense: 1.5, scan_dense: 1 },
  5: { fragment_dense: 2.5, hazard: 2, milestone: 1.5, scan_dense: 0.5 },
}

/** 网格中心坐标（10×10，0-based），用于「milestone 落在中心房」选取 */
const GRID_CX = 4.5
const GRID_CY = 4.5

/**
 * 把一行 chamber_template 折算成 templateMeta 子集（伪 chamber 对象的字段源）。
 * 字段名对齐旧 pathGenerator 实例化形状（templateId/name/type/isExit/exitCost/...），
 * 让 getChamberForPlayer 的 BR 分支能零成本拼出「伪 chamber」喂现有逻辑。
 */
function toTemplateMeta(t) {
  return {
    templateId: t.id,
    templateKey: t.template_key,
    name: t.name,
    type: t.type,
    description: t.description || '',
    regionLabel: t.region_label || null,
    pollutionBase: Number(t.pollution_base) || 0,
    pollutionAccel: Number(t.pollution_accel) || 0,
    isExit: !!t.is_exit,
    exitCost: t.exit_cost || null,
    omegaWindow: Number(t.omega_window) || 0,
    maxItems: Number(t.max_items) || 5,
    maxNpcs: Number(t.max_npcs) || 2,
    weather: t.weather || 'clear',
  }
}

/** 加权抽取（确定性 RNG 版；权重 = spawn_weight × stage 偏置，最小 0.1） */
function weightedPickDeterministic(candidates, biasMap, rng) {
  if (!candidates || candidates.length === 0) return null
  const weighted = candidates.map((c) => {
    const base = (Number(c.spawn_weight) || 1) * (biasMap?.[c.type] || 1)
    return { c, w: Math.max(0.1, base) }
  })
  const total = weighted.reduce((s, x) => s + x.w, 0)
  let r = rng() * total
  for (const x of weighted) {
    r -= x.w
    if (r <= 0) return x.c
  }
  return weighted[weighted.length - 1].c
}

/**
 * 采样 100 房 → chamber_template 映射 + 用到的 templateMeta 子集。
 *
 * @param {Array} rooms     br_rooms 拓扑（zones.loadRooms 结果：{ roomId, gridX, gridY, ... }）
 * @param {Array} templates chamber_templates 全表行（含 enabled / type / spawn_weight / is_exit / ...）
 * @param {number} seed     per-raid 种子
 * @returns {{ roomTemplates: Object<number,number>, templateMeta: Object<number,object> }}
 */
export function sampleRoomTemplates(rooms, templates, seed) {
  const roomTemplates = {}
  const templateMeta = {}

  const roomList = Array.isArray(rooms) ? rooms.filter((r) => r && r.enabled !== false) : []
  const tmplList = Array.isArray(templates) ? templates.filter((t) => t && t.enabled !== false) : []

  if (roomList.length === 0 || tmplList.length === 0) {
    return { roomTemplates, templateMeta }
  }

  // 按 type 分桶
  const byType = {}
  for (const t of tmplList) {
    const ty = t.type || 'scan_dense'
    if (!byType[ty]) byType[ty] = []
    byType[ty].push(t)
  }

  const exitTemplates = byType.exit || []
  const milestoneTemplates = byType.milestone || []

  // 把 template 登记进 templateMeta（去重）
  const registerMeta = (t) => {
    if (t && templateMeta[t.id] == null) templateMeta[t.id] = toTemplateMeta(t)
  }

  // ── 第一步：保底放置 ──────────────────────────────────────
  // (a) 至少 1 个 milestone 落在「最内核（close_phase 最大）且最靠近中心」的房。
  // (b) 在 close_phase 1-2 桶里铺若干 exit（撤离点在外圈合理）。
  const placed = new Set() // 已确定 templateId 的 roomId

  // 计算每房 closePhase + 到中心距离（供保底选址）
  const annotated = roomList.map((r) => {
    const cp = closePhaseOf(seed, r.roomId)
    const gx = r.gridX
    const gy = r.gridY
    const dist =
      gx == null || gy == null
        ? Number.POSITIVE_INFINITY
        : (gx - GRID_CX) * (gx - GRID_CX) + (gy - GRID_CY) * (gy - GRID_CY)
    return { roomId: r.roomId, closePhase: cp, dist }
  })

  // (a) milestone：在 closePhase===5 的房里挑最靠中心的一个；无 close5 房则取全局最靠中心
  if (milestoneTemplates.length > 0) {
    const innerRooms = annotated.filter((a) => a.closePhase === 5)
    const pool = innerRooms.length > 0 ? innerRooms : annotated
    let best = pool[0]
    for (const a of pool) if (a.dist < best.dist) best = a
    if (best) {
      // 确定性挑一个 milestone 模板
      const rng = mulberry32(hashSeed(seed, 'milestone', best.roomId))
      const ms = milestoneTemplates[Math.floor(rng() * milestoneTemplates.length)] || milestoneTemplates[0]
      roomTemplates[best.roomId] = ms.id
      registerMeta(ms)
      placed.add(best.roomId)
    }
  }

  // (b) exit：在 closePhase 1-2 的房里铺若干（目标 ≈ exit 模板数×2，钳到 [2, 该桶房数]）
  if (exitTemplates.length > 0) {
    const outerRooms = annotated
      .filter((a) => (a.closePhase === 1 || a.closePhase === 2) && !placed.has(a.roomId))
      // 确定性排序：先按 closePhase 升序（越外圈越优先），再按 roomId 稳定
      .sort((x, y) => x.closePhase - y.closePhase || x.roomId - y.roomId)
    const targetExits = Math.min(
      outerRooms.length,
      Math.max(2, exitTemplates.length * 2),
    )
    // 确定性间隔铺开（避免全挤在 close1 头部）
    for (let k = 0; k < targetExits; k++) {
      const slot = outerRooms[Math.floor((k * outerRooms.length) / Math.max(1, targetExits))]
      if (!slot || placed.has(slot.roomId)) continue
      const rng = mulberry32(hashSeed(seed, 'exit', slot.roomId))
      const ex = exitTemplates[Math.floor(rng() * exitTemplates.length)] || exitTemplates[0]
      roomTemplates[slot.roomId] = ex.id
      registerMeta(ex)
      placed.add(slot.roomId)
    }
  }

  // ── 第二步：填充其余房（按 stage 偏置加权抽，每房独立确定性子 RNG）──
  for (const r of roomList) {
    if (placed.has(r.roomId)) continue
    const cp = closePhaseOf(seed, r.roomId)
    const bias = STAGE_TYPE_BIAS[cp] || STAGE_TYPE_BIAS[3]

    // 候选 = 该 stage 偏置里出现的类型对应模板；无则全表兜底
    const candidateTypes = Object.keys(bias)
    let candidates = tmplList.filter((t) => candidateTypes.includes(t.type))
    if (candidates.length === 0) candidates = tmplList

    const rng = mulberry32(hashSeed(seed, 'fill', r.roomId))
    const picked = weightedPickDeterministic(candidates, bias, rng) || tmplList[0]
    roomTemplates[r.roomId] = picked.id
    registerMeta(picked)
  }

  return { roomTemplates, templateMeta }
}
