/**
 * schemas/index.js — 内容引擎 schema 注册表（tabKey → schema）。
 *
 * page.js 据此动态渲染内容引擎 tab，免去逐个硬编码 `{tab==='x' && <ContentEngine schema={X}/>}`。
 * 新增一种内容类型 = 写一份 schema + 在此登记一行 + 在 adminNav 的 TABS/NAV_GROUPS 加 key/label。
 *
 * 注：tabKey（itemtags/itemrecipe/engine）是导航/URL 用的 key，与 schema 自带的 .key 不必同名。
 *     `engine`(itemPoolPreview·只读预览) 已退役侧栏入口，仅深链 ?tab=engine 可达。
 */
import itemTag from './itemTag'
import itemRecipe from './itemRecipe'
import itemPoolPreview from './itemPoolPreview'

export const ENGINE_TABS = {
  itemtags: itemTag,
  itemrecipe: itemRecipe,
  engine: itemPoolPreview,
}

export default ENGINE_TABS
