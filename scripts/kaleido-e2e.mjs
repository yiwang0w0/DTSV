// ─────────────────────────────────────────────────────────────────
// KALEIDO 状态机 E2E 回归（service-role 直驱真库·P0 闸门验收转正 · 2026-07-07）
// 复刻路由边界：executeGameAction → (kaleido) advanceKaleidoProgress → buildActionEvent → emit
// 覆盖:① 门禁负测试(未过关 move 必拒) ② 幂等(二次 start 同 id) ③ 通关 run 全链
//      ④ 死亡收敛(runs→dead·death 事件恰一次) ⑤ 断言前置(清理前查库) ⑥ 自清理
// 语义注记:入关 turnCount 重置后,进关的 move 本身计为新关第 1 回合(02 §2.2 move=消耗动词)。
// LW-1(97f3e32)后:seq5=boss_kill —— 入关自动遭遇 boss,attackNpc 磨死(公共击杀链置 bossDefeated)过关。
// 前置:仓库根 .env.local 含 NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY(vercel env pull 可得)。
// 跑:仓库根建临时 tsconfig(paths @/*→src/*) · npx tsx scripts/kaleido-e2e.mjs · 每次改 kaleido 状态机后必跑
// ─────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { startKaleidoRun, executeGameAction, advanceKaleidoProgress } from '../src/lib/server/gameActions.js'
import { buildActionEvent, emitPlayerEvents } from '../src/lib/server/kaleido/events.js'
import { isKaleidoRoom } from '../src/lib/roomState.js'

function loadEnv() {
  for (const p of ['.env.local', 'D:/Fragments/DTSV/.env.local']) {
    try {
      const env = {}
      for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
      return env
    } catch {}
  }
  return {}
}
const env = loadEnv()
const URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('缺凭证'); process.exit(2) }
const sb = createClient(URL, KEY, { auth: { persistSession: false } })

const mkUser = (tag) => ({ id: randomUUID(), email: `kaleido-e2e-${tag}@test.local`, user_metadata: { display_name: `E2E-${tag}` } })
const getRoom = async (id) => (await sb.from('rooms').select('*').eq('id', id).single()).data

async function act(user, roomId, action, extra = {}) {
  let room = await executeGameAction(sb, user, { roomId, action, ...extra }, {})
  if (isKaleidoRoom(room)) {
    room = await advanceKaleidoProgress(sb, room, user, action)
    const ev = buildActionEvent(user.id, room?.gamevars, action)
    if (ev) await emitPlayerEvents(sb, [ev])
  }
  return room
}
const clearedSeq = (r) => (r?.gamevars?.kaleido?.clearedSeq) ?? 0
const curSeq = (r) => (r?.gamevars?.kaleido?.currentSeq) ?? 1
const turnsOf = (r, uid) => r?.gamevars?.players?.[uid]?.turnCount

const A = [] // 断言集 {name, pass, detail}
const ck = (name, pass, detail = '') => A.push({ name, pass: !!pass, detail: String(detail).slice(0, 220) })
const out = { ids: { users: [], runs: [], rooms: [] } }

// ═══ ① 通关 run(含门禁负测试/幂等/回合语义) ═══
try {
  const u = mkUser('clear'); out.ids.users.push(u.id)
  const { roomId, runId } = await startKaleidoRun(sb, u)
  out.ids.rooms.push(roomId); out.ids.runs.push(runId)

  // 幂等:二次 start 返回同一 run/room
  const again = await startKaleidoRun(sb, u)
  ck('幂等:二次 start 同 id', again.roomId === roomId && again.runId === runId, JSON.stringify(again))

  // 门禁负测试:未过关 move 必拒
  let gateMsg = ''
  try { await act(u, roomId, 'move') } catch (e) { gateMsg = e.message }
  ck('门禁:未过关 move 被拒(本关目标未达成)', gateMsg.includes('目标未达成'), gateMsg)

  let room = await getRoom(roomId)
  const perLevel = []
  for (let seq = 1; seq <= 5; seq++) {
    let searches = 0, attacks = 0, trace = []
    if (seq < 5) {
      while (clearedSeq(room) < seq && searches < 25) {
        room = await act(u, roomId, 'search'); searches++
        if (seq === 1) trace.push(turnsOf(room, u.id))
      }
    } else {
      // LW-1:seq5 boss_kill —— 入关已自动遭遇 boss,attackNpc 磨死;玩家阵亡则跳出(断言兜底)。
      // E2E 隔离原则:本脚本测状态机不测平衡 —— boss 战前 service 注入高属性保证确定性可赢
      //   (裸默认属性 vs seq5 boss 的可玩性归 P1 闸门人测;实测数据:默认属性 8 交换玩家死·boss 存活)。
      {
        const { data: r5 } = await sb.from('rooms').select('gamevars').eq('id', roomId).single()
        const p5 = r5.gamevars.players[u.id]
        p5.atk = 500; p5.hp = 8000; p5.maxHp = 8000
        await sb.from('rooms').update({ gamevars: r5.gamevars }).eq('id', roomId)
      }
      while (clearedSeq(room) < seq && attacks < 30) {
        room = await act(u, roomId, 'attackNpc'); attacks++
        if (room?.gamevars?.players?.[u.id]?.alive === false) break
      }
    }
    perLevel.push({ seq, searches, attacks, clearedSeq: clearedSeq(room), curSeq: curSeq(room), turnsAfterClear: turnsOf(room, u.id), trace: seq === 1 ? trace : undefined })
    if (clearedSeq(room) < seq) break
    if (seq < 5) {
      room = await act(u, roomId, 'move')
      ck(`入关重置:进第${seq + 1}关 move 后 turnCount=1(重置+进关计1)`, turnsOf(room, u.id) === 1, `got ${turnsOf(room, u.id)}`)
    }
  }
  out.perLevel = perLevel
  ck('通关:clearedSeq 达 5', clearedSeq(room) === 5)
  ck('通关:seq1-4 search 次数符合 survive_turns(首关 2+seq·后续 1+seq,进关 move 占 1 回合)', perLevel.filter((l) => l.seq < 5).every((l) => l.searches === (l.seq === 1 ? 2 + l.seq : 1 + l.seq)), JSON.stringify(perLevel.map((l) => l.searches)))
  ck('回合语义:seq1-4 过关不清零(留本关计数)', perLevel.filter((l) => l.seq < 5).every((l) => l.turnsAfterClear === 2 + l.seq), JSON.stringify(perLevel.map((l) => l.turnsAfterClear)))
  ck('LW-1:seq5 attackNpc 磨死 boss 过关且存活', (perLevel[4]?.attacks ?? 0) >= 1 && clearedSeq(room) === 5 && room?.gamevars?.players?.[u.id]?.alive === true, JSON.stringify(perLevel[4]))
  ck('LW-1:bossDefeated=true(boss_kill 判定源)', room?.gamevars?.bossDefeated === true, String(room?.gamevars?.bossDefeated))
  const rr = await getRoom(roomId)
  ck('通关:房间收房 gamestate=2', rr?.gamestate === 2, rr?.gamestate)
  ck('通关:endingResult=kaleido_clear', rr?.gamevars?.endingResult?.key === 'kaleido_clear', rr?.gamevars?.endingResult?.key)

  // 域真源断言(清理前)
  const { data: runRow } = await sb.from('runs').select('status,current_seq,converged_at').eq('run_id', runId).single()
  ck('runs:status=cleared+converged_at 非空', runRow?.status === 'cleared' && !!runRow?.converged_at, JSON.stringify(runRow))
  const { data: lv } = await sb.from('levels').select('seq,status').eq('run_id', runId).order('seq')
  ck('levels:5 行全 played 无 ready 空洞', lv?.length === 5 && lv.every((x) => x.status === 'played'), JSON.stringify(lv))
  const { data: evs } = await sb.from('player_events').select('verb,level_seq').eq('player_id', u.id)
  const hist = {}
  for (const e of evs || []) { hist[e.verb] = (hist[e.verb] || 0) + 1 }
  out.clearHist = hist
  const searchesDriven = perLevel.reduce((n, l) => n + l.searches, 0)
  ck('events:search 事件与驱动侧逐条对账', (hist.search || 0) === searchesDriven, JSON.stringify({ hist, searchesDriven }))
  const attacksDriven = perLevel.reduce((n, l) => n + (l.attacks || 0), 0)
  ck('events:attack 事件与驱动侧逐条对账(LW-1)', (hist.attack || 0) === attacksDriven, JSON.stringify({ hist, attacksDriven }))
  ck('events:level_clear 恰 5 条', hist.level_clear === 5, hist.level_clear)
  const lcSeqs = (evs || []).filter((e) => e.verb === 'level_clear').map((e) => e.level_seq).sort()
  ck('events:level_clear 的 level_seq=1..5(口径正确)', JSON.stringify(lcSeqs) === JSON.stringify([1, 2, 3, 4, 5]), JSON.stringify(lcSeqs))
} catch (e) { ck('通关 run 执行', false, e.stack?.split('\n')[0] + ' | ' + e.message) }

// ═══ ② 死亡收敛 run ═══
try {
  const u = mkUser('death'); out.ids.users.push(u.id)
  const { roomId, runId } = await startKaleidoRun(sb, u)
  out.ids.rooms.push(roomId); out.ids.runs.push(runId)
  await act(u, roomId, 'search')
  let r = await getRoom(roomId)
  r.gamevars.players[u.id].alive = false
  r.gamevars.players[u.id].hp = 0
  await sb.from('rooms').update({ gamevars: r.gamevars }).eq('id', roomId)
  r = await getRoom(roomId); await advanceKaleidoProgress(sb, r, u, 'search') // 首次:应收敛+发 death
  r = await getRoom(roomId); await advanceKaleidoProgress(sb, r, u, 'search') // 二次:不应重复发
  const { data: runRow } = await sb.from('runs').select('status,converged_at').eq('run_id', runId).single()
  ck('死亡:runs.status=dead+converged_at 非空', runRow?.status === 'dead' && !!runRow?.converged_at, JSON.stringify(runRow))
  const { data: dEvs } = await sb.from('player_events').select('verb,payload').eq('player_id', u.id).eq('verb', 'death')
  ck('死亡:death 事件恰 1 条(重复动作不再发)', dEvs?.length === 1, `count=${dEvs?.length}`)
  ck('死亡:death 带 reason 字段', dEvs?.[0]?.payload?.reason != null, JSON.stringify(dEvs?.[0]?.payload))
  const { data: lv2 } = await sb.from('levels').select('seq').eq('run_id', runId)
  ck('死亡:R9 levels 内容不减损(5 行仍在)', lv2?.length === 5, lv2?.length)
} catch (e) { ck('死亡 run 执行', false, e.message) }

// ═══ 汇总 + 自清理 ═══
const passN = A.filter((a) => a.pass).length
console.log('E2E_ASSERTIONS=' + JSON.stringify(A, null, 1))
console.log('E2E_PERLEVEL=' + JSON.stringify(out.perLevel))
console.log(`E2E_SUMMARY= ${passN}/${A.length} passed`)
try {
  if (out.ids.users.length) await sb.from('player_events').delete().in('player_id', out.ids.users)
  if (out.ids.runs.length) await sb.from('levels').delete().in('run_id', out.ids.runs)
  if (out.ids.runs.length) await sb.from('runs').delete().in('run_id', out.ids.runs)
  if (out.ids.rooms.length) await sb.from('rooms').delete().in('id', out.ids.rooms)
  console.log('CLEANUP_OK ' + JSON.stringify(out.ids))
} catch (e) { console.error('CLEANUP_FAIL', e.message, JSON.stringify(out.ids)) }
process.exit(passN === A.length ? 0 : 1)
