import assert from 'node:assert/strict'
import {
  applyRoomLifecycle,
  appendGameLog,
  createLogEntry,
  createPlayerState,
} from '../src/lib/roomState.js'

const fakeUserA = {
  id: 'user-a',
  email: 'alpha@example.com',
  user_metadata: { username: 'Alpha' },
}

const fakeUserB = {
  id: 'user-b',
  email: 'beta@example.com',
  user_metadata: { username: 'Beta' },
}

const baseRoom = { gamestate: 0, winner: null, started_at: null }
const alpha = createPlayerState(fakeUserA, { hp: 120, maxHp: 120, atk: 14, def: 7 })
const beta = createPlayerState(fakeUserB, { hp: 100, maxHp: 100, atk: 10, def: 5 })

let gamevars = { players: { [alpha.id]: alpha }, log: [] }
let lifecycle = applyRoomLifecycle(baseRoom, gamevars, { startGame: true })
assert.equal(lifecycle.roomPatch.gamestate, 1)
assert.equal(lifecycle.roomPatch.validnum, 1)
assert.equal(lifecycle.roomPatch.winner, null)

gamevars = {
  players: {
    [alpha.id]: alpha,
    [beta.id]: { ...beta, alive: false },
  },
  log: [],
}
lifecycle = applyRoomLifecycle({ ...baseRoom, gamestate: 1 }, gamevars, { startGame: true })
assert.equal(lifecycle.roomPatch.gamestate, 2)
assert.equal(lifecycle.roomPatch.alivenum, 1)
assert.equal(lifecycle.roomPatch.deathnum, 1)
assert.equal(lifecycle.roomPatch.winner, 'Alpha')

const logged = appendGameLog({ players: {}, log: [] }, createLogEntry('Alpha 获胜', 'kill'))
assert.equal(logged.log.length, 1)
assert.equal(logged.log[0].text, 'Alpha 获胜')

console.log('smoke-check passed')

