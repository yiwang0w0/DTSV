// KALEIDO run 纯逻辑离线 smoke：采样确定性 / raidPath 节点契约 / levels 行 / exit_condition 三型判定。
// 跑：node scripts/smoke-kaleido-runs.mjs
import { sampleKaleidoPath, buildLevelRows, evaluateExitCondition, hashStr, mulberry32 } from '../src/lib/server/kaleido/runs.js'

let pass = 0, fail = 0
function ok(cond, msg) { if (cond) { pass++ } else { fail++; console.error('  ✗', msg) } }

// ── 素材:仿 chamber_templates 行 ──
const chambers = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1, template_key: `t${i + 1}`, name: `舱段${i + 1}`, type: 'scan_dense',
  description: 'desc', region_label: '外环', pollution_base: 2, pollution_accel: 1,
  is_exit: i === 11, exit_cost: null, omega_window: 0, max_items: 4, max_npcs: 2,
  spawn_weight: (i % 3) + 1, exit_count: 2, enabled: i !== 5, // id=6 disabled
}))

// ── PRNG 基线 ──
ok(hashStr('abc') === hashStr('abc') && hashStr('abc') !== hashStr('abd'), 'hashStr 稳定且区分输入')
const r1 = mulberry32(42), r2 = mulberry32(42)
ok(r1() === r2() && r1() === r2(), 'mulberry32 同种子同序列')

// ── 采样:确定性 + 形状 ──
const a = sampleKaleidoPath(chambers, 'seed-A', 5)
const b = sampleKaleidoPath(chambers, 'seed-A', 5)
const c = sampleKaleidoPath(chambers, 'seed-B', 5)
ok(a.length === 5, '抽满 5 节点')
ok(JSON.stringify(a.map(n => n.templateId)) === JSON.stringify(b.map(n => n.templateId)), '同 seed 同节点序(确定性)')
ok(JSON.stringify(a.map(n => n.templateId)) !== JSON.stringify(c.map(n => n.templateId)), '异 seed 大概率不同序')
ok(new Set(a.map(n => n.templateId)).size === 5, '无放回(候选充足时不重复)')
ok(a.every(n => n.templateId !== 6), 'disabled 模板不入选')
ok(a.every((n, i) => n.idx === i), 'idx 0-based 连续')

// raidPath 节点契约字段(下游 getChamberForPlayer/搜索/战斗/污染读的 key,缺一不可)
const REQUIRED_KEYS = ['idx','templateId','templateKey','name','type','description','loreInjections','regionLabel','pollutionBase','pollutionAccel','isExit','exitCost','omegaWindow','maxItems','maxNpcs','exitCount','kaleidoExit','levelId']
ok(REQUIRED_KEYS.every(k => k in a[0]), `节点契约字段齐(${REQUIRED_KEYS.length}键)`)
ok(a.every(n => n.kaleidoExit?.type === 'survive_turns' && Number.isFinite(n.kaleidoExit.params.turns)), 'P0 exit_condition=survive_turns 且带 turns')
ok(a[0].kaleidoExit.params.turns === 3 && a[4].kaleidoExit.params.turns === 7, 'turns 随 seq 递增(2+seq)')

// 边界:空候选 / 候选不足放回
ok(sampleKaleidoPath([], 's', 5).length === 0, '空候选→[]')
const few = sampleKaleidoPath(chambers.slice(0, 2), 's', 5)
ok(few.length === 5, '候选不足时放回抽满')

// ── levels 行 ──
const rows = buildLevelRows('run-1', a, 'seed-A')
ok(rows.length === 5 && rows.every((r, i) => r.run_id === 'run-1' && r.seq === i + 1 && r.status === 'ready'), 'levels 行 run_id/seq/status')
ok(rows.every(r => r.gen_meta.source === 'sampled'), 'gen_meta.source=sampled')
ok(rows.every(r => r.payload.combat_mode.template_ref === 'standard'), 'combat_mode=standard')
ok(rows.every(r => Array.isArray(r.payload.env_rules) && r.payload.env_rules.length === 0
  && Array.isArray(r.payload.formula_overrides) && r.payload.formula_overrides.length === 0), 'env_rules/formula_overrides 空=中性')
ok(rows.every((r, i) => r.payload.exit_condition.type === a[i].kaleidoExit.type), 'payload.exit_condition 与节点快照一致')
ok(rows.every((r, i) => r.payload.chamber_ref.template_id === a[i].templateId), 'chamber_ref 只 ID 引用')

// ── exit_condition 三型判定 ──
ok(evaluateExitCondition({ type: 'survive_turns', params: { turns: 3 } }, { turnCount: 3 }, {}) === true, 'survive_turns 达标')
ok(evaluateExitCondition({ type: 'survive_turns', params: { turns: 3 } }, { turnCount: 2 }, {}) === false, 'survive_turns 未达')
ok(evaluateExitCondition({ type: 'survive_turns', params: { turns: 3 } }, {}, {}) === false, 'turnCount 缺省 ?? 0 兜底')
ok(evaluateExitCondition({ type: 'boss_kill' }, {}, { bossDefeated: true }) === true, 'boss_kill 读 bossDefeated')
ok(evaluateExitCondition({ type: 'boss_kill' }, {}, {}) === false, 'boss_kill 未击杀')
ok(evaluateExitCondition({ type: 'collect', params: { itemName: '样本', count: 2 } }, { inventory: ['样本', 'x', '样本'] }, {}) === true, 'collect 计数达标')
ok(evaluateExitCondition({ type: 'collect', params: { itemName: '样本', count: 2 } }, { inventory: ['样本'] }, {}) === false, 'collect 未达')
ok(evaluateExitCondition({ type: 'collect', params: {} }, { inventory: ['样本'] }, {}) === false, 'collect 缺 itemName→false')
ok(evaluateExitCondition({ type: 'wormhole' }, {}, {}) === false, '未知类型恒 false(保守)')
ok(evaluateExitCondition(null, {}, {}) === false, 'null cond→false')

console.log(`smoke-kaleido-runs: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
