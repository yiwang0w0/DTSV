/**
 * raidLayout.js — BR 房层「按 seed 派生」纯派生 + 进程级 memo（gamevars 瘦身核心）
 *
 * 背景：gamevars.br 此前内嵌 rooms（18.7KB 静态拓扑）+ adj（邻接图）+ templateMeta（10.9KB 伪 chamber 表），
 *   每个动作整段写 rooms 表并经 Supabase realtime 广播 → 每动作 ~40-50KB 负载，免费服务器明显拖慢。
 *   这三块要么完全静态（br_rooms 所有对局相同），要么可由 seed 确定性派生（sampleRoomTemplates）。
 *   本模块把它们从 gamevars 移出：服务端首动作付一次 DB 读，之后按 seed 进程级 memo，命中 O(1) 无 IO。
 *
 * 设计呼应 forbidden.js 的 _closePhaseCache：同 seed 同结果（br_rooms + chamber_templates(enabled)
 *   静态、sampleRoomTemplates 确定性），故 memo 安全。serverless 冷启各自重建，可接受。
 *
 * ⚠️ 本模块供 game 路径（gameActions.js）使用，配 service-role client（绕 RLS）。
 *    独立 /br 路径（br_matches/br_match_events）不碰 gamevars.br，与本模块无关。
 */

import { sampleRoomTemplates } from './roomTemplates.js'
import { loadRooms as loadBrRooms } from './zones.js'

/**
 * 进程级 memo：key = `${seed}:${topoVersion}:${roomCount}` → layout
 *   （{ rooms, adj, templateMeta, roomTemplates, topoVersion }）。
 * 呼应 forbidden.js 的 _closePhaseCache 范式。命中后零 IO、零重算。
 * key 含 topoVersion+roomCount：admin 改 br_rooms 后版本变 → 新局 miss → 重读新拓扑（在飞局走 gamevars.br 快照不受影响）。
 * @type {Map<string, { rooms: Array, adj: Object, templateMeta: Object, roomTemplates: Object, topoVersion: number }>}
 */
const _layoutCache = new Map()

/**
 * computeTopoVersion(brRooms) — 本局冻结的拓扑版本指纹（毫秒整数）。
 *   = max(Date.parse(r.updatedAt)) over all rooms（INSERT/UPDATE 都 bump updated_at 触发器）。
 * 纯 DELETE 不改其它行 updated_at，但「房变少」会改行数 → memo key 另带 roomCount 覆盖（见 getRaidLayout key）。
 *
 * 防御：updatedAt 缺失（D 的 zones.js select 尚未落 / 旧 schema 无列）→ 该行计 0；全缺 → 返回 0
 *   （memo key 仍含 roomCount，行集变化仍能令新局 miss；100 格回归零影响）。
 *
 * @param {Array<{updatedAt?:string}>} brRooms loadRooms 结果
 * @returns {number} maxUpdatedAtMs（毫秒整数；无可解析时间戳时为 0）
 */
export function computeTopoVersion(brRooms) {
  let maxMs = 0
  for (const r of Array.isArray(brRooms) ? brRooms : []) {
    const ms = Date.parse(r?.updatedAt)
    if (Number.isFinite(ms) && ms > maxMs) maxMs = ms
  }
  return maxMs
}

/**
 * getRaidLayout(client, seed) — 按 seed 派生整局的「静态/可派生」布局，进程级 memo。
 *
 * 首次（未命中）：并发拉 br_rooms 静态全表 + chamber_templates(enabled) 全表 →
 *   sampleRoomTemplates(同 seed 同结果) 得 { roomTemplates, templateMeta } →
 *   组 rooms 数组（精简字段）+ adj 邻接图（roomId → neighborIds）。
 * 命中：直接返回缓存对象（O(1)，无 DB 读）。
 *
 * 返回结构与旧内嵌 gamevars.br 的三字段语义一致：
 *   rooms         [{ roomId, label, region, gridX, gridY, neighborIds }]（静态拓扑）
 *   adj           { [roomId]: [neighborIds] }（邻接图，moveToRoom 校验）
 *   templateMeta  { [templateId]: 伪 chamber 字段子集 }（getChamberForPlayer 等拼伪 chamber）
 *   roomTemplates { [roomId]: templateId }（采样结果；gamevars.br.roomTemplates 仍保留同值，此处供 topology 等复用）
 *   topoVersion   int 本次派生时刻 br_rooms 的版本指纹（maxUpdatedAtMs；initBrRoomLayer 写进 gamevars.br 快照）
 *
 * memo key = `${seed}:${topoVersion}:${roomCount}` —— 编辑 br_rooms 后版本/行数变 → 新局 miss 重读；
 *   在飞局已把 topoVersion 快照进 gamevars.br，且致死/移动读 closePhases 快照不重算 → 不受影响。
 *
 * @param {object} client service-role supabase 实例（绕 RLS）
 * @param {number} seed   per-raid uint32 确定性种子（派生一切的唯一输入）
 * @returns {Promise<{ rooms: Array, adj: Object, templateMeta: Object, roomTemplates: Object, topoVersion: number }>}
 */
export async function getRaidLayout(client, seed) {
  // 首次未命中：并发拉静态拓扑 + 模板（此后 memo，永不重读）。
  //   注意：必须先读 brRooms 才能算 topoVersion/roomCount 组 key → 这里先拉、再算 key、再查 memo。
  //   memo 的价值是省「sampleRoomTemplates 重算 + adj/rooms 重组」（非省 DB 读本身）；同 seed+版本命中即返缓存对象。
  const [brRooms, chamberRes] = await Promise.all([
    loadBrRooms(client), // [{ roomId, label, region, neighborIds, gridX, gridY, closePhase, enabled, updatedAt? }]
    client.from('chamber_templates').select('*').eq('enabled', true),
  ])
  const templates = chamberRes?.data || []

  const topoVersion = computeTopoVersion(brRooms)
  const roomCount = Array.isArray(brRooms) ? brRooms.length : 0
  const key = String(seed >>> 0) + ':' + topoVersion + ':' + roomCount
  const hit = _layoutCache.get(key)
  if (hit) return hit

  // 同 seed 同结果（确定性采样）；与 initBrRoomLayer 写入 gamevars.br.roomTemplates 完全一致
  const { roomTemplates, templateMeta } = sampleRoomTemplates(brRooms, templates, seed)

  // 精简静态拓扑数组（去掉 closePhase/enabled —— closePhase 客户端从 gamevars.br.closePhases 读）
  const rooms = (Array.isArray(brRooms) ? brRooms : []).map((r) => ({
    roomId: r.roomId,
    label: r.label,
    region: r.region,
    gridX: r.gridX,
    gridY: r.gridY,
    neighborIds: Array.isArray(r.neighborIds) ? r.neighborIds : [],
  }))

  // 邻接图：roomId → neighborIds（moveToRoom 邻接校验，避免每次查 DB）
  const adj = Object.fromEntries(rooms.map((r) => [r.roomId, r.neighborIds]))

  const layout = { rooms, adj, templateMeta, roomTemplates, topoVersion }
  _layoutCache.set(key, layout)
  return layout
}
