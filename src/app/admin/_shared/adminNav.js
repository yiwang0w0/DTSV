/**
 * adminNav.js — 管理后台导航的「单一真源」（纯数据 + 纯函数·无 JSX·无 'use client'）。
 *
 * page.js / Sidebar 共用：
 *   · TABS         —— 18 个 tab 的元数据（17 入侧栏 + engine 仅深链）。label 唯一真源（迁自 page.js）。
 *                     其中 items/fragments/placements/economy 为「hub 壳 tab」，内部用 <SegTabs> 收编原本拆散的同域子页。
 *   · NAV_GROUPS   —— 4 大类分组（顺序即侧栏从上到下；组内顺序即组内从上到下）。只存 tab key，不复制 label。
 *   · 派生工具     —— TAB_BY_KEY / ALL_TAB_KEYS / GROUP_OF_TAB / DEFAULT_TAB。
 *
 * 注：`engine`（🧪 引擎预览·Phase A 只读自测）保留在 TABS（深链 ?tab=engine 仍可达 + 有 label），
 *     但【不入任何分组】=「退役侧栏入口」。其渲染仍由 _engine/schemas/index.js 的 ENGINE_TABS 提供。
 */

export const TABS = [
  // 内容创作
  { key: 'items',      label: '🔮 道具',      dataKey: 'items' },  // hub: 池 / 系列标签 / 合成配方
  { key: 'npcs',       label: '👻 实体',      dataKey: 'npcs' },
  { key: 'equipment',  label: '🗡️ 装备引擎' },                     // 壳: 系列 / 被动
  { key: 'fragments',  label: '📡 残片' },                          // hub: 残片池 / 合成配方
  { key: 'classes',    label: '✦ 职业' },
  { key: 'narrative',  label: '📜 叙事配置' },                      // 壳: 合同 / 事件 / 分支 / 结局
  // 世界·投放
  { key: 'roomsedit',  label: '🧭 房间编辑器' },
  { key: 'chambers',   label: '🏛 chamber' },
  { key: 'placements', label: '🎯 投放' },                          // hub: 道具投放 / 敌人投放
  // 规则·经济
  { key: 'rules',      label: '⚙️ 战斗规则' },                      // 壳: 规则 / Buff 池
  { key: 'economy',    label: '🛒 经济' },                          // hub: 商店目录 / 点数兑换
  // 运营·监控
  { key: 'overview',   label: '📊 概览' },
  { key: 'rooms',      label: '🌀 对局',      dataKey: 'rooms' },
  { key: 'analytics',  label: '📈 数据' },                          // 壳: Playtest / 探针遥测
  { key: 'portraits',  label: '🎴 立绘审核' },
  { key: 'users',      label: '👥 用户权限' },
  { key: 'db',         label: '🗄️ DB 控制台' },
  // 未分组（退役侧栏入口·仅深链可达）
  { key: 'engine',     label: '🧪 引擎预览' },
]

export const NAV_GROUPS = [
  { id: 'content', label: '内容创作', icon: '🔮',
    tabs: ['items', 'npcs', 'equipment', 'fragments', 'classes', 'narrative'] },
  { id: 'world',   label: '世界·投放', icon: '🌍',
    tabs: ['roomsedit', 'chambers', 'placements'] },
  { id: 'economy', label: '规则·经济', icon: '⚙️',
    tabs: ['rules', 'economy'] },
  { id: 'ops',     label: '运营·监控', icon: '📈',
    tabs: ['overview', 'rooms', 'analytics', 'portraits', 'users', 'db'] },
]

export const DEFAULT_TAB = 'overview'
export const TAB_BY_KEY = Object.fromEntries(TABS.map((t) => [t.key, t]))
export const ALL_TAB_KEYS = new Set(TABS.map((t) => t.key))
// tab key → 它属于哪个 group.id（深链进某 tab 时自动展开其所在分组）
export const GROUP_OF_TAB = Object.fromEntries(NAV_GROUPS.flatMap((g) => g.tabs.map((k) => [k, g.id])))

// dev-only 一致性自检：① 分组里的 key 都得存在于 TABS（无死项）② 未分组的 TABS key 应仅有 'engine'
if (process.env.NODE_ENV !== 'production') {
  const grouped = new Set(NAV_GROUPS.flatMap((g) => g.tabs))
  for (const k of grouped) if (!ALL_TAB_KEYS.has(k)) console.warn('[adminNav] 分组含不存在的 tab:', k)
  const ungrouped = [...ALL_TAB_KEYS].filter((k) => !grouped.has(k))
  const unexpected = ungrouped.filter((k) => k !== 'engine')
  if (unexpected.length) console.warn('[adminNav] 未分组的 tab（应只有 engine）:', unexpected)
}
