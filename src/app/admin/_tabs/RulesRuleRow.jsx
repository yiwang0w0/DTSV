'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { BTN, INPUT, FormulaPreview } from '../_shared/ui'

export default function RuleRow({ rule, onSave, toast }) {
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
