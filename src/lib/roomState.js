// 用相对路径而非 @/ 别名：roomState.js 被 scripts/smoke-check.mjs 以原生 Node ESM 直接导入，
// Node 不解析 webpack 的 @/ 别名（clock.js / constants.js 自身无 import，可被原生 Node 解析）。
import {
  clampPhaseSeconds,
  clampMaxPhase,
  PHASE_SECONDS_DEFAULT,
  MAX_PHASE_DEFAULT,
} from './server/br/clock.js'
import { STAMINA_CONFIG } from './constants.js'

const LOG_LIMIT = 200

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function formatLogTime(date = new Date()) {
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export function normalizeLogEntry(entry) {
  if (!entry) return null
  if (typeof entry === 'string') {
    return { text: entry, type: 'system', time: '' }
  }
  return {
    text: entry.text || '',
    type: entry.type || 'system',
    time: entry.time || '',
  }
}

export function normalizeCorpseEntry(entry) {
  if (!entry) return null
  return {
    id: entry.id || makeId('loot'),
    type: entry.type || 'item',
    name: entry.name || '',
    itemName: entry.itemName || null,
    tierId: entry.tierId ?? null,
    instanceId: entry.instanceId ?? null,
    slot: entry.slot || '',
    rarity: entry.rarity || '',
    durability: entry.durability ?? null,
    durabilityMax: entry.durabilityMax ?? null,
  }
}

export function normalizeCorpse(corpse) {
  if (!corpse) return null
  return {
    id: corpse.id || makeId('corpse'),
    type: corpse.type || 'npc',
    name: corpse.name || '未知尸体',
    mapId: corpse.mapId ?? 0,
    ownerPlayerId: corpse.ownerPlayerId || null,
    createdAt: corpse.createdAt || '',
    entries: Array.isArray(corpse.entries)
      ? corpse.entries.map(normalizeCorpseEntry).filter(Boolean)
      : [],
  }
}

export function normalizeLootPrompt(prompt) {
  if (!prompt) return null
  return {
    corpseId: prompt.corpseId || '',
    corpseName: prompt.corpseName || '未知尸体',
    source: prompt.source || 'search',
    options: Array.isArray(prompt.options)
      ? prompt.options.map(normalizeCorpseEntry).filter(Boolean)
      : [],
  }
}

// ── Phase 16: NPC 实例池（跨袭击持久化的 NPC 状态） ──
// 每条记录 = 房间内的一只独立 NPC 实例，HP 跨多次袭击持久化。
// 死亡时整条移出。同一 NPC 池配置可衍生多个实例（不同地图 / 不同时间）。
export function normalizeNpcInstance(inst) {
  if (!inst) return null
  return {
    id:        inst.id || makeId('npc-inst'),
    npcId:     inst.npcId ?? inst.npc?.id ?? null,
    npc:       inst.npc || null,    // npc_pool 数据快照（避免后续 join）
    hp:        Number.isFinite(inst.hp) ? inst.hp : (inst.npc?.hp || 1),
    maxHp:     Number.isFinite(inst.maxHp) ? inst.maxHp : (inst.npc?.hp || 1),
    mapId:     inst.mapId ?? 0,
    createdAt: inst.createdAt || new Date().toISOString(),
  }
}

export function normalizeEncounter(enc) {
  if (!enc) return null
  if (!enc.instanceId) return null
  return { instanceId: String(enc.instanceId) }
}

// PvP 被攻击事件 — 给被攻击方触发 toast，每次攻击递增 seq 让客户端能区分新事件。
export function normalizePvpHit(hit) {
  if (!hit) return null
  return {
    seq:        Number(hit.seq) || 0,
    fromName:   hit.fromName || '未知攻击者',
    damage:     Number(hit.damage) || 0,
    countered:  !!hit.countered,
    counterDmg: Number(hit.counterDmg) || 0,
    at:         hit.at || new Date().toISOString(),
  }
}

export function normalizeGamevars(gamevars = {}) {
  return {
    ...gamevars,
    players: gamevars.players || {},
    corpses: Array.isArray(gamevars.corpses)
      ? gamevars.corpses.map(normalizeCorpse).filter(Boolean)
      : [],
    log: Array.isArray(gamevars.log)
      ? gamevars.log.map(normalizeLogEntry).filter(Boolean)
      : [],
    turn: gamevars.turn || 0,
    // ── 远星函馆：污染 + 结局判定字段 ──
    envPollution:            gamevars.envPollution            ?? 0,
    failedRetreats:          gamevars.failedRetreats          ?? 0,
    totalEntityKills:        gamevars.totalEntityKills        ?? 0,
    totalEntityInteractions: gamevars.totalEntityInteractions ?? 0,
    totalFragmentsExtracted: gamevars.totalFragmentsExtracted ?? 0,
    spawnedEntityCount:      gamevars.spawnedEntityCount      ?? 0,
    flags: {
      envPollutionMax:        false,
      envPollutionBelow60:    true,
      lowFragments:           true,
      totalEntityKillRate:    0,
      ...(gamevars.flags || {}),
    },
    // ── Phase 16: NPC 实例池（跨袭击持久化） ──
    npcInstances: Array.isArray(gamevars.npcInstances)
      ? gamevars.npcInstances.map(normalizeNpcInstance).filter(Boolean)
      : [],
    // ── Phase 19.4: 肉鸽 chamber 路径（joinRoom 时生成，房间共享） ──
    raidPath: Array.isArray(gamevars.raidPath) ? gamevars.raidPath : [],
    // ── Phase 20.2: 残片解锁规则合并结果（joinRoom 时写入） ──
    unlocksMerged: gamevars.unlocksMerged && typeof gamevars.unlocksMerged === 'object'
      ? gamevars.unlocksMerged
      : null,
    // ── Phase 20.2: 本局贡献的解锁残片列表（结局横幅展示用） ──
    unlocksContributed: Array.isArray(gamevars.unlocksContributed) ? gamevars.unlocksContributed : [],
    // ── Phase 31 re-home: BR「100 房网格 + 大时钟」对局态（仅 BR 房有意义） ──
    // 向后兼容铁律：旧存档无 gamevars.br → 注入 {enabled:false,...}；
    //   getCurrentChamberTemplateId 在 br.enabled=false 时回退旧 raidPath[chamberIndex] 分支，现有对局零影响。
    br: normalizeBrBlock(gamevars.br),
  }
}

/**
 * 归一化 BR 对局块（gamevars.br）。BR 对局态落 rooms.gamevars，不新增 br_match* 对局表。
 * 默认值保证旧存档向后兼容（enabled:false）。
 *
 * ── gamevars 瘦身（slim 形状）──
 * 此前内嵌的三个大块已移出 gamevars（每动作整段写 rooms 表 + realtime 广播 ~40-50KB → 拖慢免费服务器）：
 *   - rooms（18.7KB 静态拓扑）：所有对局相同 → 客户端从 /api/br/topology 拉一次永久缓存；
 *                              服务端从 getRaidLayout(seed).rooms 派生。
 *   - adj（邻接图）：可由 br_rooms.neighbor_ids 派生 → getRaidLayout(seed).adj。
 *   - templateMeta（10.9KB 伪 chamber 表）：可由 sampleRoomTemplates(seed) 重算 → getRaidLayout(seed).templateMeta。
 * 三者全部从 seed 确定性重算（同 seed 同结果），故移出零信息损失。
 *
 * 向后兼容：旧 fat 存档若仍含 b.rooms/b.adj/b.templateMeta，本函数**直接丢弃**（不再透传）→
 *   normalize 后新旧房同形（slim），下次写库即收敛。绝不 require 被删字段（缺失走默认，不抛错）。
 *
 * 保留字段（slim ≈ 5KB）：
 *   enabled       该局是否 BR（joinRoom 首玩家按 room.gametype===20 置 true）
 *   seed          per-raid 确定性种子（首玩家生成，永不变；派生 rooms/adj/templateMeta 的唯一输入）
 *   phaseSeconds  每阶段秒数（钳到 [MIN_PHASE_SECONDS=5, ∞)，默认 900）
 *   maxPhase      末路阶段编号（钳到 [0, ∞)，默认 4）
 *   startRoomId   该局中心起始房（spawnRoom 结果，供日志/兜底）
 *   roomTemplates { [roomId]: templateId } 100 项 ~1KB —— 保留：getCurrentChamberTemplateId 纯函数依赖它
 *   closePhases   { [roomId]: closePhase } 100 项 ~1KB —— 保留：客户端着色（公开禁区表，不下发 seed）
 */
export function normalizeBrBlock(br) {
  const b = br && typeof br === 'object' ? br : {}
  const enabled = b.enabled === true
  const seed = Number.isFinite(b.seed) ? b.seed : null
  // 复用 br/clock.js 的钳制（已存在，不重写）
  const phaseSeconds = b.phaseSeconds != null ? clampPhaseSeconds(b.phaseSeconds) : PHASE_SECONDS_DEFAULT
  const maxPhase = b.maxPhase != null ? clampMaxPhase(b.maxPhase) : MAX_PHASE_DEFAULT
  return {
    enabled,
    seed,
    phaseSeconds,
    maxPhase,
    startRoomId: b.startRoomId ?? null,
    roomTemplates: b.roomTemplates && typeof b.roomTemplates === 'object' ? b.roomTemplates : {},
    closePhases: b.closePhases && typeof b.closePhases === 'object' ? b.closePhases : {},
    // rooms / adj / templateMeta 已移出（getRaidLayout(seed) 派生）：旧 fat 存档的这些字段在此被丢弃。
  }
}

// ── Phase 19.4: chamber 路径相关 helper ──

/** 取玩家当前所在 chamber 数据（从 raidPath[player.chamberIndex]） */
export function getCurrentChamber(gamevars, player) {
  const path = Array.isArray(gamevars?.raidPath) ? gamevars.raidPath : []
  const idx = player?.chamberIndex ?? 0
  if (idx < 0 || idx >= path.length) return null
  return path[idx]
}

/** 取玩家当前 chamber 的 templateId（用于过滤 item/npc/fragment 池）
 *  Phase 31 re-home: BR 房读 roomTemplates[player.roomId]；否则回退旧 chamber 模式（不变）。 */
export function getCurrentChamberTemplateId(gamevars, player) {
  // ── BR 分支：当前房 → 采样的 templateId（现有按 templateId 过滤的池零改动复用） ──
  if (gamevars?.br?.enabled && player?.roomId != null) {
    return gamevars.br.roomTemplates?.[player.roomId] ?? null
  }
  // ── 旧 chamber 模式回退（不变） ──
  const ch = getCurrentChamber(gamevars, player)
  return ch?.templateId ?? null
}

export function createLogEntry(text, type = 'system', at = new Date()) {
  return {
    text,
    type,
    time: formatLogTime(at),
  }
}

export function appendGameLog(gamevars, entries) {
  const nextEntries = (Array.isArray(entries) ? entries : [entries])
    .map(normalizeLogEntry)
    .filter(Boolean)

  return {
    ...normalizeGamevars(gamevars),
    log: [...normalizeGamevars(gamevars).log, ...nextEntries].slice(-LOG_LIMIT),
  }
}

export function getDisplayName(user) {
  return user?.user_metadata?.username
    || user?.user_metadata?.name
    || user?.email?.split('@')[0]
    || '玩家'
}

export function createPlayerState(user, stats = {}) {
  return {
    id: user.id,
    uid: user.id,
    name: getDisplayName(user),
    hp: stats.hp ?? 100,
    maxHp: stats.maxHp ?? stats.hp ?? 100,
    atk: stats.atk ?? 10,
    def: stats.def ?? 5,
    // ── BR 体力系统（移动经济·只由移动消耗；纯函数见 src/lib/stamina.js，数值见 STAMINA_CONFIG） ──
    // 新字段经 normalizeGamevars 对 players 的原样透传安全持久化；旧存档缺字段时 moveToRoom 内 ensureStaminaFields 兜底 backfill。
    stamina: STAMINA_CONFIG.MAX_STAMINA,      // 上次结算时刻的体力快照（开局满）
    maxStamina: STAMINA_CONFIG.MAX_STAMINA,   // 本局上限（恒 = MAX，留作未来职业 perk 扩展位）
    staminaAt: Date.now(),                    // stamina 快照对应的 wall-clock 毫秒；懒回复锚点
    lastMoveAt: null,                         // 上次成功移动的毫秒时间戳；惩罚倍率 dt 锚点；首移为 null ⇒ 1×
    map: 0,                  // 旧字段：保留向后兼容；Phase 19 改用 chamberIndex；BR 下镜像当前房 templateId
    chamberIndex: 0,         // Phase 19.4: 玩家在 gamevars.raidPath 中的位置（0 = 入口）
    chamberHistory: [],      // Phase 19.4: 已走过的 chamber idx 列表
    // ── Phase 31 re-home: BR「100 房网格」位置（旧 chamber 模式恒 null → 走旧分支） ──
    roomId: stats.roomId ?? null,   // BR 当前房（br.enabled 下由 joinRoom 置 startRoomId）
    depth: 0,                       // 跃迁深度（单向阶梯·只增）；effectivePhase(realPhase, depth, maxPhase) 据此让跃迁者读更深的禁区图/物资档
    lastJumpAt: null,               // 上次成功跃迁的 wall-clock 毫秒；JUMP_CONFIG.COOLDOWN_SEC 冷却 dt 锚点；首跃为 null ⇒ 无冷却。
                                    //   新字段经 normalizeGamevars 对 players 原样透传安全持久化（同 stamina 范式）；旧存档缺字段时 brJump 内 Number.isFinite 兜底为 null。
    inventory: [],
    alive: true,
    kills: 0,
    buffs: stats.buffs || [],
    passiveCooldowns: {},
    battle: null,            // 旧字段：保留向后兼容；Phase 16 不再使用
    encounter: null,         // Phase 16: { instanceId } 引用 gamevars.npcInstances
    probeEncounter: null,    // Phase 21: { probeId, ownerId, hp, maxHp, atk, def, equipmentSnapshot, fragmentCount } 跨 raid 探针遭遇
    decodedFragmentIds: [],  // Phase 24a: 本玩家 decode_level=3 的 fragment_id 列表（lore 可见性过滤用）
    // Phase 24c: 职业系统
    classId: null,
    className: null,
    classRarity: null,        // 'normal' | 'legendary'
    classPerks: {},           // { search_bonus, pollution_resist, ... } 白名单 perk
    // Phase 27: 角色立绘 URL（来源 profiles.selected_portrait_id JOIN portraits.image_url）
    portraitUrl: null,
    lastPvpHit: null,        // Phase 16: { seq, fromName, damage, countered, counterDmg, at } 给被攻击方 toast
    lootPrompt: null,
    // ── 远星函馆：污染 + Ω + 结局判定字段 ──
    personalPollution:  0,
    omegaCountdown:     null,
    omegaVisits:        0,
    entityInteractions: 0,
    entityKills:        0,
    omegaMaterials:     0,
    extractedItems:     [],
    loadout: {
      probe:  null,
      shield: null,
      weapon: null,
      comm:   null,
    },
  }
}

export function createCorpse(payload = {}) {
  return normalizeCorpse({
    ...payload,
    id: payload.id || makeId('corpse'),
    createdAt: payload.createdAt || new Date().toISOString(),
  })
}

export function setPlayerLootPrompt(gamevars, playerId, prompt) {
  const normalized = normalizeGamevars(gamevars)
  const player = normalized.players?.[playerId]
  if (!player) return normalized

  return {
    ...normalized,
    players: {
      ...normalized.players,
      [playerId]: {
        ...player,
        lootPrompt: normalizeLootPrompt(prompt),
      },
    },
  }
}

export function clearPlayerLootPrompt(gamevars, playerId) {
  return setPlayerLootPrompt(gamevars, playerId, null)
}

export function computeRoomStats(gamevars) {
  const normalized = normalizeGamevars(gamevars)
  const players = Object.values(normalized.players)
  // 撤离的玩家不再算作"在 raid 中的活着的人"，但仍计入总参与人数
  const stillInRaid = players.filter(player => !player?.extracted)
  const alivePlayers = stillInRaid.filter(player => player?.alive)

  return {
    validnum: players.length,
    alivenum: alivePlayers.length,
    deathnum: Math.max(0, stillInRaid.length - alivePlayers.length),
    extractedCount: players.length - stillInRaid.length,
    alivePlayers,
  }
}

export function applyRoomLifecycle(room, gamevars, options = {}) {
  const normalized = normalizeGamevars(gamevars)
  const { validnum, alivenum, deathnum, alivePlayers } = computeRoomStats(normalized)
  const gametype = room?.gametype ?? 0

  let gamestate = room?.gamestate ?? 0
  let winner = room?.winner ?? null
  let startedAt = room?.started_at ?? null

  if (options.startGame && validnum > 0 && gamestate === 0) {
    gamestate = 1
    startedAt = startedAt || new Date().toISOString()
  }

  // ── 触发结局优先 ──（分支引擎写入 endingResult 时直接结束）
  if (gamestate === 1 && normalized.endingResult) {
    gamestate = 2
    winner = `结局：${normalized.endingResult.name}`
  }

  // ── 多人模式结束：最后一人存活 ──
  if (gamestate === 1 && validnum > 1 && alivenum <= 1) {
    gamestate = 2
    winner = alivePlayers[0]?.name || winner || null
  }

  // ── 单人 / PVE 模式结束条件 ──
  if (gamestate === 1 && validnum === 1) {
    // 玩家死亡 → 游戏失败
    if (alivenum === 0) {
      gamestate = 2
      winner = null // 无胜者
    }
    // 击败了 BOSS → 游戏胜利
    if (normalized.bossDefeated) {
      gamestate = 2
      winner = alivePlayers[0]?.name || null
    }
  }

  return {
    gamevars: normalized,
    roomPatch: {
      validnum,
      alivenum,
      deathnum,
      gamestate,
      winner,
      started_at: startedAt,
    },
  }
}
