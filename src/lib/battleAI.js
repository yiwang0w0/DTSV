/**
 * battleAI.js — NPC 战斗 AI
 *
 * NPC 在自己的回合中，根据 ai_type 自动分配 AP 使用技能。
 * 三种 AI 类型：
 *   - aggressive : 全力攻击，优先高伤害技能
 *   - balanced   : 低血量时防御，否则攻击
 *   - defensive  : 优先防御，然后用剩余 AP 攻击
 */

import { getAttackSkills, COMMON_ACTIONS } from './battleSkills'
import { calcBattleDamage, applySkillEffects, createBuff, estimateDamage, r } from './battleCalc'

/**
 * 执行 NPC 回合，返回所有动作序列
 *
 * @param {object} battle    - 当前战斗状态
 * @param {object} npc       - NPC 战斗状态 { hp, maxHp, atk, def, weaponKind, strategy, buffs, ai_type }
 * @param {object} player    - 玩家战斗状态
 * @param {object} rules     - 游戏规则
 * @returns {{ actions: NpcAction[], updatedNpc, updatedPlayer, log: BattleLogEntry[] }}
 *
 * NpcAction = { skillId, skillName, damage, isCrit, healed, effectLog:string[] }
 */
function runNpcTurn(battle, npc, player, rules) {
  let ap = battle.opponentAp
  const aiType = npc.ai_type || 'aggressive'
  const hpRatio = npc.hp / npc.maxHp
  const actions = []
  const log = []

  // 工作副本（避免直接修改传入对象）
  let npcState = { ...npc, buffs: [...(npc.buffs || [])] }
  let playerState = { ...player, buffs: [...(player.buffs || [])] }

  // 获取 NPC 可用的攻击技能
  const attackSkills = getAttackSkills(npc.weaponKind || 'unarmed')
    .filter(s => s.damageMult > 0)

  // 防御动作定义
  const defendAction = COMMON_ACTIONS.find(a => a.id === 'defend')

  // ── AI 决策循环 ──
  while (ap > 0 && playerState.hp > 0) {
    const chosenSkill = pickNpcAction(aiType, ap, hpRatio, attackSkills, defendAction, npcState, playerState, rules)

    if (!chosenSkill) break  // 没有可执行的动作

    ap -= chosenSkill.apCost

    // ── 防御动作 ──
    if (chosenSkill.id === 'defend') {
      npcState.isDefending = true
      const defBuff = createBuff('defUp', chosenSkill.effectValue, 1, 'defend')
      npcState.buffs.push(defBuff)
      log.push({
        text: `${npc.name} 进入防御姿态，受到伤害减少 ${Math.round(chosenSkill.effectValue * 100)}%`,
        type: 'buff',
        turn: battle.turn,
      })
      actions.push({
        skillId: 'defend',
        skillName: chosenSkill.name,
        damage: 0,
        isCrit: false,
        healed: 0,
        effectLog: [],
      })
      continue
    }

    // ── 攻击动作 ──
    const dmgResult = calcBattleDamage(npcState, playerState, chosenSkill, rules)
    playerState.hp = Math.max(0, playerState.hp - dmgResult.damage)

    // 应用技能效果
    const effects = applySkillEffects(chosenSkill, npcState, playerState, dmgResult)

    // 吸血回复
    if (dmgResult.healed > 0) {
      npcState.hp = Math.min(npcState.maxHp, npcState.hp + dmgResult.healed)
    }

    // 合并状态变更
    if (effects.targetChanges.def !== undefined) {
      playerState.def = effects.targetChanges.def
    }
    if (effects.targetChanges.apPenalty) {
      playerState.apPenalty = (playerState.apPenalty || 0) + effects.targetChanges.apPenalty
    }
    if (effects.attackerChanges.hp !== undefined) {
      npcState.hp = effects.attackerChanges.hp
    }
    // 新增 Buff
    if (effects.newTargetBuffs.length > 0) {
      playerState.buffs.push(...effects.newTargetBuffs)
    }
    if (effects.newAttackerBuffs.length > 0) {
      npcState.buffs.push(...effects.newAttackerBuffs)
    }

    // 记录日志
    const critText = dmgResult.isCrit ? '暴击！' : ''
    log.push({
      text: `${npc.name} 使用「${chosenSkill.name}」，造成 ${dmgResult.damage} 伤害${critText ? '（' + critText + '）' : ''}`,
      type: dmgResult.isCrit ? 'crit' : 'damage',
      turn: battle.turn,
    })

    for (const line of effects.log) {
      log.push({ text: line, type: 'debuff', turn: battle.turn })
    }

    if (dmgResult.healed > 0) {
      log.push({
        text: `${npc.name} 回复了 ${dmgResult.healed} HP`,
        type: 'heal',
        turn: battle.turn,
      })
    }

    actions.push({
      skillId: chosenSkill.id,
      skillName: chosenSkill.name,
      damage: dmgResult.damage,
      isCrit: dmgResult.isCrit,
      healed: dmgResult.healed,
      effectLog: effects.log,
    })
  }

  return {
    actions,
    updatedNpc: npcState,
    updatedPlayer: playerState,
    log,
  }
}

/**
 * 根据 AI 类型选择下一个动作
 *
 * @returns {object|null} 选中的技能对象，null 表示无法行动
 */
function pickNpcAction(aiType, ap, hpRatio, attackSkills, defendAction, npc, player, rules) {
  // 过滤出 AP 足够的攻击技能
  const affordable = attackSkills.filter(s => s.apCost <= ap)

  switch (aiType) {
    case 'aggressive':
      return pickAggressive(ap, affordable)

    case 'defensive':
      return pickDefensive(ap, hpRatio, affordable, defendAction, npc)

    case 'balanced':
    default:
      return pickBalanced(ap, hpRatio, affordable, defendAction, npc)
  }
}

/**
 * 激进型：优先高伤害技能，尽可能多打
 */
function pickAggressive(ap, affordable) {
  if (affordable.length === 0) return null

  // 按伤害系数降序，优先高伤害
  const sorted = [...affordable].sort((a, b) => b.damageMult - a.damageMult)

  // 如果最强技能用不起，退而求其次
  return sorted[0]
}

/**
 * 防御型：
 * - 血量 < 40%：优先防御
 * - 血量 ≥ 40%：用中等伤害技能，保留 AP 防御
 */
function pickDefensive(ap, hpRatio, affordable, defendAction, npc) {
  // 低血量且尚未防御 → 先防御
  if (hpRatio < 0.4 && !npc.isDefending && ap >= defendAction.apCost) {
    return defendAction
  }

  if (affordable.length === 0) {
    // 没有攻击技能可用，能防御就防御
    if (ap >= defendAction.apCost && !npc.isDefending) return defendAction
    return null
  }

  // 尝试保留 2AP 用于防御
  const reserveAp = npc.isDefending ? 0 : 2
  const conservative = affordable.filter(s => s.apCost <= ap - reserveAp)

  if (conservative.length > 0) {
    // 选伤害最高的
    return conservative.sort((a, b) => b.damageMult - a.damageMult)[0]
  }

  // 保留不了就直接打最强的
  return affordable.sort((a, b) => b.damageMult - a.damageMult)[0]
}

/**
 * 均衡型：
 * - 血量 < 30%：防御
 * - 否则：优先效率（伤害/AP 比）
 */
function pickBalanced(ap, hpRatio, affordable, defendAction, npc) {
  // 低血量防御
  if (hpRatio < 0.3 && !npc.isDefending && ap >= defendAction.apCost) {
    return defendAction
  }

  if (affordable.length === 0) {
    if (ap >= defendAction.apCost && !npc.isDefending) return defendAction
    return null
  }

  // 按效率排序（damageMult / apCost）
  const byEfficiency = [...affordable].sort(
    (a, b) => (b.damageMult / b.apCost) - (a.damageMult / a.apCost)
  )

  return byEfficiency[0]
}

export { runNpcTurn, pickNpcAction }
