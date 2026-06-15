/**
 * smoke-pipeline.mjs — combatPipeline.js 回归冒烟(原生 Node ESM·无需 DB)
 *
 * 跑法：node scripts/smoke-pipeline.mjs
 * 核心断言(守 Phase 37 中性铁律)：
 *   modifier 池为空 ⇒ runCombatPipeline 返回的 damage 逐值 === 传入 base。
 * 另对 add/mult/invincible/limit/insurance/seckill 各阶段 + 条件门做样例断言。
 */
import { runCombatPipeline, parseModifier, collectModifiers, STAGES } from '../src/lib/combatPipeline.js'

let pass = 0, fail = 0
function ok(cond, msg) { if (cond) { pass++ } else { fail++; console.error('  ✗ ' + msg) } }

// 测试用 mini 求值器(受控输入·new Function)；运行端实际注入 gameEngine.evalFormula。
const ev = (f, v) => {
  try {
    const fn = new Function(...Object.keys(v), `"use strict"; return (${f})`)
    const r = Number(fn(...Object.values(v)))
    return Number.isFinite(r) ? r : 0
  } catch { return 0 }
}

// ① 中性铁律：空 modifier 池 ⇒ damage === base(对 N 组随机 base/hp 逐值)
let neutralOk = true
for (let i = 0; i < 500; i++) {
  const base = 1 + Math.floor(Math.random() * 999)
  const defenderHp = 1 + Math.floor(Math.random() * 999)
  const { damage } = runCombatPipeline({ base, defenderHp, modifiers: [] }, ev)
  if (damage !== base) { neutralOk = false; console.error(`  ✗ neutral break: base=${base} hp=${defenderHp} → ${damage}`); break }
}
ok(neutralOk, '中性铁律：空池 500 组随机 ⇒ damage===base')

// 空 modifier + 无 evalFn 也中性
ok(runCombatPipeline({ base: 123, modifiers: [] }).damage === 123, '空池 + 无 evalFn ⇒ damage===base')

// ② 加算区
ok(runCombatPipeline({ base: 100, modifiers: [{ stage: 'add', value: 25 }] }, ev).damage === 125, 'add：100 + 25 = 125')
// ③ 乘算区
ok(runCombatPipeline({ base: 100, modifiers: [{ stage: 'mult', value: 1.5 }] }, ev).damage === 150, 'mult：100 × 1.5 = 150')
// add 再 mult(顺序：先加后乘)
ok(runCombatPipeline({ base: 100, modifiers: [{ stage: 'add', value: 20 }, { stage: 'mult', value: 2 }] }, ev).damage === 240, 'add→mult 顺序：(100+20)×2 = 240')

// ④ 首次受击免伤(invincible + 条件门 firstHit)
const firstHitImmune = { stage: 'invincible', condition: 'firstHit == 1' }
ok(runCombatPipeline({ base: 500, defenderHp: 1000, modifiers: [firstHitImmune], vars: { firstHit: 1 } }, ev).damage === 0, '首次受击免伤：firstHit=1 ⇒ damage=0')
ok(runCombatPipeline({ base: 500, defenderHp: 1000, modifiers: [firstHitImmune], vars: { firstHit: 0 } }, ev).damage === 500, '非首次：firstHit=0 ⇒ 条件不满足 ⇒ damage=500')

// ⑤ 限制/钳上限(单次伤害上限 50)
ok(runCombatPipeline({ base: 500, modifiers: [{ stage: 'limit', value: 50 }] }, ev).damage === 50, 'limit：500 钳到上限 50')

// ⑥ HP<20% 保命(insurance：致死伤害钳到 hp-1)
const insurance = { stage: 'insurance', condition: 'targetHp/targetMaxHp < 0.2' }
const r6 = runCombatPipeline({ base: 999, defenderHp: 100, modifiers: [insurance], vars: { targetHp: 100, targetMaxHp: 1000 } }, ev)
ok(r6.damage === 99 && r6.flags.insurance === true, '保命：致死且 hp/maxHp<0.2 ⇒ damage=hp-1=99')
const r6b = runCombatPipeline({ base: 999, defenderHp: 100, modifiers: [insurance], vars: { targetHp: 500, targetMaxHp: 1000 } }, ev)
ok(r6b.damage === 999 && !r6b.flags.insurance, '保命不触发：hp/maxHp=0.5≥0.2 ⇒ 条件假 ⇒ 管线不改 ⇒ damage=base=999(扣血由调用方钳，照常致死)')

// ⑦ 秒杀(seckill：置 enemyHp)
ok(runCombatPipeline({ base: 1, defenderHp: 800, modifiers: [{ stage: 'seckill' }] }, ev).damage === 800, '秒杀：damage 置为 defenderHp=800')

// ⑧ parseModifier / collectModifiers：stage 空/sidecar ⇒ 不参与；合法 ⇒ 参与
ok(parseModifier({ stage: null }) === null, 'parseModifier：stage=null ⇒ null(不参与)')
ok(parseModifier({ stage: 'sidecar' }) === null, 'parseModifier：sidecar ⇒ null(走旧旁路)')
ok(parseModifier({ stage: 'bogus' }) === null, 'parseModifier：非法 stage ⇒ null')
const pm = parseModifier({ stage: 'add', priority: 5, value: 7, effect_formula: 'value' })
ok(pm && pm.stage === 'add' && pm.value === 7 && pm.priority === 5, "parseModifier：effect_formula='value' ⇒ 取 value 列")
const cm = collectModifiers([{ stage: 'add', value: 1 }, { stage: null }], [{ stage: 'mult', value: 2 }])
ok(cm.length === 2, 'collectModifiers：跨来源收集·丢弃 stage 空项')
ok(Array.isArray(STAGES) && STAGES[0] === 'add' && STAGES[STAGES.length - 1] === 'seckill', 'STAGES 顺序：add…seckill')

console.log(`smoke-pipeline: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
