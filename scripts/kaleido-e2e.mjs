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
import { startKaleidoRun, executeGameAction, advanceKaleidoProgress, applyKaleidoPostAction } from '../src/lib/server/gameActions.js'
import { isKaleidoRoom } from '../src/lib/roomState.js'
import { mergeGameRules } from '../src/lib/server/kaleido/rules.js'

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
  // 复刻路由边界:动作前快照(before) → executeGameAction → applyKaleidoPostAction(推进+事件+ui_unlocks)。
  //   route.js 从预取 roomData 取 before;E2E 动作前 fetch 取 before(单线程,fetch 与 exec 间无并发变更)。
  const { data: pre } = await sb.from('rooms').select('gamevars, gamestate').eq('id', roomId).single()
  const beforeMe = pre?.gamevars?.players?.[user.id] || null
  const beforeClearedSeq = pre?.gamevars?.kaleido?.clearedSeq ?? 0
  const beforeGamestate = pre?.gamestate // B4 convergence_preview：收敛动作本身须放行(守卫用动作前 gamestate)
  let room = await executeGameAction(sb, user, { roomId, action, ...extra }, {})
  if (isKaleidoRoom(room)) {
    const res = await applyKaleidoPostAction(sb, room, user, action, { beforeMe, beforeClearedSeq, beforeGamestate })
    room = res.room
    room.__unlockEvents = res.unlockEvents // 内存挂载·供断言(非持久)
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

  // ═══ ui_unlocks 断言(06 契约 · KP1-E step 0 · 解锁序 + 硬时序法则)═══
  const { data: allEv } = await sb.from('player_events').select('id,verb,level_seq,payload').eq('player_id', u.id).order('id')
  const unlockRows = (allEv || []).filter((e) => e.verb === 'ui_unlock')
  const unlockedKeys = unlockRows.map((e) => e.payload?.ui_key)
  out.unlockSeq = unlockedKeys
  ck('ui_unlock:首搜解锁 hp_bar + log_panel', unlockedKeys.includes('hp_bar') && unlockedKeys.includes('log_panel'), JSON.stringify(unlockedKeys))
  ck('ui_unlock:hp_bar 在 level_seq=1 解锁(run 开局·首个消耗动作)', unlockRows.some((e) => e.payload?.ui_key === 'hp_bar' && e.level_seq === 1), JSON.stringify(unlockRows.filter((e) => e.payload?.ui_key === 'hp_bar')))
  // 硬时序法则:hp_bar 的 ui_unlock 严格先于首个 attack 事件(先于首害)。id 单调=插入序。
  const hpBarIds = unlockRows.filter((e) => e.payload?.ui_key === 'hp_bar').map((e) => e.id)
  const firstHpBarId = hpBarIds.length ? Math.min(...hpBarIds) : Infinity
  const attackIds = (allEv || []).filter((e) => e.verb === 'attack').map((e) => e.id)
  const firstAttackId = attackIds.length ? Math.min(...attackIds) : Infinity
  ck('时序法则:hp_bar 解锁严格先于首次 attack(先于首害)', Number.isFinite(firstHpBarId) && firstHpBarId < firstAttackId, JSON.stringify({ firstHpBarId, firstAttackId }))
  ck('ui_unlock:首次过关解锁 move_btn', unlockedKeys.includes('move_btn'), JSON.stringify(unlockedKeys))
  ck('ui_unlock:每 ui_key 至多一次(账号集幂等·单调)', unlockedKeys.length === new Set(unlockedKeys).size, JSON.stringify(unlockedKeys))
  ck('ui_unlock:payload 携 timing(hp_bar=before)', unlockRows.find((e) => e.payload?.ui_key === 'hp_bar')?.payload?.timing === 'before', JSON.stringify(unlockRows.find((e) => e.payload?.ui_key === 'hp_bar')?.payload))
  // 运行时镜像:最终房 player.uiUnlocks 含已解锁键(随 room 下发)
  const finalMe = rr?.gamevars?.players?.[u.id]
  ck('镜像:players[uid].uiUnlocks 含 hp_bar/log_panel/move_btn 且含种子 search_btn', Array.isArray(finalMe?.uiUnlocks) && ['search_btn', 'hp_bar', 'log_panel', 'move_btn'].every((k) => finalMe.uiUnlocks.includes(k)), JSON.stringify(finalMe?.uiUnlocks))
  // ── B4 后段披露(doc 10 §4)：prep_readout 于入 boss 关 / convergence_preview 于收束前 ──
  ck('B4:prep_readout 入 boss 关解锁(entering_boss_level·before)', unlockedKeys.includes('prep_readout'), JSON.stringify(unlockRows.filter((e) => e.payload?.ui_key === 'prep_readout').map((e) => `seq${e.level_seq}`)))
  ck('B4:convergence_preview 收束前解锁(clearedSeq 达末关)', unlockedKeys.includes('convergence_preview'), JSON.stringify(unlockRows.filter((e) => e.payload?.ui_key === 'convergence_preview').map((e) => `seq${e.level_seq}`)))
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

// ═══ ③ hook① 种子关内容注入(临时点亮 d6-seq1/2·10-avg A1·口径经 🧭 批)═══
//   测试内 UPDATE enabled=true → 断言 guaranteed 掉落 + seq1 零战斗 + consumedEventDeck → finally 恢复 false。
let seed12 = []
let seedOrig = {}
try {
  const { data: seedRows } = await sb.from('content_pool').select('id, enabled, provenance').eq('entity_type', 'level')
  const seedAll = (seedRows || []).filter((r) => r.provenance?.source === 'seed' && [1, 2].includes(Number(r.provenance?.seq_hint)))
  seed12 = seedAll.map((r) => r.id)
  seedOrig = Object.fromEntries(seedAll.map((r) => [r.id, r.enabled])) // 捕获原 enabled → finally 还原(勿 clobber 🧭 永久启用态)
  ck('hook①:d6 seq1-2 种子关存在', seed12.length === 2, JSON.stringify(seed12))
  if (seed12.length === 2) {
    await sb.from('content_pool').update({ enabled: true }).in('id', seed12)
    console.log('SEED_TOGGLE_ON ' + JSON.stringify(seed12))
    const u = mkUser('seed'); out.ids.users.push(u.id)
    const { roomId, runId } = await startKaleidoRun(sb, u)
    out.ids.rooms.push(roomId); out.ids.runs.push(runId)
    let room = await getRoom(roomId)
    const node0 = room?.gamevars?.raidPath?.[0]
    ck('hook①:seq1 命中种子关(seedLevelId 非空)', !!node0?.seedLevelId, JSON.stringify({ seedLevelId: node0?.seedLevelId, arch: node0?.archetype }))
    ck('hook①:seq1 无 combatSetup(零战斗底·省 combatSetup 键 null 安全)', !node0?.kaleidoEnemy, JSON.stringify(node0?.kaleidoEnemy))
    const invBefore = (room?.gamevars?.players?.[u.id]?.inventory || []).length
    let s = 0
    while (clearedSeq(room) < 1 && s < 10) { room = await act(u, roomId, 'search'); s++ }
    const meAfter = room?.gamevars?.players?.[u.id]
    const invAfter = (meAfter?.inventory || []).length
    out.seedInv = meAfter?.inventory
    ck('hook①:seq1 guaranteed 硬保证(背包增 ≥2 件·id27+id13)', invAfter - invBefore >= 2, JSON.stringify({ invBefore, invAfter, inv: meAfter?.inventory }))
    const { data: sEvs } = await sb.from('player_events').select('verb,level_seq').eq('player_id', u.id)
    const seq1Combat = (sEvs || []).filter((e) => e.level_seq === 1 && (e.verb === 'fight_start' || e.verb === 'attack')).length
    ck('hook①:seq1 零战斗(无 fight_start/attack @ seq1)', seq1Combat === 0, JSON.stringify((sEvs || []).filter((e) => e.level_seq === 1).map((e) => e.verb)))
    ck('hook①:consumedEventDeck[0] 记 seq1 消费 ≥2', Array.isArray(room?.gamevars?.kaleido?.consumedEventDeck?.[0]) && room.gamevars.kaleido.consumedEventDeck[0].length >= 2, JSON.stringify(room?.gamevars?.kaleido?.consumedEventDeck))
    // craft_btn：seq1 二搜出 id13(结构碎片·tech_fragment)→ hasCraftMat 置位 → craft_btn 解锁(AVG 链「搜→材料→合成」)
    const { data: uEvs } = await sb.from('player_events').select('verb, level_seq, payload').eq('player_id', u.id).eq('verb', 'ui_unlock')
    ck('hook①/craft:hasCraftMat 置位(搜到 tech_fragment 材料)', !!meAfter?.hasCraftMat, String(meAfter?.hasCraftMat))
    ck('hook①/craft:seq1 配方材料 → craft_btn 解锁', (uEvs || []).some((e) => e.payload?.ui_key === 'craft_btn' && e.level_seq === 1), JSON.stringify((uEvs || []).map((e) => `${e.payload?.ui_key}@${e.level_seq}`)))
  }
} catch (e) { ck('hook① 种子关执行', false, e.stack?.split('\n')[0] + ' | ' + e.message) }
finally {
  // 逐 id 还原到**原** enabled(勿 clobber 🧭 永久启用态：若原为 true 则还原 true·原 false 则 false)。
  for (const id of seed12) {
    try { await sb.from('content_pool').update({ enabled: !!seedOrig[id] }).eq('id', id) }
    catch (e) { console.error('SEED_RESTORE_FAIL', id, e.message) }
  }
  if (seed12.length) console.log('SEED_RESTORED ' + JSON.stringify(seedOrig))
}

// ═══ ④ LW-3 gauntlet 波次(seq2·07 双波·attack 打穿)═══
//   seq2 永久 enabled = 种子 gauntlet 关(waves=2)。清 seq1 → 进 seq2 → 注高属隔离 → 杀 wave-1 → 断言 wave-2 生成。
try {
  const u = mkUser('gauntlet'); out.ids.users.push(u.id)
  const { roomId, runId } = await startKaleidoRun(sb, u)
  out.ids.rooms.push(roomId); out.ids.runs.push(runId)
  let room = await getRoom(roomId)
  let s = 0
  while (clearedSeq(room) < 1 && s < 12) { room = await act(u, roomId, 'search'); s++ } // 清 seq1(survive_turns=3)
  room = await act(u, roomId, 'move') // 进 seq2
  const node1 = room?.gamevars?.raidPath?.[1]
  ck('LW-3:seq2=gauntlet·waves≥2', node1?.kaleidoMode?.template_ref === 'gauntlet' && (Number(node1?.kaleidoMode?.params?.waves) || 0) >= 2, JSON.stringify(node1?.kaleidoMode?.params))
  const me2 = room?.gamevars?.players?.[u.id]
  const wave1Id = me2?.encounter?.instanceId
  ck('LW-3:入 seq2 遭遇 wave-1 + gauntletWave=1', !!wave1Id && me2?.gauntletWave === 1, JSON.stringify({ enc: !!wave1Id, wave: me2?.gauntletWave }))
  // 注入高属性隔离波次机制(同 seq5 boss 口径)：wave-1 一击死 → 观察 wave-2 推进层生成
  { const { data: rG } = await sb.from('rooms').select('gamevars').eq('id', roomId).single()
    const p = rG.gamevars.players[u.id]; p.atk = 200; p.hp = 8000; p.maxHp = 8000
    await sb.from('rooms').update({ gamevars: rG.gamevars }).eq('id', roomId) }
  room = await act(u, roomId, 'attackNpc') // 杀 wave-1 → 推进层生成 wave-2
  const meW2 = room?.gamevars?.players?.[u.id]
  const w2Id = meW2?.encounter?.instanceId
  ck('LW-3:wave-1 死后生成 wave-2(gauntletWave=2·新实例·encounter 重锁)', meW2?.gauntletWave === 2 && !!w2Id && w2Id !== wave1Id, JSON.stringify({ wave: meW2?.gauntletWave, newInst: w2Id !== wave1Id }))
  const w2inst = (room?.gamevars?.npcInstances || []).find((i) => i.id === w2Id)
  ck('LW-3:wave-2 缩放(maxHp > wave-1 base 18·enemyScale)', (w2inst?.maxHp ?? 0) > 18, JSON.stringify({ w2maxHp: w2inst?.maxHp }))
  ck('LW-3:wave-1 实例已死(无活 wave-1)', !(room?.gamevars?.npcInstances || []).some((i) => i.id === wave1Id && i.hp > 0), 'w1 dead')
} catch (e) { ck('LW-3 gauntlet 执行', false, e.stack?.split('\n')[0] + ' | ' + e.message) }

// ═══ ⑤ D5 R1 战斗确定性(同状态重放逐字节一致·P1 闸门「同 seed 回放」)═══
//   同 (runId,chamberIndex,turnCount) → PRNG 同流 → 战斗逐字节一致。快照→(恢复→攻击)×3→三次结果须全等。
//   中等属性(不一击秒·留暴击/反击方差)：若仍走 Math.random,三次极难全等 → 此断言即证 seed 化生效。
try {
  const u = mkUser('d5'); out.ids.users.push(u.id)
  const { roomId, runId } = await startKaleidoRun(sb, u)
  out.ids.rooms.push(roomId); out.ids.runs.push(runId)
  let room = await getRoom(roomId)
  let s = 0
  while (clearedSeq(room) < 1 && s < 12) { room = await act(u, roomId, 'search'); s++ } // 清 seq1
  room = await act(u, roomId, 'move') // 进 seq2(gauntlet 有敌)
  { const { data: rG } = await sb.from('rooms').select('gamevars').eq('id', roomId).single()
    const p = rG.gamevars.players[u.id]; p.atk = 8; p.hp = 500; p.maxHp = 500 // 敌 18hp·8atk→7-10 伤·不秒·留方差
    await sb.from('rooms').update({ gamevars: rG.gamevars }).eq('id', roomId) }
  const cap = (r) => {
    const me = r?.gamevars?.players?.[u.id]
    const tId = r?.gamevars?.raidPath?.[me?.chamberIndex ?? 0]?.templateId
    const enc = (r?.gamevars?.npcInstances || []).find((i) => i.mapId === tId)
    return { playerHp: me?.hp, encHp: enc?.hp ?? null }
  }
  const { data: snap } = await sb.from('rooms').select('gamevars').eq('id', roomId).single()
  const gv0 = JSON.stringify(snap.gamevars)
  const results = []
  for (let i = 0; i < 2; i++) {
    await sb.from('rooms').update({ gamevars: JSON.parse(gv0) }).eq('id', roomId) // 恢复到序列前状态
    const trace = []
    for (let a = 0; a < 6; a++) { // 6-attack 序列(跨 wave-1 死+wave-2·累积 crit/counter)= 高熵签名
      const r = await act(u, roomId, 'attackNpc')
      const me = r?.gamevars?.players?.[u.id]
      trace.push({ hp: me?.hp ?? -1, w: me?.gauntletWave ?? 1, enc: cap(r).encHp })
      if (me?.alive === false) break
    }
    results.push(JSON.stringify(trace))
  }
  // 高熵序列两次全等 → seed 化生效(若走 Math.random,6-attack 累积 crit/counter 序列几无可能逐字节相同)
  ck('D5:同状态×2 重放 6-attack 序列逐字节一致(seed 化生效)', results[0] === results[1], results[0])
} catch (e) { ck('D5 执行', false, e.stack?.split('\n')[0] + ' | ' + e.message) }

// ═══ ⑥ B4 loadout_panel(持久 stat 件兑现 → 整备面板浮现)═══
//   触发二支之一:首次用持久 stat 件(useItem 抬 atk/def/maxHp)。另一支「首次 craft 成功」现无配方(item_recipes 空)不可测,
//   由 hasCrafted 旗标覆盖(craftItemRecipe 成功即置·kaleido 门)。用 id24 结构强化液(def+50·唯一带 stat 的道具)。
try {
  const u = mkUser('b4'); out.ids.users.push(u.id)
  const { roomId, runId } = await startKaleidoRun(sb, u)
  out.ids.rooms.push(roomId); out.ids.runs.push(runId)
  { const { data: r } = await sb.from('rooms').select('gamevars').eq('id', roomId).single()
    const p = r.gamevars.players[u.id]; p.inventory = [...(p.inventory || []), '结构强化液']
    await sb.from('rooms').update({ gamevars: r.gamevars }).eq('id', roomId) }
  let room = await getRoom(roomId)
  const defBefore = room?.gamevars?.players?.[u.id]?.def ?? 0
  room = await act(u, roomId, 'useItem', { itemName: '结构强化液' })
  const meU = room?.gamevars?.players?.[u.id]
  // ⚠ 特征化断言(记录当前引擎映射事实,非期望终态):calcItemEffect 只对 kind='weapon'→atkDelta / 'armor'→defDelta
  //   产出增量;item_pool 现只有 consumable/tech_fragment/platform_part/omega_matter,consumable 仅产 hpDelta
  //   → id24(def=50)被忽略 ⟹ 「持久 stat 件」当前不可达,loadout_panel 的这一支无法 E2E 验。
  //   **⚙️ 09 备好 stat 件(给 kind='armor'/'weapon' 或引擎补 consumable stat 映射)后:本断言会翻红,
  //     届时改为断言 def 上升 + loadout_panel 解锁**——翻红即提醒,不是回归。
  ck('B4/gap:持久 stat 件当前不可达(consumable 的 def 被 calcItemEffect 忽略)', (meU?.def ?? 0) === defBefore, JSON.stringify({ defBefore, defAfter: meU?.def, note: 'kind=consumable 只产 hpDelta' }))
  const { data: bEv } = await sb.from('player_events').select('verb,payload').eq('player_id', u.id).eq('verb', 'ui_unlock')
  ck('B4/gap:loadout_panel 未解锁(触发已实现·待 ⚙️ 内容就位)', !(bEv || []).some((e) => e.payload?.ui_key === 'loadout_panel'), JSON.stringify((bEv || []).map((e) => e.payload?.ui_key)))
} catch (e) { ck('B4 loadout_panel 执行', false, e.stack?.split('\n')[0] + ' | ' + e.message) }

// ═══ ⑦ D3 逐关规则覆盖(mergeGameRules 纯函数 + node 注入集成)═══
try {
  // (a) 纯函数语义:无覆盖→同一身份(零行为变化)/ env 生效且不改原对象 / 白名单内生效 / 白名单外忽略
  const g = { damage_formula: 'atk * atkMultiplier - def * defMultiplier', crit_rate: 0.1, search_item_chance: 0.5 }
  ck('D3:无覆盖返回同一对象(零拷贝·零行为变化)', mergeGameRules(g, [], []) === g, 'same identity')
  const m1 = mergeGameRules(g, [{ key: 'search_item_chance', value: 0.9 }], [])
  ck('D3:env_rules 覆盖生效且不污染原对象', m1.search_item_chance === 0.9 && g.search_item_chance === 0.5, JSON.stringify({ merged: m1.search_item_chance, global: g.search_item_chance }))
  const m2 = mergeGameRules(g, [], [{ key: 'crit_rate', value: 1 }, { key: 'player_attack_accuracy', value: 0 }])
  ck('D3:formula_override 白名单内生效(crit_rate)', m2.crit_rate === 1, String(m2.crit_rate))
  ck('D3:白名单外键被忽略(player_attack_accuracy 不可覆盖)', m2.player_attack_accuracy === undefined, String(m2.player_attack_accuracy))

  // (b) 集成:把 formula_override 注入 run 的 seq2 node → 富战斗按覆盖结算(必暴击×10 → 9 伤变 90 → 18hp 敌一击毙)
  const u = mkUser('d3'); out.ids.users.push(u.id)
  const { roomId, runId } = await startKaleidoRun(sb, u)
  out.ids.rooms.push(roomId); out.ids.runs.push(runId)
  let room = await getRoom(roomId)
  let s = 0
  while (clearedSeq(room) < 1 && s < 12) { room = await act(u, roomId, 'search'); s++ } // 清 seq1
  room = await act(u, roomId, 'move') // 进 seq2(wave-1 18hp)
  const encId = room?.gamevars?.players?.[u.id]?.encounter?.instanceId
  { const { data: r } = await sb.from('rooms').select('gamevars').eq('id', roomId).single()
    r.gamevars.raidPath[1].kaleidoFormulaOverrides = [{ key: 'crit_rate', value: 1 }, { key: 'crit_multiplier', value: 10 }]
    await sb.from('rooms').update({ gamevars: r.gamevars }).eq('id', roomId) }
  let dead = false
  for (let a = 0; a < 3 && !dead; a++) { // 命中率 0.85 → 最多 3 击兜底(全 miss 概率 0.3%)
    room = await act(u, roomId, 'attackNpc')
    dead = !(room?.gamevars?.npcInstances || []).some((i) => i.id === encId && i.hp > 0)
  }
  ck('D3:逐关 formula_override 真生效(必暴击×10 → wave-1 一击毙)', dead, JSON.stringify({ encId, dead }))
} catch (e) { ck('D3 执行', false, e.stack?.split('\n')[0] + ' | ' + e.message) }

// ═══ ⑧ legacy battle 软锁根治(2026-07-22·§③ 偶发红真因)═══
//   事件系统 on_search/on_enter_map 的 spawn_npc/trigger_battle 会置 player.battle(legacy 字段)。
//   kaleido 无人消费该字段(战斗走 encounter),而 resolveSearchAction 在 `if (afterEvent.battle)` 早返
//   → 置位后**此后每次 search 全部空转**:hook① guaranteed 哑火 + 零产出(软锁·LW-1 同级)。
//   本节把「字段已脏」这一存量态直接注入,验证 kaleido 清字段续算(而非早返)——确定性,不靠事件随机。
try {
  const u = mkUser('battlelock'); out.ids.users.push(u.id)
  const { roomId, runId } = await startKaleidoRun(sb, u)
  out.ids.rooms.push(roomId); out.ids.runs.push(runId)
  // 注入脏 battle 字段(模拟历史局/绕过源头拦截的写入)
  { const { data: r } = await sb.from('rooms').select('gamevars').eq('id', roomId).single()
    r.gamevars.players[u.id].battle = { npc: { name: '幻影残响', hp: 30 }, npcHp: 30, npcMaxHp: 30, turn: 1, log: [] }
    await sb.from('rooms').update({ gamevars: r.gamevars }).eq('id', roomId) }
  let room = await act(u, roomId, 'search')
  const meB = room?.gamevars?.players?.[u.id]
  ck('软锁:kaleido search 清 legacy battle 字段(不早返)', !meB?.battle, JSON.stringify(meB?.battle))
  ck('软锁:battle 脏态下 hook① guaranteed 仍投放(硬保证不被软锁吃掉)',
    (meB?.inventory || []).length > 0 && Array.isArray(room?.gamevars?.kaleido?.consumedEventDeck?.[0]),
    JSON.stringify({ inv: meB?.inventory, consumed: room?.gamevars?.kaleido?.consumedEventDeck }))
  // 源头:kaleido 候选集排除含 spawn_npc/trigger_battle 的事件 → 连搜 6 次不得再出现 battle
  let relock = false
  for (let i = 0; i < 6 && !relock; i++) {
    room = await act(u, roomId, 'search')
    if (room?.gamevars?.players?.[u.id]?.battle) relock = true
    // 过关就进下一关继续搜(换 templateId 换事件池);未达成则门禁拒绝——留在原关继续搜即可
    try { room = await act(u, roomId, 'move') } catch { /* 本关目标未达成:正常,继续搜 */ }
  }
  ck('源头:kaleido 事件不再刷 legacy battle(连续动作后仍为空)', !relock, String(relock))
} catch (e) { ck('⑧ battle 软锁执行', false, e.stack?.split('\n')[0] + ' | ' + e.message) }

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
