'use client'

/**
 * GrantStashModal — 管理员给玩家发放道具的小模态框
 *
 * 用于开发/调试。调用 /api/stash 的 action='grant' 接口，
 * 服务端会校验调用者是否为管理员。
 *
 * Props:
 *   open
 *   onClose()
 *   targetUser — { id, username, email }
 */

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { postGameApi } from '@/lib/gameApi'
import { ITEM_KIND_META } from '@/lib/constants'

const C = {
  bg1: '#1c2129', bg2: '#161b22', bg0: '#0e1117',
  border: '#30363d', border2: '#21262d',
  text: '#e6edf3', dim: '#8b949e', dim2: '#484f58',
  accent: '#58a6ff', green: '#3fb950', red: '#f85149', yellow: '#d29922',
}

export default function GrantStashModal({ open, onClose, targetUser }) {
  const [items, setItems]         = useState([])
  const [search, setSearch]       = useState('')
  const [kindFilter, setKindFilter] = useState('all')
  const [quantities, setQuantities] = useState({}) // { name: qty }
  const [loading, setLoading]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    if (!open) return
    setQuantities({})
    setError('')
    setLoading(true)
    supabase
      .from('item_pool')
      .select('id,name,kind,sub_kind,atk,def,heal,description')
      .order('kind').order('name')
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); setLoading(false); return }
        setItems(data || [])
        setLoading(false)
      })
  }, [open])

  const filtered = useMemo(() => items.filter(it =>
    (kindFilter === 'all' || it.kind === kindFilter)
    && (!search || it.name.includes(search) || (it.description || '').includes(search)),
  ), [items, kindFilter, search])

  const totalCount = Object.values(quantities).reduce((s, n) => s + (n || 0), 0)
  const totalKinds = Object.values(quantities).filter(n => n > 0).length

  function setQty(name, qty) {
    setQuantities(prev => {
      const safe = Math.max(0, qty | 0)
      if (safe === 0) { const next = { ...prev }; delete next[name]; return next }
      return { ...prev, [name]: safe }
    })
  }
  function bump(name, delta) {
    setQty(name, (quantities[name] || 0) + delta)
  }

  async function handleSubmit() {
    if (!targetUser) return
    const payload = Object.entries(quantities)
      .filter(([_, q]) => q > 0)
      .map(([name, quantity]) => ({ name, quantity }))
    if (payload.length === 0) return
    setSubmitting(true)
    setError('')
    try {
      const res = await postGameApi('/api/stash', {
        action: 'grant',
        targetUserId: targetUser.id,
        items: payload,
      })
      if (res?.error) throw new Error(res.error)
      onClose?.({ granted: payload, stash: res?.stash })
    } catch (err) {
      setError(err.message || '发放失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div style={{
        background: C.bg1, borderRadius: 14, border: `1px solid ${C.border}`,
        width: '92%', maxWidth: 720, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '16px 22px', borderBottom: `1px solid ${C.border2}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>📦 发放道具</h3>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 22 }}>✕</button>
          </div>
          {targetUser && (
            <div style={{ marginTop: 4, fontSize: 12, color: C.dim }}>
              目标用户：<span style={{ color: C.accent, fontWeight: 700 }}>{targetUser.username || targetUser.email || targetUser.id}</span>
            </div>
          )}
        </div>

        <div style={{ padding: '14px 22px', borderBottom: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
          <input
            placeholder="🔍 搜索道具…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
              background: C.bg2, color: C.text, fontSize: 13, flex: 1, minWidth: 160, outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {['all', ...Object.keys(ITEM_KIND_META)].map(k => (
              <button
                key={k}
                onClick={() => setKindFilter(k)}
                style={{
                  padding: '6px 10px', borderRadius: 16, fontSize: 11, cursor: 'pointer',
                  border: `1px solid ${kindFilter === k ? C.accent : C.border}`,
                  background: kindFilter === k ? `${C.accent}18` : 'transparent',
                  color: kindFilter === k ? C.accent : C.dim,
                }}
              >
                {k === 'all' ? '全部' : `${ITEM_KIND_META[k].icon} ${ITEM_KIND_META[k].label}`}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
          {loading && <div style={{ textAlign: 'center', color: C.dim, padding: 30 }}>加载道具中…</div>}
          {error && (
            <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 8, background: `${C.red}15`, color: C.red, border: `1px solid ${C.red}30`, fontSize: 12 }}>
              {error}
            </div>
          )}
          {!loading && filtered.map(it => {
            const meta = ITEM_KIND_META[it.kind] || { label: '其他', color: C.dim, icon: '📦' }
            const qty = quantities[it.name] || 0
            return (
              <div key={it.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 8, marginBottom: 6,
                background: qty > 0 ? `${meta.color}10` : C.bg2,
                border: `1px solid ${qty > 0 ? `${meta.color}40` : C.border}`,
                borderLeft: `3px solid ${meta.color}`,
              }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{meta.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{it.name}</div>
                  <div style={{ fontSize: 10, color: C.dim, display: 'flex', gap: 8, marginTop: 2 }}>
                    {it.atk > 0 && <span style={{ color: C.red }}>ATK +{it.atk}</span>}
                    {it.def > 0 && <span style={{ color: C.accent }}>DEF +{it.def}</span>}
                    {it.heal > 0 && <span style={{ color: C.green }}>HEAL +{it.heal}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => bump(it.name, -1)} disabled={qty <= 0} style={btnSquare(qty <= 0)}>−</button>
                  <input
                    type="number" min={0} value={qty}
                    onChange={e => setQty(it.name, parseInt(e.target.value, 10) || 0)}
                    style={{
                      width: 56, padding: '4px 6px', borderRadius: 5, textAlign: 'center',
                      border: `1px solid ${C.border}`, background: C.bg0,
                      color: qty > 0 ? meta.color : C.dim, fontSize: 13, fontWeight: 700, outline: 'none',
                    }}
                  />
                  <button onClick={() => bump(it.name, 1)} style={btnSquare(false)}>+</button>
                </div>
              </div>
            )
          })}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: 'center', color: C.dim2, padding: 30 }}>没有匹配的道具</div>
          )}
        </div>

        <div style={{
          padding: '14px 22px', borderTop: `1px solid ${C.border2}`,
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          <div style={{ fontSize: 12, color: C.dim }}>
            将发放：<strong style={{ color: C.yellow }}>{totalCount}</strong> 件 / <strong style={{ color: C.accent }}>{totalKinds}</strong> 种
          </div>
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{ padding: '9px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.dim, fontSize: 13, cursor: 'pointer' }}
          >取消</button>
          <button
            onClick={handleSubmit}
            disabled={submitting || totalCount === 0}
            style={{
              padding: '9px 22px', borderRadius: 8, border: 'none',
              background: C.green, color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: submitting ? 'wait' : (totalCount === 0 ? 'not-allowed' : 'pointer'),
              opacity: submitting || totalCount === 0 ? 0.6 : 1,
            }}
          >{submitting ? '发放中…' : '✓ 发放'}</button>
        </div>
      </div>
    </div>
  )
}

function btnSquare(disabled) {
  return {
    width: 24, height: 24, borderRadius: 5, border: `1px solid ${C.border}`,
    background: C.bg2, color: disabled ? C.dim2 : C.text,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 14, fontWeight: 700, lineHeight: '20px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    opacity: disabled ? 0.5 : 1,
  }
}
