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
} from '@/lib/gameEngine'
import {
  appendResolutionLog,
  appendResolutionLogs,
  createActionResolution,
  finalizeResolution,
  getResolutionPlayer,
  runTurnStartSettlement,
  setResolutionPlayer,
  settleNewDeaths,
  updateResolutionPlayer,
} from '@/lib/eventResolver'
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
  clearPlayerLootPrompt,
  createLogEntry,
  createCorpse,
  createPlayerState,
  getDisplayName,
  normalizeGamevars,
  normalizeCorpseEntry,
  setPlayerLootPrompt,
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

async function settleCorpseGeneration(resolution) {
  await settleNewDeaths(resolution, async ({ player }) => {
    const result = ensurePlayerCorpse(resolution.gamevars, player)
    resolution.gamevars = result.gamevars
  })
  return resolution
}

async function persistResolution(client, room, resolution, options = {}) {
  const settled = finalizeResolution(resolution)
  return persistRoom(client, room, settled.gamevars, settled.logs, options)
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

function getCurrentMapCorpses(gamevars, mapId) {
  return (gamevars.corpses || []).filter(corpse => corpse.mapId === (mapId ?? 0))
}

function hasPlayerCorpse(gamevars, playerId) {
  return (gamevars.corpses || []).some(corpse => corpse.type === 'player' && corpse.ownerPlayerId === playerId)
}

function addCorpse(gamevars, corpse) {
  const normalized = normalizeGamevars(gamevars)
  return {
    ...normalized,
    corpses: [...(normalized.corpses || []), corpse],
  }
}

function replaceCorpse(gamevars, corpseId, updater) {
  const normalized = normalizeGamevars(gamevars)
  return {
    ...normalized,
    corpses: (normalized.corpses || [])
      .map(corpse => (corpse.id === corpseId ? updater(corpse) : corpse))
      .filter(Boolean),
  }
}

function removeCorpse(gamevars, corpseId) {
  const normalized = normalizeGamevars(gamevars)
  return {
    ...normalized,
    corpses: (normalized.corpses || []).filter(corpse => corpse.id !== corpseId),
  }
}

function ensurePlayerCorpse(gamevars, player) {
  if (!player || !player.id || hasPlayerCorpse(gamevars, player.id)) {
    return { gamevars, corpse: null }
  }

  const corpse = createCorpse({
    type: 'player',
    name: `${player.name} 的尸体`,
    mapId: player.map ?? 0,
    ownerPlayerId: player.id,
  })

  return {
    gamevars: addCorpse(gamevars, corpse),
    corpse,
  }
}

async function resolveNpcDropEntry(client, name) {
  const { data: tier } = await client
    .from('equipment_tiers')
    .select('id, name, rarity, series:equipment_series(slot,name), durability_max')
    .eq('name', name)
    .maybeSingle()

  if (tier) {
    return normalizeCorpseEntry({
      id: `npc-equip-${tier.id}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'equipment_tier',
      name: tier.name,
      tierId: tier.id,
      slot: tier.series?.slot || '',
      rarity: tier.rarity || '',
      durability: tier.durability_max ?? null,
      durabilityMax: tier.durability_max ?? null,
    })
  }

  return normalizeCorpseEntry({
    id: `npc-item-${Math.random().toString(36).slice(2, 8)}`,
    type: 'item',
    name,
    itemName: name,
  })
}

async function createNpcCorpse(client, gamevars, npc, mapId) {
  const entries = []
  for (const name of npc.drop_items || []) {
    const entry = await resolveNpcDropEntry(client, name)
    if (entry) entries.push(entry)
  }

  const corpse = createCorpse({
    type: 'npc',
    name: `${npc.name} 的尸体`,
    mapId,
    entries,
  })

  return {
    gamevars: addCorpse(gamevars, corpse),
    corpse,
  }
}

async function fetchOwnerEquipmentInstances(client, roomId, ownerId) {
  const { data } = await client
    .from('equipment_instances')
    .select('*, tier:equipment_tiers(*, passive:passive_skills(*), series:equipment_series(slot,name))')
    .eq('room_id', roomId)
    .eq('owner_id', ownerId)
    .order('is_equipped', { ascending: false })
    .order('acquired_at', { ascending: true })

  return data || []
}

async function buildCorpseLootOptions(client, roomId, gamevars, corpse) {
  if (!corpse) return []

  if (corpse.type === 'npc') {
    return (corpse.entries || []).map(normalizeCorpseEntry).filter(Boolean)
  }

  const owner = getPlayer(gamevars, corpse.ownerPlayerId)
  if (!owner) return []

  const inventoryOptions = (owner.inventory || []).map((itemName, index) => normalizeCorpseEntry({
    id: `item:${itemName}:${index}`,
    type: 'item',
    name: itemName,
    itemName,
  }))

  const equipmentOptions = (await fetchOwnerEquipmentInstances(client, roomId, corpse.ownerPlayerId))
    .map(instance => normalizeCorpseEntry({
      id: `equip:${instance.id}`,
      type: 'equipment_instance',
      name: instance.tier?.name || '未知装备',
      instanceId: instance.id,
      slot: instance.tier?.series?.slot || '',
      rarity: instance.tier?.rarity || '',
      durability: instance.durability_current ?? null,
      durabilityMax: instance.tier?.durability_max ?? null,
    }))

  return [...equipmentOptions, ...inventoryOptions]
}

async function buildLootPrompt(client, roomId, gamevars, corpse, source) {
  const options = await buildCorpseLootOptions(client, roomId, gamevars, corpse)
  if (!options.length) return null

  return {
    corpseId: corpse.id,
    corpseName: corpse.name,
    source,
    options,
  }
}

async function cleanupCorpseIfEmpty(client, roomId, gamevars, corpseId) {
  const normalized = normalizeGamevars(gamevars)
  const corpse = (normalized.corpses || []).find(item => item.id === corpseId)
  if (!corpse) return normalized

  const options = await buildCorpseLootOptions(client, roomId, normalized, corpse)
  if (options.length > 0) return normalized

  return removeCorpse(normalized, corpseId)
}

function getCorpseById(gamevars, corpseId) {
  return (normalizeGamevars(gamevars).corpses || []).find(corpse => corpse.id === corpseId) || null
}

async function createLootSideEffect(client, roomId, looterId, corpse, entry) {
  if (!entry || entry.type === 'item') return null

  if (entry.type === 'equipment_tier') {
    const { data: tier, error: tierError } = await client
      .from('equipment_tiers')
      .select('id, name, durability_max')
      .eq('id', entry.tierId)
      .single()

    if (tierError || !tier) {
      throw new Error('尸体上的装备定义不存在')
    }

    const { data: inserted, error: insertError } = await client
      .from('equipment_instances')
      .insert({
        tier_id: tier.id,
        owner_id: looterId,
        room_id: roomId,
        is_equipped: false,
        equipped_slot: null,
        durability_current: tier.durability_max ?? entry.durabilityMax ?? 0,
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      throw new Error(insertError?.message || '战利品装备生成失败')
    }

    return {
      kind: 'created_instance',
      instanceId: inserted.id,
    }
  }

  if (entry.type === 'equipment_instance') {
    const { data: instance, error: instanceError } = await client
      .from('equipment_instances')
      .select('id, owner_id, room_id, is_equipped, equipped_slot')
      .eq('id', entry.instanceId)
      .eq('room_id', roomId)
      .maybeSingle()

    if (instanceError) {
      throw new Error(instanceError.message || '尸体上的装备读取失败')
    }
    if (!instance || (corpse.ownerPlayerId && instance.owner_id !== corpse.ownerPlayerId)) {
      throw new Error('这件装备已经被别人拿走了')
    }

    const { data: updated, error: updateError } = await client
      .from('equipment_instances')
      .update({
        owner_id: looterId,
        is_equipped: false,
        equipped_slot: null,
      })
      .eq('id', instance.id)
      .eq('room_id', roomId)
      .eq('owner_id', instance.owner_id)
      .select('id')
      .maybeSingle()

    if (updateError) {
      throw new Error(updateError.message || '尸体上的装备转移失败')
    }
    if (!updated) {
      throw new Error('这件装备已经被别人拿走了')
    }

    return {
      kind: 'transferred_instance',
      instanceId: instance.id,
      snapshot: {
        ownerId: instance.owner_id,
        isEquipped: instance.is_equipped,
        equippedSlot: instance.equipped_slot,
      },
    }
  }

  throw new Error('不支持的战利品类型')
}

async function rollbackLootSideEffect(client, sideEffect) {
  if (!sideEffect) return

  if (sideEffect.kind === 'created_instance') {
    await client.from('equipment_instances').delete().eq('id', sideEffect.instanceId)
    return
  }

  if (sideEffect.kind === 'transferred_instance') {
    await client
      .from('equipment_instances')
      .update({
        owner_id: sideEffect.snapshot.ownerId,
        is_equipped: sideEffect.snapshot.isEquipped,
        equipped_slot: sideEffect.snapshot.equippedSlot,
      })
      .eq('id', sideEffect.instanceId)
  }
}

async function collectLootableCorpses(client, roomId, gamevars, mapId) {
  let working = normalizeGamevars(gamevars)
  const lootable = []

  for (const corpse of getCurrentMapCorpses(working, mapId)) {
    const prompt = await buildLootPrompt(client, roomId, working, corpse, 'search')
    if (prompt) {
      lootable.push({ corpse, prompt })
      continue
    }

    working = removeCorpse(working, corpse.id)
  }

  return { gamevars: working, lootable }
}

async function resolveSearchAction(client, room, gamevars, user) {
  const player = getPlayer(gamevars, user.id)
  if (!player?.alive) throw new Error('闃典骸鐜╁鏃犳硶鎼滅储')
  if (player.battle) throw new Error('鎴樻枟涓棤娉曟悳绱?)

  const [rules, buffPool] = await Promise.all([
    loadGameRules(client),
    loadBuffPool(client),
  ])

  const resolution = createActionResolution({ room, actorId: user.id, gamevars })
  await runTurnStartSettlement(resolution, buffPool)
  await settleCorpseGeneration(resolution)

  const nextPlayer = getResolutionPlayer(resolution, user.id)
  if (!nextPlayer?.alive) {
    appendResolutionLog(resolution, `${player.name} 琚寔缁晥鏋滃嚮鍊掍簡`, 'death')
    return persistResolution(client, room, resolution)
  }

  const bundle = await fetchMapBundle(client, nextPlayer.map ?? 0)
  const weather = bundle.mapConfig?.weather || 'clear'
  const { itemChance, npcChance } = getSearchChances(rules, weather)
  const { gamevars: workingWithCorpses, lootable } = await collectLootableCorpses(
    client,
    room.id,
    resolution.gamevars,
    nextPlayer.map ?? 0,
  )
  resolution.gamevars = workingWithCorpses

  const corpseChance = lootable.length > 0 ? itemChance * 0.5 : 0
  const looseItemChance = Math.max(0, itemChance - corpseChance)
  const roll = Math.random()

  appendResolutionLog(resolution, `${player.name} 寮€濮嬫悳绱㈠尯鍩焋, 'system')

  if (roll < npcChance && bundle.npcPool.length > 0) {
    const npc = bundle.npcPool[Math.floor(Math.random() * bundle.npcPool.length)]
    setResolutionPlayer(resolution, user.id, {
      ...nextPlayer,
      battle: {
        npc,
        npcHp: npc.hp,
        npcMaxHp: npc.hp,
        turn: 1,
        log: [],
      },
    })
    appendResolutionLog(resolution, `${player.name} 閬亣浜?${npc.name}`, 'damage')
    return persistResolution(client, room, resolution)
  }

  if (roll < npcChance + corpseChance && lootable.length > 0) {
    const found = lootable[Math.floor(Math.random() * lootable.length)]
    resolution.gamevars = setPlayerLootPrompt(resolution.gamevars, user.id, found.prompt)
    appendResolutionLog(resolution, `${player.name} 鍙戠幇浜?${found.corpse.name}`, 'system')
    return persistResolution(client, room, resolution)
  }

  if (roll < npcChance + corpseChance + looseItemChance && bundle.itemPool.length > 0) {
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

    setResolutionPlayer(resolution, user.id, {
      ...nextPlayer,
      inventory: [...(nextPlayer.inventory || []), found.name],
    })
    appendResolutionLog(resolution, `${player.name} 鎵惧埌浜?${found.name}`, 'heal')
    return persistResolution(client, room, resolution)
  }

  appendResolutionLog(resolution, `${player.name} 鎼滅储浜嗕竴鍦堬紝浣嗘病鏈夊彂鐜版湁鐢ㄧ殑涓滆タ`, 'system')
  return persistResolution(client, room, resolution)
}

async function resolveNpcAttackAction(client, room, gamevars, user) {
  const player = getPlayer(gamevars, user.id)
  const battle = player?.battle
  if (!battle?.npc) throw new Error('褰撳墠娌℃湁 NPC 鎴樻枟')

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
  const resolution = createActionResolution({ room, actorId: user.id, gamevars })

  const damageOut = calcDamage(
    me,
    { ...battle.npc, hp: battle.npcHp, maxHp: battle.npcMaxHp },
    rules,
    weapon?.tier?.sub_kind || '',
    weather,
  )
  const { attackerUpdated: meAfterAttack, logs: passiveLogs } = triggerPassives(
    'on_attack',
    me,
    { ...battle.npc, hp: battle.npcHp },
    me._pass || [],
    buffPool,
  )
  me = meAfterAttack

  appendResolutionLogs(resolution, passiveLogs, 'buff')
  const npcHp = Math.max(0, battle.npcHp - damageOut)
  const attackLog = `${player.name} 鏀诲嚮 ${battle.npc.name}锛岄€犳垚 ${damageOut} 浼ゅ`
  battleLog.push(attackLog)
  appendResolutionLog(resolution, attackLog, 'damage')

  if (npcHp <= 0) {
    const { attackerUpdated: meAfterKill } = triggerPassives('on_kill', me, null, me._pass || [], buffPool)
    setResolutionPlayer(resolution, user.id, {
      ...player,
      hp: meAfterKill.hp,
      buffs: meAfterKill.buffs || [],
      passiveCooldowns: meAfterKill.passiveCooldowns || {},
      kills: (player.kills || 0) + 1,
      battle: null,
      lootPrompt: null,
    })

    const corpseResult = await createNpcCorpse(client, resolution.gamevars, battle.npc, player.map ?? 0)
    resolution.gamevars = corpseResult.gamevars
    let lootPrompt = null
    if (corpseResult.corpse) {
      lootPrompt = await buildLootPrompt(client, room.id, resolution.gamevars, corpseResult.corpse, 'kill')
      if (lootPrompt) {
        resolution.gamevars = setPlayerLootPrompt(resolution.gamevars, user.id, lootPrompt)
      } else {
        resolution.gamevars = await cleanupCorpseIfEmpty(client, room.id, resolution.gamevars, corpseResult.corpse.id)
      }
    }

    appendResolutionLog(resolution, `${player.name} 鍑昏触浜?${battle.npc.name}`, 'kill')
    if (lootPrompt) {
      appendResolutionLog(resolution, `${player.name} 鍙互浠?${corpseResult.corpse.name} 閲屽甫璧颁竴浠舵垬鍒╁搧`, 'system')
    }

    const nextRoom = await persistResolution(client, room, resolution)
    await safeConsumeDurability(user.id, room.id, 1, client)
    return nextRoom
  }

  const damageIn = calcDamage({ ...battle.npc, hp: npcHp, maxHp: battle.npcMaxHp }, me, rules, '', weather)
  const nextHp = Math.max(0, (me.hp || 0) - damageIn)
  const counterLog = `${battle.npc.name} 鍙嶅嚮锛岄€犳垚 ${damageIn} 浼ゅ`
  battleLog.push(counterLog)
  appendResolutionLog(resolution, counterLog, 'damage')

  setResolutionPlayer(resolution, user.id, {
    ...player,
    hp: nextHp,
    alive: nextHp > 0,
    buffs: me.buffs || [],
    passiveCooldowns: me.passiveCooldowns || {},
    battle: nextHp > 0 ? { ...battle, npcHp, turn: battle.turn + 1, log: battleLog } : null,
    lootPrompt: nextHp > 0 ? player.lootPrompt || null : null,
  })

  if (nextHp <= 0) {
    appendResolutionLog(resolution, `${player.name} 鍦ㄤ笌 ${battle.npc.name} 鐨勬垬鏂椾腑鍊掍笅浜哷, 'death')
    await settleCorpseGeneration(resolution)
  }

  const nextRoom = await persistResolution(client, room, resolution)
  await safeConsumeDurability(user.id, room.id, 1, client)
  return nextRoom
}

async function resolveNpcFleeAction(client, room, gamevars, user) {
  const player = getPlayer(gamevars, user.id)
  const battle = player?.battle
  if (!battle?.npc) throw new Error('褰撳墠娌℃湁 NPC 鎴樻枟')

  const [rules, equippedInstances] = await Promise.all([
    loadGameRules(client),
    fetchEquippedInstances(client, room.id, [user.id]),
  ])

  const myEquips = groupEquipsByOwner(equippedInstances)[user.id] || []
  const me = buildCombatPlayer(player, myEquips)
  const fleeRate = getRule(rules, 'flee_success_rate', 0.6)
  const resolution = createActionResolution({ room, actorId: user.id, gamevars })

  if (Math.random() < fleeRate) {
    setResolutionPlayer(resolution, user.id, { ...player, battle: null })
    appendResolutionLog(resolution, `${player.name} 鎴愬姛閫冪浜?${battle.npc.name}`, 'system')
    return persistResolution(client, room, resolution)
  }

  const weather = (await fetchMapBundle(client, player.map ?? 0)).mapConfig?.weather || 'clear'
  const damage = calcDamage({ ...battle.npc, hp: battle.npcHp, maxHp: battle.npcMaxHp }, me, rules, '', weather)
  const nextHp = Math.max(0, (me.hp || 0) - damage)
  setResolutionPlayer(resolution, user.id, {
    ...player,
    hp: nextHp,
    alive: nextHp > 0,
    battle: nextHp > 0 ? battle : null,
    lootPrompt: nextHp > 0 ? player.lootPrompt || null : null,
  })

  appendResolutionLog(resolution, `${player.name} 閫冭窇澶辫触锛岃 ${battle.npc.name} 閫犳垚 ${damage} 浼ゅ`, 'damage')
  if (nextHp <= 0) {
    appendResolutionLog(resolution, `${player.name} 鍊掑湪浜嗛€冭窇閫斾腑`, 'death')
    await settleCorpseGeneration(resolution)
  }

  return persistResolution(client, room, resolution)
}

async function resolvePlayerAttackAction(client, room, gamevars, user, targetUid) {
  const attacker = getPlayer(gamevars, user.id)
  const defender = getPlayer(gamevars, targetUid)
  if (!defender) throw new Error('鐩爣鐜╁涓嶅瓨鍦?)
  if (!attacker?.alive) throw new Error('闃典骸鐜╁鏃犳硶鏀诲嚮')
  if (!defender.alive) throw new Error('鐩爣宸茬粡闃典骸')
  if (targetUid === user.id) throw new Error('涓嶈兘鏀诲嚮鑷繁')
  if ((attacker.map ?? 0) !== (defender.map ?? 0)) throw new Error('鐩爣涓嶅湪鍚屼竴鍦板浘')

  const [rules, buffPool, equippedInstances] = await Promise.all([
    loadGameRules(client),
    loadBuffPool(client),
    fetchEquippedInstances(client, room.id, [user.id, targetUid]),
  ])

  const resolution = createActionResolution({ room, actorId: user.id, gamevars })
  await runTurnStartSettlement(resolution, buffPool)
  await settleCorpseGeneration(resolution)

  const attackerAfterTurn = getResolutionPlayer(resolution, user.id)
  const defenderAfterTurn = getResolutionPlayer(resolution, targetUid)
  if (!attackerAfterTurn?.alive || !defenderAfterTurn?.alive) {
    return persistResolution(client, room, resolution)
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
  appendResolutionLogs(resolution, passiveLogs, 'buff')

  const targetHp = Math.max(0, (target.hp || 0) - damage)
  appendResolutionLog(resolution, `${attacker.name} 鏀诲嚮 ${target.name}锛岄€犳垚 ${damage} 浼ゅ`, 'damage')

  setResolutionPlayer(resolution, user.id, {
    ...attackerAfterTurn,
    hp: me.hp,
    buffs: me.buffs || [],
    passiveCooldowns: me.passiveCooldowns || {},
  })
  setResolutionPlayer(resolution, targetUid, {
    ...defenderAfterTurn,
    hp: targetHp,
    alive: targetHp > 0,
    battle: targetHp > 0 ? defenderAfterTurn.battle || null : null,
    lootPrompt: targetHp > 0 ? defenderAfterTurn.lootPrompt || null : null,
  })

  if (targetHp <= 0) {
    const { attackerUpdated: meAfterKill } = triggerPassives('on_kill', me, null, me._pass || [], buffPool)
    updateResolutionPlayer(resolution, user.id, current => ({
      ...current,
      hp: meAfterKill.hp,
      buffs: meAfterKill.buffs || [],
      passiveCooldowns: meAfterKill.passiveCooldowns || {},
      kills: (attackerAfterTurn.kills || 0) + 1,
      lootPrompt: null,
    }))
    appendResolutionLog(resolution, `${attacker.name} 鍑昏触浜?${target.name}`, 'kill')

    await settleCorpseGeneration(resolution)
    const corpse = (resolution.gamevars.corpses || []).find(
      item => item.type === 'player' && item.ownerPlayerId === targetUid,
    )

    if (corpse) {
      const prompt = await buildLootPrompt(client, room.id, resolution.gamevars, corpse, 'kill')
      if (prompt) {
        resolution.gamevars = setPlayerLootPrompt(resolution.gamevars, user.id, prompt)
        appendResolutionLog(resolution, `${attacker.name} 鍙互浠?${corpse.name} 閲屽甫璧颁竴浠舵垬鍒╁搧`, 'system')
      } else {
        resolution.gamevars = await cleanupCorpseIfEmpty(client, room.id, resolution.gamevars, corpse.id)
      }
    }
  }

  const nextRoom = await persistResolution(client, room, resolution)
  await safeConsumeDurability(user.id, room.id, 1, client)
  return nextRoom
}

async function resolveUseItemAction(client, room, gamevars, user, itemName) {
  const player = getPlayer(gamevars, user.id)
  if (!player?.alive) throw new Error('闃典骸鐜╁鏃犳硶浣跨敤閬撳叿')
  if (!itemName) throw new Error('缂哄皯閬撳叿鍚嶇О')

  const [rules, buffPool, equippedInstances, itemDef] = await Promise.all([
    loadGameRules(client),
    loadBuffPool(client),
    fetchEquippedInstances(client, room.id, [user.id]),
    fetchItemDefByName(client, itemName),
  ])

  if (!itemDef) throw new Error(`鏈煡閬撳叿锛?{itemName}`)

  const me = buildCombatPlayer(player, groupEquipsByOwner(equippedInstances)[user.id] || [])
  const nextPlayer = { ...player, lootPrompt: null }
  const result = calcItemEffect(itemDef, me, rules)
  const resolution = createActionResolution({ room, actorId: user.id, gamevars })

  if (result.hpDelta) {
    nextPlayer.hp = Math.max(0, Math.min(me.maxHp, (player.hp || 0) + result.hpDelta))
    nextPlayer.alive = nextPlayer.hp > 0
    appendResolutionLog(
      resolution,
      `${player.name} 浣跨敤 ${itemName}锛孒P ${result.hpDelta > 0 ? '+' : ''}${result.hpDelta}`,
      result.hpDelta > 0 ? 'heal' : 'damage',
    )
  }

  if (result.atkDelta) {
    nextPlayer.atk = Math.max(0, (nextPlayer.atk || 0) + result.atkDelta)
    appendResolutionLog(resolution, `${player.name} 浣跨敤 ${itemName}锛孉TK +${result.atkDelta}`, 'buff')
  }

  if (result.defDelta) {
    nextPlayer.def = Math.max(0, (nextPlayer.def || 0) + result.defDelta)
    appendResolutionLog(resolution, `${player.name} 浣跨敤 ${itemName}锛孌EF +${result.defDelta}`, 'buff')
  }

  for (const buffId of result.newBuffIds || []) {
    const buffDef = (buffPool || []).find(buff => buff.id === buffId)
    if (!buffDef) continue
    const updated = applyBuff(nextPlayer, buffId, buffDef)
    nextPlayer.buffs = updated.buffs
    appendResolutionLog(resolution, `${player.name} 鑾峰緱浜?${buffDef.name}`, 'buff')
  }

  nextPlayer.inventory = removeInventoryItem(player.inventory, itemName, 1)
  setResolutionPlayer(resolution, user.id, nextPlayer)

  if (nextPlayer.alive === false) {
    appendResolutionLog(resolution, `${player.name} 鍥犱娇鐢?${itemName} 鍊掍笅浜哷, 'death')
    await settleCorpseGeneration(resolution)
  }

  return persistResolution(client, room, resolution)
}

async function searchAreaImpl(client, room, gamevars, user) {
  const player = getPlayer(gamevars, user.id)
  if (!player?.alive) throw new Error('阵亡玩家无法搜索')
  if (player.battle) throw new Error('战斗中无法搜索')

  const [rules, buffPool] = await Promise.all([
    loadGameRules(client),
    loadBuffPool(client),
  ])

  let working = normalizeGamevars(gamevars)
  const turnResult = applyTurnEffects(working, buffPool)
  working = turnResult.gamevars
  let logs = turnResult.logs.map(log => createLogEntry(log, log.includes('损失') ? 'damage' : 'buff'))

  const deathResult = ensureCorpsesForNewDeaths(gamevars, working)
  working = deathResult.gamevars

  const nextPlayer = getPlayer(working, user.id)
  if (!nextPlayer?.alive) {
    logs.push(createLogEntry(`${player.name} 被持续效果击倒了`, 'death'))
    return persistRoom(client, room, working, logs)
  }

  const bundle = await fetchMapBundle(client, nextPlayer.map ?? 0)
  const weather = bundle.mapConfig?.weather || 'clear'
  const { itemChance, npcChance } = getSearchChances(rules, weather)
  const { gamevars: workingWithCorpses, lootable } = await collectLootableCorpses(client, room.id, working, nextPlayer.map ?? 0)
  working = workingWithCorpses

  const corpseChance = lootable.length > 0 ? itemChance * 0.5 : 0
  const looseItemChance = Math.max(0, itemChance - corpseChance)
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
    logs.push(createLogEntry(`${player.name} 遭遇了 ${npc.name}`, 'damage'))
    return persistRoom(client, room, working, logs)
  }

  if (roll < npcChance + corpseChance && lootable.length > 0) {
    const found = lootable[Math.floor(Math.random() * lootable.length)]
    working = setPlayerLootPrompt(working, user.id, found.prompt)
    logs.push(createLogEntry(`${player.name} 发现了 ${found.corpse.name}`, 'system'))
    return persistRoom(client, room, working, logs)
  }

  if (roll < npcChance + corpseChance + looseItemChance && bundle.itemPool.length > 0) {
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
    logs.push(createLogEntry(`${player.name} 找到了 ${found.name}`, 'heal'))
    return persistRoom(client, room, working, logs)
  }

  logs.push(createLogEntry(`${player.name} 搜索了一圈，但没有发现有用的东西`, 'system'))
  return persistRoom(client, room, working, logs)
}

async function attackNpcImpl(client, room, gamevars, user) {
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
  const attackLog = `${player.name} 攻击 ${battle.npc.name}，造成 ${damageOut} 伤害`
  battleLog.push(attackLog)
  logs.push(createLogEntry(attackLog, 'damage'))

  let nextGamevars = normalizeGamevars(gamevars)

  if (npcHp <= 0) {
    const { attackerUpdated: meAfterKill } = triggerPassives('on_kill', me, null, me._pass || [], buffPool)
    nextGamevars.players[user.id] = {
      ...player,
      hp: meAfterKill.hp,
      buffs: meAfterKill.buffs || [],
      passiveCooldowns: meAfterKill.passiveCooldowns || {},
      kills: (player.kills || 0) + 1,
      battle: null,
      lootPrompt: null,
    }

    const corpseResult = await createNpcCorpse(client, nextGamevars, battle.npc, player.map ?? 0)
    nextGamevars = corpseResult.gamevars
    let lootPrompt = null
    if (corpseResult.corpse) {
      lootPrompt = await buildLootPrompt(client, room.id, nextGamevars, corpseResult.corpse, 'kill')
      if (lootPrompt) {
        nextGamevars = setPlayerLootPrompt(nextGamevars, user.id, lootPrompt)
      } else {
        nextGamevars = await cleanupCorpseIfEmpty(client, room.id, nextGamevars, corpseResult.corpse.id)
      }
    }

    logs.push(createLogEntry(`${player.name} 击败了 ${battle.npc.name}`, 'kill'))
    if (lootPrompt) {
      logs.push(createLogEntry(`${player.name} 可以从 ${corpseResult.corpse.name} 里带走一件战利品`, 'system'))
    }
    const nextRoom = await persistRoom(client, room, nextGamevars, logs)
    await safeConsumeDurability(user.id, room.id, 1, client)
    return nextRoom
  }

  const damageIn = calcDamage({ ...battle.npc, hp: npcHp, maxHp: battle.npcMaxHp }, me, rules, '', weather)
  const nextHp = Math.max(0, (me.hp || 0) - damageIn)
  const counterLog = `${battle.npc.name} 反击，造成 ${damageIn} 伤害`
  battleLog.push(counterLog)
  logs.push(createLogEntry(counterLog, 'damage'))

  nextGamevars.players[user.id] = {
    ...player,
    hp: nextHp,
    alive: nextHp > 0,
    buffs: me.buffs || [],
    passiveCooldowns: me.passiveCooldowns || {},
    battle: nextHp > 0 ? { ...battle, npcHp, turn: battle.turn + 1, log: battleLog } : null,
    lootPrompt: nextHp > 0 ? player.lootPrompt || null : null,
  }

  if (nextHp <= 0) {
    logs.push(createLogEntry(`${player.name} 在与 ${battle.npc.name} 的战斗中倒下了`, 'death'))
    nextGamevars = ensureCorpsesForNewDeaths(gamevars, nextGamevars).gamevars
  }

  const nextRoom = await persistRoom(client, room, nextGamevars, logs)
  await safeConsumeDurability(user.id, room.id, 1, client)
  return nextRoom
}

async function fleeNpcImpl(client, room, gamevars, user) {
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
  let nextGamevars = normalizeGamevars(gamevars)

  if (Math.random() < fleeRate) {
    nextGamevars.players[user.id] = { ...player, battle: null }
    return persistRoom(client, room, nextGamevars, [
      createLogEntry(`${player.name} 成功逃离了 ${battle.npc.name}`, 'system'),
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
    lootPrompt: nextHp > 0 ? player.lootPrompt || null : null,
  }

  const logs = [
    createLogEntry(`${player.name} 逃跑失败，被 ${battle.npc.name} 造成 ${damage} 伤害`, 'damage'),
  ]
  if (nextHp <= 0) {
    logs.push(createLogEntry(`${player.name} 倒在了逃跑途中`, 'death'))
    nextGamevars = ensureCorpsesForNewDeaths(gamevars, nextGamevars).gamevars
  }

  return persistRoom(client, room, nextGamevars, logs)
}

async function attackPlayerImpl(client, room, gamevars, user, targetUid) {
  const attacker = getPlayer(gamevars, user.id)
  const defender = getPlayer(gamevars, targetUid)
  if (!defender) throw new Error('目标玩家不存在')
  if (!attacker?.alive) throw new Error('阵亡玩家无法攻击')
  if (!defender.alive) throw new Error('目标已经阵亡')
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

  const afterTurnDeaths = ensureCorpsesForNewDeaths(gamevars, working)
  working = afterTurnDeaths.gamevars

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
    lootPrompt: targetHp > 0 ? defenderAfterTurn.lootPrompt || null : null,
  }

  if (targetHp <= 0) {
    const { attackerUpdated: meAfterKill } = triggerPassives('on_kill', me, null, me._pass || [], buffPool)
    working.players[user.id] = {
      ...working.players[user.id],
      hp: meAfterKill.hp,
      buffs: meAfterKill.buffs || [],
      passiveCooldowns: meAfterKill.passiveCooldowns || {},
      kills: (attackerAfterTurn.kills || 0) + 1,
      lootPrompt: null,
    }
    logs.push(createLogEntry(`${attacker.name} 击败了 ${target.name}`, 'kill'))

    const corpseResult = ensurePlayerCorpse(working, working.players[targetUid])
    working = corpseResult.gamevars
    if (corpseResult.corpse) {
      const prompt = await buildLootPrompt(client, room.id, working, corpseResult.corpse, 'kill')
      if (prompt) {
        working = setPlayerLootPrompt(working, user.id, prompt)
        logs.push(createLogEntry(`${attacker.name} 可以从 ${corpseResult.corpse.name} 里带走一件战利品`, 'system'))
      } else {
        working = await cleanupCorpseIfEmpty(client, room.id, working, corpseResult.corpse.id)
      }
    }
  }

  const nextRoom = await persistRoom(client, room, working, logs)
  await safeConsumeDurability(user.id, room.id, 1, client)
  return nextRoom
}

async function useItemImpl(client, room, gamevars, user, itemName) {
  const player = getPlayer(gamevars, user.id)
  if (!player?.alive) throw new Error('阵亡玩家无法使用道具')
  if (!itemName) throw new Error('缺少道具名称')

  const [rules, buffPool, equippedInstances, itemDef] = await Promise.all([
    loadGameRules(client),
    loadBuffPool(client),
    fetchEquippedInstances(client, room.id, [user.id]),
    fetchItemDefByName(client, itemName),
  ])

  if (!itemDef) throw new Error(`未知道具：${itemName}`)

  const me = buildCombatPlayer(player, groupEquipsByOwner(equippedInstances)[user.id] || [])
  const nextPlayer = { ...player, lootPrompt: null }
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

  let nextGamevars = normalizeGamevars(gamevars)
  nextGamevars.players[user.id] = nextPlayer
  if (nextPlayer.alive === false) {
    logs.push(createLogEntry(`${player.name} 因使用 ${itemName} 倒下了`, 'death'))
    nextGamevars = ensureCorpsesForNewDeaths(gamevars, nextGamevars).gamevars
  }
  return persistRoom(client, room, nextGamevars, logs)
}

async function dismissLootPrompt(client, room, gamevars, user) {
  const player = getPlayer(gamevars, user.id)
  if (!player) throw new Error('你还未加入该房间')
  if (!player.lootPrompt) return room

  const nextGamevars = clearPlayerLootPrompt(normalizeGamevars(gamevars), user.id)
  return persistRoom(client, room, nextGamevars, [])
}

async function lootCorpse(client, room, gamevars, user, corpseId, entryId) {
  const player = getPlayer(gamevars, user.id)
  if (!player?.alive) throw new Error('阵亡玩家无法拾取战利品')
  if (!corpseId || !entryId) throw new Error('缺少尸体或战利品信息')

  let working = clearPlayerLootPrompt(normalizeGamevars(gamevars), user.id)
  const corpse = getCorpseById(working, corpseId)
  if (!corpse) throw new Error('这具尸体已经不存在了')
  if ((player.map ?? 0) !== (corpse.mapId ?? 0)) throw new Error('尸体不在当前地图')

  const options = await buildCorpseLootOptions(client, room.id, working, corpse)
  const selected = options.find(option => option.id === entryId)
  if (!selected) throw new Error('这件战利品已经被别人拿走了')

  let sideEffect = null
  try {
    if (selected.type === 'item') {
      const nextPlayer = {
        ...getPlayer(working, user.id),
        inventory: [...(getPlayer(working, user.id)?.inventory || []), selected.itemName || selected.name],
      }
      working.players[user.id] = nextPlayer

      if (corpse.type === 'npc') {
        working = replaceCorpse(working, corpse.id, current => ({
          ...current,
          entries: (current.entries || []).filter(entry => entry.id !== selected.id),
        }))
      } else {
        const owner = getPlayer(working, corpse.ownerPlayerId)
        if (!owner) throw new Error('尸体主人不存在')
        working.players[corpse.ownerPlayerId] = {
          ...owner,
          inventory: removeInventoryItem(owner.inventory, selected.itemName || selected.name, 1),
        }
      }
    } else {
      sideEffect = await createLootSideEffect(client, room.id, user.id, corpse, selected)

      if (corpse.type === 'npc') {
        working = replaceCorpse(working, corpse.id, current => ({
          ...current,
          entries: (current.entries || []).filter(entry => entry.id !== selected.id),
        }))
      }
    }

    working = await cleanupCorpseIfEmpty(client, room.id, working, corpse.id)

    const logs = [
      createLogEntry(`${player.name} 从 ${corpse.name} 里带走了 ${selected.name}`, selected.type === 'item' ? 'heal' : 'system'),
    ]
    if (!getCorpseById(working, corpse.id)) {
      logs.push(createLogEntry(`${corpse.name} 已经被搜空了`, 'system'))
    }

    const nextRoom = await persistRoom(client, room, working, logs)
    return nextRoom
  } catch (error) {
    await rollbackLootSideEffect(client, sideEffect)
    throw error
  }
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
  if (!['join', 'lootCorpse', 'dismissLootPrompt'].includes(payload.action) && me?.lootPrompt) {
    throw new Error('请先处理当前战利品')
  }

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

  if (payload.action === 'lootCorpse') {
    return lootCorpse(client, room, gamevars, user, payload.corpseId, payload.entryId)
  }

  if (payload.action === 'dismissLootPrompt') {
    return dismissLootPrompt(client, room, gamevars, user)
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
  return resolveSearchAction(client, room, gamevars, user)
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
  return resolveNpcAttackAction(client, room, gamevars, user)
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
  return resolveNpcFleeAction(client, room, gamevars, user)
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
  return resolvePlayerAttackAction(client, room, gamevars, user, targetUid)
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
  return resolveUseItemAction(client, room, gamevars, user, itemName)
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
