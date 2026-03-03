'use client'
import { useState } from 'react'

/* ─── 共用样式 ─── */
export const BTN = (bg, color, extra = {}) => ({
  padding: '8px 16px', borderRadius: 7, border: 'none', background: bg,
  color, fontSize: 12, fontWeight: 700, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 5, ...extra,
})
export const INPUT = {
  width: '100%', padding: '8px 12px', borderRadius: 7,
  border: '1px solid #30363d', background: '#0d1117',
  color: '#e6edf3', fontSize: 13, outline: 'none',
}
export const LABEL = {
  display: 'block', fontSize: 10, color: '#8b949e', marginBottom: 5,
  fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px',
}

/* ─── MAP_LIST（34张地图）─── */
export const MAP_LIST = Array.from({ length: 34 }, (_, i) => ({ id: i + 1, name: `地图 ${i + 1}` }))

/* ─── 常量元数据 ─── */
export const ITEM_KIND_META = {
  weapon:     { label: '武器',   color: '#f85149', icon: '⚔️' },
  armor:      { label: '防具',   color: '#58a6ff', icon: '🛡️' },
  consumable: { label: '消耗品', color: '#3fb950', icon: '💊' },
  material:   { label: '材料',   color: '#d29922', icon: '🧱' },
  special:    { label: '特殊',   color: '#bc8cff', icon: '✨' },
}
export const NPC_LEVEL_META = {
  easy:   { label: '普通', color: '#3fb950' },
  medium: { label: '中等', color: '#d29922' },
  hard:   { label: '困难', color: '#f85149' },
  boss:   { label: 'BOSS', color: '#bc8cff' },
}
export const ROOM_STATE = {
  0: { label: '等待中', color: '#d29922' },
  1: { label: '进行中', color: '#3fb950' },
  2: { label: '已结束', color: '#484f58' },
}
export const WEATHER_OPTIONS = ['clear', 'rain', 'fog', 'storm', 'night', 'snow']
export const GAME_TYPES = { 0: '个人战', 2: 'PVE', 11: '2v2', 12: '3v3', 13: '4v4', 14: '自由团战' }

/* ─── Spinner ─── */
export function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <div style={{ width: 32, height: 32, border: '3px solid #30363d', borderTopColor: '#58a6ff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

/* ─── Modal ─── */
export function Modal({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }} />
      <div style={{ position: 'relative', background: '#1c2129', borderRadius: 14, border: '1px solid #30363d', width: '90%', maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #21262d', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 20 }}>✕</button>
        </div>
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>{children}</div>
      </div>
    </div>
  )
}

/* ─── StatCard ─── */
export function StatCard({ label, value, icon, color, sub }) {
  return (
    <div style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <span style={{ fontSize: 12, color: '#8b949e', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 900, color, fontFamily: 'monospace', marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#484f58' }}>{sub}</div>}
    </div>
  )
}

/* ─── useToast ─── */
export function useToast() {
  const [toasts, setToasts] = useState([])
  function show(msg, type = 'success') {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000)
  }
  function Container() {
    return (
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
            background: t.type === 'error' ? '#f85149' : '#3fb950', color: '#fff',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)', animation: 'fadeIn .2s ease',
          }}>{t.msg}</div>
        ))}
        <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
      </div>
    )
  }
  return { show, Container }
}
