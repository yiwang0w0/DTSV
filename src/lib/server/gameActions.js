import { MAP_LIST } from '@/lib/constants'
import {
  applyBuff,
  calcDamage,
  calcItemEffect,
  getInitPlayerStats,
  getRule,
  getSearchChances,
  loadBuffPool,
  loadGameRules,
  processBuffs,
} from '@/lib/gameEngine'
import {
  calcEquippedStats,
  consumeDurability,
  executeCraft,
  rollbackCraftSideEffects,
  triggerPassives,
  tickPassiveCooldowns,
} from '@/lib/equipmentEngine'
import {
  appendGameLog,
  applyRoomLifecycle,
  createLogEntry,
  createPlayerState,
  getDisplayName,
  normalizeGamevars,
} from '@/lib/roomState'

/* ── 并发安全：乐观锁 ─────────────────────────── */

export class VersionConflictError extends Error {
  constructor() {
    super('VERSION_CONFLICT')
    this.name = 'VersionConflictError'
  }
}

const MAX_RETRIES = 3

export async function withRetry(fn, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof VersionConflictError && attempt < retries) {
        continue
      }
      throw err
    }
  }
}

async function safeConsumeDurability(ownerId, roomId, amount, client) {
  try {
    await consumeDurability(ownerId, roomId, amount, client)
  } catch (error) {
    console.error('consumeDurability failed', error)
  }
}

async function rollbackCraftResult(result, client) {
  if (!result?.rollback) return

  try {
    await rollbackCraftSideEffects(result.rollback, client)
  } catch (error) {
    console.error('rollbackCraftSideEffects failed', error)
  }
}

function getPlayer(gamevars, userId) {
  return gamevars.players?.[userId] || null
}

async function fetchRoom(client, roomId) {
  const { data, error } = await client.from('rooms').select('*').eq('id', roomId).single()
  if (error || !data) {
    throw new Error('房间不存在')
  }
  return data
}

async function fetchMapBundle(client, mapId) {
  const [{ data: mapConfig }, { data: items }, { data: npcs }, { data: allItems }] = await Promise.all([
    client.from('map_config').select('*').eq('map_id', mapId).single(),
    client.from('item_pool').select('*').contains('maps', [mapId]),
    client.from('npc_pool').select('*').contains('maps', [mapId]),
    client.from('item_pool').select('*'),
  ])

  return {
    mapConfig: mapConfig || null,
    itemPool: items || [],
    npcPool: npcs || [],
    allItems: allItems || [],
  }
}

async function fetchEquippedInstances(client, roomId, ownerIds) {
  if (!ownerIds.length) return []
  const { data } = await client
    .from('equipment_instances')
    .select('*, tier:equipment_tiers(*, passive:passive_skills(*), series:equipment_series(slot,name))')
    .eq('room_id', roomId)
    .eq('is_equipped', true)
    .in('owner_id', ownerIds)

  return data || []
}

function groupEquipsByOwner(instances) {
  return instances.reduce((acc, instance) => {
    if (!acc[instance.owner_id]) acc[instance.owner_id] = []
    acc[instance.owner_id].push(instance)
    return acc
  }, {})
}

function buildCombatPlayer(basePlayer, instances = []) {
  if (!basePlayer) return null
  const equipped = calcEquippedStats(instances)
  const maxHp = (basePlayer.maxHp || 100) + (equipped.totalHp || 0)
  return {
    ...basePlayer,
    hp: Math.min(basePlayer.hp || 0, maxHp),
    maxHp,
    atk: (basePlayer.atk || 0) + equipped.totalAtk,
    def: (basePlayer.def || 0) + equipped.totalDef,
    _pass: instances.map(instance => instance.tier?.passive).filter(Boolean),
  }
}

function applyTurnEffects(gamevars, buffPool) {
  const nextPlayers = { ...gamevars.players }
  const logEntries = []

  for (const [playerId, player] of Object.entries(nextPlayers)) {
    if (!player?.alive) continue
    const { updatedPlayer, logEntries: playerLogs } = processBuffs(player, buffPool || [])
    logEntries.push(...playerLogs)
    nextPlayers[playerId] = {
      ...tickPassiveCooldowns(updatedPlayer),
      battle: updatedPlayer.alive ? updatedPlayer.battle || player.battle || null : null,
    }
  }

  return {
    gamevars: { ...gamevars, players: nextPlayers },
    logs: logEntries,
  }
}

async function persistRoom(client, room, gamevars, logs = [], options = {}) {
  const withLogs = logs.length ? appendGameLog(gamevars, logs) : normalizeGamevars(gamevars)
  const { gamevars: nextGamevars, roomPatch } = applyRoomLifecycle(room, withLogs, options)

  const currentVersion = room.version ?? 0
  const { data, error } = await client
    .from('rooms')
    .update({ ...roomPatch, gamevars: nextGamevars, version: currentVersion + 1 })
    .eq('id', room.id)
    .eq('version', currentVersion)
    .select('*')
    .single()

  if (!data && !error) {
    throw new VersionConflictError()
  }
  if (error?.code === 'PGRST116') {
    throw new VersionConflictError()
  }
  if (error) {
    throw new Error(error.message || '房间状态更新失败')
  }

  return data
}

async function fetchItemDefByName(client, name) {
  const { data } = await client.from('item_pool').select('*').eq('name', name).maybeSingle()
  return data || null
}

function removeInventoryItem(inventory, itemName, count = 1) {
  let removed = 0
  return (inventory || []).filter(item => {
    if (item === itemName && removed < count) {
      removed += 1
      return false
    }
    return true
  })
}

export async function createRoom(client, user, payload = {}) {
  const { data: latestRoom } = await client
    .from('rooms')
    .select('gamenum')
    .order('gamenum', { ascending: false })
    .limit(1)
    .maybeSingle()

  const gamevars = normalizeGamevars({ players: {}, log: [], turn: 0 })
  const nextGamenum = (latestRoom?.gamenum || 0) + 1
  const { data, error } = await client
    .from('rooms')
    .insert({
      gamenum: nextGamenum,
      gametype: Number(payload.gametype ?? 0),
      gamestate: 0,
      validnum: 0,
      alivenum: 0,
      deathnum: 0,
      winner: null,
      started_at: null,
      version: 0,
      gamevars: appendGameLog(gamevars, createLogEntry(`${getDisplayName(user)} 创建了房间`, 'system')),
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message || '创建房间失败')
  }

  return data
}

export async function joinRoom(client, user, roomId) {
  const room = await fetchRoom(client, roomId)
  if (room.gamestate === 2) {
    throw new Error('已结束房间不可加入')
  }

  const gamevars = normalizeGamevars(room.gamevars)
  if (getPlayer(gamevars, user.id)) {
    return room
  }

  const rules = await loadGameRules(client)
  const player = createPlayerState(user, getInitPlayerStats(rules))
  const nextGamevars = {
    ...gamevars,
    players: {
      ...gamevars.players,
      [user.id]: player,
    },
  }

  const nextRoom = await persistRoom(client, room, nextGamevars, [
    createLogEntry(`${player.name} 加入了游戏`, 'system'),
  ], { startGame: true })

  await client.from('profiles').update({ roomid: roomId }).eq('id', user.id)
  return nextRoom
}

export async function executeGameAction(client, user, payload) {
  const roomId = Number(payload.roomId)
  if (!roomId) {
    throw new Error('缺少房间 ID')
  }

  const room = await fetchRoom(client, roomId)
  const gamevars = normalizeGamevars(room.gamevars)
  const me = getPlayer(gamevars, user.id)

  if (payload.action !== 'join' && !me) {
    throw new Error('你还未加入该房间')
  }

  if (payload.action === 'join') {
    return joinRoom(client, user, roomId)
  }

  if (payload.action === 'move') {
    return movePlayer(client, room, gamevars, user, Number(payload.mapId))
  }

  if (payload.action === 'search') {
    return searchArea(client, room, gamevars, user)
  }

  if (payload.action === 'attackNpc') {
    return attackNpc(client, room, gamevars, user)
  }

  if (payload.action === 'flee') {
    return fleeNpc(client, room, gamevars, user)
  }

  if (payload.action === 'attackPlayer') {
    return attackPlayer(client, room, gamevars, user, payload.targetUid)
  }

  if (payload.action === 'useItem') {
    return useItem(client, room, gamevars, user, payload.itemName)
  }

  throw new Error('未知动作')
}

async function movePlayer(client, room, gamevars, user, mapId) {
  if (mapId === undefined || Number.isNaN(mapId)) throw new Error('缺少地图 ID')
  const player = getPlayer(gamevars, user.id)
  if (!player?.alive) throw new Error('已阵亡玩家无法移动')
  if (player.battle) throw new Error('战斗中无法移动')

  const mapName = MAP_LIST.find(map => map.id === mapId)?.name || `地图 ${mapId}`
  const nextGamevars = {
    ...gamevars,
    players: {
      ...gamevars.players,
      [user.id]: { ...player, map: mapId },
    },
  }

  return persistRoom(client, room, nextGamevars, [
    createLogEntry(`${player.name} 转移至【${mapName}】`, 'system'),
  ])
}

async function searchArea(client, room, gamevars, user) {
  const player = getPlayer(gamevars, user.id)
  if (!player?.alive) throw new Error('已阵亡玩家无法搜索')
  if (player.battle) throw new Error('战斗中无法搜索')

  const [rules, buffPool] = await Promise.all([
    loadGameRules(client),
    loadBuffPool(client),
  ])

  let working = normalizeGamevars(gamevars)
  const turnResult = applyTurnEffects(working, buffPool)
  working = turnResult.gamevars
  let logs = turnResult.logs.map(log => createLogEntry(log, log.includes('损失') ? 'damage' : 'buff'))
  const nextPlayer = getPlayer(working, user.id)

  if (!nextPlayer?.alive) {
    logs.push(createLogEntry(`${player.name} 被持续效果击倒了`, 'death'))
    return persistRoom(client, room, working, logs)
  }

  const bundle = await fetchMapBundle(client, nextPlayer.map ?? 0)
  const weather = bundle.mapConfig?.weather || 'clear'
  const { itemChance, npcChance } = getSearchChances(rules, weather)
  const roll = Math.random()

  logs.push(createLogEntry(`${player.name} 开始搜索区域`, 'system'))

  if (roll < npcChance && bundle.npcPool.length > 0) {
    const npc = bundle.npcPool[Math.floor(Math.random() * bundle.npcPool.length)]
    working.players[user.id] = {
      ...nextPlayer,
      battle: {
        npc,
        npcHp: npc.hp,
        npcMaxHp: npc.hp,
        turn: 1,
        log: [],
      },
    }
    logs.push(createLogEntry(`${player.name} 遭遇了【${npc.name}】`, 'damage'))
    return persistRoom(client, room, working, logs)
  }

  if (roll < npcChance + itemChance && bundle.itemPool.length > 0) {
    const totalWeight = bundle.itemPool.reduce((sum, item) => sum + (item.amount || 1), 0)
    let remain = Math.random() * totalWeight
    let found = bundle.itemPool[0]
    for (const item of bundle.itemPool) {
      remain -= item.amount || 1
      if (remain <= 0) {
        found = item
        break
      }
    }

    working.players[user.id] = {
      ...nextPlayer,
      inventory: [...(nextPlayer.inventory || []), found.name],
    }
    logs.push(createLogEntry(`${player.name} 找到了【${found.name}】`, 'heal'))
    return persistRoom(client, room, working, logs)
  }

  logs.push(createLogEntry(`${player.name} 搜索了一圈，但没有发现有用的东西`, 'system'))
  return persistRoom(client, room, working, logs)
}

async function attackNpc(client, room, gamevars, user) {
  const player = getPlayer(gamevars, user.id)
  const battle = player?.battle
  if (!battle?.npc) throw new Error('当前没有 NPC 战斗')

  const [rules, buffPool, equippedInstances] = await Promise.all([
    loadGameRules(client),
    loadBuffPool(client),
    fetchEquippedInstances(client, room.id, [user.id]),
  ])

  const equipMap = groupEquipsByOwner(equippedInstances)
  const myEquips = equipMap[user.id] || []
  let me = buildCombatPlayer(player, myEquips)
  const battleLog = [...(battle.log || [])]
  const weapon = myEquips.find(instance => instance.tier?.series?.slot === 'weapon')
  const weather = (await fetchMapBundle(client, player.map ?? 0)).mapConfig?.weather || 'clear'

  const damageOut = calcDamage(me, { ...battle.npc, hp: battle.npcHp, maxHp: battle.npcMaxHp }, rules, weapon?.tier?.sub_kind || '', weather)
  const { attackerUpdated: meAfterAttack, logs: passiveLogs } = triggerPassives(
    'on_attack',
    me,
    { ...battle.npc, hp: battle.npcHp },
    me._pass || [],
    buffPool,
  )
  me = meAfterAttack

  const logs = passiveLogs.map(entry => createLogEntry(entry, 'buff'))
  const npcHp = Math.max(0, battle.npcHp - damageOut)
  const attackLog = `${player.name} 攻击【${battle.npc.name}】，造成 ${damageOut} 伤害`
  battleLog.push(attackLog)
  logs.push(createLogEntry(attackLog, 'damage'))

  const nextGamevars = normalizeGamevars(gamevars)

  if (npcHp <= 0) {
    const { attackerUpdated: meAfterKill } = triggerPassives('on_kill', me, null, me._pass || [], buffPool)
    const drops = battle.npc.drop_items || []
    nextGamevars.players[user.id] = {
      ...player,
      hp: meAfterKill.hp,
      buffs: meAfterKill.buffs || [],
      passiveCooldowns: meAfterKill.passiveCooldowns || {},
      inventory: [...(player.inventory || []), ...drops],
      kills: (player.kills || 0) + 1,
      battle: null,
    }

    logs.push(createLogEntry(`${player.name} 击败了【${battle.npc.name}】`, 'kill'))
    if (drops.length) {
      logs.push(createLogEntry(`${player.name} 获得：${drops.join('、')}`, 'heal'))
    }
    const nextRoom = await persistRoom(client, room, nextGamevars, logs)
    await safeConsumeDurability(user.id, room.id, 1, client)
    return nextRoom
  }

  const damageIn = calcDamage({ ...battle.npc, hp: npcHp, maxHp: battle.npcMaxHp }, me, rules, '', weather)
  const nextHp = Math.max(0, (me.hp || 0) - damageIn)
  const counterLog = `【${battle.npc.name}】反击，造成 ${damageIn} 伤害`
  battleLog.push(counterLog)
  logs.push(createLogEntry(counterLog, 'damage'))

  nextGamevars.players[user.id] = {
    ...player,
    hp: nextHp,
    alive: nextHp > 0,
    buffs: me.buffs || [],
    passiveCooldowns: me.passiveCooldowns || {},
    battle: nextHp > 0 ? { ...battle, npcHp, turn: battle.turn + 1, log: battleLog } : null,
  }

  if (nextHp <= 0) {
    logs.push(createLogEntry(`${player.name} 在与【${battle.npc.name}】的战斗中倒下了`, 'death'))
  }

  const nextRoom = await persistRoom(client, room, nextGamevars, logs)
  await safeConsumeDurability(user.id, room.id, 1, client)
  return nextRoom
}

async function fleeNpc(client, room, gamevars, user) {
  const player = getPlayer(gamevars, user.id)
  const battle = player?.battle
  if (!battle?.npc) throw new Error('当前没有 NPC 战斗')

  const [rules, equippedInstances] = await Promise.all([
    loadGameRules(client),
    fetchEquippedInstances(client, room.id, [user.id]),
  ])

  const myEquips = groupEquipsByOwner(equippedInstances)[user.id] || []
  const me = buildCombatPlayer(player, myEquips)
  const fleeRate = getRule(rules, 'flee_success_rate', 0.6)
  const nextGamevars = normalizeGamevars(gamevars)

  if (Math.random() < fleeRate) {
    nextGamevars.players[user.id] = { ...player, battle: null }
    return persistRoom(client, room, nextGamevars, [
      createLogEntry(`${player.name} 成功逃离了【${battle.npc.name}】`, 'system'),
    ])
  }

  const weather = (await fetchMapBundle(client, player.map ?? 0)).mapConfig?.weather || 'clear'
  const damage = calcDamage({ ...battle.npc, hp: battle.npcHp, maxHp: battle.npcMaxHp }, me, rules, '', weather)
  const nextHp = Math.max(0, (me.hp || 0) - damage)
  nextGamevars.players[user.id] = {
    ...player,
    hp: nextHp,
    alive: nextHp > 0,
    battle: nextHp > 0 ? battle : null,
  }

  const logs = [
    createLogEntry(`${player.name} 逃跑失败，被【${battle.npc.name}】造成 ${damage} 伤害`, 'damage'),
  ]
  if (nextHp <= 0) {
    logs.push(createLogEntry(`${player.name} 倒在了逃跑途中`, 'death'))
  }

  return persistRoom(client, room, nextGamevars, logs)
}

async function attackPlayer(client, room, gamevars, user, targetUid) {
  const attacker = getPlayer(gamevars, user.id)
  const defender = getPlayer(gamevars, targetUid)
  if (!defender) throw new Error('目标玩家不存在')
  if (!attacker?.alive) throw new Error('已阵亡玩家无法攻击')
  if (!defender.alive) throw new Error('目标已阵亡')
  if (targetUid === user.id) throw new Error('不能攻击自己')
  if ((attacker.map ?? 0) !== (defender.map ?? 0)) throw new Error('目标不在同一地图')

  const [rules, buffPool, equippedInstances] = await Promise.all([
    loadGameRules(client),
    loadBuffPool(client),
    fetchEquippedInstances(client, room.id, [user.id, targetUid]),
  ])

  let working = normalizeGamevars(gamevars)
  const turnResult = applyTurnEffects(working, buffPool)
  working = turnResult.gamevars
  const logs = turnResult.logs.map(log => createLogEntry(log, 'buff'))

  const attackerAfterTurn = getPlayer(working, user.id)
  const defenderAfterTurn = getPlayer(working, targetUid)
  if (!attackerAfterTurn?.alive || !defenderAfterTurn?.alive) {
    return persistRoom(client, room, working, logs)
  }

  const equipMap = groupEquipsByOwner(equippedInstances)
  let me = buildCombatPlayer(attackerAfterTurn, equipMap[user.id] || [])
  let target = buildCombatPlayer(defenderAfterTurn, equipMap[targetUid] || [])
  const weapon = (equipMap[user.id] || []).find(instance => instance.tier?.series?.slot === 'weapon')
  const weather = (await fetchMapBundle(client, attackerAfterTurn.map ?? 0)).mapConfig?.weather || 'clear'

  const damage = calcDamage(me, target, rules, weapon?.tier?.sub_kind || '', weather)
  const { attackerUpdated: meAfterAttack, defenderUpdated: targetAfterPassive, logs: passiveLogs } = triggerPassives(
    'on_attack',
    me,
    target,
    me._pass || [],
    buffPool,
  )
  me = meAfterAttack
  if (targetAfterPassive) target = targetAfterPassive
  logs.push(...passiveLogs.map(entry => createLogEntry(entry, 'buff')))

  const targetHp = Math.max(0, (target.hp || 0) - damage)
  logs.push(createLogEntry(`${attacker.name} 攻击 ${target.name}，造成 ${damage} 伤害`, 'damage'))

  working.players[user.id] = {
    ...attackerAfterTurn,
    hp: me.hp,
    buffs: me.buffs || [],
    passiveCooldowns: me.passiveCooldowns || {},
  }
  working.players[targetUid] = {
    ...defenderAfterTurn,
    hp: targetHp,
    alive: targetHp > 0,
    battle: targetHp > 0 ? defenderAfterTurn.battle || null : null,
  }

  if (targetHp <= 0) {
    const { attackerUpdated: meAfterKill } = triggerPassives('on_kill', me, null, me._pass || [], buffPool)
    working.players[user.id] = {
      ...working.players[user.id],
      hp: meAfterKill.hp,
      buffs: meAfterKill.buffs || [],
      passiveCooldowns: meAfterKill.passiveCooldowns || {},
      kills: (attackerAfterTurn.kills || 0) + 1,
    }
    logs.push(createLogEntry(`${attacker.name} 击败了 ${target.name}`, 'kill'))
  }

  const nextRoom = await persistRoom(client, room, working, logs)
  await safeConsumeDurability(user.id, room.id, 1, client)
  return nextRoom
}

async function useItem(client, room, gamevars, user, itemName) {
  const player = getPlayer(gamevars, user.id)
  if (!player?.alive) throw new Error('已阵亡玩家无法使用道具')
  if (!itemName) throw new Error('缺少道具名称')

  const [rules, buffPool, equippedInstances, itemDef] = await Promise.all([
    loadGameRules(client),
    loadBuffPool(client),
    fetchEquippedInstances(client, room.id, [user.id]),
    fetchItemDefByName(client, itemName),
  ])

  if (!itemDef) throw new Error(`未知道具：${itemName}`)

  const me = buildCombatPlayer(player, groupEquipsByOwner(equippedInstances)[user.id] || [])
  const nextPlayer = { ...player }
  const result = calcItemEffect(itemDef, me, rules)
  const logs = []

  if (result.hpDelta) {
    nextPlayer.hp = Math.max(0, Math.min(me.maxHp, (player.hp || 0) + result.hpDelta))
    nextPlayer.alive = nextPlayer.hp > 0
    logs.push(createLogEntry(`${player.name} 使用 ${itemName}，HP ${result.hpDelta > 0 ? '+' : ''}${result.hpDelta}`, result.hpDelta > 0 ? 'heal' : 'damage'))
  }

  if (result.atkDelta) {
    nextPlayer.atk = Math.max(0, (nextPlayer.atk || 0) + result.atkDelta)
    logs.push(createLogEntry(`${player.name} 使用 ${itemName}，ATK +${result.atkDelta}`, 'buff'))
  }

  if (result.defDelta) {
    nextPlayer.def = Math.max(0, (nextPlayer.def || 0) + result.defDelta)
    logs.push(createLogEntry(`${player.name} 使用 ${itemName}，DEF +${result.defDelta}`, 'buff'))
  }

  for (const buffId of result.newBuffIds || []) {
    const buffDef = (buffPool || []).find(buff => buff.id === buffId)
    if (!buffDef) continue
    const updated = applyBuff(nextPlayer, buffId, buffDef)
    nextPlayer.buffs = updated.buffs
    logs.push(createLogEntry(`${player.name} 获得了 ${buffDef.name}`, 'buff'))
  }

  nextPlayer.inventory = removeInventoryItem(player.inventory, itemName, 1)

  const nextGamevars = normalizeGamevars(gamevars)
  nextGamevars.players[user.id] = nextPlayer
  return persistRoom(client, room, nextGamevars, logs)
}

export async function executeEquipmentAction(client, user, payload) {
  const roomId = Number(payload.roomId)
  if (!roomId) throw new Error('缺少房间 ID')

  const room = await fetchRoom(client, roomId)
  const gamevars = normalizeGamevars(room.gamevars)
  if (!getPlayer(gamevars, user.id)) {
    throw new Error('你还未加入该房间')
  }

  if (payload.action === 'craft') {
    const resultTierId = Number(payload.resultTierId)
    if (!resultTierId) throw new Error('缺少目标装备')
    const result = await executeCraft(resultTierId, user.id, roomId, gamevars, client)
    try {
      const nextRoom = await persistRoom(client, room, result.gamevars, [
        createLogEntry(result.log, result.success ? 'heal' : 'system'),
      ])
      return { room: nextRoom, success: result.success }
    } catch (error) {
      await rollbackCraftResult(result, client)
      throw error
    }
  }

  const { data: instance } = await client
    .from('equipment_instances')
    .select('*, tier:equipment_tiers(*, series:equipment_series(slot,name))')
    .eq('id', payload.instanceId)
    .eq('owner_id', user.id)
    .eq('room_id', roomId)
    .single()

  if (!instance) throw new Error('装备实例不存在')

  if (payload.action === 'equip') {
    const slot = instance.slot_override || instance.tier?.series?.slot
    if (!slot) throw new Error('装备槽位信息缺失')
    if ((instance.durability_current ?? 1) <= 0) throw new Error('耐久为 0 的装备无法穿戴')

    const { data: equipped } = await client
      .from('equipment_instances')
      .select('id')
      .eq('owner_id', user.id)
      .eq('room_id', roomId)
      .eq('is_equipped', true)
      .eq('equipped_slot', slot)

    for (const current of equipped || []) {
      if (current.id !== instance.id) {
        await client.from('equipment_instances').update({ is_equipped: false, equipped_slot: null }).eq('id', current.id)
      }
    }

    await client.from('equipment_instances').update({ is_equipped: true, equipped_slot: slot }).eq('id', instance.id)
    const nextRoom = await persistRoom(client, room, gamevars, [
      createLogEntry(`${getPlayer(gamevars, user.id).name} 装备了【${instance.tier?.name || '未知装备'}】`, 'system'),
    ])
    return { room: nextRoom, success: true }
  }

  if (payload.action === 'unequip') {
    await client.from('equipment_instances').update({ is_equipped: false, equipped_slot: null }).eq('id', instance.id)
    const nextRoom = await persistRoom(client, room, gamevars, [
      createLogEntry(`${getPlayer(gamevars, user.id).name} 卸下了【${instance.tier?.name || '未知装备'}】`, 'system'),
    ])
    return { room: nextRoom, success: true }
  }

  throw new Error('未知装备动作')
}
