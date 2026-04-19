/**
 * battleActions.js — 增强版战斗动作处理
 *
 * 处理玩家在战斗中的所有操作：
 *   skill    — 使用武器技能（消耗 AP）
 *   defend   — 防御（消耗 2AP，本回合减伤 40%）
 *   useItem  — 使用道具（消耗 2AP）
 *   endTurn  — 结束回合（转入 NPC 回合）
 *   flee     — 逃跑（消耗全部 AP）
 *
 * 所有函数为纯计算，返回 { updatedPlayer, logs }，
 * 由 gameActions.js 负责持久化。
 */

import { calcItemEffect, getRule } from '@/lib/gameEngine'
import { getSkillsForWeapon, getAttackSkills, inferWeaponKind, COMMON_ACTIONS } from '@/lib/battleSkills'
import {
  calcBattleDamage, applySkillEffects,
  getInitAp, determineFirstStrike, rollFlee, rollCounter,
  tickBuffs,
} from '@/lib/battleCalc'
import { runNpcTurn } from '@/lib/battleAI'

// ══════════════════════════════════════
//  主入口：执行战斗动作
// ══════════════════════════════════════

/**
 * 执行一个战斗动作（纯计算，无 IO）
 *
 * @param {object} player   - 玩家对象（含 battle 字段）
 * @param {object} rules    - 游戏规则
 * @param {object} payload  - { action, skillId?, itemName? }
 * @param {object} gamevars - 游戏状态（用于道具定义等）
 * @returns {{ updatedPlayer: object, logs: string[], battleEnded: boolean, victory: boolean|null }}
 */
export function executeBattleAction(player, rules, payload, gamevars = {}) {
  if (!player?.alive) throw new Error('阵亡玩家无法操作')

  const battle = player.battle
  if (!battle) throw new Error('当前不在战斗中')
  if (battle.whoseTurn !== 'player') throw new Error('当前不是你的回合')

  const { action } = payload

  switch (action) {
    case 'skill':
      return handleSkillAction(player, battle, rules, payload)
    case 'defend':
      return handleDefendAction(player, battle, rules)
    case 'useItem':
      return handleUseItemAction(player, battle, rules, payload, gamevars)
    case 'endTurn':
      return handleEndTurnAction(player, battle, rules)
    case 'flee':
      return handleFleeAction(player, battle, rules)
    default:
      throw new Error(`未知的战斗动作: ${action}`)
  }
}

// ══════════════════════════════════════
//  使用技能
// ══════════════════════════════════════

function handleSkillAction(player, battle, rules, payload) {
  const { skillId } = payload
  if (!skillId) throw new Error('缺少技能 ID')

  const allSkills = battle.playerSkills || getSkillsForWeapon(battle.playerWeaponKind || 'unarmed')
  const skill = allSkills.find(s => s.id === skillId)
  if (!skill) throw new Error(`无效的技能: ${skillId}`)
  if (skill.damageMult === 0 && !skill.effect) throw new Error('这不是一个有效的技能')

  if (battle.playerAp < skill.apCost) throw new Error(`AP 不足（需要 ${skill.apCost}，剩余 ${battle.playerAp}）`)

  const log = [...battle.log]
  const textLogs = []
  let opponent = { ...battle.opponent, buffs: [...(battle.opponent.buffs || [])] }
  let playerBuffs = [...(battle.playerBuffs || [])]
  let playerHp = player.hp
  let playerAp = battle.playerAp - skill.apCost

  // 攻击者/目标状态
  const attackerState = {
    atk: player.atk, def: player.def, hp: playerHp, maxHp: player.maxHp,
    stance: player.stance || 'normal', strategy: player.strategy || 'normal',
    buffs: playerBuffs, name: player.name,
  }
  const targetState = {
    atk: opponent.atk, def: opponent.def, hp: opponent.hp, maxHp: opponent.maxHp,
    stance: opponent.stance || 'normal', strategy: opponent.strategy || 'normal',
    buffs: opponent.buffs, isDefending: opponent.isDefending || false, name: opponent.name,
  }

  // 计算伤害
  const dmgResult = calcBattleDamage(attackerState, targetState, skill, rules)
  opponent.hp = Math.max(0, opponent.hp - dmgResult.damage)

  // 应用技能效果
  const effects = applySkillEffects(skill, attackerState, targetState, dmgResult)

  if (dmgResult.healed > 0) {
    playerHp = Math.min(player.maxHp, playerHp + dmgResult.healed)
  }
  if (effects.attackerChanges.hp !== undefined) playerHp = effects.attackerChanges.hp
  if (effects.targetChanges.def !== undefined) opponent.def = effects.targetChanges.def
  if (effects.targetChanges.apPenalty) opponent.apPenalty = (opponent.apPenalty || 0) + effects.targetChanges.apPenalty
  if (effects.newTargetBuffs.length > 0) opponent.buffs.push(...effects.newTargetBuffs)
  if (effects.newAttackerBuffs.length > 0) playerBuffs.push(...effects.newAttackerBuffs)

  // 日志
  const critText = dmgResult.isCrit ? '（暴击！）' : ''
  const skillLog = `${player.name} 使用「${skill.name}」，造成 ${dmgResult.damage} 伤害${critText}`
  log.push({ text: skillLog, type: dmgResult.isCrit ? 'crit' : 'damage', turn: battle.turn })
  textLogs.push(skillLog)

  for (const line of effects.log) {
    log.push({ text: line, type: 'skill', turn: battle.turn })
    textLogs.push(line)
  }
  if (dmgResult.healed > 0) {
    const healLog = `${player.name} 回复了 ${dmgResult.healed} HP`
    log.push({ text: healLog, type: 'heal', turn: battle.turn })
    textLogs.push(healLog)
  }

  // 反击判定
  if (opponent.hp > 0 && dmgResult.damage > 0) {
    if (rollCounter(targetState)) {
      const npcSkills = getAttackSkills(opponent.weaponKind || 'unarmed')
      const cheapest = npcSkills.filter(s => s.damageMult > 0).sort((a, b) => a.apCost - b.apCost)[0]
      if (cheapest) {
        const counterDmg = calcBattleDamage(
          targetState,
          { ...attackerState, hp: playerHp, isDefending: battle.isDefending },
          cheapest, rules,
        )
        playerHp = Math.max(0, playerHp - counterDmg.damage)
        const counterLog = `${opponent.name} 发动反击「${cheapest.name}」，造成 ${counterDmg.damage} 伤害${counterDmg.isCrit ? '（暴击！）' : ''}`
        log.push({ text: counterLog, type: counterDmg.isCrit ? 'crit' : 'damage', turn: battle.turn })
        textLogs.push(counterLog)
      }
    }
  }

  // 胜负检查
  if (opponent.hp <= 0) {
    return buildVictoryResult(player, battle, opponent, log, textLogs, playerHp)
  }
  if (playerHp <= 0) {
    return buildDefeatResult(player, battle, log, textLogs)
  }

  // 更新战斗
  const updatedBattle = { ...battle, opponent, playerAp, playerBuffs, log }
  return {
    updatedPlayer: { ...player, hp: playerHp, battle: updatedBattle },
    logs: textLogs,
    battleEnded: false,
    victory: null,
  }
}

// ══════════════════════════════════════
//  防御
// ══════════════════════════════════════

function handleDefendAction(player, battle, rules) {
  const defendSkill = COMMON_ACTIONS.find(a => a.id === 'defend')
  if (battle.playerAp < defendSkill.apCost) throw new Error('AP 不足')

  const log = [...battle.log]
  const defendLog = `${player.name} 进入防御姿态，受到伤害减少 ${Math.round(defendSkill.effectValue * 100)}%`
  log.push({ text: defendLog, type: 'buff', turn: battle.turn })

  const updatedBattle = {
    ...battle,
    playerAp: battle.playerAp - defendSkill.apCost,
    isDefending: true,
    log,
  }

  return {
    updatedPlayer: { ...player, battle: updatedBattle },
    logs: [defendLog],
    battleEnded: false,
    victory: null,
  }
}

// ══════════════════════════════════════
//  使用道具
// ══════════════════════════════════════

function handleUseItemAction(player, battle, rules, payload, gamevars) {
  const { itemName } = payload
  if (!itemName) throw new Error('缺少道具名称')

  const useItemAction = COMMON_ACTIONS.find(a => a.id === 'useItem')
  if (battle.playerAp < useItemAction.apCost) throw new Error('AP 不足')

  const inventory = [...(player.inventory || [])]
  const itemIdx = inventory.indexOf(itemName)
  if (itemIdx === -1) throw new Error(`背包中没有 ${itemName}`)

  const itemDefs = gamevars.itemDefs || {}
  const item = itemDefs[itemName] || { name: itemName, kind: 'consumable', heal: 20 }
  const effect = calcItemEffect(item, player, rules)

  const log = [...battle.log]
  const textLogs = []
  inventory.splice(itemIdx, 1)

  let playerHp = player.hp
  if (effect.hpDelta > 0) {
    playerHp = Math.min(player.maxHp, playerHp + effect.hpDelta)
    const healLog = `${player.name} 使用了 ${itemName}，恢复 ${effect.hpDelta} HP`
    log.push({ text: healLog, type: 'heal', turn: battle.turn })
    textLogs.push(healLog)
  } else if (effect.hpDelta < 0) {
    playerHp = Math.max(0, playerHp + effect.hpDelta)
    const dmgLog = `${player.name} 使用了 ${itemName}，损失 ${-effect.hpDelta} HP`
    log.push({ text: dmgLog, type: 'damage', turn: battle.turn })
    textLogs.push(dmgLog)
  } else {
    const useLog = `${player.name} 使用了 ${itemName}`
    log.push({ text: useLog, type: 'system', turn: battle.turn })
    textLogs.push(useLog)
  }

  const updatedBattle = { ...battle, playerAp: battle.playerAp - useItemAction.apCost, log }

  return {
    updatedPlayer: { ...player, hp: playerHp, inventory, battle: updatedBattle },
    logs: textLogs,
    battleEnded: false,
    victory: null,
  }
}

// ══════════════════════════════════════
//  结束回合 → NPC 回合
// ══════════════════════════════════════

function handleEndTurnAction(player, battle, rules) {
  const log = [...battle.log]
  const textLogs = []

  // 衰减玩家 Buff
  const { remaining: playerBuffsAfterTick } = tickBuffs(battle.playerBuffs || [])

  // NPC 回合 AP
  const npcAp = getInitAp(
    rules,
    battle.firstStrike === 'opponent',
    battle.turn,
    battle.opponent.apPenalty || 0,
  )

  const npcForTurn = {
    ...battle.opponent,
    apPenalty: 0,
    isDefending: false,
  }
  const { remaining: npcBuffsAfterTick } = tickBuffs(npcForTurn.buffs || [])
  npcForTurn.buffs = npcBuffsAfterTick

  // 执行 NPC AI
  const playerForNpc = {
    atk: player.atk, def: player.def, hp: player.hp, maxHp: player.maxHp,
    stance: player.stance || 'normal', strategy: player.strategy || 'normal',
    buffs: playerBuffsAfterTick, isDefending: battle.isDefending || false,
    name: player.name,
  }

  const aiResult = runNpcTurn(
    { ...battle, opponentAp: npcAp },
    npcForTurn, playerForNpc, rules,
  )

  let playerHp = aiResult.updatedPlayer.hp
  const updatedNpc = aiResult.updatedNpc

  log.push(...aiResult.log)
  for (const entry of aiResult.log) textLogs.push(entry.text)

  // 胜负检查
  if (playerHp <= 0) {
    return buildDefeatResult({ ...player, hp: playerHp }, battle, log, textLogs)
  }
  if (updatedNpc.hp <= 0) {
    return buildVictoryResult(player, battle, updatedNpc, log, textLogs, playerHp)
  }

  // 新回合
  const nextTurn = battle.turn + 1
  const nextPlayerAp = getInitAp(
    rules,
    battle.firstStrike === 'player',
    nextTurn,
    aiResult.updatedPlayer.apPenalty || 0,
  )

  const updatedBattle = {
    ...battle,
    turn: nextTurn,
    whoseTurn: 'player',
    playerAp: nextPlayerAp,
    opponentAp: 0,
    opponent: { ...updatedNpc, isDefending: false },
    playerBuffs: aiResult.updatedPlayer.buffs || playerBuffsAfterTick,
    isDefending: false,
    log,
  }

  return {
    updatedPlayer: { ...player, hp: playerHp, battle: updatedBattle },
    logs: textLogs,
    battleEnded: false,
    victory: null,
  }
}

// ══════════════════════════════════════
//  逃跑
// ══════════════════════════════════════

function handleFleeAction(player, battle, rules) {
  const fleeAction = COMMON_ACTIONS.find(a => a.id === 'flee')
  if (battle.playerAp < fleeAction.apCost) throw new Error('AP 不足（逃跑需要全部 AP）')

  const log = [...battle.log]
  const textLogs = []

  const success = rollFlee({ strategy: player.strategy || 'normal' }, rules)

  if (success) {
    const fleeLog = `${player.name} 成功逃离了 ${battle.opponent.name}`
    log.push({ text: fleeLog, type: 'flee', turn: battle.turn })
    textLogs.push(fleeLog)

    return {
      updatedPlayer: { ...player, battle: null },
      logs: textLogs,
      battleEnded: true,
      victory: null,  // 逃跑不算胜负
    }
  }

  // 逃跑失败
  const failLog = `${player.name} 尝试逃跑失败！`
  log.push({ text: failLog, type: 'system', turn: battle.turn })
  textLogs.push(failLog)

  // NPC 惩罚攻击
  let playerHp = player.hp
  const npcSkills = getAttackSkills(battle.opponent.weaponKind || 'unarmed')
  const cheapSkill = npcSkills.filter(s => s.damageMult > 0).sort((a, b) => a.apCost - b.apCost)[0]

  if (cheapSkill) {
    const npcState = {
      atk: battle.opponent.atk, def: battle.opponent.def,
      hp: battle.opponent.hp, maxHp: battle.opponent.maxHp,
      stance: battle.opponent.stance || 'normal',
      strategy: battle.opponent.strategy || 'normal',
      buffs: battle.opponent.buffs || [],
    }
    const playerState = {
      atk: player.atk, def: player.def, hp: playerHp, maxHp: player.maxHp,
      stance: player.stance || 'normal', strategy: player.strategy || 'normal',
      buffs: battle.playerBuffs || [], isDefending: battle.isDefending || false,
    }
    const dmg = calcBattleDamage(npcState, playerState, cheapSkill, rules)
    playerHp = Math.max(0, playerHp - dmg.damage)
    const punishLog = `${battle.opponent.name} 趁机攻击，造成 ${dmg.damage} 伤害${dmg.isCrit ? '（暴击！）' : ''}`
    log.push({ text: punishLog, type: dmg.isCrit ? 'crit' : 'damage', turn: battle.turn })
    textLogs.push(punishLog)
  }

  if (playerHp <= 0) {
    return buildDefeatResult({ ...player, hp: 0 }, battle, log, textLogs)
  }

  // 逃跑失败后继续 NPC 回合
  const endTurnResult = handleEndTurnAction(
    { ...player, hp: playerHp },
    { ...battle, playerAp: 0, log },
    rules,
  )

  return {
    ...endTurnResult,
    logs: [...textLogs, ...endTurnResult.logs],
  }
}

// ══════════════════════════════════════
//  胜负结算
// ══════════════════════════════════════

function buildVictoryResult(player, battle, opponent, log, textLogs, playerHp) {
  const victoryLog = `${player.name} 击败了 ${opponent.name}！`
  log.push({ text: victoryLog, type: 'death', turn: battle.turn })
  textLogs.push(victoryLog)

  if (opponent.level === 'boss') {
    const bossLog = `BOSS ${opponent.name} 已被击败！`
    log.push({ text: bossLog, type: 'death', turn: battle.turn })
    textLogs.push(bossLog)
  }

  return {
    updatedPlayer: {
      ...player,
      hp: playerHp,
      kills: (player.kills || 0) + 1,
      battle: null,
    },
    logs: textLogs,
    battleEnded: true,
    victory: true,
    isBossKill: opponent.level === 'boss',
    defeatedNpc: battle.opponent,  // 原始 NPC 数据，用于战利品生成
  }
}

function buildDefeatResult(player, battle, log, textLogs) {
  const deathLog = `${player.name} 在与 ${battle.opponent.name} 的战斗中倒下了`
  log.push({ text: deathLog, type: 'death', turn: battle.turn })
  textLogs.push(deathLog)

  return {
    updatedPlayer: {
      ...player,
      hp: 0,
      alive: false,
      battle: null,
    },
    logs: textLogs,
    battleEnded: true,
    victory: false,
  }
}

// ══════════════════════════════════════
//  战斗初始化（供 gameActions 调用）
// ══════════════════════════════════════

/**
 * 创建增强版战斗对象
 *
 * @param {object} player - 玩家对象
 * @param {object} npc    - NPC 对象（来自 npc_pool）
 * @param {object} rules  - 游戏规则
 * @returns {{ battle: object, playerHpAfterInit: number, logs: string[] }}
 */
export function initBattle(player, npc, rules) {
  const playerWeapon = (player.inventory || []).find(itemName =>
    /刀|剑|斩|刃|弓|枪|铳|射|棍|锤|棒|杖|投|镖|石|炸|雷|弹|灵|符|咒|魔/.test(itemName)
  )
  const playerWeaponKind = playerWeapon
    ? inferWeaponKind({ name: playerWeapon })
    : 'unarmed'

  const npcWeaponKind = npc.weapon_kind || 'unarmed'
  const npcStrategy = npc.strategy || 'normal'
  const npcAiType = npc.ai_type || 'aggressive'

  // 先手判定
  const firstStrike = determineFirstStrike(
    { stance: player.stance || 'normal' },
    { stance: 'normal' },
  )

  const turn = 1
  const playerAp = getInitAp(rules, firstStrike === 'player', turn)
  const opponentAp = getInitAp(rules, firstStrike === 'opponent', turn)

  const playerSkills = getSkillsForWeapon(playerWeaponKind)
  const npcSkills = getAttackSkills(npcWeaponKind)

  const logs = []

  const battle = {
    id: `battle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    opponent: {
      id: npc.id, name: npc.name, type: 'npc',
      hp: npc.hp, maxHp: npc.hp,
      atk: npc.atk || 10, def: npc.def || 5,
      level: npc.level || 'common',
      weaponKind: npcWeaponKind, skills: npcSkills,
      strategy: npcStrategy, ai_type: npcAiType,
      buffs: [], isDefending: false, apPenalty: 0, stance: 'normal',
    },
    turn, whoseTurn: 'player',
    playerAp, opponentAp: 0,
    playerBuffs: [], isDefending: false,
    firstStrike,
    log: [],
    playerSkills, playerWeaponKind,
    pvp: false, opponentUid: null,
  }

  // 先手日志
  const firstStrikeText = firstStrike === 'player'
    ? `${player.name} 抢先发起进攻！（先手 +1AP）`
    : `${npc.name} 先发制人！（${player.name} 本回合 -1AP）`
  battle.log.push({ text: firstStrikeText, type: 'system', turn: 1 })
  logs.push(firstStrikeText)

  let playerHpAfterInit = player.hp

  // NPC 先手时，立即执行 NPC 回合
  if (firstStrike === 'opponent') {
    battle.opponentAp = opponentAp
    const playerState = {
      atk: player.atk || 10, def: player.def || 5,
      hp: player.hp || 100, maxHp: player.maxHp || 100,
      stance: player.stance || 'normal', strategy: player.strategy || 'normal',
      buffs: [], isDefending: false, name: player.name,
    }

    const aiResult = runNpcTurn(battle, battle.opponent, playerState, rules)
    battle.log.push(...aiResult.log)
    for (const entry of aiResult.log) logs.push(entry.text)

    battle.opponent = { ...aiResult.updatedNpc, isDefending: false }
    battle.whoseTurn = 'player'
    battle.turn = 2
    battle.playerAp = getInitAp(rules, false, 2, aiResult.updatedPlayer.apPenalty || 0)
    battle.playerBuffs = aiResult.updatedPlayer.buffs || []
    battle.opponentAp = 0

    playerHpAfterInit = aiResult.updatedPlayer.hp
  }

  return { battle, playerHpAfterInit, logs }
}
