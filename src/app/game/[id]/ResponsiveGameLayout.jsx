'use client'

// 对局页响应式布局壳（移动化 P2）。
//   宽屏（≥断点）：恒等渲染现有三栏 grid `300px 1fr 300px` —— DOM 与改造前逐字节一致（桌面零变化）。
//   窄屏（<断点）：单列只显当前 Tab 那一栏 + 底部 Tab 导航切换（触控友好·safe-area·可选角标）。
//   纯壳、prop 驱动：三栏内容（left/center/right）原样由 GameClientPage 注入，内容零改动。
//   kaleido 局不经过此壳（走 KaleidoRunView 早返回）——本壳仅多人/BR 对局页。

import { useState } from 'react'
import { useIsNarrow } from '@/lib/useIsNarrow'
import { T } from './gameUi'

const DEFAULT_TABS = [
  { key: 'left', icon: '👤', label: '状态' },
  { key: 'center', icon: '⚔️', label: '行动' },
  { key: 'right', icon: '🗺️', label: '区域' },
]
const NAV_H = 56 // 底部 Tab 栏高度（不含 safe-area）——内容区据此留底 padding 防 fixed 栏遮挡

export default function ResponsiveGameLayout({
  left, center, right,
  defaultTab = 'center',
  tabs = DEFAULT_TABS,
  badges = null, // { left?, center?, right? }：真值 → 角标（数字显计数，其余显红点）
  breakpoint = 768,
}) {
  const isNarrow = useIsNarrow(breakpoint)
  const [tab, setTab] = useState(defaultTab)

  // ── 宽屏：现有三栏 grid（与改造前 DOM 一致）───────────────────────────────
  if (!isNarrow) {
    return (
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '300px 1fr 300px', overflow: 'hidden' }}>
        {left}
        {center}
        {right}
      </div>
    )
  }

  // ── 窄屏：单列（当前 Tab）+ 底部 Tab 导航 ─────────────────────────────────
  //   对局根在 RootShell 的 <Nav> + padded <main> 之下（非全屏）；in-flow 底栏会被推到视口外，
  //   故底栏用 position:fixed 锚定视口底（始终可见），内容区留出 NAV_H + safe-area 的底部空间防遮挡。
  const pane = { left, center, right }
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* 只挂当前 Tab 那一栏；三栏各自 display:flex/overflow:hidden 结构不变，在单列 grid 里自适应 */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr', overflow: 'hidden', paddingBottom: `calc(${NAV_H}px + env(safe-area-inset-bottom))` }}>
        {pane[tab] || center}
      </div>
      <nav
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60,
          display: 'flex', flexShrink: 0, borderTop: `1px solid ${T.border}`, background: T.bg1,
          paddingBottom: 'env(safe-area-inset-bottom)',
          boxShadow: '0 -2px 12px rgba(0,0,0,0.35)',
        }}
      >
        {tabs.map((t) => {
          const active = tab === t.key
          const badge = badges ? badges[t.key] : null
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, position: 'relative', border: 'none', cursor: 'pointer',
                background: active ? `${T.cyan}14` : 'transparent',
                borderTop: `2px solid ${active ? T.cyan : 'transparent'}`,
                color: active ? T.cyan : T.dim,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                padding: '8px 0 10px', minHeight: 52, fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>{t.icon}</span>
              <span style={{ fontSize: 11, fontWeight: active ? 700 : 500 }}>{t.label}</span>
              {badge ? (
                <span
                  style={{
                    position: 'absolute', top: 4, right: '50%', marginRight: -22,
                    minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8,
                    background: T.red, color: '#fff', fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                  }}
                >
                  {typeof badge === 'number' ? (badge > 99 ? '99+' : badge) : ''}
                </span>
              ) : null}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
