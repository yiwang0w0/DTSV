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
 * 进程级 memo：key = String(seed >>> 0) → layout（{ rooms, adj, templateMeta, roomTemplates }）。
 * 呼应 forbidden.js 的 _closePhaseCache 范式。命中后零 IO、零重算。
 * @type {Map<string, { rooms: Array, adj: Object, templateMeta: Object, roomTemplates: Object }>}
 */
const _layoutCache = new Map()

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
 *
 * @param {object} client service-role supabase 实例（绕 RLS）
 * @param {number} seed   per-raid uint32 确定性种子（派生一切的唯一输入）
 * @returns {Promise<{ rooms: Array, adj: Object, templateMeta: Object, roomTemplates: Object }>}
 */
export async function getRaidLayout(client, seed) {
  const key = String(seed >>> 0)
  const hit = _layoutCache.get(key)
  if (hit) return hit

  // 首次未命中：并发拉静态拓扑 + 模板（此后 memo，永不重读）
  const [brRooms, chamberRes] = await Promise.all([
    loadBrRooms(client), // [{ roomId, label, region, neighborIds, gridX, gridY, closePhase, enabled }]
    client.from('chamber_templates').select('*').eq('enabled', true),
  ])
  const templates = chamberRes?.data || []

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

  const layout = { rooms, adj, templateMeta, roomTemplates }
  _layoutCache.set(key, layout)
  return layout
}
