'use client'

/**
 * /parameters — 内嵌小游戏「参数」
 *
 * 单文件 HTML5 游戏，静态资源位于 public/games/parameters.html，
 * 用 iframe 隔离加载（自带内联脚本与样式，不与主站 React 冲突）。
 * 已去除原型页的品牌 / 归属标签。
 */

import { THEME } from '@/lib/theme'

export default function ParametersPage() {
  return (
    <div
      style={{
        borderRadius: 12,
        border: `1px solid ${THEME.border}`,
        background: THEME.bg,
        overflow: 'hidden',
        height: 'calc(100vh - 140px)',
        minHeight: 640,
      }}
    >
      <iframe
        src="/games/parameters.html"
        title="参数"
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      />
    </div>
  )
}
