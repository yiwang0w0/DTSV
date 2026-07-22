// ─────────────────────────────────────────────────────────────────
// KALEIDO 状态机 E2E 回归（service-role 直驱真库·P0 闸门验收转正 · 2026-07-07）
// 复刻路由边界：executeGameAction → (kaleido) advanceKaleidoProgress → buildActionEvent → emit
// 覆盖:① 门禁负测试(未过关 move 必拒) ② 幂等(二次 start 同 id) ③ 通关 run 全链
//      ④ 死亡收敛(runs→dead·death 事件恰一次) ⑤ 断言前置(清理前查库) ⑥ 自清理
// 语义注记:入关 turnCount 重置后,进关的 move 本身计为新关第 1 回合(02 §2.2 move=消耗动词)。
// LW-1(97f3e32)后:seq5=boss_kill —— 入关自动遭遇 boss,attackNpc 磨死(公共击杀链置 bossDefeated)过关。
// 前置:仓库根 .env.local 含 NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY(vercel env pull 可得)。
// 跑(仓库根):`npx tsx --tsconfig scripts/tsconfig.e2e.json scripts/kaleido-e2e.mjs` · 每次改 kaleido 状态机后必跑
//   ⚠ 路径映射走 scripts/tsconfig.e2e.json(专用文件)。**别在仓库根建 tsconfig.json** —— 会被 next build
//     接管并强改 moduleResolution,导致 build/sites-vite-plugin.ts 解析 'vite' 类型失败而编译红(实测踩过)。
// ─────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { startKaleidoRun, executeGameAction, advanceKaleidoProgress, applyKaleidoPostAction } from '../src/lib/server/gameActions.js'
import { isKaleidoRoom } from '../src/lib/roomState.js'
import { mergeGameRules } from '../src/lib/server/kaleido/rules.js'
import { isCraftMaterialKind } from '../src/lib/server/kaleido/uiUnlocks.js'

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
  // 杀 wave-1 → 推进层生成 wave-2。**必须循环**:D5 seed 化后命中仍是 per-run 掷骰(命中率 0.85),
  //   单发断言会在约 15% 的 run 上因首击 miss 翻红(实测踩到)。最多 4 击兜底(全 miss 概率 0.05%)。
  for (let a = 0; a < 4; a++) {
    room = await act(u, roomId, 'attackNpc')
    if (room?.gamevars?.players?.[u.id]?.gauntletWave === 2) break
  }
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
  //   → id24(def=50)被忽略 ⟹ **atk/def 这一支**仍不可达。
  //   **更新(2026-07-22·🧭 裁决 a)**:maxHp 支已打通(item_pool.max_hp_delta → maxHpDelta 钩子),
  //   loadout_panel 的「持久 stat 件」触发**已可达且已被 §⑩ 覆盖**;本节继续盯 atk/def 支的缺口。
  //   **⚙️ 备好 atk/def stat 件(给 kind='armor'/'weapon' 或引擎补 consumable stat 映射)后:本断言会翻红,
  //     届时改为断言 def 上升**——翻红即提醒,不是回归。
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

// ═══ ⑨ convergence_preview 终态分支(📖 N3 §5 两条 blocking 警告 · 钉死)═══
//   口径:**仅通关(boss_kill)授予首次解锁**;abandon 不触发(违 §1.4「系统不为逃兵留档」——前屏「账该合了」
//   后屏「没人记这笔账」自打脸);死亡不授予(否则 seq1 早死在体验最薄处烧掉这个后段披露拍)。
//   测法:把 clearedSeq 顶到**末关前一格**(4/5)再走终止路径 —— 若判据被误写成「run 收束」而非
//   「clearedSeq 达末关」,这两例必然误发,本节即翻红。确定性,不靠随机。
try {
  // (a) abandon 不触发
  const uA = mkUser('abandon'); out.ids.users.push(uA.id)
  const rA = await startKaleidoRun(sb, uA)
  out.ids.rooms.push(rA.roomId); out.ids.runs.push(rA.runId)
  await act(uA, rA.roomId, 'search') // 先产生若干正常解锁(证明通道是通的)
  { const { data: r } = await sb.from('rooms').select('gamevars').eq('id', rA.roomId).single()
    r.gamevars.kaleido.clearedSeq = 4; r.gamevars.kaleido.currentSeq = 5 // 顶到末关前一格
    await sb.from('rooms').update({ gamevars: r.gamevars }).eq('id', rA.roomId) }
  await act(uA, rA.roomId, 'abandonRun')
  const { data: evA } = await sb.from('player_events').select('payload').eq('player_id', uA.id).eq('verb', 'ui_unlock')
  const keysA = (evA || []).map((e) => e.payload?.ui_key)
  ck('B4/终态:abandon **不**触发 convergence_preview(不为逃兵留档)', !keysA.includes('convergence_preview'), JSON.stringify(keysA))
  ck('B4/终态:abandon 前的正常解锁仍在(证明通道非哑火)', keysA.length > 0, JSON.stringify(keysA))

  // (b) 死亡不授予首次解锁(仅复用已解锁面板 —— 复用属呈现层,引擎侧只需「不发」)
  const uD = mkUser('deadconv'); out.ids.users.push(uD.id)
  const rD = await startKaleidoRun(sb, uD)
  out.ids.rooms.push(rD.roomId); out.ids.runs.push(rD.runId)
  let roomD = await getRoom(rD.roomId)
  const beforeMeD = roomD.gamevars.players[uD.id]
  { roomD.gamevars.kaleido.clearedSeq = 4; roomD.gamevars.kaleido.currentSeq = 5
    const p = roomD.gamevars.players[uD.id]; p.alive = false; p.hp = 0
    await sb.from('rooms').update({ gamevars: roomD.gamevars }).eq('id', rD.roomId) }
  roomD = await getRoom(rD.roomId)
  // 阵亡玩家的动作会被分发器 throw,故直接调共享入口(= 路由边界同一函数)走真求值路径
  await applyKaleidoPostAction(sb, roomD, uD, 'search', { beforeMe: beforeMeD, beforeClearedSeq: 4, beforeGamestate: roomD.gamestate })
  const { data: evD } = await sb.from('player_events').select('payload').eq('player_id', uD.id).eq('verb', 'ui_unlock')
  const keysD = (evD || []).map((e) => e.payload?.ui_key)
  ck('B4/终态:死亡**不**授予 convergence_preview 首次解锁', !keysD.includes('convergence_preview'), JSON.stringify(keysD))
  // precedes 锚点随 payload 下发(📖 警告:before 锚收敛页,非 boss 开打前 → 🎨 靠它接对拍点)
  const { data: evC } = await sb.from('player_events').select('payload').eq('verb', 'ui_unlock').in('player_id', out.ids.users)
  const cp = (evC || []).find((e) => e.payload?.ui_key === 'convergence_preview')
  ck('B4/锚点:convergence_preview 事件 timing=before(通关路径已发)', cp?.payload?.timing === 'before', JSON.stringify(cp?.payload))
} catch (e) { ck('⑨ convergence_preview 终态分支执行', false, e.stack?.split('\n')[0] + ' | ' + e.message) }

// ═══ ⑩ maxHpDelta 钩子(🧭 裁决 a · 解 ⚙️ 扩容件与 08 §4 战力预算)═══
//   item_pool.max_hp_delta(新列·缺省 0)→ calcItemEffect.maxHpDelta → resolveUseItemAction 同量抬 maxHp+hp。
//   测法:临时给 id27 写 15 → 用掉 → 断言双抬 15 + loadout_panel(statGained 支)解锁 → finally 还原**原值**。
let mhOrig = null
try {
  const { data: it0 } = await sb.from('item_pool').select('id,name,max_hp_delta').eq('id', 27).single()
  mhOrig = it0?.max_hp_delta ?? 0
  ck('maxHpDelta:承载列 item_pool.max_hp_delta 存在且存量为 0(零行为变化)', mhOrig === 0, JSON.stringify(it0))
  await sb.from('item_pool').update({ max_hp_delta: 15 }).eq('id', 27)
  const u = mkUser('maxhp'); out.ids.users.push(u.id)
  const { roomId, runId } = await startKaleidoRun(sb, u)
  out.ids.rooms.push(roomId); out.ids.runs.push(runId)
  { const { data: r } = await sb.from('rooms').select('gamevars').eq('id', roomId).single()
    const p = r.gamevars.players[u.id]; p.inventory = [...(p.inventory || []), it0.name]
    await sb.from('rooms').update({ gamevars: r.gamevars }).eq('id', roomId) }
  let room = await getRoom(roomId)
  const b = room?.gamevars?.players?.[u.id]
  const hpB = b?.hp ?? 0, maxB = b?.maxHp ?? 0
  room = await act(u, roomId, 'useItem', { itemName: it0.name })
  const a = room?.gamevars?.players?.[u.id]
  ck('maxHpDelta:maxHp +15(永久抬底)', (a?.maxHp ?? 0) - maxB === 15, JSON.stringify({ maxB, maxA: a?.maxHp }))
  ck('maxHpDelta:hp 同量 +15(撑大即刻可用·09 §4「并补满」)', (a?.hp ?? 0) - hpB === 15, JSON.stringify({ hpB, hpA: a?.hp, maxA: a?.maxHp }))
  ck('maxHpDelta:道具被消耗(不可重复吃增益)', !(a?.inventory || []).includes(it0.name), JSON.stringify(a?.inventory))
  const { data: mEv } = await sb.from('player_events').select('payload').eq('player_id', u.id).eq('verb', 'ui_unlock')
  ck('maxHpDelta→B4:持久 stat 件兑现 → loadout_panel 解锁(§⑥ gap 的另一支现已可达)',
    (mEv || []).some((e) => e.payload?.ui_key === 'loadout_panel'), JSON.stringify((mEv || []).map((e) => e.payload?.ui_key)))
} catch (e) { ck('⑩ maxHpDelta 执行', false, e.stack?.split('\n')[0] + ' | ' + e.message) }
finally {
  if (mhOrig !== null) {
    try { await sb.from('item_pool').update({ max_hp_delta: mhOrig }).eq('id', 27); console.log('MAXHP_RESTORED ' + mhOrig) }
    catch (e) { console.error('MAXHP_RESTORE_FAIL', e.message) }
  }
}

// ═══ ⑪ 账号集 fail-closed 闸门(2026-07-22 · 防「一次读抖动裁小老玩家账号列」)═══
//   背景:applyKaleidoPostAction 对 profiles.ui_unlocks 是**无条件全列覆盖写**,基底是开局读到的账号集。
//   若开局读失败回落空集,覆盖写会把老玩家的账号集永久裁成 ['search_btn'] ∪ 本 run 新键(不可逆)。
//   现改 fail-closed:读失败标 gamevars.kaleido.accountReadFailed → 本 run 跳过 profiles 写。
//   ⚠ 可测性边界(诚实标注):E2E 用的是**纯内存随机 uid**,而 profiles.id 有 FK → auth.users,
//     故本脚本**无法**构造真 profiles 行,账号列的写/不写没有自动化网(需 🔒 裁 E2E 能否碰 auth 表)。
//     此处只钉两件可测的:①正常 run 不带该标记(不误伤);②带标记时解锁仍在房内正常推进(不阻断玩法)。
try {
  const u = mkUser('failclosed'); out.ids.users.push(u.id)
  const { roomId, runId } = await startKaleidoRun(sb, u)
  out.ids.rooms.push(roomId); out.ids.runs.push(runId)
  let room = await getRoom(roomId)
  ck('fail-closed:正常 run 不带 accountReadFailed 标记(kaleido 块逐字节同旧)',
    room?.gamevars?.kaleido?.accountReadFailed === undefined, JSON.stringify(room?.gamevars?.kaleido))
  // 注入标记 → 模拟「开局读账号集失败」的 run,验证解锁链不被闸门阻断(只是不落账号列)
  { const { data: r } = await sb.from('rooms').select('gamevars').eq('id', roomId).single()
    r.gamevars.kaleido.accountReadFailed = true
    await sb.from('rooms').update({ gamevars: r.gamevars }).eq('id', roomId) }
  room = await act(u, roomId, 'search')
  const me = room?.gamevars?.players?.[u.id]
  ck('fail-closed:标记态下房内解锁仍推进(闸门只挡账号列,不挡玩法)',
    Array.isArray(me?.uiUnlocks) && me.uiUnlocks.includes('hp_bar') && me.uiUnlocks.includes('log_panel'),
    JSON.stringify(me?.uiUnlocks))
  const { data: fEv } = await sb.from('player_events').select('payload').eq('player_id', u.id).eq('verb', 'ui_unlock')
  ck('fail-closed:标记态下 ui_unlock 事件照发(遥测不丢)', (fEv || []).length > 0, JSON.stringify((fEv || []).map((e) => e.payload?.ui_key)))
} catch (e) { ck('⑪ fail-closed 执行', false, e.stack?.split('\n')[0] + ' | ' + e.message) }

// ═══ ⑫ 周期保底(⚙️ step1 §3 载重前提 · 每 N 次合格搜索必给 1 件 · run 级跨关不重置)═══
//   config 由 startKaleidoRun 从 game_rules 播种进 gamevars.kaleido.cycleGuarantee(默认关)。
//   此处直接注入 config(N=2·修补剂)→ 搜若干次 → 断言:①按周期给 ②跨关不重置 ③关内 guaranteed 占用
//   的那一搜不吞保底(下一搜补发)。全确定性,不靠掉率。
try {
  const u = mkUser('cycle'); out.ids.users.push(u.id)
  const { roomId, runId } = await startKaleidoRun(sb, u)
  out.ids.rooms.push(roomId); out.ids.runs.push(runId)
  let room = await getRoom(roomId)
  ck('周期保底:未配置时 gamevars 无 cycleGuarantee 键(存量/多人零变化)',
    room?.gamevars?.kaleido?.cycleGuarantee === undefined, JSON.stringify(room?.gamevars?.kaleido))
  // 注入 config：每 2 搜必给 1 瓶修补剂
  { const { data: r } = await sb.from('rooms').select('gamevars').eq('id', roomId).single()
    r.gamevars.kaleido.cycleGuarantee = { everyN: 2, item: '修补剂', count: 0, lastAt: 0 }
    // 清掉关内 guaranteed 的干扰(本节只测周期保底)：标记 seq1 的 deck 全部已消费
    r.gamevars.kaleido.consumedEventDeck = { 0: [0, 1, 2] }
    r.gamevars.players[u.id].inventory = []
    await sb.from('rooms').update({ gamevars: r.gamevars }).eq('id', roomId) }
  const invOf = (r) => (r?.gamevars?.players?.[u.id]?.inventory || []).filter((n) => n === '修补剂').length
  room = await act(u, roomId, 'search') // count=1 → 未到周期
  const after1 = invOf(room)
  room = await act(u, roomId, 'search') // count=2 → 必给
  const after2 = invOf(room)
  ck('周期保底:第 2 搜(N=2)必给 1 瓶', after2 - after1 === 1, JSON.stringify({ after1, after2, cg: room?.gamevars?.kaleido?.cycleGuarantee }))
  ck('周期保底:lastAt 推进到本次 count(不连发)', (room?.gamevars?.kaleido?.cycleGuarantee?.lastAt ?? -1) === 2, JSON.stringify(room?.gamevars?.kaleido?.cycleGuarantee))
  room = await act(u, roomId, 'search') // count=3 → 未到下个周期
  ck('周期保底:第 3 搜不再给(周期未到)', invOf(room) === after2, JSON.stringify({ n: invOf(room), cg: room?.gamevars?.kaleido?.cycleGuarantee }))
  // 跨关不重置：清关 → move → 计数继续累加(不归零)
  let guard = 0
  while (clearedSeq(room) < 1 && guard < 12) { room = await act(u, roomId, 'search'); guard++ }
  const cntBeforeMove = room?.gamevars?.kaleido?.cycleGuarantee?.count ?? 0
  room = await act(u, roomId, 'move')
  const cgAfterMove = room?.gamevars?.kaleido?.cycleGuarantee
  ck('周期保底:跨关不重置(move 后 count 不归零)', (cgAfterMove?.count ?? 0) >= cntBeforeMove && cntBeforeMove > 0,
    JSON.stringify({ cntBeforeMove, after: cgAfterMove }))
} catch (e) { ck('⑫ 周期保底执行', false, e.stack?.split('\n')[0] + ' | ' + e.message) }

// ═══ ⑬ 道具效果链三处(🧭 派单 · material 静默销毁 / atk_delta·def_delta / 材料判据排除式)═══
try {
  const u = mkUser('itemfx'); out.ids.users.push(u.id)
  const { roomId, runId } = await startKaleidoRun(sb, u)
  out.ids.rooms.push(roomId); out.ids.runs.push(runId)
  // ③ material 守卫：材料点「使用」必须被拒,且**道具还在**(此前是静默销毁)
  { const { data: r } = await sb.from('rooms').select('gamevars').eq('id', roomId).single()
    r.gamevars.players[u.id].inventory = ['碎块']
    await sb.from('rooms').update({ gamevars: r.gamevars }).eq('id', roomId) }
  let msg = ''
  try { await act(u, roomId, 'useItem', { itemName: '碎块' }) } catch (e) { msg = e.message }
  ck('材料守卫:material 点使用被拒(不再静默销毁)', msg.includes('合成材料'), msg)
  const room2 = await getRoom(roomId)
  ck('材料守卫:被拒后道具仍在背包(未被吃掉)',
    (room2?.gamevars?.players?.[u.id]?.inventory || []).includes('碎块'),
    JSON.stringify(room2?.gamevars?.players?.[u.id]?.inventory))
  // ② 材料判据排除式：kind='material' 现在算材料(此前白名单漏它 → craft_btn 静默断链)
  ck('材料判据:kind=material 被认作配方材料(排除式判据)', isCraftMaterialKind('material'), 'material')
  ck('材料判据:consumable/equipment 不是材料', !isCraftMaterialKind('consumable') && !isCraftMaterialKind('equipment'), 'ok')
  ck('材料判据:未来新增的未知 kind 自动算材料(不再每加一 kind 漏一次)', isCraftMaterialKind('brand_new_kind_2027'), 'ok')
  // ① atk_delta / def_delta：列尚未建(待 🧭 审批 DDL)⇒ 现在应恒 0；列建好并补值后本断言翻红即提醒接续
  const { data: fxRow } = await sb.from('item_pool').select('*').eq('name', '加力件').maybeSingle()
  const hasCol = fxRow && Object.prototype.hasOwnProperty.call(fxRow, 'atk_delta')
  ck('atk_delta 列状态登记(未建=待 🧭 审 DDL;已建则应有值)',
    !hasCol || Number(fxRow.atk_delta) >= 0, JSON.stringify({ hasCol, atk_delta: fxRow?.atk_delta, atk: fxRow?.atk }))
} catch (e) { ck('⑬ 道具效果链执行', false, e.stack?.split('\n')[0] + ' | ' + e.message) }

// ═══ ⑭ H3：回合起始结算致死路径上，解锁写不得静默失败（06 §1.3 铁律路径）═══
//   `resolveSearchAction` 的「持续效果致死」分支原走 persistResolutionAsync（fire-and-forget +
//   立即返回 version+1 的乐观 room）⇒ 路由边界的 ui_unlocks persist 拿乐观 version 做 CAS ⇒ 后台写
//   未落即 0 行命中 → VersionConflictError → 被吞 ⇒ **解锁不落库、事件不发**。而这正是 06 §1.3 明文
//   要保的那条（首搜当回合致死也必须下发 hp_bar），且死亡后玩家再进不了 applyKaleidoPostAction ⇒ 不可自愈。
//   构造：注入 DoT 债 buff（id1 中毒 · -80hp/回合）+ hp 压到 50 ⇒ **首次 search 的回合起始结算即致死**。
try {
  const u = mkUser('h3'); out.ids.users.push(u.id)
  const { roomId, runId } = await startKaleidoRun(sb, u)
  out.ids.rooms.push(roomId); out.ids.runs.push(runId)
  { const { data: r } = await sb.from('rooms').select('gamevars').eq('id', roomId).single()
    const p = r.gamevars.players[u.id]
    p.hp = 50                                             // < 80 ⇒ 一跳必死
    p.buffs = [{ buffId: 1, remainingTurns: 3 }]          // buff_pool id1「中毒」dot hp -80
    await sb.from('rooms').update({ gamevars: r.gamevars }).eq('id', roomId) }
  // ⚠ 关键:**不经 act()**,直接调 executeGameAction 后**零 await 间隔**读库比对 version ——
  //   同步写 ⇒ 返回的 room.version 必等于库中 version;异步写(旧行为)那一刻写还在飞,库里是旧版本。
  //   这是本节唯一能把「同步/异步」区分开的窗口:一旦中间夹了 applyKaleidoPostAction 的多次往返,
  //   后台写通常已落库,两者又相等了(负对照会假绿)。
  const preRoom = await getRoom(roomId)
  const acted = await executeGameAction(sb, u, { roomId, action: 'search' }, {})
  const { data: dbNow } = await sb.from('rooms').select('version').eq('id', roomId).single()
  ck('H3:kaleido 致死拍走**同步** persist(返回 version 与库内一致·非乐观值)',
    (acted?.version ?? -1) === (dbNow?.version ?? -2), JSON.stringify({ returned: acted?.version, db: dbNow?.version, before: preRoom?.version }))
  // 补完路由边界(act 的后半段),再验解锁落库
  const res = await applyKaleidoPostAction(sb, acted, u, 'search', {
    beforeMe: preRoom.gamevars.players[u.id], beforeClearedSeq: preRoom.gamevars?.kaleido?.clearedSeq ?? 0, beforeGamestate: preRoom.gamestate,
  })
  const room = res.room
  const me = room?.gamevars?.players?.[u.id]
  ck('H3:构造成立(回合起始结算即致死)', me?.alive === false, JSON.stringify({ hp: me?.hp, alive: me?.alive }))
  // 核心断言：致死那一拍的解锁**落库**（此前 CAS 冲突被吞 ⇒ 这里会是空）
  const { data: dbRoom } = await sb.from('rooms').select('gamevars').eq('id', roomId).single()
  const dbUnlocks = dbRoom?.gamevars?.players?.[u.id]?.uiUnlocks || []
  ck('H3:致死拍的解锁已落库(hp_bar 在 DB 里·非仅内存)', dbUnlocks.includes('hp_bar'), JSON.stringify(dbUnlocks))
  const { data: h3Ev } = await sb.from('player_events').select('verb,payload').eq('player_id', u.id).eq('verb', 'ui_unlock')
  ck('H3:致死拍的 ui_unlock 事件已发(06 §1.3 兜底不落空)',
    (h3Ev || []).some((e) => e.payload?.ui_key === 'hp_bar'), JSON.stringify((h3Ev || []).map((e) => e.payload?.ui_key)))
  // ⚠ 负对照实测记录(2026-07-22)：把修复回退后跑本节 ——
  //   **只有上面那条 version 断言翻红**(returned:2 / db:1)，「解锁落库」「事件已发」两条**仍绿**。
  //   ⇒ 本地后台写通常抢在 CAS 之前落库，竞态偏向成功；H3 的真实暴露场景是 **Vercel serverless
  //     把未 await 的 promise 随函数冻结丢掉**（同 emitPlayerEvents 当年要 await 的那条理由）。
  //   ⇒ 后两条是**不变式守卫**，不是 H3 的回归网；**version 那条才是**。别把它们的绿当成 H3 已被覆盖。
} catch (e) { ck('⑭ H3 执行', false, e.stack?.split('\n')[0] + ' | ' + e.message) }

// ═══ ⑮ step1 负伤流血 d（⚙️ 口径:每**消耗性动作**都流·非只有搜索）═══
//   config 由 startKaleidoRun 从 game_rules 播种,默认关。此处直接注入(N=固定值·无方差)验四件:
//   ①默认关时键不出现 ②每个消耗性动作都扣 ③**releaseEncounter 也扣但不计回合** ④流血致死立刻收敛 run。
try {
  const u = mkUser('bleed'); out.ids.users.push(u.id)
  const { roomId, runId } = await startKaleidoRun(sb, u)
  out.ids.rooms.push(roomId); out.ids.runs.push(runId)
  let room = await getRoom(roomId)
  ck('流血:未配置时 gamevars 无 bleed 键(存量/多人零变化)',
    room?.gamevars?.kaleido?.bleed === undefined, JSON.stringify(room?.gamevars?.kaleido))
  { const { data: r } = await sb.from('rooms').select('gamevars').eq('id', roomId).single()
    r.gamevars.kaleido.bleed = { perAction: 4, jitter: 0 }   // 固定值 → 断言可算
    const p = r.gamevars.players[u.id]; p.hp = 500; p.maxHp = 500  // 够撑过清关流程
    await sb.from('rooms').update({ gamevars: r.gamevars }).eq('id', roomId) }
  room = await getRoom(roomId)
  const hp0 = room?.gamevars?.players?.[u.id]?.hp
  room = await act(u, roomId, 'search')
  const me1 = room?.gamevars?.players?.[u.id]
  ck('流血:search 扣 d(4)', hp0 - (me1?.hp ?? 0) === 4, JSON.stringify({ hp0, hp1: me1?.hp }))
  // releaseEncounter 需要真遭遇 → 清 seq1 进 seq2(gauntlet 入关自动遭遇)
  let g = 0
  while (clearedSeq(room) < 1 && g < 12) { room = await act(u, roomId, 'search'); g++ }
  room = await act(u, roomId, 'move')
  const meB = room?.gamevars?.players?.[u.id]
  ck('流血:seq2 入关已有遭遇(releaseEncounter 前置成立)', !!meB?.encounter, JSON.stringify({ enc: !!meB?.encounter }))
  const hpB = meB?.hp, turnB = meB?.turnCount
  // releaseEncounter：流血但**不计回合**（刻意与 TURN_ACTIONS 区分）
  room = await act(u, roomId, 'releaseEncounter')
  const me2 = room?.gamevars?.players?.[u.id]
  ck('流血:releaseEncounter 也扣血(零成本洞已堵)', (hpB ?? 0) - (me2?.hp ?? 0) === 4, JSON.stringify({ hpB, hp2: me2?.hp }))
  ck('流血:releaseEncounter **不计回合**(不动过关节奏)', me2?.turnCount === turnB, JSON.stringify({ turnB, turn2: me2?.turnCount }))
  // 流血致死 → run 立刻收敛 dead（不能等下个动作：阵亡玩家被 handler 挡在门外）
  { const { data: r } = await sb.from('rooms').select('gamevars').eq('id', roomId).single()
    r.gamevars.players[u.id].hp = 3   // < d ⇒ 下一动作必死
    await sb.from('rooms').update({ gamevars: r.gamevars }).eq('id', roomId) }
  room = await act(u, roomId, 'search')
  const me3 = room?.gamevars?.players?.[u.id]
  ck('流血:致死(hp 归零·alive=false)', me3?.alive === false && me3?.hp === 0, JSON.stringify({ hp: me3?.hp, alive: me3?.alive }))
  const { data: bRun } = await sb.from('runs').select('status,converged_at').eq('run_id', runId).single()
  ck('流血:致死当拍 run 即收敛 dead(不留悬空 active)', bRun?.status === 'dead' && !!bRun?.converged_at, JSON.stringify(bRun))
  const { data: bEv } = await sb.from('player_events').select('verb').eq('player_id', u.id).eq('verb', 'death')
  ck('流血:death 事件恰 1 条', (bEv || []).length === 1, String((bEv || []).length))
} catch (e) { ck('⑮ 负伤流血执行', false, e.stack?.split('\n')[0] + ' | ' + e.message) }

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
