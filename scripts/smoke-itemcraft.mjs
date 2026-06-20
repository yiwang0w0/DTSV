/**
 * smoke-itemcraft.mjs — itemCraft.js 回归冒烟（原生 Node ESM · 无需 DB）
 *
 * 跑法：node scripts/smoke-itemcraft.mjs
 * 覆盖：材料校验 / 成功扣材出产物 / 失败两种 behavior / 催化剂不扣 / 等级门槛 /
 *      成功率边界 / quantity·result_qty 倍数 / 入参不被修改 / 未知名忽略。
 */
import { countInventoryById, checkItemCraft, applyItemCraft } from '../src/lib/itemCraft.js'

let pass = 0, fail = 0
function ok(cond, msg) { if (cond) { pass++ } else { fail++; console.error('  ✗ ' + msg) } }

// 小道具表：id↔name 双向映射（运行端由 item_pool 构造）
const items = [
  { id: 1, name: '铁' }, { id: 2, name: '木' }, { id: 3, name: '剑' },
  { id: 4, name: '催化石' }, { id: 5, name: '宝箱' },
]
const idByName = new Map(items.map((i) => [i.name, i.id]))
const nameById = new Map(items.map((i) => [i.id, i.name]))
const maps = { idByName, nameById }

// 基础配方：铁×2 + 木×1 → 剑×1（必成功）
const swordRecipe = {
  id: 1, result_item_id: 3, result_qty: 1, success_rate: 1, fail_behavior: 'lose_materials', req_level: null,
  ingredients: [
    { item_id: 1, quantity: 2, is_consumed: true },
    { item_id: 2, quantity: 1, is_consumed: true },
  ],
}

// ① countInventoryById：按 id 计数，未知名忽略
{
  const counts = countInventoryById(['铁', '铁', '木', '不存在的道具'], idByName)
  ok(counts.get(1) === 2 && counts.get(2) === 1 && counts.size === 2, 'countInventoryById 计数 + 忽略未知名')
}

// ② 材料齐 ⇒ canCraft；必成功 ⇒ 扣材出产物，背包增量正确
{
  const inv = ['铁', '铁', '木', '木']
  const chk = checkItemCraft(swordRecipe, inv, idByName)
  ok(chk.canCraft && chk.missing.length === 0, '材料齐 → canCraft')
  const r = applyItemCraft(swordRecipe, inv, maps, 0)
  ok(r.ok && r.success, '必成功配方 success=true')
  // 扣铁×2、木×1，加剑×1 ⇒ 剩 木×1 + 剑×1
  const left = r.nextInventory.slice().sort().join(',')
  ok(left === ['木', '剑'].sort().join(','), `成功后背包 = 木,剑（实得 ${left}）`)
  ok(r.produced && r.produced.itemId === 3 && r.produced.qty === 1, 'produced = 剑×1')
  ok(inv.length === 4, '入参 inventory 未被修改（不可变）')
}

// ③ 材料不足 ⇒ canCraft=false，applyItemCraft ok:false/missing
{
  const inv = ['铁', '木'] // 缺 1 个铁
  const chk = checkItemCraft(swordRecipe, inv, idByName)
  ok(!chk.canCraft && chk.missing.some((m) => m.itemId === 1 && m.need === 2 && m.have === 1), '缺料 → missing 铁(need2 have1)')
  const r = applyItemCraft(swordRecipe, inv, maps, 0)
  ok(!r.ok && r.reason === 'missing', '缺料 applyItemCraft ok:false reason:missing')
}

// ④ 失败 + lose_materials ⇒ 扣材料、无产物；失败 + keep_materials ⇒ 原样保留
{
  const inv = ['铁', '铁', '木']
  const loseR = { ...swordRecipe, success_rate: 0, fail_behavior: 'lose_materials' }
  const a = applyItemCraft(loseR, inv, maps, 0.5) // roll 任意，rate=0 必失败
  ok(a.ok && !a.success && a.produced === null, '失败：success=false 无产物')
  ok(a.nextInventory.length === 0, 'lose_materials：材料被扣光（铁2木1）')

  const keepR = { ...swordRecipe, success_rate: 0, fail_behavior: 'keep_materials' }
  const b = applyItemCraft(keepR, inv, maps, 0.5)
  ok(b.ok && !b.success && b.nextInventory.length === 3 && b.consumed.length === 0, 'keep_materials：材料原样保留、零消耗')
}

// ⑤ 催化剂(is_consumed=false)：要求持有但成功后不扣
{
  const catRecipe = {
    id: 2, result_item_id: 5, result_qty: 1, success_rate: 1, fail_behavior: 'lose_materials', req_level: null,
    ingredients: [
      { item_id: 1, quantity: 1, is_consumed: true },   // 铁：扣
      { item_id: 4, quantity: 1, is_consumed: false },  // 催化石：留
    ],
  }
  const invNo = ['铁'] // 无催化石
  ok(!checkItemCraft(catRecipe, invNo, idByName).canCraft, '催化剂缺失也算缺料')
  const inv = ['铁', '催化石']
  const r = applyItemCraft(catRecipe, inv, maps, 0)
  ok(r.success && r.nextInventory.includes('催化石'), '催化石成功后仍在背包（不消耗）')
  ok(!r.nextInventory.includes('铁'), '普通材料铁被扣')
  ok(r.nextInventory.includes('宝箱'), '产出宝箱')
}

// ⑥ 等级门槛：req_level=5，玩家 3 级 ⇒ gated；玩家 5 级 / 无等级 ⇒ 放行
{
  const lr = { ...swordRecipe, req_level: 5 }
  const inv = ['铁', '铁', '木']
  ok(checkItemCraft(lr, inv, idByName, 3).levelGated, 'level 3 < req 5 → gated')
  ok(!checkItemCraft(lr, inv, idByName, 5).canCraft === false, 'level 5 ≥ req 5 → 放行') // 5>=5 放行
  ok(checkItemCraft(lr, inv, idByName, null).canCraft, 'playerLevel=null → 不做等级门槛')
  const g = applyItemCraft(lr, inv, maps, 0, 3)
  ok(!g.ok && g.reason === 'level', '等级不足 applyItemCraft ok:false reason:level')
}

// ⑦ 成功率边界：rate=0.8，roll=0.5 成功 / roll=0.8 失败（严格 <）
{
  const r08 = { ...swordRecipe, success_rate: 0.8 }
  const inv = ['铁', '铁', '木']
  ok(applyItemCraft(r08, inv, maps, 0.5).success, 'rate0.8 roll0.5 → 成功')
  ok(!applyItemCraft(r08, inv, maps, 0.8).success, 'rate0.8 roll0.8 → 失败（严格<）')
}

// ⑧ quantity>1 精确扣 N；result_qty>1 精确加 N
{
  const big = {
    id: 3, result_item_id: 5, result_qty: 3, success_rate: 1, fail_behavior: 'lose_materials', req_level: null,
    ingredients: [{ item_id: 1, quantity: 3, is_consumed: true }],
  }
  const inv = ['铁', '铁', '铁', '铁', '木'] // 4 铁
  const r = applyItemCraft(big, inv, maps, 0)
  const ironLeft = r.nextInventory.filter((x) => x === '铁').length
  const boxes = r.nextInventory.filter((x) => x === '宝箱').length
  ok(ironLeft === 1, `扣铁×3 后剩 1（实剩 ${ironLeft}）`)
  ok(boxes === 3, `产出宝箱×3（实得 ${boxes}）`)
}

console.log(`\nitemCraft smoke: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
