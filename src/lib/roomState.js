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
  }
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
    map: 0,
    inventory: [],
    alive: true,
    kills: 0,
    buffs: stats.buffs || [],
    passiveCooldowns: {},
    battle: null,
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
