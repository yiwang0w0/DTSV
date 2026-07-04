/**
 * combatPipeline.js — 战斗伤害「有序阶段管线」(纯函数 · 零 import · 可被原生 Node 直接导入)
 *
 * 背景(dts→DTSV 反思 · docs/plan/02-combat-hook-pipeline.md)：
 *   今天 calcDamage(gameEngine.js) 出一个标量 → 直接扣血，中间没有可拦截阶段，于是
 *   「首次受击免伤 / HP<20% 保命 / 反击 / 秒杀」这类技能无处表达(只有 8-perk 白名单乘子)。
 *   本管线把「base 伤害 → 扣血」之间插入 dts 同款的有序优先级阶段，让被动/技能/职业/buff
 *   以声明式 modifier 在某一阶段变换【在途主伤害】，内容因此能加法扩展战斗、零侵入核心。
 *
 * 设计约束(与 combatStats.js 同)：本文件【零 import】、纯函数、无 DB、无副作用，可被
 *   scripts/smoke-pipeline.mjs 用原生 Node ESM 直接导入做回归。求值器 evalFn 由调用方注入
 *   (运行端传 gameEngine.evalFormula；测试传 mini 版)，故本文件不依赖 evalFormula/supabase。
 *
 * ★ 中性铁律(守 Phase 37)：modifiers 为空 ⇒ 各阶段恒等 ⇒ runCombatPipeline 返回的 damage
 *   === 传入的 base(逐值)。接线方(后续 P2/P3)做 base=calcDamage(...) → runCombatPipeline，
 *   空 modifier 池时与今天「calcDamage 直接扣血」逐值等价。smoke-pipeline.mjs 对此自动断言。
 *
 * 阶段顺序(优先级·呼应 dts attack_wrapper.php 的「无敌>特殊>限制>保命>秒杀」)：
 *   add(加算区·求和) → mult(乘算区·连乘) → invincible(任一命中⇒伤害归0) → special(预留变换)
 *   → limit(钳上限/免伤) → insurance(致死伤害钳到 hp-1·保命) → seckill(置 enemyHp·秒杀)
 *
 * modifier 形态(纯数据)：{ stage, priority?, value?, formula?, condition? }
 *   · stage      ∈ STAGES(非法/缺省不参与；'sidecar' 留给旧 triggerPassives 旁路·本管线忽略)
 *   · priority?  阶段内升序(小先)，默认 100
 *   · value?     数值常量(优先于 formula)
 *   · formula?   该阶段对 damage 的变换式(交 evalFn 求值；vars 注入 { ...ctx.vars, damage })
 *   · condition? 生效条件式(evalFn 求值非 0 才生效；缺省恒生效)
 */

export const STAGES = ['add', 'mult', 'invincible', 'special', 'limit', 'insurance', 'seckill']

/**
 * Phase 43 P4.5 — 方向性二分（gameActions.applyCombatPipeline 按此从攻/守方分别收集 modifier）：
 *   进攻型（伤害增强/终结）仅当 modifier 所有者【发起攻击】时生效；
 *   防御型（免伤/变换/限伤/保命）仅当其【受击】时生效。
 *   ⇒ 守方的「加伤」不会抬高自己受到的伤害、攻方的「保命」不会护住敌人。
 *   special 归守方：与 dts 阶段链立场一致（无敌>特殊>限制>保命 都在受击侧结算）；
 *   攻方要非线性变换自身伤害可用 add+公式（damage 变量在 vars 中可见）。
 *   两集合恰好二分 STAGES（无重叠·全覆盖·smoke 断言）。
 */
export const OFFENSIVE_STAGES = ['add', 'mult', 'seckill']
export const DEFENSIVE_STAGES = ['invincible', 'special', 'limit', 'insurance']

function num(x, d = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : d
}

/**
 * parseModifier(row) — 把一行 passive_skills(含 stage/priority/condition_formula/effect_formula/value)
 *   归一成 pipeline modifier。stage 为空 / 'sidecar' ⇒ 返回 null(不参与管线·走旧旁路)。
 *   effect_formula 缺省值是字符串 'value'(库默认)——此时取 value 列；否则当公式交 evalFn。
 */
export function parseModifier(row) {
  if (!row || !row.stage || row.stage === 'sidecar' || !STAGES.includes(row.stage)) return null
  const ef = typeof row.effect_formula === 'string' ? row.effect_formula.trim() : ''
  const useValue = ef === '' || ef === 'value'
  return {
    stage: row.stage,
    priority: num(row.priority, 100),
    condition: row.condition_formula || null,
    value: useValue ? num(row.value, row.stage === 'mult' ? 1 : 0) : null,
    formula: useValue ? null : ef,
  }
}

/**
 * collectModifiers(sources) — 把多来源(attacker._pass / defender._pass / 职业 perk 行 / buff 行…)
 *   的 passive 行收集 + parse 成 modifier 列表。非数组 / 解析失败项被丢弃。
 *   (运行端各来源的精确接线在 P3 完成；此处提供通用收集。)
 */
export function collectModifiers(...sources) {
  const out = []
  for (const src of sources) {
    if (!Array.isArray(src)) continue
    for (const row of src) {
      const m = parseModifier(row)
      if (m) out.push(m)
    }
  }
  return out
}

/**
 * runCombatPipeline(ctx, evalFn) — 跑有序阶段，返回 { damage, flags }。
 * @param {object} ctx { base, defenderHp?, modifiers?, vars? }
 *   · base        基础伤害(通常来自 calcDamage)
 *   · defenderHp  防御方当前 hp(保命/秒杀阶段用；缺省 0 ⇒ 这两阶段不触发)
 *   · modifiers   modifier 数组(空 ⇒ 各阶段恒等 ⇒ damage===round(base))
 *   · vars        公式可见变量(damage 会被逐阶段注入)
 * @param {(formula:string, vars:object)=>number} [evalFn] 注入式求值器(缺省恒返回 0)
 * @returns {{damage:number, flags:object}}
 */
export function runCombatPipeline(ctx, evalFn) {
  const base = num(ctx?.base, 0)
  const defHp = num(ctx?.defenderHp ?? ctx?.defender?.hp, 0)
  const mods = Array.isArray(ctx?.modifiers) ? ctx.modifiers : []
  const baseVars = ctx?.vars && typeof ctx.vars === 'object' ? ctx.vars : {}
  const ev = typeof evalFn === 'function' ? evalFn : () => 0
  const flags = {}

  // 条件门：无 condition ⇒ 恒生效；有 ⇒ evalFn(condition) !== 0
  const active = mods.filter((m) => {
    if (!m || !m.condition) return true
    return ev(m.condition, { ...baseVars, damage: base }) !== 0
  })
  const byStage = (s) =>
    active.filter((m) => m && m.stage === s).sort((a, b) => num(a.priority, 100) - num(b.priority, 100))
  const amount = (m, cur) => (m.value != null ? num(m.value) : num(ev(m.formula, { ...baseVars, damage: cur })))

  let dmg = base

  // ① 加算区
  for (const m of byStage('add')) dmg += amount(m, dmg)
  // ② 乘算区(连乘)
  for (const m of byStage('mult')) dmg *= (m.value != null ? num(m.value, 1) : num(ev(m.formula, { ...baseVars, damage: dmg }), 1))
  dmg = Math.round(dmg)
  // ③ 无敌(最优先·任一命中即归 0)
  if (byStage('invincible').length > 0) { dmg = 0; flags.invincible = true }
  // ④ 特殊(预留·公式可直接改 damage；无公式 ⇒ 跳过恒等——否则 ev(null)→0 会把伤害清零)
  for (const m of byStage('special')) {
    if (!m.formula) continue
    dmg = Math.round(num(ev(m.formula, { ...baseVars, damage: dmg }), dmg))
  }
  // ⑤ 限制/钳上限(免伤=cap 0)
  for (const m of byStage('limit')) {
    const cap = amount(m, dmg)
    if (cap >= 0 && dmg > cap) { dmg = cap; flags.limited = true }
  }
  // ⑥ 保命(致死伤害钳到 hp-1)
  if (defHp > 0 && dmg >= defHp && byStage('insurance').length > 0) { dmg = defHp - 1; flags.insurance = true }
  // ⑦ 秒杀(置 enemyHp)
  if (defHp > 0 && byStage('seckill').length > 0) { dmg = defHp; flags.seckill = true }

  return { damage: Math.max(0, Math.round(dmg)), flags }
}
