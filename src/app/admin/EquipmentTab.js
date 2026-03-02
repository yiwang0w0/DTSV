'use client'
/**
 * 装备引擎后台 Tab — src/app/admin/EquipmentTab.js
 *
 * 集成到 admin/page.js 的方法：
 * 1. import EquipmentTab from './EquipmentTab'
 * 2. tabs 数组加入 { key: 'equipment', label: '🗡️ 装备引擎' }
 * 3. JSX 末尾加 {tab === 'equipment' && <EquipmentTab toast={toast} />}
 *
 * 依赖：supabase, gameEngine.evalFormula（已有）
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { evalFormula } from '@/lib/gameEngine'

/* ══════════════════════════════════════════════
   元数据常量
══════════════════════════════════════════════ */
const RARITY_META = {
  common:    { label: '普通',   color: '#8b949e' },
  uncommon:  { label: '优秀',   color: '#3fb950' },
  rare:      { label: '稀有',   color: '#58a6ff' },
  epic:      { label: '史诗',   color: '#bc8cff' },
  legendary: { label: '传说',   color: '#d29922' },
  mythic:    { label: '神话',   color: '#f85149' },
}
const ELEMENT_META = {
  none:    { label: '无',   icon: '—'  },
  fire:    { label: '火',   icon: '🔥' },
  ice:     { label: '冰',   icon: '❄️' },
  thunder: { label: '雷',   icon: '⚡' },
  wind:    { label: '风',   icon: '🌀' },
  light:   { label: '光',   icon: '✨' },
  dark:    { label: '暗',   icon: '🌑' },
  water:   { label: '水',   icon: '💧' },
}
const SLOT_META = {
  weapon:    { label: '武器',   icon: '⚔️'  },
  armor:     { label: '护甲',   icon: '🛡️'  },
  helmet:    { label: '头盔',   icon: '⛑️'  },
  boots:     { label: '靴子',   icon: '👢'  },
  accessory: { label: '饰品',   icon: '💍'  },
}
const TRIGGER_EVENTS = [
  { value: 'on_attack',      label: '攻击时' },
  { value: 'on_defend',      label: '被攻击时' },
  { value: 'on_kill',        label: '击杀时' },
  { value: 'on_turn_start',  label: '每回合开始' },
  { value: 'on_hp_below_30', label: 'HP低于30%时' },
  { value: 'on_equip',       label: '装备时（一次性）' },
]
const EFFECT_TYPES = [
  { value: 'damage',     label: '伤害' },
  { value: 'heal',       label: '治疗' },
  { value: 'buff',       label: '施加Buff' },
  { value: 'debuff',     label: '施加Debuff' },
  { value: 'elemental',  label: '元素伤害' },
  { value: 'stat_boost', label: '属性增强' },
]
const FAIL_BEHAVIORS = [
  { value: 'keep_materials', label: '材料保留（可重试）' },
  { value: 'lose_materials', label: '材料损失' },
  { value: 'downgrade',      label: '前置装备受损' },
]

/* ══════════════════════════════════════════════
   共享样式
══════════════════════════════════════════════ */
const INPUT = {
  width: '100%', padding: '9px 13px', borderRadius: 7,
  border: '1px solid #30363d', background: '#161b22', color: '#e6edf3',
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
}
const LABEL = {
  display: 'block', fontSize: 10, color: '#8b949e', marginBottom: 5,
  fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px',
}
const BTN = (bg, color, extra = {}) => ({
  padding: '8px 16px', borderRadius: 7, border: 'none', background: bg,
  color, fontSize: 12, fontWeight: 700, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 5, ...extra,
})
const CARD = (extra = {}) => ({
  background: '#1c2129', borderRadius: 12, border: '1px solid #30363d',
  padding: 16, ...extra,
})
const TAG = (color) => ({
  display: 'inline-block', fontSize: 10, padding: '1px 8px', borderRadius: 8,
  background: `${color}15`, color, border: `1px solid ${color}30`,
})

/* ══════════════════════════════════════════════
   公式预览组件（复用 admin 已有逻辑）
══════════════════════════════════════════════ */
function FormulaPreview({ formula }) {
  if (!formula?.trim()) return null
  let result = null, isError = false
  try { result = evalFormula(formula, { atk: 15, def: 8, hp: 60, maxHp: 100, value: 5, enemyHp: 80 }) }
  catch { isError = true }
  return (
    <div style={{
      marginTop: 5, padding: '6px 10px', borderRadius: 6, fontSize: 11,
      background: isError ? 'rgba(248,81,73,0.08)' : 'rgba(63,185,80,0.08)',
      border: `1px solid ${isError ? 'rgba(248,81,73,0.2)' : 'rgba(63,185,80,0.2)'}`,
    }}>
      <span style={{ color: '#8b949e' }}>预览(atk=15,def=8,val=5)：</span>
      {isError
        ? <span style={{ color: '#f85149', marginLeft: 6 }}>⚠ 公式错误</span>
        : <span style={{ color: '#3fb950', fontFamily: 'monospace', marginLeft: 6, fontWeight: 700 }}>= {result}</span>}
    </div>
  )
}

/* ══════════════════════════════════════════════
   通用确认删除 inline 组件
══════════════════════════════════════════════ */
function DeleteBtn({ onConfirm }) {
  const [confirming, setConfirming] = useState(false)
  if (confirming) return (
    <div style={{ display: 'flex', gap: 4 }}>
      <button onClick={onConfirm}
        style={BTN('rgba(248,81,73,0.15)', '#f85149', { padding: '4px 10px', border: '1px solid rgba(248,81,73,0.3)' })}>确认</button>
      <button onClick={() => setConfirming(false)}
        style={BTN('transparent', '#8b949e', { padding: '4px 10px', border: '1px solid #30363d' })}>取消</button>
    </div>
  )
  return (
    <button onClick={() => setConfirming(true)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#484f58', fontSize: 15, padding: '2px 4px' }}>🗑️</button>
  )
}

/* ══════════════════════════════════════════════
   通用抽屉式 Modal
══════════════════════════════════════════════ */
function Drawer({ open, onClose, title, children, width = 680 }) {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }} />
      <div style={{
        position: 'relative', width, maxWidth: '95vw', height: '100vh',
        background: '#13171f', borderLeft: '1px solid #30363d',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
        animation: 'slideInRight 0.22s ease-out',
      }}>
        <style>{`@keyframes slideInRight { from { transform: translateX(40px); opacity:0 } to { transform: translateX(0); opacity:1 } }`}</style>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #21262d',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#1c2129', flexShrink: 0,
        }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 20 }}>✕</button>
        </div>
        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   金字塔可视化组件
══════════════════════════════════════════════ */
function PyramidView({ seriesTree, onSelectTier, selectedTierId }) {
  if (!seriesTree) return (
    <div style={{ textAlign: 'center', padding: 40, color: '#484f58' }}>选择一个系列查看金字塔</div>
  )

  const { byTier, maxTier } = seriesTree
  const tiers = Array.from({ length: maxTier }, (_, i) => maxTier - i) // 从高到低渲染

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', padding: '16px 0' }}>
      {tiers.map(tierNum => {
        const nodes = byTier[tierNum] || []
        const isTopTier = tierNum === maxTier

        return (
          <div key={tierNum} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            {/* 连接线 */}
            {tierNum < maxTier && (
              <div style={{ display: 'flex', justifyContent: 'center', width: '100%', position: 'relative', height: 20 }}>
                {nodes.length > 0 && (
                  <div style={{ width: nodes.length > 1 ? '60%' : 2, height: 2, background: '#30363d', position: 'absolute', top: 10 }} />
                )}
                {nodes.map((_, i) => (
                  <div key={i} style={{
                    position: 'absolute', top: 0, width: 2, height: '100%',
                    background: '#30363d',
                    left: nodes.length === 1 ? '50%' : `${(i / (nodes.length - 1)) * 60 + 20}%`,
                  }} />
                ))}
              </div>
            )}

            {/* 阶级标签 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <div style={{
                fontSize: 10, color: '#484f58', fontFamily: 'monospace', fontWeight: 700,
                letterSpacing: 1, textTransform: 'uppercase',
              }}>T{tierNum}</div>
              {nodes.length > 1 && (
                <div style={{ fontSize: 10, color: '#30363d' }}>— {nodes.length} 个变体</div>
              )}
            </div>

            {/* 装备节点 */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {nodes.map(node => {
                const rarity = RARITY_META[node.rarity] || RARITY_META.common
                const element = ELEMENT_META[node.element] || ELEMENT_META.none
                const isSelected = selectedTierId === node.id
                return (
                  <div key={node.id} onClick={() => onSelectTier(node)}
                    style={{
                      padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
                      background: isSelected ? `${rarity.color}18` : '#1c2129',
                      border: `1px solid ${isSelected ? rarity.color : '#30363d'}`,
                      boxShadow: isSelected ? `0 0 12px ${rarity.color}30` : 'none',
                      transition: 'all 0.15s', minWidth: 120, textAlign: 'center',
                    }}>
                    {/* 元素图标 */}
                    <div style={{ fontSize: 10, marginBottom: 4, opacity: 0.7 }}>{element.icon} {element.label}</div>
                    {/* 名称 */}
                    <div style={{ fontWeight: 700, fontSize: 13, color: rarity.color, marginBottom: 4 }}>{node.name}</div>
                    {/* 稀有度标签 */}
                    <div style={{ ...TAG(rarity.color), fontSize: 9 }}>{rarity.label}</div>
                    {/* 属性预览 */}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 6, fontSize: 10, color: '#8b949e' }}>
                      {node.base_atk > 0 && <span style={{ color: '#f85149' }}>ATK {node.base_atk}</span>}
                      {node.base_def > 0 && <span style={{ color: '#58a6ff' }}>DEF {node.base_def}</span>}
                    </div>
                    {/* 被动标记 */}
                    {node.passive && (
                      <div style={{ marginTop: 5, fontSize: 10, color: '#bc8cff' }}>
                        {node.passive.icon} {node.passive.name}
                      </div>
                    )}
                    {/* 配方材料数量 */}
                    {node.recipe && (
                      <div style={{ marginTop: 4, fontSize: 9, color: '#484f58' }}>
                        {node.recipe[0]?.ingredients?.length || 0} 种材料
                      </div>
                    )}
                  </div>
                )
              })}
              {nodes.length === 0 && (
                <div style={{ padding: '10px 20px', borderRadius: 10, border: '1px dashed #30363d', color: '#484f58', fontSize: 12 }}>
                  空阶级
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ══════════════════════════════════════════════
   被动技能 Tab
══════════════════════════════════════════════ */
const EMPTY_PASSIVE = {
  name: '', icon: '⚡', description: '', trigger_event: 'on_attack',
  effect_type: 'damage', effect_formula: 'floor(atk * 0.3)', effect_target: 'enemy',
  trigger_chance: 0.2, buff_id: null, cooldown_turns: 0, value: 5,
}

function PassivesSection({ toast }) {
  const [passives, setPassives] = useState([])
  const [buffPool, setBuffPool] = useState([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const [{ data: p }, { data: b }] = await Promise.all([
      supabase.from('passive_skills').select('*').order('id'),
      supabase.from('buff_pool').select('id,name,icon').order('id'),
    ])
    setPassives(p || [])
    setBuffPool(b || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function openAdd() { setEditing({ ...EMPTY_PASSIVE }); setDrawerOpen(true) }
  function openEdit(p) { setEditing({ ...p }); setDrawerOpen(true) }

  async function save() {
    if (!editing.name.trim()) { toast('请填写技能名称', 'error'); return }
    const payload = { ...editing }
    if (editing.id) {
      const id = payload.id; delete payload.id; delete payload.created_at
      const { error } = await supabase.from('passive_skills').update(payload).eq('id', id)
      if (error) { toast('保存失败', 'error'); return }
    } else {
      delete payload.id; delete payload.created_at
      const { error } = await supabase.from('passive_skills').insert(payload)
      if (error) { toast('保存失败', 'error'); return }
    }
    toast(editing.id ? '被动技能已更新' : '被动技能已添加')
    setDrawerOpen(false); setEditing(null); load()
  }

  async function remove(id) {
    await supabase.from('passive_skills').delete().eq('id', id)
    toast('已删除'); load()
  }

  const e = editing || {}
  const triggerMeta = TRIGGER_EVENTS.find(t => t.value === e.trigger_event)
  const effectMeta = EFFECT_TYPES.find(t => t.value === e.effect_type)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: '#8b949e' }}>定义装备触发的被动效果，可绑定到装备阶级上</div>
        <button onClick={openAdd} style={BTN('#58a6ff', '#fff')}>+ 新增被动</button>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>加载中...</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
          {passives.map(p => {
            const trigM = TRIGGER_EVENTS.find(t => t.value === p.trigger_event)
            const effM = EFFECT_TYPES.find(t => t.value === p.effect_type)
            return (
              <div key={p.id} style={CARD()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 24 }}>{p.icon}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                        <span style={{ ...TAG('#d29922'), fontSize: 9 }}>{trigM?.label}</span>
                        <span style={{ ...TAG('#58a6ff'), fontSize: 9 }}>{effM?.label}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
                    <button onClick={() => openEdit(p)}
                      style={BTN('rgba(88,166,255,0.08)', '#58a6ff', { padding: '4px 10px', border: '1px solid rgba(88,166,255,0.2)' })}>编辑</button>
                    <DeleteBtn onConfirm={() => remove(p.id)} />
                  </div>
                </div>
                {p.description && <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 8, lineHeight: 1.6 }}>{p.description}</div>}
                <div style={{
                  fontFamily: 'monospace', fontSize: 11, color: '#bc8cff',
                  background: 'rgba(188,140,255,0.07)', border: '1px solid rgba(188,140,255,0.15)',
                  padding: '5px 10px', borderRadius: 6, marginBottom: 8,
                }}>f() = {p.effect_formula}</div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#8b949e' }}>
                  <span>触发率 <strong style={{ color: '#d29922' }}>{Math.round(p.trigger_chance * 100)}%</strong></span>
                  <span>冷却 <strong style={{ color: '#58a6ff' }}>{p.cooldown_turns} 回合</strong></span>
                  <span>基础值 <strong style={{ color: '#bc8cff' }}>{p.value}</strong></span>
                </div>
              </div>
            )
          })}
          {passives.length === 0 && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: '#484f58' }}>暂无被动技能</div>}
        </div>
      )}

      <Drawer open={drawerOpen} onClose={() => { setDrawerOpen(false); setEditing(null) }}
        title={e.id ? `编辑被动：${e.name}` : '新增被动技能'}>
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 10 }}>
              <div>
                <label style={LABEL}>图标</label>
                <input style={{ ...INPUT, textAlign: 'center', fontSize: 20, padding: 6 }}
                  value={e.icon} onChange={ev => setEditing({ ...e, icon: ev.target.value })} maxLength={4} />
              </div>
              <div>
                <label style={LABEL}>技能名称</label>
                <input style={INPUT} value={e.name} onChange={ev => setEditing({ ...e, name: ev.target.value })} placeholder="如：烈焰斩、圣光治愈" />
              </div>
            </div>
            <div>
              <label style={LABEL}>描述</label>
              <input style={INPUT} value={e.description} onChange={ev => setEditing({ ...e, description: ev.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={LABEL}>触发时机</label>
                <select style={INPUT} value={e.trigger_event} onChange={ev => setEditing({ ...e, trigger_event: ev.target.value })}>
                  {TRIGGER_EVENTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={LABEL}>效果类型</label>
                <select style={INPUT} value={e.effect_type} onChange={ev => setEditing({ ...e, effect_type: ev.target.value })}>
                  {EFFECT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={LABEL}>作用目标</label>
                <select style={INPUT} value={e.effect_target} onChange={ev => setEditing({ ...e, effect_target: ev.target.value })}>
                  <option value="self">自身</option>
                  <option value="enemy">敌方</option>
                  <option value="all">全体</option>
                </select>
              </div>
              <div>
                <label style={LABEL}>触发概率 (0~1)</label>
                <input type="number" style={INPUT} value={e.trigger_chance} step={0.05} min={0} max={1}
                  onChange={ev => setEditing({ ...e, trigger_chance: parseFloat(ev.target.value) })} />
              </div>
              <div>
                <label style={LABEL}>冷却回合数</label>
                <input type="number" style={INPUT} value={e.cooldown_turns} min={0}
                  onChange={ev => setEditing({ ...e, cooldown_turns: parseInt(ev.target.value) })} />
              </div>
              <div>
                <label style={LABEL}>基础值 (value)</label>
                <input type="number" style={INPUT} value={e.value}
                  onChange={ev => setEditing({ ...e, value: parseFloat(ev.target.value) })} />
              </div>
            </div>

            {/* 效果公式 */}
            <div>
              <label style={LABEL}>效果公式</label>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 5 }}>
                可用变量：<span style={{ color: '#bc8cff', fontFamily: 'monospace' }}>atk, def, hp, maxHp, value, enemyHp</span>
              </div>
              <textarea style={{ ...INPUT, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
                rows={2} value={e.effect_formula} onChange={ev => setEditing({ ...e, effect_formula: ev.target.value })} />
              <FormulaPreview formula={e.effect_formula} />
            </div>

            {/* 绑定 Buff（仅 buff/debuff 类型） */}
            {(e.effect_type === 'buff' || e.effect_type === 'debuff') && (
              <div>
                <label style={LABEL}>触发时施加的 Buff</label>
                <select style={INPUT} value={e.buff_id || ''} onChange={ev => setEditing({ ...e, buff_id: ev.target.value ? parseInt(ev.target.value) : null })}>
                  <option value="">— 不施加 Buff —</option>
                  {buffPool.map(b => <option key={b.id} value={b.id}>{b.icon} {b.name}</option>)}
                </select>
              </div>
            )}

            {/* 预览卡片 */}
            <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(188,140,255,0.05)', border: '1px solid rgba(188,140,255,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 22 }}>{e.icon || '⚡'}</span>
                <div>
                  <div style={{ fontWeight: 700 }}>{e.name || '未命名被动'}</div>
                  <div style={{ fontSize: 11, color: '#8b949e' }}>
                    {triggerMeta?.label} · {Math.round((e.trigger_chance || 0) * 100)}% 触发
                    {e.cooldown_turns > 0 && ` · ${e.cooldown_turns} 回合冷却`}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid #21262d' }}>
              <button onClick={() => { setDrawerOpen(false); setEditing(null) }}
                style={BTN('transparent', '#8b949e', { border: '1px solid #30363d' })}>取消</button>
              <button onClick={save} style={BTN('#58a6ff', '#fff')}>{e.id ? '保存修改' : '添加'}</button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}

/* ══════════════════════════════════════════════
   装备系列 + 阶级 + 配方 三合一 Tab
══════════════════════════════════════════════ */
const EMPTY_SERIES = { name: '', slot: 'weapon', description: '', icon: '⚔️', max_tier: 5 }
const EMPTY_TIER = {
  name: '', rarity: 'common', variant: '', tier: 1,
  base_atk: 0, base_def: 0, base_hp: 0, base_spd: 0,
  element: 'none', element_power: 0, durability_max: 0,
  passive_skill_id: null, passive_note: '', req_level: 1, req_class: [], special_note: '',
}
const EMPTY_RECIPE = {
  recipe_name: '', requires_prev_tier_id: null,
  requires_prev_series_id: null, requires_prev_tier_num: null,
  gold_cost: 0, success_rate: 1.0, fail_behavior: 'keep_materials',
  ingredients: [],
}

function SeriesSection({ toast }) {
  const [seriesList, setSeriesList] = useState([])
  const [tiers, setTiers] = useState([])           // 当前选中系列的所有阶级
  const [allPassives, setAllPassives] = useState([])
  const [allItems, setAllItems] = useState([])     // item_pool（材料用）
  const [seriesTree, setSeriesTree] = useState(null)
  const [loading, setLoading] = useState(true)

  // 选中状态
  const [selectedSeries, setSelectedSeries] = useState(null)
  const [selectedTier, setSelectedTier] = useState(null)   // 金字塔点击选中的阶级

  // 抽屉
  const [seriesDrawer, setSeriesDrawer] = useState(false)
  const [tierDrawer, setTierDrawer] = useState(false)
  const [recipeDrawer, setRecipeDrawer] = useState(false)

  // 表单状态
  const [editSeries, setEditSeries] = useState(null)
  const [editTier, setEditTier] = useState(null)
  const [editRecipe, setEditRecipe] = useState(null)

  /* ── 加载 ── */
  async function loadAll() {
    setLoading(true)
    const [{ data: s }, { data: p }, { data: i }] = await Promise.all([
      supabase.from('equipment_series').select('*').order('id'),
      supabase.from('passive_skills').select('id,name,icon').order('id'),
      supabase.from('item_pool').select('id,name,kind').order('name'),
    ])
    setSeriesList(s || [])
    setAllPassives(p || [])
    setAllItems(i || [])
    setLoading(false)
  }

  async function loadSeriesTree(seriesId) {
    const { data: allTiersRaw } = await supabase
      .from('equipment_tiers')
      .select(`
        *,
        passive:passive_skills(id,name,icon),
        recipe:tier_recipes(
          id, success_rate, gold_cost, fail_behavior,
          requires_prev_tier_id, requires_prev_series_id, requires_prev_tier_num,
          ingredients:recipe_ingredients(
            id, quantity, is_consumed, is_catalyst, ingredient_type,
            item:item_pool(id,name),
            equipment:equipment_tiers(id,name)
          )
        )
      `)
      .eq('series_id', seriesId)
      .order('tier').order('variant')

    setTiers(allTiersRaw || [])

    // 构建 byTier 结构
    const maxTier = allTiersRaw?.length ? Math.max(...allTiersRaw.map(t => t.tier)) : 5
    const byTier = {}
    for (const t of allTiersRaw || []) {
      if (!byTier[t.tier]) byTier[t.tier] = []
      byTier[t.tier].push(t)
    }
    setSeriesTree({ seriesId, byTier, maxTier })
  }

  useEffect(() => { loadAll() }, [])

  async function selectSeries(s) {
    setSelectedSeries(s)
    setSelectedTier(null)
    await loadSeriesTree(s.id)
  }

  /* ── 系列 CRUD ── */
  async function saveSeries() {
    if (!editSeries.name.trim()) { toast('请填写系列名称', 'error'); return }
    const payload = { ...editSeries }
    if (editSeries.id) {
      const id = payload.id; delete payload.id; delete payload.created_at
      await supabase.from('equipment_series').update(payload).eq('id', id)
    } else {
      delete payload.id; delete payload.created_at
      await supabase.from('equipment_series').insert(payload)
    }
    toast(editSeries.id ? '系列已更新' : '系列已添加')
    setSeriesDrawer(false); setEditSeries(null); loadAll()
  }

  async function deleteSeries(id) {
    await supabase.from('equipment_series').delete().eq('id', id)
    toast('系列已删除')
    if (selectedSeries?.id === id) { setSelectedSeries(null); setSeriesTree(null); setTiers([]) }
    loadAll()
  }

  /* ── 阶级 CRUD ── */
  async function saveTier() {
    if (!editTier.name.trim()) { toast('请填写装备名称', 'error'); return }
    const payload = { ...editTier, series_id: selectedSeries.id }
    if (!payload.variant?.trim()) payload.variant = null
    if (editTier.id) {
      const id = payload.id; delete payload.id; delete payload.created_at
      await supabase.from('equipment_tiers').update(payload).eq('id', id)
    } else {
      delete payload.id; delete payload.created_at
      await supabase.from('equipment_tiers').insert(payload)
    }
    toast(editTier.id ? '装备已更新' : '装备已添加')
    setTierDrawer(false); setEditTier(null); loadSeriesTree(selectedSeries.id)
  }

  async function deleteTier(id) {
    await supabase.from('equipment_tiers').delete().eq('id', id)
    toast('装备已删除')
    if (selectedTier?.id === id) setSelectedTier(null)
    loadSeriesTree(selectedSeries.id)
  }

  /* ── 配方 CRUD ── */
  async function openRecipe(tier) {
    setSelectedTier(tier)
    const recipe = tier.recipe?.[0] || null
    if (recipe) {
      setEditRecipe({ ...recipe, ingredients: recipe.ingredients || [] })
    } else {
      setEditRecipe({ ...EMPTY_RECIPE, ingredients: [] })
    }
    setRecipeDrawer(true)
  }

  async function saveRecipe() {
    const tierId = selectedTier.id
    const payload = {
      result_tier_id: tierId,
      recipe_name: editRecipe.recipe_name,
      requires_prev_tier_id: editRecipe.requires_prev_tier_id || null,
      requires_prev_series_id: editRecipe.requires_prev_series_id || null,
      requires_prev_tier_num: editRecipe.requires_prev_tier_num || null,
      gold_cost: editRecipe.gold_cost || 0,
      success_rate: editRecipe.success_rate,
      fail_behavior: editRecipe.fail_behavior,
    }

    let recipeId = editRecipe.id
    if (recipeId) {
      await supabase.from('tier_recipes').update(payload).eq('id', recipeId)
    } else {
      const { data: inserted } = await supabase.from('tier_recipes').insert(payload).select().single()
      recipeId = inserted?.id
    }

    if (!recipeId) { toast('配方保存失败', 'error'); return }

    // 删除旧材料，重新插入
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId)
    if (editRecipe.ingredients.length > 0) {
      const ingPayload = editRecipe.ingredients
        .filter(i => i.item_id || i.equipment_tier_id)
        .map(i => ({
          recipe_id: recipeId,
          ingredient_type: i.ingredient_type || 'item',
          item_id: i.ingredient_type === 'item' ? i.item_id : null,
          equipment_tier_id: i.ingredient_type === 'equipment' ? i.equipment_tier_id : null,
          quantity: i.quantity || 1,
          is_consumed: i.is_consumed !== false,
          is_catalyst: !!i.is_catalyst,
        }))
      await supabase.from('recipe_ingredients').insert(ingPayload)
    }

    toast('配方已保存')
    setRecipeDrawer(false); loadSeriesTree(selectedSeries.id)
  }

  // 材料行操作
  function addIngredient() {
    setEditRecipe({ ...editRecipe, ingredients: [...editRecipe.ingredients, { ingredient_type: 'item', item_id: null, quantity: 1, is_consumed: true, is_catalyst: false }] })
  }
  function updateIng(idx, patch) {
    const ings = [...editRecipe.ingredients]
    ings[idx] = { ...ings[idx], ...patch }
    setEditRecipe({ ...editRecipe, ingredients: ings })
  }
  function removeIng(idx) {
    setEditRecipe({ ...editRecipe, ingredients: editRecipe.ingredients.filter((_, i) => i !== idx) })
  }

  const e = editTier || {}
  const er = editRecipe || {}
  const es = editSeries || {}

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>加载中...</div>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, height: 'calc(100vh - 200px)', minHeight: 500 }}>

      {/* ── 左栏：系列列表 ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#8b949e', fontWeight: 700 }}>装备系列 ({seriesList.length})</span>
          <button onClick={() => { setEditSeries({ ...EMPTY_SERIES }); setSeriesDrawer(true) }}
            style={BTN('rgba(88,166,255,0.1)', '#58a6ff', { padding: '5px 10px', border: '1px solid rgba(88,166,255,0.2)' })}>+ 新建</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {seriesList.map(s => {
            const slot = SLOT_META[s.slot] || SLOT_META.weapon
            const isActive = selectedSeries?.id === s.id
            return (
              <div key={s.id} onClick={() => selectSeries(s)}
                style={{
                  padding: '10px 14px', borderRadius: 9, cursor: 'pointer',
                  background: isActive ? 'rgba(88,166,255,0.1)' : '#1c2129',
                  border: `1px solid ${isActive ? '#58a6ff' : '#30363d'}`,
                  transition: 'all 0.15s', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span>{s.icon}</span>
                    <span style={{ fontWeight: 600, fontSize: 13, color: isActive ? '#58a6ff' : '#e6edf3' }}>{s.name}</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#8b949e' }}>{slot.icon} {slot.label} · T1~T{s.max_tier}</div>
                </div>
                <div style={{ display: 'flex', gap: 3 }} onClick={ev => ev.stopPropagation()}>
                  <button onClick={() => { setEditSeries({ ...s }); setSeriesDrawer(true) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b949e', fontSize: 13 }}>✏️</button>
                  <DeleteBtn onConfirm={() => deleteSeries(s.id)} />
                </div>
              </div>
            )
          })}
          {seriesList.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: '#484f58', fontSize: 12 }}>暂无系列，点击新建</div>
          )}
        </div>
      </div>

      {/* ── 右栏：金字塔 + 详情 ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
        {selectedSeries ? (
          <>
            {/* 系列头部 */}
            <div style={{ ...CARD(), display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 28 }}>{selectedSeries.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedSeries.name}</div>
                  <div style={{ fontSize: 11, color: '#8b949e' }}>
                    {SLOT_META[selectedSeries.slot]?.label} · {tiers.length} 个阶级装备 · 最高 T{selectedSeries.max_tier}
                  </div>
                </div>
              </div>
              <button onClick={() => { setEditTier({ ...EMPTY_TIER, tier: (seriesTree?.maxTier || 0) + 1 }); setTierDrawer(true) }}
                style={BTN('#58a6ff', '#fff')}>+ 添加阶级</button>
            </div>

            {/* 金字塔 */}
            <div style={{ ...CARD({ flex: 1, overflowY: 'auto' }) }}>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                升阶金字塔 — 点击节点查看详情
              </div>
              <PyramidView
                seriesTree={seriesTree}
                onSelectTier={tier => setSelectedTier(tier)}
                selectedTierId={selectedTier?.id}
              />
            </div>

            {/* 选中阶级的详情面板 */}
            {selectedTier && (
              <div style={{ ...CARD({ flexShrink: 0 }), animation: 'fadeInUp 0.2s ease-out' }}>
                <style>{`@keyframes fadeInUp { from { opacity:0; transform: translateY(8px) } to { opacity:1; transform:none } }`}</style>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 16, color: RARITY_META[selectedTier.rarity]?.color }}>
                          {selectedTier.name}
                        </span>
                        <span style={{ ...TAG(RARITY_META[selectedTier.rarity]?.color || '#8b949e'), fontSize: 9 }}>
                          T{selectedTier.tier} · {RARITY_META[selectedTier.rarity]?.label}
                        </span>
                        {selectedTier.variant && (
                          <span style={{ ...TAG('#d29922'), fontSize: 9 }}>{selectedTier.variant} 变体</span>
                        )}
                        <span style={{ fontSize: 12 }}>{ELEMENT_META[selectedTier.element]?.icon}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#8b949e' }}>
                        {selectedTier.base_atk > 0 && <span>ATK <strong style={{ color: '#f85149' }}>+{selectedTier.base_atk}</strong></span>}
                        {selectedTier.base_def > 0 && <span>DEF <strong style={{ color: '#58a6ff' }}>+{selectedTier.base_def}</strong></span>}
                        {selectedTier.base_hp > 0 && <span>HP <strong style={{ color: '#3fb950' }}>+{selectedTier.base_hp}</strong></span>}
                        {selectedTier.element_power > 0 && <span>元素强度 <strong style={{ color: '#d29922' }}>{selectedTier.element_power}</strong></span>}
                        {selectedTier.durability_max > 0 && <span>耐久 <strong style={{ color: '#bc8cff' }}>{selectedTier.durability_max}</strong></span>}
                        {selectedTier.req_level > 1 && <span>需 Lv.<strong>{selectedTier.req_level}</strong></span>}
                      </div>
                      {selectedTier.passive && (
                        <div style={{ marginTop: 5, fontSize: 11, color: '#bc8cff' }}>
                          {selectedTier.passive.icon} 被动：{selectedTier.passive.name}
                        </div>
                      )}
                      {/* 配方摘要 */}
                      {selectedTier.recipe?.[0] && (
                        <div style={{ marginTop: 6, fontSize: 11, color: '#8b949e' }}>
                          🔨 配方：{selectedTier.recipe[0].ingredients?.length || 0} 种材料
                          {selectedTier.recipe[0].success_rate < 1 && <span style={{ color: '#d29922', marginLeft: 6 }}>成功率 {Math.round(selectedTier.recipe[0].success_rate * 100)}%</span>}
                          {selectedTier.recipe[0].gold_cost > 0 && <span style={{ color: '#d29922', marginLeft: 6 }}>💰 {selectedTier.recipe[0].gold_cost}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => openRecipe(selectedTier)}
                      style={BTN('rgba(210,153,34,0.1)', '#d29922', { border: '1px solid rgba(210,153,34,0.25)' })}>🔨 配方</button>
                    <button onClick={() => { setEditTier({ ...selectedTier, variant: selectedTier.variant || '' }); setTierDrawer(true) }}
                      style={BTN('rgba(88,166,255,0.1)', '#58a6ff', { border: '1px solid rgba(88,166,255,0.25)' })}>✏️ 编辑</button>
                    <DeleteBtn onConfirm={() => deleteTier(selectedTier.id)} />
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#484f58', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 36 }}>🗡️</div>
            <div>从左侧选择一个装备系列</div>
          </div>
        )}
      </div>

      {/* ══ 系列编辑 Drawer ══ */}
      <Drawer open={seriesDrawer} onClose={() => { setSeriesDrawer(false); setEditSeries(null) }}
        title={es.id ? `编辑系列：${es.name}` : '新建装备系列'} width={520}>
        {editSeries && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 10 }}>
              <div>
                <label style={LABEL}>图标</label>
                <input style={{ ...INPUT, textAlign: 'center', fontSize: 20, padding: 6 }}
                  value={es.icon} onChange={ev => setEditSeries({ ...es, icon: ev.target.value })} maxLength={4} />
              </div>
              <div>
                <label style={LABEL}>系列名称</label>
                <input style={INPUT} value={es.name} onChange={ev => setEditSeries({ ...es, name: ev.target.value })} placeholder="如：常磐之刃" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={LABEL}>装备槽位</label>
                <select style={INPUT} value={es.slot} onChange={ev => setEditSeries({ ...es, slot: ev.target.value })}>
                  {Object.entries(SLOT_META).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
              <div>
                <label style={LABEL}>最高阶级</label>
                <input type="number" style={INPUT} value={es.max_tier} min={1} max={10}
                  onChange={ev => setEditSeries({ ...es, max_tier: parseInt(ev.target.value) })} />
              </div>
            </div>
            <div>
              <label style={LABEL}>系列描述</label>
              <textarea style={{ ...INPUT, resize: 'vertical' }} rows={3} value={es.description}
                onChange={ev => setEditSeries({ ...es, description: ev.target.value })} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid #21262d' }}>
              <button onClick={() => { setSeriesDrawer(false); setEditSeries(null) }}
                style={BTN('transparent', '#8b949e', { border: '1px solid #30363d' })}>取消</button>
              <button onClick={saveSeries} style={BTN('#58a6ff', '#fff')}>{es.id ? '保存修改' : '创建系列'}</button>
            </div>
          </div>
        )}
      </Drawer>

      {/* ══ 阶级编辑 Drawer ══ */}
      <Drawer open={tierDrawer} onClose={() => { setTierDrawer(false); setEditTier(null) }}
        title={e.id ? `编辑装备：${e.name}` : `新增阶级（${selectedSeries?.name}）`}>
        {editTier && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* 基本信息 */}
            <div style={{ background: '#161b22', borderRadius: 10, padding: 14, border: '1px solid #21262d' }}>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 10, fontWeight: 700 }}>基本信息</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={LABEL}>装备名称</label>
                  <input style={INPUT} value={e.name} onChange={ev => setEditTier({ ...e, name: ev.target.value })} placeholder="如：烈焰常磐之刃" />
                </div>
                <div>
                  <label style={LABEL}>阶级 (Tier)</label>
                  <input type="number" style={INPUT} value={e.tier} min={1} max={10}
                    onChange={ev => setEditTier({ ...e, tier: parseInt(ev.target.value) })} />
                </div>
                <div>
                  <label style={LABEL}>变体标识</label>
                  <input style={INPUT} value={e.variant} placeholder="留空=主线；fire/ice/dark..." onChange={ev => setEditTier({ ...e, variant: ev.target.value })} />
                </div>
                <div>
                  <label style={LABEL}>稀有度</label>
                  <select style={INPUT} value={e.rarity} onChange={ev => setEditTier({ ...e, rarity: ev.target.value })}>
                    {Object.entries(RARITY_META).map(([k, v]) => (
                      <option key={k} value={k} style={{ color: v.color }}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* 基础属性 */}
            <div style={{ background: '#161b22', borderRadius: 10, padding: 14, border: '1px solid #21262d' }}>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 10, fontWeight: 700 }}>基础属性</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={LABEL}>ATK 攻击加成</label>
                  <input type="number" style={INPUT} value={e.base_atk} onChange={ev => setEditTier({ ...e, base_atk: parseInt(ev.target.value) || 0 })} />
                </div>
                <div>
                  <label style={LABEL}>DEF 防御加成</label>
                  <input type="number" style={INPUT} value={e.base_def} onChange={ev => setEditTier({ ...e, base_def: parseInt(ev.target.value) || 0 })} />
                </div>
                <div>
                  <label style={LABEL}>HP 生命加成</label>
                  <input type="number" style={INPUT} value={e.base_hp} onChange={ev => setEditTier({ ...e, base_hp: parseInt(ev.target.value) || 0 })} />
                </div>
                <div>
                  <label style={LABEL}>耐久度上限 (0=无限)</label>
                  <input type="number" style={INPUT} value={e.durability_max} min={0}
                    onChange={ev => setEditTier({ ...e, durability_max: parseInt(ev.target.value) || 0 })} />
                </div>
              </div>
            </div>

            {/* 元素系统 */}
            <div style={{ background: '#161b22', borderRadius: 10, padding: 14, border: '1px solid #21262d' }}>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 10, fontWeight: 700 }}>元素属性</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={LABEL}>元素</label>
                  <select style={INPUT} value={e.element} onChange={ev => setEditTier({ ...e, element: ev.target.value })}>
                    {Object.entries(ELEMENT_META).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LABEL}>元素强度</label>
                  <input type="number" style={INPUT} value={e.element_power} min={0}
                    onChange={ev => setEditTier({ ...e, element_power: parseInt(ev.target.value) || 0 })} />
                </div>
              </div>
            </div>

            {/* 被动 + 限制 */}
            <div style={{ background: '#161b22', borderRadius: 10, padding: 14, border: '1px solid #21262d' }}>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 10, fontWeight: 700 }}>被动技能 & 装备限制</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={LABEL}>绑定被动技能</label>
                  <select style={INPUT} value={e.passive_skill_id || ''} onChange={ev => setEditTier({ ...e, passive_skill_id: ev.target.value ? parseInt(ev.target.value) : null })}>
                    <option value="">— 无被动 —</option>
                    {allPassives.map(p => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LABEL}>等级要求</label>
                  <input type="number" style={INPUT} value={e.req_level} min={1}
                    onChange={ev => setEditTier({ ...e, req_level: parseInt(ev.target.value) || 1 })} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={LABEL}>被动说明（简短，用于卡片显示）</label>
                  <input style={INPUT} value={e.passive_note} placeholder="如：攻击时20%概率附加火焰伤害"
                    onChange={ev => setEditTier({ ...e, passive_note: ev.target.value })} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={LABEL}>特殊说明</label>
                  <input style={INPUT} value={e.special_note} onChange={ev => setEditTier({ ...e, special_note: ev.target.value })} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid #21262d' }}>
              <button onClick={() => { setTierDrawer(false); setEditTier(null) }}
                style={BTN('transparent', '#8b949e', { border: '1px solid #30363d' })}>取消</button>
              <button onClick={saveTier} style={BTN('#58a6ff', '#fff')}>{e.id ? '保存修改' : '添加装备'}</button>
            </div>
          </div>
        )}
      </Drawer>

      {/* ══ 配方编辑 Drawer ══ */}
      <Drawer open={recipeDrawer} onClose={() => { setRecipeDrawer(false); setEditRecipe(null) }}
        title={`配方编辑 — ${selectedTier?.name}`} width={700}>
        {editRecipe && selectedTier && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* 前置装备（升阶核心） */}
            <div style={{ background: '#161b22', borderRadius: 10, padding: 14, border: '1px solid #21262d' }}>
              <div style={{ fontSize: 11, color: '#d29922', marginBottom: 10, fontWeight: 700 }}>⬆️ 升阶前置装备</div>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 10, lineHeight: 1.6 }}>
                T1 基础装备无需前置。T2+ 必须消耗前一阶成品。<br />
                选精确ID = 只接受特定变体；选宽松匹配 = 接受该系列该阶任意变体。
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={LABEL}>精确前置装备 ID</label>
                  <select style={INPUT} value={er.requires_prev_tier_id || ''}
                    onChange={ev => setEditRecipe({ ...er, requires_prev_tier_id: ev.target.value ? parseInt(ev.target.value) : null, requires_prev_series_id: null, requires_prev_tier_num: null })}>
                    <option value="">— 无（T1基础/宽松匹配）—</option>
                    {tiers.filter(t => t.id !== selectedTier?.id).map(t => (
                      <option key={t.id} value={t.id}>T{t.tier} {t.name}{t.variant ? ` [${t.variant}]` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ ...LABEL, color: '#d29922' }}>或：宽松匹配阶级</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="number" style={{ ...INPUT, flex: 1 }} placeholder="前置阶级数"
                      value={er.requires_prev_tier_num || ''}
                      disabled={!!er.requires_prev_tier_id}
                      onChange={ev => setEditRecipe({ ...er, requires_prev_tier_id: null, requires_prev_series_id: selectedSeries.id, requires_prev_tier_num: parseInt(ev.target.value) || null })} />
                    <div style={{ fontSize: 10, color: '#8b949e', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>本系列任意变体</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 合成参数 */}
            <div style={{ background: '#161b22', borderRadius: 10, padding: 14, border: '1px solid #21262d' }}>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 10, fontWeight: 700 }}>合成参数</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={LABEL}>配方名称</label>
                  <input style={INPUT} value={er.recipe_name} onChange={ev => setEditRecipe({ ...er, recipe_name: ev.target.value })} placeholder="可留空" />
                </div>
                <div>
                  <label style={LABEL}>成功率 (0~1)</label>
                  <input type="number" style={INPUT} value={er.success_rate} step={0.05} min={0} max={1}
                    onChange={ev => setEditRecipe({ ...er, success_rate: parseFloat(ev.target.value) })} />
                </div>
                <div>
                  <label style={LABEL}>金币消耗</label>
                  <input type="number" style={INPUT} value={er.gold_cost} min={0}
                    onChange={ev => setEditRecipe({ ...er, gold_cost: parseInt(ev.target.value) || 0 })} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={LABEL}>失败行为</label>
                  <select style={INPUT} value={er.fail_behavior} onChange={ev => setEditRecipe({ ...er, fail_behavior: ev.target.value })}>
                    {FAIL_BEHAVIORS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* 材料列表 */}
            <div style={{ background: '#161b22', borderRadius: 10, padding: 14, border: '1px solid #21262d' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700 }}>🔩 合成材料 ({er.ingredients.length} 种)</div>
                <button onClick={addIngredient}
                  style={BTN('rgba(63,185,80,0.1)', '#3fb950', { padding: '5px 10px', border: '1px solid rgba(63,185,80,0.2)', fontSize: 11 })}>+ 添加材料行</button>
              </div>

              {er.ingredients.length === 0 && (
                <div style={{ textAlign: 'center', padding: 20, color: '#484f58', fontSize: 12 }}>
                  点击"添加材料行"添加所需材料
                </div>
              )}

              {er.ingredients.map((ing, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 60px 80px 80px 28px', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                  {/* 类型 */}
                  <select style={{ ...INPUT, fontSize: 11, padding: '7px 8px' }}
                    value={ing.ingredient_type}
                    onChange={ev => updateIng(idx, { ingredient_type: ev.target.value, item_id: null, equipment_tier_id: null })}>
                    <option value="item">道具材料</option>
                    <option value="equipment">特定装备</option>
                  </select>
                  {/* 选择具体内容 */}
                  {ing.ingredient_type === 'item' ? (
                    <select style={{ ...INPUT, fontSize: 11, padding: '7px 8px' }}
                      value={ing.item_id || ''}
                      onChange={ev => updateIng(idx, { item_id: parseInt(ev.target.value) || null })}>
                      <option value="">选择材料...</option>
                      {allItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  ) : (
                    <select style={{ ...INPUT, fontSize: 11, padding: '7px 8px' }}
                      value={ing.equipment_tier_id || ''}
                      onChange={ev => updateIng(idx, { equipment_tier_id: parseInt(ev.target.value) || null })}>
                      <option value="">选择装备...</option>
                      {tiers.map(t => <option key={t.id} value={t.id}>T{t.tier} {t.name}</option>)}
                    </select>
                  )}
                  {/* 数量 */}
                  <input type="number" style={{ ...INPUT, fontSize: 11, padding: '7px 8px' }}
                    value={ing.quantity} min={1}
                    onChange={ev => updateIng(idx, { quantity: parseInt(ev.target.value) || 1 })} />
                  {/* 是否消耗 */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#8b949e', cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox" checked={ing.is_consumed !== false}
                      onChange={ev => updateIng(idx, { is_consumed: ev.target.checked })} />
                    消耗
                  </label>
                  {/* 催化剂 */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#8b949e', cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox" checked={!!ing.is_catalyst}
                      onChange={ev => updateIng(idx, { is_catalyst: ev.target.checked })} />
                    催化剂
                  </label>
                  {/* 删除 */}
                  <button onClick={() => removeIng(idx)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#484f58', fontSize: 14 }}>✕</button>
                </div>
              ))}
              {er.ingredients.length > 0 && (
                <div style={{ fontSize: 10, color: '#484f58', marginTop: 4 }}>
                  勾选"消耗"= 合成后材料消失；"催化剂"= 需持有但不消耗
                </div>
              )}
            </div>

            {/* 配方摘要预览 */}
            <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(210,153,34,0.05)', border: '1px solid rgba(210,153,34,0.2)' }}>
              <div style={{ fontSize: 11, color: '#d29922', fontWeight: 700, marginBottom: 6 }}>📋 配方预览</div>
              <div style={{ fontSize: 12, color: '#e6edf3' }}>
                合成目标：<strong style={{ color: RARITY_META[selectedTier.rarity]?.color }}>{selectedTier.name}</strong>
                &nbsp;（T{selectedTier.tier}
                {selectedTier.variant ? ` · ${selectedTier.variant} 变体` : ''}）
              </div>
              {(er.requires_prev_tier_id || er.requires_prev_tier_num) && (
                <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>
                  ↑ 消耗前置：{er.requires_prev_tier_id
                    ? tiers.find(t => t.id === er.requires_prev_tier_id)?.name || `ID ${er.requires_prev_tier_id}`
                    : `T${er.requires_prev_tier_num} 任意变体`}
                </div>
              )}
              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
                成功率：<strong style={{ color: er.success_rate < 1 ? '#f85149' : '#3fb950' }}>
                  {Math.round(er.success_rate * 100)}%
                </strong>
                {er.gold_cost > 0 && <span style={{ marginLeft: 10 }}>💰 {er.gold_cost}</span>}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid #21262d' }}>
              <button onClick={() => { setRecipeDrawer(false); setEditRecipe(null) }}
                style={BTN('transparent', '#8b949e', { border: '1px solid #30363d' })}>取消</button>
              <button onClick={saveRecipe} style={BTN('#d29922', '#000', { color: '#000' })}>💾 保存配方</button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}

/* ══════════════════════════════════════════════
   主 Tab 组件（对外导出）
══════════════════════════════════════════════ */
export default function EquipmentTab({ toast }) {
  const [section, setSection] = useState('series')

  const sections = [
    { key: 'series',   label: '🗡️ 系列 & 升阶树' },
    { key: 'passives', label: '⚡ 被动技能',       },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 子导航 */}
      <div style={{ display: 'flex', gap: 6 }}>
        {sections.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)} style={{
            padding: '8px 18px', borderRadius: 8,
            border: `1px solid ${section === s.key ? '#58a6ff' : '#30363d'}`,
            background: section === s.key ? 'rgba(88,166,255,0.12)' : 'transparent',
            color: section === s.key ? '#58a6ff' : '#8b949e',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>{s.label}</button>
        ))}
      </div>

      {section === 'series'   && <SeriesSection   toast={toast} />}
      {section === 'passives' && <PassivesSection toast={toast} />}
    </div>
  )
}
