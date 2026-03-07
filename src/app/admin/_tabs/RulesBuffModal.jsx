'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { BTN, INPUT, FormulaPreview } from '../_shared/ui'

export const BUFF_TYPE_META = {
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

export default function RulesBuffModal({ open, onClose, editBuff, onSave, toast }) {
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
          {F('is_debuff', '正负', (
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
