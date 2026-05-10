/**
 * stash.js — 玩家账户库服务端模块
 *
 * 数据模型：
 *   * 普通道具：player_stash 表，按 (user_id, item_name) 唯一索引堆叠 quantity
 *   * 装备实例：equipment_instances 表，约定 room_id IS NULL 表示"在库中"
 *   * 容量：profiles.stash_capacity 列（默认 40 格）
 *   * 占用 = 独立道具种类数 + 库中装备实例数
 *
 * 主要 API：
 *   loadStash(client, userId)
 *     → { items, equipments, capacity, used, slotsLeft }
 *
 *   addItemsToStash(client, userId, [{name, quantity}], { allowOverflow=false })
 *     → 把若干道具加入库（自动堆叠）。返回 { added, skipped }（容量超限时 skipped 列出未入库的项）
 *
 *   removeItemsFromStash(client, userId, [{name, quantity}])
 *     → 扣库；不足时抛错
 *
 *   moveEquipmentToStash(client, userId, [instanceIds])
 *     → 把当前 room 中的装备实例转回库（room_id := NULL；同时 is_equipped := false）
 *
 *   consumeForLoadout(client, userId, roomId, { items, equipmentInstanceIds })
 *     → 进 raid 装载：从库中扣除指定道具，把指定装备实例 room_id 改为 raid roomId
 *     → 返回服务端确认的 inventory[] 字符串数组（用于写入 gamevars.players[uid].inventory）
 */

const STACK_NAME_KEY = 'item_name'

// ── 读取库 ─────────────────────────────────────
export async function loadStash(client, userId) {
  if (!userId) throw new Error('缺少 userId')

  const [{ data: stashRows }, { data: equipRows }, { data: profile }] = await Promise.all([
    client.from('player_stash')
      .select('id, item_name, quantity, updated_at')
      .eq('user_id', userId)
      .order('item_name'),
    client.from('equipment_instances')
      .select('*, tier:equipment_tiers(*, passive:passive_skills(*), series:equipment_series(slot,name))')
      .eq('owner_id', userId)
      .is('room_id', null)
      .order('acquired_at', { ascending: false }),
    client.from('profiles')
      .select('stash_capacity')
      .eq('id', userId)
      .maybeSingle(),
  ])

  const items = (stashRows || []).map(r => ({
    id: r.id,
    name: r.item_name,
    quantity: r.quantity,
    updatedAt: r.updated_at,
  }))
  const equipments = equipRows || []
  const capacity = profile?.stash_capacity ?? 40
  const used = items.length + equipments.length

  return { items, equipments, capacity, used, slotsLeft: Math.max(0, capacity - used) }
}

// ── 加入道具（按名字堆叠） ──────────────────────
export async function addItemsToStash(client, userId, additions, { allowOverflow = false } = {}) {
  if (!userId) throw new Error('缺少 userId')
  const merged = mergeNameQuantity(additions)
  if (merged.length === 0) return { added: [], skipped: [] }

  const { data: existing } = await client
    .from('player_stash')
    .select('id, item_name, quantity')
    .eq('user_id', userId)
    .in('item_name', merged.map(it => it.name))

  const existingMap = new Map((existing || []).map(r => [r.item_name, r]))

  // 新增 vs 已有
  const newItems = merged.filter(it => !existingMap.has(it.name))
  const updates  = merged.filter(it => existingMap.has(it.name))

  // 容量检查：仅新增的会增加 slot
  if (!allowOverflow && newItems.length > 0) {
    const stash = await loadStash(client, userId)
    const willAdd = newItems.length
    if (stash.slotsLeft < willAdd) {
      const overflow = willAdd - stash.slotsLeft
      const accepted = newItems.slice(0, stash.slotsLeft)
      const rejected = newItems.slice(stash.slotsLeft)
      // 接受的入库
      if (accepted.length > 0) {
        await client.from('player_stash').insert(
          accepted.map(it => ({ user_id: userId, item_name: it.name, quantity: it.quantity })),
        )
      }
      // 已有的更新
      await Promise.all(updates.map(it => {
        const cur = existingMap.get(it.name)
        return client.from('player_stash').update({ quantity: cur.quantity + it.quantity, updated_at: new Date().toISOString() }).eq('id', cur.id)
      }))
      return { added: [...accepted, ...updates], skipped: rejected, overflow }
    }
  }

  if (newItems.length > 0) {
    await client.from('player_stash').insert(
      newItems.map(it => ({ user_id: userId, item_name: it.name, quantity: it.quantity })),
    )
  }
  await Promise.all(updates.map(it => {
    const cur = existingMap.get(it.name)
    return client.from('player_stash').update({ quantity: cur.quantity + it.quantity, updated_at: new Date().toISOString() }).eq('id', cur.id)
  }))

  return { added: merged, skipped: [], overflow: 0 }
}

// ── 扣库（不足时抛错） ──────────────────────────
export async function removeItemsFromStash(client, userId, removals) {
  if (!userId) throw new Error('缺少 userId')
  const merged = mergeNameQuantity(removals)
  if (merged.length === 0) return

  const { data: rows } = await client
    .from('player_stash')
    .select('id, item_name, quantity')
    .eq('user_id', userId)
    .in('item_name', merged.map(it => it.name))

  const map = new Map((rows || []).map(r => [r.item_name, r]))

  // 校验
  for (const it of merged) {
    const row = map.get(it.name)
    if (!row || row.quantity < it.quantity) {
      throw new Error(`库存不足：${it.name}（需要 ${it.quantity}，剩余 ${row?.quantity ?? 0}）`)
    }
  }

  // 扣减或删除
  const toDelete = []
  const toUpdate = []
  for (const it of merged) {
    const row = map.get(it.name)
    const next = row.quantity - it.quantity
    if (next === 0) toDelete.push(row.id)
    else toUpdate.push({ id: row.id, quantity: next })
  }

  if (toDelete.length > 0) {
    await client.from('player_stash').delete().in('id', toDelete)
  }
  await Promise.all(toUpdate.map(u =>
    client.from('player_stash').update({ quantity: u.quantity, updated_at: new Date().toISOString() }).eq('id', u.id),
  ))
}

// ── 把装备实例转回库（room_id := NULL） ──────────
export async function moveEquipmentToStash(client, userId, instanceIds) {
  if (!instanceIds || instanceIds.length === 0) return
  // 仅修改属于该 user 的实例，避免越权
  await client.from('equipment_instances')
    .update({ room_id: null, is_equipped: false, equipped_slot: null })
    .in('id', instanceIds)
    .eq('owner_id', userId)
}

// ── 装载：把库中道具+装备移入 raid ───────────────
export async function consumeForLoadout(client, userId, roomId, { items = [], equipmentInstanceIds = [] }) {
  if (!userId) throw new Error('缺少 userId')
  if (!roomId) throw new Error('缺少 roomId')

  // 1. 装备实例：校验属于本人且当前在库（room_id IS NULL）
  if (equipmentInstanceIds.length > 0) {
    const { data: instances } = await client
      .from('equipment_instances')
      .select('id, owner_id, room_id')
      .in('id', equipmentInstanceIds)
      .eq('owner_id', userId)

    if ((instances?.length || 0) !== equipmentInstanceIds.length) {
      throw new Error('部分装备不存在或不属于你')
    }
    const inOtherRoom = instances.filter(it => it.room_id !== null)
    if (inOtherRoom.length > 0) {
      throw new Error(`有装备已在其他对局使用：${inOtherRoom.map(it => it.id).join(', ')}`)
    }

    await client.from('equipment_instances')
      .update({ room_id: roomId, is_equipped: false, equipped_slot: null })
      .in('id', equipmentInstanceIds)
  }

  // 2. 普通道具：扣库
  if (items.length > 0) {
    await removeItemsFromStash(client, userId, items)
  }

  // 3. 返回 inventory[] 字符串数组（按数量展开，用于 gamevars.players[uid].inventory）
  const inventory = []
  for (const it of items) {
    for (let i = 0; i < it.quantity; i++) inventory.push(it.name)
  }
  return { inventory, equipmentInstanceIds }
}

// ── 工具：合并相同名字的入参 ─────────────────────
function mergeNameQuantity(arr) {
  if (!Array.isArray(arr)) return []
  const map = new Map()
  for (const it of arr) {
    if (!it?.name) continue
    const q = Number(it.quantity) || 0
    if (q <= 0) continue
    map.set(it.name, (map.get(it.name) || 0) + q)
  }
  return Array.from(map, ([name, quantity]) => ({ name, quantity }))
}

// ── 内部常量 ────────────────────────────────────
export const STASH_DEFAULT_CAPACITY = 40
