/**
 * match.js — 虚拟空间BR 对局生命周期 + state 组装（Phase 31 骨架）
 *
 * 设计宪法 docs/timejump-br-design.md §3。本阶段仅「建 / 入 / 查 / 列」，
 * 无事件 / 战斗 / 搜索 / 跳跃（留 Phase 32+）。所有 br_* 写操作集中在此模块，
 * 由 /api/br route 用 service-role client（绕 RLS）调用。
 *
 * 约束落地：
 *   - createMatch：允许传短 phase_seconds 便于走查；autoStart=true（骨架默认即开钟，
 *     status='active' + started_at=now()）。
 *   - joinMatch：幂等 —— 已加入则返回现有 player；新玩家落入一个当前 open 的非禁区起始房、depth=0。
 *   - getMatchState：computeClock → effectivePhase(depth 0) → loadGridForPhase(realPhase) → players + me。
 *   - 派生相位一律走 clock.js，前后端单一真相；禁区只读走 zones.js。
 *
 * 模块为「纯封装」：接收 supabase 实例作首参（不自建 client），便于复用与测试。
 */

import {
  computeClock,
  effectivePhase,
  clampPhaseSeconds,
  clampMaxPhase,
  MAX_PHASE_DEFAULT,
} from './clock'
import { loadGridForPhase } from './zones'
import { loadRoomStates, loadRecentEvents, filterVisible, RECENT_EVENTS_LIMIT } from './events'

/** 把 timestamptz / ISO / Date 安全折算成毫秒整数；无效 ⇒ null */
function toMs(ts) {
  if (ts == null) return null
  const ms = new Date(ts).getTime()
  return Number.isFinite(ms) ? ms : null
}

/**
 * 纯函数：为新玩家选初始房。
 * Phase 31 取一个当前 open（非禁区）的房：优先网格中心附近，否则首个 open；
 * 全禁区（理论不会发生）兜底取首个房。
 *
 * @param {Array} grid  GridRoom[]（已按当前 realPhase 取好禁区）
 * @returns {number|null} roomId
 */
export function spawnRoom(grid) {
  if (!Array.isArray(grid) || grid.length === 0) return null
  const open = grid.filter((g) => g.open)
  if (open.length === 0) return grid[0].roomId

  // 偏好网格中心（gridX/gridY 接近 4-5），让初始铺开更居中
  const cx = 4.5
  const cy = 4.5
  let best = open[0]
  let bestDist = Infinity
  for (const g of open) {
    if (g.gridX == null || g.gridY == null) continue
    const dx = g.gridX - cx
    const dy = g.gridY - cy
    const dist = dx * dx + dy * dy
    if (dist < bestDist) {
      bestDist = dist
      best = g
    }
  }
  return best.roomId
}

/** br_match_players 行 → 前端 PlayerLite */
function toPlayerLite(row, viewerUserId) {
  return {
    userId: row.user_id,
    roomId: row.room_id ?? null,
    depth: Number.isFinite(row.depth) ? row.depth : 0,
    hp: Number.isFinite(row.hp) ? row.hp : 0,
    maxHp: Number.isFinite(row.max_hp) ? row.max_hp : 0,
    alive: row.alive !== false,
    isJumper: row.is_jumper === true, // Phase 31 恒 false
    isMe: row.user_id === viewerUserId,
  }
}

/**
 * 建对局。插 br_matches 一行。
 * autoStart=true（默认）：status='active' + started_at=now()（骨架走查即开钟）。
 *
 * @param {object} supabase  service-role client
 * @param {object} user      登录用户（auth.user）
 * @param {object} [opts]    { phaseSeconds?, maxPhase?, autoStart?=true, config? }
 * @returns {Promise<{ matchId:number }>}
 */
export async function createMatch(supabase, user, opts = {}) {
  const phaseSeconds = clampPhaseSeconds(opts.phaseSeconds)
  const maxPhase = clampMaxPhase(opts.maxPhase ?? MAX_PHASE_DEFAULT)
  const autoStart = opts.autoStart !== false

  const row = {
    status: autoStart ? 'active' : 'lobby',
    phase_seconds: phaseSeconds,
    max_phase: maxPhase,
    config: opts.config && typeof opts.config === 'object' ? opts.config : {},
  }
  if (autoStart) row.started_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('br_matches')
    .insert(row)
    .select('id')
    .single()

  if (error) throw new Error(error.message || '建立对局失败')

  // 中文日志：便于走查时在服务端看到建局/相位参数
  console.log(`[br] createMatch id=${data.id} phase_seconds=${phaseSeconds} max_phase=${maxPhase} status=${row.status}`)

  return { matchId: data.id }
}

/**
 * 预留：lobby → active，设 started_at=now()。autoStart 建局时不必显式调。
 * 幂等：已 active 则返回现有 started_at；已 ended 抛错。
 *
 * @returns {Promise<{ matchId:number, startedAtMs:number }>}
 */
export async function startMatch(supabase, matchId) {
  const { data: match, error: selErr } = await supabase
    .from('br_matches')
    .select('id, status, started_at')
    .eq('id', matchId)
    .maybeSingle()

  if (selErr) throw new Error(selErr.message || '读取对局失败')
  if (!match) throw new Error('对局不存在')
  if (match.status === 'ended') throw new Error('对局已结束')

  if (match.status === 'active' && match.started_at) {
    return { matchId: match.id, startedAtMs: toMs(match.started_at) }
  }

  const startedAtIso = new Date().toISOString()
  const { error: updErr } = await supabase
    .from('br_matches')
    .update({ status: 'active', started_at: startedAtIso })
    .eq('id', matchId)

  if (updErr) throw new Error(updErr.message || '开局失败')

  console.log(`[br] startMatch id=${matchId} started_at=${startedAtIso}`)
  return { matchId, startedAtMs: toMs(startedAtIso) }
}

/**
 * 加入对局。幂等：(match_id, user_id) PK，已在则返回现有行（不重置 depth/房）。
 * 新玩家落入一个当前 open 的起始房（spawnRoom），depth=0，is_jumper=false。
 *
 * match 不存在 → 抛 { code:'not_found' }；已 ended → 抛 { code:'ended' }（route 映射 404/400）。
 *
 * @returns {Promise<{ matchId:number, userId:string, roomId:number|null, depth:0 }>}
 */
export async function joinMatch(supabase, user, matchId) {
  const { data: match, error: matchErr } = await supabase
    .from('br_matches')
    .select('id, status, started_at, phase_seconds, max_phase')
    .eq('id', matchId)
    .maybeSingle()

  if (matchErr) throw new Error(matchErr.message || '读取对局失败')
  if (!match) {
    const e = new Error('对局不存在')
    e.code = 'not_found'
    throw e
  }
  if (match.status === 'ended') {
    const e = new Error('对局已结束')
    e.code = 'ended'
    throw e
  }

  // 幂等：已加入则直接返回现有行
  const { data: existing, error: existErr } = await supabase
    .from('br_match_players')
    .select('match_id, user_id, room_id, depth')
    .eq('match_id', matchId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existErr) throw new Error(existErr.message || '读取玩家态失败')
  if (existing) {
    console.log(`[br] joinMatch idempotent match=${matchId} user=${user.id} room=${existing.room_id}`)
    return { matchId: match.id, userId: user.id, roomId: existing.room_id ?? null, depth: 0 }
  }

  // 新玩家：按当前真实阶段取网格、选一个 open 房落座（depth 恒 0 ⇒ 有效阶段=真实阶段）
  const clock = computeClock(match)
  const eff = effectivePhase(clock.realPhase, 0, clock.maxPhase)
  const grid = await loadGridForPhase(supabase, eff)
  const roomId = spawnRoom(grid)

  // upsert 防并发重复 join（PK 冲突时 onConflict 忽略写入）；ignoreDuplicates 后再读回现有行
  const { error: insErr } = await supabase
    .from('br_match_players')
    .upsert(
      {
        match_id: matchId,
        user_id: user.id,
        room_id: roomId,
        depth: 0,
        is_jumper: false,
      },
      { onConflict: 'match_id,user_id', ignoreDuplicates: true },
    )

  if (insErr) throw new Error(insErr.message || '加入对局失败')

  // 读回权威行（并发下可能是别的请求写入的，以 DB 为准）
  const { data: finalRow } = await supabase
    .from('br_match_players')
    .select('match_id, user_id, room_id, depth')
    .eq('match_id', matchId)
    .eq('user_id', user.id)
    .maybeSingle()

  const finalRoom = finalRow?.room_id ?? roomId ?? null
  console.log(`[br] joinMatch match=${matchId} user=${user.id} spawn=${finalRoom}`)
  return { matchId: match.id, userId: user.id, roomId: finalRoom, depth: 0 }
}

/**
 * 组装 client state（见契约 clientDataShape.matchPage）。
 * 内部：computeClock → effectivePhase(me.depth, Phase 31 恒 0) → loadGridForPhase(realPhase)
 *       → players + me + counts。
 *
 * match 不存在返回 null（route 映射 404）。
 *
 * @param {object} supabase
 * @param {number} matchId
 * @param {string} viewerUserId
 * @returns {Promise<object|null>} MatchState
 */
export async function getMatchState(supabase, matchId, viewerUserId) {
  const { data: match, error: matchErr } = await supabase
    .from('br_matches')
    .select('id, status, started_at, ended_at, phase_seconds, max_phase, created_at')
    .eq('id', matchId)
    .maybeSingle()

  if (matchErr) throw new Error(matchErr.message || '读取对局失败')
  if (!match) return null

  const clock = computeClock(match)

  // 玩家列表（Phase 32：额外 select inventory，仅 me 暴露 —— 见下，非 me 不读用）
  const { data: playerRows, error: plErr } = await supabase
    .from('br_match_players')
    .select('user_id, room_id, depth, hp, max_hp, alive, is_jumper, inventory')
    .eq('match_id', matchId)

  if (plErr) throw new Error(plErr.message || '读取玩家列表失败')

  // players[] 保持 Phase 31 形状（不含 inventory —— 信息隐藏，他人背包不暴露）
  const players = (playerRows || []).map((row) => toPlayerLite(row, viewerUserId))
  const me = players.find((p) => p.isMe) || null

  // 有效阶段：Phase 32 me.depth 恒 0 ⇒ effPhase === realPhase；未 join 时按 depth 0 取网格
  const myDepth = me ? me.depth : 0
  const effPhase = effectivePhase(clock.realPhase, myDepth, clock.maxPhase)

  const baseGrid = await loadGridForPhase(supabase, effPhase)

  // ── Phase 32：注入每房 physicalState / looted（按 viewer 有效阶段过滤）─────────
  // 读 br_match_room_state 全房派生态，在 buildGrid 之后于本层注入（保持 zones.buildGrid 纯函数不变）。
  // 可见性钩子：物理态仅当 state_clock <= effPhase 才暴露给该 viewer，否则回退 'intact'。
  //   P32 depth 恒 0 ⇒ effPhase === realPhase ⇒ state_clock（=事件 clock_phase <= realPhase）必 <= effPhase
  //   ⇒ vacuous（恒暴露当前态）。真正「上游看不见下游物理事件」留 Phase 33 加 depth 后激活。
  const roomStateMap = await loadRoomStates(supabase, matchId)
  const grid = baseGrid.map((g) => {
    const st = roomStateMap.get(g.roomId)
    // 可见性钩子：仅当该房 state_clock 在 viewer 有效阶段内才暴露其派生态，否则回退默认。
    //   P32 depth 0 ⇒ effPhase===realPhase ⇒ state_clock 必 <= effPhase ⇒ vacuous（恒暴露）。
    const visible = !!st && st.stateClock <= effPhase
    const physicalState = visible ? st.physicalState : 'intact'
    const looted = visible ? st.looted : false
    return { ...g, physicalState, looted }
  })

  // ── Phase 32：顶层 visibleEvents（最近 N 条「对 viewer 可见」事件，id DESC）────────
  // 先读最近事件（已 join 房名），再 filterVisible(effPhase)（§3 公式，按有效阶段参数化）。
  // P32 depth 0 ⇒ vacuous ⇒ 等价于「全部已发生事件的最近 N 条」。Phase 33 加 depth 自动收窄。
  const recent = await loadRecentEvents(supabase, matchId, RECENT_EVENTS_LIMIT, viewerUserId)
  const visibleEvents = filterVisible(recent, effPhase)

  // ── Phase 32：me 增 inventory（仅自己暴露；players[] 不含）──────────────────────
  if (me) {
    const myRow = (playerRows || []).find((r) => r.user_id === viewerUserId)
    me.inventory = Array.isArray(myRow?.inventory) ? myRow.inventory : []
  }

  const open = grid.filter((g) => g.open).length
  const aliveCount = players.filter((p) => p.alive).length

  return {
    match: {
      matchId: match.id,
      status: match.status,
      phaseSeconds: clock.phaseSeconds,
      maxPhase: clock.maxPhase,
      startedAtMs: clock.startedAtMs,
      endedAtMs: toMs(match.ended_at),
      createdAtMs: toMs(match.created_at),
    },
    clock: {
      realPhase: clock.realPhase,
      effectivePhase: effPhase,
      phaseEndsAtMs: clock.phaseEndsAtMs,
      secondsToNextPhase: clock.secondsToNextPhase,
      isEnded: clock.isEnded,
    },
    grid,
    players,
    me,
    // Phase 32 新增顶层：最近可见事件流（id DESC）。P31 字段全部保留不改。
    visibleEvents,
    counts: {
      open,
      forbidden: grid.length - open,
      alive: aliveCount,
      total: players.length,
    },
  }
}

/**
 * 列对局（见契约 clientDataShape.lobbyPage → MatchSummary[]）。
 *
 * @param {object} supabase
 * @param {object} [opts]  { status?: 'openable'|'lobby'|'active'|'ended' }（默认 openable = lobby + active）
 * @returns {Promise<Array>} MatchSummary[]
 */
export async function listMatches(supabase, opts = {}) {
  const status = opts.status || 'openable'

  let query = supabase
    .from('br_matches')
    .select('id, status, started_at, phase_seconds, max_phase, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (status === 'openable') {
    query = query.in('status', ['lobby', 'active'])
  } else if (['lobby', 'active', 'ended'].includes(status)) {
    query = query.eq('status', status)
  }
  // 其它未知 status 值 ⇒ 不过滤（全量返回）

  const { data: matches, error } = await query
  if (error) throw new Error(error.message || '读取对局列表失败')

  const rows = matches || []
  if (rows.length === 0) return []

  // 一次性聚合每局玩家数 / 存活数（避免 N 次查询）
  const ids = rows.map((m) => m.id)
  const { data: playerRows, error: plErr } = await supabase
    .from('br_match_players')
    .select('match_id, alive')
    .in('match_id', ids)

  if (plErr) throw new Error(plErr.message || '读取玩家统计失败')

  const totalByMatch = new Map()
  const aliveByMatch = new Map()
  for (const p of playerRows || []) {
    totalByMatch.set(p.match_id, (totalByMatch.get(p.match_id) || 0) + 1)
    if (p.alive !== false) aliveByMatch.set(p.match_id, (aliveByMatch.get(p.match_id) || 0) + 1)
  }

  return rows.map((m) => {
    const clock = computeClock(m)
    return {
      matchId: m.id,
      status: m.status,
      realPhase: clock.realPhase,
      maxPhase: clock.maxPhase,
      phaseSeconds: clock.phaseSeconds,
      startedAtMs: clock.startedAtMs,
      createdAtMs: toMs(m.created_at),
      playerCount: totalByMatch.get(m.id) || 0,
      aliveCount: aliveByMatch.get(m.id) || 0,
      secondsToNextPhase: clock.secondsToNextPhase,
    }
  })
}
