// ─────────────────────────────────────────────────────────────────
// KALEIDO run 纯逻辑：P0 极简采样（chamber_templates 加权抽 N → raidPath 节点）
//   + exit_condition 三型判定。依据 docs/plan/kaleido/02 §2.5/§2.6 + 00-spec §6.1。
// ─────────────────────────────────────────────────────────────────
// 纯模块（相对导入 weightedPick，无 DB/别名依赖）：可被原生 Node ESM 直接 smoke
//   （scripts/smoke-kaleido-runs.mjs）。DB 读写归 gameActions.startKaleidoRun。
// 确定性（规格 §3.1 精神，P0 先行）：同 seed 同输出 —— 禁 Math.random，
//   PRNG = mulberry32(hashStr(seed))，喂给 weightedPick 第三参。
import { weightedPick } from '../../weightedPick.js'

// 字符串 → uint32 种子（FNV-1a 简版；自包含以保 smoke 可原生导入）
export function hashStr(str) {
  let h = 2166136261 >>> 0
  const s = String(str)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

// mulberry32 —— 轻量确定性 PRNG（与 br/forbidden 同族；自包含）
export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// P0 exit_condition 采样：极简采样无法保证 boss NPC 必然投放在被抽 chamber
//   ⇒ 全部用 survive_turns（恒可达成，回合数随 seq 递增）；判定器支持三型（下方），
//   P1 战斗模板保证 boss 后 seq=N 换 'boss_kill'（§3.1）。
function exitConditionForSeq(seq, levelCount) {
  return { type: 'survive_turns', params: { turns: 2 + seq } }
}

// chamber 行 → raidPath 节点（字段契约照 pathGenerator.js:174-191 逐 key 对齐——
//   getChamberForPlayer/搜索/战斗/污染 tick 全按这些 key 读，缺一不可）。
// kaleido 增量字段：kaleidoExit（exit_condition 快照·判定零查询）+ levelId（§2.5 注记·入库后回填）。
function chamberToNode(chamber, idx, seq, levelCount) {
  return {
    idx,
    templateId: chamber.id,
    templateKey: chamber.template_key,
    name: chamber.name,
    type: chamber.type,
    description: chamber.description || '',
    loreInjections: [], // 残片引擎休眠（FRAGMENTS.ENABLED=false）·P0 不注入
    regionLabel: chamber.region_label || null,
    pollutionBase: chamber.pollution_base || 0,
    pollutionAccel: chamber.pollution_accel || 0,
    isExit: !!chamber.is_exit,
    exitCost: chamber.exit_cost || null,
    omegaWindow: chamber.omega_window || 0,
    maxItems: chamber.max_items || 5,
    maxNpcs: chamber.max_npcs || 2,
    exitCount: chamber.exit_count || 2,
    kaleidoExit: exitConditionForSeq(seq, levelCount),
    levelId: null, // startKaleidoRun 在 levels 入库后回填
  }
}

// P0 极简采样：enabled 模板加权（spawn_weight）无放回抽 levelCount 个 → raidPath 节点数组。
// 候选不足 levelCount 时允许放回（小库也能开 run）；candidates 为空返回 []（调用方报错）。
export function sampleKaleidoPath(chambers, seed, levelCount = 5) {
  const candidates = (Array.isArray(chambers) ? chambers : []).filter((c) => c && c.enabled !== false)
  if (candidates.length === 0) return []
  const rng = mulberry32(hashStr(`${seed}:kaleido-path`))
  const used = new Set()
  const nodes = []
  for (let i = 0; i < levelCount; i++) {
    const pool = candidates.filter((c) => !used.has(c.id))
    const from = pool.length > 0 ? pool : candidates // 无放回优先，候选耗尽再放回
    const picked = weightedPick(from, (c) => c.spawn_weight || 1, rng)
    if (!picked) break
    used.add(picked.id)
    nodes.push(chamberToNode(picked, i, i + 1, levelCount))
  }
  return nodes
}

// levels 表行（Level Schema v0.3 最小落法·00-spec §6.1 + 02 §2.5 两条绑定注记：
//   event_deck 只 ID 引用（P0 空 = 用 chamber 既有投放）；combat_mode 只有 'standard'；
//   env_rules/formula_overrides 空 = 中性不覆盖）。
export function buildLevelRows(runId, nodes, seed) {
  return (nodes || []).map((node, i) => ({
    run_id: runId,
    seq: i + 1,
    gen_meta: { source: 'sampled', seed, template_key: node.templateKey },
    payload: {
      run_id: runId,
      seq: i + 1,
      spine_ref: null,
      gen_meta: { source: 'sampled', seed },
      combat_mode: { template_ref: 'standard', params: {} },
      env_rules: [],
      formula_overrides: [],
      event_deck: [],
      exit_condition: node.kaleidoExit,
      difficulty_band: { target_clear_rate: [0.4, 0.7] },
      validation: {},
      chamber_ref: { template_id: node.templateId, template_key: node.templateKey },
    },
    status: 'ready',
  }))
}

// exit_condition 三型判定（02 §2.6）。纯函数；未知类型恒 false（保守）。
//   boss_kill      — 读 gamevars.bossDefeated（击杀 level==='boss' NPC 时置位·gameActions:1820）
//   survive_turns  — 读 player.turnCount（每消耗性动词 +1·per-level 过关清零）
//   collect        — 读 player.inventory 中目标道具计数（inventory 为道具名展开数组）
export function evaluateExitCondition(cond, player, gamevars) {
  if (!cond || typeof cond !== 'object') return false
  const params = cond.params || {}
  if (cond.type === 'boss_kill') {
    return gamevars?.bossDefeated === true
  }
  if (cond.type === 'survive_turns') {
    const need = Number.isFinite(params.turns) ? params.turns : 5
    return (player?.turnCount ?? 0) >= need
  }
  if (cond.type === 'collect') {
    const itemName = params.itemName
    if (!itemName) return false
    const need = Number.isFinite(params.count) ? params.count : 1
    const have = (Array.isArray(player?.inventory) ? player.inventory : [])
      .filter((n) => n === itemName).length
    return have >= need
  }
  return false
}
