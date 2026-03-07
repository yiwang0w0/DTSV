'use client'
import { useState } from 'react'
import { evalFormula } from '@/lib/gameEngine'

export const BTN = (bg, color, extra = {}) => ({
  padding: '8px 16px', borderRadius: 7, border: 'none', background: bg,
  color, fontSize: 12, fontWeight: 700, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 5, ...extra,
})
export const INPUT = {
  width: '100%', padding: '10px 14px', borderRadius: 8,
  border: '1px solid #30363d', background: '#161b22', color: '#e6edf3',
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
}
export const LABEL = {
  display: 'block', fontSize: 11, color: '#8b949e', marginBottom: 6,
  fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
}

export const MAP_LIST = Array.from({ length: 34 }, (_, i) => ({ id: i + 1, name: `地图 ${i + 1}` }))

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

export function Spinner() {
  return (
    <div style={{ textAlign: 'center', padding: 80, color: '#8b949e' }}>
      <style>{`@keyframes _spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ display: 'inline-block', width: 36, height: 36, border: '3px solid #30363d', borderTopColor: '#58a6ff', borderRadius: '50%', animation: '_spin 0.8s linear infinite' }} />
      <div style={{ marginTop: 12, fontSize: 13 }}>加载中...</div>
    </div>
  )
}

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

export function StatCard({ label, value, icon, color, sub }) {
  return (
    <div style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
          <div style={{ fontSize: 30, fontWeight: 700, color, fontFamily: "'JetBrains Mono'" }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: '#8b949e', marginTop: 6 }}>{sub}</div>}
        </div>
        {icon && <span style={{ fontSize: 28, opacity: 0.3 }}>{icon}</span>}
      </div>
    </div>
  )
}

export function FormulaPreview({ formula, testVars }) {
  const vars = testVars || { atk: 15, def: 8, hp: 60, maxHp: 100, targetDef: 8, targetHp: 80, targetMaxHp: 100, targetAtk: 12, atkMultiplier: 1.0, defMultiplier: 0.5, heal: 30, effect: 5, value: 5 }
  if (!formula?.trim()) return null
  let result = null, isError = false
  try { result = evalFormula(formula, vars) } catch { isError = true }
  if (result === null) isError = true
  return (
    <div style={{ marginTop: 6, padding: '8px 12px', borderRadius: 6, background: isError ? 'rgba(248,81,73,0.08)' : 'rgba(63,185,80,0.08)', border: `1px solid ${isError ? 'rgba(248,81,73,0.2)' : 'rgba(63,185,80,0.2)'}`, fontSize: 12 }}>
      <span style={{ color: '#8b949e' }}>预览（atk=15, def=8, heal=30）：</span>
      {isError
        ? <span style={{ color: '#f85149', marginLeft: 8 }}>⚠ 公式有误</span>
        : <span style={{ color: '#3fb950', fontFamily: "'JetBrains Mono'", marginLeft: 8, fontWeight: 700 }}>= {result}</span>}
    </div>
  )
}

export function DeleteBtn({ onConfirm }) {
  const [confirming, setConfirming] = useState(false)
  if (confirming) return (
    <div style={{ display: 'flex', gap: 4 }}>
      <button onClick={onConfirm} style={BTN('rgba(248,81,73,0.15)', '#f85149', { padding: '4px 10px', border: '1px solid rgba(248,81,73,0.3)' })}>确认</button>
      <button onClick={() => setConfirming(false)} style={BTN('transparent', '#8b949e', { padding: '4px 10px', border: '1px solid #30363d' })}>取消</button>
    </div>
  )
  return (
    <button onClick={() => setConfirming(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#484f58', fontSize: 15, padding: '2px 4px' }}>🗑️</button>
  )
}

export function Drawer({ open, onClose, title, children, width = 680 }) {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }} />
      <div style={{ position: 'relative', width, maxWidth: '95vw', height: '100vh', background: '#13171f', borderLeft: '1px solid #30363d', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.5)', animation: 'slideInRight 0.22s ease-out' }}>
        <style>{`@keyframes slideInRight { from { transform: translateX(40px); opacity:0 } to { transform: translateX(0); opacity:1 } }`}</style>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #21262d', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1c2129', flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 20 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>{children}</div>
      </div>
    </div>
  )
}

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
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)', animation: 'fadeInToast .2s ease',
          }}>{t.msg}</div>
        ))}
        <style>{`@keyframes fadeInToast{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
      </div>
    )
  }
  return { show, Container }
}
