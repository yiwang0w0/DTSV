/**
 * itemTag.js — 道具系列标签词表 schema（内容引擎第 2 个可写内容类型）。
 *
 * 驱动 item_tags 表（phase-50）。这是「受管标签词表」：先在此定义标签（名/色/排序），
 * 再在「🔮 道具池」给道具勾选标签（item_pool.tag_ids 软引用 item_tags.id）。
 * 受管 + ID 引用 ⇒ 标签改名不破坏道具引用、筛选一致（无错别字碎片）。
 */
const itemTag = {
  key: 'itemTag',
  label: '道具标签',
  table: 'item_tags',
  pk: 'id',
  searchFields: ['name'],
  filters: [
    { field: 'enabled', label: '状态', options: [['all', '全部'], ['true', '启用'], ['false', '禁用']] },
  ],
  summary: (row) => row.name,
  fields: [
    { name: 'name', type: 'text', label: '标签名', required: true, hint: '唯一·如「恢复系列」「近战武器」「Ω 关联」' },
    { name: 'color', type: 'text', label: '颜色 (hex)', default: '#58a6ff', hint: '后台 chip 配色，如 #58a6ff / #3fb950 / #d29922' },
    { name: 'sort_order', type: 'number', label: '排序', default: 0, hint: '小先' },
    { name: 'enabled', type: 'bool', label: '启用', default: true },
  ],
}

export default itemTag
