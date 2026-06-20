'use client'
import { useState } from 'react'
import { NAV_GROUPS, TAB_BY_KEY } from './adminNav'
import { C } from './ui'

/**
 * Sidebar — 管理后台左侧分组导航（4 大类·可折叠·当前高亮·计数）。
 *   active   当前 tab key
 *   onChange (key)=>void
 *   counts   { items, npcs, rooms } —— dataKey 命中的 tab 显示 (n)
 * 桌面态 sticky 左栏（窄屏抽屉在 Phase E 接）。视觉对齐 RulesTab category rail（borderLeft accent + 半透明底）。
 */
export default function Sidebar({ active, onChange, counts = {} }) {
  const [collapsed, setCollapsed] = useState({})   // 默认全展开（4 组不多·含 active 的组天然可见）
  const toggle = (id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }))

  return (
    <aside style={{
      width: 220, flexShrink: 0, alignSelf: 'flex-start',
      background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 8,
      position: 'sticky', top: 80, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.dim, padding: '6px 10px 10px' }}>⚙️ 管理后台</div>
      {NAV_GROUPS.map((g) => {
        const open = !collapsed[g.id]
        return (
          <div key={g.id} style={{ marginBottom: 4 }}>
            <button onClick={() => toggle(g.id)} style={{
              width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer',
              color: C.dim, fontSize: 12, fontWeight: 700,
            }}>
              <span>{g.icon} {g.label}</span>
              <span style={{ fontSize: 10, opacity: 0.7 }}>{open ? '▾' : '▸'}</span>
            </button>
            {open && g.tabs.map((key) => {
              const t = TAB_BY_KEY[key]
              if (!t) return null
              const cnt = t.dataKey ? counts[t.dataKey] : undefined
              const on = active === key
              return (
                <button key={key} onClick={() => onChange(key)} style={{
                  width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 7, cursor: 'pointer',
                  border: 'none', borderLeft: `3px solid ${on ? C.accent : 'transparent'}`,
                  background: on ? 'rgba(88,166,255,0.12)' : 'transparent',
                  color: on ? C.accent : C.dim, fontSize: 13, fontWeight: on ? 600 : 400,
                }}>
                  {t.label}{cnt !== undefined && <span style={{ opacity: 0.6, marginLeft: 4 }}>({cnt})</span>}
                </button>
              )
            })}
          </div>
        )
      })}
    </aside>
  )
}
