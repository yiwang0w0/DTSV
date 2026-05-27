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
import { convertExtractToPoints, creditPoints, classPtForExtract, getBalances, POINT_LABEL } from '@/lib/server/points'
import { purchaseFromCatalog } from '@/lib/server/shop'
import { commitClassChoice, applyClassToPlayer } from '@/lib/server/classes'
import { resolvePortraitUrl } from '@/lib/server/portraits'
import { updateContractProgress } from '@/lib/server/contracts'
import { discoverFragment } from '@/lib/server/fragments'
import { logPlayerDeath } from '@/lib/server/deathLog'
import { generateRaidPath, mergeUnlocksRules } from '@/lib/server/pathGenerator'
import { leaveProbe, tryEncounterProbe, defeatProbe, recordProbeOutcome } from '@/lib/server/probes'
import { processEventTrigger } from '@/lib/server/events'
import {
  evaluateBranchNodes,
  setVisitedMapFlag,
  setKilledNpcFlag,
} from '@/lib/server/branches'
import { applyEndingIfTriggered } from '@/lib/server/endings'
import {
  applySearchPollution,
  applyCombatPollution,
  applyInteractPollution,
  applyPvpPollution,
  applyEmergencyRetreatPollution,
  applyRetreatDecay,
  calcEffectivePollution,
  applyPollutionSearchModifier,
  applyPollutionCombatModifier,
  tickEnvPollution,
  tickOmegaCountdown,
  recomputeFlags,
  getLoadoutEffects,
} from '@/lib/pollution'
import { POLLUTION_CONFIG, LOADOUT_SLOTS } from '@/lib/constants'
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
  normalizeNpcInstance,
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
    throw new Error('对局不存在')
  }
  return data
}

// ── Phase 19.5: 从 gamevars.raidPath 取 chamber 数据（替代 map_config 表查询） ──

/** 取玩家当前所在 chamber（基于 player.chamberIndex 在 raidPath 中索引） */
function getChamberForPlayer(gamevars, player) {
  const path = Array.isArray(gamevars?.raidPath) ? gamevars.raidPath : []
  const idx = player?.chamberIndex ?? 0
  return path[idx] || null
}

/** 兼容旧 fetchMapConfig 调用 — 把 chamber 对象伪装成 map_config 形状 */
function getChamberAsMapConfig(gamevars, player) {
  const ch = getChamberForPlayer(gamevars, player)
  if (!ch) return null
  return {
    map_id:          ch.templateId,          // 把 templateId 当 mapId
    name:            ch.name,
    description:     ch.description,
    pollution_base:  ch.pollutionBase,
    pollution_accel: ch.pollutionAccel,
    adjacent_maps:   [],                     // Phase 19 无邻接概念（路径线性）
    is_exit:         ch.isExit,
    exit_cost:       ch.exitCost,
    omega_window:    ch.omegaWindow,
    max_items:       ch.maxItems,
    max_npcs:        ch.maxNpcs,
    // chamber 特有字段
    _chamber:        ch,
  }
}

/** Phase 19.5: 从 gamevars.raidPath 构建 chamber accel 表（key = chamberIndex） */
function buildChamberAccelTable(gamevars) {
  const table = new Map()
  const path = Array.isArray(gamevars?.raidPath) ? gamevars.raidPath : []
  for (const ch of path) {
    table.set(ch.templateId, Number(ch.pollutionAccel) || 0)
  }
  return table
}

// ── 全局道具/NPC 池缓存（按 chamber_template_ids 过滤） ──
let _allItemsCache = null
let _allNpcsCache = null
const POOL_CACHE_TTL = 5 * 60 * 1000 // 5 分钟
let _poolCacheTs = 0

/** Phase 19.5: 按 chamber.templateId 过滤 item/npc 池（替代旧 fetchSearchMapBundle）
 *  Phase 20.2: 应用 unlocks_rules.item_amount_delta（搜索权重加成）+ npc_unlock（NPC 解锁池） */
async function fetchSearchChamberBundle(client, gamevars, player) {
  const now = Date.now()
  const stale = now - _poolCacheTs > POOL_CACHE_TTL

  if (stale || !_allItemsCache || !_allNpcsCache) {
    const [itemRes, npcRes] = await Promise.all([
      client.from('item_pool').select('*'),
      client.from('npc_pool').select('*'),
    ])
    if (itemRes.error) console.error('[fetchSearchChamberBundle] item_pool 查询失败:', itemRes.error.message)
    if (npcRes.error) console.error('[fetchSearchChamberBundle] npc_pool 查询失败:', npcRes.error.message)
    _allItemsCache = itemRes.data || []
    _allNpcsCache = npcRes.data || []
    _poolCacheTs = now
  }

  const chamber = getChamberForPlayer(gamevars, player)
  const tid = chamber?.templateId ?? -1

  // Phase 19.2 已迁移：按 chamber_template_ids 过滤
  let itemPool = _allItemsCache.filter(i => Array.isArray(i.chamber_template_ids) && i.chamber_template_ids.includes(tid))
  let npcPool = _allNpcsCache.filter(n => Array.isArray(n.chamber_template_ids) && n.chamber_template_ids.includes(tid))

  // Phase 20.2: 应用残片解锁的修正
  const merged = gamevars?.unlocksMerged
  if (merged && typeof merged === 'object') {
    // item_amount_delta — 按物品名加权重（不改 DB 字段，仅本次抽取）
    const iad = merged.itemAmountDelta || {}
    if (Object.keys(iad).length > 0) {
      itemPool = itemPool.map(i => {
        const delta = Number(iad[i.name]) || 0
        if (delta === 0) return i
        return { ...i, amount: Math.max(1, (i.amount || 1) + delta) }
      })
    }

    // npc_unlock — 把"原本不在 chamber 池但被残片解锁"的 NPC 合并进来
    const npcUnlock = Array.isArray(merged.npcUnlock) ? merged.npcUnlock : []
    if (npcUnlock.length > 0) {
      const npcIdSet = new Set(npcPool.map(n => n.id))
      for (const id of npcUnlock) {
        if (npcIdSet.has(id)) continue
        const extra = _allNpcsCache.find(n => n.id === id)
        if (extra) npcPool.push(extra)
      }
    }
  }

  return { itemPool, npcPool }
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
  // Phase 24c: 应用职业 perks combat_dmg_mult / combat_def_mult
  const dmgMult = 1 + (Number(basePlayer.classPerks?.combat_dmg_mult) || 0)
  const defMult = 1 + (Number(basePlayer.classPerks?.combat_def_mult) || 0)
  const baseAtk = (basePlayer.atk || 0) + equipped.totalAtk
  const baseDef = (basePlayer.def || 0) + equipped.totalDef
  return {
    ...basePlayer,
    hp: Math.min(basePlayer.hp || 0, maxHp),
    maxHp,
    atk: Math.round(baseAtk * dmgMult),
    def: Math.round(baseDef * defMult),
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

// 远星函馆：每 persist 前的完整 tick 链路
//   1. tickEnvPollution(gv) — 环境污染 +5 + max(map.pollution_accel)
//   2. tickOmegaCountdown(player) — Ω 倒计时 -1，归零强制退至 map=3
//   3. recomputeFlags(gv) — 重算 envPollutionMax/Below60/lowFragments/totalEntityKillRate
//   4. evaluateBranchNodes — 触发分支条件
//   5. applyEndingIfTriggered — 应用结局
//   6. persistResolution — 写入数据库
async function persistResolutionWithPollution(client, room, resolution, userId, options = {}) {
  try {
    // Phase 19.5: 从 gamevars.raidPath 算 accel 表（替代 DB 查询）
    const accelTable = buildChamberAccelTable(resolution.gamevars)
    resolution.gamevars = tickEnvPollution(resolution.gamevars, accelTable)

    const player = getResolutionPlayer(resolution, userId)
    if (player?.alive && !player?.extracted) {
      const tickResult = tickOmegaCountdown(player, resolution.gamevars)
      if (tickResult.player !== player) {
        setResolutionPlayer(resolution, userId, tickResult.player)
        if (tickResult.forcedRetreat && tickResult.log) {
          appendResolutionLog(resolution, tickResult.log, 'damage')
        }
      }
    }

    resolution.gamevars = recomputeFlags(resolution.gamevars)
  } catch (e) {
    console.error('[pollution tick] 失败:', e?.message)
  }

  try {
    await evaluateBranchNodes(client, resolution, userId)
  } catch (e) {
    console.error('[branches] 评估失败:', e?.message)
  }
  try {
    await applyEndingIfTriggered(client, resolution)
  } catch (e) {
    console.error('[endings] 应用失败:', e?.message)
  }
  return persistResolution(client, room, resolution, options)
}

// 旧名：保留向后兼容（部分调用点暂未替换）
async function persistResolutionWithBranches(client, room, resolution, userId, options = {}) {
  return persistResolutionWithPollution(client, room, resolution, userId, options)
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
    throw new Error(error.message || '对局状态更新失败')
  }

  // Phase 22.1: 当对局从 进行/等待 转入 ended(2) 时写一次 raid_stats
  if (data && room.gamestate !== 2 && data.gamestate === 2) {
    try {
      await writeRaidStats(client, data)
    } catch (e) {
      console.error('[raid_stats] 写入失败:', e?.message)
    }
  }

  return data
}

// Phase 22.1: 单局结束统计写入
async function writeRaidStats(client, finalRoom) {
  if (!finalRoom) return
  const gv = finalRoom.gamevars || {}
  const players = Object.values(gv.players || {})
  const chamberIdxs = players.map(p => p?.chamberIndex || 0)
  const chamberAvg = chamberIdxs.length > 0
    ? chamberIdxs.reduce((s, n) => s + n, 0) / chamberIdxs.length
    : 0
  const chamberMax = chamberIdxs.length > 0 ? Math.max(...chamberIdxs) : 0
  const extractCount = players.filter(p => p?.extracted).length
  const startedAt = finalRoom.started_at ? new Date(finalRoom.started_at).getTime() : null
  const endedAt = Date.now()
  const durationSec = startedAt ? Math.floor((endedAt - startedAt) / 1000) : 0

  // Phase 22.3: 把 chamber 出现次数 + 类型分布写入 metadata（供平衡 dashboard 用）
  const chamberCounts = {}
  const typeCounts = {}
  for (const ch of (Array.isArray(gv.raidPath) ? gv.raidPath : [])) {
    if (ch?.templateId != null) {
      chamberCounts[ch.templateId] = (chamberCounts[ch.templateId] || 0) + 1
    }
    if (ch?.type) {
      typeCounts[ch.type] = (typeCounts[ch.type] || 0) + 1
    }
  }

  // Phase 25.1: 加职业分布 + 玩家撤离深度分布
  const classDistribution = {}
  const playerDepths = []   // 每个玩家最深 chamberIndex（衡量探索投入）
  const playerExtracts = [] // 每个玩家撤离成功 / 阵亡
  for (const p of players) {
    if (p?.classId != null) {
      classDistribution[p.classId] = (classDistribution[p.classId] || 0) + 1
    }
    playerDepths.push(p?.chamberIndex || 0)
    playerExtracts.push(p?.extracted ? 'extracted' : (p?.alive ? 'alive' : 'dead'))
  }

  // Phase 25g (28-B P0): 经济埋点 — 取 stashSnapshotBefore + 查 player_points 算 stash_value_after
  const econAcc = gv.economyAccumulator || {}
  const pointsCredited = econAcc.pointsCredited || {}
  const pointsSpent    = econAcc.pointsSpent || {}
  const stashBefore    = gv.stashSnapshotBefore || {}
  let stashAfter       = {}
  // players keyed by user uuid in gamevars.players
  const participantIds = Object.keys(gv.players || {}).filter(Boolean)
  if (participantIds.length > 0) {
    try {
      const { data: pts } = await client
        .from('player_points')
        .select('user_id, point_type, balance')
        .in('user_id', participantIds)
      for (const row of (pts || [])) {
        const t = row.point_type
        if (!t) continue
        stashAfter[t] = (stashAfter[t] || 0) + (Number(row.balance) || 0)
      }
    } catch (e) {
      console.error('[raid_stats] stash_value_after 查询失败:', e?.message)
    }
  }

  await client.from('raid_stats').insert({
    room_id: finalRoom.id,
    gamenum: finalRoom.gamenum || 0,
    duration_seconds: durationSec,
    chamber_count_avg: Number(chamberAvg.toFixed(2)),
    chamber_count_max: chamberMax,
    player_count: finalRoom.validnum || players.length,
    alive_count: finalRoom.alivenum || 0,
    death_count: finalRoom.deathnum || 0,
    extract_count: extractCount,
    fragments_extracted: gv.totalFragmentsExtracted || 0,
    ending_key: gv.endingResult?.key || null,
    env_pollution_final: Math.floor(gv.envPollution || 0),
    raid_path_length: Array.isArray(gv.raidPath) ? gv.raidPath.length : 0,
    points_credited: pointsCredited,
    points_spent: pointsSpent,
    stash_value_before: stashBefore,
    stash_value_after: stashAfter,
    metadata: {
      chamber_counts: chamberCounts,
      type_counts: typeCounts,
      class_distribution: classDistribution,
      player_depths: playerDepths,
      player_extracts: playerExtracts,
    },
  })
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

// ══════════════════════════════════════════════════════
//  Phase 16: NPC 实例池 helper
// ══════════════════════════════════════════════════════

/** 从 gamevars 实例池取一只仍存活的 NPC 实例（按 id 查） */
function findNpcInstance(gamevars, instanceId) {
  if (!instanceId) return null
  const inst = (gamevars.npcInstances || []).find(i => i.id === instanceId)
  return inst && inst.hp > 0 ? inst : null
}

/** 抽 / 新建 NPC 实例（搜索遭遇时用）
 *  策略：60% 概率从同地图存活实例池抽，40% 概率新建（池为空必新建）
 */
function pickOrSpawnNpcInstance(resolution, mapId, npcPool) {
  const live = (resolution.gamevars.npcInstances || []).filter(i => i.mapId === mapId && i.hp > 0)
  const reuse = live.length > 0 && Math.random() < 0.6
  if (reuse) {
    return { instance: live[Math.floor(Math.random() * live.length)], spawned: false }
  }
  if (!npcPool || npcPool.length === 0) {
    if (live.length > 0) return { instance: live[Math.floor(Math.random() * live.length)], spawned: false }
    return null
  }
  const npc = npcPool[Math.floor(Math.random() * npcPool.length)]
  const instance = normalizeNpcInstance({
    npcId: npc.id,
    npc,
    hp: Number(npc.hp) || 1,
    maxHp: Number(npc.hp) || 1,
    mapId,
  })
  resolution.gamevars = {
    ...resolution.gamevars,
    npcInstances: [...(resolution.gamevars.npcInstances || []), instance],
  }
  return { instance, spawned: true }
}

/** 清掉玩家的 encounter（其他动作开始前调用 — 视为"放过"NPC） */
function clearEncounterIfAny(resolution, userId, opts = {}) {
  const player = getResolutionPlayer(resolution, userId)
  if (!player?.encounter?.instanceId) return
  const inst = findNpcInstance(resolution.gamevars, player.encounter.instanceId)
  const npcName = inst?.npc?.name || '某实体'
  setResolutionPlayer(resolution, userId, { ...player, encounter: null })
  if (!opts.silent) {
    appendResolutionLog(resolution, `${player.name} 放过了 ${npcName}`, 'system')
  }
}

/** "放过"动作（玩家点击"放过"按钮触发） */
async function releaseEncounter(client, room, gamevars, user) {
  const player = getPlayer(gamevars, user.id)
  if (!player?.encounter?.instanceId) {
    throw new Error('当前没有袭击目标')
  }
  const resolution = createActionResolution({ room, actorId: user.id, gamevars })
  clearEncounterIfAny(resolution, user.id)
  return persistResolution(client, room, resolution)
}

async function resolveSearchAction(client, room, gamevars, user) {
  const player = getPlayer(gamevars, user.id)
  if (!player?.alive) throw new Error('阵亡玩家无法搜索')

  // ── 并行：规则/Buff缓存 + chamber 数据 + 尸体数据 一次性全拉 ──
  // Phase 19.5: 用 chamber.templateId 作为 mapId（兼容旧 corpse.mapId 匹配）
  const currentChamber = getChamberForPlayer(gamevars, player)
  const mapId = currentChamber?.templateId ?? (player.map ?? 0)
  const [rules, buffPool, bundle, corpseResult] = await Promise.all([
    loadGameRules(client),
    loadBuffPool(client),
    fetchSearchChamberBundle(client, gamevars, player),
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
  const { itemChance: rawItemChance, npcChance: rawNpcChance, fragmentChance: rawFragmentChance } = getSearchChances(rules)

  // ── 远星函馆：搜索动作触发个人污染 + 受有效污染影响 ──
  const polluted = applySearchPollution(nextPlayer)
  setResolutionPlayer(resolution, user.id, polluted)

  const eff = calcEffectivePollution(
    resolution.gamevars.envPollution || 0,
    polluted.personalPollution || 0,
  )
  const loadoutFx = getLoadoutEffects(polluted)
  const rawItemMod = applyPollutionSearchModifier(rawItemChance, eff.effective, { hasProbe: loadoutFx.probe })
  // Phase 24c: 职业 perks search_bonus 加成 / fragment_drop_bonus 加成
  const searchBonus = Number(polluted.classPerks?.search_bonus) || 0
  const fragBonus   = Number(polluted.classPerks?.fragment_drop_bonus) || 0
  const itemChance = Math.min(0.95, rawItemMod * (1 + searchBonus))
  const npcChance  = rawNpcChance  // NPC 出现率不被污染下降影响

  const fragmentChance = Math.min(0.5, rawFragmentChance + fragBonus)
  const corpseChance = lootable.length > 0 ? itemChance * 0.5 : 0
  const looseItemChance = Math.max(0, itemChance - corpseChance)
  const roll = Math.random()

  appendResolutionLog(resolution, `${player.name} 开始搜索区域`, 'system')

  // ── 事件系统：on_search 钩子 ──
  try {
    await processEventTrigger(client, resolution, user.id, 'on_search', { mapId })
  } catch (e) {
    console.error('[searchArea] event trigger 失败:', e?.message)
  }
  const afterEvent = getResolutionPlayer(resolution, user.id)
  if (!afterEvent?.alive) {
    return persistResolutionWithPollution(client, room, resolution, user.id)
  }
  if (afterEvent.battle) {
    return persistResolutionWithPollution(client, room, resolution, user.id)
  }

  if (roll < npcChance && bundle.npcPool.length > 0) {
    // ── Phase 16: 抽 / 新建 NPC 实例（HP 跨袭击持久化） ──
    const picked = pickOrSpawnNpcInstance(resolution, mapId, bundle.npcPool)
    if (picked && picked.instance) {
      const inst = picked.instance
      if (picked.spawned) {
        resolution.gamevars = {
          ...resolution.gamevars,
          spawnedEntityCount: (resolution.gamevars.spawnedEntityCount || 0) + 1,
        }
      }
      setResolutionPlayer(resolution, user.id, {
        ...polluted,
        encounter: { instanceId: inst.id },
      })
      const hpHint = (inst.hp < inst.maxHp)
        ? `（已伤 ${inst.hp}/${inst.maxHp}）`
        : ''
      appendResolutionLog(
        resolution,
        `${player.name} 遭遇了 ${inst.npc.name}${hpHint}`,
        'damage',
      )
      return persistResolutionWithPollution(client, room, resolution, user.id)
    }
  }

  if (roll < npcChance + corpseChance && lootable.length > 0) {
    const found = lootable[Math.floor(Math.random() * lootable.length)]
    resolution.gamevars = setPlayerLootPrompt(resolution.gamevars, user.id, found.prompt)
    const enemyName = found.corpse.name.replace(/ 的尸体$/, '')
    appendResolutionLog(resolution, `${player.name} 发现了一具敌人残骸（${enemyName}）`, 'system')
    return persistResolutionWithPollution(client, room, resolution, user.id)
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
      ...polluted,
      inventory: [...(polluted.inventory || []), found.name],
    })
    appendResolutionLog(resolution, `${player.name} 找到了 ${found.name}`, 'heal')
    const persisted = await persistResolutionWithPollution(client, room, resolution, user.id)
    try {
      await updateContractProgress(client, user.id, { type: 'item_acquired', itemName: found.name })
    } catch (e) {
      console.error('[searchArea] contract progress 失败:', e?.message)
    }
    return persisted
  }

  // ── 残片发现：搜索链（Phase 18.1：phase_chain='search'）──
  const fragmentThreshold = npcChance + corpseChance + looseItemChance + fragmentChance
  if (roll < fragmentThreshold) {
    try {
      const gamenum = room.gamenum || 1
      const fragment = await discoverFragment(client, user.id, mapId, eff.effective, gamenum, { chain: 'search' })
      if (fragment) {
        const levelText = fragment.isNew
          ? `发现了一段损坏的数据残片【${fragment.name}】`
          : `对【${fragment.name}】进行了进一步解码（解码度 ${fragment.decode_level}/3）`
        appendResolutionLog(resolution, `${player.name} ${levelText}`, 'system')
        // Phase 20.4: 合成解锁日志
        for (const u of (fragment.comboUnlocks || [])) {
          appendResolutionLog(resolution, `🔗 解码完成，合成新残片【${u.name}】 ${u.comboDescription ? '— ' + u.comboDescription : ''}`, 'system')
        }
        return persistResolutionWithPollution(client, room, resolution, user.id)
      }
    } catch (e) {
      console.error('[searchArea] fragment discovery 失败:', e?.message)
    }
  }

  appendResolutionLog(resolution, `${player.name} 搜索了一圈，但没有发现有用的东西`, 'system')
  return persistResolutionWithPollution(client, room, resolution, user.id)
}

// ══════════════════════════════════════════════════════
//  Phase 16: 单次袭击战斗（无持续 battle 状态）
//  流程：命中判定 → 命中扣 HP → 击杀/未击杀分支 → 反击判定（独立）→ 反击命中扣玩家血 → 清 encounter
// ══════════════════════════════════════════════════════
async function resolveNpcAttackAction(client, room, gamevars, user) {
  const player = getPlayer(gamevars, user.id)
  if (!player?.alive) throw new Error('阵亡玩家无法攻击')
  const instanceId = player?.encounter?.instanceId
  if (!instanceId) throw new Error('当前没有袭击目标')

  const instance = findNpcInstance(gamevars, instanceId)
  if (!instance) {
    // 实例已被消灭（其他玩家先击杀）/ 已不在池
    const resolution = createActionResolution({ room, actorId: user.id, gamevars })
    setResolutionPlayer(resolution, user.id, { ...player, encounter: null })
    appendResolutionLog(resolution, `${player.name} 的袭击目标已消失`, 'system')
    return persistResolution(client, room, resolution)
  }

  const [rules, buffPool, equippedInstances] = await Promise.all([
    loadGameRules(client),
    loadBuffPool(client),
    fetchEquippedInstances(client, room.id, [user.id]),
  ])
  const myEquips = groupEquipsByOwner(equippedInstances)[user.id] || []
  let me = buildCombatPlayer(player, myEquips)
  const weapon = myEquips.find(eq => eq.tier?.series?.slot === 'weapon')

  const resolution = createActionResolution({ room, actorId: user.id, gamevars })

  // ── 1. 玩家攻击的命中判定 ──
  const playerAccuracy = getRule(rules, 'player_attack_accuracy', 0.85)
  const playerHit = Math.random() < playerAccuracy

  // ── 2. 战斗个人污染（无论命中都扣，反映"动手"成本） ──
  const polluted = applyCombatPollution(player, instance.npc)

  let killed = false
  let instanceHpAfter = instance.hp

  if (playerHit) {
    const damageRaw = calcDamage(
      me,
      { ...instance.npc, hp: instance.hp, maxHp: instance.maxHp },
      rules,
      weapon?.tier?.sub_kind || '',
    )
    const { attackerUpdated: meAfterAttack, logs: passiveLogs } = triggerPassives(
      'on_attack',
      me,
      { ...instance.npc, hp: instance.hp },
      me._pass || [],
      buffPool,
    )
    me = meAfterAttack
    appendResolutionLogs(resolution, passiveLogs, 'buff')

    const eff = calcEffectivePollution(
      resolution.gamevars.envPollution || 0,
      polluted.personalPollution || 0,
    )
    const fx = getLoadoutEffects(polluted)
    const damageOut = applyPollutionCombatModifier(damageRaw, eff.effective, { hasWeapon: fx.weapon })
    instanceHpAfter = Math.max(0, instance.hp - damageOut)
    killed = instanceHpAfter <= 0

    appendResolutionLog(
      resolution,
      `${player.name} 袭击 ${instance.npc.name}，造成 ${damageOut} 伤害（HP ${instanceHpAfter}/${instance.maxHp}）`,
      'damage',
    )
  } else {
    appendResolutionLog(resolution, `${player.name} 袭击 ${instance.npc.name} — 未命中`, 'system')
  }

  // ── 3. 实例池更新（死则移除，活则更新 HP） ──
  let resolvedPlayer = polluted
  if (killed) {
    const { attackerUpdated: meAfterKill } = triggerPassives('on_kill', me, null, me._pass || [], buffPool)
    resolvedPlayer = {
      ...polluted,
      hp: meAfterKill.hp,
      buffs: meAfterKill.buffs || [],
      passiveCooldowns: meAfterKill.passiveCooldowns || {},
      kills: (polluted.kills || 0) + 1,
      entityKills: (polluted.entityKills || 0) + 1,
    }
    resolution.gamevars = {
      ...resolution.gamevars,
      npcInstances: (resolution.gamevars.npcInstances || []).filter(i => i.id !== instance.id),
      totalEntityKills: (resolution.gamevars.totalEntityKills || 0) + 1,
    }
    setResolutionPlayer(resolution, user.id, resolvedPlayer)

    // 尸体 + 战利品
    const corpseResult = await createNpcCorpse(client, resolution.gamevars, instance.npc, player.map ?? 0)
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
    appendResolutionLog(resolution, `${player.name} 击败了 ${instance.npc.name}`, 'kill')
    if (lootPrompt && corpseResult.corpse) {
      appendResolutionLog(resolution, `${player.name} 可以从 ${corpseResult.corpse.name} 里带走一件战利品`, 'system')
    }

    if (instance.npc.level === 'boss') {
      resolution.gamevars = { ...resolution.gamevars, bossDefeated: true }
      appendResolutionLog(resolution, `🏆 BOSS ${instance.npc.name} 已被击败！`, 'kill')
    }
    setKilledNpcFlag(resolution, instance.npc.name)

    try {
      await processEventTrigger(client, resolution, user.id, 'on_kill_npc', { npcName: instance.npc.name })
    } catch (e) {
      console.error('[attackNpc] event trigger 失败:', e?.message)
    }
    // Phase 18.1+20.7: 击杀链残片发现（combat chain）— PvE 击杀夺残片
    // 概率按 NPC 等级缩放：easy 10% / medium 25% / hard 45% / boss 80%
    // 让高等级击杀对 meta-progression(知识解锁) 有显著推力
    try {
      const npcLvl = instance.npc.level || 'easy'
      const dropChance = ({ easy: 0.10, medium: 0.25, hard: 0.45, boss: 0.80 })[npcLvl] ?? 0.20
      if (Math.random() < dropChance) {
        const eff = calcEffectivePollution(
          resolution.gamevars.envPollution || 0,
          getResolutionPlayer(resolution, user.id)?.personalPollution || 0,
        )
        const fragment = await discoverFragment(client, user.id, player.map ?? 0, eff.effective, room.gamenum || 1, { chain: 'combat' })
        if (fragment) {
          const verb = npcLvl === 'boss' ? '从 boss 残骸中夺取了' : '从残骸中夺取了'
          const note = fragment.isNew
            ? `${verb}数据残片【${fragment.name}】`
            : `${verb}【${fragment.name}】的更深一层解码（${fragment.decode_level}/3）`
          appendResolutionLog(resolution, `${player.name}（击杀 ${instance.npc.name}）${note}`, npcLvl === 'boss' ? 'crit' : 'system')
          // Phase 20.4: 合成解锁日志
          for (const u of (fragment.comboUnlocks || [])) {
            appendResolutionLog(resolution, `🔗 解码完成，合成新残片【${u.name}】 ${u.comboDescription ? '— ' + u.comboDescription : ''}`, 'system')
          }
        }
      }
    } catch (e) {
      console.error('[attackNpc] fragment discovery 失败:', e?.message)
    }
    try {
      await updateContractProgress(client, user.id, { type: 'npc_killed', npcName: instance.npc.name })
    } catch (e) {
      console.error('[attackNpc] contract progress 失败:', e?.message)
    }
  } else {
    // 实例仍存活：更新池中 HP
    resolution.gamevars = {
      ...resolution.gamevars,
      npcInstances: (resolution.gamevars.npcInstances || []).map(i =>
        i.id === instance.id ? { ...i, hp: instanceHpAfter } : i,
      ),
    }
    setResolutionPlayer(resolution, user.id, resolvedPlayer)
  }

  // ── 4. 反击判定（独立于玩家命中，不论击杀都跑一次概率） ──
  // 但 NPC 已死则不反击
  if (!killed) {
    const counterTriggered = Math.random() < (Number(instance.npc.counter_rate) || 0.3)
    if (counterTriggered) {
      const npcAccuracy = Number(instance.npc.accuracy) || 0.85
      const npcHit = Math.random() < npcAccuracy
      if (npcHit) {
        const cur = getResolutionPlayer(resolution, user.id)
        const damageIn = calcDamage(
          { ...instance.npc, hp: instanceHpAfter, maxHp: instance.maxHp },
          buildCombatPlayer(cur, myEquips),
          rules, '',
        )
        const playerHpAfter = Math.max(0, (cur.hp || 0) - damageIn)
        setResolutionPlayer(resolution, user.id, {
          ...cur,
          hp: playerHpAfter,
          alive: playerHpAfter > 0,
        })
        appendResolutionLog(
          resolution,
          `${instance.npc.name} 反击 ${player.name}，造成 ${damageIn} 伤害（HP ${playerHpAfter}/${cur.maxHp || 100}）`,
          'damage',
        )
        if (playerHpAfter <= 0) {
          appendResolutionLog(resolution, `${player.name} 在与 ${instance.npc.name} 的交手中倒下了`, 'death')
          await settleCorpseGeneration(resolution)
          // Phase 18.3: 记录死亡 — NPC 反击致死
          try {
            await logPlayerDeath(client, user.id, {
              roomId: room.id,
              gamenum: room.gamenum || 1,
              mapId: player.map ?? 0,
              reason: 'npc_counter',
              context: { npcName: instance.npc.name, envPollution: resolution.gamevars.envPollution || 0 },
            })
          } catch (e) { console.error('[attackNpc] deathLog 失败:', e?.message) }
        }
      } else {
        appendResolutionLog(resolution, `${instance.npc.name} 反击挥空`, 'system')
      }
    }
  }

  // ── 5. 清空 encounter（无论结果） ──
  const finalPlayer = getResolutionPlayer(resolution, user.id)
  if (finalPlayer && finalPlayer.encounter) {
    setResolutionPlayer(resolution, user.id, { ...finalPlayer, encounter: null })
  }

  const nextRoom = await persistResolutionWithPollution(client, room, resolution, user.id)
  await safeConsumeDurability(user.id, room.id, 1, client)
  return nextRoom
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

  const damage = calcDamage(me, target, rules, weapon?.tier?.sub_kind || '')
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

  // ── Phase 16: 防御方反击（独立判定，不依赖攻击是否命中；玩家攻击当前必中所以一定有反击概率） ──
  let counterTriggered = false
  let counterDamage = 0
  let attackerHpAfter = me.hp
  if (targetHp > 0) {
    const counterRate = getRule(rules, 'player_counter_rate', 0.4)
    counterTriggered = Math.random() < counterRate
    if (counterTriggered) {
      const counterAccuracy = getRule(rules, 'player_attack_accuracy', 0.85)
      const counterHit = Math.random() < counterAccuracy
      if (counterHit) {
        counterDamage = calcDamage(target, me, rules, '')
        attackerHpAfter = Math.max(0, attackerHpAfter - counterDamage)
        appendResolutionLog(
          resolution,
          `${target.name} 反击 ${attacker.name}，造成 ${counterDamage} 伤害`,
          'damage',
        )
      } else {
        appendResolutionLog(resolution, `${target.name} 反击挥空`, 'system')
      }
    }
  }

  setResolutionPlayer(resolution, user.id, {
    ...attackerAfterTurn,
    hp: attackerHpAfter,
    alive: attackerHpAfter > 0,
    buffs: me.buffs || [],
    passiveCooldowns: me.passiveCooldowns || {},
  })
  setResolutionPlayer(resolution, targetUid, {
    ...defenderAfterTurn,
    hp: targetHp,
    alive: targetHp > 0,
    battle: targetHp > 0 ? defenderAfterTurn.battle || null : null,
    lootPrompt: targetHp > 0 ? defenderAfterTurn.lootPrompt || null : null,
    // Phase 16: 写 lastPvpHit 给被攻击方触发 toast
    lastPvpHit: targetHp > 0 ? {
      seq: ((defenderAfterTurn.lastPvpHit?.seq) || 0) + 1,
      fromName: attacker.name,
      damage,
      countered: counterTriggered && counterDamage > 0,
      counterDmg: counterDamage,
      at: new Date().toISOString(),
    } : null,
  })

  // 攻击者被反击杀死
  if (attackerHpAfter <= 0) {
    appendResolutionLog(resolution, `${attacker.name} 被 ${target.name} 的反击击倒了`, 'death')
    await settleCorpseGeneration(resolution)
    // Phase 18.3: PvP 反击致死 — 攻击者死亡
    try {
      await logPlayerDeath(client, user.id, {
        roomId: room.id,
        gamenum: room.gamenum || 1,
        mapId: attackerAfterTurn.map ?? 0,
        reason: 'pvp',
        context: { attacker: target.name, role: 'attacker_killed_by_counter' },
      })
    } catch (e) { console.error('[attackPlayer] deathLog 失败:', e?.message) }
  }

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

    // Phase 18.3: PvP 被攻击致死 — defender 视角
    try {
      await logPlayerDeath(client, targetUid, {
        roomId: room.id,
        gamenum: room.gamenum || 1,
        mapId: defenderAfterTurn.map ?? 0,
        reason: 'pvp',
        context: { attacker: attacker.name, role: 'defender_killed' },
      })
    } catch (e) { console.error('[attackPlayer] defender deathLog 失败:', e?.message) }

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

  // ── Phase 17: 校验库存（无论何种 use_mode 都必须持有） ──
  const haveCount = (player.inventory || []).filter(it => it === itemName).length
  if (haveCount <= 0) throw new Error(`你没有 ${itemName}`)

  const resolution = createActionResolution({ room, actorId: user.id, gamevars })
  const nextPlayer = { ...player, lootPrompt: null }

  // ── Phase 17: inspect 模式分支 — 写 inspect_text 到日志，按需扣库存 ──
  const mode = itemDef.use_mode || 'consume'
  if (mode === 'inspect_keep' || mode === 'inspect_consume') {
    const text = (itemDef.inspect_text && String(itemDef.inspect_text).trim())
      || (itemDef.description && String(itemDef.description).trim())
      || '— 没有额外信息 —'
    appendResolutionLog(
      resolution,
      `${player.name} 查看 ${itemName}：${text}`,
      'system',
    )
    if (mode === 'inspect_consume') {
      nextPlayer.inventory = removeInventoryItem(player.inventory, itemName, 1)
      appendResolutionLog(resolution, `${itemName} 在查阅后碎裂了`, 'system')
    }
    setResolutionPlayer(resolution, user.id, nextPlayer)
    return persistResolution(client, room, resolution)
  }

  // ── consume 模式（默认）：保持原有 effect 链路 ──
  const me = buildCombatPlayer(player, groupEquipsByOwner(equippedInstances)[user.id] || [])
  const result = calcItemEffect(itemDef, me, rules)

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
  if (!player) throw new Error('你还未加入该对局')
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
      gamevars: appendGameLog(gamevars, createLogEntry(`${getDisplayName(user)} 创建了对局`, 'system')),
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message || '创建对局失败')
  }

  return data
}

export async function joinRoom(client, user, roomId, loadout = null) {
  const room = await fetchRoom(client, roomId)
  if (room.gamestate === 2) {
    throw new Error('已结束对局不可加入')
  }

  const gamevars = normalizeGamevars(room.gamevars)
  if (getPlayer(gamevars, user.id)) {
    return room
  }

  const rules = await loadGameRules(client)

  // ── Phase 25g (28-B P0): 入场前 snapshot 点数余额 (用于 raid_stats 通胀埋点) ──
  let balanceBeforeEntry = {}
  try {
    balanceBeforeEntry = await getBalances(client, user.id)
  } catch (e) {
    console.warn('[joinRoom] balanceBeforeEntry 查询失败:', e?.message)
  }

  // ── Phase 24b: 装载 — 从 player_points 扣点 + 按 shop_catalog 购买 ──
  // 新 payload 形状: loadout = { catalogPurchases: [{catalogId, qty}], exchanges: [{rateId, times}] }
  // 旧 payload(items + equipmentInstanceIds)走 legacy 分支以兼容未迁移的客户端
  let initialInventory = []
  let initialLoadout = { probe: null, shield: null, weapon: null, comm: null }
  if (loadout) {
    const catalogPurchases = Array.isArray(loadout.catalogPurchases) ? loadout.catalogPurchases : []
    const exchanges = Array.isArray(loadout.exchanges) ? loadout.exchanges : []

    // 1) 先跑兑换（让玩家可以临时凑够某种点数再买）
    if (exchanges.length > 0) {
      const { exchangePoints } = await import('@/lib/server/shop')
      for (const ex of exchanges) {
        if (ex?.rateId) {
          await exchangePoints(client, user.id, ex.rateId, Math.max(1, Number(ex.times) || 1))
        }
      }
    }

    // 2) 再走 catalog 购买
    if (catalogPurchases.length > 0) {
      const result = await purchaseFromCatalog(client, user.id, roomId, catalogPurchases)
      initialInventory = result.inventory
      initialLoadout = result.loadout
    }

    // ── Legacy fallback：旧客户端传的 items + equipmentInstanceIds（Phase 24b 前）──
    // 此分支已经废弃，但仍保留兼容（用户存量 equipment_instances 已被 24b SQL 清空，equipmentInstanceIds 不应再出现）
    const legacyItems = Array.isArray(loadout.items) ? loadout.items : []
    const legacyInstIds = Array.isArray(loadout.equipmentInstanceIds) ? loadout.equipmentInstanceIds : []
    if ((legacyItems.length > 0 || legacyInstIds.length > 0) && catalogPurchases.length === 0) {
      console.warn('[joinRoom] 接收到 legacy loadout 形状（items/equipmentInstanceIds），Phase 24b 后应使用 catalogPurchases')
      try {
        const result = await consumeForLoadout(client, user.id, roomId, { items: legacyItems, equipmentInstanceIds: legacyInstIds })
        initialInventory = [...initialInventory, ...result.inventory]
      } catch (e) {
        console.error('[joinRoom] legacy consumeForLoadout 失败:', e?.message)
      }
      if (loadout.loadout && typeof loadout.loadout === 'object') {
        initialLoadout = {
          probe:  loadout.loadout.probe  ?? initialLoadout.probe,
          shield: loadout.loadout.shield ?? initialLoadout.shield,
          weapon: loadout.loadout.weapon ?? initialLoadout.weapon,
          comm:   loadout.loadout.comm   ?? initialLoadout.comm,
        }
      }
    }
  }

  let player = createPlayerState(user, getInitPlayerStats(rules))
  if (initialInventory.length > 0) {
    player.inventory = initialInventory
  }
  player.loadout = initialLoadout
  // Phase 19.3: 玩家加入时初始化 chamber 路径位置（chamber 0 = 入口 scan_dense）
  player.chamberIndex = 0

  // Phase 24c: 应用职业属性加成 + perks（loadout 提交时携带 classId）
  let chosenClass = null
  if (loadout?.classId) {
    try {
      chosenClass = await commitClassChoice(client, user.id, roomId, Number(loadout.classId), !!loadout.usedHighPt)
      player = applyClassToPlayer(player, chosenClass)
      // 清掉 pending_class_roll
      await client.from('profiles').update({ pending_class_roll: null }).eq('id', user.id)
    } catch (e) {
      console.error('[joinRoom] commitClassChoice 失败:', e?.message)
    }
  }

  // Phase 27: 读 profiles.selected_portrait_id 解析为 image_url 注入 player state
  try {
    const portraitUrl = await resolvePortraitUrl(client, user.id)
    if (portraitUrl) player.portraitUrl = portraitUrl
  } catch (e) {
    console.warn('[joinRoom] portrait 解析失败:', e?.message)
  }

  // Phase 24a: 查询本玩家已完全解码（level 3）的残片 — 用于 lore 可见性过滤
  //   每个加入的玩家都要拉一次，把自己的 decoded id 列表挂到 player 状态上。
  //   首位玩家额外用这批规则生成 raidPath。
  let playerDecoded = []
  try {
    const { data: decoded } = await client
      .from('player_fragments')
      .select('fragment_id, decode_level, fragment_pool!inner(id, name, unlocks_rules)')
      .eq('user_id', user.id)
      .eq('decode_level', 3)
    playerDecoded = decoded || []
  } catch (e) {
    console.warn('[joinRoom] decoded fragments 查询失败:', e?.message)
  }
  player.decodedFragmentIds = playerDecoded.map(d => d.fragment_id)

  // Phase 19.3: 首位玩家加入时生成 raidPath（gamevars 级别，所有玩家共用）
  // Phase 20.2 / 24a: 用首位玩家的 decode_level=3 残片 unlocks_rules 合并进入路径生成（带 fragmentId）
  let nextRaidPath = gamevars.raidPath
  let unlocksContributed = []
  if (!Array.isArray(nextRaidPath) || nextRaidPath.length === 0) {
    try {
      const { data: chambers } = await client
        .from('chamber_templates')
        .select('*')
        .eq('enabled', true)

      let mergedRules = null
      // Phase 24a: rulesList 元素改为 { rules, fragmentId }，让 lore_chunk_pool 注入带来源
      const rulesList = playerDecoded
        .filter(d => d.fragment_pool?.unlocks_rules && Object.keys(d.fragment_pool.unlocks_rules).length > 0)
        .map(d => ({ rules: d.fragment_pool.unlocks_rules, fragmentId: d.fragment_id }))
      if (rulesList.length > 0) {
        mergedRules = mergeUnlocksRules(rulesList)
        unlocksContributed = rulesList.map(r => ({
          id: r.fragmentId,
          name: playerDecoded.find(d => d.fragment_id === r.fragmentId)?.fragment_pool?.name,
        }))
      }

      if (chambers && chambers.length > 0) {
        nextRaidPath = generateRaidPath(chambers, mergedRules)
      } else {
        nextRaidPath = []
      }
      // Phase 20.2: 把 mergedRules 写入 gamevars 供后续动作（搜索 item_amount_delta、NPC 解锁等）读取
      if (mergedRules) {
        gamevars.unlocksMerged = mergedRules
      }
    } catch (e) {
      console.error('[joinRoom] path generator 失败:', e?.message)
      nextRaidPath = []
    }
  }

  // ── Phase 25g (28-B P0): 入场后 snapshot + spent 累计 ──
  // 入场后余额 = stashSnapshotBefore(raid 启动基线);spent = before - after(per-type, 截非负)
  let balanceAfterEntry = {}
  try {
    balanceAfterEntry = await getBalances(client, user.id)
  } catch (e) {
    console.warn('[joinRoom] balanceAfterEntry 查询失败:', e?.message)
  }
  const prevStashSnap = gamevars.stashSnapshotBefore || {}
  const nextStashSnap = { ...prevStashSnap }
  for (const [t, v] of Object.entries(balanceAfterEntry)) {
    nextStashSnap[t] = (nextStashSnap[t] || 0) + (Number(v) || 0)
  }
  const prevEcon = gamevars.economyAccumulator || { pointsCredited: {}, pointsSpent: {} }
  const nextSpent = { ...(prevEcon.pointsSpent || {}) }
  const seenTypes = new Set([...Object.keys(balanceBeforeEntry), ...Object.keys(balanceAfterEntry)])
  for (const t of seenTypes) {
    const before = Number(balanceBeforeEntry[t]) || 0
    const after  = Number(balanceAfterEntry[t]) || 0
    const spent  = Math.max(0, before - after)
    if (spent > 0) nextSpent[t] = (nextSpent[t] || 0) + spent
  }

  const nextGamevars = {
    ...gamevars,
    raidPath: nextRaidPath,
    players: {
      ...gamevars.players,
      [user.id]: player,
    },
    stashSnapshotBefore: nextStashSnap,
    economyAccumulator: {
      pointsCredited: prevEcon.pointsCredited || {},
      pointsSpent: nextSpent,
    },
  }

  // Phase 20.2: 把合并后的 unlocks 规则带上（item_amount_delta / npc_unlock 后续搜索/战斗会读）
  if (gamevars.unlocksMerged) {
    nextGamevars.unlocksMerged = gamevars.unlocksMerged
  }

  // Phase 20.2: 记录本局贡献的解锁残片（结局横幅展示用）
  if (unlocksContributed.length > 0 && !Array.isArray(gamevars.unlocksContributed)) {
    nextGamevars.unlocksContributed = unlocksContributed
  }

  const classNote = chosenClass
    ? `[${chosenClass.rarity === 'legendary' ? '★' : ''}${chosenClass.name}] `
    : ''
  const loadoutNote = initialInventory.length > 0 ? `（装载 ${initialInventory.length} 件物资）` : ''
  const isFirstPath = nextRaidPath.length > 0 && (!Array.isArray(gamevars.raidPath) || gamevars.raidPath.length === 0)
  const unlocksNote = isFirstPath && unlocksContributed.length > 0 ? `，已应用 ${unlocksContributed.length} 条残片解锁规则` : ''
  const pathNote = isFirstPath ? `（已生成 ${nextRaidPath.length} chamber 路径${unlocksNote}）` : ''
  const nextRoom = await persistRoom(client, room, nextGamevars, [
    createLogEntry(`${classNote}${player.name} 加入了游戏${loadoutNote}${pathNote}`, 'system'),
  ], { startGame: true })

  await client.from('profiles').update({ roomid: roomId }).eq('id', user.id)
  return nextRoom
}

export async function executeGameAction(client, user, payload, options = {}) {
  const roomId = Number(payload.roomId)
  if (!roomId) {
    throw new Error('缺少对局 ID')
  }

  // 支持外部预取的对局数据，跳过重复查询
  const room = options.prefetchedRoom || await fetchRoom(client, roomId)
  const gamevars = normalizeGamevars(room.gamevars)
  const me = getPlayer(gamevars, user.id)
  if (!['join', 'lootCorpse', 'dismissLootPrompt'].includes(payload.action) && me?.lootPrompt) {
    throw new Error('请先处理当前战利品')
  }

  if (payload.action !== 'join' && !me) {
    throw new Error('你还未加入该对局')
  }

  if (payload.action === 'join') {
    return joinRoom(client, user, roomId, payload.loadout || null)
  }

  if (payload.action === 'move' || payload.action === 'advanceChamber') {
    // Phase 19: 旧 move 与新 advanceChamber 等价（沿 raidPath 前进 1 步）
    return movePlayer(client, room, gamevars, user, payload.selection || 'A')
  }

  if (payload.action === 'search') {
    return searchArea(client, room, gamevars, user)
  }

  if (payload.action === 'attackNpc') {
    return attackNpc(client, room, gamevars, user)
  }

  if (payload.action === 'releaseEncounter') {
    return releaseEncounter(client, room, gamevars, user)
  }

  if (payload.action === 'attackPlayer') {
    return attackPlayer(client, room, gamevars, user, payload.targetUid)
  }

  if (payload.action === 'extract') {
    return extractPlayer(client, room, gamevars, user, payload)
  }

  // Phase 21.4: 探针交互
  if (payload.action === 'probeAttack') {
    return actOnProbe(client, room, gamevars, user, 'attack')
  }
  if (payload.action === 'probeIgnore') {
    return actOnProbe(client, room, gamevars, user, 'ignore')
  }

  if (payload.action === 'emergencyRetreat') {
    return emergencyRetreat(client, room, gamevars, user)
  }

  if (payload.action === 'trade') {
    return tradeWithNpc(client, room, gamevars, user, payload)
  }

  if (payload.action === 'equipLoadout') {
    return equipLoadoutAction(client, room, gamevars, user, payload)
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

// Phase 19.5+19.6: movePlayer 重写为 advanceChamber 模型
// 旧签名 (client, room, gamevars, user, mapId) — mapId 现在被忽略（payload.selection 可选）
// 玩家沿 raidPath 前进 1 步（player.chamberIndex += 1）。selection（'A'/'B'/'C'）仅
// 用于日志叙事（pathGenerator.getNextChamberOptions 提供的选项里 A 是真正下一段）
async function movePlayer(client, room, gamevars, user, payloadSelection = 'A') {
  const player = getPlayer(gamevars, user.id)
  if (!player?.alive) throw new Error('已阵亡玩家无法前进')
  if (player.extracted) throw new Error('已撤离玩家无法前进')

  const raidPath = Array.isArray(gamevars.raidPath) ? gamevars.raidPath : []
  if (raidPath.length === 0) throw new Error('对局未初始化路径（缺少 raidPath）')

  const currentIdx = player.chamberIndex ?? 0
  const nextIdx = currentIdx + 1
  if (nextIdx >= raidPath.length) {
    throw new Error('已到达路径终点，无法继续前进')
  }

  const nextChamber = raidPath[nextIdx]
  if (!nextChamber) throw new Error('下一段 chamber 不存在')

  const chamberName = nextChamber.name || `chamber-${nextIdx}`

  const resolution = createActionResolution({ room, actorId: user.id, gamevars })
  clearEncounterIfAny(resolution, user.id)

  // Phase 19.5: 推进 chamberIndex + 历史栈 + map 字段同步（保持向后兼容）
  let nextPlayer = {
    ...player,
    chamberIndex: nextIdx,
    chamberHistory: [...(player.chamberHistory || []), currentIdx],
    map: nextChamber.templateId,   // 保留 map 字段同步为 chamber.templateId
    encounter: null,
  }

  // ── Ω-段倒计时（chamber.omegaWindow > 0 视为 Ω-段，启动倒计时） ──
  if ((nextChamber.omegaWindow || 0) > 0) {
    const fx = getLoadoutEffects(player)
    // Phase 24c: 职业 perk omega_window_bonus 直接加在窗口上
    const classBonus = Number(player.classPerks?.omega_window_bonus) || 0
    const window = (nextChamber.omegaWindow || POLLUTION_CONFIG.OMEGA_WINDOW) + (fx.shield ? 1 : 0) + classBonus
    nextPlayer.omegaCountdown = window
    nextPlayer.omegaVisits = (player.omegaVisits || 0) + 1
  } else {
    // 离开 Ω-段时清空倒计时
    if (player.omegaCountdown !== null && player.omegaCountdown !== undefined) {
      nextPlayer.omegaCountdown = null
    }
  }

  // ── 低污染区自然衰减 ──
  nextPlayer = applyRetreatDecay(nextPlayer, gamevars.envPollution || 0)

  setResolutionPlayer(resolution, user.id, nextPlayer)
  appendResolutionLog(
    resolution,
    `${player.name} 前进至【${chamberName}】(${nextIdx + 1}/${raidPath.length})`,
    'system',
  )
  if ((nextChamber.omegaWindow || 0) > 0) {
    appendResolutionLog(resolution, `Ω-段倒计时启动：${nextChamber.omegaWindow} 回合后强制退避`, 'system')
  }
  if (nextChamber.type === 'milestone') {
    appendResolutionLog(resolution, `⚔ 里程碑 chamber：${chamberName} —— 强敌可能正等待`, 'damage')
  }

  // 自动 flag：玩家曾访问该 chamber（供分支引擎）— 用 templateId 替代 mapId
  setVisitedMapFlag(resolution, nextChamber.templateId)

  // on_enter_map 事件钩子（保持事件 API 兼容，传 templateId 作 mapId）
  try {
    await processEventTrigger(client, resolution, user.id, 'on_enter_map', { mapId: nextChamber.templateId })
  } catch (e) {
    console.error('[movePlayer] event trigger 失败:', e?.message)
  }

  // Phase 21.3: 进入 chamber 时 8% 概率遭遇异步探针
  try {
    const probe = await tryEncounterProbe(client, user.id, nextChamber.templateId)
    if (probe) {
      // 把 probe 信息挂到玩家身上作为 encounter（特殊类型）
      const playerWithProbe = {
        ...nextPlayer,
        probeEncounter: {
          probeId: probe.id,
          ownerId: probe.owner_id,
          hp: probe.hp,
          maxHp: probe.max_hp,
          atk: probe.atk,
          def: probe.def,
          equipmentSnapshot: probe.equipment_snapshot || {},
          fragmentCount: (probe.fragments_carry || []).length,
        },
      }
      setResolutionPlayer(resolution, user.id, playerWithProbe)
      appendResolutionLog(
        resolution,
        `⚠ 探测到未知探针：HP ${probe.hp}/${probe.max_hp} · ATK ${probe.atk} · 携带 ${(probe.fragments_carry || []).length} 条残片碎片`,
        'system',
      )
    }
  } catch (e) {
    console.error('[movePlayer] probe encounter 失败:', e?.message)
  }

  return persistResolutionWithPollution(client, room, resolution, user.id)
}

// ── Phase 21.4: 探针交互（袭击/放过） ──
async function actOnProbe(client, room, gamevars, user, action) {
  const player = getPlayer(gamevars, user.id)
  if (!player?.alive) throw new Error('已阵亡玩家无法操作')
  const probeEnc = player.probeEncounter
  if (!probeEnc) throw new Error('当前没有探针遭遇')

  const resolution = createActionResolution({ room, actorId: user.id, gamevars })

  if (action === 'ignore') {
    setResolutionPlayer(resolution, user.id, { ...player, probeEncounter: null })
    appendResolutionLog(resolution, `${player.name} 选择避开探针，无声离开`, 'system')
    // Phase 25d — 记录 spared outcome（不阻塞 resolution 持久化）
    try {
      await recordProbeOutcome(client, probeEnc.probeId, user.id, 'spared')
    } catch (e) { console.error('[actOnProbe] recordProbeOutcome spared 失败:', e?.message) }
    return persistResolution(client, room, resolution)
  }

  if (action !== 'attack') throw new Error('未知的探针动作')

  // 攻击：单次结算 — 玩家攻击探针, 探针反击
  const myAtk = player.atk || 10
  const myDef = player.def || 8
  const myHp = player.hp || 0
  const probeDmgFromMe = Math.max(1, myAtk - Math.floor(probeEnc.def * 0.5))
  const probeHpAfter = Math.max(0, probeEnc.hp - probeDmgFromMe)
  const probeKilled = probeHpAfter <= 0

  let myHpAfter = myHp
  let probeDmgToMe = 0
  if (!probeKilled) {
    probeDmgToMe = Math.max(1, probeEnc.atk - Math.floor(myDef * 0.5))
    myHpAfter = Math.max(0, myHp - probeDmgToMe)
  }

  const playerAlive = myHpAfter > 0

  appendResolutionLog(resolution, `${player.name} 袭击探针，造成 ${probeDmgFromMe} 伤害（探针 HP ${probeHpAfter}/${probeEnc.maxHp}）`, 'attack')

  if (probeKilled) {
    appendResolutionLog(resolution, `🎯 探针被击败！`, 'kill')
    // 抢 1 条残片
    try {
      const stolen = await defeatProbe(client, probeEnc.probeId, user.id)
      if (stolen?.stolenFragmentName) {
        appendResolutionLog(resolution, `${player.name} 从探针残骸中夺取了【${stolen.stolenFragmentName}】 — 解码 +1（${stolen.newLevel}/3）`, 'crit')
      } else {
        appendResolutionLog(resolution, `探针未携带可夺残片`, 'system')
      }
    } catch (e) {
      console.error('[actOnProbe] defeatProbe 失败:', e?.message)
    }
    setResolutionPlayer(resolution, user.id, {
      ...player,
      probeEncounter: null,
      hp: myHpAfter,
      alive: playerAlive,
    })
  } else {
    appendResolutionLog(resolution, `探针反击 ${player.name}，造成 ${probeDmgToMe} 伤害（HP ${myHpAfter}/${player.maxHp || 100}）`, 'damage')
    setResolutionPlayer(resolution, user.id, {
      ...player,
      hp: myHpAfter,
      alive: playerAlive,
      probeEncounter: {
        ...probeEnc,
        hp: probeHpAfter,
      },
    })
    if (!playerAlive) {
      appendResolutionLog(resolution, `${player.name} 在与探针的交手中倒下了`, 'death')
      await settleCorpseGeneration(resolution)
      try {
        await logPlayerDeath(client, user.id, {
          roomId: room.id,
          gamenum: room.gamenum || 1,
          mapId: player.map ?? 0,
          reason: 'npc_counter',
          context: { probeOwner: probeEnc.ownerId, envPollution: resolution.gamevars.envPollution || 0 },
        })
      } catch (e) { console.error('[actOnProbe] deathLog 失败:', e?.message) }
      // Phase 25d — 记录 killed_attacker outcome（探针反杀玩家）
      try {
        await recordProbeOutcome(client, probeEnc.probeId, user.id, 'killed_attacker')
      } catch (e) { console.error('[actOnProbe] recordProbeOutcome killed_attacker 失败:', e?.message) }
    }
  }

  return persistResolutionWithPollution(client, room, resolution, user.id)
}

async function searchArea(client, room, gamevars, user) {
  return resolveSearchAction(client, room, gamevars, user)
}

async function attackNpc(client, room, gamevars, user) {
  return resolveNpcAttackAction(client, room, gamevars, user)
}

async function attackPlayer(client, room, gamevars, user, targetUid) {
  return resolvePlayerAttackAction(client, room, gamevars, user, targetUid)
}

// ── 撤离：把背包道具与装备转入账户库，标记玩家 extracted ──
// ── 撤离：远星函馆 is_exit + exit_cost 模型 ──
async function extractPlayer(client, room, gamevars, user, payload) {
  const player = getPlayer(gamevars, user.id)
  if (!player) throw new Error('你还未加入该对局')
  if (!player.alive) throw new Error('阵亡玩家无法撤离')
  if (player.extracted) throw new Error('已经撤离')

  // Phase 19.5: 从 gamevars.raidPath 取当前 chamber（不查 map_config）
  const mapConfig = getChamberAsMapConfig(gamevars, player)
  if (!mapConfig) throw new Error('chamber 数据不存在（raidPath 未初始化？）')
  if (!mapConfig.is_exit) {
    throw new Error(`【${mapConfig.name}】不是撤离点`)
  }
  const playerMapId = mapConfig.map_id   // 实际是 chamber.templateId（兼容旧代码引用）

  // ── exit_cost 校验与扣除 ──
  let inventoryAfter = [...(player.inventory || [])]
  const cost = mapConfig.exit_cost
  if (cost && cost.item) {
    const need = Number(cost.qty) || 1
    let have = 0
    for (const it of inventoryAfter) if (it === cost.item) have++
    if (have < need) {
      throw new Error(`需要持有 ${cost.item} ×${need}，当前仅有 ×${have}`)
    }
    let removed = 0
    inventoryAfter = inventoryAfter.filter(it => {
      if (it === cost.item && removed < need) { removed++; return false }
      return true
    })
  }

  // ── Phase 21.2: 留探针选项（payload.leaveProbe === true） ──
  // 消耗 1 件 platform_part 物品；探针快照玩家当前装备与残片
  let probeLeftLog = null
  if (payload?.leaveProbe === true) {
    // 找 platform_part 物品
    const platformPartIdx = (await (async () => {
      const { data: parts } = await client.from('item_pool').select('name').eq('kind', 'platform_part')
      const partNames = new Set((parts || []).map(p => p.name))
      return inventoryAfter.findIndex(name => partNames.has(name))
    })())
    if (platformPartIdx < 0) {
      throw new Error('留探针需要至少 1 件「环段部件」(platform_part) 物品')
    }
    const partName = inventoryAfter[platformPartIdx]
    inventoryAfter.splice(platformPartIdx, 1)

    // 抓玩家已发现的残片 ID 列表（任意 decode_level >=1 都算）作为探针 carry
    let probeFragmentsCarry = []
    try {
      const { data: pfs } = await client
        .from('player_fragments')
        .select('fragment_id')
        .eq('user_id', user.id)
        .gte('decode_level', 1)
        .limit(10)
      probeFragmentsCarry = (pfs || []).map(p => p.fragment_id)
    } catch { /* skip */ }

    // 装备快照（不实际占用）
    const equipmentSnapshot = {
      probe: player.loadout?.probe || null,
      shield: player.loadout?.shield || null,
      weapon: player.loadout?.weapon || null,
      comm: player.loadout?.comm || null,
    }

    // 探针属性按玩家当前 atk/def 推算（保守）
    const probeAtk = Math.max(8, Math.floor((player.atk || 10) * 0.7))
    const probeDef = Math.max(5, Math.floor((player.def || 8) * 0.6))
    const probeHp = Math.max(40, Math.floor((player.maxHp || 100) * 0.6))

    const leftProbe = await leaveProbe(client, {
      ownerId: user.id,
      chamberTemplateId: player.chamberIndex != null && Array.isArray(gamevars.raidPath)
        ? (gamevars.raidPath[player.chamberIndex]?.templateId || null)
        : null,
      equipmentSnapshot,
      atk: probeAtk,
      def: probeDef,
      hp: probeHp,
      fragmentsCarry: probeFragmentsCarry,
    })
    if (leftProbe) {
      probeLeftLog = `${player.name} 用【${partName}】留下了一座探针（HP ${probeHp}, ATK ${probeAtk}）— 7 天内其他玩家可能遭遇`
    }
  }

  // ── Phase 24b: 装备+物品全部折算成点数（不再写 stash） ──
  // 先统计 tech_fragment / omega_matter 数量给 endings.js 计数器（必须在 inventory 清空前算）
  const { data: poolItems } = await client
    .from('item_pool')
    .select('name, kind')
    .in('name', inventoryAfter.length > 0 ? [...new Set(inventoryAfter)] : ['__placeholder__'])
  const fragmentNames = new Set((poolItems || []).filter(i => i.kind === 'tech_fragment').map(i => i.name))
  const omegaNames    = new Set((poolItems || []).filter(i => i.kind === 'omega_matter').map(i => i.name))
  const fragmentsExtracted = inventoryAfter.filter(n => fragmentNames.has(n)).length
  const omegaExtracted     = inventoryAfter.filter(n => omegaNames.has(n)).length

  // 折算 → 点数
  let pointsCredits = []
  let pointsSummary = { equipCount: 0, itemCount: 0, perType: {} }
  let destroyedEquipIds = []
  try {
    const conv = await convertExtractToPoints(client, user.id, room, player, inventoryAfter)
    pointsCredits = conv.credits
    pointsSummary = conv.summary
    destroyedEquipIds = conv.destroyedEquipIds
  } catch (e) {
    console.error('[extractPlayer] convertExtractToPoints 失败:', e?.message)
  }

  // class_pt: 成功撤离里程碑 +1
  pointsCredits.push({ type: 'class_pt', amount: classPtForExtract() })
  pointsSummary.perType.class_pt = (pointsSummary.perType.class_pt || 0) + 1

  try {
    await creditPoints(client, user.id, pointsCredits)
  } catch (e) {
    console.error('[extractPlayer] creditPoints 失败:', e?.message)
  }

  // Phase 24b: equipment_instances 直接 DELETE（不再 SET room_id=NULL）
  if (destroyedEquipIds.length > 0) {
    await client.from('equipment_instances').delete().in('id', destroyedEquipIds)
  } else {
    // fallback：把本玩家在本 room 的 instance 全删（防 convert 失败时遗留）
    await client.from('equipment_instances')
      .delete()
      .eq('owner_id', user.id)
      .eq('room_id', room.id)
  }

  // ── 更新玩家状态 + gamevars 累积统计 ──
  const resolution = createActionResolution({ room, actorId: user.id, gamevars })
  clearEncounterIfAny(resolution, user.id, { silent: true })
  setResolutionPlayer(resolution, user.id, {
    ...player,
    encounter: null,
    inventory: [],
    extracted: true,
    extractedAt: new Date().toISOString(),
    extractionPoint: `map_${playerMapId}`,
    alive: true,
    lootPrompt: null,
    omegaCountdown: null,
    omegaMaterials: (player.omegaMaterials || 0) + omegaExtracted,
    extractedItems: [
      ...(player.extractedItems || []),
      // 留个汇总条目以便 archive / 结局横幅展示
      { name: '折算点数', quantity: pointsSummary.equipCount + pointsSummary.itemCount, atMap: playerMapId },
    ],
  })
  // Phase 25g (28-B P0): 累计 points_credited 到 gamevars,供 raid_stats 通胀埋点
  const econAcc = resolution.gamevars.economyAccumulator || { pointsCredited: {}, pointsSpent: {} }
  const accCredited = { ...(econAcc.pointsCredited || {}) }
  for (const c of pointsCredits) {
    if (c?.type && Number(c.amount) > 0) {
      accCredited[c.type] = (accCredited[c.type] || 0) + Math.round(Number(c.amount))
    }
  }
  resolution.gamevars = {
    ...resolution.gamevars,
    totalFragmentsExtracted: (resolution.gamevars.totalFragmentsExtracted || 0) + fragmentsExtracted,
    economyAccumulator: {
      ...econAcc,
      pointsCredited: accCredited,
    },
  }

  // 装备+道具数量汇总日志
  const pointsLogParts = []
  for (const [type, amt] of Object.entries(pointsSummary.perType)) {
    if (amt > 0) pointsLogParts.push(`+${amt} ${POINT_LABEL[type] || type}`)
  }
  const pointsTail = pointsLogParts.length > 0 ? `（${pointsLogParts.join(' · ')}）` : ''
  const totalCount = pointsSummary.equipCount + pointsSummary.itemCount
  const note = totalCount > 0
    ? `${player.name} 从【${mapConfig.name}】完成结构退避，折算 ${totalCount} 件物资${pointsTail}`
    : `${player.name} 从【${mapConfig.name}】完成结构退避${pointsTail}`
  appendResolutionLog(resolution, note, 'system')

  // Phase 21.2: 留探针日志
  if (probeLeftLog) {
    appendResolutionLog(resolution, probeLeftLog, 'system')
  }

  // Phase 18.1: 撤离链残片发现（extract chain）— 撤离成功 35% 概率
  // 撤离链残片往往是"深界时代撤离日志"类，写在玩家成功带回物资时
  try {
    if (Math.random() < 0.35) {
      const fragment = await discoverFragment(
        client, user.id, playerMapId,
        gamevars.envPollution || 0,
        room.gamenum || 1,
        { chain: 'extract' },
      )
      if (fragment) {
        const note2 = fragment.isNew
          ? `撤离后在归档中析出残片【${fragment.name}】`
          : `撤离归档过程中推进了【${fragment.name}】的解码（${fragment.decode_level}/3）`
        appendResolutionLog(resolution, `${player.name} ${note2}`, 'system')
        // Phase 20.4: 合成解锁日志
        for (const u of (fragment.comboUnlocks || [])) {
          appendResolutionLog(resolution, `🔗 解码完成，合成新残片【${u.name}】 ${u.comboDescription ? '— ' + u.comboDescription : ''}`, 'system')
        }
      }
    }
  } catch (e) {
    console.error('[extractPlayer] fragment discovery 失败:', e?.message)
  }

  // 玩家不再属于该对局
  await client.from('profiles').update({ roomid: null }).eq('id', user.id)

  const nextRoom = await persistResolutionWithPollution(client, room, resolution, user.id)

  // 合同进度：撤离推进 extract / extract_at
  try {
    await updateContractProgress(client, user.id, {
      type: 'extracted',
      extractionPointId: `map_${playerMapId}`,
      mapId: playerMapId,
    })
  } catch (e) {
    console.error('[extractPlayer] contract progress 失败:', e?.message)
  }

  return nextRoom
}

// ── 缝隙维护轨道（紧急撤离）：envPollution≥60% 时可在任何位置使用 ──
async function emergencyRetreat(client, room, gamevars, user) {
  const player = getPlayer(gamevars, user.id)
  if (!player?.alive) throw new Error('阵亡玩家无法使用缝隙维护轨道')
  if (player.extracted) throw new Error('已经撤离')
  if ((gamevars.envPollution || 0) < POLLUTION_CONFIG.EMERGENCY_UNLOCK) {
    throw new Error(`缝隙维护轨道未解锁（环境污染 ${gamevars.envPollution || 0}% < ${POLLUTION_CONFIG.EMERGENCY_UNLOCK}%）`)
  }

  const resolution = createActionResolution({ room, actorId: user.id, gamevars })
  clearEncounterIfAny(resolution, user.id)
  let nextPlayer = applyEmergencyRetreatPollution(player)
  nextPlayer = { ...nextPlayer, map: 0, omegaCountdown: null, encounter: null }
  setResolutionPlayer(resolution, user.id, nextPlayer)
  appendResolutionLog(
    resolution,
    `${player.name} 启动缝隙维护轨道，跳转至外环维护廊（个人污染 +${POLLUTION_CONFIG.EMERGENCY_COST}%）`,
    'system',
  )
  setVisitedMapFlag(resolution, 0)

  return persistResolutionWithPollution(client, room, resolution, user.id)
}

// ── 与非敌对实体交易 ──
async function tradeWithNpc(client, room, gamevars, user, payload) {
  const player = getPlayer(gamevars, user.id)
  if (!player?.alive) throw new Error('阵亡玩家无法交易')
  if (player.extracted) throw new Error('已撤离玩家无法交易')

  const npcId = Number(payload?.npcId)
  if (!npcId) throw new Error('缺少实体 ID')

  const { data: npc } = await client.from('npc_pool').select('*').eq('id', npcId).maybeSingle()
  if (!npc) throw new Error('实体不存在')
  if (!npc.tradeable) throw new Error(`${npc.name} 不可交易`)
  // Phase 19.5: 按 chamber_template_ids 过滤（替代旧 maps 字段）
  const curChamber = getChamberForPlayer(gamevars, player)
  const curTid = curChamber?.templateId ?? -1
  if (!Array.isArray(npc.chamber_template_ids) || !npc.chamber_template_ids.includes(curTid)) {
    throw new Error(`${npc.name} 不在你当前 chamber`)
  }

  const wants = npc.trade_wants
  const offers = npc.trade_offers
  if (!wants?.item || !offers?.item) {
    throw new Error('该实体的交易配置无效')
  }
  const needQty = Number(wants.qty) || 1
  const giveQty = Number(offers.qty) || 1

  let inventory = [...(player.inventory || [])]
  let have = inventory.filter(it => it === wants.item).length
  if (have < needQty) {
    throw new Error(`需要 ${wants.item} ×${needQty}，当前仅有 ×${have}`)
  }
  // 扣除 wants
  let removed = 0
  inventory = inventory.filter(it => {
    if (it === wants.item && removed < needQty) { removed++; return false }
    return true
  })
  // 加入 offers
  for (let i = 0; i < giveQty; i++) inventory.push(offers.item)

  const resolution = createActionResolution({ room, actorId: user.id, gamevars })
  clearEncounterIfAny(resolution, user.id)
  let nextPlayer = applyInteractPollution({
    ...player,
    encounter: null,
    inventory,
    entityInteractions: (player.entityInteractions || 0) + 1,
  })
  setResolutionPlayer(resolution, user.id, nextPlayer)
  resolution.gamevars = {
    ...resolution.gamevars,
    totalEntityInteractions: (resolution.gamevars.totalEntityInteractions || 0) + 1,
  }
  appendResolutionLog(
    resolution,
    `${player.name} 与 ${npc.name} 交易：${wants.item}×${needQty} → ${offers.item}×${giveQty}（个人污染 ${POLLUTION_CONFIG.INTERACT_PERSONAL}%）`,
    'system',
  )

  return persistResolutionWithPollution(client, room, resolution, user.id)
}

// ── 装载装备（raid 内动作） ──
async function equipLoadoutAction(client, room, gamevars, user, payload) {
  const player = getPlayer(gamevars, user.id)
  if (!player?.alive) throw new Error('阵亡玩家无法操作装备')
  if (player.extracted) throw new Error('已撤离玩家无法操作装备')

  const slot = payload?.slot
  const instanceId = payload?.instanceId
  if (!LOADOUT_SLOTS.includes(slot)) throw new Error(`未知装备槽：${slot}`)

  // null/undefined instanceId = 卸下
  if (!instanceId) {
    const resolution = createActionResolution({ room, actorId: user.id, gamevars })
    setResolutionPlayer(resolution, user.id, {
      ...player,
      loadout: { ...(player.loadout || {}), [slot]: null },
    })
    appendResolutionLog(resolution, `${player.name} 卸下了 ${slot} 槽装备`, 'system')
    return persistResolution(client, room, resolution)
  }

  // 校验装备实例属于本人 + 是 raid 中（room_id == 当前 room.id 或 NULL）+ slot 匹配
  const { data: inst } = await client
    .from('equipment_instances')
    .select('*, tier:equipment_tiers(*, series:equipment_series(slot,name))')
    .eq('id', instanceId)
    .maybeSingle()

  if (!inst) throw new Error('装备实例不存在')
  if (inst.owner_id !== user.id) throw new Error('该装备不属于你')
  const seriesSlot = inst.tier?.series?.slot
  if (seriesSlot !== slot) {
    throw new Error(`该装备槽位为 ${seriesSlot}，无法装入 ${slot}`)
  }

  const resolution = createActionResolution({ room, actorId: user.id, gamevars })
  setResolutionPlayer(resolution, user.id, {
    ...player,
    loadout: { ...(player.loadout || {}), [slot]: instanceId },
  })
  appendResolutionLog(resolution, `${player.name} 装上了 ${inst.tier?.name || '装备'}`, 'system')
  return persistResolution(client, room, resolution)
}

async function performItemUse(client, room, gamevars, user, itemName) {
  return resolveUseItemAction(client, room, gamevars, user, itemName)
}

export async function executeEquipmentAction(client, user, payload) {
  const roomId = Number(payload.roomId)
  if (!roomId) throw new Error('缺少对局 ID')

  const room = await fetchRoom(client, roomId)
  const gamevars = normalizeGamevars(room.gamevars)
  if (!getPlayer(gamevars, user.id)) {
    throw new Error('你还未加入该对局')
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
