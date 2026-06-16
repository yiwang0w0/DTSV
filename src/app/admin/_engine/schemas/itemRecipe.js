/**
 * itemRecipe.js — 道具合成配方 schema（内容引擎首个【可写】内容类型）。
 *
 * 驱动 item_recipes / item_recipe_ingredients 两表（phase-49）。引用一律 ID（result_item_id /
 * 材料 item_id 均 → item_pool.id），运行只认 ID、永不按名匹配（杜绝 dts「改名即断链」）。
 * 表空时合成 UI 空 ⇒ 与现状一致（中性·守 Phase 37）；运行端消费在 Phase D 接（itemCraft.js）。
 */
const itemRecipe = {
  key: 'itemRecipe',
  label: '道具合成',
  table: 'item_recipes',
  pk: 'id',
  searchFields: ['name', 'description'],
  filters: [
    { field: 'enabled', label: '状态', options: [['all', '全部'], ['true', '启用'], ['false', '禁用']] },
  ],
  // 列表卡片摘要：产出道具名 ×数量（用 ID 解析展示名）
  summary: (row, R) => `${R.ref('item_pool', row.result_item_id) ?? `#${row.result_item_id}`} ×${row.result_qty ?? 1}`,
  fields: [
    { name: 'name', type: 'text', label: '配方名', required: true,
      hint: '管理员可读名，不进运行逻辑（运行只认 ID）' },
    { name: 'result_item_id', type: 'ref', label: '产出道具', required: true,
      ref: { table: 'item_pool', valueKey: 'id', labelKey: 'name' },
      hint: '合成成功后获得的道具（ID 引用，永不按名匹配）' },
    { name: 'result_qty', type: 'number', label: '产出数量', default: 1, min: 1 },
    { name: 'success_rate', type: 'number', label: '成功率', default: 1, min: 0, max: 1, step: 0.05,
      hint: '0–1；<1 即有失败可能' },
    { name: 'fail_behavior', type: 'select', label: '失败行为', default: 'lose_materials',
      options: [['lose_materials', '失败扣材料'], ['keep_materials', '失败保留材料']] },
    { name: 'req_level', type: 'number', label: '等级门槛', nullable: true,
      hint: '留空=无门槛（运行端读到 null 回落「不限制」）' },
    { name: 'description', type: 'textarea', label: '合成叙事', rows: 2 },
    { name: 'enabled', type: 'bool', label: '启用', default: true },
    // 桥接：材料清单（ID 引用 + 数量 + 催化剂开关 → item_recipe_ingredients）
    { name: 'ingredients', type: 'ingredient-list', label: '材料',
      bridge: { table: 'item_recipe_ingredients', parentKey: 'recipe_id', refColumn: 'item_id' },
      ref: { table: 'item_pool', valueKey: 'id', labelKey: 'name' },
      itemFields: [
        { name: 'quantity', type: 'number', label: '数量', default: 1, min: 1 },
        { name: 'is_consumed', type: 'bool', label: '消耗', default: true },
      ],
      validate: (list) => (Array.isArray(list) && list.length === 0 ? '至少需要一种材料' : null),
    },
  ],
  // 跨字段校验：材料不能与产出同一道具（防自指环）
  validate: (row) => {
    const ings = Array.isArray(row.ingredients) ? row.ingredients : []
    if (ings.some((i) => i.item_id != null && i.item_id === row.result_item_id)) {
      return '材料不能与产出是同一道具（防自指环）'
    }
    return null
  },
}

export default itemRecipe
