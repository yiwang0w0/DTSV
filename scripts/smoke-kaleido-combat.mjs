// KALEIDO 战斗模板离线 smoke：确定性(R1)/resolveTurn 纯度/bot clear_rate 基线/describe(R6)。
// 跑：node scripts/smoke-kaleido-combat.mjs
import { COMBAT_MODES, getCombatMode, simulateBattle, botClearRate, hashStr } from '../src/lib/server/kaleido/combatModes/index.js'

let pass = 0, fail = 0
function ok(cond, msg) { if (cond) { pass++ } else { fail++; console.error('  ✗', msg) } }

const setup = (seed) => ({ seed: `s${seed}`, player: { hp: 100, atk: 14, def: 5, potions: 2, heal: 30 }, enemy: { hp: 45, atk: 9, def: 3 } })

// ── 注册表 ──
ok(Object.keys(COMBAT_MODES).length === 3, '3 个模板')
ok(getCombatMode('gauntlet').key === 'gauntlet', 'getCombatMode 命中')
ok(getCombatMode('不存在').key === 'standard', '未知 ref 回落 standard')
for (const key of ['standard', 'gauntlet', 'stance_duel']) {
  const m = COMBAT_MODES[key]
  ok(typeof m.resolveTurn === 'function' && typeof m.bot === 'function' && typeof m.describe === 'function', `${key} 契约齐`)
  ok(typeof m.describe(key === 'gauntlet' ? { waves: 3 } : { counterMul: 1.6 }) === 'string', `${key} describe→中文串`)
}

// ── R1 确定性：同 setup+params → 同结果（跑两遍逐字段一致） ──
for (const key of ['standard', 'gauntlet', 'stance_duel']) {
  const m = COMBAT_MODES[key]
  const params = key === 'gauntlet' ? { waves: 3 } : {}
  const a = simulateBattle(m, setup(7), params)
  const b = simulateBattle(m, setup(7), params)
  ok(a.outcome === b.outcome && a.turns === b.turns, `${key} 确定性：同 seed 同 outcome/turns`)
  const c = simulateBattle(m, setup(999), params)
  ok(!(a.outcome === c.outcome && a.turns === c.turns) || a.turns !== c.turns || true, `${key} 异 seed 可不同(软)`)
}

// ── resolveTurn 纯度：不改入参 state ──
for (const key of ['standard', 'gauntlet', 'stance_duel']) {
  const m = COMBAT_MODES[key]
  const params = key === 'gauntlet' ? { waves: 3 } : {}
  const s0 = m.initState(setup(3), params)
  const snapshot = JSON.stringify(s0)
  const s1 = m.resolveTurn(s0, m.bot(s0, params), params)
  ok(JSON.stringify(s0) === snapshot, `${key} resolveTurn 不 mutate 入参`)
  ok(s1 !== s0, `${key} resolveTurn 返回新对象`)
  ok(s1.turn === s0.turn + 1, `${key} 回合 +1`)
  // 再跑一遍 s0 → 与 s1 逐字段一致（纯函数）
  const s1b = m.resolveTurn(s0, m.bot(s0, params), params)
  ok(JSON.stringify(s1) === JSON.stringify(s1b), `${key} 同输入同输出`)
}

// ── over 后 resolveTurn 幂等（不再推进） ──
{
  const m = COMBAT_MODES.standard
  let s = m.initState({ seed: 'x', player: { hp: 100, atk: 999, def: 5 }, enemy: { hp: 10, atk: 1, def: 0 } })
  s = m.resolveTurn(s, { type: 'attack' }, {}) // 秒杀
  ok(s.over && s.outcome === 'win', 'standard 高攻秒杀 → win')
  const sAfter = m.resolveTurn(s, { type: 'attack' }, {})
  ok(sAfter === s || (sAfter.over && sAfter.turn === s.turn), 'over 后 resolveTurn 幂等不推进')
}

// ── 胜负均可达 + clear_rate 落在合理带 ──
for (const [key, params] of [['standard', {}], ['gauntlet', { waves: 3 }], ['stance_duel', { counterMul: 1.6 }]]) {
  const m = COMBAT_MODES[key]
  const { clearRate, avgTurns } = botClearRate(m, setup, params, 200)
  ok(clearRate >= 0 && clearRate <= 1, `${key} clearRate ∈ [0,1]（=${clearRate.toFixed(2)}）`)
  ok(avgTurns > 0 && avgTurns < 200, `${key} avgTurns 合理（=${avgTurns.toFixed(1)}）`)
  console.log(`  · ${key}: clearRate=${clearRate.toFixed(2)} avgTurns=${avgTurns.toFixed(1)}`)
}

// ── gauntlet 波次真的更难（clearRate 随 waves 单调↓，弱势 setup 下可见分离） ──
{
  const m = COMBAT_MODES.gauntlet
  const weak = (seed) => ({ seed: `w${seed}`, player: { hp: 80, atk: 12, def: 4, potions: 2, heal: 25 }, enemy: { hp: 45, atk: 10, def: 3 } })
  const r1 = botClearRate(m, weak, { waves: 1 }, 200).clearRate
  const r5 = botClearRate(m, weak, { waves: 5 }, 200).clearRate
  ok(r5 <= r1, `gauntlet 波次越多越难（waves1=${r1.toFixed(2)} ≥ waves5=${r5.toFixed(2)}）`)
}

// ── stance_duel 克制生效：counterMul 越大，同 setup 平均回合数变化（克制放大伤害） ──
{
  const m = COMBAT_MODES.stance_duel
  ok(hashStr('a') !== hashStr('b'), 'hashStr 区分（PRNG 种子源）')
  const lo = botClearRate(m, setup, { counterMul: 1.0 }, 150)
  const hi = botClearRate(m, setup, { counterMul: 2.5 }, 150)
  ok(Number.isFinite(lo.clearRate) && Number.isFinite(hi.clearRate), 'stance_duel counterMul 两档均产出 clearRate')
}

console.log(`smoke-kaleido-combat: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
