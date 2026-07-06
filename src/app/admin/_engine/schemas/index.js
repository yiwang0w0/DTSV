/**
 * schemas/index.js — 顶层内容引擎 tab 注册表（tabKey → schema）。
 *
 * page.js 据此动态渲染顶层内容引擎 tab，免去硬编码 `{tab==='x' && <ContentEngine schema={X}/>}`。
 *
 * 注：道具的 itemTag / itemRecipe 两份 schema 已收编进「道具」hub（ItemsHub.jsx 里直接 import + 渲染），
 *     不再作为独立顶层 tab，故这里只剩 `engine`(itemPoolPreview·只读预览) —— 已退役侧栏入口，仅深链 ?tab=engine 可达。
 *     新增一种【顶层】内容类型 = 写 schema + 在此登记一行 + 在 adminNav 的 TABS/NAV_GROUPS 加 key/label。
 */
import itemPoolPreview from './itemPoolPreview'
import contentPool from './contentPool'

export const ENGINE_TABS = {
  engine: itemPoolPreview,
  // KALEIDO 内容池 / 种子关策展（KP0-C ⑤）。深链 /admin?tab=contentPool 可达（暂无侧栏入口）。
  contentPool,
}

export default ENGINE_TABS
