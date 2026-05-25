/**
 * Phase 24b — 商店目录 + 兑换 helper
 *
 * 三个核心动作：
 *   1. loadCatalog — 拉所有 enabled 的 catalog 行（装备 / 消耗品 / 剧情物品）+ 当前汇率
 *   2. purchaseFromCatalog — joinRoom 时把购买清单转成 initialInventory + 创建 equipment_instances
 *   3. exchangePoints — 商店内部点数互换
 */

import { getBalances, debitPoints, creditPoints, POINT_LABEL } from './points'

/**
 * 拉 shop 完整目录（catalog + exchange_rates），可选按 classId 过滤 catalog
 */
export async function loadCatalog(client, classId = null) {
  const [catalogRes, ratesRes] = await Promise.all([
    client
      .from('shop_catalog')
      .select(`
        id, entry_kind, tier_id, item_name, point_type, cost, required_class_ids, display_order,
        equipment_tiers ( id, name, rarity, base_atk, base_def, base_hp, durability_max, series_id,
                           equipment_series ( name, slot ) ),
        item_pool:item_name ( name, kind, sub_kind, heal, atk, def, effect, description )
      `)
      .eq('enabled', true)
      .order('display_order', { ascending: true }),
    client.from('shop_exchange_rates').select('*').eq('enabled', true),
  ])

  let catalog = catalogRes.data || []

  // class 过滤：required_class_ids 为空数组 = 所有 class 可见；非空时必须包含当前 classId
  if (classId != null) {
    catalog = catalog.filter(c =>
      !Array.isArray(c.required_class_ids) || c.required_class_ids.length === 0
      || c.required_class_ids.includes(classId)
    )
  }

  return {
    equipment: catalog.filter(c => c.entry_kind === 'equipment'),
    consumables: catalog.filter(c => c.entry_kind === 'consumable'),
    storyItems: catalog.filter(c => c.entry_kind === 'story_item'),
    exchangeRates: ratesRes.data || [],
  }
}

/**
 * 入场购买：把 purchaseList 转成 player 的初始 inventory + 创建本局 equipment_instances。
 *
 * @param {object} client
 * @param {string} userId
 * @param {number} roomId
 * @param {Array<{catalogId: number, qty: number}>} purchases - qty 默认 1；equipment 强制 1
 * @returns {Promise<{
 *   loadout: { probe, shield, weapon, comm },  // 4 槽装备 instance id（或 null）
 *   inventory: string[],                         // 消耗品/剧情物品名字数组（按 qty 展开）
 *   spent: Record<string, number>,               // 各类型扣的点数
 * }>}
 */
export async function purchaseFromCatalog(client, userId, roomId, purchases = []) {
  const result = {
    loadout: { probe: null, shield: null, weapon: null, comm: null },
    inventory: [],
    spent: { high_equip_pt: 0, low_equip_pt: 0, item_pt: 0 },
  }
  if (!Array.isArray(purchases) || purchases.length === 0) return result

  // 1. 拉所有相关 catalog 行
  const catalogIds = [...new Set(purchases.map(p => Number(p.catalogId)).filter(Boolean))]
  if (catalogIds.length === 0) return result

  const { data: catalogRows } = await client
    .from('shop_catalog')
    .select(`
      id, entry_kind, tier_id, item_name, point_type, cost, enabled,
      equipment_tiers ( id, name, rarity, durability_max, series_id, equipment_series ( slot ) )
    `)
    .in('id', catalogIds)

  const byId = new Map((catalogRows || []).map(r => [r.id, r]))

  // 2. 计算总扣点
  const totalCost = { high_equip_pt: 0, low_equip_pt: 0, item_pt: 0 }
  const expandedPurchases = []
  for (const p of purchases) {
    const row = byId.get(Number(p.catalogId))
    if (!row || !row.enabled) throw new Error(`商店条目 #${p.catalogId} 不存在或已下架`)
    const qty = Math.max(1, Math.floor(Number(p.qty) || 1))
    // equipment 强制 qty=1（每个 tier 进 raid 1 件）
    const realQty = row.entry_kind === 'equipment' ? 1 : qty
    totalCost[row.point_type] = (totalCost[row.point_type] || 0) + row.cost * realQty
    expandedPurchases.push({ row, qty: realQty })
  }

  // 3. 扣点（不足直接抛错）
  const debits = Object.entries(totalCost)
    .filter(([, amt]) => amt > 0)
    .map(([type, amount]) => ({ type, amount }))
  if (debits.length > 0) {
    await debitPoints(client, userId, debits)
  }
  for (const [type, amt] of Object.entries(totalCost)) {
    result.spent[type] = amt
  }

  // 4. 实例化购买
  for (const { row, qty } of expandedPurchases) {
    if (row.entry_kind === 'equipment') {
      // 创建 equipment_instances 行
      const slot = row.equipment_tiers?.equipment_series?.slot
      const durMax = Number(row.equipment_tiers?.durability_max) || 100
      const { data: created, error } = await client
        .from('equipment_instances')
        .insert({
          tier_id: row.tier_id,
          owner_id: userId,
          room_id: roomId,
          durability_current: durMax,  // 新买装备满耐久
          bonus_atk: 0,
          bonus_def: 0,
          is_equipped: true,
          equipped_slot: slot,
        })
        .select('id')
        .single()
      if (error) {
        throw new Error(`创建装备实例失败: ${error.message}`)
      }
      if (slot && ['probe', 'shield', 'weapon', 'comm'].includes(slot)) {
        result.loadout[slot] = created.id
      }
    } else {
      // consumable / story_item：按 qty 重复加入 inventory
      for (let i = 0; i < qty; i++) {
        result.inventory.push(row.item_name)
      }
    }
  }

  return result
}

/**
 * 点数兑换：消耗 from_type × from_amount × times，得到 to_type × to_amount × times
 */
export async function exchangePoints(client, userId, rateId, times = 1) {
  const T = Math.max(1, Math.floor(Number(times) || 1))
  const { data: rate, error } = await client
    .from('shop_exchange_rates')
    .select('*')
    .eq('id', rateId)
    .eq('enabled', true)
    .maybeSingle()
  if (error) throw new Error(`兑换汇率查询失败: ${error.message}`)
  if (!rate) throw new Error('兑换汇率不存在或已禁用')

  const need = rate.from_amount * T
  const give = rate.to_amount * T

  await debitPoints(client, userId, [{ type: rate.from_type, amount: need }])
  await creditPoints(client, userId, [{ type: rate.to_type, amount: give }])

  return {
    debited: { type: rate.from_type, amount: need, label: POINT_LABEL[rate.from_type] },
    credited: { type: rate.to_type, amount: give, label: POINT_LABEL[rate.to_type] },
  }
}
