'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Drawer, DeleteBtn, FormulaPreview } from '../_shared/ui'

const INPUT = { width: '100%', padding: '9px 13px', borderRadius: 7, border: '1px solid #30363d', background: '#161b22', color: '#e6edf3', fontSize: 13, outline: 'none', boxSizing: 'border-box' }
const LABEL = { display: 'block', fontSize: 10, color: '#8b949e', marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }
const BTN = (bg, color, extra = {}) => ({ padding: '8px 16px', borderRadius: 7, border: 'none', background: bg, color, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, ...extra })
const TAG = (color) => ({ display: 'inline-block', fontSize: 10, padding: '1px 8px', borderRadius: 8, background: `${color}15`, color, border: `1px solid ${color}30` })
const CARD = (extra = {}) => ({ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: 16, ...extra })

export const TRIGGER_EVENTS = [
  { value: 'on_attack',      label: '攻击时' },
  { value: 'on_defend',      label: '被攻击时' },
  { value: 'on_kill',        label: '击杀时' },
  { value: 'on_turn_start',  label: '每回合开始' },
  { value: 'on_hp_below_30', label: 'HP低于30%时' },
  { value: 'on_equip',       label: '装备时（一次性）' },
]
export const EFFECT_TYPES = [
  { value: 'damage',     label: '伤害' },
  { value: 'heal',       label: '治疗' },
  { value: 'buff',       label: '施加Buff' },
  { value: 'debuff',     label: '施加Debuff' },
  { value: 'elemental',  label: '元素伤害' },
  { value: 'stat_boost', label: '属性增强' },
]
const EMPTY_PASSIVE = {
  name: '', icon: '⚡', description: '', trigger_event: 'on_attack',
  effect_type: 'damage', effect_formula: 'floor(atk * 0.3)', effect_target: 'enemy',
  trigger_chance: 0.2, buff_id: null, cooldown_turns: 0, value: 5,
}

export default function EquipmentPassivesSection({ toast }) {
  const [passives, setPassives]   = useState([])
  const [buffPool, setBuffPool]   = useState([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [loading, setLoading]     = useState(true)

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

  function openAdd()  { setEditing({ ...EMPTY_PASSIVE }); setDrawerOpen(true) }
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
            const effM  = EFFECT_TYPES.find(t => t.value === p.effect_type)
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
                    <button onClick={() => openEdit(p)} style={BTN('rgba(88,166,255,0.08)', '#58a6ff', { padding: '4px 10px', border: '1px solid rgba(88,166,255,0.2)' })}>编辑</button>
                    <DeleteBtn onConfirm={() => remove(p.id)} />
                  </div>
                </div>
                {p.description && <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 8, lineHeight: 1.6 }}>{p.description}</div>}
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#bc8cff', background: 'rgba(188,140,255,0.07)', border: '1px solid rgba(188,140,255,0.15)', padding: '5px 10px', borderRadius: 6, marginBottom: 8 }}>f() = {p.effect_formula}</div>
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
            <div>
              <label style={LABEL}>效果公式</label>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 5 }}>
                可用变量：<span style={{ color: '#bc8cff', fontFamily: 'monospace' }}>atk, def, hp, maxHp, value, enemyHp</span>
              </div>
              <textarea style={{ ...INPUT, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
                rows={2} value={e.effect_formula} onChange={ev => setEditing({ ...e, effect_formula: ev.target.value })} />
              <FormulaPreview formula={e.effect_formula} />
            </div>
            {(e.effect_type === 'buff' || e.effect_type === 'debuff') && (
              <div>
                <label style={LABEL}>触发时施加的 Buff</label>
                <select style={INPUT} value={e.buff_id || ''} onChange={ev => setEditing({ ...e, buff_id: ev.target.value ? parseInt(ev.target.value) : null })}>
                  <option value="">— 不施加 Buff —</option>
                  {buffPool.map(b => <option key={b.id} value={b.id}>{b.icon} {b.name}</option>)}
                </select>
              </div>
            )}
            <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(188,140,255,0.05)', border: '1px solid rgba(188,140,255,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 22 }}>{e.icon || '⚡'}</span>
                <div>
                  <div style={{ fontWeight: 700 }}>{e.name || '未命名被动'}</div>
                  <div style={{ fontSize: 11, color: '#8b949e' }}>
                    {TRIGGER_EVENTS.find(t => t.value === e.trigger_event)?.label} · {Math.round((e.trigger_chance || 0) * 100)}% 触发
                    {e.cooldown_turns > 0 && ` · ${e.cooldown_turns} 回合冷却`}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid #21262d' }}>
              <button onClick={() => { setDrawerOpen(false); setEditing(null) }} style={BTN('transparent', '#8b949e', { border: '1px solid #30363d' })}>取消</button>
              <button onClick={save} style={BTN('#58a6ff', '#fff')}>{e.id ? '保存修改' : '添加'}</button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}
