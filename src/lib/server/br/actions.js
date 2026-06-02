/**
 * actions.js — 虚拟空间BR 四动作处理（move / search / bomb / repair）·Phase 32
 *
 * 设计宪法 docs/timejump-br-design.md §3 + Phase 32 契约 apiAdditions。
 * 全部**服务端 service-role 校验合法性**（无客户端可信输入决定生死）：
 *   - move   作用相邻房（toRoomId ∈ 当前房 neighbor_ids，且目标在玩家有效阶段开放）
 *   - search / bomb / repair 作用**当前房**（无需传 roomId，服务端从 br_match_players.room_id 取）
 *
 * 每个动作 = 一个逻辑事务：
 *   读 br_matches（computeClock 锁 realPhase，全程复用避免跨阶段边界漂移）
 *   → 读 br_match_players 校验在局 + alive（抛 {code} 供 route 映射 HTTP）
 *   → 各自校验与写：先做带条件的原子写（loot 锁 / 物理态 CAS），再/同时 append 事件
 *   → move 改 player.room_id；loot 追加 player.inventory。
 *
 * 错误以 e.code 抛出（route.js 映射）：
 *   not_found / ended / not_in_match / dead / not_neighbor / forbidden_zone。
 *
 * ⚠️ Phase 32 depth 恒 0 ⇒ effectivePhase === realPhase。**不自创 jumper/depth 语义**（留 P33）。
 * ⚠️ 修复（repair）只作用属性①物理态，绝不触碰 br_zone_tables 的系统禁区（§3 红线）。
 *
 * 接收 supabase（service-role）+ user 作首参，照 match.js/events.js 风格（纯封装、可测）。
 */

import { computeClock, effectivePhase } from './clock'
import { appendEvent, foldOrUpsertRoomState } from './events'

/** 抛带 code 的语义错误（route 映射 HTTP） */
function fail(code, message) {
  const e = new Error(message)
  e.code = code
  return e
}

/**
 * 读 match + 校验玩家在局且 alive，返回上下文（match / clock / realPhase / effPhase / player）。
 * 公共前置，四动作复用。
 *
 * @returns {Promise<{ match, clock, realPhase, effPhase, player }>}
 */
async function loadContext(supabase, user, matchId) {
  const { data: match, error: matchErr } = await supabase
    .from('br_matches')
    .select('id, status, started_at, phase_seconds, max_phase')
    .eq('id', matchId)
    .maybeSingle()
  if (matchErr) throw new Error(matchErr.message || '读取对局失败')
  if (!match) throw fail('not_found', '对局不存在')
  if (match.status === 'ended') throw fail('ended', '对局已结束')

  // realPhase 锁一次，全程复用（事件 append 与 room_state 折叠用同一相位）
  const clock = computeClock(match)
  const realPhase = clock.realPhase

  const { data: player, error: plErr } = await supabase
    .from('br_match_players')
    .select('match_id, user_id, room_id, depth, alive, inventory')
    .eq('match_id', matchId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (plErr) throw new Error(plErr.message || '读取玩家态失败')
  if (!player) throw fail('not_in_match', '你尚未加入该对局')
  if (player.alive === false) throw fail('dead', '你已阵亡，无法行动')

  // 有效阶段：P32 depth 恒 0 ⇒ effPhase === realPhase（参数化复用 clock.js，留 P33 钩子）
  const depth = Number.isFinite(player.depth) ? player.depth : 0
  const effPhase = effectivePhase(realPhase, depth, clock.maxPhase)

  return { match, clock, realPhase, effPhase, player }
}

/** 取当前房 id（无则 400） */
function requireRoomId(player) {
  const roomId = player.room_id
  if (roomId == null) throw fail('not_in_match', '你当前不在任何扇区')
  return roomId
}

/**
 * 按有效阶段读某房是否禁区（br_zone_tables[(effPhase, roomId)].is_forbidden）。
 * 缺记录默认按「未禁区」处理（与 zones.buildGrid 防御一致）。
 *
 * @returns {Promise<boolean>} true=禁区
 */
async function isRoomForbidden(supabase, effPhase, roomId) {
  const { data, error } = await supabase
    .from('br_zone_tables')
    .select('is_forbidden')
    .eq('phase', effPhase)
    .eq('room_id', roomId)
    .maybeSingle()
  if (error) throw new Error(error.message || '读取禁区表失败')
  return data?.is_forbidden === true
}

/**
 * 占位物资生成器（Phase 32）。按 loot_tier 给一件物资 {itemId, itemName, tier}。
 * P32 不接 item_pool（留 Phase 36 经济接驳）；itemId 服务端生成，确保不进 SQL 拼接路径。
 */
function generateLoot(tier, roomId) {
  const t = Number.isFinite(tier) ? Math.max(1, Math.min(5, Math.floor(tier))) : 1
  const TIER_NAME = { 1: '常规补给', 2: '改良配件', 3: '稀有组件', 4: '精密模块', 5: '高阶造物' }
  const rand = Math.random().toString(36).slice(2, 8)
  return {
    itemId: `br-loot-${roomId}-${Date.now().toString(36)}-${rand}`,
    itemName: `${TIER_NAME[t] || '物资'} · T${t}`,
    tier: t,
  }
}

/**
 * action='move' —— 移动到相邻且开放的扇区。
 *
 * 校验：① 在局+alive（loadContext）② toRoomId ∈ 当前房 neighbor_ids ③ toRoomId 在有效阶段开放。
 * 通过 → 更新 br_match_players.room_id=toRoomId → append move 事件 {fromRoomId,toRoomId}（room_id 列=toRoomId）。
 *
 * @returns {Promise<{ roomId:number }>}
 */
export async function movePlayer(supabase, user, matchId, toRoomId) {
  const target = Math.floor(Number(toRoomId))
  if (!Number.isFinite(target)) throw fail('not_neighbor', '目标扇区无效')

  const ctx = await loadContext(supabase, user, matchId)
  const fromRoomId = ctx.player.room_id ?? null

  // 读当前房邻接表（合法性以 DB 为准）
  if (fromRoomId == null) throw fail('not_in_match', '你当前不在任何扇区')
  const { data: room, error: rErr } = await supabase
    .from('br_rooms')
    .select('room_id, neighbor_ids')
    .eq('room_id', fromRoomId)
    .maybeSingle()
  if (rErr) throw new Error(rErr.message || '读取扇区拓扑失败')
  const neighbors = Array.isArray(room?.neighbor_ids) ? room.neighbor_ids : []
  if (!neighbors.includes(target)) throw fail('not_neighbor', '目标扇区不相邻')

  // 目标在玩家有效阶段开放（effPhase=realPhase+depth，P32 depth=0）
  const forbidden = await isRoomForbidden(supabase, ctx.effPhase, target)
  if (forbidden) throw fail('forbidden_zone', '目标扇区为禁区')

  // 通过：先写 player 位置，再 append 事件（事件归属目的地房）
  const { error: updErr } = await supabase
    .from('br_match_players')
    .update({ room_id: target })
    .eq('match_id', matchId)
    .eq('user_id', user.id)
  if (updErr) throw new Error(updErr.message || '移动失败')

  await appendEvent(supabase, ctx.match, {
    eventType: 'move',
    roomId: target, // 事件归属目的地房
    actorId: user.id,
    clockPhase: ctx.realPhase,
    payload: { fromRoomId, toRoomId: target },
  })

  console.log(`[br] move match=${matchId} user=${user.id} ${fromRoomId}→${target} phase=${ctx.realPhase}`)
  return { roomId: target }
}

/**
 * action='search' —— 搜刮当前房物资（物资守恒：每房一次性，先到先得）。
 *
 * 抢到 → 按该房 loot_tier 生成一件物资 push 进 inventory，append loot 事件，返回 looted:true。
 * 没抢到（已被刮空）→ 不 append、不改 inventory，返回 looted:false（**守恒语义，非错误**）。
 *
 * 定序（**先锁后 append**）：先跑物资锁（原子先到先锁）→ 锁成功才发物资 + append loot 事件。
 *   理由：append-only 日志不可删，若先 append 再锁、锁败就会留下「无效 loot 事件」污染日志/可见性；
 *   先锁则保证「有 loot 事件 ⟺ 确有一份物资被取走」。锁失败（已被刮空/并发败北）直接返回 looted:false。
 *   物资锁的原子性靠 lockLoot 内「ensure→读→CAS(last_event_seq) guarded update」，不依赖事件 seq。
 *
 * @returns {Promise<{ looted:boolean, item?:{itemId,itemName,tier} }>}
 */
export async function searchRoom(supabase, user, matchId) {
  const ctx = await loadContext(supabase, user, matchId)
  const roomId = requireRoomId(ctx.player)

  // 先抢锁（原子先到先锁；seq 此刻未知，传 0 占位 —— lockLoot 内部用 last_event_seq CAS，不依赖此值）
  const lockRes = await foldOrUpsertRoomState(supabase, matchId, roomId, {
    eventType: 'loot',
    roomId,
    clockPhase: ctx.realPhase,
    seq: 0,
  })
  if (!lockRes.applied) {
    // 二次搜刮为空：守恒语义，不报错、不写事件
    console.log(`[br] search EMPTY match=${matchId} user=${user.id} room=${roomId}`)
    return { looted: false }
  }

  // 抢到：读该房 loot_tier 生成物资
  const { data: zone, error: zErr } = await supabase
    .from('br_zone_tables')
    .select('loot_tier')
    .eq('phase', ctx.effPhase)
    .eq('room_id', roomId)
    .maybeSingle()
  if (zErr) throw new Error(zErr.message || '读取物资档失败')
  const tier = Number.isFinite(zone?.loot_tier) ? zone.loot_tier : 1
  const item = generateLoot(tier, roomId)

  // 追加进 inventory（读现有 → push → 写回；inventory 仅 owner 自己写，碰撞风险低）
  const inv = Array.isArray(ctx.player.inventory) ? ctx.player.inventory : []
  const { error: invErr } = await supabase
    .from('br_match_players')
    .update({ inventory: [...inv, item] })
    .eq('match_id', matchId)
    .eq('user_id', user.id)
  if (invErr) throw new Error(invErr.message || '写入背包失败')

  // append loot 事件（tier=该房当时档位）
  await appendEvent(supabase, ctx.match, {
    eventType: 'loot',
    roomId,
    actorId: user.id,
    clockPhase: ctx.realPhase,
    payload: { itemId: item.itemId, itemName: item.itemName, tier: item.tier },
  })

  console.log(`[br] search LOOT match=${matchId} user=${user.id} room=${roomId} tier=${tier}`)
  return { looted: true, item }
}

/**
 * 物理动作公共体（bomb/repair 共用）：append 事件 → foldOrUpsertRoomState 设物理态。
 * 物理态覆盖按 clock 守门（clock_phase>=state_clock 才生效）；applied=false 表示更晚戳已占据。
 *
 * @param {string} eventType  'bomb' | 'repair'
 * @param {string} toState    'bombed' | 'intact'
 * @returns {Promise<{ roomId:number, physicalState:string, applied:boolean }>}
 */
async function physicalAction(supabase, user, matchId, eventType, toState) {
  const ctx = await loadContext(supabase, user, matchId)
  const roomId = requireRoomId(ctx.player)

  // prevState：覆盖前物理态（审计用）；读 room_state 现态（无行视为 intact）
  const { data: cur } = await supabase
    .from('br_match_room_state')
    .select('physical_state')
    .eq('match_id', matchId)
    .eq('room_id', roomId)
    .maybeSingle()
  const prevState = cur?.physical_state || 'intact'

  // append 事件（先拿 seq 作 room_state CAS 冗余令牌）
  const payload =
    eventType === 'repair' ? { prevState, toState: 'intact' } : { prevState }
  const ev = await appendEvent(supabase, ctx.match, {
    eventType,
    roomId,
    actorId: user.id,
    clockPhase: ctx.realPhase,
    payload,
  })

  // 折叠派生物理态（clock 守门覆盖）
  const fold = await foldOrUpsertRoomState(supabase, matchId, roomId, {
    eventType,
    roomId,
    clockPhase: ctx.realPhase,
    seq: ev.seq,
    toState,
  })

  console.log(
    `[br] ${eventType} match=${matchId} user=${user.id} room=${roomId} phase=${ctx.realPhase} applied=${fold.applied}`,
  )
  return { roomId, physicalState: toState, applied: fold.applied }
}

/**
 * action='bomb' —— 炸毁当前房（物理态 → 'bombed'，clock 守门覆盖）。
 * @returns {Promise<{ roomId:number, physicalState:'bombed', applied:boolean }>}
 */
export async function bombRoom(supabase, user, matchId) {
  return physicalAction(supabase, user, matchId, 'bomb', 'bombed')
}

/**
 * action='repair' —— 修复当前房（物理态 → 'intact'，clock 守门覆盖）。
 * 绝不触碰 br_zone_tables 的系统禁区（§3）：修复只作用属性①物理态。
 * @returns {Promise<{ roomId:number, physicalState:'intact', applied:boolean }>}
 */
export async function repairRoom(supabase, user, matchId) {
  return physicalAction(supabase, user, matchId, 'repair', 'intact')
}
