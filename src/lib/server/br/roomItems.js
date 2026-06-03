/**
 * roomItems.js — 虚拟空间BR「房间物品投放 / 库存状态」纯函数层（gamevars.br.roomInv · Phase 34 → Phase 36）
 *
 * 设计契约 Phase 36（道具为中心 · 全图分布，替代 Phase 34 每房独立概率模型）：
 *   一条 placement_rule = 一件道具/装备 + 一组候选房（带权重）+ 数量区间 [count_min, count_max]
 *   + 每房上限（本期固定 1）+ 几禁（spawn_phase_min）+ 互斥组（exclusion_group · 可空）+ 启用。
 *   每局 init 时 allocateRoomInventory 一次性按 per-raid 确定性种子在「候选房集」上做加权无放回抽样，
 *   把全图投放铺成 gamevars.br.roomInv 快照；搜索命中 loose-item 时优先从该快照取货
 *   （取到 → 发 authored 件并消耗本次搜索；取不到 → 回落现有 amount 权重程序化抽取，经济基线不破）。
 *
 *   4 情形：①N选1（候选多·数量1）②N选K（数量K·每房1→K个不同房）③加权倾向（候选权重）
 *           ④互斥（同组道具同房不共存·各自必去不同候选房·配置足够时两者都保证出现）。
 *
 * ⚠️ 纯函数、无 DB、无副作用、可单测：
 *   - allocateRoomInventory(seed, roomIds, rules, ruleRooms) → { roomInv, roomInvRefs }（全图分配·确定性 · Phase 36）
 *   - weightedSampleNoReplace(rng, items, k) → items 子集（确定性加权无放回抽样 · Phase 36）
 *   - placeRoomInventory(seed, roomIds, rows) → { roomInv, roomInvRefs }（@deprecated · Phase 34 每房独立概率，保留供回退）
 *   - takeFromRoom(roomInv, roomId, effPhase) → 件|null（取货·就地标 taken）
 *   - resolveRef(roomInvRefs, kind, refIdx) → { itemName }|{ tierId }
 *
 * 确定性铁律：同 seed + 同输入（roomIds + rules + ruleRooms，各按确定序）→ 同 roomInv（所有实例算出一致），禁 Math.random。
 *   PRNG 与 forbidden.js 完全同源（xmur3 → hashSeed → mulberry32），不另起随机源；每规则独立流
 *   mulberry32(hashSeed(seed, 'placement:'+rule.id))（增删别的规则不扰动本规则分配）。
 *
 * 紧凑性（控 gamevars.br 增量 ≤ ~3KB）：
 *   - 仅「有投放生效」的房建 key（无货房不出现）。
 *   - 每件 = 定长 3 元组 [refIdx, kind, revealPhase]；取走后 push(1) 变长度 4（taken 标记最省字节）。
 *   - 去重 ref 表 roomInvRefs.{items,tiers}（全局共享索引空间），避免每件重复存长中文道具名 / 重复 tierId。
 *   - 全局件数硬封顶 GLOBAL_INV_CAP（防病态配置撑爆；ROOM_INV_CAP 仍是 Phase 34 路径的 per-房阀）。
 *
 * 越晚越肥：件仅在 effPhase >= revealPhase（= rule.spawn_phase_min）显形（takeFromRoom 门控 件[2] <= effPhase）。
 * 一次性库存：取走标 taken（件.push(1)）随 roomInv 持久化进 gamevars.br，不再生。
 *
 * roomInv/roomInvRefs 格式与 Phase 34 完全一致（[refIdx,kind,revealPhase]·intern ref·taken=push(1)）
 *   → takeFromRoom/resolveRef/resolveSearchAction 取货链零改动。
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
 * @deprecated Phase 36 — 被 allocateRoomInventory（道具中心·全图分布）取代；本函数实现 Phase 34
 *   「每房独立概率」模型，运行期不再被调用（gameActions.initBrRoomLayer 已改调 allocateRoomInventory）。
 *   保留不删：① 便于回退到 Phase 34 模型；② 既有单测/历史快照参照。输出格式与 allocateRoomInventory
 *   字节级同构（[refIdx,kind,revealPhase]·intern ref），故 takeFromRoom/resolveRef 对两者通用。
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
 * weightedSampleNoReplace(rng, items, k) — 确定性加权无放回抽样（Phase 36）。
 *
 * 从 items 抽 min(k, items.length) 个**不同**元素，按各元素 weight 倾斜（权重大者更易先被抽中），
 * 抽中即从池中移除（无放回 → 不会重复抽同一元素）。全程用传入 rng，无内部随机源。
 *
 * 确定性铁律：同 rng 序 + 同 items（同序）→ 同结果。
 *   ⇒ **调用方必须保证 items 已按确定序排列**（本期 allocateRoomInventory 按 br_room_id 升序）。
 *
 * 实现细节：
 *   - pool = items.slice()（浅拷贝，不改入参）；逐轮按「剩余池总权重」做轮盘选择，命中后 splice 移除。
 *   - 兜底 pick = pool.length-1：防浮点尾差使 r 略 ≥ Σweight 时落空（取末位，等价边界归并）。
 *   - total <= 0 提前 break（防御；CHECK weight>0 已保证候选权重恒正，正常不触发）。
 *
 * @param {() => number} rng mulberry32 实例（[0,1) 流）
 * @param {Array<{weight:number}>} items 候选（每项带 weight>0 · 含任意 payload · 必须已确定序）
 * @param {number} k 期望抽取个数（实际抽 min(k, items.length)）
 * @returns {Array} 抽中的元素（原对象引用 · 长度 = min(k, items.length)）
 */
export function weightedSampleNoReplace(rng, items, k) {
  const pool = Array.isArray(items) ? items.slice() : []
  const out = []
  const n = Math.min(Math.max(0, Math.floor(Number(k) || 0)), pool.length)
  for (let s = 0; s < n; s++) {
    let total = 0
    for (let i = 0; i < pool.length; i++) total += Number(pool[i].weight) || 0
    if (total <= 0) break // 防御：剩余池总权重非正（CHECK weight>0 已排除）

    const r = rng() * total
    let acc = 0
    let pick = pool.length - 1 // 兜底取末位（防浮点尾差落空）
    for (let i = 0; i < pool.length; i++) {
      acc += Number(pool[i].weight) || 0
      if (r < acc) { pick = i; break }
    }
    out.push(pool[pick])
    pool.splice(pick, 1) // 无放回
  }
  return out
}

/**
 * allocateRoomInventory(seed, roomIds, rules, ruleRooms) — 全图投放分配（Phase 36 · 确定性纯函数）。
 *
 * 道具为中心：逐条 enabled 规则，在其候选房集（带权重，过滤到本局房集）上做加权无放回抽样，
 * 把 [count_min, count_max] 件投到不同候选房（每房 ≤1 件），互斥组内的规则相互避让候选房。
 *
 * 算法（与契约 §2 逐条对应）：
 *   ① candidatesByRule：按 rule_id 分组 ruleRooms → 过滤到 roomIdSet → 仅 weight>0 → 组内按 br_room_id 升序（确定性锚点）。
 *   ② roomGroups：Map<roomId, Set<exclusion_group>>（某房已被哪些互斥组占用）；规则按 id 升序（确定性）。
 *   ③ 逐 enabled 规则：
 *        rng = mulberry32(hashSeed(seed, 'placement:'+rule.id))（与 forbidden.js 同源·每规则独立流）。
 *        count = count_min + floor(rng()*(count_max-count_min+1))（闭区间 [min,max]）。
 *        eligible = 候选中（若 rule.exclusion_group）剔除「已含该组」的房。
 *        chosen = weightedSampleNoReplace(rng, eligible, min(count, eligible.length))（确定性加权无放回）。
 *        每 chosen 房 push [refIdx, kind, revealPhase=spawn_phase_min]；有 exclusion_group 则标记该房占用本组。
 *        受 GLOBAL_INV_CAP 跨房硬封顶（globalCount 二道阀）。
 *   ④ chosen < count（候选不足）→ 欠铺（运行期尽力·静默；编辑器配置期已警告）。
 *   ⑤ roomInv/roomInvRefs 格式与 Phase 34 完全一致 → 取货链零改。
 *
 * 语义保证：①N选1（count=1→抽1房）②N选K（count=K·每房1→K个不同房）③加权（按 weight 倾斜）
 *   ④互斥（同组规则按 id 序逐落·后者 eligible 已剔前者占用房 → 不同房；配置足够时各自都铺）。
 *
 * 确定性：'placement:'+rule.id 每规则独立 rng 流（增删别的规则不扰动本规则）；同 seed + 同 rules + 同 ruleRooms → 同 roomInv。
 *
 * @param {number} seed per-raid 种子（gamevars.br.seed）
 * @param {number[]} roomIds 本局实际启用房号集
 * @param {Array<object>} rules placement_rules 行：{ id, entry_kind, item_name, tier_id, count_min, count_max, max_per_room, spawn_phase_min, exclusion_group, enabled? }
 * @param {Array<object>} ruleRooms placement_rule_rooms 行：{ rule_id, br_room_id, weight }
 * @returns {{ roomInv: Object<number, Array>, roomInvRefs: { items: string[], tiers: number[] } }}
 */
export function allocateRoomInventory(seed, roomIds, rules, ruleRooms) {
  const roomInv = {}
  const refs = { items: [], tiers: [] }

  const ids = Array.isArray(roomIds) ? roomIds : []
  const roomIdSet = new Set(ids.filter((x) => Number.isFinite(x)).map((x) => Number(x)))
  if (roomIdSet.size === 0) return { roomInv, roomInvRefs: refs }

  // ① 按 rule_id 分组候选 · 过滤本局房集 · 仅 weight>0 · 组内按 br_room_id 升序（确定性锚点）
  const candidatesByRule = new Map()
  for (const rr of (Array.isArray(ruleRooms) ? ruleRooms : [])) {
    if (!rr) continue
    const rid = Number(rr.br_room_id)
    if (!roomIdSet.has(rid)) continue
    const w = Number(rr.weight)
    if (!(w > 0)) continue
    const ruleId = Number(rr.rule_id)
    if (!candidatesByRule.has(ruleId)) candidatesByRule.set(ruleId, [])
    candidatesByRule.get(ruleId).push({ br_room_id: rid, weight: w })
  }
  for (const list of candidatesByRule.values()) {
    list.sort((a, b) => a.br_room_id - b.br_room_id)
  }

  // ② 每房已被哪些互斥组占用 ; 规则按 id 升序（确定性）
  const roomGroups = new Map() // roomId → Set<exclusion_group>
  const enabledRules = (Array.isArray(rules) ? rules : [])
    .filter((r) => r && r.enabled !== false)
    .sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0))
  let total = 0 // 全局件数累计（GLOBAL_INV_CAP 二道阀）

  // ③ 逐规则
  for (const rule of enabledRules) {
    if (total >= GLOBAL_INV_CAP) break
    const cands = candidatesByRule.get(Number(rule.id)) || []
    if (cands.length === 0) continue // 无候选 → 欠铺（运行期静默；编辑器配置期已警告）

    const rng = mulberry32(hashSeed(seed, 'placement:' + rule.id)) // 与 forbidden.js 同源·每规则独立流
    const cMin = Math.max(0, Math.floor(Number(rule.count_min) || 0))
    const cMax = Math.max(cMin, Math.floor(Number(rule.count_max) || 0))
    const count = cMin + Math.floor(rng() * (cMax - cMin + 1)) // 闭区间 [cMin, cMax]
    if (count <= 0) continue

    const grp = rule.exclusion_group || null // '' 视同无组（归一）
    const eligible = grp
      ? cands.filter((c) => {
          const s = roomGroups.get(c.br_room_id)
          return !(s && s.has(grp))
        })
      : cands
    const take = Math.min(count, eligible.length) // 候选不足 → 欠铺（尽力）
    if (take <= 0) continue

    const chosen = weightedSampleNoReplace(rng, eligible, take) // 确定性加权无放回（eligible 已 br_room_id 升序）

    const kind = rule.entry_kind === 'equipment_tier' ? 1 : 0
    const revealPhase = Math.max(0, Math.floor(Number(rule.spawn_phase_min) || 0))
    const refIdx = kind === 1
      ? internRef(refs.tiers, Number(rule.tier_id))
      : internRef(refs.items, rule.item_name)

    for (const c of chosen) {
      if (total >= GLOBAL_INV_CAP) break
      if (!roomInv[c.br_room_id]) roomInv[c.br_room_id] = []
      roomInv[c.br_room_id].push([refIdx, kind, revealPhase]) // 格式与 Phase 34 完全一致
      total++
      if (grp) { // 互斥：标记该房占用本组（同组后续规则不再选此房）
        let s = roomGroups.get(c.br_room_id)
        if (!s) { s = new Set(); roomGroups.set(c.br_room_id, s) }
        s.add(grp)
      }
    }
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
