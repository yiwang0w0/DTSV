/**
 * itemPoolPreview.js — 内容引擎 Phase A 自测用「只读」schema（指向现有 item_pool）。
 *
 * 目的：在不建任何表、不碰运行端的前提下，用真实数据跑通引擎骨架的
 *   列表 / 搜索 / 筛选 / 引用解析（on_use_buff_ids → buff_pool 的 ref-multi 解析）。
 * 它【不是】要落地的内容类型——首个真正可写的是 itemRecipe(道具合成·Phase B/C)。
 * 这份 schema 仅证明「声明一份 schema ⇒ 自动得到一个内容浏览 tab」这条主轴成立。
 */
import { ITEM_KIND_META } from '@/lib/constants'

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
      // A3 修（2026-07-23）：原来写死 weapon/armor/consumable/special —— 与当前 6 个 kind
      //   **一个都对不上**（ITEM_KIND_META: tech_fragment/platform_part/omega_matter/equipment/
      //   consumable/material）⇒ 筛选器筛不出任何东西（除 consumable）。改为与 constants.js 同源。
      options: [
        ['all', '全部'],
        ...Object.entries(ITEM_KIND_META).map(([k, m]) => [k, m.label]),
      ],
    },
  ],
  summary: (row) => row.name,
  fields: [
    { name: 'id', type: 'number', label: 'ID' },
    { name: 'name', type: 'text', label: '名称' },
    { name: 'kind', type: 'select', label: '类型',
      options: Object.entries(ITEM_KIND_META).map(([k, m]) => [k, m.label]) },
    // 真正生效的三列（kind 无关）。旧 atk/def 只对已不存在的 weapon/armor kind 生效 ⇒ 标注为死列。
    { name: 'atk_delta', type: 'number', label: 'ATK 增量' },
    { name: 'def_delta', type: 'number', label: 'DEF 增量' },
    { name: 'max_hp_delta', type: 'number', label: 'HP 上限增量' },
    { name: 'atk', type: 'number', label: '攻击（旧列·无效果）' },
    { name: 'def', type: 'number', label: '防御（旧列·无效果）' },
    { name: 'heal', type: 'number', label: '治疗' },
    // ref-multi：验证「ID 引用 → 运行期解析展示名」——展示名变了不影响引用
    { name: 'on_use_buff_ids', type: 'ref-multi', label: '使用赋予 buff',
      ref: { table: 'buff_pool', valueKey: 'id', labelKey: 'name' } },
    { name: 'description', type: 'textarea', label: '描述' },
  ],
}

export default itemPoolPreview
