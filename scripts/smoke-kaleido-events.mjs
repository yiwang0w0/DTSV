// KALEIDO 传感层离线 smoke：验 buildActionEvent / buildDeathEvent / emitPlayerEvents 消毒逻辑（无 DB）。
// 跑：node scripts/smoke-kaleido-events.mjs
import { ACTION_VERB, TURN_ACTIONS, kaleidoLevelSeq, emitPlayerEvents, buildActionEvent, buildDeathEvent } from '../src/lib/server/kaleido/events.js'

let pass = 0, fail = 0
function ok(cond, msg) { if (cond) { pass++ } else { fail++; console.error('  ✗', msg) } }

// ── 动词映射（KP0-R S3 后形态）──
ok(ACTION_VERB.search === 'search', 'search→search')
ok(ACTION_VERB.attackNpc === 'attack', 'attackNpc→attack')
ok(ACTION_VERB.craftItem === undefined, 'craftItem 不在边界映射（in-handler 发 craft_attempt）')
ok(ACTION_VERB.useItem === 'item_use', 'useItem→item_use')
ok(ACTION_VERB.advanceChamber === 'move', 'advanceChamber→move')
ok(ACTION_VERB.emergencyRetreat === 'flee', 'emergencyRetreat→flee')
ok(ACTION_VERB.releaseEncounter === 'npc_spare', 'releaseEncounter→npc_spare')
// ── 消耗性动词（与发射映射解耦）──
ok(JSON.stringify(TURN_ACTIONS) === JSON.stringify(['search','attackNpc','craftItem','useItem','move','advanceChamber']),
  'TURN_ACTIONS = 02 §2.2 六动词（craftItem 计回合；flee/spare 不计）')

// ── kaleidoLevelSeq：物理关口径（缺陷B）──
ok(kaleidoLevelSeq({ chamberIndex: 0 }) === 1, 'chamberIndex 0 → 物理关 1')
ok(kaleidoLevelSeq({ chamberIndex: 4 }) === 5, 'chamberIndex 4 → 物理关 5')
ok(kaleidoLevelSeq({}) === null && kaleidoLevelSeq(null) === null, '无 chamberIndex → null')

// ── buildActionEvent（吃 gamevars，路由边界调用；level_seq 取物理关 chamberIndex+1，非 currentSeq）──
const gamevars = {
  // 关键回归（缺陷B）：clearedSeq=1/currentSeq=2 但物理仍在第 1 关（chamberIndex=0）→ 事件应标 1
  kaleido: { runId: 'run-abc', currentSeq: 2, clearedSeq: 1 },
  players: { 'u1': { chamberIndex: 0, turnCount: 7, hp: 42, alive: true } },
}
const e1 = buildActionEvent('u1', gamevars, 'search')
ok(e1 && e1.verb === 'search', 'buildActionEvent verb')
ok(e1.run_id === 'run-abc', 'buildActionEvent run_id 从 gamevars.kaleido')
ok(e1.level_seq === 1, '清关后滞留原关：level_seq=物理关 1（非 currentSeq 2·缺陷B 回归）')
ok(e1.payload.turnCount === 7 && e1.payload.hp === 42, 'buildActionEvent payload 摘要')
ok(e1.payload.action === 'search', 'payload.action 携带原始动作名（S3 消歧）')
ok(buildActionEvent('u1', gamevars, 'emergencyRetreat')?.verb === 'flee', 'flee 事件可构造')
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
