'use client'

/**
 * LoadoutModal — 进 raid 前的装载界面
 *
 * 加载玩家账户库 (/api/stash) 与道具元数据 (item_pool)，
 * 让用户选择带入 raid 的物资与装备。
 *
 * Props:
 *   open        — 是否打开
 *   onClose()   — 关闭回调
 *   onConfirm({ items, equipmentInstanceIds }) — 确认装载，父组件负责调用 join
 *   roomTitle   — 标题里显示的房间名（可选）
 */

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { getGameApi } from '@/lib/gameApi'
import { ITEM_KIND_META } from '@/lib/constants'

const C = {
  bg0:    '#0e1117',
  bg1:    '#1c2129',
  bg2:    '#161b22',
  border: '#30363d',
  border2:'#21262d',
  text:   '#e6edf3',
  dim:    '#8b949e',
  dim2:   '#484f58',
  accent: '#58a6ff',
  green:  '#3fb950',
  red:    '#f85149',
  yellow: '#d29922',
  purple: '#bc8cff',
}

const RARITY_META = {
  common:    { label: '普通', color: '#8b949e' },
  uncommon:  { label: '优秀', color: '#3fb950' },
  rare:      { label: '稀有', color: '#58a6ff' },
  epic:      { label: '史诗', color: '#bc8cff' },
  legendary: { label: '传说', color: '#d29922' },
  mythic:    { label: '神话', color: '#f85149' },
}

export default function LoadoutModal({ open, onClose, onConfirm, roomTitle }) {
  const [stash, setStash]               = useState(null)
  const [itemDefs, setItemDefs]         = useState({})
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')
  const [confirming, setConfirming]     = useState(false)
  const [selectedItems, setSelectedItems]               = useState({}) // { name: quantity }
  const [selectedEquipments, setSelectedEquipments]     = useState({}) // { instanceId: true }

  // ── 拉取库存 + 道具元数据 ────────────────────
  useEffect(() => {
    if (!open) return
    let canceled = false
    setLoading(true)
    setError('')
    setSelectedItems({})
    setSelectedEquipments({})

    Promise.all([
      getGameApi('/api/stash'),
      supabase.from('item_pool').select('id,name,kind,sub_kind,atk,def,heal,description'),
    ]).then(([stashRes, defsRes]) => {
      if (canceled) return
      const defs = {}
      for (const d of (defsRes?.data || [])) defs[d.name] = d
      setStash(stashRes?.stash || { items: [], equipments: [], capacity: 40, used: 0, slotsLeft: 40 })
      setItemDefs(defs)
      setLoading(false)
    }).catch(err => {
      if (canceled) return
      setError(err.message || '加载失败')
      setLoading(false)
    })

    return () => { canceled = true }
  }, [open])

  // ── 选择计数 ───────────────────────────────
  const totalItemsBrought = useMemo(
    () => Object.values(selectedItems).reduce((s, n) => s + (n || 0), 0),
    [selectedItems],
  )
  const equipmentBroughtCount = Object.values(selectedEquipments).filter(Boolean).length

  function toggleItem(name, max) {
    setSelectedItems(prev => {
      const cur = prev[name] || 0
      // 单击：0 → max；再点：减 1（点击循环）
      if (cur === 0) return { ...prev, [name]: max }
      if (cur === 1) { const next = { ...prev }; delete next[name]; return next }
      return { ...prev, [name]: cur - 1 }
    })
  }
  function setItemQuantity(name, qty, max) {
    const safe = Math.max(0, Math.min(max, qty | 0))
    setSelectedItems(prev => {
      if (safe === 0) { const next = { ...prev }; delete next[name]; return next }
      return { ...prev, [name]: safe }
    })
  }
  function toggleEquipment(instanceId) {
    setSelectedEquipments(prev => {
      const next = { ...prev }
      if (next[instanceId]) delete next[instanceId]
      else next[instanceId] = true
      return next
    })
  }
  function selectAllItems() {
    if (!stash) return
    const map = {}
    for (const it of stash.items) map[it.name] = it.quantity
    setSelectedItems(map)
  }
  function clearSelection() {
    setSelectedItems({})
    setSelectedEquipments({})
  }

  async function handleConfirm() {
    if (!stash) return
    setConfirming(true)
    try {
      const items = Object.entries(selectedItems)
        .filter(([_, q]) => q > 0)
        .map(([name, quantity]) => ({ name, quantity }))
      const equipmentInstanceIds = Object.entries(selectedEquipments)
        .filter(([_, on]) => on)
        .map(([id]) => Number(id))
      await onConfirm({ items, equipmentInstanceIds })
      onClose?.()
    } catch (err) {
      setError(err.message || '装载失败')
    } finally {
      setConfirming(false)
    }
  }

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div style={{
        position: 'relative', background: C.bg1,
        borderRadius: 14, border: `1px solid ${C.border}`,
        width: '92%', maxWidth: 920, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: `0 0 60px rgba(0,0,0,0.6), 0 0 2px ${C.accent}30`,
      }}>
        {/* Header */}
        <div style={{ padding: '16px 22px', borderBottom: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>🎒 装载 <span style={{ color: C.dim, fontWeight: 400, fontSize: 14 }}>{roomTitle ? ` · ${roomTitle}` : ''}</span></h3>
            <div style={{ marginTop: 4, fontSize: 11, color: C.dim }}>
              选择带入 raid 的物资。<span style={{ color: C.red, fontWeight: 700 }}>死亡 = 全部失去</span>，撤离 = 安全归库。
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 22 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: 22, overflowY: 'auto', flex: 1 }}>
          {loading && <div style={{ textAlign: 'center', color: C.dim, padding: 40 }}>加载库存中…</div>}
          {error && (
            <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: `${C.red}15`, color: C.red, border: `1px solid ${C.red}30`, fontSize: 12 }}>
              {error}
            </div>
          )}

          {!loading && stash && (
            <>
              {/* 状态栏 */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                padding: '12px 16px', borderRadius: 10,
                background: `${C.accent}10`, border: `1px solid ${C.accent}25`, marginBottom: 16,
              }}>
                <Stat label="已选道具" value={totalItemsBrought} color={C.yellow} />
                <Stat label="已选装备" value={equipmentBroughtCount} color={C.purple} />
                <Stat label="库容" value={`${stash.used} / ${stash.capacity}`} color={C.dim} />
                <div style={{ flex: 1 }} />
                <button
                  onClick={selectAllItems}
                  style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: `${C.accent}15`, border: `1px solid ${C.accent}30`, color: C.accent }}
                >全选道具</button>
                <button
                  onClick={clearSelection}
                  style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: `${C.dim2}15`, border: `1px solid ${C.dim2}40`, color: C.dim }}
                >清空</button>
              </div>

              {/* 装备区 */}
              {stash.equipments.length > 0 && (
                <Section title="🛡️ 装备" count={stash.equipments.length}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                    {stash.equipments.map(inst => {
                      const tier = inst.tier
                      const rarity = RARITY_META[tier?.rarity] || RARITY_META.common
                      const selected = !!selectedEquipments[inst.id]
                      return (
                        <div
                          key={inst.id}
                          onClick={() => toggleEquipment(inst.id)}
                          style={{
                            padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                            background: selected ? `${rarity.color}15` : C.bg2,
                            border: `1px solid ${selected ? rarity.color : C.border}`,
                            borderLeft: `3px solid ${rarity.color}`,
                            transition: 'all .15s',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11 }}>{selected ? '✅' : '⬜'}</span>
                            <span style={{ fontWeight: 700, color: rarity.color, flex: 1, fontSize: 13 }}>{tier?.name || '未知装备'}</span>
                            <span style={{ fontSize: 10, color: C.dim }}>{tier?.series?.slot || inst.equipped_slot || ''}</span>
                          </div>
                          <div style={{ marginTop: 4, fontSize: 11, color: C.dim, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {tier?.base_atk > 0 && <span style={{ color: C.red }}>ATK +{tier.base_atk + (inst.bonus_atk || 0)}</span>}
                            {tier?.base_def > 0 && <span style={{ color: C.accent }}>DEF +{tier.base_def + (inst.bonus_def || 0)}</span>}
                            {tier?.durability_max > 0 && (
                              <span style={{ color: inst.durability_current / tier.durability_max < 0.25 ? C.red : C.dim }}>
                                耐久 {inst.durability_current}/{tier.durability_max}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Section>
              )}

              {/* 道具区 */}
              {stash.items.length > 0 ? (
                <Section title="📦 道具" count={stash.items.length}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                    {stash.items.map(it => {
                      const def = itemDefs[it.name] || {}
                      const meta = ITEM_KIND_META[def.kind] || ITEM_KIND_META.special
                      const qty = selectedItems[it.name] || 0
                      const max = it.quantity
                      return (
                        <div
                          key={it.name}
                          style={{
                            padding: '10px 12px', borderRadius: 10,
                            background: qty > 0 ? `${meta.color}10` : C.bg2,
                            border: `1px solid ${qty > 0 ? `${meta.color}50` : C.border}`,
                            borderLeft: `3px solid ${meta.color}`,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 14 }}>{meta.icon}</span>
                            <span style={{ fontWeight: 600, color: C.text, flex: 1, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
                            <span style={{ fontSize: 10, color: C.dim, fontFamily: 'monospace' }}>×{max}</span>
                          </div>
                          <div style={{ marginTop: 4, fontSize: 11, color: C.dim, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {def.atk > 0 && <span style={{ color: C.red }}>ATK +{def.atk}</span>}
                            {def.def > 0 && <span style={{ color: C.accent }}>DEF +{def.def}</span>}
                            {def.heal > 0 && <span style={{ color: C.green }}>HEAL +{def.heal}</span>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                            <button
                              onClick={() => setItemQuantity(it.name, qty - 1, max)}
                              disabled={qty <= 0}
                              style={btnSquare(qty <= 0)}
                            >−</button>
                            <input
                              type="number"
                              min={0} max={max}
                              value={qty}
                              onChange={e => setItemQuantity(it.name, parseInt(e.target.value, 10) || 0, max)}
                              style={{
                                width: 56, padding: '4px 6px', borderRadius: 5,
                                border: `1px solid ${C.border}`, background: C.bg0,
                                color: qty > 0 ? meta.color : C.dim, fontSize: 13,
                                fontWeight: 700, outline: 'none', textAlign: 'center',
                              }}
                            />
                            <button
                              onClick={() => setItemQuantity(it.name, qty + 1, max)}
                              disabled={qty >= max}
                              style={btnSquare(qty >= max)}
                            >+</button>
                            <div style={{ flex: 1 }} />
                            <button
                              onClick={() => toggleItem(it.name, max)}
                              style={{
                                padding: '3px 10px', borderRadius: 6, fontSize: 11,
                                cursor: 'pointer', background: `${meta.color}15`,
                                color: meta.color, border: `1px solid ${meta.color}30`,
                              }}
                            >{qty === max ? '清零' : qty > 0 ? '减一' : '全选'}</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Section>
              ) : (
                stash.equipments.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 60, color: C.dim2 }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>🎒</div>
                    <p style={{ margin: 0 }}>账户库为空，可空手进 raid，搜到的物资撤离后入库。</p>
                  </div>
                )
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: C.dim }}>
            将带入：{totalItemsBrought} 件道具 + {equipmentBroughtCount} 件装备
          </div>
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              padding: '9px 16px', borderRadius: 8, border: `1px solid ${C.border}`,
              background: 'transparent', color: C.dim, fontSize: 13, cursor: 'pointer',
            }}
          >取消</button>
          <button
            onClick={handleConfirm}
            disabled={confirming || loading}
            style={{
              padding: '9px 22px', borderRadius: 8, border: 'none',
              background: C.accent, color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: confirming ? 'wait' : 'pointer', opacity: confirming || loading ? 0.6 : 1,
            }}
          >{confirming ? '装载中…' : '✓ 进入 raid'}</button>
        </div>
      </div>
    </div>
  )
}

// ── 子组件 ─────────────────────────────────────
function Section({ title, count, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 11, color: C.dim, fontWeight: 700, marginBottom: 8,
        textTransform: 'uppercase', letterSpacing: '0.5px',
      }}>{title} <span style={{ color: C.dim2, fontWeight: 400 }}>· {count}</span></div>
      {children}
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: 'var(--font-jetbrains-mono), monospace', marginTop: 2 }}>{value}</div>
    </div>
  )
}

function btnSquare(disabled) {
  return {
    width: 24, height: 24, borderRadius: 5,
    border: `1px solid ${C.border}`, background: C.bg2,
    color: disabled ? C.dim2 : C.text, cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 14, fontWeight: 700, lineHeight: '20px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    opacity: disabled ? 0.5 : 1,
  }
}
