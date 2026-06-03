/**
 * roomItems.js — 虚拟空间BR「房间物品投放 / 库存状态」纯函数层（gamevars.br.roomInv · Phase 34）
 *
 * 设计契约 Phase 34：authored room_items（admin 在房里手摆的投放规则）→ 每局 init 时一次性按
 *   per-raid 确定性种子铺成 gamevars.br.roomInv 快照；搜索命中 loose-item 时优先从该快照取货
 *   （取到 → 发 authored 件并消耗本次搜索；取不到 → 回落现有 amount 权重程序化抽取，经济基线不破）。
 *
 * ⚠️ 纯函数、无 DB、无副作用、可单测：
 *   - placeRoomInventory(seed, roomIds, rows) → { roomInv, roomInvRefs }（铺货·确定性）
 *   - takeFromRoom(roomInv, roomId, effPhase) → 件|null（取货·就地标 taken）
 *   - resolveRef(roomInvRefs, kind, refIdx) → { itemName }|{ tierId }
 *
 * 确定性铁律：同 seed + 同 roomIds + 同 rows → 同 roomInv（所有实例算出一致），禁 Math.random。
 *   PRNG 与 forbidden.js 完全同源（xmur3 → hashSeed → mulberry32），不另起随机源。
 *
 * 紧凑性（控 gamevars.br 增量 ≤ ~3KB）：
 *   - 仅「有投放生效」的房建 key（无货房不出现）。
 *   - 每件 = 定长 3 元组 [refIdx, kind, revealPhase]；取走后 push(1) 变长度 4（taken 标记最省字节）。
 *   - 去重 ref 表 roomInvRefs.{items,tiers}（全局共享索引空间），避免每件重复存长中文道具名 / 重复 tierId。
 *   - 每房件数硬封顶 ROOM_INV_CAP（防 admin 误配巨量 / 装备爆控）。
 *
 * 越晚越肥：件仅在 effPhase >= revealPhase（= room_items.spawn_phase_min）显形（takeFromRoom 门控 件[2] <= effPhase）。
 * 一次性库存：取走标 taken（件.push(1)）随 roomInv 持久化进 gamevars.br，不再生。
 */

import { hashSeed, mulberry32 } from '@/lib/server/br/forbidden'

/**
 * 每房件数硬封顶（跨条目累计，非单条）。
 * 防 admin 在某房误配巨量投放撑爆 gamevars.br；也是装备爆控阀。
 * 与紧凑性红线（≤~3KB）配套：最坏每房 24 件 × ~11B + ref ≈ 仍远低于红线。
 */
export const ROOM_INV_CAP = 24

/**
 * 全局（per-raid 跨房）件数硬封顶 —— 与 ROOM_INV_CAP（per-房）配套的二道阀。
 * 防病态配置（如全 100 房每房塞满 24 件 = 2400 件 → ~24KB）撑爆 gamevars.br.roomInv：
 *   240 件 × ~11B + ref 表 ~0.5KB ≈ ~3KB，硬守紧凑性红线（正常配置 36-105 件，远低于此）。
 * 截断按 byRoom 稳定迭代序（SQL ORDER BY br_room_id,id）→ 确定性（所有实例同样截断）。
 */
export const GLOBAL_INV_CAP = 240

/**
 * randInt(rng, a, b) — 闭区间 [a, b] 均匀整数（rng 为 mulberry32 实例）。
 * a>b 时回退 a（防御；调用方已保证 random_min<=random_max，但二次兜底）。
 * @param {() => number} rng
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function randInt(rng, a, b) {
  const lo = Math.floor(a)
  const hi = Math.floor(b)
  if (hi <= lo) return lo
  return lo + Math.floor(rng() * (hi - lo + 1))
}

/**
 * internRef(pool, value) — 去重池查/插：已存在返回其索引，否则 push 并返回新索引。
 * 让所有房共享一张去重表（items / tiers 各一），避免重复存长名 / 重复 tierId。
 * @param {Array} pool
 * @param {string|number} value
 * @returns {number} 索引
 */
function internRef(pool, value) {
  const idx = pool.indexOf(value)
  if (idx >= 0) return idx
  pool.push(value)
  return pool.length - 1
}

/**
 * placeRoomInventory(seed, roomIds, rows) — authored room_items → roomInv 确定性铺货。
 *
 * 逻辑（确定性、纯函数）：
 *   1. roomIdSet = Set(roomIds)；只对本局实际房集铺货 —— 孤儿 br_room_id 行（指向已删/不属本局的房）自然忽略
 *      （解耦房增删：room_items.br_room_id 是软引用，不建 FK；详见 phase-34-room-items.sql 注释）。
 *   2. 仅 enabled 行（SQL 索引已 WHERE enabled + 查询带 .eq('enabled',true)，此处二次防御）；
 *      按 br_room_id 分组，组内按 row.id 升序固定顺序 → 组内序号 idx 稳定 → PRNG 锚点稳定。
 *   3. 每房每条（组内序号 idx，从 0）：
 *      - rng = mulberry32(hashSeed(seed, 'roominv:'+roomId+':'+idx))（与 forbidden.js 同源）。
 *      - 生效判定：第一抽 rng() >= random_chance ⇒ 整条不生效（continue）。
 *      - 件数 count = fixed_count + randInt(rng, random_min, random_max)。
 *      - 每件 push [refIdx, kind, revealPhase]：kind = entry_kind==='equipment_tier'?1:0；
 *        refIdx = item→intern(refs.items,item_name) / tier→intern(refs.tiers,tier_id)；revealPhase=spawn_phase_min。
 *   4. 每房件数护栏 ROOM_INV_CAP（跨条目累计）：该房累计 >= CAP 即停后续 push。
 *   5. 仅非空房写进 roomInv（空房不建 key）。
 *
 * @param {number} seed per-raid 种子（gamevars.br.seed）
 * @param {number[]} roomIds 本局实际启用房号集
 * @param {Array<object>} rows room_items 行（建议已按 br_room_id, id 升序；本函数内部仍二次排序确保稳定）
 *   行形状：{ id, br_room_id, entry_kind, item_name, tier_id, fixed_count, random_min, random_max, random_chance, spawn_phase_min, enabled? }
 * @returns {{ roomInv: Object<number, Array>, roomInvRefs: { items: string[], tiers: number[] } }}
 */
export function placeRoomInventory(seed, roomIds, rows) {
  const roomInv = {}
  const refs = { items: [], tiers: [] }

  const ids = Array.isArray(roomIds) ? roomIds : []
  const roomIdSet = new Set(ids.filter((x) => Number.isFinite(x)).map((x) => Number(x)))
  if (roomIdSet.size === 0) return { roomInv, roomInvRefs: refs }

  const allRows = Array.isArray(rows) ? rows : []

  // 仅 enabled 行 + 仅本局房集（孤儿行忽略）→ 按 br_room_id 分组
  const byRoom = new Map()
  for (const row of allRows) {
    if (!row || row.enabled === false) continue
    const rid = Number(row.br_room_id)
    if (!roomIdSet.has(rid)) continue
    if (!byRoom.has(rid)) byRoom.set(rid, [])
    byRoom.get(rid).push(row)
  }

  let total = 0 // 全局（跨房）件数累计，配合 GLOBAL_INV_CAP 二道阀
  for (const [roomId, group] of byRoom.entries()) {
    if (total >= GLOBAL_INV_CAP) break // 全局封顶：停止处理更多房（稳定迭代序 → 确定性截断）
    // 组内按 id 升序固定顺序 → idx 稳定 → PRNG 锚点稳定（确定性铁律）
    group.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0))

    const arr = []
    for (let idx = 0; idx < group.length; idx++) {
      if (arr.length >= ROOM_INV_CAP || total >= GLOBAL_INV_CAP) break // 每房 + 全局双封顶
      const row = group[idx]
      const rng = mulberry32(hashSeed(seed, 'roominv:' + roomId + ':' + idx))

      // 生效判定：第一抽决定整条是否生效
      const chance = Number.isFinite(row.random_chance) ? row.random_chance : 1
      if (rng() >= chance) continue

      // 件数 = fixed_count + U[random_min, random_max]
      const fixed = Math.max(0, Math.floor(Number(row.fixed_count) || 0))
      const rmin = Math.max(0, Math.floor(Number(row.random_min) || 0))
      const rmax = Math.max(rmin, Math.floor(Number(row.random_max) || 0))
      const count = fixed + randInt(rng, rmin, rmax)
      if (count <= 0) continue

      const kind = row.entry_kind === 'equipment_tier' ? 1 : 0
      const revealPhase = Math.max(0, Math.floor(Number(row.spawn_phase_min) || 0))
      const refIdx = kind === 1
        ? internRef(refs.tiers, Number(row.tier_id))
        : internRef(refs.items, row.item_name)

      for (let k = 0; k < count; k++) {
        if (arr.length >= ROOM_INV_CAP || total >= GLOBAL_INV_CAP) break // 每房 + 全局双封顶
        arr.push([refIdx, kind, revealPhase])
        total++
      }
    }

    if (arr.length > 0) roomInv[roomId] = arr // 仅非空房建 key
  }

  return { roomInv, roomInvRefs: refs }
}

/**
 * takeFromRoom(roomInv, roomId, effPhase) — 从某房库存取首个可取件（就地标 taken）。
 *
 * 就地变异：调用方已持有可写的 resolution.gamevars.br.roomInv（同引用），命中件 push(1) 后
 *   随 gamevars.br 持久化 → 下次搜该房跳过已取件（一次性库存，不再生）。
 *
 * 可取判据（线性扫首个满足者，O(房内件数 ≤ ROOM_INV_CAP)）：
 *   - 件.length < 4：未 taken（未取走不存第4位；取走后长度 4）。
 *   - 件[2] <= effPhase：已显形（越晚越肥；早期 effPhase 小 ⇒ 高 revealPhase 件不可见）。
 *
 * @param {Object<number, Array>} roomInv gamevars.br.roomInv（就地可写）
 * @param {number} roomId 玩家当前房号
 * @param {number} effPhase 玩家有效阶段（getBrEffectivePhase 结果，整数 ≥ 0）
 * @returns {{ refIdx: number, kind: number }|null} 取到的件引用 / 无可取 null
 */
export function takeFromRoom(roomInv, roomId, effPhase) {
  const arr = roomInv && typeof roomInv === 'object' ? roomInv[roomId] : null
  if (!Array.isArray(arr) || arr.length === 0) return null

  const ep = Number.isFinite(effPhase) ? effPhase : 0
  for (const it of arr) {
    if (!Array.isArray(it) || it.length >= 4) continue // 已 taken（长度 4）
    const reveal = Number(it[2]) || 0
    if (reveal > ep) continue // 未显形
    it.push(1) // 标 taken（就地持久化进 roomInv）
    return { refIdx: it[0], kind: it[1] }
  }
  return null
}

/**
 * resolveRef(roomInvRefs, kind, refIdx) — 把件的 (kind, refIdx) 解引用回 itemName / tierId。
 * @param {{ items: string[], tiers: number[] }} roomInvRefs gamevars.br.roomInvRefs
 * @param {number} kind 0=item / 1=equipment_tier
 * @param {number} refIdx 去重表索引
 * @returns {{ itemName: string }|{ tierId: number }}
 */
export function resolveRef(roomInvRefs, kind, refIdx) {
  const refs = roomInvRefs && typeof roomInvRefs === 'object' ? roomInvRefs : { items: [], tiers: [] }
  if (kind === 1) {
    const tiers = Array.isArray(refs.tiers) ? refs.tiers : []
    return { tierId: tiers[refIdx] }
  }
  const items = Array.isArray(refs.items) ? refs.items : []
  return { itemName: items[refIdx] }
}
