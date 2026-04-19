/**
 * battleCalc.js — 增强版战斗计算模块
 *
 * 职责：
 *   1. 伤害计算（含姿态/策略/临时Buff/技能特效）
 *   2. AP 管理（初始化、消耗、先手奖励）
 *   3. Buff 生命周期（添加/衰减/移除）
 *   4. 先手判定
 *   5. 逃跑判定
 *   6. 反击判定
 *   7. 伤害预估（前端提示用）
 */

import { STANCES, STRATEGIES } from './battleSkills'

// ── 默认规则值 ──
export const DEFAULT_RULES = {
  atk_base_multiplier: 1.0,
  def_base_multiplier: 0.5,
  crit_rate: 0.1,
  crit_multiplier: 1.5,
  base_ap: 6,
  first_strike_bonus_ap: 1,    // 先手方额外 AP
  first_strike_penalty_ap: 1,  // 后手方减少 AP
  flee_base_rate: 0.5,
  defend_reduction: 0.4,       // 防御减伤比例
}

/**
 * 从 rules 对象取值，带默认值
 */
export function r(rules, key) {
  const v = rules?.[key]
  if (v === undefined || v === null || v === '') return DEFAULT_RULES[key] ?? 0
  return typeof v === 'number' ? v : Number(v) || DEFAULT_RULES[key] ?? 0
}

// ══════════════════════════════════════
//  姿态 & 策略 修正
// ══════════════════════════════════════

/**
 * 获取姿态对指定属性的修正值
 * @param {string} stanceName - 姿态名 ('normal'|'combat'|...)
 * @param {'atk'|'def'|'discover'|'stealth'|'init'} stat
 * @returns {number} 乘数，如 1.25
 */
export function getStanceMod(stanceName, stat) {
  const stance = STANCES[stanceName] || STANCES.normal
  const key = stat + 'Mod'
  return stance[key] ?? 1.0
}

/**
 * 获取策略对指定属性的修正值
 * @param {string} strategyName - 策略名 ('normal'|'counter'|...)
 * @param {'atk'|'def'|'flee'} stat
 * @returns {number} 乘数
 */
export function getStrategyMod(strategyName, stat) {
  const strat = STRATEGIES[strategyName] || STRATEGIES.normal
  const key = stat + 'Mod'
  return strat[key] ?? 1.0
}

// ══════════════════════════════════════
//  Buff 管理
// ══════════════════════════════════════

/**
 * 创建临时效果对象
 * @param {string} type  - 'defUp'|'defDown'|'atkDown'|'apDown' 等
 * @param {number} value - 效果数值（百分比用小数，如 0.4 = 40%）
 * @param {number} duration - 持续回合数
 * @param {string} source   - 来源技能 id
 */
export function createBuff(type, value, duration, source) {
  return { type, value, duration, source }
}

/**
 * 回合结束时衰减 Buff 列表，移除过期的
 * @param {Array} buffs - TempBuff[]
 * @returns {{ remaining: TempBuff[], expired: TempBuff[] }}
 */
export function tickBuffs(buffs) {
  if (!buffs || buffs.length === 0) return { remaining: [], expired: [] }
  const remaining = []
  const expired = []
  for (const b of buffs) {
    const next = { ...b, duration: b.duration - 1 }
    if (next.duration > 0) {
      remaining.push(next)
    } else {
      expired.push(b)
    }
  }
  return { remaining, expired }
}

/**
 * 计算 Buff 对攻击力的综合修正
 */
export function getBuffAtkMod(buffs) {
  let mod = 1.0
  for (const b of (buffs || [])) {
    if (b.type === 'atkDown') mod *= (1 - b.value)
    if (b.type === 'atkUp') mod *= (1 + b.value)
  }
  return mod
}

/**
 * 计算 Buff 对防御力的综合修正
 */
export function getBuffDefMod(buffs) {
  let mod = 1.0
  for (const b of (buffs || [])) {
    if (b.type === 'defUp') mod *= (1 + b.value)
    if (b.type === 'defDown') mod *= (1 - b.value)
  }
  return mod
}

// ══════════════════════════════════════
//  伤害计算
// ══════════════════════════════════════

/**
 * 计算一次技能攻击的伤害
 *
 * @param {object} attacker - { atk, def, hp, maxHp, stance, strategy, buffs:TempBuff[] }
 * @param {object} target   - { atk, def, hp, maxHp, stance, strategy, buffs:TempBuff[], isDefending }
 * @param {object} skill    - 技能对象 { damageMult, effect, effectValue }
 * @param {object} rules    - 游戏规则对象
 * @returns {{ damage, isCrit, healed, defShredApplied, apStolen, log:string[] }}
 */
export function calcBattleDamage(attacker, target, skill, rules) {
  const log = []

  // ── 攻击力 = 基础ATK × 姿态修正 × 策略修正 × Buff修正 ──
  const atkBase = attacker.atk || 0
  const atkStance = getStanceMod(attacker.stance, 'atk')
  const atkStrategy = getStrategyMod(attacker.strategy, 'atk')
  const atkBuff = getBuffAtkMod(attacker.buffs)
  const finalAtk = atkBase * atkStance * atkStrategy * atkBuff

  // ── 防御力 = 基础DEF × 姿态修正 × 策略修正 × Buff修正 ──
  const defBase = target.def || 0
  const defStance = getStanceMod(target.stance, 'def')
  const defStrategy = getStrategyMod(target.strategy, 'def')
  const defBuff = getBuffDefMod(target.buffs)
  let finalDef = defBase * defStance * defStrategy * defBuff

  // ── 技能特效：穿甲 → 减少目标有效防御 ──
  if (skill.effect === 'armorPierce') {
    finalDef *= (1 - skill.effectValue)
  }

  // ── 基础伤害公式 ──
  const atkMult = r(rules, 'atk_base_multiplier')
  const defMult = r(rules, 'def_base_multiplier')
  let damage = Math.floor(skill.damageMult * finalAtk * atkMult - finalDef * defMult)
  damage = Math.max(1, damage)

  // ── 暴击判定 ──
  let critRate = r(rules, 'crit_rate')
  if (skill.effect === 'critBoost') {
    critRate *= (1 + skill.effectValue)  // effectValue=1.0 → 暴击率翻倍
  }
  const isCrit = Math.random() < critRate
  if (isCrit) {
    damage = Math.floor(damage * r(rules, 'crit_multiplier'))
  }

  // ── 防御中减伤 ──
  if (target.isDefending) {
    const reduction = r(rules, 'defend_reduction')
    damage = Math.floor(damage * (1 - reduction))
    damage = Math.max(1, damage)
  }

  // ── 结果集 ──
  let healed = 0
  let defShredApplied = false
  let apStolen = 0

  // ── 技能特效：吸血 ──
  if (skill.effect === 'lifesteal') {
    healed = Math.floor(damage * skill.effectValue)
    log.push(`吸取了 ${healed} HP`)
  }

  // ── 技能特效：破甲（永久降低DEF%）──
  if (skill.effect === 'defShred') {
    defShredApplied = true
    // 实际的 DEF 修改由调用方执行
    log.push(`永久降低防御 ${Math.round(skill.effectValue * 100)}%`)
  }

  // ── 技能特效：窃取AP ──
  if (skill.effect === 'apSteal') {
    apStolen = skill.effectValue  // 通常为 1
    log.push(`对手下回合 -${apStolen} AP`)
  }

  return { damage, isCrit, healed, defShredApplied, apStolen, log }
}

/**
 * 估算伤害（前端用，不含随机因素）
 * 用于技能按钮下方显示 "~23 伤害"
 */
export function estimateDamage(attacker, target, skill, rules) {
  const atkBase = attacker.atk || 0
  const atkStance = getStanceMod(attacker.stance, 'atk')
  const atkStrategy = getStrategyMod(attacker.strategy, 'atk')
  const atkBuff = getBuffAtkMod(attacker.buffs)
  const finalAtk = atkBase * atkStance * atkStrategy * atkBuff

  const defBase = target.def || 0
  const defStance = getStanceMod(target.stance, 'def')
  const defStrategy = getStrategyMod(target.strategy, 'def')
  const defBuff = getBuffDefMod(target.buffs)
  let finalDef = defBase * defStance * defStrategy * defBuff

  if (skill.effect === 'armorPierce') {
    finalDef *= (1 - skill.effectValue)
  }

  const atkMult = r(rules, 'atk_base_multiplier')
  const defMult = r(rules, 'def_base_multiplier')
  const base = Math.max(1, Math.floor(skill.damageMult * finalAtk * atkMult - finalDef * defMult))

  // 防御中时预估也考虑减伤
  const defended = target.isDefending
    ? Math.max(1, Math.floor(base * (1 - r(rules, 'defend_reduction'))))
    : base

  return defended
}

// ══════════════════════════════════════
//  AP 管理
// ══════════════════════════════════════

/**
 * 初始化战斗双方的 AP
 * @param {boolean} isFirstStrike - 是否先手方
 * @param {number} turn           - 当前回合数
 * @param {number} apPenalty      - 被压制的 AP 惩罚（apSteal 效果）
 * @returns {number} 本回合可用 AP
 */
export function getInitAp(rules, isFirstStrike, turn, apPenalty = 0) {
  const base = r(rules, 'base_ap')
  let ap = base

  // 第一回合：先手+1，后手-1
  if (turn === 1) {
    if (isFirstStrike) {
      ap += r(rules, 'first_strike_bonus_ap')
    } else {
      ap -= r(rules, 'first_strike_penalty_ap')
    }
  }

  // 压制效果
  ap -= apPenalty

  return Math.max(1, ap)  // 至少保证 1 AP
}

// ══════════════════════════════════════
//  先手判定
// ══════════════════════════════════════

/**
 * 判定先手方
 * @param {object} playerA - { stance }
 * @param {object} playerB - { stance } (NPC/对手)
 * @returns {'player'|'opponent'}
 */
export function determineFirstStrike(playerA, playerB) {
  // 先制率 = 姿态的 initMod
  const initA = getStanceMod(playerA.stance || 'normal', 'init')
  const initB = getStanceMod(playerB.stance || 'normal', 'init')

  // 按概率加权随机
  const total = initA + initB
  const roll = Math.random() * total
  return roll < initA ? 'player' : 'opponent'
}

// ══════════════════════════════════════
//  逃跑判定
// ══════════════════════════════════════

/**
 * 判定逃跑是否成功
 * @param {object} runner - 逃跑者 { strategy }
 * @param {object} rules
 * @returns {boolean}
 */
export function rollFlee(runner, rules) {
  const baseRate = r(rules, 'flee_base_rate')
  const strategyMod = getStrategyMod(runner.strategy || 'normal', 'flee')
  const finalRate = Math.min(0.95, baseRate * strategyMod)
  return Math.random() < finalRate
}

// ══════════════════════════════════════
//  反击判定
// ══════════════════════════════════════

/**
 * 判定是否触发反击
 * @param {object} defender - 被攻击者 { strategy }
 * @returns {boolean}
 */
export function rollCounter(defender) {
  const strat = STRATEGIES[defender.strategy] || STRATEGIES.normal
  return Math.random() < (strat.counterRate || 0)
}

// ══════════════════════════════════════
//  技能效果应用
// ══════════════════════════════════════

/**
 * 将技能的附加效果应用到战场
 * 返回需要修改的 battle 状态变更描述
 *
 * @param {object} skill      - 技能定义
 * @param {object} attacker   - 攻击者状态
 * @param {object} target     - 目标状态
 * @param {object} dmgResult  - calcBattleDamage 的返回值
 * @returns {{ attackerChanges, targetChanges, newTargetBuffs:TempBuff[], log:string[] }}
 */
export function applySkillEffects(skill, attacker, target, dmgResult) {
  const attackerChanges = {}
  const targetChanges = {}
  const newTargetBuffs = []
  const newAttackerBuffs = []
  const log = []

  if (!skill.effect) return { attackerChanges, targetChanges, newTargetBuffs, newAttackerBuffs, log }

  switch (skill.effect) {
    case 'lifesteal': {
      const healed = dmgResult.healed
      const newHp = Math.min(attacker.maxHp, (attacker.hp || 0) + healed)
      attackerChanges.hp = newHp
      break
    }

    case 'atkDebuff': {
      // 降低目标 ATK
      const duration = skill.effectDuration || 1
      newTargetBuffs.push(createBuff('atkDown', skill.effectValue, duration, skill.id))
      log.push(`${target.name || '目标'} ATK 降低 ${Math.round(skill.effectValue * 100)}%，持续 ${duration} 回合`)
      break
    }

    case 'defBuff': {
      // 提升自身 DEF
      const duration = skill.effectDuration || 2
      newAttackerBuffs.push(createBuff('defUp', skill.effectValue, duration, skill.id))
      log.push(`防御提升 ${Math.round(skill.effectValue * 100)}%，持续 ${duration} 回合`)
      break
    }

    case 'defShred': {
      // 永久降低目标 DEF（直接修改基础值）
      const newDef = Math.max(0, Math.floor(target.def * (1 - skill.effectValue)))
      targetChanges.def = newDef
      log.push(`${target.name || '目标'} DEF 永久降低至 ${newDef}`)
      break
    }

    case 'apSteal': {
      // 标记目标下回合 AP 减少（由 AP 管理模块处理）
      targetChanges.apPenalty = (targetChanges.apPenalty || 0) + skill.effectValue
      log.push(`${target.name || '目标'} 下回合 AP -${skill.effectValue}`)
      break
    }

    case 'armorPierce':
    case 'critBoost':
      // 这些效果已在 calcBattleDamage 中处理
      break

    default:
      break
  }

  return { attackerChanges, targetChanges, newTargetBuffs, newAttackerBuffs, log }
}

// ══════════════════════════════════════
//  战斗初始化
// ══════════════════════════════════════

/**
 * 根据玩家信息构建战斗用的角色状态
 * @param {object} player - 数据库中的玩家对象
 * @param {string} weaponKind - 武器类型
 * @returns {object} 战斗用角色状态
 */
export function buildFighterState(player, weaponKind) {
  return {
    id: player.id || player.uid,
    name: player.name || '???',
    hp: player.hp ?? 100,
    maxHp: player.maxHp ?? 100,
    atk: player.atk ?? 10,
    def: player.def ?? 5,
    stance: player.stance || 'normal',
    strategy: player.strategy || 'normal',
    weaponKind: weaponKind || 'unarmed',
    buffs: [],
    isDefending: false,
    apPenalty: 0,  // 被压制的AP惩罚（下回合生效）
  }
}

// ES module — 所有导出均已在各声明处标注 export
