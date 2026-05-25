'use client'

/**
 * PrepareModal — Phase 24b 入场准备模态（替代 LoadoutModal）
 *
 * 3 tab:
 *   1. 装备购买 — 从 shop_catalog (entry_kind=equipment) 选 4 槽
 *   2. 道具购买 — 从 shop_catalog (entry_kind=consumable/story_item) 累加 qty
 *   3. 商店兑换 — shop_exchange_rates 跨类型互换
 *
 * 持久 points 余额栏（4 类）显示当前余额 - cart 扣除后预览
 *
 * Props:
 *   open
 *   onClose()
 *   onConfirm({ catalogPurchases: [{catalogId, qty}], exchanges: [{rateId, times}] })
 *   roomTitle
 */

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/layout'

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
  orange: '#ff8c42',
}

const POINT_META = {
  high_equip_pt: { label: '高级装备点', icon: '⚔', color: C.purple },
  low_equip_pt:  { label: '普通装备点', icon: '🛡', color: C.accent },
  item_pt:       { label: '道具点',     icon: '💊', color: C.yellow },
  class_pt:      { label: '职业点',     icon: '✦',  color: C.orange },
}

const RARITY_COLOR = {
  common: '#8b949e', uncommon: '#3fb950', rare: '#58a6ff',
  epic: '#bc8cff', legendary: '#d29922', mythic: '#f85149',
}

const SLOT_LABEL = {
  probe: '探测', shield: '防护', weapon: '武器', comm: '通信',
}

export default function PrepareModal({ open, onClose, onConfirm, roomTitle }) {
  const { user } = useAuth()
  const [tab, setTab] = useState('equipment')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  const [balances, setBalances] = useState({ high_equip_pt: 0, low_equip_pt: 0, item_pt: 0, class_pt: 0 })
  const [catalog, setCatalog] = useState({ equipment: [], consumables: [], storyItems: [] })
  const [rates, setRates] = useState([])

  // cart 状态
  const [equipCart, setEquipCart] = useState({}) // { catalogId: true } — 装备每件 qty=1
  const [itemCart, setItemCart] = useState({})   // { catalogId: qty }
  const [exchangeCart, setExchangeCart] = useState({}) // { rateId: times }

  // ── 加载数据 ──
  useEffect(() => {
    if (!open || !user?.id) return
    let cancelled = false
    setLoading(true)
    setError('')
    setEquipCart({})
    setItemCart({})
    setExchangeCart({})
    setTab('equipment')

    Promise.all([
      supabase.from('player_points').select('point_type, balance').eq('user_id', user.id),
      supabase
        .from('shop_catalog')
        .select(`
          id, entry_kind, tier_id, item_name, point_type, cost, display_order,
          equipment_tiers (
            id, name, rarity, base_atk, base_def, base_hp, durability_max,
            equipment_series ( name, slot )
          ),
          item_pool:item_name ( name, kind, sub_kind, heal, atk, def, description )
        `)
        .eq('enabled', true)
        .order('display_order'),
      supabase.from('shop_exchange_rates').select('*').eq('enabled', true),
    ]).then(([balRes, catRes, ratesRes]) => {
      if (cancelled) return
      const b = { high_equip_pt: 0, low_equip_pt: 0, item_pt: 0, class_pt: 0 }
      for (const row of (balRes?.data || [])) b[row.point_type] = Number(row.balance) || 0
      setBalances(b)

      const cat = catRes?.data || []
      setCatalog({
        equipment: cat.filter(r => r.entry_kind === 'equipment'),
        consumables: cat.filter(r => r.entry_kind === 'consumable'),
        storyItems: cat.filter(r => r.entry_kind === 'story_item'),
      })
      setRates(ratesRes?.data || [])
    }).catch(e => {
      if (!cancelled) setError(`加载失败：${e?.message || e}`)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [open, user?.id])

  // ── 计算 cart 扣点（含 exchange 影响） ──
  const previewBalances = useMemo(() => {
    const out = { ...balances }

    // 1) 兑换：先扣 from 再加 to（按顺序，保证中间余额准确）
    for (const [rateId, times] of Object.entries(exchangeCart)) {
      const T = Number(times) || 0
      if (T <= 0) continue
      const rate = rates.find(r => r.id === Number(rateId))
      if (!rate) continue
      out[rate.from_type] = (out[rate.from_type] || 0) - rate.from_amount * T
      out[rate.to_type] = (out[rate.to_type] || 0) + rate.to_amount * T
    }

    // 2) 装备购买
    for (const cid of Object.keys(equipCart)) {
      if (!equipCart[cid]) continue
      const row = catalog.equipment.find(c => c.id === Number(cid))
      if (!row) continue
      out[row.point_type] = (out[row.point_type] || 0) - row.cost
    }

    // 3) 消耗品+剧情物品
    for (const [cid, qty] of Object.entries(itemCart)) {
      const Q = Number(qty) || 0
      if (Q <= 0) continue
      const row = [...catalog.consumables, ...catalog.storyItems].find(c => c.id === Number(cid))
      if (!row) continue
      out[row.point_type] = (out[row.point_type] || 0) - row.cost * Q
    }

    return out
  }, [balances, equipCart, itemCart, exchangeCart, rates, catalog])

  const hasInsufficient = useMemo(
    () => Object.values(previewBalances).some(v => v < 0),
    [previewBalances],
  )

  const cartSummary = useMemo(() => {
    const equipCount = Object.values(equipCart).filter(Boolean).length
    const itemCount = Object.values(itemCart).reduce((s, q) => s + (Number(q) || 0), 0)
    const exchangeCount = Object.values(exchangeCart).reduce((s, t) => s + (Number(t) || 0), 0)
    return { equipCount, itemCount, exchangeCount }
  }, [equipCart, itemCart, exchangeCart])

  // 装备槽冲突检测：每个 slot 至多 1 件
  const equipSlots = useMemo(() => {
    const slots = { probe: null, shield: null, weapon: null, comm: null }
    for (const cid of Object.keys(equipCart)) {
      if (!equipCart[cid]) continue
      const row = catalog.equipment.find(c => c.id === Number(cid))
      const slot = row?.equipment_tiers?.equipment_series?.slot
      if (slot && slots[slot] == null) slots[slot] = row
    }
    return slots
  }, [equipCart, catalog.equipment])

  function toggleEquip(row) {
    const slot = row.equipment_tiers?.equipment_series?.slot
    if (!slot) return
    setEquipCart(prev => {
      const next = { ...prev }
      // 如果已经选中，取消
      if (next[row.id]) {
        delete next[row.id]
        return next
      }
      // 否则替换该槽位现有选择
      for (const cid of Object.keys(next)) {
        const r = catalog.equipment.find(c => c.id === Number(cid))
        if (r?.equipment_tiers?.equipment_series?.slot === slot) delete next[cid]
      }
      next[row.id] = true
      return next
    })
  }

  function changeItemQty(catalogId, delta) {
    setItemCart(prev => {
      const cur = Number(prev[catalogId]) || 0
      const next = Math.max(0, cur + delta)
      const out = { ...prev }
      if (next === 0) delete out[catalogId]
      else out[catalogId] = next
      return out
    })
  }

  function changeExchange(rateId, delta) {
    setExchangeCart(prev => {
      const cur = Number(prev[rateId]) || 0
      const next = Math.max(0, cur + delta)
      const out = { ...prev }
      if (next === 0) delete out[rateId]
      else out[rateId] = next
      return out
    })
  }

  async function handleConfirm() {
    if (hasInsufficient) return
    setConfirming(true)
    try {
      const catalogPurchases = []
      for (const cid of Object.keys(equipCart)) {
        if (equipCart[cid]) catalogPurchases.push({ catalogId: Number(cid), qty: 1 })
      }
      for (const [cid, qty] of Object.entries(itemCart)) {
        const Q = Number(qty) || 0
        if (Q > 0) catalogPurchases.push({ catalogId: Number(cid), qty: Q })
      }
      const exchanges = []
      for (const [rid, times] of Object.entries(exchangeCart)) {
        const T = Number(times) || 0
        if (T > 0) exchanges.push({ rateId: Number(rid), times: T })
      }
      await onConfirm({ catalogPurchases, exchanges })
    } catch (e) {
      setError(e?.message || '提交失败')
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
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(4px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div style={{
        background: C.bg1, borderRadius: 14, border: `1px solid ${C.border}`,
        width: '95%', maxWidth: 980, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: `0 0 60px rgba(0,0,0,0.6), 0 0 2px ${C.accent}30`,
        overflow: 'hidden',
      }}>
        {/* 顶部标题 + 关闭 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>🎒 入场准备</div>
            {roomTitle && <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{roomTitle}</div>}
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(14,17,23,0.5)', border: `1px solid ${C.border}`, borderRadius: 6,
            padding: '4px 10px', color: C.dim, cursor: 'pointer', fontSize: 16,
          }}>✕</button>
        </div>

        {/* 4 类点数余额栏 */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
          padding: '12px 20px', borderBottom: `1px solid ${C.border}`, background: C.bg0, flexShrink: 0,
        }}>
          {['high_equip_pt', 'low_equip_pt', 'item_pt', 'class_pt'].map(t => {
            const meta = POINT_META[t]
            const cur = balances[t] || 0
            const preview = previewBalances[t] || 0
            const insufficient = preview < 0
            return (
              <div key={t} style={{
                padding: '8px 10px', borderRadius: 8,
                background: insufficient ? `${C.red}15` : C.bg2,
                border: `1px solid ${insufficient ? C.red : C.border}`,
                borderLeft: `3px solid ${meta.color}`,
              }}>
                <div style={{ fontSize: 10, color: C.dim, marginBottom: 2 }}>
                  {meta.icon} {meta.label}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: insufficient ? C.red : meta.color, fontFamily: 'monospace' }}>
                    {preview}
                  </span>
                  {preview !== cur && (
                    <span style={{ fontSize: 10, color: C.dim2, textDecoration: 'line-through' }}>{cur}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* tab 切换 */}
        <div style={{
          display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          {[
            { key: 'equipment', label: `⚔ 装备购买${cartSummary.equipCount > 0 ? ` (${cartSummary.equipCount}/4)` : ''}` },
            { key: 'consumable', label: `💊 道具购买${cartSummary.itemCount > 0 ? ` (${cartSummary.itemCount})` : ''}` },
            { key: 'exchange',  label: `💱 商店兑换${cartSummary.exchangeCount > 0 ? ` (${cartSummary.exchangeCount})` : ''}` },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: '10px 0', cursor: 'pointer',
              background: tab === t.key ? C.bg2 : 'transparent',
              border: 'none', borderBottom: `2px solid ${tab === t.key ? C.accent : 'transparent'}`,
              color: tab === t.key ? C.text : C.dim, fontWeight: 600, fontSize: 13,
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {loading && <div style={{ textAlign: 'center', padding: 40, color: C.dim }}>加载中...</div>}
          {error && <div style={{ color: C.red, padding: 12, background: `${C.red}10`, borderRadius: 6 }}>{error}</div>}

          {!loading && !error && tab === 'equipment' && (
            <EquipmentList rows={catalog.equipment} cart={equipCart} slotsState={equipSlots} onToggle={toggleEquip} previewBal={previewBalances} />
          )}
          {!loading && !error && tab === 'consumable' && (
            <ItemList rows={[...catalog.consumables, ...catalog.storyItems]} cart={itemCart} onChange={changeItemQty} previewBal={previewBalances} />
          )}
          {!loading && !error && tab === 'exchange' && (
            <ExchangeList rates={rates} cart={exchangeCart} onChange={changeExchange} previewBal={previewBalances} />
          )}
        </div>

        {/* 底部确认 */}
        <div style={{
          padding: '12px 20px', borderTop: `1px solid ${C.border}`, flexShrink: 0,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 11, color: hasInsufficient ? C.red : C.dim }}>
            {hasInsufficient
              ? '⚠ 点数不足，请减少购买或先兑换'
              : `已选 ${cartSummary.equipCount} 装备 / ${cartSummary.itemCount} 道具 / ${cartSummary.exchangeCount} 次兑换`}
          </div>
          <button
            onClick={handleConfirm}
            disabled={hasInsufficient || confirming}
            style={{
              padding: '10px 28px', borderRadius: 8, border: 'none',
              background: hasInsufficient ? C.bg0 : C.green,
              color: hasInsufficient ? C.dim2 : '#fff',
              cursor: hasInsufficient || confirming ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 700,
              opacity: confirming ? 0.6 : 1,
            }}
          >
            {confirming ? '装载中...' : '🚀 进入异常段'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────── 子组件 ─────────────────────────────

function EquipmentList({ rows, cart, slotsState, onToggle, previewBal }) {
  // 按 slot 分组
  const grouped = useMemo(() => {
    const out = { probe: [], shield: [], weapon: [], comm: [] }
    for (const r of rows) {
      const slot = r.equipment_tiers?.equipment_series?.slot
      if (slot && out[slot]) out[slot].push(r)
    }
    return out
  }, [rows])

  if (rows.length === 0) return <div style={{ color: C.dim, textAlign: 'center', padding: 30 }}>商店暂无装备</div>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
      {['probe', 'shield', 'weapon', 'comm'].map(slot => (
        <div key={slot}>
          <div style={{ fontSize: 11, color: C.dim, fontWeight: 700, marginBottom: 6, letterSpacing: 1 }}>
            {SLOT_LABEL[slot]} {slotsState[slot] && <span style={{ color: C.green }}>✓ 已选</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {grouped[slot].length === 0 && <div style={{ fontSize: 11, color: C.dim2 }}>暂无</div>}
            {grouped[slot].map(r => {
              const tier = r.equipment_tiers || {}
              const rar = tier.rarity || 'common'
              const isSelected = !!cart[r.id]
              const canAfford = previewBal[r.point_type] >= 0 || isSelected
              return (
                <div key={r.id}
                  onClick={() => onToggle(r)}
                  style={{
                    padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                    background: isSelected ? `${RARITY_COLOR[rar]}20` : C.bg2,
                    border: `1px solid ${isSelected ? RARITY_COLOR[rar] : C.border}`,
                    opacity: !canAfford ? 0.5 : 1,
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 12, color: RARITY_COLOR[rar] }}>
                      {tier.name || `tier#${tier.id}`}
                    </span>
                    <span style={{ fontSize: 11, color: POINT_META[r.point_type]?.color || C.dim }}>
                      {POINT_META[r.point_type]?.icon} {r.cost}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>
                    ATK {tier.base_atk || 0} · DEF {tier.base_def || 0} · HP {tier.base_hp || 0} · Dur {tier.durability_max || '-'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function ItemList({ rows, cart, onChange, previewBal }) {
  if (rows.length === 0) return <div style={{ color: C.dim, textAlign: 'center', padding: 30 }}>商店暂无道具</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(r => {
        const item = r.item_pool || {}
        const qty = Number(cart[r.id]) || 0
        const canAddMore = previewBal[r.point_type] >= r.cost
        return (
          <div key={r.id} style={{
            display: 'grid', gridTemplateColumns: '1fr auto', gap: 12,
            padding: '8px 12px', borderRadius: 6, background: C.bg2, border: `1px solid ${C.border}`,
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{item.name || r.item_name}</span>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: `${C.dim}20`, color: C.dim }}>
                  {item.kind || r.entry_kind}
                </span>
                <span style={{ fontSize: 11, color: POINT_META[r.point_type]?.color || C.dim }}>
                  {POINT_META[r.point_type]?.icon} {r.cost} / 个
                </span>
              </div>
              {item.description && (
                <div style={{ fontSize: 11, color: C.dim, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.description}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => onChange(r.id, -1)} disabled={qty === 0}
                style={btn(qty === 0)}>-</button>
              <span style={{ minWidth: 28, textAlign: 'center', fontWeight: 700, color: qty > 0 ? POINT_META[r.point_type]?.color : C.dim2 }}>{qty}</span>
              <button onClick={() => onChange(r.id, 1)} disabled={!canAddMore}
                style={btn(!canAddMore)}>+</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ExchangeList({ rates, cart, onChange, previewBal }) {
  if (rates.length === 0) return <div style={{ color: C.dim, textAlign: 'center', padding: 30 }}>商店暂无兑换汇率</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rates.map(r => {
        const times = Number(cart[r.id]) || 0
        const fromMeta = POINT_META[r.from_type]
        const toMeta = POINT_META[r.to_type]
        const canAddMore = previewBal[r.from_type] >= r.from_amount
        return (
          <div key={r.id} style={{
            display: 'grid', gridTemplateColumns: '1fr auto', gap: 12,
            padding: '10px 14px', borderRadius: 6, background: C.bg2, border: `1px solid ${C.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
              <span style={{ padding: '2px 8px', borderRadius: 6, background: `${fromMeta?.color}18`, color: fromMeta?.color, fontWeight: 600 }}>
                {r.from_amount} {fromMeta?.icon} {fromMeta?.label}
              </span>
              <span style={{ color: C.dim }}>→</span>
              <span style={{ padding: '2px 8px', borderRadius: 6, background: `${toMeta?.color}18`, color: toMeta?.color, fontWeight: 700 }}>
                {r.to_amount} {toMeta?.icon} {toMeta?.label}
              </span>
              {r.description && <span style={{ fontSize: 10, color: C.dim2, marginLeft: 6 }}>{r.description}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => onChange(r.id, -1)} disabled={times === 0} style={btn(times === 0)}>-</button>
              <span style={{ minWidth: 28, textAlign: 'center', fontWeight: 700, color: times > 0 ? toMeta?.color : C.dim2 }}>×{times}</span>
              <button onClick={() => onChange(r.id, 1)} disabled={!canAddMore} style={btn(!canAddMore)}>+</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function btn(disabled) {
  return {
    width: 28, height: 28, borderRadius: 4,
    background: disabled ? '#0a0d12' : '#21262d',
    border: `1px solid ${disabled ? '#21262d' : '#30363d'}`,
    color: disabled ? '#484f58' : '#e6edf3',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 700, fontSize: 14,
  }
}
