import {
  applyBuff,
  calcDamage,
  calcItemEffect,
  evalFormula,
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
import { computeCombatStats } from '@/lib/combatStats'
import { applyItemCraft } from '@/lib/itemCraft'
import { collectModifiers, runCombatPipeline, OFFENSIVE_STAGES, DEFENSIVE_STAGES } from '@/lib/combatPipeline'
import { consumeDurabilityParallel } from '@/lib/server/equipmentDurability'
import { consumeForLoadout, addItemsToStash } from '@/lib/server/stash'
import { convertExtractToPoints, creditPoints, classPtForExtract, getBalances, POINT_LABEL } from '@/lib/server/points'
import { purchaseFromCatalog } from '@/lib/server/shop'
import { commitClassChoice, applyClassToPlayer, filterPerks } from '@/lib/server/classes'
import { resolvePortraitUrl } from '@/lib/server/portraits'
import { discoverFragment } from '@/lib/server/fragments'
import { logPlayerDeath } from '@/lib/server/deathLog'
import { generateRaidPath, mergeUnlocksRules } from '@/lib/server/pathGenerator'
import { leaveProbe, tryEncounterProbe, defeatProbe, recordProbeOutcome, buildOwnerPseudonym } from '@/lib/server/probes'
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
import { POLLUTION_CONFIG, LOADOUT_SLOTS, SIGNAL_LOCK, HIGH_RISK, BR_CONFIG, STAMINA_CONFIG, JUMP_CONFIG, KALEIDO, KALEIDO_GAME_TYPE } from '@/lib/constants'
import { sampleRun, buildLevelRows, evaluateExitCondition } from '@/lib/server/kaleido/runs'
import { getCombatMode, hashStr as kaleidoHashStr } from '@/lib/server/kaleido/combatModes'
import { emitPlayerEvents, buildDeathEvent, kaleidoLevelSeq, TURN_ACTIONS as KALEIDO_TURN_ACTION_LIST } from '@/lib/server/kaleido/events'
import { applyMoveStamina, applyStaminaCost, restoreStamina } from '@/lib/stamina'
// ── Phase 31 re-home: BR「100 房网格 + 大时钟」纯函数（gamevars 路径，复用独立 /br 模块的纯算法源） ──
import { computeClock, effectivePhase, clampPhaseSeconds, clampMaxPhase } from '@/lib/server/br/clock'
import { makeRaidSeed, forbidden, closePhasesObject, lootTier, MAX_CLOSE_PHASE, hashSeed, mulberry32 } from '@/lib/server/br/forbidden'
import { allocateRoomInventory, takeFromRoom, resolveRef } from '@/lib/server/br/roomItems'
import { allocateRoomNpcs, takeNpcFromRoom } from '@/lib/server/br/npcPlacement'
import { getRaidLayout, brLayoutHint } from '@/lib/server/br/raidLayout'
import { sanitizeHeatLevel, applyHeatPointsMultiplier, heatFragmentDropChance } from '@/lib/server/heat'
import { isSignalLockActive, beginSignalLock } from '@/lib/server/signalLock'
import {
  appendGameLog,
  applyRoomLifecycle,
  clearPlayerLootPrompt,
  createLogEntry,
  createCorpse,
  createPlayerState,
  getCurrentChamberTemplateId,
  getDisplayName,
  isKaleidoRoom,
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

// fn 收到当前 attempt 序号（0=首次）。速度/正确性：调用方据此在重试时**丢弃 stale prefetchedRoom**、
//   改 fetch 最新版本——否则并发下每次重试都拿旧 version 重撞乐观锁，3 次重试 100% 必废、纯烧 CPU+DB。
export async function withRetry(fn, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt)
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

/**
 * Phase 31 re-home: 把 BR 当前房的 templateMeta 拼成「伪 chamber 对象」，
 * 字段名对齐旧 pathGenerator 实例化形状（templateId/name/type/isExit/exitCost/pollutionBase/...），
 * 让 getChamberForPlayer / getChamberAsMapConfig / buildChamberAccelTable 的 BR 分支零成本复用现有逻辑。
 * 返回 null 表示无映射（防御：roomId 越界 / roomTemplates 缺失）。
 *
 * gamevars 瘦身：templateMeta 已移出 gamevars.br，改由调用方传入 layout（getRaidLayout(seed) 派生）。
 *   roomTemplates[player.roomId] 仍读 gamevars.br.roomTemplates（保留字段）；仅 templateMeta 查找走 layout。
 *   layout 缺省（null）或缺该 tid 时给最小可用字段兜底（理论不该发生）。
 *
 * @param {object} gamevars
 * @param {object} player
 * @param {object|null} layout getRaidLayout(client, seed) 结果（含 templateMeta）；非 BR / seed 缺失时可 null
 */
function getBrChamberForPlayer(gamevars, player, layout = null) {
  if (!gamevars?.br?.enabled || player?.roomId == null) return null
  const tid = gamevars.br.roomTemplates?.[player.roomId]
  if (tid == null) return null
  const meta = layout?.templateMeta?.[tid]
  if (!meta) {
    // 兜底：只有 templateId、无 meta（layout 缺省或 tid 越界，理论不该发生）；给最小可用字段
    return { templateId: tid, name: `扇区模板 ${tid}`, type: 'scan_dense', isExit: false }
  }
  // 已是伪 chamber 形状（roomTemplates.js toTemplateMeta 字段名即对齐）
  return { ...meta }
}

/** 取玩家当前所在 chamber（BR 房用 layout.templateMeta 拼伪 chamber；否则 raidPath[chamberIndex]）
 *  gamevars 瘦身：BR 分支的 templateMeta 改由 layout 传入（getRaidLayout(seed) 派生）。 */
function getChamberForPlayer(gamevars, player, layout = null) {
  // ── BR 分支：当前房 → 伪 chamber 对象 ──
  if (gamevars?.br?.enabled && player?.roomId != null) {
    return getBrChamberForPlayer(gamevars, player, layout)
  }
  // ── 旧 chamber 模式（不变） ──
  const path = Array.isArray(gamevars?.raidPath) ? gamevars.raidPath : []
  const idx = player?.chamberIndex ?? 0
  return path[idx] || null
}

/** 兼容旧 fetchMapConfig 调用 — 把 chamber 对象伪装成 map_config 形状
 *  gamevars 瘦身：BR 分支需 layout 取 templateMeta（getRaidLayout(seed) 派生）。 */
function getChamberAsMapConfig(gamevars, player, layout = null) {
  const ch = getChamberForPlayer(gamevars, player, layout)
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

/** Phase 19.5: 从 gamevars.raidPath 构建 chamber accel 表（key = templateId → pollutionAccel）
 *  Phase 31 re-home: BR 房从采样模板子集建表（raidPath 为空，全部采样模板的 accel）
 *  gamevars 瘦身：templateMeta 已移出 gamevars.br，BR 分支改读 layout.templateMeta（getRaidLayout(seed) 派生）。
 *  @param {object} gamevars
 *  @param {object|null} layout getRaidLayout 结果；非 BR / seed 缺失时可 null（BR 分支退化为空表，不影响污染 tick） */
function buildChamberAccelTable(gamevars, layout = null) {
  const table = new Map()
  // ── BR 分支：用采样模板子集的 pollutionAccel（来自 layout，非 gamevars） ──
  if (gamevars?.br?.enabled) {
    const meta = layout?.templateMeta || {}
    for (const [tid, m] of Object.entries(meta)) {
      table.set(Number(tid), Number(m?.pollutionAccel) || 0)
    }
    return table
  }
  // ── 旧 chamber 模式（不变） ──
  const path = Array.isArray(gamevars?.raidPath) ? gamevars.raidPath : []
  for (const ch of path) {
    table.set(ch.templateId, Number(ch.pollutionAccel) || 0)
  }
  return table
}

/**
 * Phase 31 re-home: 从 rooms 行 + gamevars.br 配置算 BR 大时钟视图（复用 br/clock.js computeClock）。
 * 把 rooms.started_at + gamevars.br 适配成 computeClock 入参（status / started_at / phase_seconds / max_phase）。
 * realPhase = min(maxPhase, floor((now - started_at)/phaseSeconds))；这是统一时间压力，取代 Ω-段倒计时。
 *
 * @param {object} room      rooms 行（gamestate / started_at）
 * @param {object} gamevars  normalize 后的 gamevars（含 br）
 * @returns {object} computeClock 结果（realPhase / phaseSeconds / maxPhase / secondsToNextPhase / ...）
 */
function getBrClock(room, gamevars) {
  const status = room?.gamestate === 1 ? 'active' : (room?.gamestate === 2 ? 'ended' : 'lobby')
  return computeClock({
    status,
    started_at: room?.started_at,
    phase_seconds: gamevars?.br?.phaseSeconds,
    max_phase: gamevars?.br?.maxPhase,
  })
}

/**
 * Phase 31 re-home: 玩家有效阶段 = effectivePhase(realPhase, player.depth, maxPhase)。
 * 本期 depth 恒 0 ⇒ effPhase === realPhase；所有禁区/移动校验都走 effPhase，
 * 后续加 depth 自动激活「跳跃者看更深禁区」（forbidden(seed, effPhase, roomId)）。
 */
function getBrEffectivePhase(room, gamevars, player) {
  const clock = getBrClock(room, gamevars)
  const depth = Number.isFinite(player?.depth) ? player.depth : 0
  return effectivePhase(clock.realPhase, depth, clock.maxPhase)
}

/** Phase 22: 死亡复盘埋点 — 从 room.started_at 算本局存活秒数（无 started_at → null） */
function raidSurvivedSeconds(room) {
  const startedAt = room?.started_at ? new Date(room.started_at).getTime() : null
  if (startedAt == null || Number.isNaN(startedAt)) return null
  const sec = Math.floor((Date.now() - startedAt) / 1000)
  return sec >= 0 ? sec : null
}

/** Phase 22: 死亡时 chamber 深度（1-based）— player.chamberIndex + 1（无效 → null，由 deathLog 兜底） */
function chamberDepthOf(player) {
  const idx = player?.chamberIndex
  return Number.isFinite(idx) && idx >= 0 ? idx + 1 : null
}

/**
 * 残片解码升级 toast 信号：当 discoverFragment 返回 leveledUp（newLevel > oldLevel）时，
 * 在 actor 的玩家状态写一个带自增 seq 的 lastFragmentLevelUp，客户端检测 seq 变化弹闪光 toast。
 * 升级反馈此前只在日志流里不够突出（沿用 Phase 16 lastPvpHit 的 seq 模式）。
 */
function markFragmentLevelUp(resolution, userId, fragment) {
  if (!fragment?.leveledUp) return
  const cur = getResolutionPlayer(resolution, userId)
  if (!cur) return
  setResolutionPlayer(resolution, userId, {
    ...cur,
    lastFragmentLevelUp: {
      seq: ((cur.lastFragmentLevelUp?.seq) || 0) + 1,
      name: fragment.name,
      level: fragment.decode_level,
      at: new Date().toISOString(),
    },
  })
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

/**
 * Phase 37 — 聚合一组已装备实例的乘区百分比（equipMult 分量）。
 *   tier.atk_pct/def_pct/hp_pct 之和（0.2=+20%）。新装备列默认 0 → 现有装备返回 {0,0,0}。
 */
function sumEquipMult(instances = []) {
  return instances.reduce((a, i) => {
    const t = i.tier || {}
    return {
      atk: a.atk + (Number(t.atk_pct) || 0),
      def: a.def + (Number(t.def_pct) || 0),
      hp:  a.hp  + (Number(t.hp_pct)  || 0),
    }
  }, { atk: 0, def: 0, hp: 0 })
}

/**
 * Phase 37 — 玩家战斗实体：薄适配器，委托统一引擎 computeCombatStats。
 *   职业 flat 已被 applyClassToPlayer baked 进 basePlayer.atk/def/maxHp → _classAdd={0,0,0}
 *   避免双计（铁律）。装备加法走 calcEquippedStats，装备乘区走 sumEquipMult。
 *
 * 平衡中性：新装备列默认 *_pct=0 → equipMult 因子全 1；玩家无 combat_hp_mult → classMultHp=1；
 *   代入公式后 atk/def/maxHp/hp 逐值 == 旧 buildCombatPlayer（见 combatStats.js 文件头证明）。
 */
function buildCombatPlayer(basePlayer, instances = []) {
  if (!basePlayer) return null
  const equipped = calcEquippedStats(instances)
  return computeCombatStats({
    ...basePlayer,
    maxHp: basePlayer.maxHp || 100,                                   // 默认 100 与旧式一致
    _classAdd: { atk: 0, def: 0, hp: 0 },                            // 已 baked → 0（避免双计）
    _equipAdd: { atk: equipped.totalAtk, def: equipped.totalDef, hp: equipped.totalHp },
    _equipMult: sumEquipMult(instances),
    classPerks: basePlayer.classPerks || {},
    _pass: instances.map(instance => instance.tier?.passive).filter(Boolean),
  })
}

/**
 * Phase 37 — NPC 战斗实体：镜像 buildCombatPlayer，走同一统一引擎。
 *   base ← npc_pool.atk/def/hp（hp 用实例镜像的 maxHp）；分量从实例已解析字段读
 *   （resolveNpcCombatProfile 在 spawn 时填 _classAdd/_equipAdd/_equipMult/classPerks/_pass）。
 *
 * 平衡中性：NPC class_id=null / loadout 空 → 全分量 {0,0,0} + perks={} →
 *   atk=npc.atk、def=npc.def、maxHp=instance.maxHp(=npc.hp) 逐值 == 旧裸 {...npc, hp, maxHp}。
 *
 * @param {object} instance normalizeNpcInstance 产物（含 npc 快照 + 镜像分量字段）
 * @param {number} [hpOverride] 当前血覆盖（反击时传攻击后的实例 HP）
 */
function buildCombatNpc(instance, hpOverride) {
  const npc = instance.npc || {}
  const curHp = hpOverride != null ? hpOverride : instance.hp
  return computeCombatStats({
    ...npc,                                          // 透传 npc 行（name/level/accuracy/counter_rate/...）
    atk:   Number(npc.atk) || 0,                     // base ← npc_pool.atk
    def:   Number(npc.def) || 0,                     // base ← npc_pool.def
    maxHp: instance.maxHp,                           // base ← npc_pool.hp（实例已镜像）
    hp:    curHp,
    _classAdd:  instance._classAdd  || { atk: 0, def: 0, hp: 0 },
    _equipAdd:  instance._equipAdd  || { atk: 0, def: 0, hp: 0 },
    _equipMult: instance._equipMult || { atk: 0, def: 0, hp: 0 },
    classPerks: instance.classPerks || {},
    _pass:      instance._pass || [],
  })
}

/**
 * Phase 37 — 批量解析 NPC 战斗 profile（确定性·全 DB join·无随机）。
 *   对每条 npc 行的 class_id / loadout_tiers 一次性批量查 classes / equipment_tiers，
 *   算出 _classAdd（职业 flat）、classPerks（白名单过滤 perks）、_equipAdd（已装备 tier 加法）、
 *   _equipMult（已装备 tier 百分比）、_pass（装备被动列表）。返回 { [npcId]: profile }。
 *
 *   NPC 装备以"快照"方式存在：loadout_tiers 只是 tierId，不铸实例 → 传伪实例 [{tier}]
 *   给 calcEquippedStats（其只读 inst.tier）。bonus_atk/def 视作 0（NPC 装备无强化）。
 *
 * 红线 ③：纯查询，无 Math.random，确定性。
 *
 * @returns {Promise<Record<number, {_classAdd, classPerks, _equipAdd, _equipMult, _pass}>>}
 */
async function resolveNpcCombatProfile(client, npcRows = []) {
  const rows = (npcRows || []).filter(Boolean)
  if (!rows.length) return {}

  const LOADOUT_SLOT_KEYS = ['probe', 'shield', 'weapon', 'comm']

  // 收集所有非空 tierId / class_id（去重）
  const tierIdSet = new Set()
  const classIdSet = new Set()
  for (const npc of rows) {
    const lo = npc.loadout_tiers && typeof npc.loadout_tiers === 'object' ? npc.loadout_tiers : {}
    for (const slot of LOADOUT_SLOT_KEYS) {
      if (lo[slot] != null) tierIdSet.add(lo[slot])
    }
    if (npc.class_id != null) classIdSet.add(npc.class_id)
  }

  // 一次性批量查 tier（带 passive + series.slot，复用既有 join 形状）与 class
  const [tierRes, classRes] = await Promise.all([
    tierIdSet.size
      ? client.from('equipment_tiers')
          .select('*, passive:passive_skills(*), series:equipment_series(slot,name)')
          .in('id', [...tierIdSet])
      : Promise.resolve({ data: [] }),
    classIdSet.size
      ? client.from('classes')
          .select('id, base_atk_bonus, base_def_bonus, base_hp_bonus, perks')
          .in('id', [...classIdSet])
      : Promise.resolve({ data: [] }),
  ])
  if (tierRes.error) console.error('[resolveNpcCombatProfile] equipment_tiers 查询失败:', tierRes.error.message)
  if (classRes.error) console.error('[resolveNpcCombatProfile] classes 查询失败:', classRes.error.message)

  const tierMap = (tierRes.data || []).reduce((a, t) => { a[t.id] = t; return a }, {})
  const classMap = (classRes.data || []).reduce((a, c) => { a[c.id] = c; return a }, {})

  const out = {}
  for (const npc of rows) {
    const cls = npc.class_id != null ? classMap[npc.class_id] : null
    const classAdd = cls
      ? { atk: Number(cls.base_atk_bonus) || 0, def: Number(cls.base_def_bonus) || 0, hp: Number(cls.base_hp_bonus) || 0 }
      : { atk: 0, def: 0, hp: 0 }
    const classPerks = cls ? filterPerks(cls.perks) : {}

    const lo = npc.loadout_tiers && typeof npc.loadout_tiers === 'object' ? npc.loadout_tiers : {}
    const pseudoInstances = LOADOUT_SLOT_KEYS
      .map(slot => tierMap[lo[slot]])
      .filter(Boolean)
      .map(tier => ({ tier, bonus_atk: 0, bonus_def: 0 }))   // NPC 装备无强化 → bonus 0
    const equipped = calcEquippedStats(pseudoInstances)

    out[npc.id] = {
      _classAdd:  classAdd,
      classPerks,
      _equipAdd:  { atk: equipped.totalAtk, def: equipped.totalDef, hp: equipped.totalHp },
      _equipMult: sumEquipMult(pseudoInstances),
      _pass:      pseudoInstances.map(i => i.tier?.passive).filter(Boolean),
    }
  }
  return out
}

async function settleCorpseGeneration(resolution) {
  await settleNewDeaths(resolution, async ({ player }) => {
    const result = ensurePlayerCorpse(resolution.gamevars, player)
    resolution.gamevars = result.gamevars
  })
  return resolution
}

/**
 * BR【缩圈致死】全房扫描（服务端权威 · wall-clock · 纯逻辑，无任何动作副作用）。
 *
 * 设计契约：玩家所在扇区随大时钟缩圈被收缩为禁区 ⇒ 直接致死（caught=dead，不驱离不掉血），
 * 复用与 PvP 阵亡**完全相同**的死亡后果路径，绝不另造一套惩罚：
 *   翻 alive=false（resolution 内）→ settleCorpseGeneration 生成可搜刮尸体 → logPlayerDeath(cause='contraction')
 *   → 收尾（alivenum/deathnum/winner/gamestate）由 persist→applyRoomLifecycle 据 alive 自动重算。
 *
 * 架构铁律（BR 大时钟纯 wall-clock，无服务端 tick）：致死只能由写操作触发、服务端权威（不信客户端）。
 *   realPhase 由 getBrClock(room, gamevars) 据 rooms.started_at 实时算（客户端谎报无效：服务端用
 *   wall-clock 重算，假触发判 cp<=effPhase=false → no-op）。判据 = `cp <= effPhase`，cp 读
 *   **gamevars.br.closePhases 快照**（与 moveToRoom 开放校验、客户端 cellStateFor 同一快照同一表达式），
 *   保证「能移进的房绝不会下一拍因同相位判定矛盾而被杀」——本期更强：move 与致死显式共用同源快照，
 *   不再依赖 seed 重算的隐含一致，且快照在 init 冻结 → 在飞局改 br_rooms 拓扑也不动当前局生死（红线①）。
 *   语义差：move 判目标房 target，致死判玩家**现所在房** p.roomId（被「脚下扇区收缩」吞没，非移动判定）。
 *
 * 前置守卫：(1) 非 BR 房 / 缺 seed → 整体 no-op（return [] 死亡名单）；(2) lobby/ended 时 getBrClock
 *   返回 realPhase=0 → effPhase=0 → cp<=0 恒 false，天然安全；(3) 逐玩家判 alive && !extracted && roomId!=null。
 *
 * 关键顺序：翻 alive 后必须**自己 await settleCorpseGeneration(resolution)**（与 PvP line 1552/1592
 *   同款，persist 链路不自动跑 settleNewDeaths），让被吞玩家也生成尸体。
 *
 * @param {object} client supabase service-role client（仅 logPlayerDeath 用）
 * @param {object} resolution createActionResolution 产物（直接原地翻 alive）
 * @param {object} room rooms 行（gamestate / started_at / gamenum）
 * @returns {Promise<Array<{playerId:string, player:object}>>} 本次被收缩致死名单（空数组 = 无）
 */
async function sweepContractionDeaths(client, resolution, room) {
  const br = resolution?.gamevars?.br
  // 守卫①：非 BR 房 / 缺 seed → 全程 no-op
  if (!br?.enabled || br.seed == null) return []

  // 守卫②：大时钟一次（lobby/ended → realPhase=0 → effPhase=0 → cp<=0 恒 false，天然安全）
  const clock = getBrClock(room, resolution.gamevars)
  // 致死改读快照：gamevars.br.closePhases（init 落，随 realtime 走）。与客户端 cellStateFor 同源同表达式 → 逐格一致。
  //   在飞局用自己 gamevars.br 快照判生死，不再实时 forbidden(seed,...) 重算 → 不被「新拓扑/别局编辑」破坏（红线①）。
  const closePhases = br.closePhases || {}
  const killed = []

  for (const [pid, p] of Object.entries(resolution.gamevars.players || {})) {
    // 守卫③：仅在场存活、未撤离、有所在房的玩家参与判定
    if (!p || p.alive === false || p.extracted || p.roomId == null) continue

    // 有效阶段：本期 depth 恒 0 ⇒ effPhase===realPhase；走 effPhase 后续加 depth 自动激活
    const depth = Number.isFinite(p.depth) ? p.depth : 0
    const effPhase = effectivePhase(clock.realPhase, depth, clock.maxPhase)
    // 【致死判据 — 与 forbidden() / 客户端 cellStateFor 语义逐格对齐】forbidden ⟺ closePhase <= effPhase。
    //   一律写 `cp <= effPhase`（即 effPhase >= closePhase），禁止写成 `<`（差一格会误判可活/误杀）。
    const cp = Number.isFinite(closePhases[p.roomId]) ? closePhases[p.roomId] : MAX_CLOSE_PHASE
    if (!(cp <= effPhase)) continue

    // 命中：翻 alive=false（清遭遇/探针/战利品提示，避免死亡态残留交互），写死亡日志条目
    setResolutionPlayer(resolution, pid, {
      ...p,
      alive: false,
      encounter: null,
      probeEncounter: null,
      lootPrompt: null,
    })
    appendResolutionLog(resolution, `${p.name} 被收缩边界吞没`, 'death')

    // 死亡日志：cause='contraction'，复用现有 survivedSeconds/chamberDepth helper
    try {
      await logPlayerDeath(client, pid, {
        roomId: room.id,
        gamenum: room.gamenum || 1,
        mapId: p.map ?? 0,
        reason: 'contraction',
        context: {
          roomId: p.roomId,
          closePhase: cp, // 复用上面已算的快照 cp（不再 closePhaseOf 重算）
          effPhase,
          envPollution: resolution.gamevars?.envPollution ?? 0,
        },
        survivedSeconds: raidSurvivedSeconds(room),
        chamberDepth: chamberDepthOf(p),
      })
    } catch (e) {
      console.error('[sweepContractionDeaths] deathLog 失败:', e?.message)
    }

    killed.push({ playerId: pid, player: p })
  }

  // 与 PvP 同款：翻 alive 后显式生成尸体一次（persist 链路不自动跑 settleNewDeaths）
  if (killed.length > 0) {
    await settleCorpseGeneration(resolution)
  }

  return killed
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
    // gamevars 瘦身：BR 房的 templateMeta 已移出 gamevars → 此处按 seed 取 layout（memo 命中无额外 IO），
    //   非 BR 房或 seed 缺失（旧 enabled:false 房）→ layout=null，buildChamberAccelTable 走非 BR 分支。
    const gvBr = resolution.gamevars?.br
    const layout = gvBr?.enabled && gvBr.seed != null
      ? await getRaidLayout(client, gvBr.seed, brLayoutHint(gvBr))
      : null
    // Phase 19.5: 从 gamevars.raidPath / layout.templateMeta 算 accel 表（替代 DB 查询）
    const accelTable = buildChamberAccelTable(resolution.gamevars, layout)
    resolution.gamevars = tickEnvPollution(resolution.gamevars, accelTable)

    // Phase 31 re-home: BR 下大时钟（缩圈）成为唯一时间压力 → Ω-段倒计时 dormant（不 tick）。
    //   非 BR 房保持原 Ω 倒计时行为不变。
    const player = getResolutionPlayer(resolution, userId)
    if (!resolution.gamevars?.br?.enabled && player?.alive && !player?.extracted) {
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

  // BR【缩圈致死】全房扫描：在 ticks 之后、分支/结局评估之前跑一次，使**任何玩家动作**都触发
  //   全房 sweep（含发起者自己踩进缩圈禁区的情形）。服务端权威按 rooms.started_at wall-clock 判，
  //   翻 alive 后由 settleCorpseGeneration 生成尸体；收尾交给下方 persist→applyRoomLifecycle。
  //   非 BR 房 / 缺 seed → 函数内部 no-op，零开销。
  try {
    await sweepContractionDeaths(client, resolution, room)
  } catch (e) {
    console.error('[contraction sweep] 失败:', e?.message)
  }

  try {
    await evaluateBranchNodes(client, resolution, userId)
  } catch (e) {
    console.error('[branches] 评估失败:', e?.message)
  }
  // KALEIDO 局用自己的 exit_condition/收敛，不走远星函馆四结局（守卫非 kaleido = 原逻辑，逐字节不变）。
  if (!isKaleidoRoom(room)) {
    try {
      await applyEndingIfTriggered(client, resolution)
    } catch (e) {
      console.error('[endings] 应用失败:', e?.message)
    }
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

  // Phase 31 re-home: BR 局 chamberIndex 恒 0（chamber 维度无意义）→ 附 BR 元数据兜底。
  //   不阻塞主流程；非 BR 局 br 字段为 null/false 时不写额外维度。
  const isBr = gv.br?.enabled === true
  const brMetadata = isBr
    ? {
        br_seed: gv.br?.seed ?? null,
        br_phase_seconds: gv.br?.phaseSeconds ?? null,
        br_max_phase: gv.br?.maxPhase ?? null,
        player_rooms: players.map(p => p?.roomId ?? null),
      }
    : {}

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
      ...brMetadata,
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

// Phase 37: 修死掉落 bug —— 改读 instance.inventory(item_slots) + instance.loadout(loadout_tiers)
//   取代不存在的 npc.drop_items（旧代码读它永远 undefined → NPC 啥都不掉）。
//   平衡中性：旧 NPC item_slots=[]/loadout={} → entries=[] 与现状一致；填了槽位才有掉落（= bug 修复）。
async function createNpcCorpse(client, gamevars, instance, mapId) {
  const npc = instance.npc || {}
  const itemSlots = Array.isArray(instance.inventory) ? instance.inventory : []   // [{item, qty}]
  const loadout = instance.loadout && typeof instance.loadout === 'object' ? instance.loadout : {} // {slot: tierId}

  // (a) 物品掉落：item_slots 的 item 名按 qty 展开 → 复用 fetchNpcDropTierMap（按名 join tier；非 tier 当 item）
  const itemNames = itemSlots
    .flatMap(s => Array(Math.max(1, Number(s?.qty) || 1)).fill(s?.item))
    .filter(Boolean)
  // (b) 装备掉落：loadout 的 tierId → 直接按 id fetch equipment_tiers
  const tierIds = ['probe', 'shield', 'weapon', 'comm'].map(sl => loadout[sl]).filter(Boolean)

  const [tierMapByName, tierMapById] = await Promise.all([
    fetchNpcDropTierMap(client, itemNames),                                       // 现有（按 name）
    tierIds.length
      ? client.from('equipment_tiers')
          .select('id, name, rarity, series:equipment_series(slot,name), durability_max')
          .in('id', tierIds)
          .then(({ data }) => (data || []).reduce((a, t) => { a[t.id] = t; return a }, {}))
      : Promise.resolve({}),
  ])

  const entries = [
    ...itemNames.map(name => resolveNpcDropEntry(name, tierMapByName[name])),     // 复用现有解析
    ...tierIds.map(id => tierMapById[id] && resolveNpcDropEntry(tierMapById[id].name, tierMapById[id])),
  ].filter(Boolean)

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

/** 由一条 npc_pool 行铸新 NPC 实例并推进 gamevars.npcInstances（程序化 spawn 与 authored materialize 共用）。
 *  Phase 37 字段构造（class/loadout → _classAdd/_equipAdd/_equipMult/classPerks/_pass · 确定性 DB join）。
 *  唯一可变项是「npc 行从何而来」（pickOrSpawn 随机抽 / materializeAuthoredNpc 按 id fetch）—— 抽取在调用方完成，本函数只负责构造+落表。
 *  mapId = 调用点传入（=currentChamber.templateId=roomTemplates[roomId]）→ 保 combat(buildCombatNpc) / corpse(createNpcCorpse) mapId 匹配。
 */
async function spawnNpcInstanceFromRow(client, resolution, mapId, npc) {
  if (!npc) return null
  // 确定性解析此 NPC 的战斗 profile（无随机；纯 DB join）。失败时回落空 → 走中性默认。
  let profile = {}
  try {
    const resolved = await resolveNpcCombatProfile(client, [npc])
    profile = resolved[npc.id] || {}
  } catch (e) {
    console.error('[spawnNpcInstanceFromRow] resolveNpcCombatProfile 失败:', e?.message)
  }
  const instance = normalizeNpcInstance({
    npcId: npc.id,
    npc,
    hp: Number(npc.hp) || 1,
    maxHp: Number(npc.hp) || 1,
    mapId,
    classId:    npc.class_id ?? null,
    classPerks: profile.classPerks || {},
    loadout:    npc.loadout_tiers || {},
    inventory:  Array.isArray(npc.item_slots) ? npc.item_slots : [],
    _classAdd:  profile._classAdd  || { atk: 0, def: 0, hp: 0 },
    _equipAdd:  profile._equipAdd  || { atk: 0, def: 0, hp: 0 },
    _equipMult: profile._equipMult || { atk: 0, def: 0, hp: 0 },
    _pass:      profile._pass || [],
  })
  resolution.gamevars = {
    ...resolution.gamevars,
    npcInstances: [...(resolution.gamevars.npcInstances || []), instance],
  }
  return { instance, spawned: true }
}

/**
 * Phase 38: 把 authored 投放取到的 npcId materialize 成战斗实例（与程序化 spawn 同形 { instance, spawned:true }）。
 *   1) 按 npcId fetch npc_pool 行（无行 → return null → 调用方回落程序化 spawn）；
 *   2) 复用 spawnNpcInstanceFromRow（Phase 37 profile + normalizeNpcInstance + 推 gamevars.npcInstances）。
 *   与 pickOrSpawnNpcInstance 的唯一差异：npc 行来自【按 npcId fetch】而非随机抽 npcPool。
 *   mapId 由调用点传入（保 combat/corpse 匹配，见 spawnNpcInstanceFromRow）。
 */
async function materializeAuthoredNpc(client, resolution, mapId, npcId) {
  const { data: npc } = await client.from('npc_pool').select('*').eq('id', npcId).maybeSingle()
  if (!npc) return null // 投放指向已删 NPC → 回落程序化 spawn
  return spawnNpcInstanceFromRow(client, resolution, mapId, npc)
}

/** 抽 / 新建 NPC 实例（搜索遭遇时用）
 *  策略：60% 概率从同地图存活实例池抽，40% 概率新建（池为空必新建）
 */
// Phase 37: 改 async 并接 client —— 仅在【新 spawn】时解析 NPC 战斗 profile（委托 spawnNpcInstanceFromRow）。
// Phase 38: 原生非确定 Math.random 改种子确定性 RNG（seedHint）——回落路径（authored 取不到）仍走它，NPC 照常出现·零功能回归。
//   det = mulberry32(hashSeed(seed,'npcspawn:'+roomId+':'+turn))；非 BR / 无 seed → 回退 Math.random（旧行为·向后兼容）。
//   同一 turn 内多次搜可能复算同流 —— 可接受（reuse 概率语义·与道具一次性不同）。
async function pickOrSpawnNpcInstance(client, resolution, mapId, npcPool, seedHint) {
  // 种子确定性 RNG（替代 3 处 Math.random）：非 BR / 无 seed → 回退 Math.random（旧行为·向后兼容）
  const det = (seedHint?.seed != null)
    ? mulberry32(hashSeed(seedHint.seed, 'npcspawn:' + (seedHint.roomId ?? -1) + ':' + (seedHint.turn ?? 0)))
    : Math.random
  const live = (resolution.gamevars.npcInstances || []).filter(i => i.mapId === mapId && i.hp > 0)
  const reuse = live.length > 0 && det() < 0.6
  if (reuse) {
    return { instance: live[Math.floor(det() * live.length)], spawned: false }
  }
  if (!npcPool || npcPool.length === 0) {
    if (live.length > 0) return { instance: live[Math.floor(det() * live.length)], spawned: false }
    return null
  }
  const npc = npcPool[Math.floor(det() * npcPool.length)]
  return spawnNpcInstanceFromRow(client, resolution, mapId, npc)
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

  // ── 体力结算（平消耗 · additive）：必须在任何 await / 产出 loot/污染 等副作用之前，保证拦截零副作用。 ──
  //   nowMs 取一次；applyStaminaCost 内部 backfill→懒回复→判够→扣除（只刷 staminaAt，不刷 lastMoveAt，避免污染 move 的 dt 锚点）。
  //   扣后体力字段（staminaResult.player）随后并入 polluted，整条产出链沿用含新体力的玩家对象。
  const nowMs = Date.now()
  const staminaResult = applyStaminaCost(player, nowMs, isKaleidoRoom(room) ? 0 : STAMINA_CONFIG.SEARCH_COST)
  if (staminaResult.blocked) {
    throw Object.assign(new Error('体力不足，无法搜索'), { code: 'no_stamina' })
  }

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
  //   体力：把开头平消耗扣后的字段（staminaResult.player）并入 polluted，使后续所有产出分支（spread polluted）携带新体力。
  const polluted = {
    ...applySearchPollution(nextPlayer),
    stamina:    staminaResult.player.stamina,
    staminaAt:  staminaResult.player.staminaAt,
    maxStamina: staminaResult.player.maxStamina ?? STAMINA_CONFIG.MAX_STAMINA,
    // lastMoveAt 不并入：平消耗不触碰移动锚点（nextPlayer 原值即 staminaResult.player.lastMoveAt，保持一致）
  }
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
    // ── Phase 38/39: authored 敌人投放（roomNpcs materialize）——authored-only 局唯一 NPC 来源 ──
    //   红线：此块在 npcChance 门内（已过出现率/体力/roll 门），authored 命中仍受这一切约束·不旁路。
    //   取到 npcId → materializeAuthoredNpc（fetch npc_pool + resolveNpcCombatProfile + normalizeNpcInstance·mapId=roomTemplates[roomId]） → 推 npcInstances → encounter。
    //   取不到（无投放/未显形/已取完/fetch 失败）：authored-only 局 → 不刷怪（picked 留 null）；旧在飞局/非 BR → 回落 pickOrSpawnNpcInstance。
    let picked = null
    const brBlk = resolution.gamevars?.br
    // ── Phase 39（chamber 退役·只关刷怪）：有 roomNpcs 快照的 BR 局 = authored-only ──
    //   敌人只来自 👹 敌人投放（roomNpcs）。无投放 / 未显形 / 已取完 → 不刷怪（不再回落程序化 spawn）。
    //   旧在飞局（快照无 roomNpcs 字段）/ 非 BR 局 → 保留程序化 spawn（向后兼容·零回归）。
    //   ⇒ 呼应用户「敌人慢慢做」：未编排的房就是空房，编排一条 npc_placement_rules 即在该房刷出。
    const authoredOnly = !!(brBlk?.enabled && brBlk.roomNpcs)
    if (brBlk?.enabled && player.roomId != null && brBlk.roomNpcs) {
      const effPhase = getBrEffectivePhase(room, resolution.gamevars, polluted)
      const npcId = takeNpcFromRoom(brBlk.roomNpcs, player.roomId, effPhase) // 就地标 taken（持久化进 gamevars.br.roomNpcs）
      if (npcId != null) {
        try {
          picked = await materializeAuthoredNpc(client, resolution, mapId, npcId)
        } catch (e) {
          console.error('[searchArea] authored NPC materialize 失败:', e?.message)
          picked = null
        }
      }
    }
    // authored-only 局取不到 authored 敌人 → 不刷怪（picked 留 null，落入下方 corpse/item 分支）。
    // 仅非 authored-only（旧在飞局 / 非 BR）才回落程序化 spawn（seedHint 让原生随机种子确定性化）。
    if (!picked && !authoredOnly) {
      picked = await pickOrSpawnNpcInstance(client, resolution, mapId, bundle.npcPool, {
        seed: brBlk?.seed,
        roomId: player.roomId,
        turn: resolution.gamevars?.turn,
      })
    }
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
    // ── Phase 34: authored 房间投放优先（roomInv 取货） — 先于程序化 amount 抽取 ──
    //   仅 BR 房且本房有库存时尝试；取到 → 发该件并 return（消耗本次搜索）；取不到 → 回落下方程序化抽取。
    //   红线：此块在 1240 门控内（已过 itemChance/污染/体力/roll 门），authored 命中仍受这一切约束，不旁路经济；
    //         hit===null（无投放/未显形/已取完/装备 INSERT 失败）一律不 return → 落 amount 权重 + lootByDepth（经济基线分毫不动）。
    const brBlk = resolution.gamevars?.br
    if (brBlk?.enabled && player.roomId != null && brBlk.roomInv) {
      const effPhase = getBrEffectivePhase(room, resolution.gamevars, polluted)
      const hit = takeFromRoom(brBlk.roomInv, player.roomId, effPhase) // 就地标 taken（持久化进 gamevars.br.roomInv）
      if (hit) {
        const ref = resolveRef(brBlk.roomInvRefs, hit.kind, hit.refIdx)

        if (hit.kind === 1) {
          // ── 装备件：走现有 createLootSideEffect 的 equipment_instances INSERT（不另造；耐久=tier.durability_max） ──
          const tierId = ref.tierId
          let sideEffect = null
          try {
            // corpse=null 安全：createLootSideEffect equipment_tier 分支只读 entry.type/entry.tierId，不引用 corpse。
            sideEffect = await createLootSideEffect(client, room.id, user.id, null, { type: 'equipment_tier', tierId })
          } catch (e) {
            console.error('[searchArea] authored 装备投放失败（回落程序化）:', e?.message)
            sideEffect = null
          }
          if (sideEffect) {
            let tierName = '未知装备'
            try {
              const { data: tierRow } = await client.from('equipment_tiers').select('name').eq('id', tierId).single()
              if (tierRow?.name) tierName = tierRow.name
            } catch (e) { /* 名称仅用于日志，失败不影响发放 */ }
            appendResolutionLog(resolution, `${player.name} 在此处找到了装备【${tierName}】`, 'heal')
            return await persistResolutionWithPollution(client, room, resolution, user.id)
          }
          // INSERT 失败 → 不 return，落入下方程序化抽取（authored 失败不吞搜索结果）
        } else {
          // ── item 件：inventory push × bundle_count（读 item_pool.bundle_count；authored 可投放任意道具，故跨本房模板池兜底全量缓存） ──
          const found = bundle.itemPool.find((i) => i.name === ref.itemName)
            || (Array.isArray(_allItemsCache) ? _allItemsCache.find((i) => i.name === ref.itemName) : null)
          const bundleCount = Math.max(1, Number(found?.bundle_count) || 1)
          const addEntries = Array(bundleCount).fill(ref.itemName)
          setResolutionPlayer(resolution, user.id, {
            ...polluted,
            inventory: [...(polluted.inventory || []), ...addEntries],
          })
          const log = bundleCount > 1
            ? `${player.name} 找到了 ${ref.itemName} ×${bundleCount}`
            : `${player.name} 找到了 ${ref.itemName}`
          appendResolutionLog(resolution, log, 'heal')
          const persisted = await persistResolutionWithPollution(client, room, resolution, user.id)
          return persisted
        }
      }
      // hit===null → 不 return，继续往下走现有程序化抽取（回落保底）
    }

    // 按 amount 权重抽 1 件（原逻辑封装为闭包，供基础抽取 + 深度额外抽取共用同一分布）
    const totalWeight = bundle.itemPool.reduce((sum, item) => sum + (item.amount || 1), 0)
    const pickLooseItem = () => {
      let remain = Math.random() * totalWeight
      let picked = bundle.itemPool[0]
      for (const item of bundle.itemPool) {
        remain -= item.amount || 1
        if (remain <= 0) { picked = item; break }
      }
      return picked
    }

    // 一件 item → inventory 条目数（= 一次性 push 进 inventory 的同名条目数 = 可用次数）。
    //   Phase 34: 广义化 BUNDLE — 读 item_pool.bundle_count（DB 运行时权威；恢复剂=6，其余 default 1）。
    //   原硬比 STAMINA_CONFIG.RECOVERY_ITEM.NAME 已废（该常量降为 client/文档 single-source，不再做分发）。
    const entriesForItem = (item) => {
      const bundleCount = Math.max(1, Number(item.bundle_count) || 1)
      return Array(bundleCount).fill(item.name)
    }

    const found = pickLooseItem()

    // ── lootByDepth（深度物资代差·对冲跳跃风险 · JUMP_CONFIG.LOOT_BY_DEPTH 旋钮）──
    //   只在 br.enabled && seed && depth>0 时缩放；书写者(depth0) extraRolls=0 ⇒ 产出与现状完全一致（零经济膨胀基线）。
    //   公式：extraRolls = clamp(tier - realTier, 0, EXTRA_ROLL_CAP)，即「跳跃带来的档位增量」每 +1 档多产 1 件（≤2）。
    //   tier 按该玩家有效阶段档位 lootTier(seed, effPhase, roomId)；realTier 按书写者基准（realPhase）。
    const br = resolution.gamevars?.br
    const playerDepth = Number.isFinite(polluted.depth) ? polluted.depth : 0
    let depthTier = 0
    let extraItems = []
    if (br?.enabled && br.seed != null && playerDepth > 0 && player.roomId != null) {
      const effPhase = getBrEffectivePhase(room, resolution.gamevars, polluted)
      const realPhase = getBrClock(room, resolution.gamevars).realPhase
      depthTier = lootTier(br.seed, effPhase, player.roomId)
      const realTier = lootTier(br.seed, realPhase, player.roomId)
      const cap = Math.max(0, Number(JUMP_CONFIG.LOOT_BY_DEPTH.EXTRA_ROLL_CAP) || 0)
      const extraRolls = Math.max(0, Math.min(cap, depthTier - realTier))
      for (let i = 0; i < extraRolls; i++) extraItems.push(pickLooseItem())
    }

    // 汇总所有抽到的 item（基础 + 深度额外），各自按 bundle 规则展开成 inventory 条目
    const allPicked = [found, ...extraItems]
    const addedEntries = allPicked.flatMap(entriesForItem)
    setResolutionPlayer(resolution, user.id, {
      ...polluted,
      inventory: [...(polluted.inventory || []), ...addedEntries],
    })

    // 日志：基础一行（保留原文案 + bundle ×N），深度额外件单独一行并标注代差来源（深度 N·T{tier}）
    const foundBundle = entriesForItem(found).length
    const foundLog = foundBundle > 1
      ? `${player.name} 找到了 ${found.name} ×${foundBundle}`
      : `${player.name} 找到了 ${found.name}`
    appendResolutionLog(resolution, foundLog, 'heal')
    if (extraItems.length > 0) {
      const extraDesc = extraItems.map(it => it.name).join('、')
      appendResolutionLog(
        resolution,
        `↳ 深层余烬额外析出：${extraDesc}（深度 ${playerDepth} 物资·T${depthTier}）`,
        'heal',
      )
    }

    const persisted = await persistResolutionWithPollution(client, room, resolution, user.id)
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
        markFragmentLevelUp(resolution, user.id, fragment)
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
// ── 战斗钩子管线 · 统一中性闸口 helper（P2/P3 共用·守 Phase 37 中性铁律）────────────
//   把「base 主伤害 → 扣血」之间的管线接线收成一处：仅当存在 stage 非空 modifier 时介入。
//   空池（今天所有 passive_skills.stage=NULL ⇒ collectModifiers 返回 []）⇒ 直接 return damageRaw，
//   与未接管线逐字节等价（smoke-pipeline.mjs 已对 runCombatPipeline 空池恒等做 500 组随机断言）。
//   attacker/defender 传 buildCombat*/computeCombatStats 产物（取 _pass 与 atk/def/hp/maxHp）；
//   defenderHp 供 insurance（保命）/seckill（秒杀）阶段 clamp；label 标注是哪条战斗路径，便于线上观测。
//   命中 invincible/seckill/insurance/limit 时往 resolution 追一条 'buff' 日志。
function applyCombatPipeline(damageRaw, { attacker, defender, defenderHp, resolution, label } = {}) {
  // 方向性收集（Phase 43 P4.5）：进攻型阶段仅取攻方来源（装备被动 _pass + 职业 pipeline_modifiers），
  //   防御型阶段仅取守方来源 —— 守方的「加伤」不会抬高自己受到的伤害、攻方的「保命」不会护住敌人。
  //   collectModifiers 对非数组源安全忽略；全空 ⇒ [] ⇒ 短路（守 Phase 37 中性）。
  const mods = [
    ...collectModifiers(attacker?._pass || [], attacker?.classPerks?.pipeline_modifiers || [])
      .filter(m => OFFENSIVE_STAGES.includes(m.stage)),
    ...collectModifiers(defender?._pass || [], defender?.classPerks?.pipeline_modifiers || [])
      .filter(m => DEFENSIVE_STAGES.includes(m.stage)),
  ]
  if (!mods.length) return damageRaw   // 中性短路：与未接管线逐值等价
  const piped = runCombatPipeline({
    base: damageRaw,
    defenderHp,
    modifiers: mods,
    vars: {
      atk: attacker?.atk, def: defender?.def,
      hp: attacker?.hp, maxHp: attacker?.maxHp,
      enemyHp: defenderHp, targetHp: defenderHp, targetMaxHp: defender?.maxHp,
    },
  }, evalFormula)
  const fl = []
  if (piped.flags.invincible) fl.push('无敌·伤害归 0')
  if (piped.flags.seckill)    fl.push('秒杀')
  if (piped.flags.insurance)  fl.push('保命·留 1 血')
  if (piped.flags.limited)    fl.push('限伤')
  if (fl.length && resolution) {
    appendResolutionLog(resolution, `⚙ 战斗管线${label ? `（${label}）` : ''}：${fl.join(' / ')}`, 'buff')
  }
  return piped.damage
}

// ── P6 触发事件派发 · on_hp_below_30（受击后 HP 从 ≥30% 跌破 <30% 且仍存活时触发绝地/保命类被动）────
//   无状态跨阈检测：每次战斗从存储 hp 重算 ⇒ 愈过 30% 再跌破自然重触发、持续低于不重触发。
//   defenderCombat 传 buildCombat* 产物（取 _pass）。当前 0 tier 绑定被动 ⇒ _pass 空 ⇒ triggerPassives 无命中 ⇒
//   logs 空 ⇒ 直接 return，resolution 玩家逐值不变（守 Phase 37 中性）。命中则合并 hp(治疗)/buffs/cooldowns。
function dispatchHpBelow30(resolution, userId, defenderCombat, enemyCombat, prevHp, newHp, buffPool) {
  const maxHp = defenderCombat?.maxHp || 1
  if (newHp <= 0 || !(prevHp / maxHp >= 0.3 && newHp / maxHp < 0.3)) return
  const { attackerUpdated, logs } = triggerPassives(
    'on_hp_below_30', { ...defenderCombat, hp: newHp }, enemyCombat || null, defenderCombat?._pass || [], buffPool,
  )
  if (!logs.length) return   // 无被动命中（0 绑定 ⇒ 恒此路·逐值中性）
  appendResolutionLogs(resolution, logs, 'buff')
  const cur = getResolutionPlayer(resolution, userId)
  if (!cur) return
  setResolutionPlayer(resolution, userId, {
    ...cur,
    hp: attackerUpdated.hp,
    alive: attackerUpdated.hp > 0,
    buffs: attackerUpdated.buffs || cur.buffs || [],
    passiveCooldowns: attackerUpdated.passiveCooldowns || cur.passiveCooldowns || {},
  })
}

// ── P6 触发事件派发 · on_turn_start（行动方在本次战斗动作起手时触发·每回合类被动）────
//   异步逐动作模型下「你的回合 = 你的战斗动作」：在 3 条战斗动作起手（calcDamage 前）对行动方派发，
//   用该动作已拉取的 _pass（零额外查询·不入 gamevars·避与 ⚙️ P5 瘦身冲突）。0 绑定 ⇒ _pass 空 ⇒
//   triggerPassives 返回等值浅拷贝、logs 空 ⇒ 逐值中性。返回更新后的 actorCombat（stat_boost 可作用于随后 calcDamage）。
function dispatchTurnStart(resolution, actorCombat, buffPool) {
  const { attackerUpdated, logs } = triggerPassives('on_turn_start', actorCombat, null, actorCombat?._pass || [], buffPool)
  if (logs.length) appendResolutionLogs(resolution, logs, 'buff')
  return attackerUpdated
}

// ═══════════════════════════════════════════════════════════════
// KP1 LW-2：stance_duel 关的攻击结算（裁决 C：真接 combatModes.resolveTurn）
//   一次 attackNpc = 一次完整交换（玩家出姿态 + 敌方确定性出招 + 双向克制伤害）。
//   驻留态（软锁教训·「多回合 encounter 生命周期」自测第一项）：
//   - rngState/姿态计数/回合数 存 player.kaleidoDuel（按 instanceId 键控；换目标自动重建；
//     种子 = hashStr(runId:instanceId:duel) → R3 run 派生确定性,同局同序可回放）。
//   - 敌活着 **不清 encounter**（决斗锁定,从根上避开 attackNpc 富路径的一击脱离软锁类坑）;
//     杀死才清 encounter + kaleidoDuel。
//   经济等价：杀敌复用 createNpcCorpse+lootPrompt（与 standard 击杀同款掉落）。
//   仅 kaleido ∧ stance_duel 关进入（调用点双闸）→ 多人局/其它关零变化。
// ═══════════════════════════════════════════════════════════════
async function resolveStanceDuelAttack(client, room, gamevars, user, payload, instance, node) {
  const player = getPlayer(gamevars, user.id)
  const kal = gamevars.kaleido || {}
  const mode = getCombatMode('stance_duel')
  const params = node.kaleidoMode?.params || {}

  // 姿态白名单（缺省/脏值回落 'atk'——bot/旧客户端无 stance 也能打）
  const stance = ['atk', 'def', 'skill'].includes(payload?.stance) ? payload.stance : 'atk'
  const STANCE_LABEL = { atk: '攻', def: '守', skill: '技' }

  // 驻留态：同一 instance 续用；换目标/首次 → 以 run+instance 派生种子重建（确定性）
  const saved = (player.kaleidoDuel && player.kaleidoDuel.instanceId === instance.id) ? player.kaleidoDuel : null
  const state = {
    player: { hp: player.hp, maxHp: player.maxHp || 100, atk: player.atk || 0, def: player.def || 0, potions: 0, heal: 0 },
    enemy: { hp: instance.hp, maxHp: instance.maxHp || instance.hp, atk: instance.npc?.atk || 8, def: instance.npc?.def || 3 },
    turn: saved?.turn ?? 0,
    rngState: saved?.rngState ?? kaleidoHashStr(`${kal.runId || 'run'}:${instance.id}:duel`),
    over: false,
    outcome: null,
    playerStanceCounts: saved?.playerStanceCounts ?? { atk: 0, def: 0, skill: 0 },
  }

  const next = mode.resolveTurn(state, { type: `stance:${stance}` }, params)
  const dmgDealt = Math.max(0, state.enemy.hp - next.enemy.hp)
  const dmgTaken = Math.max(0, state.player.hp - next.player.hp)
  const enemyStance = STANCE_LABEL[next.lastEnemyStance] || '?'
  const enemyDead = next.enemy.hp <= 0
  const playerDead = next.player.hp <= 0

  const resolution = createActionResolution({ room, actorId: user.id, gamevars })
  appendResolutionLog(
    resolution,
    `⚔ ${player.name} 出【${STANCE_LABEL[stance]}】· ${instance.npc?.name || '敌体'} 出【${enemyStance}】—— 造成 ${dmgDealt} 伤害${dmgTaken > 0 ? `，受到 ${dmgTaken} 反击` : ''}`,
    'damage',
  )

  let nextPlayer = {
    ...player,
    hp: Math.max(0, next.player.hp),
    alive: !playerDead,
    // 敌活着保持锁定（不清 encounter）；杀死才解除
    encounter: enemyDead ? null : { instanceId: instance.id },
    kaleidoDuel: (enemyDead || playerDead) ? null
      : { instanceId: instance.id, rngState: next.rngState, playerStanceCounts: next.playerStanceCounts, turn: next.turn },
  }

  if (enemyDead) {
    nextPlayer = { ...nextPlayer, kills: (player.kills || 0) + 1, entityKills: (player.entityKills || 0) + 1 }
    resolution.gamevars = {
      ...resolution.gamevars,
      npcInstances: (resolution.gamevars.npcInstances || []).filter(i => i.id !== instance.id),
      totalEntityKills: (resolution.gamevars.totalEntityKills || 0) + 1,
    }
    appendResolutionLog(resolution, `${player.name} 击败了 ${instance.npc?.name || '敌体'}`, 'kill')
    // 掉落与 standard 击杀等价（经济一致）
    const corpseResult = await createNpcCorpse(client, resolution.gamevars, instance, player.map ?? 0)
    resolution.gamevars = corpseResult.gamevars
    if (corpseResult.corpse) {
      const lootPrompt = buildLootPrompt(resolution.gamevars, corpseResult.corpse, 'kill')
      if (lootPrompt) {
        resolution.gamevars = setPlayerLootPrompt(resolution.gamevars, user.id, lootPrompt)
        appendResolutionLog(resolution, `${player.name} 可以从 ${corpseResult.corpse.name} 里带走一件战利品`, 'system')
      } else {
        resolution.gamevars = cleanupCorpseIfEmpty(resolution.gamevars, corpseResult.corpse.id)
      }
    }
    if (instance.npc?.level === 'boss') {
      resolution.gamevars = { ...resolution.gamevars, bossDefeated: true }
      appendResolutionLog(resolution, `🏆 BOSS ${instance.npc.name} 已被击败！`, 'kill')
    }
    setKilledNpcFlag(resolution, instance.npc?.name)
  } else if (playerDead) {
    appendResolutionLog(resolution, `${player.name} 倒在了 ${instance.npc?.name || '敌体'} 的反击之下`, 'damage')
    // 死因入 player_death_log（advance 死亡收敛的 death 事件从此取 reason）
    await logPlayerDeath(client, user.id, {
      roomId: room.id, gamenum: room.gamenum, mapId: player.map ?? 0,
      reason: 'npc_counter', context: { npc: instance.npc?.name || '敌体', mode: 'stance_duel' },
    })
  }

  setResolutionPlayer(resolution, user.id, nextPlayer)
  return persistResolutionWithPollution(client, room, resolution, user.id)
}

async function resolveNpcAttackAction(client, room, gamevars, user, payload = {}) {
  const player = getPlayer(gamevars, user.id)
  if (!player?.alive) throw new Error('阵亡玩家无法攻击')
  const instanceId = player?.encounter?.instanceId
  if (!instanceId) throw new Error('当前没有袭击目标')

  // ── 体力结算（平消耗 · additive · 仅主动攻击扣）：在结算伤害 / 任何 await 之前，拦截零副作用。 ──
  //   被动反击（NPC 反击玩家）不走此处，不耗体力。扣后体力字段随后并入 polluted（combat pollution 基）。
  const nowMs = Date.now()
  const staminaResult = applyStaminaCost(player, nowMs, isKaleidoRoom(room) ? 0 : STAMINA_CONFIG.ATTACK_COST)
  if (staminaResult.blocked) {
    throw Object.assign(new Error('体力不足，无法攻击'), { code: 'no_stamina' })
  }

  const instance = findNpcInstance(gamevars, instanceId)
  if (!instance) {
    // 实例已被消灭（其他玩家先击杀）/ 已不在池
    const resolution = createActionResolution({ room, actorId: user.id, gamevars })
    setResolutionPlayer(resolution, user.id, { ...player, encounter: null })
    appendResolutionLog(resolution, `${player.name} 的袭击目标已消失`, 'system')
    return persistResolution(client, room, resolution)
  }

  // ═══ KP1 LW-2：stance_duel 关的战斗改走 combatModes.resolveTurn（裁决 C·R5 走既有 attackNpc 动词）═══
  //   双闸：isKaleidoRoom ∧ 当前关 kaleidoMode.template_ref==='stance_duel' —— 多人局/其它关走下方富路径零变化。
  if (isKaleidoRoom(room)) {
    const duelNode = (gamevars.raidPath || [])[player.chamberIndex ?? 0]
    if (duelNode?.kaleidoMode?.template_ref === 'stance_duel') {
      return resolveStanceDuelAttack(client, room, gamevars, user, payload, instance, duelNode)
    }
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
  me = dispatchTurnStart(resolution, me, buffPool)   // P6 on_turn_start（起手·空 _pass 中性）

  // ── 1. 玩家攻击的命中判定 ──
  const playerAccuracy = getRule(rules, 'player_attack_accuracy', 0.85)
  const playerHit = Math.random() < playerAccuracy

  // ── 2. 战斗个人污染（无论命中都扣，反映"动手"成本） ──
  //   体力：把开头平消耗扣后的字段并入 polluted（实际发起攻击才扣；前面 instance 缺失早返回分支不走到这里，不扣）。
  const polluted = {
    ...applyCombatPollution(player, instance.npc),
    stamina:    staminaResult.player.stamina,
    staminaAt:  staminaResult.player.staminaAt,
    maxStamina: staminaResult.player.maxStamina ?? STAMINA_CONFIG.MAX_STAMINA,
    // lastMoveAt 不并入：平消耗不触碰移动锚点
  }

  let killed = false
  let instanceHpAfter = instance.hp
  let overkillPayload = null // KALEIDO npc_overkill：块内捕获，persist 成功后再发（缺陷A·避免重试重复行）

  if (playerHit) {
    const npcCombat = buildCombatNpc(instance)         // Phase 37: NPC 走统一引擎（裸 npc → computeCombatStats）
    let damageRaw = calcDamage(me, npcCombat, rules, weapon?.tier?.sub_kind || '')
    // P2 战斗钩子管线（玩家→NPC 主伤害）：走统一中性闸口 helper（空池逐值不变·守 Phase 37）。
    damageRaw = applyCombatPipeline(damageRaw, {
      attacker: me, defender: npcCombat, defenderHp: instance.hp, resolution,
    })

    const { attackerUpdated: meAfterAttack, logs: passiveLogs } = triggerPassives(
      'on_attack',
      me,
      { ...instance.npc, hp: instance.hp },
      me._pass || [],
      buffPool,
      { damage: damageRaw }, // KP1 D4：on_attack 被动可引用本次伤害（旧内容不引用则中性）
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

    // KALEIDO 传感层（KP0-R S3/S4/缺陷A）：击杀伤害溢出阈（≥2× 击杀前剩余 HP）→ npc_overkill。
    //   块内只捕获 payload（damageOut 是本块 const）；实际发射移到函数末尾 persist 成功之后
    //   （与 craft_attempt 同型，乐观锁重试不产重复/幻影行）。仅 kaleido 局，多人局零行为。
    if (killed && isKaleidoRoom(room) && damageOut >= (instance.hp || 1) * 2) {
      overkillPayload = { damage: damageOut, npc_hp: instance.hp, boss: instance.npc.level === 'boss' }
    }
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
    const corpseResult = await createNpcCorpse(client, resolution.gamevars, instance, player.map ?? 0)
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
          markFragmentLevelUp(resolution, user.id, fragment)
          // Phase 20.4: 合成解锁日志
          for (const u of (fragment.comboUnlocks || [])) {
            appendResolutionLog(resolution, `🔗 解码完成，合成新残片【${u.name}】 ${u.comboDescription ? '— ' + u.comboDescription : ''}`, 'system')
          }
        }
      }
    } catch (e) {
      console.error('[attackNpc] fragment discovery 失败:', e?.message)
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
        const npcAttacker = buildCombatNpc(instance, instanceHpAfter)   // Phase 37: NPC 反击 attacker 走统一引擎（当前 HP 覆盖）
        const playerDefender = buildCombatPlayer(cur, myEquips)
        let damageIn = calcDamage(npcAttacker, playerDefender, rules, '')
        // P3 战斗钩子管线（NPC 反击玩家）：同 P2 中性闸口（空池逐值不变·守 Phase 37）。
        damageIn = applyCombatPipeline(damageIn, {
          attacker: npcAttacker, defender: playerDefender, defenderHp: cur.hp || 0,
          resolution, label: 'NPC 反击',
        })
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
        // P6 on_hp_below_30：玩家被 NPC 反击跌破 30% 时触发绝地被动（空 _pass 中性）
        dispatchHpBelow30(resolution, user.id, playerDefender, npcAttacker, cur.hp || 0, playerHpAfter, buffPool)
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
              survivedSeconds: raidSurvivedSeconds(room),
              chamberDepth: chamberDepthOf(cur),
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
  // KALEIDO npc_overkill 发射（缺陷A）：persist 成功后才发；level_seq 取物理关（缺陷B）；
  //   await 防 Vercel 冻结丢事件（S4）。仅 kaleido 局。
  if (overkillPayload && isKaleidoRoom(room)) {
    const meFinal = getPlayer(nextRoom?.gamevars, user.id) || {}
    const kalOk = nextRoom?.gamevars?.kaleido || {}
    await emitPlayerEvents(client, [{
      player_id: user.id, run_id: kalOk.runId ?? null, level_seq: kaleidoLevelSeq(meFinal),
      verb: 'npc_overkill', payload: overkillPayload,
    }])
  }
  return nextRoom
}

async function resolvePlayerAttackAction(client, room, gamevars, user, targetUid) {
  const attacker = getPlayer(gamevars, user.id)
  const defender = getPlayer(gamevars, targetUid)
  if (!defender) throw new Error('目标玩家不存在')
  if (!attacker?.alive) throw new Error('阵亡玩家无法攻击')
  if (!defender.alive) throw new Error('目标已经阵亡')
  if (targetUid === user.id) throw new Error('不能攻击自己')
  // Phase 31 re-home: BR 下「同房」用 roomId 判定（不同房可能采样到同 templateId → 同 map，会误判同屏）；旧房仍用 map。
  if (gamevars.br?.enabled) {
    if ((attacker.roomId ?? null) !== (defender.roomId ?? null)) throw new Error('目标不在同一扇区')
  } else if ((attacker.map ?? 0) !== (defender.map ?? 0)) {
    throw new Error('目标不在同一地图')
  }

  // ── 体力结算（平消耗 · additive · 仅主动攻击者扣 · 可调）：在结算伤害 / 任何 await 之前，拦截零副作用。 ──
  //   与 attackNpc 对称（统一「动手即耗体力」）。被攻击方 / 被动反击不耗。
  //   若只想约束 PvE，可删此块（仅 attackNpc 接体力）。扣后字段并入末尾 attacker 的 setResolutionPlayer。
  const nowMs = Date.now()
  const staminaResult = applyStaminaCost(attacker, nowMs, isKaleidoRoom(room) ? 0 : STAMINA_CONFIG.ATTACK_COST)
  if (staminaResult.blocked) {
    throw Object.assign(new Error('体力不足，无法攻击'), { code: 'no_stamina' })
  }

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
  me = dispatchTurnStart(resolution, me, buffPool)   // P6 on_turn_start（攻击者起手·空 _pass 中性）

  let damage = calcDamage(me, target, rules, weapon?.tier?.sub_kind || '')
  // P3 战斗钩子管线（PvP 主伤害）：同 P2 中性闸口（空池逐值不变·守 Phase 37）；插在 on_attack 被动前，与 PvE 同序。
  damage = applyCombatPipeline(damage, {
    attacker: me, defender: target, defenderHp: target.hp || 0,
    resolution, label: 'PvP 攻击',
  })
  const { attackerUpdated: meAfterAttack, defenderUpdated: targetAfterPassive, logs: passiveLogs } = triggerPassives(
    'on_attack',
    me,
    target,
    me._pass || [],
    buffPool,
    { damage }, // KP1 D4：on_attack 被动可引用本次 PvP 伤害（旧内容不引用则中性）
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
        // P3 战斗钩子管线（PvP 反击）：attacker=反击方 target，defender=原攻击者 me（空池逐值不变·守 Phase 37）。
        counterDamage = applyCombatPipeline(counterDamage, {
          attacker: target, defender: me, defenderHp: attackerHpAfter,
          resolution, label: 'PvP 反击',
        })
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
    // 体力：并入开头平消耗扣后的字段（仅攻击者；lastMoveAt 不动）。后续击杀分支 updateResolutionPlayer 透传 current 会保留。
    stamina:    staminaResult.player.stamina,
    staminaAt:  staminaResult.player.staminaAt,
    maxStamina: staminaResult.player.maxStamina ?? STAMINA_CONFIG.MAX_STAMINA,
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

  // P6 on_hp_below_30：攻/守任一方本次交手跌破 30% 时触发绝地被动（空 _pass 中性）
  dispatchHpBelow30(resolution, user.id, me, target, me.hp, attackerHpAfter, buffPool)
  dispatchHpBelow30(resolution, targetUid, target, me, target.hp, targetHp, buffPool)

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
        survivedSeconds: raidSurvivedSeconds(room),
        chamberDepth: chamberDepthOf(attackerAfterTurn),
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
        survivedSeconds: raidSurvivedSeconds(room),
        chamberDepth: chamberDepthOf(defenderAfterTurn),
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

  // ── 体力回复道具（机能恢复剂等 item_pool.stamina_restore>0）：+amount clamp 到 max，刷 staminaAt（不刷 lastMoveAt） ──
  //   nowMs 取一次；restoreStamina 内部 backfill→懒回复→+amount→clamp。非 BR 旧房用此道具安静 +体力无害。
  if (result.staminaDelta && !isKaleidoRoom(room)) {
    const nowMs = Date.now()
    const r = restoreStamina(nextPlayer, nowMs, result.staminaDelta)
    nextPlayer.stamina    = r.player.stamina
    nextPlayer.staminaAt  = r.player.staminaAt
    nextPlayer.maxStamina = r.player.maxStamina ?? STAMINA_CONFIG.MAX_STAMINA
    appendResolutionLog(
      resolution,
      `${player.name} 使用 ${itemName}，体力 +${result.staminaDelta}`,
      'heal',
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

// Phase 03/49: 道具合成（局内）—— 玩家显式选一条 item_recipes 配方，交 itemCraft 运行时
//   校验材料 → 掷成功率 → 扣材出产物（或按 fail_behavior 处理）。只动 gamevars 背包（道具名数组），
//   不碰战斗/装备/经济（守 Phase 37：0 配方 ⇒ 客户端无可合成项 ⇒ 永不触发）。
//   运行只认 item_id；背包是名数组，故按 item_pool 现拉 id↔name 双向映射桥接。
async function craftItemRecipe(client, room, gamevars, user, payload) {
  const player = getPlayer(gamevars, user.id)
  if (!player?.alive) throw new Error('阵亡玩家无法合成')
  if (player.extracted) throw new Error('已撤离玩家无法合成')
  const recipeId = Number(payload?.recipeId)
  if (!Number.isFinite(recipeId)) throw new Error('缺少配方 ID')

  const [recipeRes, ingRes, itemsRes] = await Promise.all([
    client.from('item_recipes').select('*').eq('id', recipeId).eq('enabled', true).maybeSingle(),
    client.from('item_recipe_ingredients').select('item_id, quantity, is_consumed').eq('recipe_id', recipeId),
    client.from('item_pool').select('id, name'),
  ])
  const recipe = recipeRes?.data
  if (!recipe) throw new Error('配方不存在或已禁用')
  recipe.ingredients = ingRes?.data || []

  const idByName = new Map()
  const nameById = new Map()
  for (const it of itemsRes?.data || []) { idByName.set(it.name, it.id); nameById.set(it.id, it.name) }

  // 运行端无玩家等级概念时 player.level 为 undefined ⇒ 传 null ⇒ itemCraft 不做等级门槛（回落不限制）。
  const out = applyItemCraft(recipe, player.inventory || [], { idByName, nameById }, Math.random(), player.level ?? null)
  if (!out.ok) {
    if (out.reason === 'level') throw new Error('等级不足，无法合成此配方')
    const txt = (out.missing || []).map(m => `${nameById.get(m.itemId) || `#${m.itemId}`}×${m.need}(持有 ${m.have})`).join('、')
    throw new Error(`材料不足：${txt}`)
  }

  const resolution = createActionResolution({ room, actorId: user.id, gamevars })
  setResolutionPlayer(resolution, user.id, { ...player, inventory: out.nextInventory })

  const consumedTxt = (out.consumed || []).map(c => `${c.name}×${c.qty}`).join(' + ') || '材料'
  if (out.success) {
    const got = out.produced ? `${out.produced.name}×${out.produced.qty}` : '产物'
    appendResolutionLog(resolution, `${player.name} 合成成功：${consumedTxt} → ${got}`, 'buff')
  } else if (recipe.fail_behavior === 'keep_materials') {
    appendResolutionLog(resolution, `${player.name} 合成失败（${recipe.name}）· 材料保留`, 'system')
  } else {
    appendResolutionLog(resolution, `${player.name} 合成失败（${recipe.name}）· ${consumedTxt} 损毁`, 'damage')
  }

  const nextRoom = await persistResolution(client, room, resolution)
  // KALEIDO 传感层（KP0-R S3）：craft_attempt 在此发——要携带 success_rate/结果，路由边界拿不到。
  //   persist 成功后再发（版本冲突重试不产重复行）；await 防 Vercel 冻结丢事件（S4）。
  if (isKaleidoRoom(room)) {
    const kal = gamevars.kaleido || {}
    await emitPlayerEvents(client, [{
      player_id: user.id,
      run_id: kal.runId ?? null,
      level_seq: kaleidoLevelSeq(player), // 物理关（缺陷B）
      verb: 'craft_attempt',
      payload: { success_rate: recipe.success_rate ?? null, success: !!out.success, recipe_id: recipeId },
    }])
  }
  return nextRoom
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
  if (player.extracted) throw new Error('已撤离玩家无法拾取战利品')  // 安全：撤离免疫态不得再搜刮尸体（镜像 craftItemRecipe extracted 守卫，堵越权铸/夺装）
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

// ═══════════════════════════════════════════════════════════════
// KALEIDO 单人 run（KP0-S 交付物 5 · docs/plan/kaleido/02 §2.6）
//   startKaleidoRun：runs 行 → 采样 5 关(levels) → 建房(gametype=30)+落座+startGame → 回填 room_id。
//   advanceKaleidoProgress：路由边界每消耗性动作后跑——turnCount+1 → exit_condition 判定 →
//     过关推进/收敛(endingResult 触 lifecycle 收房)+ 域真源(runs/levels)同步 + level_clear/death 事件。
//   abandonKaleidoRun：显式放弃（关页 ≠ 放弃，R11）。
//   中性：全部入口 isKaleidoRoom 守卫；多人局零行为变化。
// ═══════════════════════════════════════════════════════════════

// 消耗性动词（02 §2.2：search/attack/craft/item_use/move·真源在 events.js TURN_ACTIONS，
//   与发射映射 ACTION_VERB 解耦——flee/spare 发射不计回合，craftItem 计回合 in-handler 发射）
const KALEIDO_TURN_ACTIONS = new Set(KALEIDO_TURN_ACTION_LIST)

// 房间已收但 run 仍 active（域真源同步失败/竞态）→ 按房间终局补收敛（KP0-R S2①③ 自愈）。
async function repairConvergeKaleidoRun(client, runId, room) {
  try {
    const gv = room?.gamevars || {}
    const key = gv.endingResult?.key
    const anyDead = Object.values(gv.players || {}).some((p) => p && p.alive === false)
    const status = key === 'kaleido_clear' ? 'cleared' : anyDead ? 'dead' : 'abandoned'
    await client.from('runs')
      .update({ status, converged_at: new Date().toISOString() })
      .eq('run_id', runId).eq('status', 'active')
  } catch (e) {
    console.error('[kaleido] run 补收敛失败:', e?.message)
  }
}

export async function startKaleidoRun(client, user) {
  // 幂等：已有 active run → 直接返回（uq_runs_one_active 为 DB 兜底）
  const { data: existing } = await client
    .from('runs')
    .select('run_id, room_id, started_at')
    .eq('player_id', user.id)
    .eq('status', 'active')
    .maybeSingle()
  if (existing?.room_id) {
    // KP0-R S2③：幂等返回前验房间存活——房已收/已删而 run 仍 active 会把玩家永锁在死房。
    const { data: exRoom } = await client
      .from('rooms')
      .select('id, gamestate, gamevars')
      .eq('id', existing.room_id)
      .maybeSingle()
    if (exRoom && exRoom.gamestate !== 2) {
      return { roomId: existing.room_id, runId: existing.run_id }
    }
    await repairConvergeKaleidoRun(client, existing.run_id, exRoom) // 补收敛旧 run，继续开新
  } else if (existing) {
    // 半成品 run（无房）：KP0-R S2②——新鲜 = 另一请求创建进行中（双击并发），不得弃置
    //   （弃置会让双方各建一房）；陈旧（≥60s）= 建败残留 → 弃置重建，防唯一索引永锁。
    const ageMs = Date.now() - new Date(existing.started_at || 0).getTime()
    if (ageMs < 60_000) {
      throw new Error('run 正在创建中，请稍候再试')
    }
    await client.from('runs')
      .update({ status: 'abandoned', converged_at: new Date().toISOString() })
      .eq('run_id', existing.run_id)
  }

  // 建 run 冷却（🔒 KP0-X #2 finding：防 abandon+create churn 刷 runs 表）。
  //   放在幂等返回之后 → 重进现有 run 不受影响；只限「开新 run」频率。
  //   只看 room_id 非空的「真实开过的 run」（🔒 minor 修正）：半成品（建败被上方弃置·
  //   room_id null）不计冷却 → 建败重试不被挡；蓄意 churn 的弃置 run 必有 room_id → 仍被封住。
  //   （不能按 status 排除 abandoned——churn 产物恰是 abandoned 行，那会把防护整个打开。）
  const { data: lastRun } = await client
    .from('runs')
    .select('started_at')
    .eq('player_id', user.id)
    .not('room_id', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastRun?.started_at
      && Date.now() - new Date(lastRun.started_at).getTime() < KALEIDO.RUN_COOLDOWN_SEC * 1000) {
    throw new Error('操作过于频繁，请稍后再开新 run')
  }

  const seed = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const { data: run, error: runErr } = await client
    .from('runs')
    .insert({ player_id: user.id, seed, spine: {} })
    .select('run_id')
    .single()
  if (runErr || !run) throw new Error(runErr?.message || '创建 run 失败')

  let createdRoomId = null // KP0-R S7：跟踪已建房，补偿路径顺带收掉（防 gamestate=0 孤儿房挂大厅）
  try {
    // KP1-S D1 正式采样：拉 pools（chamber/npc/item + content_pool 种子关）喂纯函数 sampleRun
    //   → 5 archetype + 难度曲线 + 三模板 + 种子关优先 + seq=末关 boss_kill（确定性·同 seed 同序）。
    const [chRes, npcRes, itemRes, seedRes] = await Promise.all([
      client.from('chamber_templates').select('*').eq('enabled', true),
      client.from('npc_pool').select('id, name, hp, atk, def, level, spawn_weight'),
      client.from('item_pool').select('id, name'),
      client.from('content_pool').select('id, payload, provenance').eq('entity_type', 'level').eq('enabled', true),
    ])
    if (chRes.error) throw new Error(chRes.error.message)
    const nodes = sampleRun(seed, {
      levelCount: KALEIDO.LEVEL_COUNT,
      pools: {
        chambers: chRes.data || [],
        npcs: npcRes.data || [],
        items: itemRes.data || [],
        seedLevels: seedRes.data || [],
      },
    })
    if (nodes.length === 0) throw new Error('无可用关卡模板（chamber_templates 为空）')

    // levels ×N 批量入库（域真源），回填 level_id 到节点（§2.5：节点携带 level_id）
    const { data: lvls, error: lvlErr } = await client
      .from('levels').insert(buildLevelRows(run.run_id, nodes, seed)).select('level_id, seq')
    if (lvlErr) throw new Error(lvlErr.message)
    for (const lv of lvls || []) {
      const node = nodes[lv.seq - 1]
      if (node) node.levelId = lv.level_id
    }

    // 建房（gametype=KALEIDO_GAME_TYPE）→ 发起玩家默认属性落座 → startGame 一次 persist
    const room = await createRoom(client, user, { gametype: KALEIDO_GAME_TYPE })
    createdRoomId = room.id
    const rules = await loadGameRules(client)
    const player = createPlayerState(user, getInitPlayerStats(rules))
    const gamevars = normalizeGamevars(room.gamevars)
    const nextGamevars = {
      ...gamevars,
      players: { ...gamevars.players, [user.id]: player },
      raidPath: nodes,
      kaleido: { runId: run.run_id, currentSeq: 1, clearedSeq: 0 },
    }
    const nextRoom = await persistRoom(client, room, nextGamevars, [
      createLogEntry(`${getDisplayName(user)} 进入万华镜 · 第 1/${KALEIDO.LEVEL_COUNT} 关「${nodes[0].name}」`, 'system'),
    ], { startGame: true })

    await client.from('runs').update({ room_id: nextRoom.id }).eq('run_id', run.run_id)
    return { roomId: nextRoom.id, runId: run.run_id }
  } catch (e) {
    // 补偿：失败弃置 run，避免 active 唯一索引卡死后续重开；
    //   已建房则顺带删除（KP0-R S7：防 gamestate=0 孤儿房挂大厅，刚建的房无他人可安全删）。
    try {
      await client.from('runs')
        .update({ status: 'abandoned', converged_at: new Date().toISOString() })
        .eq('run_id', run.run_id)
    } catch {}
    if (createdRoomId) {
      try { await client.from('rooms').delete().eq('id', createdRoomId) } catch {}
    }
    throw e
  }
}

// 路由边界推进（/api/game/actions 在动作成功后调用；仅 kaleido 局）。
// 失败绝不影响动作本身（动作已落库）——吞错返回原 room，下动作重判。
export async function advanceKaleidoProgress(client, room, user, action) {
  try {
    if (!isKaleidoRoom(room)) return room
    const gamevars = normalizeGamevars(room.gamevars)
    const kal = gamevars.kaleido
    if (!kal?.runId) return room
    const me = getPlayer(gamevars, user.id)
    if (!me) return room

    // 死亡收敛（R9：内容不减损，只标 run 终态；房间已由 lifecycle alivenum===0 判负）
    if (!me.alive) {
      // KP0-R S4：.select 拿实际转移行 → death 事件只在首次转移发一次（死后重复动作不再发）
      const { data: transitioned } = await client.from('runs')
        .update({ status: 'dead', converged_at: new Date().toISOString() })
        .eq('run_id', kal.runId).eq('status', 'active')
        .select('run_id')
      if (transitioned && transitioned.length > 0) {
        // 死因取 deathLog 汇聚点已落的最新记录（不往共享 player 对象加字段，守逐字节中性）
        let reason = 'other'
        try {
          const { data: dl } = await client.from('player_death_log')
            .select('reason').eq('user_id', user.id).eq('room_id', room.id)
            .order('id', { ascending: false }).limit(1).maybeSingle()
          if (dl?.reason) reason = dl.reason
        } catch {}
        await emitPlayerEvents(client, [ // KP0-R S4：await——Vercel 响应后冻结会丢未决 promise
          buildDeathEvent(user.id, { runId: kal.runId, levelSeq: kaleidoLevelSeq(me), reason }), // 物理关（缺陷B）
        ])
      }
      return room
    }
    if (room.gamestate === 2) {
      // KP0-R S2①：房已收但 run 可能仍 active（域真源同步曾失败）→ 补收敛自愈，防永不重判
      await repairConvergeKaleidoRun(client, kal.runId, room)
      return room
    }
    if (!KALEIDO_TURN_ACTIONS.has(action)) return room

    // 回合 +1（R4：每消耗性动词一回合；旧档 ?? 0 兜底）
    const nextMe = { ...me, turnCount: (me.turnCount ?? 0) + 1 }
    const seq = (nextMe.chamberIndex ?? 0) + 1 // 当前关 = 物理位置（§2.5 level_seq ↔ chamberIndex）
    const node = (gamevars.raidPath || [])[nextMe.chamberIndex ?? 0]
    const logs = []
    let nextKal = kal
    let converged = false

    // KP1 LW-1 修复（🧭裁决 B·E2E 抓的生产软锁）：attackNpc 第 5 步「无论结果清空 encounter」
    //   （旧搜打撤一击脱离语义·共享路径不动）→ boss 第 1 拳后失锁、boss_kill 永不可达。
    //   推进层「boss 重锁」：boss 关 ∧ boss 实例存活 ∧ 无 encounter → 静默重置锁定。
    //   每个消耗性动作后必经此处 → 拳后自动重锁；也自愈已软锁的存量 run（下个动作即重锁）。
    //   多人局在函数顶 isKaleidoRoom 早退、非 boss 关不满足条件 → 零变化。
    if (node?.archetype === 'boss' && !nextMe.encounter) {
      const bossInst = (gamevars.npcInstances || []).find(
        (i) => i && i.hp > 0 && i.npc?.level === 'boss' && i.mapId === node.templateId,
      )
      if (bossInst) nextMe.encounter = { instanceId: bossInst.id }
    }

    if (node?.kaleidoExit && (kal.clearedSeq ?? 0) < seq
        && evaluateExitCondition(node.kaleidoExit, nextMe, gamevars)) {
      converged = seq >= KALEIDO.LEVEL_COUNT
      nextKal = { ...kal, clearedSeq: seq, currentSeq: Math.min(seq + 1, KALEIDO.LEVEL_COUNT) }
      // （KP0-R S1：turnCount 清零改在 movePlayer 入关处——per-level 语义的真正落点；
      //   过关后仍留在本关的动作继续计数，但 clearedSeq 门禁已挡住重复判定。）
      logs.push(createLogEntry(
        converged
          ? `✦ 第 ${seq}/${KALEIDO.LEVEL_COUNT} 关达成 —— 万华镜 run 通关`
          : `✦ 第 ${seq}/${KALEIDO.LEVEL_COUNT} 关达成，可前进下一关`,
        'system',
      ))
    }

    const nextGamevars = {
      ...gamevars,
      players: { ...gamevars.players, [user.id]: nextMe },
      kaleido: nextKal,
      // 通关 → 写 endingResult 触发 applyRoomLifecycle 通用收房分支（gamestate=2）
      ...(converged ? { endingResult: { key: 'kaleido_clear', name: '万华镜 · 通关', bannerText: `${KALEIDO.LEVEL_COUNT} 关全数达成。` } } : {}),
    }
    const nextRoom = await persistRoom(client, room, nextGamevars, logs, {})

    // 域真源同步（runs/levels）+ level_clear 事件；失败仅记错（下动作可重判，不阻断）
    if (nextKal !== kal) {
      try {
        await client.from('levels').update({ status: 'played' })
          .eq('run_id', kal.runId).eq('seq', seq)
        await client.from('runs').update(
          converged
            ? { current_seq: seq, status: 'cleared', converged_at: new Date().toISOString() }
            : { current_seq: nextKal.currentSeq },
        ).eq('run_id', kal.runId).eq('status', 'active')
      } catch (e) {
        console.error('[kaleido] 域真源同步失败:', e?.message)
      }
      await emitPlayerEvents(client, [{ // KP0-R S4：await，防 Vercel 冻结丢事件
        player_id: user.id, run_id: kal.runId, level_seq: seq, verb: 'level_clear',
        payload: { turnCount: nextMe.turnCount ?? 0, converged },
      }])
    }
    return nextRoom
  } catch (e) {
    console.error('[kaleido] 推进失败:', e?.message)
    return room
  }
}

// 显式放弃 run（分发器动作 'abandonRun'；关页 ≠ 放弃，R11 回来接着打）
async function abandonKaleidoRun(client, room, gamevars, user) {
  if (!isKaleidoRoom(room)) throw new Error('非万华镜对局')
  const kal = gamevars.kaleido
  const nextGamevars = {
    ...gamevars,
    endingResult: gamevars.endingResult
      || { key: 'kaleido_abandoned', name: '万华镜 · 放弃', bannerText: '你退出了这次探勘。' },
  }
  const nextRoom = await persistRoom(client, room, nextGamevars, [
    createLogEntry(`${getDisplayName(user)} 放弃了本次 run`, 'system'),
  ], {})
  if (kal?.runId) {
    try {
      await client.from('runs')
        .update({ status: 'abandoned', converged_at: new Date().toISOString() })
        .eq('run_id', kal.runId).eq('status', 'active')
    } catch (e) {
      console.error('[kaleido] abandon 同步失败:', e?.message)
    }
  }
  return nextRoom
}

/**
 * Phase 31 re-home: 首玩家初始化 BR 房层（所有新对局默认 BR，见 joinRoom isBr 判据）。
 * 幂等：若 gamevars.br.enabled 已为 true（已初始化）则原样返回（后加入玩家不重算）。
 *
 * 步骤：
 *   ① 生成 per-raid seed（makeRaidSeed(room.id,gamenum,created_at)）
 *   ② getRaidLayout(client, seed) → { rooms, adj, templateMeta, roomTemplates, topoVersion }（按 seed 进程级 memo）
 *   ③ 算 closePhases（seed 洗牌 + 按本局房集比例分桶的公开禁区表，客户端着色用，不下发 seed）
 *   ④ 从 br_rooms gridX/gridY 上界推 gridW/gridH/centerX/centerY（自适应任意网格尺寸）
 *   ⑤ 选起始房 startRoomId（seed-phase0 下最靠 centerX/Y 的开放房；本期所有人同起点）
 *   ⑥ 组装 **slim** gamevars.br（7 旧字段 + gridW/gridH/centerX/centerY/topoVersion 5 新快照字段）
 *
 * gamevars 瘦身：rooms（18.7KB）/adj/templateMeta（10.9KB）不再写进 gamevars.br ——
 *   它们全部从 seed 确定性派生（getRaidLayout(seed)），消费点按需取，从而把每动作 ~40-50KB 负载降到 ~5KB。
 *   roomTemplates 从 layout 取（与旧 sampleRoomTemplates 结果同值），仍写进 gamevars.br（getCurrentChamberTemplateId 纯函数依赖）。
 *   gridW/gridH/centerX/centerY/topoVersion 为本期新增标量快照（~50B），客户端网格视图据此渲染并隔离在飞局拓扑变更。
 *
 * phaseSeconds/maxPhase 来源：已存在的 gamevars.br（建房时塞的 dev 短值）优先，否则 BR_CONFIG 默认。
 *
 * @returns {Promise<{ br: object, startRoomId: number|null }>} 失败兜底返回 enabled:false 的最小块（不阻塞 join）
 */
async function initBrRoomLayer(client, room, gamevars) {
  // 幂等：已初始化 → 直接复用
  if (gamevars?.br?.enabled === true) {
    return { br: gamevars.br, startRoomId: gamevars.br.startRoomId ?? null }
  }

  try {
    // ① seed（建房时若已塞 br.seed 则沿用，否则按对局生成）
    const seed = Number.isFinite(gamevars?.br?.seed) ? gamevars.br.seed : makeRaidSeed(room)

    // ② 按 seed 派生布局（首动作付一次 DB 读，之后 memo）：rooms/adj/templateMeta/roomTemplates
    const layout = await getRaidLayout(client, seed)
    if (!Array.isArray(layout.rooms) || layout.rooms.length === 0 || Object.keys(layout.templateMeta).length === 0) {
      console.error('[joinRoom][BR] 拓扑或模板为空，BR 初始化跳过（rooms=%d templates=%d）', layout.rooms?.length || 0, Object.keys(layout.templateMeta || {}).length)
      return { br: { ...normalizeGamevars({}).br, enabled: false }, startRoomId: null }
    }
    const { rooms: roomsTopo, roomTemplates } = layout

    // 实际启用房号集（缩圈比例分桶的输入；与 closePhases/起始房/网格推导同源 → 全程自洽）
    const roomIds = roomsTopo.map((r) => r.roomId)

    // ③ 公开禁区表（seed 派生 + 按本局房集比例分桶；只读，落快照后服务端致死与客户端着色都读它）
    const closePhases = closePhasesObject(seed, roomIds)

    // ④ 网格 / 中心：从 br_rooms 的 gridX/gridY 上界推（0-based → 宽=max+1；center=max/2）。
    //   当前数据 0..9 → gridW=gridH=10, center=4.5（与旧写死值完全相等 → 100 格零回归）。
    //   全 null 坐标兜底：maxGX=maxGY=0 → gridW=gridH=1, center=0（极端退化不崩）。
    let maxGX = 0
    let maxGY = 0
    for (const r of roomsTopo) {
      if (Number.isFinite(r.gridX) && r.gridX > maxGX) maxGX = r.gridX
      if (Number.isFinite(r.gridY) && r.gridY > maxGY) maxGY = r.gridY
    }
    const gridW = maxGX + 1
    const gridH = maxGY + 1
    const centerX = maxGX / 2
    const centerY = maxGY / 2

    // ⑤ 起始房：seed-phase0（开局全开放）下最靠网格中心的房（中心用上面推导的 centerX/Y，自适应任意网格）
    const phase0Open = roomsTopo.filter((r) => !forbidden(seed, 0, r.roomId, roomIds))
    const startPool = phase0Open.length > 0 ? phase0Open : roomsTopo
    const CX = centerX
    const CY = centerY
    let startRoom = startPool[0]
    let bestDist = Number.POSITIVE_INFINITY
    for (const r of startPool) {
      if (r.gridX == null || r.gridY == null) continue
      const d = (r.gridX - CX) * (r.gridX - CX) + (r.gridY - CY) * (r.gridY - CY)
      if (d < bestDist) { bestDist = d; startRoom = r }
    }
    const startRoomId = startRoom?.roomId ?? null

    // phaseSeconds / maxPhase：建房时塞的优先（dev 短值），否则 BR_CONFIG 默认
    const phaseSeconds = gamevars?.br?.phaseSeconds != null
      ? clampPhaseSeconds(gamevars.br.phaseSeconds)
      : clampPhaseSeconds(BR_CONFIG.PHASE_SECONDS)
    const maxPhase = gamevars?.br?.maxPhase != null
      ? clampMaxPhase(gamevars.br.maxPhase)
      : clampMaxPhase(BR_CONFIG.MAX_PHASE)

    // ── Phase 36: 房间投放分配（placement_rules 道具中心·全图分布 → roomInv 快照·确定性） ──
    //   查两表：placement_rules（enabled 规则：道具/装备+数量区间+几禁+互斥组）+ placement_rule_rooms（候选房+权重）。
    //   allocateRoomInventory 纯函数（同 seed+rules+ruleRooms → 同 roomInv，所有实例一致）：内部按 roomIdSet 过滤候选、
    //   按 rule_id 分组、按 br_room_id 升序锚定，逐规则在候选房集做加权无放回抽样（互斥组相互避让）。
    //   ruleRooms 拉全表即可（内部过滤；候选总量小）；失败降级空库存（takeFromRoom 全 miss → 回落程序化抽取，零回归）。
    let roomInv = {}
    let roomInvRefs = { items: [], tiers: [] }
    try {
      const [{ data: ruleRows }, { data: ruleRoomRows }] = await Promise.all([
        client
          .from('placement_rules')
          .select('id, entry_kind, item_name, tier_id, count_min, count_max, max_per_room, spawn_phase_min, exclusion_group')
          .eq('enabled', true)
          .order('id', { ascending: true }),
        client
          .from('placement_rule_rooms')
          .select('rule_id, br_room_id, weight'),
      ])
      const placed = allocateRoomInventory(seed, roomIds, ruleRows || [], ruleRoomRows || [])
      roomInv = placed.roomInv
      roomInvRefs = placed.roomInvRefs
    } catch (e) {
      console.error('[joinRoom][BR] placement_rules 分配失败（降级空库存，回落程序化）:', e?.message)
      roomInv = {}
      roomInvRefs = { items: [], tiers: [] }
    }

    // ── Phase 38: 敌人投放分配（npc_placement_rules NPC 中心·全图分布 → roomNpcs 快照·确定性） ──
    //   查两表（enabled 规则 + 候选房） → allocateRoomNpcs（同 seed+rules+ruleRooms → 同 roomNpcs，所有实例一致）。
    //   失败降级空 roomNpcs（takeNpcFromRoom 全 miss → 回落程序化 spawn·零回归）。
    let roomNpcs = {}
    try {
      const [{ data: npcRuleRows }, { data: npcRuleRoomRows }] = await Promise.all([
        client.from('npc_placement_rules')
          .select('id, npc_id, count_min, count_max, max_per_room, spawn_phase_min, exclusion_group')
          .eq('enabled', true).order('id', { ascending: true }),
        client.from('npc_placement_rule_rooms').select('rule_id, br_room_id, weight'),
      ])
      roomNpcs = allocateRoomNpcs(seed, roomIds, npcRuleRows || [], npcRuleRoomRows || [])
    } catch (e) {
      console.error('[joinRoom][BR] npc_placement_rules 分配失败（降级空·回落程序化）:', e?.message)
      roomNpcs = {}
    }

    // ⑥ slim br：rooms/adj/templateMeta 移出（getRaidLayout(seed) 派生），写 7 旧字段 + 5 新快照字段。
    //   新增 gridW/gridH/centerX/centerY（网格视图自适应）+ topoVersion（本局冻结拓扑版本，隔离在飞局被新编辑污染）。
    const br = {
      enabled: true,
      seed,
      phaseSeconds,
      maxPhase,
      startRoomId,
      roomTemplates,
      closePhases,
      // ── 新增（本期 §1/§4/§5）──
      gridW,
      gridH,
      centerX,
      centerY,
      topoVersion: Number.isFinite(layout.topoVersion) ? layout.topoVersion : null,
      // ── Phase 36: 房间投放快照（placement_rules 全图分布 → roomInv 取货层；格式同 Phase 34） ──
      roomInv,
      roomInvRefs,
      // ── Phase 38: 敌人投放快照（npc_placement_rules 全图分布 → roomNpcs 遭遇 materialize 层） ──
      roomNpcs,
    }
    console.log(`[joinRoom][BR] init room=${room.id} seed=${seed} start=${startRoomId} grid=${gridW}x${gridH} center=(${centerX},${centerY}) topoVer=${br.topoVersion} templates=${Object.keys(layout.templateMeta).length} phaseSeconds=${phaseSeconds} maxPhase=${maxPhase}`)
    return { br, startRoomId }
  } catch (e) {
    console.error('[joinRoom][BR] 初始化失败:', e?.message)
    return { br: { ...normalizeGamevars({}).br, enabled: false }, startRoomId: null }
  }
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
  // KALEIDO 单人局：owner 已由 startKaleidoRun 落座（重进走上方幂等返回），他人不得加入。
  if (isKaleidoRoom(room)) {
    throw new Error('单人对局，无法加入')
  }

  // ── BR re-home（用户定调：替代原游戏的房间移动，不再是独立 gametype）：所有「新对局」默认走「100 房网格 + 大时钟」。──
  //   判据：已启用 BR 的房，或尚无 chamber raidPath 的房（= 新开对局，含 /rooms 立即出勤的标准 gametype）→ BR；
  //   仅"已在跑的旧 chamber 局"（已生成 raidPath）继续走旧路径直到本局结束（向后兼容，不中途变结构）。
  const hasChamberRaid = Array.isArray(gamevars.raidPath) && gamevars.raidPath.length > 0
  const isBr = gamevars.br?.enabled === true || !hasChamberRaid

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
  // research 2026-05-29-B P1: 高危出勤 — 首位玩家的 heat 选择决定整局难度（raidPath 共享）。
  // sanitizeHeatLevel 在 HIGH_RISK.ENABLED=false 时恒返回 0，故预埋阶段恒为标准出勤。
  const heatLevel = sanitizeHeatLevel(loadout?.heatLevel)
  // ── 旧 chamber 模式：首位玩家生成 raidPath（BR 房跳过整段，走下方 BR 分支） ──
  if (!isBr && (!Array.isArray(nextRaidPath) || nextRaidPath.length === 0)) {
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
        nextRaidPath = generateRaidPath(chambers, mergedRules, { heatLevel })
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

  // ── Phase 31 re-home: BR 房层初始化 + 玩家落座（首玩家算，后玩家复用已存 gamevars.br） ──
  // initBrRoomLayer 幂等：br.enabled 已 true 直接复用；首玩家采样 100 房模板 + 算禁区表 + 选起始房。
  let brBlock = gamevars.br
  if (isBr) {
    const initRes = await initBrRoomLayer(client, room, gamevars)
    brBlock = initRes.br
    // 每玩家：落起始房、depth=0、map 镜像该房 templateId（喂所有读 player.map 的现有逻辑）
    if (brBlock?.enabled) {
      player.roomId = initRes.startRoomId
      player.depth = 0
      player.map = brBlock.roomTemplates?.[initRes.startRoomId] ?? 0
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
    // Phase 31 re-home: BR 房层（首玩家初始化后写一次，后玩家原样保留）。非 BR 房保持 gamevars.br（enabled:false）。
    br: brBlock || gamevars.br,
    // 29-B P1: 整局高危等级（首位玩家锁定后保留；预埋阶段恒 0）。供 pollution.tickEnvPollution
    //   + extractPlayer 奖励倍率读取。已存在则不覆盖，避免后加入玩家篡改难度。
    heatLevel: Number.isFinite(gamevars.heatLevel) ? gamevars.heatLevel : heatLevel,
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
  // Phase 31 re-home: BR 首玩家初始化网格时的日志提示（后玩家 br.enabled 已存在则不提示）
  const isFirstBr = isBr && brBlock?.enabled && !(gamevars.br?.enabled)
  const brNote = isFirstBr ? `（已展开 100 房网格 · 起始扇区 #${brBlock.startRoomId}）` : ''
  const nextRoom = await persistRoom(client, room, nextGamevars, [
    createLogEntry(`${classNote}${player.name} 加入了游戏${loadoutNote}${pathNote}${brNote}`, 'system'),
  ], { startGame: true })

  await client.from('profiles').update({ roomid: roomId }).eq('id', user.id)
  return nextRoom
}

/**
 * BR【缩圈致死】轻动作：仅跑 normalizeGamevars → 全房缩圈 sweep → 持久化，**无任何动作副作用**。
 *
 * 供客户端本地时钟探到「我的扇区刚由 open/warning 翻 forbidden」时近实时触发服务端复核致死。
 * 不信客户端：即便客户端谎报，persistResolutionWithPollution 内 sweepContractionDeaths 用
 *   rooms.started_at 重算 wall-clock，假触发判 forbidden=false → 全程 no-op（无副作用、无写放大）。
 *
 * 借 persistResolutionWithPollution 这个 host：它内部会按惯例跑 pollution/Ω tick（与其它动作一致，
 *   非 BR 房才 tick Ω；BR 房 Ω dormant）、sweep、分支/结局评估、再持久化。乐观锁 409 由 route 的
 *   withRetry 自动重试（与其它动作同路径）。
 *
 * @param {object} client supabase service-role client
 * @param {object} room rooms 行
 * @param {object} gamevars normalize 后 gamevars
 * @param {object} user 已鉴权用户（executeGameAction 已校验 me 存在）
 */
async function brTick(client, room, gamevars, user) {
  const resolution = createActionResolution({ room, actorId: user.id, gamevars })
  return persistResolutionWithPollution(client, room, resolution, user.id)
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
  // 'br_tick' 须放行 lootPrompt 守卫：持战利品提示的玩家也可能正踩在即将收缩的扇区里，
  //   必须能 tick 触发服务端复核致死（否则被卡在「请先处理战利品」无法自救/被判）。
  // 'abandonRun' 同理放行：持战利品提示也可放弃 kaleido run（非 kaleido 局该动作直接 throw，中性）。
  if (!['join', 'lootCorpse', 'dismissLootPrompt', 'br_tick', 'abandonRun'].includes(payload.action) && me?.lootPrompt) {
    throw new Error('请先处理当前战利品')
  }

  if (payload.action !== 'join' && !me) {
    throw new Error('你还未加入该对局')
  }

  if (payload.action === 'join') {
    return joinRoom(client, user, roomId, payload.loadout || null)
  }

  // BR【缩圈致死】近实时复核：客户端本地时钟探到「我的扇区刚由 open/warning 翻 forbidden」时
  //   发一次 br_tick → 服务端按 wall-clock + sector re-validate 后致死。无任何动作副作用，
  //   仅借 persistResolutionWithPollution 的 host 跑全房 sweep + 持久化（鉴权/错误同其它动作）。
  if (payload.action === 'br_tick') {
    return brTick(client, room, gamevars, user)
  }

  if (payload.action === 'move') {
    // Phase 31 re-home: BR 房 → 邻接房移动（moveToRoom）；旧房 → 沿 raidPath 前进（movePlayer，不变）
    if (gamevars.br?.enabled) {
      return moveToRoom(client, room, gamevars, user, Number(payload.toRoomId))
    }
    return movePlayer(client, room, gamevars, user, payload.selection || 'A')
  }

  // 时序跃迁BR「跳跃/深度」：消耗跃迁道具 + depth+=1（赌命即死链路在 persist 内）。
  //   与 move 同约束（持战利品时落上方 lootPrompt 守卫拒绝，不在白名单）。仅 BR 房有意义；
  //   brJump 内部自校 br.enabled/seed（非 BR 房抛中文错误），故此处直接转交。
  if (payload.action === 'br_jump') {
    return brJump(client, room, gamevars, user)
  }

  if (payload.action === 'advanceChamber') {
    // Phase 19: advanceChamber 仍映射旧 movePlayer（dormant 兼容；BR 房不应走此路径）
    return movePlayer(client, room, gamevars, user, payload.selection || 'A')
  }

  if (payload.action === 'search') {
    return searchArea(client, room, gamevars, user)
  }

  if (payload.action === 'attackNpc') {
    return attackNpc(client, room, gamevars, user, payload) // KP1 LW-2：透传 payload.stance（stance_duel 关用）
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

  // Phase 03/49: 道具合成（局内·消费 item_recipes）
  if (payload.action === 'craftItem') {
    return craftItemRecipe(client, room, gamevars, user, payload)
  }

  if (payload.action === 'lootCorpse') {
    return lootCorpse(client, room, gamevars, user, payload.corpseId, payload.entryId)
  }

  if (payload.action === 'dismissLootPrompt') {
    return dismissLootPrompt(client, room, gamevars, user)
  }

  // KALEIDO：显式放弃 run（仅 kaleido 局有效；startKaleidoRun 走 /api/kaleido/run 独立路由——
  //   它要「建房」，而本分发器入口强制已有 roomId）
  if (payload.action === 'abandonRun') {
    return abandonKaleidoRun(client, room, gamevars, user)
  }

  throw new Error('未知动作')
}

// Phase 19.5+19.6: movePlayer 重写为 advanceChamber 模型
// 旧签名 (client, room, gamevars, user, mapId) — mapId 现在被忽略（payload.selection 可选）
// 玩家沿 raidPath 前进 1 步（player.chamberIndex += 1）。selection（'A'/'B'/'C'）仅作
// 日志叙事；实际下一段恒为 raidPath[idx+1]（线性路径，selection 不影响推进目标）。
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

  // KALEIDO 推进门禁（KP0-R S1·HIGH）：当前关 exit_condition 未达成不得前进——
  //   否则 move×4 + 尾关刷回合即可 7 动作速通全 run、levels 1-4 恒 'ready'。
  //   clearedSeq 由 advanceKaleidoProgress 在判定达成时写入。非 kaleido 局零变化。
  if (isKaleidoRoom(room)) {
    const curSeq = currentIdx + 1
    if (((gamevars.kaleido?.clearedSeq) ?? 0) < curSeq) {
      throw new Error('本关目标未达成，无法前进')
    }
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

  // KALEIDO 入关状态清零（KP0-R S1/S6）：turnCount 归零（per-level 语义——防已清关刷回合
  //   秒清下一关）；房间级 bossDefeated 复位（防跨关粘连，本关 boss_kill 只认本关击杀）。
  if (isKaleidoRoom(room)) {
    nextPlayer.turnCount = 0
    resolution.gamevars = { ...resolution.gamevars, bossDefeated: false }

    // KP1 LW-1：boss 关（seq=末关）入关投放 boss 实例 + 自动遭遇 → 玩家 attackNpc 杀之 →
    //   bossDefeated=true（公共击杀链自动置·gameActions:1831）→ evaluateExitCondition(boss_kill) 判过关。
    //   双闸：isKaleidoRoom ∧ archetype==='boss'；boss 属性用 D1 采样的 kaleidoEnemy（已按 seq 缩放）、
    //   npc.level='boss' 保证击杀触发 bossDefeated。多人局/kaleido 非 boss 关不进此分支 → 逐字节零变化。
    if (nextChamber.archetype === 'boss' && nextChamber.kaleidoEnemy) {
      const ke = nextChamber.kaleidoEnemy
      const bossInst = normalizeNpcInstance({
        npc: { id: ke.npcId ?? null, name: ke.name || '首领', level: 'boss', hp: ke.hp, atk: ke.atk, def: ke.def },
        hp: ke.hp, maxHp: ke.maxHp ?? ke.hp, mapId: nextChamber.templateId,
      })
      resolution.gamevars = {
        ...resolution.gamevars,
        npcInstances: [...(resolution.gamevars.npcInstances || []), bossInst],
      }
      nextPlayer.encounter = { instanceId: bossInst.id }
      appendResolutionLog(resolution, `⚠ 首领「${bossInst.npc.name}」挡在前路 —— 击败它才能过关`, 'damage')
    }
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
    // research-2026-05-29-E P0 — 传遭遇者实力，探针属性按其相对缩放 + 硬封顶（防 whale 探针碾压 / 毒包构造）
    const probe = isKaleidoRoom(room) ? null : await tryEncounterProbe(client, user.id, nextChamber.templateId, {
      hp: nextPlayer.hp,
      maxHp: nextPlayer.maxHp,
      atk: nextPlayer.atk,
      def: nextPlayer.def,
    })
    if (probe) {
      // 把 probe 信息挂到玩家身上作为 encounter（特殊类型）
      const playerWithProbe = {
        ...nextPlayer,
        probeEncounter: {
          probeId: probe.id,
          // 28-E P0: 只下发稳定 pseudonym，绝不把 owner_id 暴露给遭遇方
          ownerPseudonym: buildOwnerPseudonym(probe.id),
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

// ═══════════════════════════════════════════════════════════════
//  Phase 31 re-home: BR「100 房网格」移动 —— moveToRoom
//  邻接 + 开放校验后把 player.roomId 改到目标房，map 镜像目标房 templateId。
//  复用旧 movePlayer 的探针/事件/分支钩子（setVisitedMapFlag / processEventTrigger /
//  tryEncounterProbe），让现有系统在「当前房」上零改动继续工作。
//  不再 +chamberIndex、不再启动 Ω 倒计时（大时钟是唯一时间压力）。
// ═══════════════════════════════════════════════════════════════
async function moveToRoom(client, room, gamevars, user, toRoomId) {
  const player = getPlayer(gamevars, user.id)
  if (!player?.alive) throw new Error('已阵亡玩家无法移动')
  if (player.extracted) throw new Error('已撤离玩家无法移动')

  // ① BR 校验
  const br = gamevars.br
  if (!br?.enabled) throw new Error('该对局未启用网格移动')
  if (br.seed == null) throw new Error('BR 对局未初始化（缺少 seed）')

  // gamevars 瘦身：rooms/adj/templateMeta 已移出 gamevars.br → 按 seed 取 layout（首动作付一次 DB 读，
  //   之后 memo 命中无 IO）。邻接/标签/伪 chamber meta 全部从 layout 读，roomTemplates 仍读 gamevars.br（保留）。
  const layout = await getRaidLayout(client, br.seed, brLayoutHint(br))

  const fromRoomId = player.roomId
  if (fromRoomId == null) throw new Error('你当前不在任何扇区')

  const target = Math.floor(Number(toRoomId))
  if (!Number.isFinite(target)) throw new Error('目标扇区无效')
  if (target === fromRoomId) throw new Error('你已在该扇区')

  // ② 邻接校验（用 layout.adj 派生邻接图，避免每次查 DB）
  const neighbors = Array.isArray(layout.adj?.[fromRoomId]) ? layout.adj[fromRoomId] : []
  if (!neighbors.includes(target)) throw new Error('目标扇区不相邻')

  // ③ 开放校验：改读 gamevars.br.closePhases 快照（与致死 sweepContractionDeaths / 客户端着色同源同表达式）。
  //   forbidden ⟺ cpTarget <= effPhase（用 `<=` 不是 `<`）。move 与 sweep 共用同一快照 → 能移进的房不会下一拍被杀。
  const effPhase = getBrEffectivePhase(room, gamevars, player)
  const cpTarget = Number.isFinite(br.closePhases?.[target]) ? br.closePhases[target] : MAX_CLOSE_PHASE
  if (cpTarget <= effPhase) {
    throw new Error('目标扇区已进入禁区（缩圈），无法进入')
  }

  // ③.5 体力结算（BR 专属·additive·只由移动消耗）：必须在任何副作用（createActionResolution /
  //   setVisitedMapFlag / processEventTrigger / tryEncounterProbe）之前，保证拦截零副作用。
  //   nowMs 在 moveToRoom 内取一次，供体力 + 日志共用（照 clock.js「now 可注入」范式，纯函数级仍可注入便于测试）。
  //   applyMoveStamina 内部 backfill 老玩家无字段 → 懒回复到 now → 判本次消耗 → 通过则扣除 + 刷两时间戳。
  const nowMs = Date.now()
  const staminaResult = applyMoveStamina(player, nowMs)
  if (staminaResult.blocked) {
    // 体力不足：不扣血、不移动、零副作用。携 code 供 route 精确映射；message 已中文兜底。
    throw Object.assign(new Error('体力不足，稍候再移动'), { code: 'no_stamina' })
  }
  const moveMult = staminaResult.multiplier
  const staminaCost = staminaResult.cost

  // ④ 通过：镜像 templateId 喂旧逻辑 + 清 encounter
  //   roomTemplates 仍读 gamevars.br（保留字段）；templateMeta / rooms 标签改读 layout（已移出 gamevars）。
  const targetTid = br.roomTemplates?.[target] ?? player.map ?? 0
  const targetMeta = layout.templateMeta?.[targetTid] || null
  const roomLabel = layout.rooms.find(r => r.roomId === target)?.label || `扇区 #${target}`
  const chamberName = targetMeta?.name || roomLabel

  const resolution = createActionResolution({ room, actorId: user.id, gamevars })
  clearEncounterIfAny(resolution, user.id)

  let nextPlayer = {
    ...player,
    roomId: target,
    map: targetTid,           // 镜像当前房 templateId（corpse.mapId / regionAssessment / 现有逻辑读 player.map）
    encounter: null,
    omegaCountdown: null,     // BR 下 Ω 倒计时 dormant（大时钟替代）
    // 体力字段：staminaResult.player 已含「回复后−消耗 + 刷新的 staminaAt/lastMoveAt」，整体并入。
    stamina:    staminaResult.player.stamina,
    staminaAt:  staminaResult.player.staminaAt,
    lastMoveAt: staminaResult.player.lastMoveAt,
    maxStamina: staminaResult.player.maxStamina ?? STAMINA_CONFIG.MAX_STAMINA,
  }

  // 低污染区自然衰减（保留，与旧 movePlayer 同款）
  nextPlayer = applyRetreatDecay(nextPlayer, gamevars.envPollution || 0)

  setResolutionPlayer(resolution, user.id, nextPlayer)
  appendResolutionLog(
    resolution,
    `${player.name} 移动至【${chamberName}】(扇区 #${target}·阶段 ${effPhase})`,
    'system',
  )
  // 快速移动惩罚日志：仅 multiplier>1 才追加（正常 1× 不刷，避免噪音）。type='attack' → gameUi LogLine 橙色。
  if (moveMult > 1) {
    appendResolutionLog(
      resolution,
      `⚡ 快速移动惩罚 ×${moveMult.toFixed(1)}（消耗 ${staminaCost} 体力）`,
      'attack',
    )
  }
  // Ω 特殊扇区只作风味标记（不启动独立倒计时）
  if ((targetMeta?.omegaWindow || 0) > 0) {
    appendResolutionLog(resolution, `⚠ 【${chamberName}】是 Ω 特殊扇区 —— 时间压力由大时钟统一施加`, 'system')
  }
  if (targetMeta?.type === 'milestone') {
    appendResolutionLog(resolution, `⚔ 里程碑扇区：${chamberName} —— 强敌可能正等待`, 'damage')
  }

  // 自动 flag：玩家曾访问该扇区模板（供分支引擎）— 用 templateId 替代 mapId（与旧 movePlayer 一致）
  setVisitedMapFlag(resolution, targetTid)

  // on_enter_map 事件钩子（保持事件 API 兼容，传 templateId 作 mapId）
  try {
    await processEventTrigger(client, resolution, user.id, 'on_enter_map', { mapId: targetTid })
  } catch (e) {
    console.error('[moveToRoom] event trigger 失败:', e?.message)
  }

  // 进入扇区时遭遇异步探针（与旧 movePlayer 同款：传遭遇者实力按其相对缩放 + 硬封顶）
  try {
    const probe = isKaleidoRoom(room) ? null : await tryEncounterProbe(client, user.id, targetTid, {
      hp: nextPlayer.hp,
      maxHp: nextPlayer.maxHp,
      atk: nextPlayer.atk,
      def: nextPlayer.def,
    })
    if (probe) {
      const playerWithProbe = {
        ...nextPlayer,
        probeEncounter: {
          probeId: probe.id,
          ownerPseudonym: buildOwnerPseudonym(probe.id),
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
    console.error('[moveToRoom] probe encounter 失败:', e?.message)
  }

  console.log(`[br][game] move room=${room.id} user=${user.id} ${fromRoomId}→${target} effPhase=${effPhase}`)
  return persistResolutionWithPollution(client, room, resolution, user.id)
}

/** BR 跃迁道具名集合：从 item_pool 取 jump_charge>0 的道具名（按 jump_charge 动态判定，不硬比 NAME）。
 *  复用 _allItemsCache（搜索链已建并缓存全量 item_pool）；缓存冷时打一次窄查询（仅 name 列）。
 *  返回 Set<string>；查询失败兜底回退 JUMP_CONFIG.ITEM.NAME（保证有道具时仍能识别）。 */
async function getJumpItemNames(client) {
  // 缓存命中：直接从全量池筛 jump_charge>0
  if (Array.isArray(_allItemsCache) && _allItemsCache.length > 0) {
    const fromCache = _allItemsCache.filter(i => (Number(i?.jump_charge) || 0) > 0).map(i => i.name)
    if (fromCache.length > 0) return new Set(fromCache)
    // 缓存里没有任何跃迁道具：可能是缓存早于 SQL 部署 → 落到下方窄查询复核
  }
  try {
    const { data, error } = await client.from('item_pool').select('name').gt('jump_charge', 0)
    if (error) {
      console.error('[brJump] jump_charge 查询失败:', error.message)
      return new Set([JUMP_CONFIG.ITEM.NAME])
    }
    const names = (data || []).map(r => r.name).filter(Boolean)
    return names.length > 0 ? new Set(names) : new Set([JUMP_CONFIG.ITEM.NAME])
  } catch (e) {
    console.error('[brJump] jump_charge 查询异常:', e?.message)
    return new Set([JUMP_CONFIG.ITEM.NAME])
  }
}

// ═══════════════════════════════════════════════════════════════
//  时序跃迁BR「跳跃 / 深度」—— brJump（单向阶梯·耗道具+冷却·赌命）
//  以 moveToRoom（本文件上方）为精确模板：校验链 → 体力/冷却 gate → resolution → persist。
//  设计契约（docs/timejump-br-design.md §4 赌命三角）：
//    - additive·复用现有：消耗一枚 jump_charge>0 道具 + player.depth += 1 + 刷 lastJumpAt，
//      不另造死亡/经济。depth 抬高后，persistResolutionWithPollution 内已调的 sweepContractionDeaths
//      会按「新有效阶段 effectivePhase(realPhase, depth, maxPhase)」对**当前所在扇区**判 forbidden ⇒
//      跳进禁区即死（与缩圈/PvP 同一死亡后果路径：翻 alive=false + settleCorpseGeneration 生尸体 +
//      logPlayerDeath(cause='contraction')）。本函数无任何额外致死代码 —— 致死链路已就位。
//    - 失败抛 Error（携 code 供 route 精确映射 400），message 中文兜底。
// ═══════════════════════════════════════════════════════════════
async function brJump(client, room, gamevars, user) {
  const player = getPlayer(gamevars, user.id)
  // ① 在场校验（与 moveToRoom 对齐）
  if (!player?.alive) throw new Error('已阵亡无法跃迁')
  if (player.extracted) throw new Error('已撤离无法跃迁')

  // ② BR 启用校验
  const br = gamevars.br
  if (!br?.enabled) throw new Error('该对局未启用时序跃迁')
  if (br.seed == null) throw new Error('BR 对局未初始化（缺少 seed）')

  // ③ 冷却 gate（wall-clock 懒判，不落库 tick；首跃 lastJumpAt=null ⇒ 无冷却）
  const nowMs = Date.now()
  const last = Number.isFinite(player.lastJumpAt) ? player.lastJumpAt : null
  if (last != null) {
    const elapsedSec = (nowMs - last) / 1000
    if (elapsedSec < JUMP_CONFIG.COOLDOWN_SEC) {
      const leftSec = Math.ceil(JUMP_CONFIG.COOLDOWN_SEC - elapsedSec)
      throw Object.assign(new Error(`跃迁冷却中（剩 ${leftSec}s）`), { code: 'jump_cooldown' })
    }
  }

  // ④ 道具 gate：背包里有一枚 jump_charge>0 道具（按 jump_charge 动态判定，不硬比 NAME）
  const jumpNames = await getJumpItemNames(client)
  const carried = (player.inventory || []).find(n => jumpNames.has(n))
  if (!carried) {
    throw Object.assign(new Error('没有可用的时序跃迁器'), { code: 'no_jump_item' })
  }

  // ⑤ 封顶 gate：depth+1 对有效阶段无增益（已到 maxPhase）⇒ 硬拒，不耗道具、零副作用，体验清晰
  const clock = getBrClock(room, gamevars)
  const curDepth = Number.isFinite(player.depth) ? player.depth : 0
  // 双重封顶：自身 MAX_DEPTH 旋钮 + effectivePhase 的 maxPhase 钳制（任一已到顶即无增益）
  if (curDepth >= JUMP_CONFIG.MAX_DEPTH
      || effectivePhase(clock.realPhase, curDepth + 1, clock.maxPhase) === effectivePhase(clock.realPhase, curDepth, clock.maxPhase)) {
    throw Object.assign(new Error('已达最深时序层，无法继续跃迁'), { code: 'jump_capped' })
  }

  // ── 通过：消耗一枚跃迁道具 + depth += 1 + 刷 lastJumpAt + 清交互态（防跨层残留） ──
  const nextDepth = curDepth + 1
  const inventory = removeInventoryItem(player.inventory, carried, 1)

  const resolution = createActionResolution({ room, actorId: user.id, gamevars })
  // 清 encounter（视为放过 NPC，与 move 同款），日志静默避免噪音
  clearEncounterIfAny(resolution, user.id, { silent: true })

  setResolutionPlayer(resolution, user.id, {
    ...player,
    depth: nextDepth,
    lastJumpAt: nowMs,
    inventory,
    encounter: null,
    probeEncounter: null,
    lootPrompt: null,
  })

  const newEff = effectivePhase(clock.realPhase, nextDepth, clock.maxPhase)
  appendResolutionLog(
    resolution,
    `${player.name} 以【${carried}】向更深的时间层跃迁 — 抵达深度 ${nextDepth}（有效阶段 ${newEff}）`,
    'system',
  )

  console.log(`[br][game] jump room=${room.id} user=${user.id} depth ${curDepth}→${nextDepth} realPhase=${clock.realPhase} newEff=${newEff}`)

  // 赌命即死链路已就位：persistResolutionWithPollution → sweepContractionDeaths 会对**当前所在扇区**
  //   按 newEff 判 forbidden ⇒ 跳进禁区即死（无需任何额外致死代码）。
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

  // 攻击：单次结算 — 玩家攻击探针, 探针反击。
  // Phase 37（红线 ⑥）：探针纳入统一引擎。
  //   - 玩家侧用 buildCombatPlayer(player, myEquips)（此前内联裸 player.atk/def，未计装备/乘区）。
  //   - 探针侧把 equipmentSnapshot 已聚合好的 atk/def/maxHp 当 base 过 computeCombatStats
  //     （其余分量缺省→0 → 输出逐值 == 快照 atk/def，不重复加装备）。
  //   - 双向走 calcDamage（与 PvE/PvP 同公式）。注意 calcDamage 含暴击随机 → 探针伤害数值会变
  //     （此前是确定式 atk−floor(def×0.5)），这是把探针纳入统一引擎的预期后果（任务红线 ⑥ 明确要求）。
  const [rules, buffPool, probeEquippedInstances] = await Promise.all([
    loadGameRules(client),
    loadBuffPool(client),
    fetchEquippedInstances(client, room.id, [user.id]),
  ])
  const myEquips = groupEquipsByOwner(probeEquippedInstances)[user.id] || []
  let me = buildCombatPlayer(player, myEquips)
  me = dispatchTurnStart(resolution, me, buffPool)   // P6 on_turn_start（起手·空 _pass 中性）
  const probeE = computeCombatStats({
    atk: probeEnc.atk,
    def: probeEnc.def,
    maxHp: probeEnc.maxHp,
    hp: probeEnc.hp,
  })
  const myHp = player.hp || 0   // HP 记账仍以玩家存储血为准（me.hp 仅供公式，不改存档语义）
  let probeDmgFromMe = calcDamage(me, probeE, rules, '')
  // P3 战斗钩子管线（探针·我打）：attacker=me，defender=探针（probeE 无 _pass → modifier 仅来自玩家被动·空池逐值不变·守 Phase 37）。
  probeDmgFromMe = applyCombatPipeline(probeDmgFromMe, {
    attacker: me, defender: probeE, defenderHp: probeEnc.hp,
    resolution, label: '探针·我打',
  })
  const probeHpAfter = Math.max(0, probeEnc.hp - probeDmgFromMe)
  const probeKilled = probeHpAfter <= 0

  let myHpAfter = myHp
  let probeDmgToMe = 0
  if (!probeKilled) {
    probeDmgToMe = calcDamage(probeE, me, rules, '')
    // P3 战斗钩子管线（探针·打我）：attacker=探针 probeE，defender=me（空池逐值不变·守 Phase 37）。
    probeDmgToMe = applyCombatPipeline(probeDmgToMe, {
      attacker: probeE, defender: me, defenderHp: myHp,
      resolution, label: '探针·打我',
    })
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
    // P6 on_hp_below_30：玩家被探针反击跌破 30% 时触发绝地被动（空 _pass 中性）
    dispatchHpBelow30(resolution, user.id, me, probeE, myHp, myHpAfter, buffPool)
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
          survivedSeconds: raidSurvivedSeconds(room),
          chamberDepth: chamberDepthOf(player),
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

async function attackNpc(client, room, gamevars, user, payload = {}) {
  return resolveNpcAttackAction(client, room, gamevars, user, payload)
}

async function attackPlayer(client, room, gamevars, user, targetUid) {
  if (isKaleidoRoom(room)) throw new Error('本对局禁止玩家互攻')  // KALEIDO 单人，防御性
  return resolvePlayerAttackAction(client, room, gamevars, user, targetUid)
}

// ── 撤离：把背包道具与装备转入账户库，标记玩家 extracted ──
// ── 撤离：远星函馆 is_exit + exit_cost 模型 ──
async function extractPlayer(client, room, gamevars, user, payload) {
  const player = getPlayer(gamevars, user.id)
  if (!player) throw new Error('你还未加入该对局')
  if (!player.alive) throw new Error('阵亡玩家无法撤离')
  if (player.extracted) throw new Error('已经撤离')
  if (isKaleidoRoom(room)) throw new Error('本对局无撤离机制')  // KALEIDO 用 run 收敛，非撤离

  // Phase 19.5: 从 gamevars.raidPath 取当前 chamber（不查 map_config）
  // gamevars 瘦身：BR 房的 is_exit/exit_cost 等来自 templateMeta（已移出 gamevars）→ 取 layout 传入。
  //   非 BR 房（raidPath 模式）layout=null，getChamberAsMapConfig 走旧分支不受影响。
  const br = gamevars?.br
  const layout = br?.enabled && br.seed != null ? await getRaidLayout(client, br.seed, brLayoutHint(br)) : null
  const mapConfig = getChamberAsMapConfig(gamevars, player, layout)
  if (!mapConfig) throw new Error('chamber 数据不存在（raidPath 未初始化？）')
  if (!mapConfig.is_exit) {
    throw new Error(`【${mapConfig.name}】不是撤离点`)
  }
  const playerMapId = mapConfig.map_id   // 实际是 chamber.templateId（兼容旧代码引用）

  // ── research 2026-05-29-A P0: 撤离信号锁定窗口（预埋，SIGNAL_LOCK.ENABLED=false 时整段跳过） ──
  // 把撤离从即时安全按钮改成承诺：首次点撤离不立即退避，而是发出撤离信号进入
  // SIGNAL_LOCK.WINDOW_TURNS 回合脆弱态（环境/个人污染加速 + 探针遭遇概率提升，详见 signalLock.js）。
  // 回合循环 tick 到 signalLock 归零（tickSignalLock ready）后，玩家再次进入本函数走下方完成分支。
  // 红线（notes-2026-05-29-A 发现 7）：纯异步压力，绝不召唤同屏真人对手。
  // 启用需 Phase 21/24b 同步接：回合 tick 调 tickSignalLock + applySignalLockPollution、
  //   tryEncounterProbe 读 signalLockProbeEncounterMult、倒计时 UI。
  if (SIGNAL_LOCK.ENABLED && !isSignalLockActive(player)) {
    const resolution = createActionResolution({ room, actorId: user.id, gamevars })
    setResolutionPlayer(resolution, user.id, beginSignalLock(player))
    appendResolutionLog(
      resolution,
      `🛰 ${player.name} 发出撤离信号 — 进入 ${SIGNAL_LOCK.WINDOW_TURNS} 回合脆弱态（污染加速 · 探针遭遇概率提升），坚持到信号锁定完成方可结构退避`,
      'system',
    )
    return await persistResolutionWithPollution(client, room, resolution, user.id)
  }

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
      // Phase 31 re-home: BR 房用当前房 templateId（getCurrentChamberTemplateId 已 BR 分支）；旧房用 raidPath[chamberIndex]
      chamberTemplateId: getCurrentChamberTemplateId(gamevars, player),
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

  // research 2026-05-29-B P1: 高危出勤奖励对价 — 按 gamevars.heatLevel 放大可购买点数
  //   （class_pt 保底里程碑不放大，见 heat.js 红线 + economy-canon §6.1）。
  //   HIGH_RISK.ENABLED=false 时 heatLevel 恒被 sanitize 为 0 → no-op。下方 econ 累加器与
  //   creditPoints 都基于这份已放大的数组，保证通胀埋点口径一致。
  pointsCredits = applyHeatPointsMultiplier(pointsCredits, gamevars.heatLevel)

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
    signalLock: null,   // 29-A: 信号锁定完成，清理脆弱态
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
  // research 2026-05-29-B P1: 高危出勤按 fragmentDropMult 放大该概率（HIGH_RISK.ENABLED=false → 恒 0.35）
  try {
    if (Math.random() < heatFragmentDropChance(0.35, gamevars.heatLevel)) {
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
        markFragmentLevelUp(resolution, user.id, fragment)
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
    .select('*, tier:equipment_tiers(*, passive:passive_skills(*), series:equipment_series(slot,name))')
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

    // P6 on_equip：穿戴时一次性触发（治疗/上 buff 等；「一次性」语义 ⇒ buff 走自身 duration 自然过期·无需卸下撤销）。
    //   仅当该装备 tier 绑定了 trigger_event='on_equip' 的被动才生效 —— 当前 0/17 tier 绑定 ⇒ passive 恒 null ⇒
    //   整块跳过、不 loadBuffPool、gamevars 逐值不变（守 Phase 37 中性）。stat_boost 不持久(atk 每战重算)故对 on_equip 无意义，治疗/buff 才有效。
    let equipGamevars = gamevars
    const equipLogs = [createLogEntry(`${getPlayer(gamevars, user.id).name} 装备了【${instance.tier?.name || '未知装备'}】`, 'system')]
    const onEquipPassive = instance.tier?.passive
    if (onEquipPassive && onEquipPassive.trigger_event === 'on_equip') {
      const buffPool = await loadBuffPool(client)
      const player = getPlayer(gamevars, user.id)
      const { attackerUpdated, logs } = triggerPassives('on_equip', player, null, [onEquipPassive], buffPool)
      equipGamevars = {
        ...gamevars,
        players: {
          ...gamevars.players,
          [user.id]: {
            ...player,
            hp: Math.min(player.maxHp ?? 100, attackerUpdated.hp),
            buffs: attackerUpdated.buffs || player.buffs || [],
          },
        },
      }
      for (const m of logs) equipLogs.push(createLogEntry(m, 'buff'))
    }
    const nextRoom = await persistRoom(client, room, equipGamevars, equipLogs)
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
