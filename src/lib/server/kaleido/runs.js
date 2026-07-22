// ─────────────────────────────────────────────────────────────────
// KALEIDO run 采样器（KP1-S D1 正式化 · 02 §3.1）+ exit_condition 三型判定。
// ─────────────────────────────────────────────────────────────────
// 纯模块（相对导入 weightedPick/combatModes，无 DB/别名依赖）：可被原生 Node ESM 直接 smoke。
//   DB 读写归 gameActions.startKaleidoRun（它拉 pools 后喂纯函数 sampleRun）。
// 确定性（§3.1）：同 seed 同输出 —— 禁 Math.random，PRNG = mulberry32(hashStr(seed))。
// 正式化要点：5 archetype（搜索/遭遇/精英/资源/首领）+ 难度曲线（seq 单调抬）+ 三模板保证出现
//   （C 裁决：standard/gauntlet/stance_duel）+ content_pool 种子关优先消费 + seq=末关强制 boss_kill。
import { weightedPick } from '../../weightedPick.js'
import { getCombatMode } from './combatModes/index.js'

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

// ── 5 关型 archetype（§3.1）：结构配置 + combat_mode 分配（C 裁决：一个 5 关 run 内三模板都出现） ──
//   mode：standard=富路径（现有 calcDamage+pipeline，机械默认层）/ gauntlet=波次（推进层编排）/
//         stance_duel=三态克制（attackNpc 加 stance 参真接 combatModes）。
//   chamberTypes：优先挑此类 chamber（chamber_templates.type）；itemBias/npcBias：event_deck 权重偏置。
export const ARCHETYPES = {
  search:    { label: '搜索', mode: 'standard',    exit: 'survive_turns', chamberTypes: ['scan_dense', 'fragment_dense'], enemyMul: 0.85, itemBias: 1.5, npcBias: 0.6 },
  encounter: { label: '遭遇', mode: 'gauntlet',    exit: 'survive_turns', chamberTypes: ['combat_dense'],                enemyMul: 1.0,  itemBias: 0.8, npcBias: 1.6 },
  elite:     { label: '精英', mode: 'stance_duel', exit: 'survive_turns', chamberTypes: ['combat_dense', 'hazard'],       enemyMul: 1.25, itemBias: 0.9, npcBias: 1.0 },
  resource:  { label: '资源', mode: 'standard',    exit: 'survive_turns', chamberTypes: ['scan_dense'],                  enemyMul: 0.9,  itemBias: 1.7, npcBias: 0.6 },
  boss:      { label: '首领', mode: 'standard',    exit: 'boss_kill',     chamberTypes: ['milestone', 'exit', 'hazard'], enemyMul: 1.6,  itemBias: 1.0, npcBias: 1.0 },
}

// 一个 run 的 archetype 序列：末关恒 boss；前段循环含 encounter(gauntlet)+elite(stance_duel)
//   → levelCount≥4 时三模板必全出现（C 裁决 P1 闸门「3 模板均出现」）。levelCount=5 得
//   [搜索, 遭遇, 精英, 资源, 首领]。
export function archetypeSequence(levelCount = 5) {
  const n = Math.max(1, Math.floor(levelCount))
  if (n === 1) return ['boss']
  const mid = ['search', 'encounter', 'elite', 'resource']
  const seq = []
  for (let i = 0; i < n - 1; i++) seq.push(mid[i % mid.length])
  seq.push('boss')
  return seq
}

// 难度曲线：敌人属性随 seq 单调抬（t=0..1 线性）× archetype enemyMul。boss 末关最强。
function scaleEnemy(baseNpc, seq, levelCount, archMul) {
  const t = (seq - 1) / Math.max(1, levelCount - 1)
  const m = (1 + 0.6 * t) * archMul
  return {
    npcId: baseNpc?.id ?? null,
    name: baseNpc?.name || '未知敌体',
    hp: Math.max(10, Math.floor((baseNpc?.hp ?? 40) * m)),
    maxHp: Math.max(10, Math.floor((baseNpc?.hp ?? 40) * m)),
    atk: Math.max(1, Math.floor((baseNpc?.atk ?? 8) * m)),
    def: Math.max(0, Math.floor((baseNpc?.def ?? 3) * (1 + 0.3 * t))),
    level: archMul >= 1.6 ? 'boss' : (baseNpc?.level || 'normal'),
  }
}

// combat_mode.params + exit_condition + 预渲染 describe（R6·§3.3；🎨 R6 卡直接读，免 import 服务端）。
function combatModeFor(arch, seq, levelCount) {
  if (arch.mode === 'gauntlet') {
    const waves = 2 + Math.floor(seq / 2) // 波数随 seq 抬（推进层编排·裁决 3）
    const params = { waves, atkMul: 1, defMul: 0.5 }
    return { template_ref: 'gauntlet', params, describe: getCombatMode('gauntlet').describe(params) }
  }
  if (arch.mode === 'stance_duel') {
    const params = { counterMul: 1.6, atkMul: 1, defMul: 0.5 }
    return { template_ref: 'stance_duel', params, describe: getCombatMode('stance_duel').describe(params) }
  }
  const params = {}
  return { template_ref: 'standard', params, describe: getCombatMode('standard').describe(params) }
}

// boss_kill 生效开关：KP1 LW-1 已接 live boss 投放（movePlayer 入关 boss 关生成 boss 实例 + 自动遭遇），
//   故翻 true —— boss 关 kaleidoExit 出 boss_kill，玩家 attackNpc 杀 boss → bossDefeated → 过关闭环。
//   ⚠ 翻 true 后 seq5 不再 survive_turns，kaleido-e2e.mjs 的「每关 2+seq」断言在 seq5 需改为「杀 boss」
//   （由 🧭 主对话在 E2E 加 seq5 boss_kill 断言并重跑，见 LW-1 提交回报）。
export const BOSS_KILL_LIVE = true
function exitFor(arch, seq) {
  if (arch.exit === 'boss_kill' && BOSS_KILL_LIVE) return { type: 'boss_kill', params: {} }
  // 全部 survive_turns 统一 2+seq（含 boss 回落）——与 kaleido-e2e.mjs「每关 2+seq」断言一致，保 search 清关 20/20。
  //   口径含「进关 move 占 1 回合」(04 语义注记)。boss_kill 待 BOSS_KILL_LIVE 翻 true（连 boss 投放 + E2E 复验）。
  return { type: 'survive_turns', params: { turns: 2 + seq } }
}

// event_deck：archetype 加权的 npc/item ID 引用（§2.5 铁律：只 ID 引用，运行时以覆盖后实体结算）。
function buildEventDeck(arch, enemy, itemPool, rng) {
  const deck = []
  if (enemy?.npcId != null) deck.push({ type: 'npc_encounter', npc: { id: enemy.npcId, hp: enemy.hp, atk: enemy.atk, def: enemy.def }, weight: 3, once: arch.exit === 'boss_kill' })
  const item = itemPool.length ? weightedPick(itemPool, () => 1, rng) : null
  if (item) deck.push({ type: 'item_find', item: { id: item.id }, weight: Math.max(1, Math.round(3 * arch.itemBias)) })
  return deck
}

// chamber 行 → raidPath 节点（字段契约照 pathGenerator.js:174-191 逐 key 对齐，下游搜索/战斗/污染必读）。
// kaleido 增量字段：kaleidoExit / kaleidoMode(combat_mode) / kaleidoEnemy(combatSetup) / archetype / levelId。
function chamberToNode(chamber, idx, seq, levelCount, ctx) {
  return {
    idx,
    templateId: chamber.id,
    templateKey: chamber.template_key,
    name: chamber.name,
    type: chamber.type,
    description: chamber.description || '',
    loreInjections: [],
    regionLabel: chamber.region_label || null,
    pollutionBase: chamber.pollution_base || 0,
    pollutionAccel: chamber.pollution_accel || 0,
    isExit: !!chamber.is_exit,
    exitCost: chamber.exit_cost || null,
    omegaWindow: chamber.omega_window || 0,
    maxItems: chamber.max_items || 5,
    maxNpcs: chamber.max_npcs || 2,
    exitCount: chamber.exit_count || 2,
    // ── kaleido 正式化字段 ──
    archetype: ctx.archKey,
    kaleidoExit: ctx.exit,
    kaleidoMode: ctx.combatMode,      // { template_ref, params, describe }
    kaleidoEnemy: ctx.enemy,          // combatSetup（gauntlet/stance_duel live + 离线 sim 用）
    kaleidoEventDeck: ctx.eventDeck,
    // D3 逐关规则覆盖：种子关 payload 的 env_rules/formula_overrides 带到运行时 node
    //   （此前只写进 levels 表且恒空，运行时读的是 raidPath → 覆盖等于丢弃）。缺省空数组 = 无覆盖。
    kaleidoEnvRules: ctx.envRules || [],
    kaleidoFormulaOverrides: ctx.formulaOverrides || [],
    seedLevelId: ctx.seedLevelId || null, // 命中 content_pool 种子关时的来源 id（buildLevelRows gen_meta.source）
    levelId: null,
  }
}

// 从候选池按 archetype 偏好挑 chamber（type 匹配优先，加权 spawn_weight）；无匹配回落全池。
function pickChamber(chambers, arch, used, rng) {
  const avail = chambers.filter((c) => !used.has(c.id))
  const pool = avail.length ? avail : chambers
  const typed = pool.filter((c) => arch.chamberTypes.includes(c.type))
  const from = typed.length ? typed : pool
  return weightedPick(from, (c) => c.spawn_weight || 1, rng)
}

// ── 正式采样器（§3.1）：sampleRun(seed, {levelCount, pools}) → nodes[]。纯函数、同 seed 同输出。 ──
//   pools = { chambers, npcs, items, seedLevels }。优先消费 content_pool 种子关（seedLevels），
//   不足才从 chamber_templates + npc_pool + item_pool 现场装配（套 archetype）。
export function sampleRun(seed, { levelCount = 5, pools = {} } = {}) {
  const chambers = (pools.chambers || []).filter((c) => c && c.enabled !== false)
  const npcs = (pools.npcs || []).filter(Boolean)
  const items = (pools.items || []).filter(Boolean)
  const seedLevels = (pools.seedLevels || []).filter(Boolean) // content_pool entity_type='level'
  if (chambers.length === 0) return []

  const rng = mulberry32(hashStr(`${seed}:kaleido-run`))
  const seq = archetypeSequence(levelCount)
  const usedChambers = new Set()
  const usedSeedLevels = new Set()
  const nodes = []

  for (let i = 0; i < seq.length; i++) {
    const archKey = seq[i]
    const arch = ARCHETYPES[archKey]
    const s = i + 1
    const chamber = pickChamber(chambers, arch, usedChambers, rng)
    if (!chamber) break
    usedChambers.add(chamber.id)

    // 优先消费匹配 archetype 的种子关（provenance.source='seed'）——payload 直接沿用其 combat_mode/exit。
    const seedMatch = seedLevels.find((sl) => !usedSeedLevels.has(sl.id)
      && (sl.payload?.archetype === archKey || sl.provenance?.archetype === archKey))
    if (seedMatch) {
      usedSeedLevels.add(seedMatch.id)
      const p = seedMatch.payload || {}
      validateSeedLevel(p, s, seedMatch.id) // hook⑥(10-avg A1)：boss_kill 缺敌 / guaranteed 超预算 → warn(非致命)
      nodes.push(chamberToNode(chamber, i, s, levelCount, {
        archKey,
        exit: p.exit_condition || exitFor(arch, s),
        combatMode: p.combat_mode || combatModeFor(arch, s, levelCount),
        enemy: p.combatSetup?.enemy || null,
        eventDeck: p.event_deck || [],
        envRules: p.env_rules || [],                  // D3：逐关环境规则
        formulaOverrides: p.formula_overrides || [],  // D3：逐关公式覆盖(白名单 damage|defense|crit)
        seedLevelId: seedMatch.id,
      }))
      continue
    }

    // 现场装配：采一个 npc 作敌体基 → 按 seq/archetype 缩放。
    const baseNpc = npcs.length ? weightedPick(npcs, (n) => n.spawn_weight || 1, rng) : null
    const enemy = scaleEnemy(baseNpc, s, levelCount, arch.enemyMul)
    const combatMode = combatModeFor(arch, s, levelCount)
    const eventDeck = buildEventDeck(arch, enemy, items, rng)
    nodes.push(chamberToNode(chamber, i, s, levelCount, {
      archKey, exit: exitFor(arch, s), combatMode, enemy, eventDeck,
    }))
  }
  return nodes
}

// 向后兼容包装（startKaleidoRun 旧签名）：只传 chambers 时退化为仅 chamber 池的现场装配。
export function sampleKaleidoPath(chambers, seed, levelCount = 5) {
  return sampleRun(seed, { levelCount, pools: { chambers } })
}

// hook⑥（10-avg A1）种子关采样校验（非致命·warn；纯函数·可 smoke）：
//   ① boss_kill 必须带 combatSetup.enemy（否则死关：boss_kill 不可满足·无 boss 实体可杀）。
//   ② guaranteed item_find 件数 ≤ 本关可用 search 数（=survive_turns −（非首关入关 move 占 1 回合））
//      → 保证 hook① 的 front-load「1/search」在清关前发完（guaranteed 硬保证不变式）。
export function validateSeedLevel(payload, seq, id) {
  const p = payload || {}
  const exitType = p.exit_condition?.type
  if (exitType === 'boss_kill' && !(p.combatSetup?.enemy && Number(p.combatSetup.enemy.hp) > 0)) {
    console.warn(`[kaleido/seed] ⚠ 关 ${id}(seq${seq}) boss_kill 缺 combatSetup.enemy → 死关（boss_kill 不可满足）`)
  }
  if (exitType === 'survive_turns') {
    const turns = Number(p.exit_condition?.params?.turns) || 0
    const searches = Math.max(0, turns - (seq > 1 ? 1 : 0)) // 非首关入关 move 占 1 回合（04 §5 语义）
    const guaranteed = (Array.isArray(p.event_deck) ? p.event_deck : [])
      .filter((e) => e && e.type === 'item_find' && e.guaranteed).length
    if (guaranteed > searches) {
      console.warn(`[kaleido/seed] ⚠ 关 ${id}(seq${seq}) guaranteed item ${guaranteed} > 可用 search ${searches} → 硬保证不成立（玩家最短路径可能漏发）`)
    }
  }
}

// levels 表行（Level Schema v0.3·00-spec §6.1 + 02 §2.5）：combat_mode/exit/event_deck 取自 node（正式化）。
//   env_rules/formula_overrides 空 = 中性（逐关覆盖在 D3 接线；P1 采样默认不覆盖）。
export function buildLevelRows(runId, nodes, seed) {
  return (nodes || []).map((node, i) => ({
    run_id: runId,
    seq: i + 1,
    gen_meta: { source: node.seedLevelId ? 'seed' : 'sampled', seed, template_key: node.templateKey, archetype: node.archetype },
    payload: {
      run_id: runId,
      seq: i + 1,
      archetype: node.archetype,
      spine_ref: null,
      gen_meta: { source: node.seedLevelId ? 'seed' : 'sampled', seed },
      combat_mode: node.kaleidoMode || { template_ref: 'standard', params: {}, describe: '' },
      combatSetup: node.kaleidoEnemy ? { enemy: node.kaleidoEnemy } : null,
      env_rules: node.kaleidoEnvRules || [],                   // D3：域真源随 node（此前恒空 → 覆盖丢失）
      formula_overrides: node.kaleidoFormulaOverrides || [],
      event_deck: node.kaleidoEventDeck || [],
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
//   survive_turns  — 读 player.turnCount（每消耗性动词 +1·per-level：movePlayer 入关时清零）
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
