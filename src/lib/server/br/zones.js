/**
 * zones.js — 禁区表 / 物资档位「只读·按深度」读层（Phase 31）
 *
 * 设计宪法 docs/timejump-br-design.md §3 属性②：禁区表是预设镜片，深度只是"读哪一行"。
 * 本模块**只读**：给定有效阶段，从 br_zone_tables 读该阶段 100 房的 is_forbidden/loot_tier，
 * 并 join br_rooms 静态拓扑（label/region/grid/neighbor_ids/close_phase），合并成前端网格视图。
 *
 * 🚫 红线（schema 注释 / §3）：任何代码路径都不得 UPDATE br_zone_tables 的对局态。
 *   本模块不暴露任何写接口，纯 SELECT。
 *
 * 房间开放判定的**唯一权威**是 br_zone_tables[(phase, room_id)].is_forbidden；
 *   br_rooms.close_phase 仅作 tooltip / 着色辅助，不作生死判定。
 *
 * 接收 supabase 实例作首参（不在模块内自建 client），便于复用与测试。
 */

// 网格尺寸（与 schema 种子拓扑 10×10 对齐）
export const GRID_W = 10
export const GRID_H = 10

/**
 * 读 br_rooms 全量静态拓扑。
 *
 * @param {object} supabase
 * @returns {Promise<Array<{
 *   roomId:number, label:string, region:string, neighborIds:number[],
 *   gridX:number|null, gridY:number|null, closePhase:number, enabled:boolean
 * }>>}
 */
export async function loadRooms(supabase) {
  const { data, error } = await supabase
    .from('br_rooms')
    .select('room_id, label, region, neighbor_ids, grid_x, grid_y, close_phase, enabled')
    .order('room_id', { ascending: true })

  if (error) throw new Error(error.message || '读取扇区拓扑失败')

  return (data || []).map((r) => ({
    roomId: r.room_id,
    label: r.label || `扇区 ${r.room_id}`,
    region: r.region || '',
    neighborIds: Array.isArray(r.neighbor_ids) ? r.neighbor_ids : [],
    gridX: r.grid_x ?? null,
    gridY: r.grid_y ?? null,
    closePhase: Number.isFinite(r.close_phase) ? r.close_phase : 5,
    enabled: r.enabled !== false,
  }))
}

/**
 * 读某一相位的禁区/物资档（br_zone_tables WHERE phase = :phase）。
 *
 * @param {object} supabase
 * @param {number} phase  有效阶段（调用方应已钳到 [0, maxPhase]）
 * @returns {Promise<Array<{ roomId:number, isForbidden:boolean, lootTier:number }>>}
 */
export async function loadZoneForPhase(supabase, phase) {
  const p = Number.isFinite(phase) ? Math.max(0, Math.floor(phase)) : 0

  const { data, error } = await supabase
    .from('br_zone_tables')
    .select('room_id, is_forbidden, loot_tier')
    .eq('phase', p)

  if (error) throw new Error(error.message || '读取禁区表失败')

  return (data || []).map((z) => ({
    roomId: z.room_id,
    isForbidden: z.is_forbidden === true,
    lootTier: Number.isFinite(z.loot_tier) ? z.loot_tier : 1,
  }))
}

/**
 * 纯合并：每房 = 静态拓扑 + 该相位禁区/档位。
 * 缺失禁区记录的房默认按"未禁区、档位 1"处理（防御 schema 不全）。
 *
 * @param {Array} rooms      loadRooms 结果
 * @param {Array} zoneCells  loadZoneForPhase 结果
 * @returns {Array<{
 *   roomId:number, label:string, region:string, gridX:number|null, gridY:number|null,
 *   neighborIds:number[], closePhase:number, isForbidden:boolean, lootTier:number, open:boolean
 * }>}
 */
export function buildGrid(rooms, zoneCells) {
  const zoneByRoom = new Map()
  for (const z of zoneCells || []) zoneByRoom.set(z.roomId, z)

  return (rooms || []).map((room) => {
    const z = zoneByRoom.get(room.roomId)
    const isForbidden = z ? z.isForbidden : false
    const lootTier = z ? z.lootTier : 1
    return {
      roomId: room.roomId,
      label: room.label,
      region: room.region,
      gridX: room.gridX,
      gridY: room.gridY,
      neighborIds: room.neighborIds,
      closePhase: room.closePhase,
      isForbidden,
      lootTier,
      open: !isForbidden,
    }
  })
}

/**
 * 一步到位：loadRooms + loadZoneForPhase + buildGrid。
 * 并发拉拓扑与禁区表后合并；phase 由调用方钳制到 [0, maxPhase]。
 *
 * @param {object} supabase
 * @param {number} phase
 * @returns {Promise<Array>} GridRoom[]
 */
export async function loadGridForPhase(supabase, phase) {
  const [rooms, zoneCells] = await Promise.all([
    loadRooms(supabase),
    loadZoneForPhase(supabase, phase),
  ])
  return buildGrid(rooms, zoneCells)
}
