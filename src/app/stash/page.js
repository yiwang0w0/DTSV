'use client'

/**
 * /stash — 玩家账户库浏览页
 *
 * 展示当前玩家的所有库存：消耗品/材料 + 装备实例。
 * 真正的"装载"操作发生在 /rooms 加入 raid 时（PrepareModal）。
 */

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getGameApi } from '@/lib/gameApi'
import { useAuth } from '../layout'
import { Spinner, useToast } from '../admin/_shared/ui'
import { ITEM_KIND_META } from '@/lib/constants'

const C = {
  bg0:    '#0e1117',
  bg1:    '#1c2129',
  bg2:    '#161b22',
  border: '#30363d',
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

export default function StashPage() {
  const { user, loading: authLoading } = useAuth()
  const { show: toast, Container: ToastContainer } = useToast()
  const [stash, setStash]       = useState(null)
  const [itemDefs, setItemDefs] = useState({})
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!user) return
    let canceled = false
    Promise.all([
      getGameApi('/api/stash'),
      supabase.from('item_pool').select('id,name,kind,sub_kind,atk,def,heal,description'),
    ]).then(([stashRes, defsRes]) => {
      if (canceled) return
      const defs = {}
      for (const d of (defsRes?.data || [])) defs[d.name] = d
      setStash(stashRes?.stash || null)
      setItemDefs(defs)
      setLoading(false)
    }).catch(err => {
      if (canceled) return
      toast(err.message || '加载失败', 'error')
      setLoading(false)
    })
    return () => { canceled = true }
  }, [user, toast])

  const itemsByKind = useMemo(() => {
    if (!stash) return {}
    const groups = {}
    for (const it of stash.items) {
      const def = itemDefs[it.name] || {}
      const kind = def.kind || 'consumable'
      if (!groups[kind]) groups[kind] = []
      groups[kind].push({ ...it, def })
    }
    return groups
  }, [stash, itemDefs])

  if (authLoading || loading) return <Spinner />

  if (!user) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <p style={{ color: C.dim, fontSize: 16 }}>
          请先 <Link href="/login" style={{ color: C.accent }}>登录</Link> 后查看账户库
        </p>
      </div>
    )
  }

  if (!stash) return null

  return (
    <div className="animate-in">
      <ToastContainer />

      {/* 顶部信息 */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>🎒 我的账户库</h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: C.dim }}>
            撤离时带回的物资会安全保存到这里。死亡 = 丢失全部装载物品。
          </p>
        </div>
        <Link
          href="/rooms"
          style={{
            padding: '10px 16px', borderRadius: 8, border: `1px solid ${C.accent}40`,
            background: `${C.accent}15`, color: C.accent, fontSize: 13, fontWeight: 700,
            textDecoration: 'none',
          }}
        >→ 进入大厅</Link>
      </div>

      {/* 容量条 */}
      <div style={{
        marginBottom: 22, padding: '14px 18px', borderRadius: 12,
        background: C.bg1, border: `1px solid ${C.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <Stat label="消耗品" value={stash.items.length} color={C.yellow} />
          <Stat label="装备" value={stash.equipments.length} color={C.purple} />
          <Stat label="格子" value={`${stash.used} / ${stash.capacity}`}
            color={stash.slotsLeft <= 5 ? C.red : C.dim} />
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: C.dim2 }}>
            剩余 {stash.slotsLeft} 格
          </span>
        </div>
        {/* 进度条 */}
        <div style={{ height: 6, borderRadius: 3, background: C.bg2, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${Math.min(100, (stash.used / stash.capacity) * 100)}%`,
            background: stash.used >= stash.capacity ? C.red : stash.used / stash.capacity > 0.85 ? C.yellow : C.accent,
            transition: 'width .3s',
          }} />
        </div>
      </div>

      {/* 装备 */}
      {stash.equipments.length > 0 && (
        <Section title="🛡️ 装备实例" count={stash.equipments.length}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {stash.equipments.map(inst => {
              const tier = inst.tier
              const rarity = RARITY_META[tier?.rarity] || RARITY_META.common
              const lowDur = tier?.durability_max && inst.durability_current / tier.durability_max < 0.25
              return (
                <div
                  key={inst.id}
                  style={{
                    padding: '12px 14px', borderRadius: 10,
                    background: C.bg1, border: `1px solid ${rarity.color}40`,
                    borderLeft: `3px solid ${rarity.color}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 700, color: rarity.color, flex: 1, fontSize: 14 }}>{tier?.name || '未知装备'}</span>
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 6,
                      background: `${rarity.color}18`, color: rarity.color, border: `1px solid ${rarity.color}30`,
                    }}>{rarity.label}</span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: C.dim, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ color: C.dim2 }}>{tier?.series?.slot || inst.equipped_slot || ''}</span>
                    {tier?.base_atk > 0 && <span style={{ color: C.red }}>ATK +{tier.base_atk + (inst.bonus_atk || 0)}</span>}
                    {tier?.base_def > 0 && <span style={{ color: C.accent }}>DEF +{tier.base_def + (inst.bonus_def || 0)}</span>}
                    {tier?.durability_max > 0 && (
                      <span style={{ color: lowDur ? C.red : C.dim }}>
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

      {/* 消耗品分组 */}
      {Object.keys(itemsByKind).length === 0 && stash.equipments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80, color: C.dim2 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
          <p style={{ margin: 0, fontSize: 14 }}>账户库是空的。</p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: C.dim2 }}>
            进入对局搜寻物资，撤离时会自动入库。
          </p>
        </div>
      ) : (
        Object.entries(itemsByKind).map(([kind, list]) => {
          const meta = ITEM_KIND_META[kind] || { label: '其他', color: C.dim, icon: '📦' }
          return (
            <Section key={kind} title={`${meta.icon} ${meta.label}`} count={list.length}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {list.map(it => (
                  <div
                    key={it.name}
                    style={{
                      padding: '12px 14px', borderRadius: 10,
                      background: C.bg1, border: `1px solid ${meta.color}30`,
                      borderLeft: `3px solid ${meta.color}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600, color: C.text, flex: 1, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
                      <span style={{ fontSize: 12, color: C.yellow, fontFamily: 'monospace', fontWeight: 700 }}>×{it.quantity}</span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 11, color: C.dim, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {it.def.atk > 0 && <span style={{ color: C.red }}>ATK +{it.def.atk}</span>}
                      {it.def.def > 0 && <span style={{ color: C.accent }}>DEF +{it.def.def}</span>}
                      {it.def.heal > 0 && <span style={{ color: C.green }}>HEAL +{it.def.heal}</span>}
                      {it.def.sub_kind && <span style={{ color: C.dim2 }}>{it.def.sub_kind}</span>}
                    </div>
                    {it.def.description && (
                      <div style={{ marginTop: 4, fontSize: 10, color: C.dim2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {it.def.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )
        })
      )}
    </div>
  )
}

function Section({ title, count, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 6,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</span>
        <span style={{ fontSize: 11, color: C.dim }}>· {count}</span>
      </div>
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
