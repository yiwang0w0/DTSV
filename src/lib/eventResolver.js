import { tickPassiveCooldowns } from './equipmentEngine'
import { processBuffs } from './gameEngine'
import { createLogEntry, normalizeGamevars } from './roomState'

function classifyTurnLog(text = '') {
  return text.includes('损失') ? 'damage' : 'buff'
}

export function createActionResolution({ room = null, actorId = null, gamevars, sourceGamevars = gamevars } = {}) {
  return {
    room,
    actorId,
    sourceGamevars: normalizeGamevars(sourceGamevars),
    gamevars: normalizeGamevars(gamevars),
    logs: [],
  }
}

export function getResolutionPlayer(resolution, playerId = resolution.actorId) {
  return resolution.gamevars.players?.[playerId] || null
}

export function setResolutionPlayer(resolution, playerId, player) {
  resolution.gamevars = {
    ...resolution.gamevars,
    players: {
      ...resolution.gamevars.players,
      [playerId]: player,
    },
  }
  return resolution
}

export function updateResolutionPlayer(resolution, playerId, updater) {
  const current = getResolutionPlayer(resolution, playerId)
  const next = updater(current)
  if (next) {
    setResolutionPlayer(resolution, playerId, next)
  }
  return next
}

export function appendResolutionLog(resolution, entry, type = 'system') {
  if (!entry) return resolution
  resolution.logs.push(typeof entry === 'string' ? createLogEntry(entry, type) : entry)
  return resolution
}

export function appendResolutionLogs(resolution, entries, typeOrFactory = 'system') {
  for (const entry of Array.isArray(entries) ? entries : [entries]) {
    if (!entry) continue

    if (typeof entry === 'string') {
      const nextType = typeof typeOrFactory === 'function' ? typeOrFactory(entry) : typeOrFactory
      resolution.logs.push(createLogEntry(entry, nextType || 'system'))
      continue
    }

    resolution.logs.push(entry)
  }

  return resolution
}

export function finalizeResolution(resolution) {
  return {
    gamevars: normalizeGamevars(resolution.gamevars),
    logs: resolution.logs || [],
  }
}

export async function runTurnStartSettlement(resolution, buffPool) {
  const nextPlayers = { ...resolution.gamevars.players }
  const turnLogs = []

  for (const [playerId, player] of Object.entries(nextPlayers)) {
    if (!player?.alive) continue

    const { updatedPlayer, logEntries } = processBuffs(player, buffPool || [])
    turnLogs.push(...logEntries)
    nextPlayers[playerId] = {
      ...tickPassiveCooldowns(updatedPlayer),
      battle: updatedPlayer.alive ? updatedPlayer.battle || player.battle || null : null,
    }
  }

  resolution.gamevars = {
    ...resolution.gamevars,
    players: nextPlayers,
  }
  appendResolutionLogs(resolution, turnLogs, classifyTurnLog)
  return resolution
}

export function listNewDeaths(sourceGamevars, nextGamevars) {
  const source = normalizeGamevars(sourceGamevars)
  const next = normalizeGamevars(nextGamevars)
  const deaths = []

  for (const [playerId, player] of Object.entries(next.players || {})) {
    const wasAlive = source.players?.[playerId]?.alive !== false
    if (wasAlive && player?.alive === false) {
      deaths.push({ playerId, player })
    }
  }

  return deaths
}

export async function settleNewDeaths(resolution, onDeath) {
  const deaths = listNewDeaths(resolution.sourceGamevars, resolution.gamevars)

  for (const death of deaths) {
    await onDeath?.(death, resolution)
  }

  resolution.sourceGamevars = normalizeGamevars(resolution.gamevars)
  return deaths
}
