// KALEIDO 采样器离线 smoke：archetype 序列 / 三模板保证出现 / 难度曲线 / 种子关优先 /
//   确定性 / buildLevelRows / exit_condition 三型判定。跑：node scripts/smoke-kaleido-runs.mjs
import {
  ARCHETYPES, archetypeSequence, sampleRun, sampleKaleidoPath, BOSS_KILL_LIVE,
  buildLevelRows, evaluateExitCondition, hashStr, mulberry32,
} from '../src/lib/server/kaleido/runs.js'

let pass = 0, fail = 0
function ok(cond, msg) { if (cond) { pass++ } else { fail++; console.error('  ✗', msg) } }

// ── 素材 ──
const chambers = Array.from({ length: 14 }, (_, i) => ({
  id: i + 1, template_key: `t${i + 1}`, name: `舱段${i + 1}`,
  type: ['scan_dense', 'combat_dense', 'fragment_dense', 'hazard', 'milestone', 'exit'][i % 6],
  description: 'd', region_label: '外环', pollution_base: 2, pollution_accel: 1,
  is_exit: i % 6 === 5, exit_cost: null, omega_window: 0, max_items: 4, max_npcs: 2,
  spawn_weight: (i % 3) + 1, exit_count: 2, enabled: i !== 7,
}))
const npcs = Array.from({ length: 6 }, (_, i) => ({ id: 100 + i, name: `敌${i}`, hp: 40, atk: 8, def: 3, level: 'normal', spawn_weight: 1 }))
const items = Array.from({ length: 5 }, (_, i) => ({ id: 200 + i, name: `道具${i}` }))
const pools = { chambers, npcs, items, seedLevels: [] }

// ── PRNG 基线 ──
ok(hashStr('abc') === hashStr('abc') && hashStr('abc') !== hashStr('abd'), 'hashStr 稳定且区分')
const r1 = mulberry32(42), r2 = mulberry32(42)
ok(r1() === r2() && r1() === r2(), 'mulberry32 同种子同序列')

// ── archetypeSequence ──
const seq5 = archetypeSequence(5)
ok(JSON.stringify(seq5) === JSON.stringify(['search', 'encounter', 'elite', 'resource', 'boss']), 'levelCount=5 序列固定')
ok(archetypeSequence(5).at(-1) === 'boss', '末关恒 boss')
ok(archetypeSequence(1)[0] === 'boss', 'levelCount=1 → 仅 boss')
const modes5 = seq5.map((k) => ARCHETYPES[k].mode)
ok(modes5.includes('standard') && modes5.includes('gauntlet') && modes5.includes('stance_duel'), '5 关序列三模板全覆盖（C 裁决）')

// ── sampleRun：形状 + 三模板 + boss + describe ──
const run = sampleRun('seed-A', { levelCount: 5, pools })
ok(run.length === 5, '抽满 5 关')
ok(run.every((n, i) => n.idx === i), 'idx 0-based 连续')
const refs = run.map((n) => n.kaleidoMode.template_ref)
ok(refs.includes('standard') && refs.includes('gauntlet') && refs.includes('stance_duel'), '3 模板均出现在 run 中')
ok(run.every((n) => typeof n.kaleidoMode.describe === 'string' && n.kaleidoMode.describe.length > 4), 'combat_mode.describe 预渲染中文串（R6）')
ok(run[4].archetype === 'boss', 'seq5 = boss 关')
// boss_kill 由 BOSS_KILL_LIVE 门控（live boss 投放接线前退化 survive_turns·防 seq5 卡死）
ok(run[4].kaleidoExit.type === (BOSS_KILL_LIVE ? 'boss_kill' : 'survive_turns'), `seq5 exit 随 BOSS_KILL_LIVE(=${BOSS_KILL_LIVE})`)
ok(run.slice(0, 4).every((n) => n.kaleidoExit.type === 'survive_turns'), '非 boss 关 = survive_turns')
const REQUIRED_KEYS = ['idx', 'templateId', 'name', 'type', 'isExit', 'maxItems', 'archetype', 'kaleidoExit', 'kaleidoMode', 'kaleidoEnemy', 'kaleidoEventDeck', 'levelId']
ok(REQUIRED_KEYS.every((k) => k in run[0]), `节点契约字段齐（${REQUIRED_KEYS.length}）`)
// gauntlet 关带 waves 参 + stance_duel 带 counterMul
const gaunt = run.find((n) => n.kaleidoMode.template_ref === 'gauntlet')
const stance = run.find((n) => n.kaleidoMode.template_ref === 'stance_duel')
ok(Number.isFinite(gaunt?.kaleidoMode.params.waves), 'gauntlet 关带 waves 参（推进层用）')
ok(Number.isFinite(stance?.kaleidoMode.params.counterMul), 'stance_duel 关带 counterMul 参')

// ── 确定性：同 seed 同输出（模板序列 + chamber 序列 + 敌人属性逐字段） ──
const runB = sampleRun('seed-A', { levelCount: 5, pools })
ok(JSON.stringify(run) === JSON.stringify(runB), '同 seed 逐字节一致（种子回放基石）')
const runC = sampleRun('seed-Z', { levelCount: 5, pools })
ok(JSON.stringify(run.map((n) => n.templateId)) !== JSON.stringify(runC.map((n) => n.templateId)), '异 seed 大概率不同 chamber 序')

// ── 难度曲线：单 NPC 池 → 敌人属性随 seq 单调抬（boss 最强） ──
{
  const onePool = { chambers, npcs: [{ id: 1, name: 'E', hp: 40, atk: 8, def: 3, level: 'normal', spawn_weight: 1 }], items, seedLevels: [] }
  const r = sampleRun('diff', { levelCount: 5, pools: onePool })
  const hps = r.map((n) => n.kaleidoEnemy?.hp ?? 0)
  ok(hps[4] >= hps[0], `难度曲线：末关敌 HP(${hps[4]}) ≥ 首关(${hps[0]})`)
  ok(r[4].kaleidoEnemy?.level === 'boss', 'boss 关敌体 level=boss')
}

// ── content_pool 种子关优先 ──
{
  const seedLevel = {
    id: 9001, provenance: { source: 'seed', archetype: 'elite' },
    payload: { archetype: 'elite', combat_mode: { template_ref: 'stance_duel', params: { counterMul: 2.0 }, describe: '手工种子关' }, exit_condition: { type: 'survive_turns', params: { turns: 9 } }, event_deck: [], combatSetup: { enemy: { name: '种子精英', hp: 99, atk: 20, def: 5 } } },
  }
  const r = sampleRun('seedpref', { levelCount: 5, pools: { ...pools, seedLevels: [seedLevel] } })
  const eliteNode = r.find((n) => n.archetype === 'elite')
  ok(eliteNode?.seedLevelId === 9001, 'elite 关优先消费匹配 archetype 的种子关')
  ok(eliteNode?.kaleidoMode.describe === '手工种子关', '种子关 combat_mode 直接沿用')
  const rows = buildLevelRows('run-x', r, 'seedpref')
  ok(rows.find((_, i) => r[i].archetype === 'elite').gen_meta.source === 'seed', '种子关 gen_meta.source=seed')
}

// ── buildLevelRows：正式化字段 ──
{
  const rows = buildLevelRows('run-1', run, 'seed-A')
  ok(rows.length === 5 && rows.every((r, i) => r.run_id === 'run-1' && r.seq === i + 1 && r.status === 'ready'), 'levels 行 run_id/seq/status')
  ok(rows.every((r) => r.payload.combat_mode && typeof r.payload.combat_mode.template_ref === 'string'), 'payload.combat_mode 带 template_ref')
  ok(rows.every((r) => typeof r.payload.archetype === 'string'), 'payload.archetype 落库')
  ok(rows[4].payload.exit_condition.type === (BOSS_KILL_LIVE ? 'boss_kill' : 'survive_turns'), 'boss 关 payload exit 随 BOSS_KILL_LIVE')
  ok(rows.every((r) => Array.isArray(r.payload.env_rules) && r.payload.env_rules.length === 0), 'env_rules 空=中性（逐关覆盖在 D3）')
  ok(rows.every((r) => Array.isArray(r.payload.event_deck)), 'event_deck 数组（ID 引用）')
}

// ── 向后兼容包装 ──
ok(sampleKaleidoPath(chambers, 'x', 5).length === 5, 'sampleKaleidoPath 兼容包装仍出 5 关')
ok(sampleRun('x', { levelCount: 5, pools: { chambers: [] } }).length === 0, '空 chamber 池 → []')

// ── exit_condition 三型判定（不变） ──
ok(evaluateExitCondition({ type: 'survive_turns', params: { turns: 3 } }, { turnCount: 3 }, {}) === true, 'survive_turns 达标')
ok(evaluateExitCondition({ type: 'survive_turns', params: { turns: 3 } }, { turnCount: 2 }, {}) === false, 'survive_turns 未达')
ok(evaluateExitCondition({ type: 'boss_kill' }, {}, { bossDefeated: true }) === true, 'boss_kill 读 bossDefeated')
ok(evaluateExitCondition({ type: 'boss_kill' }, {}, {}) === false, 'boss_kill 未击杀')
ok(evaluateExitCondition({ type: 'collect', params: { itemName: '样本', count: 2 } }, { inventory: ['样本', 'x', '样本'] }, {}) === true, 'collect 计数达标')
ok(evaluateExitCondition({ type: 'collect', params: {} }, { inventory: ['样本'] }, {}) === false, 'collect 缺 itemName→false')
ok(evaluateExitCondition({ type: 'wormhole' }, {}, {}) === false, '未知类型恒 false')
ok(evaluateExitCondition(null, {}, {}) === false, 'null cond→false')

console.log(`smoke-kaleido-runs: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
