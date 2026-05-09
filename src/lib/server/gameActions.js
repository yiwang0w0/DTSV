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
  executeCraft,
  rollbackCraftSideEffects,
  triggerPassives,
} from '@/lib/equipmentEngine'
import { consumeDurabilityParallel } from '@/lib/server/equipmentDurability'
import { consumeForLoadout, addItemsToStash } from '@/lib/server/stash'
import { updateContractProgress } from '@/lib/server/contracts'
import { processEventTrigger } from '@/lib/server/events'
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
    await consumeDurabilityParallel(ownerId, roomId, amount, client)
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

async function fetchMapWeather(client, mapId) {
  const { data } = await client.from('map_config').select('weather').eq('map_id', mapId).maybeSingle()
  return data?.weather || 'clear'
}

async function fetchMapExtractionPoints(client, mapId) {
  const { data } = await client.from('map_config').select('extraction_points').eq('map_id', mapId).maybeSingle()
  return Array.isArray(data?.extraction_points) ? data.extraction_points : []
}

// ── 全局道具/NPC 池缓存（只缓存全量数据，按地图过滤在内存中做） ──
let _allItemsCache = null
let _allNpcsCache = null
const _weatherCache = new Map()
const POOL_CACHE_TTL = 5 * 60 * 1000 // 5 分钟
let _poolCacheTs = 0

async function fetchSearchMapBundle(client, mapId) {
  const now = Date.now()
  const stale = now - _poolCacheTs > POOL_CACHE_TTL

  if (stale || !_allItemsCache || !_allNpcsCache) {
    const [itemRes, npcRes] = await Promise.all([
      client.from('item_pool').select('*'),
      client.from('npc_pool').select('*'),
    ])
    if (itemRes.error) console.error('[fetchSearchMapBundle] item_pool 查询失败:', itemRes.error.message)
    if (npcRes.error) console.error('[fetchSearchMapBundle] npc_pool 查询失败:', npcRes.error.message)
    _allItemsCache = itemRes.data || []
    _allNpcsCache = npcRes.data || []
    _poolCacheTs = now
  }

  // 天气单独查（可能不同地图不同天气）
  let weather = 'clear'
  const cachedW = _weatherCache.get(mapId)
  if (cachedW && now - cachedW.ts < POOL_CACHE_TTL) {
    weather = cachedW.val
  } else {
    const { data: mapConfig } = await client
      .from('map_config').select('weather').eq('map_id', mapId).maybeSingle()
    weather = mapConfig?.weather || 'clear'
    _weatherCache.set(mapId, { val: weather, ts: now })
  }

  // 在内存中按地图过滤（避免 Supabase .contains() 可能的兼容问题）
  const itemPool = _allItemsCache.filter(i => Array.isArray(i.maps) && i.maps.includes(mapId))
  const npcPool = _allNpcsCache.filter(n => Array.isArray(n.maps) && n.maps.includes(mapId))

  return { weather, itemPool, npcPool }
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

// 搜索专用：异步持久化版本，立即返回计算结果
async function persistResolutionAsync(client, room, resolution) {
  const settled = finalizeResolution(resolution)
  return persistRoom(client, room, settled.gamevars, settled.logs, { async: true })
}

async function persistRoom(client, room, gamevars, logs = [], options = {}) {
  const withLogs = logs.length ? appendGameLog(gamevars, logs) : normalizeGamevars(gamevars)
  const { gamevars: nextGamevars, roomPatch } = applyRoomLifecycle(room, withLogs, options)

  const currentVersion = room.version ?? 0

  // ── 异步模式：先构造预期结果立刻返回，DB 写入放后台 ──
  if (options.async) {
    const optimistic = {
      ...room,
      ...roomPatch,
      gamevars: nextGamevars,
      version: currentVersion + 1,
    }
    // 后台写入，失败仅 log（客户端 realtime 订阅会最终一致）
    client
      .from('rooms')
      .update({ ...roomPatch, gamevars: nextGamevars, version: currentVersion + 1 })
      .eq('id', room.id)
      .eq('version', currentVersion)
      .then(({ error }) => {
        if (error) console.error('[async persist] 写入失败:', error.message)
      })
    return optimistic
  }

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

function resolveNpcDropEntry(name, tier) {
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

async function fetchNpcDropTierMap(client, names) {
  const uniqueNames = [...new Set((names || []).filter(Boolean))]
  if (!uniqueNames.length) return {}

  const { data } = await client
    .from('equipment_tiers')
    .select('id, name, rarity, series:equipment_series(slot,name), durability_max')
    .in('name', uniqueNames)

  return (data || []).reduce((acc, tier) => {
    acc[tier.name] = tier
    return acc
  }, {})
}

async function createNpcCorpse(client, gamevars, npc, mapId) {
  const tierMap = await fetchNpcDropTierMap(client, npc.drop_items || [])
  const entries = (npc.drop_items || [])
    .map(name => resolveNpcDropEntry(name, tierMap[name]))
    .filter(Boolean)

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

async function fetchOwnerEquipmentInstances(client, roomId, ownerIds) {
  if (!ownerIds.length) return []

  const { data } = await client
    .from('equipment_instances')
    .select('*, tier:equipment_tiers(*, passive:passive_skills(*), series:equipment_series(slot,name))')
    .eq('room_id', roomId)
    .in('owner_id', ownerIds)
    .order('owner_id', { ascending: true })
    .order('is_equipped', { ascending: false })
    .order('acquired_at', { ascending: true })

  return data || []
}

async function fetchCorpseEquipmentMap(client, roomId, corpses) {
  const ownerIds = [...new Set(
    (corpses || [])
      .filter(corpse => corpse?.type === 'player' && corpse.ownerPlayerId)
      .map(corpse => corpse.ownerPlayerId),
  )]

  if (!ownerIds.length) return {}

  return groupEquipsByOwner(await fetchOwnerEquipmentInstances(client, roomId, ownerIds))
}

function buildCorpseLootOptions(gamevars, corpse, ownerEquipmentMap = {}) {
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

  const equipmentOptions = (ownerEquipmentMap[corpse.ownerPlayerId] || [])
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

function buildLootPrompt(gamevars, corpse, source, ownerEquipmentMap = {}) {
  const options = buildCorpseLootOptions(gamevars, corpse, ownerEquipmentMap)
  if (!options.length) return null

  return {
    corpseId: corpse.id,
    corpseName: corpse.name,
    source,
    options,
  }
}

function cleanupCorpseIfEmpty(gamevars, corpseId, ownerEquipmentMap = {}) {
  const normalized = normalizeGamevars(gamevars)
  const corpse = (normalized.corpses || []).find(item => item.id === corpseId)
  if (!corpse) return normalized

  const options = buildCorpseLootOptions(normalized, corpse, ownerEquipmentMap)
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
  const corpses = getCurrentMapCorpses(working, mapId)
  // 地图上没尸体时跳过 DB 查询
  if (!corpses.length) return { gamevars: working, lootable }
  const corpseEquipmentMap = await fetchCorpseEquipmentMap(client, roomId, corpses)

  for (const corpse of corpses) {
    const prompt = buildLootPrompt(working, corpse, 'search', corpseEquipmentMap)
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
  if (!player?.alive) throw new Error('阵亡玩家无法搜索')
  if (player.battle) throw new Error('战斗中无法搜索')

  // ── 并行：规则/Buff缓存 + 地图数据 + 尸体数据 一次性全拉 ──
  const mapId = player.map ?? 0
  const [rules, buffPool, bundle, corpseResult] = await Promise.all([
    loadGameRules(client),
    loadBuffPool(client),
    fetchSearchMapBundle(client, mapId),
    collectLootableCorpses(client, room.id, gamevars, mapId),
  ])

  // ── 回合结算（纯内存计算，无 IO） ──
  const resolution = createActionResolution({ room, actorId: user.id, gamevars: corpseResult.gamevars })
  await runTurnStartSettlement(resolution, buffPool)
  await settleCorpseGeneration(resolution)

  const nextPlayer = getResolutionPlayer(resolution, user.id)
  if (!nextPlayer?.alive) {
    appendResolutionLog(resolution, `${player.name} 被持续效果击倒了`, 'death')
    return persistResolutionAsync(client, room, resolution)
  }

  const lootable = corpseResult.lootable
  const { itemChance, npcChance } = getSearchChances(rules, bundle.weather)

  const corpseChance = lootable.length > 0 ? itemChance * 0.5 : 0
  const looseItemChance = Math.max(0, itemChance - corpseChance)
  const roll = Math.random()

  appendResolutionLog(resolution, `${player.name} 开始搜索区域`, 'system')

  // ── 事件系统：on_search 钩子 ──
  // 事件可在正常搜索结果前抢占（给物品 / 扣血 / 触发战斗 / 设置 flag 等）
  try {
    await processEventTrigger(client, resolution, user.id, 'on_search', { mapId })
  } catch (e) {
    console.error('[searchArea] event trigger 失败:', e?.message)
  }
  const afterEvent = getResolutionPlayer(resolution, user.id)
  if (!afterEvent?.alive) {
    return persistResolutionAsync(client, room, resolution)
  }
  if (afterEvent.battle) {
    // 事件已让玩家进入战斗，跳过常规搜索
    return persistResolutionAsync(client, room, resolution)
  }

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
    appendResolutionLog(resolution, `${player.name} 遭遇了 ${npc.name}`, 'damage')
    return persistResolutionAsync(client, room, resolution)
  }

  if (roll < npcChance + corpseChance && lootable.length > 0) {
    const found = lootable[Math.floor(Math.random() * lootable.length)]
    resolution.gamevars = setPlayerLootPrompt(resolution.gamevars, user.id, found.prompt)
    appendResolutionLog(resolution, `${player.name} 发现了 ${found.corpse.name}`, 'system')
    return persistResolutionAsync(client, room, resolution)
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
    appendResolutionLog(resolution, `${player.name} 找到了 ${found.name}`, 'heal')
    const persisted = await persistResolutionAsync(client, room, resolution)
    try {
      await updateContractProgress(client, user.id, { type: 'item_acquired', itemName: found.name })
    } catch (e) {
      console.error('[searchArea] contract progress 失败:', e?.message)
    }
    return persisted
  }

  appendResolutionLog(resolution, `${player.name} 搜索了一圈，但没有发现有用的东西`, 'system')
  return persistResolutionAsync(client, room, resolution)
}

async function resolveNpcAttackAction(client, room, gamevars, user) {
  const player = getPlayer(gamevars, user.id)
  const battle = player?.battle
  if (!battle?.npc) throw new Error('当前没有 NPC 战斗')

  const [rules, buffPool, equippedInstances, weather] = await Promise.all([
    loadGameRules(client),
    loadBuffPool(client),
    fetchEquippedInstances(client, room.id, [user.id]),
    fetchMapWeather(client, player.map ?? 0),
  ])

  const equipMap = groupEquipsByOwner(equippedInstances)
  const myEquips = equipMap[user.id] || []
  let me = buildCombatPlayer(player, myEquips)
  const battleLog = [...(battle.log || [])]
  const weapon = myEquips.find(instance => instance.tier?.series?.slot === 'weapon')
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
  const attackLog = `${player.name} 攻击 ${battle.npc.name}，造成 ${damageOut} 伤害`
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
      lootPrompt = buildLootPrompt(resolution.gamevars, corpseResult.corpse, 'kill')
      if (lootPrompt) {
        resolution.gamevars = setPlayerLootPrompt(resolution.gamevars, user.id, lootPrompt)
      } else {
        resolution.gamevars = cleanupCorpseIfEmpty(resolution.gamevars, corpseResult.corpse.id)
      }
    }

    appendResolutionLog(resolution, `${player.name} 击败了 ${battle.npc.name}`, 'kill')
    if (lootPrompt) {
      appendResolutionLog(resolution, `${player.name} 可以从 ${corpseResult.corpse.name} 里带走一件战利品`, 'system')
    }

    // 标记 BOSS 击败（用于 PVE / 单人模式结束判定）
    if (battle.npc.level === 'boss') {
      resolution.gamevars = { ...resolution.gamevars, bossDefeated: true }
      appendResolutionLog(resolution, `🏆 BOSS ${battle.npc.name} 已被击败！`, 'kill')
    }

    // on_kill_npc 事件先在 resolution 上应用（这样事件影响也会被一起持久化）
    try {
      await processEventTrigger(client, resolution, user.id, 'on_kill_npc', { npcName: battle.npc.name })
    } catch (e) {
      console.error('[attackNpc] event trigger 失败:', e?.message)
    }
    const nextRoom = await persistResolution(client, room, resolution)
    await safeConsumeDurability(user.id, room.id, 1, client)
    try {
      await updateContractProgress(client, user.id, { type: 'npc_killed', npcName: battle.npc.name })
    } catch (e) {
      console.error('[attackNpc] contract progress 失败:', e?.message)
    }
    return nextRoom
  }

  const damageIn = calcDamage({ ...battle.npc, hp: npcHp, maxHp: battle.npcMaxHp }, me, rules, '', weather)
  const nextHp = Math.max(0, (me.hp || 0) - damageIn)
  const counterLog = `${battle.npc.name} 反击，造成 ${damageIn} 伤害`
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
    appendResolutionLog(resolution, `${player.name} 在与 ${battle.npc.name} 的战斗中倒下了`, 'death')
    await settleCorpseGeneration(resolution)
  }

  const nextRoom = await persistResolution(client, room, resolution)
  await safeConsumeDurability(user.id, room.id, 1, client)
  return nextRoom
}

async function resolveNpcFleeAction(client, room, gamevars, user) {
  const player = getPlayer(gamevars, user.id)
  const battle = player?.battle
  if (!battle?.npc) throw new Error('当前没有 NPC 战斗')

  const [rules, equippedInstances, weather] = await Promise.all([
    loadGameRules(client),
    fetchEquippedInstances(client, room.id, [user.id]),
    fetchMapWeather(client, player.map ?? 0),
  ])

  const myEquips = groupEquipsByOwner(equippedInstances)[user.id] || []
  const me = buildCombatPlayer(player, myEquips)
  const fleeRate = getRule(rules, 'flee_success_rate', 0.6)
  const resolution = createActionResolution({ room, actorId: user.id, gamevars })

  if (Math.random() < fleeRate) {
    setResolutionPlayer(resolution, user.id, { ...player, battle: null })
    appendResolutionLog(resolution, `${player.name} 成功逃离了 ${battle.npc.name}`, 'system')
    return persistResolution(client, room, resolution)
  }

  const damage = calcDamage({ ...battle.npc, hp: battle.npcHp, maxHp: battle.npcMaxHp }, me, rules, '', weather)
  const nextHp = Math.max(0, (me.hp || 0) - damage)
  setResolutionPlayer(resolution, user.id, {
    ...player,
    hp: nextHp,
    alive: nextHp > 0,
    battle: nextHp > 0 ? battle : null,
    lootPrompt: nextHp > 0 ? player.lootPrompt || null : null,
  })

  appendResolutionLog(resolution, `${player.name} 逃跑失败，被 ${battle.npc.name} 造成 ${damage} 伤害`, 'damage')
  if (nextHp <= 0) {
    appendResolutionLog(resolution, `${player.name} 倒在了逃跑途中`, 'death')
    await settleCorpseGeneration(resolution)
  }

  return persistResolution(client, room, resolution)
}

async function resolvePlayerAttackAction(client, room, gamevars, user, targetUid) {
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
  const weather = await fetchMapWeather(client, attackerAfterTurn.map ?? 0)

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
  appendResolutionLog(resolution, `${attacker.name} 攻击 ${target.name}，造成 ${damage} 伤害`, 'damage')

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
    appendResolutionLog(resolution, `${attacker.name} 击败了 ${target.name}`, 'kill')

    await settleCorpseGeneration(resolution)
    const corpse = (resolution.gamevars.corpses || []).find(
      item => item.type === 'player' && item.ownerPlayerId === targetUid,
    )

    if (corpse) {
      const corpseEquipmentMap = await fetchCorpseEquipmentMap(client, room.id, [corpse])
      const prompt = buildLootPrompt(resolution.gamevars, corpse, 'kill', corpseEquipmentMap)
      if (prompt) {
        resolution.gamevars = setPlayerLootPrompt(resolution.gamevars, user.id, prompt)
        appendResolutionLog(resolution, `${attacker.name} 可以从 ${corpse.name} 里带走一件战利品`, 'system')
      } else {
        resolution.gamevars = cleanupCorpseIfEmpty(resolution.gamevars, corpse.id, corpseEquipmentMap)
      }
    }
  }

  const nextRoom = await persistResolution(client, room, resolution)
  await safeConsumeDurability(user.id, room.id, 1, client)
  return nextRoom
}

async function resolveUseItemAction(client, room, gamevars, user, itemName) {
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
  const resolution = createActionResolution({ room, actorId: user.id, gamevars })

  if (result.hpDelta) {
    nextPlayer.hp = Math.max(0, Math.min(me.maxHp, (player.hp || 0) + result.hpDelta))
    nextPlayer.alive = nextPlayer.hp > 0
    appendResolutionLog(
      resolution,
      `${player.name} 使用 ${itemName}，HP ${result.hpDelta > 0 ? '+' : ''}${result.hpDelta}`,
      result.hpDelta > 0 ? 'heal' : 'damage',
    )
  }

  if (result.atkDelta) {
    nextPlayer.atk = Math.max(0, (nextPlayer.atk || 0) + result.atkDelta)
    appendResolutionLog(resolution, `${player.name} 使用 ${itemName}，ATK +${result.atkDelta}`, 'buff')
  }

  if (result.defDelta) {
    nextPlayer.def = Math.max(0, (nextPlayer.def || 0) + result.defDelta)
    appendResolutionLog(resolution, `${player.name} 使用 ${itemName}，DEF +${result.defDelta}`, 'buff')
  }

  for (const buffId of result.newBuffIds || []) {
    const buffDef = (buffPool || []).find(buff => buff.id === buffId)
    if (!buffDef) continue
    const updated = applyBuff(nextPlayer, buffId, buffDef)
    nextPlayer.buffs = updated.buffs
    appendResolutionLog(resolution, `${player.name} 获得了 ${buffDef.name}`, 'buff')
  }

  nextPlayer.inventory = removeInventoryItem(player.inventory, itemName, 1)
  setResolutionPlayer(resolution, user.id, nextPlayer)

  if (nextPlayer.alive === false) {
    appendResolutionLog(resolution, `${player.name} 因使用 ${itemName} 倒下了`, 'death')
    await settleCorpseGeneration(resolution)
  }

  return persistResolution(client, room, resolution)
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

  const corpseEquipmentMap = await fetchCorpseEquipmentMap(client, room.id, [corpse])
  const options = buildCorpseLootOptions(working, corpse, corpseEquipmentMap)
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

    const updatedCorpseEquipmentMap = corpse.type === 'player'
      ? await fetchCorpseEquipmentMap(client, room.id, [corpse])
      : corpseEquipmentMap
    working = cleanupCorpseIfEmpty(working, corpse.id, updatedCorpseEquipmentMap)

    const logs = [
      createLogEntry(`${player.name} 从 ${corpse.name} 里带走了 ${selected.name}`, selected.type === 'item' ? 'heal' : 'system'),
    ]
    if (!getCorpseById(working, corpse.id)) {
      logs.push(createLogEntry(`${corpse.name} 已经被搜空了`, 'system'))
    }

    const nextRoom = await persistRoom(client, room, working, logs)
    // 合同进度：拾取的是普通道具时推进 find_item 目标
    if (selected.type === 'item' && selected.name) {
      try {
        await updateContractProgress(client, user.id, { type: 'item_acquired', itemName: selected.name })
      } catch (e) {
        console.error('[lootCorpse] contract progress 失败:', e?.message)
      }
    }
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

export async function joinRoom(client, user, roomId, loadout = null) {
  const room = await fetchRoom(client, roomId)
  if (room.gamestate === 2) {
    throw new Error('已结束房间不可加入')
  }

  const gamevars = normalizeGamevars(room.gamevars)
  if (getPlayer(gamevars, user.id)) {
    return room
  }

  const rules = await loadGameRules(client)

  // ── 装载（搜打撤）：从账户库扣除选中的道具与装备 ──
  let initialInventory = []
  if (loadout) {
    const items = Array.isArray(loadout.items) ? loadout.items : []
    const equipmentInstanceIds = Array.isArray(loadout.equipmentInstanceIds) ? loadout.equipmentInstanceIds : []
    if (items.length > 0 || equipmentInstanceIds.length > 0) {
      const result = await consumeForLoadout(client, user.id, roomId, { items, equipmentInstanceIds })
      initialInventory = result.inventory
    }
  }

  const player = createPlayerState(user, getInitPlayerStats(rules))
  if (initialInventory.length > 0) {
    player.inventory = initialInventory
  }
  const nextGamevars = {
    ...gamevars,
    players: {
      ...gamevars.players,
      [user.id]: player,
    },
  }

  const loadoutNote = initialInventory.length > 0 ? `（装载 ${initialInventory.length} 件物资）` : ''
  const nextRoom = await persistRoom(client, room, nextGamevars, [
    createLogEntry(`${player.name} 加入了游戏${loadoutNote}`, 'system'),
  ], { startGame: true })

  await client.from('profiles').update({ roomid: roomId }).eq('id', user.id)
  return nextRoom
}

export async function executeGameAction(client, user, payload, options = {}) {
  const roomId = Number(payload.roomId)
  if (!roomId) {
    throw new Error('缺少房间 ID')
  }

  // 支持外部预取的房间数据，跳过重复查询
  const room = options.prefetchedRoom || await fetchRoom(client, roomId)
  const gamevars = normalizeGamevars(room.gamevars)
  const me = getPlayer(gamevars, user.id)
  if (!['join', 'lootCorpse', 'dismissLootPrompt'].includes(payload.action) && me?.lootPrompt) {
    throw new Error('请先处理当前战利品')
  }

  if (payload.action !== 'join' && !me) {
    throw new Error('你还未加入该房间')
  }

  if (payload.action === 'join') {
    return joinRoom(client, user, roomId, payload.loadout || null)
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

  if (payload.action === 'extract') {
    return extractPlayer(client, room, gamevars, user, payload)
  }

  if (payload.action === 'useItem') {
    return performItemUse(client, room, gamevars, user, payload.itemName)
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

  const resolution = createActionResolution({ room, actorId: user.id, gamevars })
  setResolutionPlayer(resolution, user.id, { ...player, map: mapId })
  appendResolutionLog(resolution, `${player.name} 转移至【${mapName}】`, 'system')

  // on_enter_map 事件钩子
  try {
    await processEventTrigger(client, resolution, user.id, 'on_enter_map', { mapId })
  } catch (e) {
    console.error('[movePlayer] event trigger 失败:', e?.message)
  }

  return persistResolution(client, room, resolution)
}

async function searchArea(client, room, gamevars, user) {
  return resolveSearchAction(client, room, gamevars, user)
}

async function attackNpc(client, room, gamevars, user) {
  return resolveNpcAttackAction(client, room, gamevars, user)
}

async function fleeNpc(client, room, gamevars, user) {
  return resolveNpcFleeAction(client, room, gamevars, user)
}

async function attackPlayer(client, room, gamevars, user, targetUid) {
  return resolvePlayerAttackAction(client, room, gamevars, user, targetUid)
}

// ── 撤离：把背包道具与装备转入账户库，标记玩家 extracted ──
async function extractPlayer(client, room, gamevars, user, payload) {
  const player = getPlayer(gamevars, user.id)
  if (!player) throw new Error('你还未加入该房间')
  if (!player.alive) throw new Error('阵亡玩家无法撤离')
  if (player.extracted) throw new Error('已经撤离')
  if (player.battle) throw new Error('战斗中无法撤离')

  const playerMapId = player.map ?? 0
  const points = await fetchMapExtractionPoints(client, playerMapId)
  if (!points || points.length === 0) {
    throw new Error('当前地图没有撤离点')
  }

  const extractionPointId = payload?.extractionPointId
  if (!extractionPointId) throw new Error('缺少撤离点 ID')
  const point = points.find(p => p.id === extractionPointId)
  if (!point) throw new Error('撤离点不存在')

  // ── 时间窗校验 ──
  const startedAtRaw = room.started_at || room.created_at
  if (!startedAtRaw) throw new Error('房间尚未开始')
  const startedAt = new Date(startedAtRaw).getTime()
  if (Number.isNaN(startedAt)) throw new Error('房间起始时间无效')

  const elapsed = (Date.now() - startedAt) / 1000  // seconds
  const openAt = Number(point.openAt) || 0
  const closeAt = point.closeAt === null || point.closeAt === undefined || point.closeAt === ''
    ? Infinity
    : Number(point.closeAt)
  if (elapsed < openAt) {
    throw new Error(`撤离点未开放（还需 ${Math.ceil(openAt - elapsed)} 秒）`)
  }
  if (elapsed > closeAt) {
    throw new Error('撤离点已关闭')
  }

  // ── 物品要求 ──
  let inventoryAfter = [...(player.inventory || [])]
  if (point.requiredItem) {
    const idx = inventoryAfter.indexOf(point.requiredItem)
    if (idx === -1) throw new Error(`需要持有：${point.requiredItem}`)
    if (point.consumeItem) inventoryAfter.splice(idx, 1)
  }

  // ── 转移背包道具到账户库 ──
  const itemCounts = inventoryAfter.reduce((acc, name) => {
    acc.set(name, (acc.get(name) || 0) + 1)
    return acc
  }, new Map())
  const stashAdditions = Array.from(itemCounts, ([name, quantity]) => ({ name, quantity }))
  if (stashAdditions.length > 0) {
    // 撤离时允许超容量（玩家死战归来，不应被库满拒收）
    await addItemsToStash(client, user.id, stashAdditions, { allowOverflow: true })
  }

  // ── 装备实例：room_id := NULL 等价于"放回库" ──
  await client.from('equipment_instances')
    .update({ room_id: null, is_equipped: false, equipped_slot: null })
    .eq('owner_id', user.id)
    .eq('room_id', room.id)

  // ── 更新玩家状态 ──
  const resolution = createActionResolution({ room, actorId: user.id, gamevars })
  setResolutionPlayer(resolution, user.id, {
    ...player,
    inventory: [],
    extracted: true,
    extractedAt: new Date().toISOString(),
    extractionPoint: point.id,
    alive: true,    // 撤离不算死亡
    lootPrompt: null,
  })

  const note = stashAdditions.length > 0
    ? `${player.name} 从【${point.name}】成功撤离（带回 ${stashAdditions.reduce((s, it) => s + it.quantity, 0)} 件物资）`
    : `${player.name} 从【${point.name}】成功撤离`
  appendResolutionLog(resolution, note, 'system')

  // 玩家不再属于该房间
  await client.from('profiles').update({ roomid: null }).eq('id', user.id)

  const nextRoom = await persistResolution(client, room, resolution)

  // 合同进度：撤离推进 extract / extract_at
  try {
    await updateContractProgress(client, user.id, {
      type: 'extracted',
      extractionPointId: point.id,
    })
  } catch (e) {
    console.error('[extractPlayer] contract progress 失败:', e?.message)
  }

  return nextRoom
}

async function performItemUse(client, room, gamevars, user, itemName) {
  return resolveUseItemAction(client, room, gamevars, user, itemName)
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
