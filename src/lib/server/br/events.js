/**
 * events.js — 虚拟空间BR 事件层（属性① 可写·全局）·Phase 32
 *
 * 设计宪法 docs/timejump-br-design.md §3：
 *   - br_match_events 是**唯一可改写世界的层**（append-only 日志，id BIGSERIAL = 全局唯一定序）。
 *   - br_match_room_state 是「读快缓存」：由事件按 (clock_phase ASC, id ASC) 折叠出的房态，
 *     真相永远是事件日志。本阶段在动作事务内**增量**更新该行（等价于重放折叠）。
 *
 * 本模块「纯封装」：接收 supabase 实例作首参（不自建 client），照 clock.js/zones.js/match.js 风格。
 *
 * ⚠️ Phase 32 可见性是 vacuous（depth 恒 0 ⇒ 有效阶段 === 真实阶段，见 filterVisible 注释）。
 *    过滤器按 effectivePhase **参数化**实现 —— Phase 33 加 depth 后无需改本文件，
 *    jumper 的「有效阶段 > 真实阶段」会自动让其看见下游事件。
 *    **本阶段严禁自创任何 jumper/depth 语义或分支**（留 Phase 33）。
 *
 * 原子性策略（Supabase JS 无显式多语句事务，exec_sql 仅能跑 SELECT 不能 UPDATE）：
 *   用「乐观并发（CAS）」实现守恒不被并发击穿 —— 以 last_event_seq 作版本令牌，
 *   读现态 → 带 last_event_seq 守门的 guarded UPDATE → 0 行受影响视为并发失败、有界重试。
 *   这与现有 gameActions.js 的 VersionConflictError 重试模式一脉相承。
 */

import { computeClock } from './clock'

/** 事件流默认条数（getMatchState 取最近 N 条可见事件） */
export const RECENT_EVENTS_LIMIT = 30

/** 物理态 CAS / 物资锁的有界重试次数（并发碰撞极少，2 次足够收敛） */
const CAS_RETRIES = 4

/** 把 timestamptz / ISO / Date 安全折算成毫秒整数；无效 ⇒ null */
function toMs(ts) {
  if (ts == null) return null
  const ms = new Date(ts).getTime()
  return Number.isFinite(ms) ? ms : null
}

/** 安全取非负整数（防御 NaN/负数） */
function safeInt(n, fallback = 0) {
  const v = Math.floor(Number(n))
  return Number.isFinite(v) ? v : fallback
}

/**
 * 统计某 match 已有事件数（= 新事件的 seq，冗余便于回放/分片）。
 * id BIGSERIAL 才是全局定序权威；seq 仅作 match 内序号。
 *
 * @param {object} supabase
 * @param {number} matchId
 * @returns {Promise<number>}
 */
async function countMatchEvents(supabase, matchId) {
  const { count, error } = await supabase
    .from('br_match_events')
    .select('id', { count: 'exact', head: true })
    .eq('match_id', matchId)
  if (error) throw new Error(error.message || '读取事件计数失败')
  return Number.isFinite(count) ? count : 0
}

/**
 * 追加一条事件到 br_match_events（append-only）。
 *
 * clock_phase 取**动作落库瞬间的真实阶段** computeClock(match).realPhase
 *   —— 不是 viewer 有效阶段（务必）。调用方通常已在动作入口锁好 match + realPhase，
 *   可经 opts.clockPhase 直接传入避免重复 computeClock（跨阶段边界一致性）。
 *
 * @param {object} supabase  service-role client
 * @param {object} match     br_matches 行（含 status/started_at/phase_seconds/max_phase）
 * @param {object} ev        { eventType, roomId, actorId, payload, targetId?, clockPhase? }
 * @returns {Promise<{ id:number, seq:number, clockPhase:number }>}
 */
export async function appendEvent(supabase, match, ev) {
  const matchId = match.id
  // clock_phase：优先用调用方锁好的真实阶段，否则现算（兜底）
  const clockPhase =
    ev.clockPhase != null ? safeInt(ev.clockPhase, 0) : computeClock(match).realPhase
  const seq = await countMatchEvents(supabase, matchId)

  const row = {
    match_id: matchId,
    seq,
    clock_phase: clockPhase,
    event_type: ev.eventType,
    room_id: ev.roomId ?? null,
    actor_id: ev.actorId ?? null,
    target_id: ev.targetId ?? null, // P32 四动作均不涉及目标玩家 ⇒ 恒 null
    payload: ev.payload && typeof ev.payload === 'object' ? ev.payload : {},
  }

  const { data, error } = await supabase
    .from('br_match_events')
    .insert(row)
    .select('id, seq, clock_phase')
    .single()

  if (error) throw new Error(error.message || '写入事件失败')

  return { id: data.id, seq: data.seq, clockPhase: data.clock_phase }
}

/**
 * 确保某房的 room_state 行存在（默认 physical_state='intact', loot_remaining={available:true}）。
 * INSERT ... ON CONFLICT DO NOTHING（幂等，并发安全）。
 *
 * 注：schema 默认 loot_remaining='{}'、state_clock=0；本函数显式写入语义初值：
 *   - loot_remaining={available:true} 表示「该房尚有一份物资」（与 zone loot_tier 解耦；
 *     tier 只决定发出物资的档位/品质，available 只管「有没有」）。
 *   - state_clock 用 -1 哨兵表示「尚无任何物理事件」，使 clock_phase>=state_clock 在 phase0 也成立。
 *
 * @param {object} supabase
 * @param {number} matchId
 * @param {number} roomId
 */
export async function ensureRoomStateRow(supabase, matchId, roomId) {
  const { error } = await supabase
    .from('br_match_room_state')
    .upsert(
      {
        match_id: matchId,
        room_id: roomId,
        physical_state: 'intact',
        state_clock: -1, // 哨兵：尚无物理事件
        loot_remaining: { available: true },
        last_event_seq: 0,
      },
      { onConflict: 'match_id,room_id', ignoreDuplicates: true },
    )
  if (error) throw new Error(error.message || '初始化房态失败')
}

/** 读单行 room_state（不存在返回 null） */
async function readRoomState(supabase, matchId, roomId) {
  const { data, error } = await supabase
    .from('br_match_room_state')
    .select('physical_state, state_clock, loot_remaining, last_event_seq')
    .eq('match_id', matchId)
    .eq('room_id', roomId)
    .maybeSingle()
  if (error) throw new Error(error.message || '读取房态失败')
  return data || null
}

/**
 * 物资守恒锁（loot 事件触发）—— 「先到先得 + 只减不增」。
 *
 * 语义（eventModel B.2）：每房一次性。loot_remaining.available：首次 true，被刮后 false。
 * 原子性：以 last_event_seq 作 CAS 令牌的 guarded UPDATE 实现单赢家先到先锁
 *   （Supabase .eq 不能过滤 JSONB 路径，故不能直接写条件 UPDATE；改用「读 available + CAS last_event_seq」）。
 *   - available 已 false ⇒ 直接返回 {applied:false}（二次搜刮为空，守恒语义，非错误）。
 *   - available true ⇒ guarded UPDATE（.eq last_event_seq=读到的旧值）；0 行受影响 = 并发被抢 → 重试。
 * ⚠️ 守恒只减不增：任何路径不得把 available 由 false 改回 true。
 *
 * @returns {Promise<{ applied:boolean }>} applied=true 表示本次抢到这一份物资
 */
async function lockLoot(supabase, matchId, roomId, newSeq) {
  await ensureRoomStateRow(supabase, matchId, roomId)

  for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
    const cur = await readRoomState(supabase, matchId, roomId)
    if (!cur) {
      // 理论不会发生（刚 ensure 过）；兜底再 ensure 一轮
      await ensureRoomStateRow(supabase, matchId, roomId)
      continue
    }
    const available = cur.loot_remaining?.available !== false
    if (!available) return { applied: false } // 已被刮空

    const prevSeq = safeInt(cur.last_event_seq, 0)
    const { data, error } = await supabase
      .from('br_match_room_state')
      .update({ loot_remaining: { available: false }, last_event_seq: newSeq })
      .eq('match_id', matchId)
      .eq('room_id', roomId)
      .eq('last_event_seq', prevSeq) // CAS：仅当无人在我读后改过该行才落
      .select('room_id')
    if (error) throw new Error(error.message || '锁定物资失败')
    if (data && data.length > 0) return { applied: true } // 抢到
    // 0 行 ⇒ 并发被改，重读重试
  }
  // 多次 CAS 均失败：保守视为没抢到（不误发物资，守恒优先）
  return { applied: false }
}

/**
 * 物理态折叠（bomb/repair 事件触发）—— LAST-WRITE-WINS by clock。
 *
 * 语义（eventModel B.1）：覆盖条件 = event.clock_phase >= 现有 state_clock
 *   （>= 而非 >：同阶段内后到动作覆盖先到，与「同戳按 id 升序、后者胜」一致 ——
 *    按时间顺序到达的同 clock_phase 事件，后到的 id 必然更大）。
 *   event.clock_phase < state_clock ⇒ 丢弃物理变更（更晚时钟戳已占据），但事件本身已 append。
 *   ⇒「repair 用更晚 clock_phase 盖 bomb」「bomb 盖 repair」均靠此式自然成立。
 *
 * 原子性：以 last_event_seq 作 CAS 令牌；clock 比较在应用层做（读 state_clock 后判）。
 *
 * @param {string} toState  目标物理态（'bombed' | 'intact'，由动作给定，白名单）
 * @returns {Promise<{ applied:boolean }>} applied=true 表示物理态确被覆盖
 */
async function foldPhysicalState(supabase, matchId, roomId, clockPhase, newSeq, toState) {
  await ensureRoomStateRow(supabase, matchId, roomId)

  for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
    const cur = await readRoomState(supabase, matchId, roomId)
    if (!cur) {
      await ensureRoomStateRow(supabase, matchId, roomId)
      continue
    }
    const stateClock = safeInt(cur.state_clock, -1)
    // 更晚时钟戳已占据 ⇒ 前写不得回写（事件日志已保留，仅派生态不动）
    if (clockPhase < stateClock) return { applied: false }

    const prevSeq = safeInt(cur.last_event_seq, 0)
    const { data, error } = await supabase
      .from('br_match_room_state')
      .update({ physical_state: toState, state_clock: clockPhase, last_event_seq: newSeq })
      .eq('match_id', matchId)
      .eq('room_id', roomId)
      .eq('last_event_seq', prevSeq) // CAS
      .select('room_id')
    if (error) throw new Error(error.message || '更新物理态失败')
    if (data && data.length > 0) return { applied: true }
    // 0 行 ⇒ 并发改动，重读重试
  }
  return { applied: false }
}

/**
 * 派生房态增量更新统一入口（按事件类型分派 B 节折叠规则）。
 *   - loot              → lockLoot（守恒先到先锁；返回 applied=是否抢到）
 *   - bomb/repair       → foldPhysicalState（clock 覆盖；返回 applied=是否覆盖）
 *   - move 及其它        → 不触碰 room_state（move/loot 不动物理态；bomb/repair 不动物资）
 *
 * 各动作只触碰自己那一维，避免互相覆盖。
 *
 * @param {object} event  { eventType, roomId, clockPhase, seq, toState? }
 * @returns {Promise<{ applied:boolean }>}
 */
export async function foldOrUpsertRoomState(supabase, matchId, roomId, event) {
  const type = event?.eventType
  const clockPhase = safeInt(event?.clockPhase, 0)
  const seq = safeInt(event?.seq, 0)

  if (type === 'loot') {
    return lockLoot(supabase, matchId, roomId, seq)
  }
  if (type === 'bomb') {
    return foldPhysicalState(supabase, matchId, roomId, clockPhase, seq, 'bombed')
  }
  if (type === 'repair') {
    // 修复只作用属性①物理态，把房设回 intact；绝不触碰 br_zone_tables（§3 系统禁区红线）
    return foldPhysicalState(supabase, matchId, roomId, clockPhase, seq, 'intact')
  }
  // move / 其它：不改派生房态
  return { applied: false }
}

/**
 * 读某 match 全房派生态，建 roomId → {physicalState, stateClock, looted} Map。
 * 给 match.js 注入 grid 用。looted = loot_remaining.available === false。
 *
 * @param {object} supabase
 * @param {number} matchId
 * @returns {Promise<Map<number, { physicalState:string, stateClock:number, looted:boolean }>>}
 */
export async function loadRoomStates(supabase, matchId) {
  const { data, error } = await supabase
    .from('br_match_room_state')
    .select('room_id, physical_state, state_clock, loot_remaining')
    .eq('match_id', matchId)
  if (error) throw new Error(error.message || '读取房态列表失败')

  const map = new Map()
  for (const r of data || []) {
    map.set(r.room_id, {
      physicalState: r.physical_state || 'intact',
      stateClock: safeInt(r.state_clock, -1),
      looted: r.loot_remaining?.available === false,
    })
  }
  return map
}

/**
 * 可见性过滤（设计宪法 §3 唯一判据）：
 *   可见(viewer, event) ⟺ event.clock_phase <= effectivePhaseOf(viewer)
 *
 * **必须按 effectivePhase 参数化**（签名收 viewerEffectivePhase，不硬编码 realPhase / 不省略过滤）。
 *
 * Phase 32 depth 恒 0 ⇒ viewerEffectivePhase === realPhase ⇒ 所有已 append 事件的
 *   clock_phase 必 <= realPhase（事件戳就是落库时的 realPhase，时钟单调不减）
 *   ⇒ 过滤对所有 viewer 等价于「看见全部已发生事件」（vacuous filter）。
 *
 * Phase 33 加 depth 后：jumper 的有效阶段 > 真实阶段，会看见 clock_phase∈(realPhase, effPhase] 的
 *   下游事件，而低 depth 玩家看不见 → 「上游看不见下游」**在 P33 自动激活**，本文件无需改。
 *
 * @param {Array} events                e[].clockPhase 必须存在
 * @param {number} viewerEffectivePhase
 * @returns {Array} 过滤后的事件（保持入参顺序）
 */
export function filterVisible(events, viewerEffectivePhase) {
  const eff = safeInt(viewerEffectivePhase, 0)
  return (events || []).filter((e) => safeInt(e?.clockPhase, 0) <= eff)
}

/**
 * 读最近事件并映射成 visibleEvents 形状（不含可见性过滤，由调用方 filterVisible）。
 * 按 id DESC（最新在前）取最近 limit 条；join br_rooms 取 label 便于前端直显。
 *
 * 注：room_id 为事件归属房（move 事件归属目的地房）；roomLabel 来自 br_rooms。
 *
 * @param {object} supabase
 * @param {number} matchId
 * @param {number} [limit=RECENT_EVENTS_LIMIT]
 * @param {string} [viewerUserId]  用于标 isMine（actorId===viewer）
 * @returns {Promise<Array>} VisibleEvent[]（id DESC）
 */
export async function loadRecentEvents(supabase, matchId, limit = RECENT_EVENTS_LIMIT, viewerUserId = null) {
  const lim = Math.max(1, safeInt(limit, RECENT_EVENTS_LIMIT))

  const { data: events, error } = await supabase
    .from('br_match_events')
    .select('id, seq, clock_phase, event_type, room_id, actor_id, payload, created_at')
    .eq('match_id', matchId)
    .order('id', { ascending: false })
    .limit(lim)
  if (error) throw new Error(error.message || '读取事件流失败')

  const rows = events || []
  if (rows.length === 0) return []

  // 一次性 join 房名（避免 N 次查询）
  const roomIds = [...new Set(rows.map((e) => e.room_id).filter((x) => x != null))]
  const labelByRoom = new Map()
  if (roomIds.length > 0) {
    const { data: rooms, error: rErr } = await supabase
      .from('br_rooms')
      .select('room_id, label')
      .in('room_id', roomIds)
    if (rErr) throw new Error(rErr.message || '读取房名失败')
    for (const r of rooms || []) labelByRoom.set(r.room_id, r.label || `扇区 ${r.room_id}`)
  }

  return rows.map((e) => ({
    id: e.id,
    seq: e.seq,
    clockPhase: safeInt(e.clock_phase, 0),
    type: e.event_type,
    roomId: e.room_id ?? null,
    roomLabel: e.room_id != null ? labelByRoom.get(e.room_id) || `扇区 ${e.room_id}` : null,
    actorId: e.actor_id ?? null,
    isMine: viewerUserId != null && e.actor_id === viewerUserId,
    payload: e.payload && typeof e.payload === 'object' ? e.payload : {},
    atMs: toMs(e.created_at),
  }))
}
