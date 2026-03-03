'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { evalFormula } from '@/lib/gameEngine'
import { BTN, INPUT } from './_shared/ui'

const CATEGORY_META = {
  combat:  { label: '⚔️ 战斗公式',  color: '#f85149' },
  items:   { label: '🎒 道具公式',  color: '#d29922' },
  search:  { label: '🔍 搜索概率',  color: '#58a6ff' },
  player:  { label: '👤 玩家属性',  color: '#3fb950' },
  weather: { label: '🌦️ 天气效果', color: '#bc8cff' },
  general: { label: '⚙️ 通用',      color: '#8b949e' },
}

const BUFF_TYPE_META = {
  dot:     { label: '持续伤害/回复', color: '#f85149' },
  stat:    { label: '属性修改',      color: '#d29922' },
  shield:  { label: '护盾',          color: '#58a6ff' },
  special: { label: '特殊效果',      color: '#bc8cff' },
}

const EMPTY_BUFF = {
  name: '', icon: '⚡', description: '', type: 'dot',
  target: 'hp', effect_formula: '-value', value: 5,
  duration: 3, max_stack: 1, is_debuff: true,
}

/* ── 公式预览 ── */
function FormulaPreview({ formula }) {
  const testVars = { atk: 15, def: 8, hp: 60, maxHp: 100, targetDef: 8, targetHp: 80, targetMaxHp: 100, targetAtk: 12, atkMultiplier: 1.0, defMultiplier: 0.5, heal: 30, effect: 5, value: 5 }
  if (!formula?.trim()) return null
  let result = null, isError = false
  try { result = evalFormula(formula, testVars) } catch { isError = true }
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

/* ── 单条规则行 ── */
function RuleRow({ rule, onSave, toast }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(rule.value)
  const [saving, setSaving]   = useState(false)
  const isFormula = rule.input_type === 'formula'

  async function save() {
    setSaving(true)
    const { error } = await supabase.from('game_rules').update({ value: val }).eq('id', rule.id)
    setSaving(false)
    if (error) { toast('保存失败', 'error'); return }
    toast(`「${rule.label}」已更新`)
    onSave(rule.id, val)
    setEditing(false)
  }

  return (
    <div style={{ background: editing ? '#222830' : '#1c2129', borderRadius: 10, border: `1px solid ${editing ? '#58a6ff40' : '#30363d'}`, padding: '14px 18px', transition: 'all 0.2s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{rule.label}</span>
            <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: '#484f58', background: '#0e1117', padding: '1px 7px', borderRadius: 4 }}>{rule.key}</span>
          </div>
          {rule.description && <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 8, lineHeight: 1.6 }}>{rule.description}</div>}
          {editing ? (
            <div>
              {isFormula ? (
                <><textarea value={val} onChange={e => setVal(e.target.value)} rows={2} style={{ ...INPUT, fontFamily: "'JetBrains Mono'", fontSize: 12, resize: 'vertical', lineHeight: 1.6 }} /><FormulaPreview formula={val} /></>
              ) : (
                <input type="number" value={val} onChange={e => setVal(e.target.value)} min={rule.min_val ?? undefined} max={rule.max_val ?? undefined} step={Number(val) < 2 ? 0.01 : 1} style={{ ...INPUT, maxWidth: 200 }} />
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={save} disabled={saving} style={BTN('#58a6ff', '#fff', { padding: '7px 14px', fontSize: 12 })}>{saving ? '保存中...' : '✓ 保存'}</button>
                <button onClick={() => { setVal(rule.value); setEditing(false) }} style={BTN('transparent', '#8b949e', { padding: '7px 14px', fontSize: 12, border: '1px solid #30363d' })}>取消</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'inline-block', fontFamily: isFormula ? "'JetBrains Mono'" : 'inherit', fontSize: isFormula ? 12 : 14, fontWeight: isFormula ? 400 : 700, color: isFormula ? '#bc8cff' : '#58a6ff', background: isFormula ? 'rgba(188,140,255,0.08)' : 'rgba(88,166,255,0.08)', border: `1px solid ${isFormula ? 'rgba(188,140,255,0.2)' : 'rgba(88,166,255,0.15)'}`, padding: isFormula ? '4px 10px' : '3px 12px', borderRadius: 6 }}>{rule.value}</div>
          )}
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} style={{ flexShrink: 0, padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.2)', color: '#58a6ff' }}>编辑</button>
        )}
      </div>
    </div>
  )
}

/* ── Buff 编辑 Modal ── */
function BuffModal({ open, onClose, editBuff, onSave, toast }) {
  const [form, setForm] = useState(EMPTY_BUFF)
  useEffect(() => { setForm(editBuff ? { ...editBuff } : EMPTY_BUFF) }, [editBuff, open])

  async function save() {
    if (!form.name.trim()) { toast('请填写 Buff 名称', 'error'); return }
    const payload = { ...form }
    if (form.id) {
      const id = payload.id; delete payload.id; delete payload.created_at
      await supabase.from('buff_pool').update(payload).eq('id', id)
    } else {
      delete payload.id; delete payload.created_at
      await supabase.from('buff_pool').insert(payload)
    }
    toast(form.id ? 'Buff 已更新' : 'Buff 已添加')
    onSave(); onClose()
  }

  if (!open) return null
  const F = (k, label, child) => (
    <div key={k} style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 10, color: '#8b949e', marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</label>
      {child}
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }} />
      <div style={{ position: 'relative', background: '#1c2129', borderRadius: 14, border: '1px solid #30363d', width: '90%', maxWidth: 560, maxHeight: '85vh', overflow: 'auto', padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{form.id ? '编辑 Buff' : '添加 Buff'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 20 }}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {F('name', '名称', <input style={INPUT} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />)}
          {F('icon', '图标', <input style={INPUT} value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} />)}
          {F('type', '类型', <select style={INPUT} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{Object.entries(BUFF_TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>)}
          {F('target', '作用目标', <select style={INPUT} value={form.target} onChange={e => setForm({ ...form, target: e.target.value })}>{['hp', 'atk', 'def'].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}</select>)}
          {F('duration', '持续回合', <input type="number" style={INPUT} value={form.duration} onChange={e => setForm({ ...form, duration: Number(e.target.value) })} />)}
          {F('max_stack', '最大叠加', <input type="number" style={INPUT} value={form.max_stack} onChange={e => setForm({ ...form, max_stack: Number(e.target.value) })} />)}
          {F('value', '基础数值', <input type="number" style={INPUT} value={form.value} onChange={e => setForm({ ...form, value: Number(e.target.value) })} />)}
          {F('is_debuff', '类型', (
            <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
              {[{ v: false, l: '✨ Buff' }, { v: true, l: '☠️ Debuff' }].map(o => (
                <button key={String(o.v)} onClick={() => setForm({ ...form, is_debuff: o.v })}
                  style={{ flex: 1, padding: '8px', borderRadius: 7, border: `1px solid ${form.is_debuff === o.v ? (o.v ? '#f85149' : '#3fb950') : '#30363d'}`, background: form.is_debuff === o.v ? (o.v ? 'rgba(248,81,73,0.12)' : 'rgba(63,185,80,0.12)') : 'transparent', color: form.is_debuff === o.v ? (o.v ? '#f85149' : '#3fb950') : '#8b949e', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{o.l}</button>
              ))}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 4 }}>
          <label style={{ display: 'block', fontSize: 10, color: '#8b949e', marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>效果公式</label>
          <input style={INPUT} value={form.effect_formula} onChange={e => setForm({ ...form, effect_formula: e.target.value })} placeholder="-value 或 Math.floor(value*0.5)" />
          <FormulaPreview formula={form.effect_formula} />
        </div>
        <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: form.is_debuff ? 'rgba(248,81,73,0.06)' : 'rgba(63,185,80,0.06)', border: `1px solid ${form.is_debuff ? 'rgba(248,81,73,0.2)' : 'rgba(63,185,80,0.2)'}`, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 26 }}>{form.icon || '⚡'}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{form.name || '未命名'}
              <span style={{ marginLeft: 8, fontSize: 10, padding: '1px 8px', borderRadius: 10, background: form.is_debuff ? 'rgba(248,81,73,0.15)' : 'rgba(63,185,80,0.15)', color: form.is_debuff ? '#f85149' : '#3fb950' }}>{form.is_debuff ? 'DEBUFF' : 'BUFF'}</span>
            </div>
            <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>持续 {form.duration} 回合 · 作用于 {form.target.toUpperCase()} · 最多叠 {form.max_stack} 层</div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ ...BTN('transparent', '#8b949e'), border: '1px solid #30363d' }}>取消</button>
          <button onClick={save} style={BTN('#58a6ff', '#fff')}>{form.id ? '保存修改' : '添加 Buff'}</button>
        </div>
      </div>
    </div>
  )
}

/* ── 主 RulesTab ── */
export default function RulesTab({ toast }) {
  const [rules, setRules]           = useState([])
  const [buffs, setBuffs]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [section, setSection]       = useState('rules')
  const [activeCategory, setActiveCategory] = useState('combat')
  const [buffModal, setBuffModal]   = useState(false)
  const [editBuff, setEditBuff]     = useState(null)
  const [confirmDeleteBuff, setConfirmDeleteBuff] = useState(null)

  async function loadAll() {
    setLoading(true)
    const [{ data: r }, { data: b }] = await Promise.all([
      supabase.from('game_rules').select('*').order('category').order('id'),
      supabase.from('buff_pool').select('*').order('is_debuff', { ascending: false }).order('id'),
    ])
    setRules(r || []); setBuffs(b || []); setLoading(false)
  }
  useEffect(() => { loadAll() }, [])

  function updateRuleLocal(id, val) { setRules(prev => prev.map(r => r.id === id ? { ...r, value: val } : r)) }

  async function deleteBuffConfirm(id) {
    await supabase.from('buff_pool').delete().eq('id', id)
    toast('Buff 已删除'); setConfirmDeleteBuff(null); loadAll()
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#8b949e' }}><div style={{ fontSize: 28, marginBottom: 8 }}>⚙️</div>加载规则配置中...</div>

  const categories = [...new Set(rules.map(r => r.category))]
  const filteredRules = rules.filter(r => r.category === activeCategory)

  return (
    <div>
      {/* 子导航 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[{ k: 'rules', label: '📋 全局规则' }, { k: 'buffs', label: '✨ Buff 池', count: buffs.length }].map(s => (
          <button key={s.k} onClick={() => setSection(s.k)} style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${section === s.k ? '#58a6ff' : '#30363d'}`, background: section === s.k ? 'rgba(88,166,255,0.12)' : 'transparent', color: section === s.k ? '#58a6ff' : '#8b949e', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {s.label}{s.count !== undefined && <span style={{ marginLeft: 4, fontSize: 11, opacity: 0.65 }}>({s.count})</span>}
          </button>
        ))}
      </div>

      {/* ─── 规则编辑 ─── */}
      {section === 'rules' && (
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16 }}>
          <div>
            <div style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', overflow: 'hidden' }}>
              {categories.map(cat => {
                const meta = CATEGORY_META[cat] || CATEGORY_META.general
                const count = rules.filter(r => r.category === cat).length
                return (
                  <button key={cat} onClick={() => setActiveCategory(cat)} style={{ width: '100%', padding: '12px 16px', border: 'none', textAlign: 'left', background: activeCategory === cat ? `${meta.color}12` : 'transparent', borderLeft: `3px solid ${activeCategory === cat ? meta.color : 'transparent'}`, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.15s' }}>
                    <span style={{ fontSize: 13, fontWeight: activeCategory === cat ? 600 : 400, color: activeCategory === cat ? meta.color : '#8b949e' }}>{meta.label}</span>
                    <span style={{ fontSize: 10, color: '#484f58', fontFamily: 'monospace' }}>{count}</span>
                  </button>
                )
              })}
            </div>
            <div style={{ marginTop: 12, padding: 14, borderRadius: 10, background: 'rgba(88,166,255,0.06)', border: '1px solid rgba(88,166,255,0.15)' }}>
              <div style={{ fontSize: 11, color: '#58a6ff', fontWeight: 600, marginBottom: 6 }}>💡 使用说明</div>
              <div style={{ fontSize: 11, color: '#8b949e', lineHeight: 1.7 }}>规则修改后<strong style={{ color: '#d29922' }}>仅对新创建的房间生效</strong>。公式支持四则运算与 Math 函数。</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>{CATEGORY_META[activeCategory]?.label}</span>
              <span style={{ fontSize: 11, color: '#484f58' }}>{filteredRules.length} 条规则</span>
            </div>
            {filteredRules.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#484f58', fontSize: 13 }}>此分类暂无规则。请先在 Supabase 中执行初始化 SQL。</div>}
            {filteredRules.map(rule => <RuleRow key={rule.id} rule={rule} onSave={updateRuleLocal} toast={toast} />)}
          </div>
        </div>
      )}

      {/* ─── Buff 池 ─── */}
      {section === 'buffs' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: '#8b949e' }}>管理游戏内的 Buff / Debuff 效果，道具可触发这些效果</div>
            <button onClick={() => { setEditBuff(null); setBuffModal(true) }} style={BTN('#58a6ff', '#fff')}>+ 添加 Buff</button>
          </div>
          {[{ label: 'Debuff — 负面效果', isDebuff: true, color: '#f85149' }, { label: 'Buff — 正面效果', isDebuff: false, color: '#3fb950' }].map(group => {
            const grouped = buffs.filter(b => b.is_debuff === group.isDebuff)
            if (grouped.length === 0) return null
            return (
              <div key={String(group.isDebuff)} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: group.color, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{group.label}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
                  {grouped.map(buff => {
                    const isConf = confirmDeleteBuff === buff.id
                    const typeMeta = BUFF_TYPE_META[buff.type] || BUFF_TYPE_META.special
                    return (
                      <div key={buff.id} style={{ background: '#1c2129', borderRadius: 12, padding: 16, border: `1px solid ${isConf ? '#f85149' : '#30363d'}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 26 }}>{buff.icon}</span>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 14 }}>{buff.name}</div>
                              <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                                <span style={{ fontSize: 10, color: typeMeta.color, background: `${typeMeta.color}15`, padding: '1px 7px', borderRadius: 8 }}>{typeMeta.label}</span>
                                <span style={{ fontSize: 10, color: '#8b949e', background: 'rgba(139,148,158,0.1)', padding: '1px 7px', borderRadius: 8 }}>{buff.target.toUpperCase()}</span>
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
                            <button onClick={() => { setEditBuff(buff); setBuffModal(true) }} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(88,166,255,0.2)', background: 'rgba(88,166,255,0.08)', color: '#58a6ff', fontSize: 12, cursor: 'pointer' }}>编辑</button>
                            {isConf
                              ? <><button onClick={() => deleteBuffConfirm(buff.id)} style={BTN('rgba(248,81,73,0.15)', '#f85149', { padding: '4px 10px', fontSize: 11, border: '1px solid rgba(248,81,73,0.3)' })}>确认</button>
                                 <button onClick={() => setConfirmDeleteBuff(null)} style={BTN('transparent', '#8b949e', { padding: '4px 10px', fontSize: 11, border: '1px solid #30363d' })}>取消</button></>
                              : <button onClick={() => setConfirmDeleteBuff(buff.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#484f58', fontSize: 15 }}>🗑️</button>}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: '#8b949e', display: 'flex', gap: 12 }}>
                          <span>⏱ {buff.duration} 回合</span>
                          <span>叠加 ×{buff.max_stack}</span>
                          <span style={{ color: '#484f58', fontFamily: 'monospace' }}>{buff.effect_formula}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {buffs.length === 0 && <div style={{ textAlign: 'center', padding: 56, color: '#8b949e' }}>暂无 Buff，点击上方按钮添加</div>}
        </div>
      )}

      <BuffModal open={buffModal} onClose={() => { setBuffModal(false); setEditBuff(null) }} editBuff={editBuff} onSave={loadAll} toast={toast} />
    </div>
  )
}
