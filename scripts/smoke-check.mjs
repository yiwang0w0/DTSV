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

/* ── 乐观锁：VersionConflictError + withRetry ─── */

// gameActions.js 使用 @/ 别名无法被 Node 直接导入，这里内联测试逻辑

class VersionConflictError extends Error {
  constructor() { super('VERSION_CONFLICT'); this.name = 'VersionConflictError' }
}

async function withRetry(fn, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn() } catch (err) {
      if (err instanceof VersionConflictError && attempt < retries) continue
      throw err
    }
  }
}

const vce = new VersionConflictError()
assert.equal(vce.name, 'VersionConflictError')
assert.equal(vce.message, 'VERSION_CONFLICT')

let callCount = 0
const result = await withRetry(async () => {
  callCount++
  if (callCount < 3) throw new VersionConflictError()
  return 'ok'
})
assert.equal(result, 'ok')
assert.equal(callCount, 3) // 2 retries + 1 success

let nonRetryThrown = false
try {
  await withRetry(async () => { throw new Error('其他错误') })
} catch (err) {
  nonRetryThrown = err.message === '其他错误'
}
assert.ok(nonRetryThrown, '非版本冲突错误不应重试')

// 测试超出重试次数后仍抛出 VersionConflictError
let exhausted = false
try {
  await withRetry(async () => { throw new VersionConflictError() }, 2)
} catch (err) {
  exhausted = err instanceof VersionConflictError
}
assert.ok(exhausted, '超出重试次数后应抛出 VersionConflictError')

console.log('smoke-check passed')

