// KALEIDO 传感层离线 smoke：验 buildActionEvent / buildDeathEvent / emitPlayerEvents 消毒逻辑（无 DB）。
// 跑：node scripts/smoke-kaleido-events.mjs
import { ACTION_VERB, emitPlayerEvents, buildActionEvent, buildDeathEvent } from '../src/lib/server/kaleido/events.js'

let pass = 0, fail = 0
function ok(cond, msg) { if (cond) { pass++ } else { fail++; console.error('  ✗', msg) } }

// ── 动词映射 ──
ok(ACTION_VERB.search === 'search', 'search→search')
ok(ACTION_VERB.attackNpc === 'attack', 'attackNpc→attack')
ok(ACTION_VERB.craftItem === 'craft_attempt', 'craftItem→craft_attempt')
ok(ACTION_VERB.useItem === 'item_use', 'useItem→item_use')
ok(ACTION_VERB.advanceChamber === 'move', 'advanceChamber→move')

// ── buildActionEvent（吃 gamevars，路由边界调用）──
const gamevars = {
  kaleido: { runId: 'run-abc', currentSeq: 3 },
  players: { 'u1': { turnCount: 7, hp: 42, alive: true } },
}
const e1 = buildActionEvent('u1', gamevars, 'search')
ok(e1 && e1.verb === 'search', 'buildActionEvent verb')
ok(e1.run_id === 'run-abc' && e1.level_seq === 3, 'buildActionEvent run 关联从 gamevars.kaleido')
ok(e1.payload.turnCount === 7 && e1.payload.hp === 42, 'buildActionEvent payload 摘要')
ok(buildActionEvent('u1', gamevars, 'joinRoom') === null, '未映射动作→null（不发）')
ok(buildActionEvent(null, gamevars, 'search') === null, '无 userId→null')
const e2 = buildActionEvent('u1', {}, 'attackNpc')
ok(e2.run_id === null && e2.level_seq === null, '无 kaleido 块→run 关联空（大厅侧可空）')

// ── buildDeathEvent ──
const d1 = buildDeathEvent('u1', { runId: 'run-abc', levelSeq: 3, reason: 'npc_counter' })
ok(d1.verb === 'death' && d1.payload.reason === 'npc_counter', 'buildDeathEvent')
ok(buildDeathEvent(null) === null, 'buildDeathEvent 无 userId→null')

// ── emitPlayerEvents 消毒（mock client 捕获 insert） ──
let captured = null
const mockClient = { from: () => ({ insert: (rows) => { captured = rows; return Promise.resolve({ error: null }) } }) }

// 大 payload：对象/数组值剔除、键上限 24、字符串截断 200、verb 截断 40
const bigPayload = { keep: 5, flag: true, nul: null, obj: { x: 1 }, arr: [1], str: 'x'.repeat(500) }
for (let i = 0; i < 40; i++) bigPayload['k' + i] = i
await emitPlayerEvents(mockClient, [
  { player_id: 'u1', run_id: 'r', level_seq: 2, verb: 'v'.repeat(100), payload: bigPayload },
  { player_id: '', verb: 'search' },          // 无 player_id → 过滤
  { player_id: 'u2', verb: '' },              // 无 verb → 过滤
  null,                                        // null → 过滤
])
ok(Array.isArray(captured) && captured.length === 1, '无效行被过滤，仅 1 行入库')
const row = captured[0]
ok(row.verb.length === 40, 'verb 截断到 40')
ok(!('obj' in row.payload) && !('arr' in row.payload), 'payload 剔除对象/数组值')
ok(row.payload.keep === 5 && row.payload.flag === true && row.payload.nul === null, 'payload 保留标量')
ok(row.payload.str.length === 200, 'payload 字符串截断 200')
ok(Object.keys(row.payload).length <= 24, 'payload 键 ≤ 24')

// 空/非数组 → 不触库
captured = null
await emitPlayerEvents(mockClient, [])
await emitPlayerEvents(mockClient, null)
ok(captured === null, '空/非数组 rows → 不 insert')

// insert 报错吞掉不抛
let threw = false
const errClient = { from: () => ({ insert: () => Promise.resolve({ error: { message: 'boom' } }) }) }
try { await emitPlayerEvents(errClient, [{ player_id: 'u1', verb: 'search' }]) } catch { threw = true }
ok(!threw, 'insert 报错 fire-and-forget 吞错不抛')

console.log(`smoke-kaleido-events: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
