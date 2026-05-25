/**
 * Phase 24b — 4 类点数经济 helper
 *
 * 4 种点数：
 *   high_equip_pt — rare/epic/legendary/mythic 装备折算
 *   low_equip_pt  — common/uncommon 装备折算
 *   item_pt       — consumable + 剧情物品折算
 *   class_pt      — raid 里程碑奖励，入场保底刷高级职业（Phase 24c）
 *
 * 撤离流程：extract 时 convertExtractToPoints + creditPoints；equipment_instances 直接 DELETE
 * 入场流程：joinRoom 时按 catalog 购买，debitPoints + 创建新 equipment_instances
 */

export const POINT_TYPES = ['high_equip_pt', 'low_equip_pt', 'item_pt', 'class_pt']

// 装备 rarity → 基础点数 + 目标 point_type
const EQUIP_RARITY_VALUE = {
  common:    { points: 5,  type: 'low_equip_pt' },
  uncommon:  { points: 12, type: 'low_equip_pt' },
  rare:      { points: 8,  type: 'high_equip_pt' },
  epic:      { points: 18, type: 'high_equip_pt' },
  legendary: { points: 35, type: 'high_equip_pt' },
  mythic:    { points: 60, type: 'high_equip_pt' },
}

// item_pool.kind → item_pt 单价（per quantity unit）
const ITEM_KIND_VALUE = {
  consumable:    3,
  tech_fragment: 8,
  platform_part: 4,
  omega_matter:  15,
}

/**
 * 查 user 全部点数余额。
 * @returns {Record<'high_equip_pt'|'low_equip_pt'|'item_pt'|'class_pt', number>}
 */
export async function getBalances(client, userId) {
  const out = { high_equip_pt: 0, low_equip_pt: 0, item_pt: 0, class_pt: 0 }
  if (!userId) return out
  const { data } = await client
    .from('player_points')
    .select('point_type, balance')
    .eq('user_id', userId)
  for (const row of (data || [])) {
    if (POINT_TYPES.includes(row.point_type)) out[row.point_type] = Number(row.balance) || 0
  }
  return out
}

/**
 * 增加点数余额（不验证，纯 add）。deltas 数组所有项必须为正。
 * @param {Array<{type: string, amount: number}>} deltas
 */
export async function creditPoints(client, userId, deltas) {
  if (!userId || !Array.isArray(deltas) || deltas.length === 0) return
  const cleaned = deltas.filter(d => d?.type && POINT_TYPES.includes(d.type) && Number(d.amount) > 0)
  if (cleaned.length === 0) return

  // 一行一行 upsert（避免一次性 upsert 多行时余额累加冲突）
  for (const d of cleaned) {
    const { data: existing } = await client
      .from('player_points')
      .select('balance')
      .eq('user_id', userId)
      .eq('point_type', d.type)
      .maybeSingle()
    const newBalance = (existing?.balance || 0) + Math.round(Number(d.amount))
    await client
      .from('player_points')
      .upsert(
        { user_id: userId, point_type: d.type, balance: newBalance, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,point_type' },
      )
  }
}

/**
 * 扣减点数余额。如果某项余额不足，抛错回滚（balance >= 0 由 CHECK 约束守护）。
 * @param {Array<{type: string, amount: number}>} deltas — amount 是要扣的量（正数）
 * @throws {Error} 余额不足
 */
export async function debitPoints(client, userId, deltas) {
  if (!userId) throw new Error('debitPoints: 缺少 userId')
  const cleaned = (deltas || []).filter(d => d?.type && POINT_TYPES.includes(d.type) && Number(d.amount) > 0)
  if (cleaned.length === 0) return

  // 1. 预校验余额
  const balances = await getBalances(client, userId)
  for (const d of cleaned) {
    const need = Math.round(Number(d.amount))
    if ((balances[d.type] || 0) < need) {
      throw new Error(`${POINT_LABEL[d.type] || d.type} 余额不足（需要 ${need}，当前 ${balances[d.type] || 0}）`)
    }
  }

  // 2. 逐项扣减
  for (const d of cleaned) {
    const need = Math.round(Number(d.amount))
    const newBalance = (balances[d.type] || 0) - need
    await client
      .from('player_points')
      .upsert(
        { user_id: userId, point_type: d.type, balance: newBalance, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,point_type' },
      )
    balances[d.type] = newBalance // 同步本地，供同一调用内多次扣减
  }
}

export const POINT_LABEL = {
  high_equip_pt: '高级装备点',
  low_equip_pt: '普通装备点',
  item_pt:      '道具点',
  class_pt:     '高级职业点',
}

/**
 * 撤离时把 raid 内的装备 + 物品折算为 4 类点数（不写库，纯计算）。
 *
 * 装备：room_id = 当前 room 的 equipment_instances JOIN equipment_tiers
 *   common → low_equip_pt × 5；uncommon → ×12；rare → high × 8；epic → ×18；legendary → ×35；mythic → ×60
 *   + bonus_atk × 2 + bonus_def × 2（都加到 low_equip_pt 池）
 *   × durability ratio clamp [0.3, 1.0]
 *
 * 物品：从 player.inventory（数组里每个名字 = 1 个 unit）+ item_pool.kind 折算
 *   consumable → item_pt × 3 per unit
 *   tech_fragment → item_pt × 8 per unit
 *   platform_part → item_pt × 4 per unit
 *   omega_matter  → item_pt × 15 per unit
 *
 * @param {object} client - supabase admin client
 * @param {string} userId
 * @param {object} room - rooms 记录（含 id）
 * @param {object} player - PlayerState（含 inventory[]）
 * @param {string[]} [inventoryOverride] - 用于 extract 中扣除 exit_cost 后的 inventoryAfter
 * @returns {Promise<{
 *   credits: Array<{type, amount}>,
 *   summary: { equipCount: number, itemCount: number, perType: Record<string, number> },
 *   destroyedEquipIds: string[],   // 应在 extract 后从 DB 删除的 equipment_instance id
 *   destroyedItems: string[],       // 应从 player.inventory 中清空的物品（即 inventoryOverride 全部）
 * }>}
 */
export async function convertExtractToPoints(client, userId, room, player, inventoryOverride = null) {
  const credits = []
  const summary = { equipCount: 0, itemCount: 0, perType: {} }
  const destroyedEquipIds = []

  // ── 1. 装备折算（owner=user, room_id=current room）──
  const { data: equips } = await client
    .from('equipment_instances')
    .select('id, tier_id, bonus_atk, bonus_def, durability_current, equipment_tiers!inner(rarity, durability_max)')
    .eq('owner_id', userId)
    .eq('room_id', room.id)

  let equipPtsByType = { high_equip_pt: 0, low_equip_pt: 0 }
  for (const e of (equips || [])) {
    destroyedEquipIds.push(e.id)
    summary.equipCount += 1
    const rarity = e.equipment_tiers?.rarity || 'common'
    const cfg = EQUIP_RARITY_VALUE[rarity] || EQUIP_RARITY_VALUE.common
    const durMax = Number(e.equipment_tiers?.durability_max) || 0
    const durCur = Number(e.durability_current) || 0
    const durRatio = durMax > 0 ? Math.max(0.3, Math.min(1.0, durCur / durMax)) : 1.0
    const baseVal = cfg.points + (Number(e.bonus_atk) || 0) * 2 + (Number(e.bonus_def) || 0) * 2
    const points = Math.max(1, Math.round(baseVal * durRatio))
    equipPtsByType[cfg.type] += points
  }
  for (const [type, amount] of Object.entries(equipPtsByType)) {
    if (amount > 0) {
      credits.push({ type, amount })
      summary.perType[type] = (summary.perType[type] || 0) + amount
    }
  }

  // ── 2. 物品折算（inventoryOverride 或 player.inventory）──
  const inv = Array.isArray(inventoryOverride) ? inventoryOverride : (player?.inventory || [])
  if (inv.length > 0) {
    // 按物品名聚合数量
    const counts = inv.reduce((acc, name) => {
      acc.set(name, (acc.get(name) || 0) + 1)
      return acc
    }, new Map())
    const names = Array.from(counts.keys())

    const { data: pool } = await client
      .from('item_pool')
      .select('name, kind')
      .in('name', names)
    const kindByName = new Map((pool || []).map(p => [p.name, p.kind]))

    let itemPt = 0
    for (const [name, qty] of counts) {
      const kind = kindByName.get(name)
      const perUnit = ITEM_KIND_VALUE[kind]
      if (!perUnit) continue // 未知 kind 或不可折算（清算认证等结局奖励），跳过
      itemPt += perUnit * qty
      summary.itemCount += qty
    }
    if (itemPt > 0) {
      credits.push({ type: 'item_pt', amount: itemPt })
      summary.perType.item_pt = (summary.perType.item_pt || 0) + itemPt
    }
  }

  return {
    credits,
    summary,
    destroyedEquipIds,
    destroyedItems: inv,
  }
}

/**
 * 撤离里程碑给 class_pt 奖励：
 *   +1 / 成功撤离（本函数返回的 1）
 * 残片解码 lv3 +2 / Ω-结局 +5 在 discoverFragment / endings.js 内独立调用 creditPoints
 */
export function classPtForExtract() {
  return 1
}
