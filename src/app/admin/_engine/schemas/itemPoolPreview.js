/**
 * itemPoolPreview.js — 内容引擎 Phase A 自测用「只读」schema（指向现有 item_pool）。
 *
 * 目的：在不建任何表、不碰运行端的前提下，用真实数据跑通引擎骨架的
 *   列表 / 搜索 / 筛选 / 引用解析（on_use_buff_ids → buff_pool 的 ref-multi 解析）。
 * 它【不是】要落地的内容类型——首个真正可写的是 itemRecipe(道具合成·Phase B/C)。
 * 这份 schema 仅证明「声明一份 schema ⇒ 自动得到一个内容浏览 tab」这条主轴成立。
 */
const itemPoolPreview = {
  key: 'itemPoolPreview',
  label: '道具池（引擎只读预览）',
  table: 'item_pool',
  pk: 'id',
  readOnly: true,
  searchFields: ['name', 'description'],
  filters: [
    {
      field: 'kind',
      label: '类型',
      options: [
        ['all', '全部'],
        ['weapon', '武器'],
        ['armor', '护甲'],
        ['consumable', '消耗品'],
        ['special', '特殊'],
      ],
    },
  ],
  summary: (row) => row.name,
  fields: [
    { name: 'id', type: 'number', label: 'ID' },
    { name: 'name', type: 'text', label: '名称' },
    { name: 'kind', type: 'select', label: '类型',
      options: [['weapon', '武器'], ['armor', '护甲'], ['consumable', '消耗品'], ['special', '特殊']] },
    { name: 'atk', type: 'number', label: '攻击' },
    { name: 'def', type: 'number', label: '防御' },
    { name: 'heal', type: 'number', label: '治疗' },
    // ref-multi：验证「ID 引用 → 运行期解析展示名」——展示名变了不影响引用
    { name: 'on_use_buff_ids', type: 'ref-multi', label: '使用赋予 buff',
      ref: { table: 'buff_pool', valueKey: 'id', labelKey: 'name' } },
    { name: 'description', type: 'textarea', label: '描述' },
  ],
}

export default itemPoolPreview
