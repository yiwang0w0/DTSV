/**
 * npcPlacement.js — 虚拟空间BR「敌人投放 / 遭遇库存」纯函数层（gamevars.br.roomNpcs · Phase 38 / Phase B）
 *
 * 设计契约 Phase 38（敌人为中心 · 全图分布，与 Phase 36 房间道具投放 `roomItems.js` 字节级同构）：
 *   一条 npc_placement_rule = 一个 NPC（npc_pool.id） + 一组候选房（带权重）+ 全图只数区间 [count_min, count_max]
 *   + 单房上限（max_per_room · 本期固定 1）+ 几禁（spawn_phase_min）+ 互斥组（exclusion_group · 可空）+ 启用。
 *   每局 init 时 allocateRoomNpcs 一次性按 per-raid 确定性种子在「候选房集」上做加权无放回抽样，
 *   把全图投放铺成 gamevars.br.roomNpcs 快照；搜索命中 NPC 时优先从该快照取一只 authored 敌人
 *   （取到 → materialize 走 Phase A resolveNpcCombatProfile/normalizeNpcInstance 并消耗本次遭遇；
 *    取不到 → 回落现有程序化 spawn，NPC 仍照常出现 · 零功能回归）。
 *
 * ⚠️ 纯函数、无 DB、无副作用、可单测：
 *   - allocateRoomNpcs(seed, roomIds, rules, ruleRooms) → roomNpcs（全图分配·确定性 · Phase 38）
 *   - takeNpcFromRoom(roomNpcs, roomId, effPhase) → npcId|null（取一只·就地标 taken）
 *   复用（不另起随机源）：weightedSampleNoReplace（roomItems.js 导出）+ hashSeed/mulberry32（forbidden.js）。
 *
 * 确定性铁律：同 seed + 同输入（roomIds + rules + ruleRooms，各按确定序）→ 同 roomNpcs（所有实例算出一致），禁 Math.random。
 *   PRNG 与 forbidden.js 完全同源（xmur3 → hashSeed → mulberry32），不另起随机源；每规则独立流
 *   mulberry32(hashSeed(seed, 'npcplace:'+rule.id))（增删别的规则不扰动本规则分配）。
 *   ← 与 roomItems.allocateRoomInventory 唯一差异：前缀 'placement:' → 'npcplace:'（两套快照各自独立确定性流）。
 *
 * 紧凑性（控 gamevars.br 增量）：
 *   - 仅「有投放生效」的房建 key（无敌房不出现）。
 *   - 每项 = 定长 2 元组 [npcId, revealPhase]；取走后 push(1) 变长度 3（taken 标记最省字节）。
 *   - **无 ref 去重表**（区别于 roomItems 的 roomInvRefs）：npcId 是小整数，直存即可，不必 intern。
 *   - 全局只数硬封顶 GLOBAL_NPC_CAP（防病态配置撑爆；活实体比道具贵，取 roomInv 半量级）。
 *
 * 越晚越肥：项仅在 effPhase >= revealPhase（= rule.spawn_phase_min）显形（takeNpcFromRoom 门控 项[1] <= effPhase）。
 * 一次性遭遇：取走标 taken（项.push(1)）随 roomNpcs 持久化进 gamevars.br，不再生。
 *
 * roomNpcs 范式（2 元组 [npcId,revealPhase]·taken=push(1) 长度 3）与 roomItems 的 roomInv
 *   （3 元组 [refIdx,kind,revealPhase]·taken 长度 4）**同范式不同元数** —— 因 NPC 无 kind/ref 维度。
 */

import { weightedSampleNoReplace } from '@/lib/server/br/roomItems'
import { hashSeed, mulberry32 } from '@/lib/server/br/forbidden'

/**
 * 全局（per-raid 跨房）NPC 只数硬封顶 —— 防病态配置（如全 100 房每房塞一只）撑爆 gamevars.br.roomNpcs。
 * 活实体比道具贵（每只 spawn 要 fetch/profile/combat），取 roomItems 的 GLOBAL_INV_CAP=240 的一半量级 120。
 * 截断按 enabledRules id 升序 + chosen 迭代序（稳定）→ 确定性（所有实例同样截断）。
 */
export const GLOBAL_NPC_CAP = 120

/**
 * allocateRoomNpcs(seed, roomIds, rules, ruleRooms) — 全图敌人投放分配（Phase 38 · 确定性纯函数）。
 *
 * 敌人为中心：逐条 enabled 规则，在其候选房集（带权重，过滤到本局房集）上做加权无放回抽样，
 * 把 [count_min, count_max] 只投到不同候选房（每房 ≤1 只），互斥组内的规则相互避让候选房。
 *
 * 算法逐条对应 roomItems.allocateRoomInventory（245-320），仅输出结构精简为 NPC 紧凑数组（npcId 直存·无 ref intern）：
 *   ① candidatesByRule：按 rule_id 分组 ruleRooms → 过滤到 roomIdSet → 仅 weight>0 → 组内按 br_room_id 升序（确定性锚点）。
 *   ② roomGroups：Map<roomId, Set<exclusion_group>>（某房已被哪些互斥组占用）；规则按 id 升序（确定性）；total=0。
 *   ③ 逐 enabled 规则：
 *        rng = mulberry32(hashSeed(seed, 'npcplace:'+rule.id))（与 forbidden.js 同源·每规则独立流）。
 *        count = count_min + floor(rng()*(count_max-count_min+1))（闭区间 [min,max]）。
 *        eligible = 候选中（若 rule.exclusion_group）剔除「已含该组」的房。
 *        take = min(count, eligible.length)；take<=0 跳过。
 *        chosen = weightedSampleNoReplace(rng, eligible, take)（复用 roomItems 导出·eligible 已 br_room_id 升序）。
 *        revealPhase = max(0, floor(spawn_phase_min))。
 *        每 chosen 房 push [npcId, revealPhase]；total++；total>=GLOBAL_NPC_CAP 即 break；有组则标记该房占用本组。
 *   ④ chosen < count（候选不足）→ 欠铺（运行期尽力·静默；编辑器配置期已警告）。
 *
 * 语义保证：①N选1（count=1→抽1房）②N选K（count=K·每房1→K个不同房）③加权（按 weight 倾斜）
 *   ④互斥（同组规则按 id 序逐落·后者 eligible 已剔前者占用房 → 不同房；配置足够时各自都铺）。
 *
 * 确定性：'npcplace:'+rule.id 每规则独立 rng 流（增删别的规则不扰动本规则）；同 seed + 同 rules + 同 ruleRooms → 同 roomNpcs。
 *
 * @param {number} seed per-raid 种子（gamevars.br.seed）
 * @param {number[]} roomIds 本局实际启用房号集
 * @param {Array<object>} rules npc_placement_rules 行：{ id, npc_id, count_min, count_max, max_per_room, spawn_phase_min, exclusion_group, enabled? }
 * @param {Array<object>} ruleRooms npc_placement_rule_rooms 行：{ rule_id, br_room_id, weight }
 * @returns {Object<number, Array>} roomNpcs：{ [roomId]: [[npcId, revealPhase], ...] }（仅有投放房建 key·紧凑·npcId 直存）
 */
export function allocateRoomNpcs(seed, roomIds, rules, ruleRooms) {
  const roomNpcs = {}

  const ids = Array.isArray(roomIds) ? roomIds : []
  const roomIdSet = new Set(ids.filter((x) => Number.isFinite(x)).map((x) => Number(x)))
  if (roomIdSet.size === 0) return roomNpcs

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
  let total = 0 // 全局只数累计（GLOBAL_NPC_CAP 二道阀）

  // ③ 逐规则
  for (const rule of enabledRules) {
    if (total >= GLOBAL_NPC_CAP) break
    const cands = candidatesByRule.get(Number(rule.id)) || []
    if (cands.length === 0) continue // 无候选 → 欠铺（运行期静默；编辑器配置期已警告）

    const rng = mulberry32(hashSeed(seed, 'npcplace:' + rule.id)) // 与 forbidden.js 同源·每规则独立流
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

    const npcId = Number(rule.npc_id) // 小整数直存（无 intern·区别于 roomItems）
    const revealPhase = Math.max(0, Math.floor(Number(rule.spawn_phase_min) || 0))

    for (const c of chosen) {
      if (total >= GLOBAL_NPC_CAP) break
      if (!roomNpcs[c.br_room_id]) roomNpcs[c.br_room_id] = []
      roomNpcs[c.br_room_id].push([npcId, revealPhase]) // 2 元组（无 kind/ref 维度）
      total++
      if (grp) { // 互斥：标记该房占用本组（同组后续规则不再选此房）
        let s = roomGroups.get(c.br_room_id)
        if (!s) { s = new Set(); roomGroups.set(c.br_room_id, s) }
        s.add(grp)
      }
    }
  }

  return roomNpcs
}

/**
 * takeNpcFromRoom(roomNpcs, roomId, effPhase) — 从某房遭遇库存取首个可取项（就地标 taken）。
 *
 * 就地变异：调用方已持有可写的 resolution.gamevars.br.roomNpcs（同引用），命中项 push(1) 后
 *   随 gamevars.br 持久化 → 下次搜该房跳过已取项（一次性遭遇，不再生）。
 *
 * 可取判据（线性扫首个满足者，O(房内只数)）：
 *   - 项.length < 3：未 taken（取走后 push(1) 变长度 3）。
 *   - 项[1] <= effPhase：已显形（revealPhase 门控·越晚越肥；早期 effPhase 小 ⇒ 高 revealPhase 项不可见）。
 *
 * @param {Object<number, Array>} roomNpcs gamevars.br.roomNpcs（就地可写）
 * @param {number} roomId 玩家当前房号
 * @param {number} effPhase 玩家有效阶段（getBrEffectivePhase 结果，整数 ≥ 0）
 * @returns {number|null} 取到的 npcId / 无可取（空·未显形·已取完）null
 */
export function takeNpcFromRoom(roomNpcs, roomId, effPhase) {
  const arr = roomNpcs && typeof roomNpcs === 'object' ? roomNpcs[roomId] : null
  if (!Array.isArray(arr) || arr.length === 0) return null

  const ep = Number.isFinite(effPhase) ? effPhase : 0
  for (const it of arr) {
    if (!Array.isArray(it) || it.length >= 3) continue // 已 taken（长度 3）
    const reveal = Number(it[1]) || 0
    if (reveal > ep) continue // 未显形
    it.push(1) // 标 taken（就地持久化进 roomNpcs）
    return it[0] // npcId
  }
  return null
}
