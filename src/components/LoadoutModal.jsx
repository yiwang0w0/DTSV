'use client'

/**
 * LoadoutModal — 远星函馆双 4 槽位装载界面
 *
 * 4 装备槽（probe / shield / weapon / comm，每槽 1 件）
 * + 4 消耗品槽（每槽 1 件，从库存按 kind=consumable 选）
 *
 * Props:
 *   open
 *   onClose()
 *   onConfirm({ loadout, consumables }) — loadout 为 4 槽 instanceId map，
 *                                         consumables 为长度 ≤4 的字符串数组
 *   roomTitle
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getGameApi } from '@/lib/gameApi'
import {
  ITEM_KIND_META,
  LOADOUT_SLOT_META,
  LOADOUT_SLOTS,
  LOADOUT_CONSUMABLE_CAP,
} from '@/lib/constants'

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
  // 4 装备槽：{ probe: instanceId|null, shield: ..., weapon: ..., comm: ... }
  const [loadout, setLoadout]           = useState({ probe: null, shield: null, weapon: null, comm: null })
  // 4 消耗品槽：[name|null, name|null, name|null, name|null]
  const [consumables, setConsumables]   = useState([null, null, null, null])

  // ── 拉取库存 + 道具元数据 ────────────────────
  useEffect(() => {
    if (!open) return
    let canceled = false
    setLoading(true)
    setError('')
    setLoadout({ probe: null, shield: null, weapon: null, comm: null })
    setConsumables([null, null, null, null])

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

  // 装备实例按 slot 分组
  const equipmentBySlot = useMemo(() => {
    const map = { probe: [], shield: [], weapon: [], comm: [] }
    for (const inst of (stash?.equipments || [])) {
      const slot = inst.tier?.series?.slot
      if (slot && map[slot]) map[slot].push(inst)
    }
    return map
  }, [stash])

  // 库存按 kind=consumable 过滤
  const consumableItems = useMemo(() => {
    if (!stash) return []
    return stash.items.filter(it => itemDefs[it.name]?.kind === 'consumable')
  }, [stash, itemDefs])

  // 消耗品名 → 库存上限
  const consumableMaxByName = useMemo(() => {
    const m = {}
    for (const it of consumableItems) m[it.name] = it.quantity
    return m
  }, [consumableItems])

  // 同名消耗品在 4 槽中已选数量
  const selectedConsumableUsage = useMemo(() => {
    const usage = {}
    for (const name of consumables) {
      if (!name) continue
      usage[name] = (usage[name] || 0) + 1
    }
    return usage
  }, [consumables])

  const equipmentCount = LOADOUT_SLOTS.filter(s => loadout[s]).length
  const consumableCount = consumables.filter(Boolean).length
  const totalLoad = equipmentCount + consumableCount
  const TOTAL_CAP = LOADOUT_SLOTS.length + LOADOUT_CONSUMABLE_CAP

  const setEquipSlot = useCallback((slot, instanceId) => {
    setLoadout(prev => ({ ...prev, [slot]: instanceId }))
  }, [])

  const setConsumableSlot = useCallback((idx, name) => {
    setConsumables(prev => prev.map((v, i) => i === idx ? name : v))
  }, [])

  function clearAll() {
    setLoadout({ probe: null, shield: null, weapon: null, comm: null })
    setConsumables([null, null, null, null])
  }

  async function handleConfirm() {
    if (!stash) return
    setConfirming(true)
    try {
      // 校验消耗品总数不超库存
      for (const [name, used] of Object.entries(selectedConsumableUsage)) {
        const max = consumableMaxByName[name] || 0
        if (used > max) {
          throw new Error(`${name} 库存不足（需要 ${used}，剩余 ${max}）`)
        }
      }
      const items = Object.entries(selectedConsumableUsage)
        .map(([name, quantity]) => ({ name, quantity }))
      await onConfirm({
        loadout,
        consumables: consumables.filter(Boolean),
        items,                                          // 兼容旧 shape，等同 consumables 聚合
        equipmentInstanceIds: LOADOUT_SLOTS
          .map(s => loadout[s])
          .filter(Boolean)
          .map(Number),
      })
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
        <div style={{ padding: '16px 22px', borderBottom: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>
              🎒 装载
              <span style={{ color: C.dim, fontWeight: 400, fontSize: 14 }}>{roomTitle ? ` · ${roomTitle}` : ''}</span>
            </h3>
            <div style={{ marginTop: 4, fontSize: 11, color: C.dim }}>
              4 装备槽 + 4 消耗品槽，最多带入 {TOTAL_CAP} 件。
              <span style={{ color: C.red, fontWeight: 700 }}> 死亡 = 全部失去</span>，撤离 = 安全归库。
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 22 }}>✕</button>
        </div>

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
                <Stat label="装备" value={`${equipmentCount} / 4`} color={C.purple} />
                <Stat label="消耗品" value={`${consumableCount} / 4`} color={C.yellow} />
                <Stat label="总载荷" value={`${totalLoad} / ${TOTAL_CAP}`} color={C.accent} />
                <Stat label="账户库容" value={`${stash.used} / ${stash.capacity}`} color={C.dim} />
                <div style={{ flex: 1 }} />
                <button
                  onClick={clearAll}
                  style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: `${C.dim2}15`, border: `1px solid ${C.dim2}40`, color: C.dim }}
                >清空</button>
              </div>

              {/* 装备槽 2×2 */}
              <Section title="🛡️ 装备 4 槽">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {LOADOUT_SLOTS.map(slot => (
                    <EquipmentSlotCard
                      key={slot}
                      slot={slot}
                      instances={equipmentBySlot[slot] || []}
                      selectedId={loadout[slot]}
                      onChange={(id) => setEquipSlot(slot, id)}
                    />
                  ))}
                </div>
              </Section>

              {/* 消耗品槽 1×4 */}
              <Section title="💊 消耗品 4 槽">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {consumables.map((name, idx) => (
                    <ConsumableSlotCard
                      key={idx}
                      idx={idx}
                      currentName={name}
                      options={consumableItems}
                      itemDefs={itemDefs}
                      usage={selectedConsumableUsage}
                      onChange={(n) => setConsumableSlot(idx, n)}
                    />
                  ))}
                </div>
              </Section>

              {(stash.equipments.length === 0 && consumableItems.length === 0) && (
                <div style={{ textAlign: 'center', padding: 30, color: C.dim2 }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>🎒</div>
                  <p style={{ margin: 0, fontSize: 12 }}>账户库为空，可空手进 raid，搜到的物资撤离后入库。</p>
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ padding: '14px 22px', borderTop: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 12, color: C.dim }}>
            将带入：<strong style={{ color: C.purple }}>{equipmentCount}</strong> 件装备 +
            <strong style={{ color: C.yellow }}> {consumableCount}</strong> 件消耗品
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

// ── 装备槽卡片 ─────────────────────────────────
function EquipmentSlotCard({ slot, instances, selectedId, onChange }) {
  const meta = LOADOUT_SLOT_META[slot]
  const filled = !!selectedId
  const sel = instances.find(i => i.id === selectedId) || null
  const tier = sel?.tier
  const rarity = RARITY_META[tier?.rarity] || RARITY_META.common

  return (
    <div style={{
      padding: '12px 14px', borderRadius: 10,
      background: filled ? `${meta.color}10` : C.bg2,
      border: `1px solid ${filled ? `${meta.color}50` : C.border}`,
      borderLeft: `3px solid ${meta.color}`,
      minHeight: 110,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 16 }}>{meta.icon}</span>
        <span style={{ fontWeight: 700, color: meta.color, fontSize: 13 }}>{meta.label}</span>
        <span style={{ fontSize: 10, color: C.dim2 }}>{slot}</span>
      </div>
      <div style={{ fontSize: 10, color: C.dim, marginBottom: 8 }}>{meta.desc}</div>

      {instances.length === 0 ? (
        <div style={{ fontSize: 11, color: C.dim2, fontStyle: 'italic' }}>
          库中无可用 {meta.label}
        </div>
      ) : (
        <select
          value={selectedId || ''}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          style={{
            width: '100%', padding: '6px 8px', borderRadius: 6,
            border: `1px solid ${C.border}`, background: C.bg0,
            color: filled ? rarity.color : C.dim, fontSize: 12, fontWeight: 700, outline: 'none',
          }}
        >
          <option value="">— 不装载 —</option>
          {instances.map(inst => (
            <option key={inst.id} value={inst.id}>
              {inst.tier?.name || `实例 ${inst.id}`}
              {inst.tier?.base_atk > 0 ? ` · ATK+${inst.tier.base_atk + (inst.bonus_atk || 0)}` : ''}
              {inst.tier?.base_def > 0 ? ` · DEF+${inst.tier.base_def + (inst.bonus_def || 0)}` : ''}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

// ── 消耗品槽卡片 ────────────────────────────────
function ConsumableSlotCard({ idx, currentName, options, itemDefs, usage, onChange }) {
  const def = currentName ? (itemDefs[currentName] || {}) : null
  const meta = def ? (ITEM_KIND_META[def.kind] || ITEM_KIND_META.consumable) : null
  const filled = !!currentName

  return (
    <div style={{
      padding: '10px 12px', borderRadius: 10,
      background: filled ? `${meta.color}10` : C.bg2,
      border: `1px solid ${filled ? `${meta.color}50` : C.border}`,
      borderLeft: `3px solid ${filled ? meta.color : C.dim2}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: C.dim2, fontFamily: 'monospace' }}>#{idx + 1}</span>
        {filled && <span style={{ fontSize: 14 }}>{meta.icon}</span>}
      </div>
      <select
        value={currentName || ''}
        onChange={e => onChange(e.target.value === '' ? null : e.target.value)}
        style={{
          width: '100%', padding: '6px 8px', borderRadius: 6,
          border: `1px solid ${C.border}`, background: C.bg0,
          color: filled ? meta.color : C.dim, fontSize: 12, fontWeight: 600, outline: 'none',
        }}
      >
        <option value="">— 空槽 —</option>
        {options.map(opt => {
          const used = usage[opt.name] || 0
          const adjustedMax = opt.quantity - (currentName === opt.name ? used - 1 : used)
          if (adjustedMax <= 0 && currentName !== opt.name) return null
          return (
            <option key={opt.name} value={opt.name}>
              {opt.name} · 库 {opt.quantity}
            </option>
          )
        })}
      </select>
      {filled && def?.heal > 0 && (
        <div style={{ marginTop: 4, fontSize: 10, color: C.green }}>HEAL +{def.heal}</div>
      )}
    </div>
  )
}

// ── 公共组件 ───────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 11, color: C.dim, fontWeight: 700, marginBottom: 8,
        textTransform: 'uppercase', letterSpacing: '0.5px',
      }}>{title}</div>
      {children}
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: 'var(--font-jetbrains-mono), monospace', marginTop: 2 }}>{value}</div>
    </div>
  )
}
