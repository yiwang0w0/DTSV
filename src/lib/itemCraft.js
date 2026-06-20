/**
 * itemCraft.js — 道具合成运行时（纯函数 · 零 import · 可被原生 Node ESM 直接导入做回归）
 *
 * 背景（docs/plan/03-crafting-synthesis.md / 01 §2.3）：
 *   内容引擎里「道具合成」(item_recipes / item_recipe_ingredients · phase-49) 已可 authoring，
 *   但运行端从未消费 ⇒ 写好的配方不产生任何效果。本文件是其运行时核心：给定一条配方 + 玩家背包，
 *   校验材料 → 掷成功率 → 扣材料 / 出产物（或按 fail_behavior 处理）。与「装备升阶」(tier_recipes /
 *   equipmentEngine.js) 是两套独立系统：这套是更轻的 item→item 横向配方。
 *
 * 设计约束（与 combatPipeline.js / combatStats.js 同）：本文件【零 import】、纯函数、无 DB、无副作用，
 *   可被 scripts/smoke-itemcraft.mjs 用原生 Node ESM 直接导入回归。DB 读取 / 动作分发由调用方（服务端）做，
 *   只把「纯数据」(recipe / inventory / id↔name 映射 / roll) 传进来。
 *
 * 背包桥接（roadmap：短期 id↔name 桥接兼容 string[] 背包）：
 *   gamevars.players[uid].inventory 是【道具名数组】(string[])，而配方一律用 item_id（杜绝 dts 改名即断链）。
 *   故调用方传入 idByName(Map<name,id>) + nameById(Map<id,name>)，本文件按 id 校验、按 name 增删背包。
 *
 * ★ 中性铁律（守 Phase 37）：0 条配方 ⇒ 无可合成项 ⇒ 与现状（无道具合成）逐值一致。
 *   本运行时只在玩家显式选定某条配方并 craft 时才动背包，从不自发触发。
 *
 * recipe 形态（纯数据 · 来自 item_recipes + 桥接 ingredients）：
 *   { id, result_item_id, result_qty, success_rate(0..1), fail_behavior('lose_materials'|'keep_materials'),
 *     req_level|null, ingredients:[{ item_id, quantity, is_consumed }] }
 */

// 规整配方材料 → [{ itemId, quantity, isConsumed }]（防脏：qty≥1、item_id 必为有限数）
function normIngredients(recipe) {
  return (recipe?.ingredients || [])
    .map((i) => ({
      itemId: Number(i.item_id),
      quantity: Math.max(1, Number(i.quantity) || 1),
      isConsumed: i.is_consumed !== false, // 缺省消耗；false=催化剂（检查持有但不扣）
    }))
    .filter((i) => Number.isFinite(i.itemId))
}

// 统计 inventory（道具名数组）中每个 item_id 的持有数。idByName: Map<name,id>。未知名（不在表）忽略。
export function countInventoryById(inventory, idByName) {
  const counts = new Map()
  for (const name of inventory || []) {
    const id = idByName.get(name)
    if (id == null) continue
    counts.set(id, (counts.get(id) || 0) + 1)
  }
  return counts
}

// 纯校验：能否合成。playerLevel 为 null 时不做等级门槛（运行端读到 null 回落「不限制」）。
// 返回 { canCraft, missing:[{ itemId, need, have }], levelGated }
export function checkItemCraft(recipe, inventory, idByName, playerLevel = null) {
  const counts = countInventoryById(inventory, idByName)
  const missing = []
  for (const ing of normIngredients(recipe)) {
    const have = counts.get(ing.itemId) || 0
    if (have < ing.quantity) missing.push({ itemId: ing.itemId, need: ing.quantity, have })
  }
  const reqLevel = recipe?.req_level
  const levelGated =
    reqLevel != null && playerLevel != null && Number(playerLevel) < Number(reqLevel)
  return { canCraft: missing.length === 0 && !levelGated, missing, levelGated }
}

// 从名数组移除前 n 个等于 name 的元素，返回新数组（不改输入）。
function removeN(inv, name, n) {
  const out = []
  let removed = 0
  for (const it of inv) {
    if (removed < n && it === name) { removed++; continue }
    out.push(it)
  }
  return out
}

/**
 * 纯执行一次合成。roll ∈ [0,1)（由调用方注入随机数 ⇒ 可测）。nameById: Map<id,name>。
 *   不可合成 → { ok:false, reason:'missing'|'level', missing, levelGated }
 *   可合成   → { ok:true, success, nextInventory, consumed:[{itemId,name,qty}], produced:{itemId,name,qty}|null }
 * 语义：成功 ⇒ 扣 is_consumed 材料 + 产出 result。失败 ⇒ lose_materials 扣材料（无产出）/ keep_materials 原样保留。
 *       催化剂(is_consumed=false) 任何情况都不扣（但校验时要求持有）。本函数不改入参 inventory。
 */
export function applyItemCraft(recipe, inventory, { idByName, nameById }, roll, playerLevel = null) {
  const chk = checkItemCraft(recipe, inventory, idByName, playerLevel)
  if (!chk.canCraft) {
    return { ok: false, reason: chk.levelGated ? 'level' : 'missing', missing: chk.missing, levelGated: chk.levelGated }
  }

  const rate = Math.max(0, Math.min(1, Number(recipe?.success_rate ?? 1)))
  const success = Number(roll) < rate
  const failBehavior = recipe?.fail_behavior === 'keep_materials' ? 'keep_materials' : 'lose_materials'
  const consumeMaterials = success || failBehavior === 'lose_materials'

  let inv = (inventory || []).slice()
  const consumed = []
  if (consumeMaterials) {
    for (const ing of normIngredients(recipe)) {
      if (!ing.isConsumed) continue
      const name = nameById.get(ing.itemId)
      if (name == null) continue
      inv = removeN(inv, name, ing.quantity)
      consumed.push({ itemId: ing.itemId, name, qty: ing.quantity })
    }
  }

  let produced = null
  if (success) {
    const resultId = Number(recipe?.result_item_id)
    const resultName = nameById.get(resultId)
    const qty = Math.max(1, Number(recipe?.result_qty) || 1)
    if (resultName != null) {
      for (let i = 0; i < qty; i++) inv.push(resultName)
      produced = { itemId: resultId, name: resultName, qty }
    }
  }

  return { ok: true, success, nextInventory: inv, consumed, produced }
}
