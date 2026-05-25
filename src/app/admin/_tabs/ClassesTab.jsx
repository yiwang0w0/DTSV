'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { BTN, INPUT, LABEL, Modal } from '../_shared/ui'

/**
 * Phase 24c — ClassesTab: classes CRUD
 *
 * 入场时按 rarity 抽 3 normal + 10% legendary;玩家可花 1 class_pt 保底刷高级
 * perks 5-8 个白名单 key 直接编辑(JSON 输入)
 */

const RARITY_OPTIONS = [
  { value: 'normal',    label: 'NORMAL',    color: '#58a6ff' },
  { value: 'legendary', label: 'LEGENDARY', color: '#d29922' },
]

const PERK_KEYS = [
  { key: 'search_bonus',        label: '搜索成功率 +', hint: '0.10 = +10%' },
  { key: 'pollution_resist',    label: '污染抵抗',     hint: '0.20 = +20%; 负值则加快' },
  { key: 'combat_dmg_mult',     label: '战斗伤害 ×',   hint: '0.15 = +15%' },
  { key: 'combat_def_mult',     label: '战斗防御 ×',   hint: '0.10 = +10%' },
  { key: 'omega_window_bonus',  label: 'Ω 窗口 +',     hint: '整数 +N 回合' },
  { key: 'fragment_drop_bonus', label: '残片掉率 +',   hint: '0.15 = +15pp 绝对加值' },
  { key: 'catalog_unlock_tag',  label: '专属商店标签', hint: '字符串,如 omega_gear' },
]

const EMPTY = {
  name: '', description: '', rarity: 'normal',
  base_atk_bonus: 0, base_def_bonus: 0, base_hp_bonus: 0,
  perks: {}, enabled: true,
}

export default function ClassesTab({ toast }) {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [edit, setEdit] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  async function load() {
    const { data } = await supabase.from('classes').select('*').order('rarity').order('id')
    setClasses(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function openAdd() { setEdit({ ...EMPTY, perks: {} }); setModal(true) }
  function openEdit(c) {
    setEdit({
      ...EMPTY,
      ...c,
      perks: c.perks && typeof c.perks === 'object' ? { ...c.perks } : {},
    })
    setModal(true)
  }

  async function save() {
    if (!edit.name?.trim()) { toast('请填写职业名', 'error'); return }
    // 过滤 perks: 仅保留白名单 key
    const cleaned = {}
    for (const { key } of PERK_KEYS) {
      const v = edit.perks?.[key]
      if (v !== undefined && v !== null && v !== '') {
        // omega_window_bonus 整数 / catalog_unlock_tag 字符串 / 其他 number
        if (key === 'catalog_unlock_tag') cleaned[key] = String(v)
        else if (key === 'omega_window_bonus') cleaned[key] = parseInt(v, 10) || 0
        else cleaned[key] = Number(v) || 0
      }
    }
    const payload = { ...edit, perks: cleaned }
    delete payload.created_at

    if (edit.id) {
      const id = payload.id; delete payload.id
      const { error } = await supabase.from('classes').update(payload).eq('id', id)
      if (error) { toast('更新失败: ' + error.message, 'error'); return }
      toast('职业已更新')
    } else {
      delete payload.id
      const { error } = await supabase.from('classes').insert(payload)
      if (error) { toast('添加失败: ' + error.message, 'error'); return }
      toast('职业已添加')
    }
    setModal(false)
    load()
  }

  async function remove(id) {
    const { error } = await supabase.from('classes').delete().eq('id', id)
    if (error) { toast('删除失败 ' + error.message, 'error'); return }
    toast('职业已删除')
    setConfirmDel(null)
    load()
  }

  async function toggleEnabled(c) {
    await supabase.from('classes').update({ enabled: !c.enabled }).eq('id', c.id)
    load()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#8b949e' }}>加载中...</div>

  const normals = classes.filter(c => c.rarity === 'normal')
  const legendaries = classes.filter(c => c.rarity === 'legendary')

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#8b949e' }}>
          共 {classes.length} 职业 · NORMAL {normals.length} · LEGENDARY {legendaries.length} · 启用 {classes.filter(c => c.enabled).length}
        </div>
        <button onClick={openAdd} style={BTN('#58a6ff', '#fff')}>+ 添加职业</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {classes.map(c => {
          const rmeta = RARITY_OPTIONS.find(r => r.value === c.rarity)
          return (
            <div key={c.id} style={{
              background: '#161b22', borderRadius: 8,
              border: `1px solid ${c.enabled ? '#21262d' : '#f8514930'}`,
              borderLeft: `3px solid ${rmeta?.color}`,
              padding: '10px 14px', opacity: c.enabled ? 1 : 0.5,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: rmeta?.color }}>{c.name}</span>
                    <span style={{
                      padding: '1px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700,
                      background: `${rmeta?.color}15`, color: rmeta?.color,
                    }}>{rmeta?.label}</span>
                    <span style={{ fontSize: 10, color: '#8b949e' }}>ATK +{c.base_atk_bonus} · DEF +{c.base_def_bonus} · HP +{c.base_hp_bonus}</span>
                  </div>
                  {c.description && <div style={{ fontSize: 11, color: '#8b949e', marginTop: 3 }}>{c.description}</div>}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                    {Object.entries(c.perks || {}).map(([k, v]) => (
                      <span key={k} style={{
                        fontSize: 9, padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace',
                        background: '#bc8cff15', color: '#bc8cff',
                      }}>{k}={typeof v === 'number' ? v : `"${v}"`}</span>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => toggleEnabled(c)} style={BTN('transparent', '#8b949e', { fontSize: 11, padding: '4px 10px', border: '1px solid #30363d' })}>{c.enabled ? '禁用' : '启用'}</button>
                  <button onClick={() => openEdit(c)} style={BTN('transparent', '#58a6ff', { fontSize: 11, padding: '4px 10px', border: '1px solid rgba(88,166,255,0.3)' })}>编辑</button>
                  <button onClick={() => setConfirmDel(c)} style={BTN('rgba(248,81,73,0.15)', '#f85149', { fontSize: 11, padding: '4px 10px', border: '1px solid rgba(248,81,73,0.3)' })}>删除</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {confirmDel && (
        <Modal open={true} title="确认删除" onClose={() => setConfirmDel(null)}>
          <p style={{ color: '#e6edf3', marginBottom: 16 }}>删除职业「{confirmDel.name}」?玩家已选过的 player_class_runs 记录将外键级联删除。</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setConfirmDel(null)} style={BTN('transparent', '#8b949e', { border: '1px solid #30363d' })}>取消</button>
            <button onClick={() => remove(confirmDel.id)} style={BTN('rgba(248,81,73,0.15)', '#f85149', { border: '1px solid rgba(248,81,73,0.3)' })}>删除</button>
          </div>
        </Modal>
      )}

      {modal && edit && (
        <Modal open={true} title={edit.id ? `编辑 ${edit.name}` : '添加职业'} onClose={() => setModal(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={LABEL}>职业名</label>
              <input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} style={INPUT} placeholder="巡检员" />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={LABEL}>描述</label>
              <textarea rows={2} value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} style={{ ...INPUT, resize: 'vertical' }} />
            </div>
            <div>
              <label style={LABEL}>稀有度</label>
              <select value={edit.rarity} onChange={e => setEdit({ ...edit, rarity: e.target.value })} style={INPUT}>
                {RARITY_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div></div>
            <div>
              <label style={LABEL}>base_atk_bonus</label>
              <input type="number" value={edit.base_atk_bonus} onChange={e => setEdit({ ...edit, base_atk_bonus: parseInt(e.target.value) || 0 })} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>base_def_bonus</label>
              <input type="number" value={edit.base_def_bonus} onChange={e => setEdit({ ...edit, base_def_bonus: parseInt(e.target.value) || 0 })} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>base_hp_bonus</label>
              <input type="number" value={edit.base_hp_bonus} onChange={e => setEdit({ ...edit, base_hp_bonus: parseInt(e.target.value) || 0 })} style={INPUT} />
            </div>
          </div>

          {/* perks 白名单编辑器 */}
          <div style={{ marginTop: 14, padding: 10, background: '#0e1117', borderRadius: 6, border: '1px solid #21262d' }}>
            <div style={{ fontSize: 12, color: '#bc8cff', marginBottom: 8, fontWeight: 600 }}>Perks（白名单 7 个 key,留空 = 不生效）</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {PERK_KEYS.map(({ key, label, hint }) => (
                <div key={key}>
                  <label style={{ fontSize: 10, color: '#8b949e', display: 'block' }}>{label} <span style={{ color: '#484f58' }}>({hint})</span></label>
                  <input
                    type={key === 'catalog_unlock_tag' ? 'text' : 'number'}
                    step={key === 'omega_window_bonus' ? '1' : '0.05'}
                    value={edit.perks?.[key] ?? ''}
                    onChange={e => setEdit({ ...edit, perks: { ...edit.perks, [key]: e.target.value } })}
                    style={{ ...INPUT, fontSize: 11, padding: '5px 8px' }}
                    placeholder={key === 'catalog_unlock_tag' ? '如 omega_gear' : '0'}
                  />
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button onClick={() => setModal(false)} style={BTN('transparent', '#8b949e', { border: '1px solid #30363d' })}>取消</button>
            <button onClick={save} style={BTN('#58a6ff', '#fff')}>{edit.id ? '保存' : '添加'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
