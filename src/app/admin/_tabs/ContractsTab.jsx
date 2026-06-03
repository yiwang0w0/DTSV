'use client'

import { useCallback, useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { postGameApi } from '@/lib/gameApi'
import { BTN, INPUT, LABEL, Spinner, C } from '../_shared/ui'

const OBJECTIVE_TYPES = [
  { value: 'find_item',   label: '搜集道具',          fields: ['itemName', 'count'] },
  { value: 'kill_npc',    label: '击杀指定实体',      fields: ['npcName', 'count'] },
  { value: 'kill_any',    label: '击杀任意实体 N 次', fields: ['count'] },
  { value: 'extract',     label: '成功撤离 N 次',     fields: ['count'] },
  { value: 'extract_at',  label: '从指定撤离点撤离', fields: ['extractionPointId'] },
  { value: 'purchase',    label: '购买装备/物资 N 次', fields: ['count'] },
  { value: 'leave_probe', label: '留下跃迁者残影 N 次', fields: ['count'] },
]

export default function ContractsTab({ toast }) {
  const [contracts, setContracts] = useState([])
  const [items, setItems]     = useState([])
  const [npcs, setNpcs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft]     = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: cs }, { data: its }, { data: ns }] = await Promise.all([
        supabase.from('contracts').select('*').order('id', { ascending: false }),
        supabase.from('item_pool').select('id,name,kind').order('name'),
        supabase.from('npc_pool').select('id,name,level').order('name'),
      ])
      setContracts(cs || [])
      setItems(its || [])
      setNpcs(ns || [])
    } catch (err) {
      toast(err.message || '加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { reload() }, [reload])

  function startNew() {
    setEditingId('new')
    setDraft({
      name: '新合同', description: '', active: true,
      objectives: [], rewards: [],
    })
  }
  function startEdit(c) {
    setEditingId(c.id)
    setDraft({ ...c })
  }
  function cancelEdit() {
    setEditingId(null)
    setDraft(null)
  }

  async function save() {
    if (!draft) return
    try {
      if (editingId === 'new') {
        await postGameApi('/api/contracts', { action: 'create', ...draft })
        toast('已创建合同')
      } else {
        await postGameApi('/api/contracts', { action: 'update', id: editingId, ...draft })
        toast('已保存')
      }
      cancelEdit()
      reload()
    } catch (err) {
      toast(err.message || '保存失败', 'error')
    }
  }

  async function remove(id) {
    if (!confirm('确认删除该合同？所有玩家的进度记录也会被清除。')) return
    try {
      await postGameApi('/api/contracts', { action: 'delete', id })
      toast('已删除')
      reload()
    } catch (err) {
      toast(err.message || '删除失败', 'error')
    }
  }

  if (loading) return <Spinner />

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>📜 合同 / 任务</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: C.dim }}>
            玩家进入 raid 后，凡接受过的合同会自动追踪进度，达成时奖励入账户库。
          </p>
        </div>
        <button
          onClick={startNew}
          style={{ ...BTN(`${C.green}18`, C.green), border: `1px solid ${C.green}40` }}
        >+ 新建合同</button>
      </div>

      {editingId !== null && draft && (
        <ContractEditor
          draft={draft} setDraft={setDraft}
          items={items} npcs={npcs}
          onSave={save} onCancel={cancelEdit}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {contracts.length === 0 && editingId === null && (
          <div style={{ textAlign: 'center', padding: 60, color: C.dim2 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
            <p style={{ margin: 0 }}>还没有合同。点右上角「新建合同」开始。</p>
          </div>
        )}

        {contracts.map(c => (
          <div key={c.id} style={{
            background: C.bg1, borderRadius: 12,
            border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${c.active ? C.green : C.dim2}`,
            padding: '14px 18px', opacity: c.active ? 1 : 0.6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</span>
              <span style={{
                fontSize: 10, padding: '1px 8px', borderRadius: 10,
                background: c.active ? `${C.green}18` : `${C.dim2}18`,
                color: c.active ? C.green : C.dim,
                border: `1px solid ${c.active ? `${C.green}40` : C.border}`,
              }}>{c.active ? '启用' : '停用'}</span>
              <span style={{ fontSize: 10, color: C.dim2, fontFamily: 'monospace' }}>#{c.id}</span>
              <div style={{ flex: 1 }} />
              <button
                onClick={() => startEdit(c)}
                style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: `${C.accent}15`, color: C.accent, border: `1px solid ${C.accent}30` }}
              >编辑</button>
              <button
                onClick={() => remove(c.id)}
                style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: `${C.red}15`, color: C.red, border: `1px solid ${C.red}30` }}
              >删除</button>
            </div>
            {c.description && (
              <div style={{ fontSize: 12, color: C.dim, marginTop: 6 }}>{c.description}</div>
            )}
            <div style={{ fontSize: 11, color: C.dim2, marginTop: 8 }}>
              目标 {(c.objectives || []).length} 个 · 奖励 {(c.rewards || []).length} 项
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ContractEditor({ draft, setDraft, items, npcs, onSave, onCancel }) {
  function update(patch) { setDraft({ ...draft, ...patch }) }
  function addObjective() {
    update({ objectives: [...(draft.objectives || []), { type: 'find_item', itemName: '', count: 1 }] })
  }
  function removeObjective(i) {
    update({ objectives: (draft.objectives || []).filter((_, idx) => idx !== i) })
  }
  function updateObjective(i, patch) {
    update({ objectives: (draft.objectives || []).map((o, idx) => idx === i ? { ...o, ...patch } : o) })
  }
  function addReward() {
    update({ rewards: [...(draft.rewards || []), { name: '', quantity: 1 }] })
  }
  function removeReward(i) {
    update({ rewards: (draft.rewards || []).filter((_, idx) => idx !== i) })
  }
  function updateReward(i, patch) {
    update({ rewards: (draft.rewards || []).map((r, idx) => idx === i ? { ...r, ...patch } : r) })
  }

  return (
    <div style={{
      marginBottom: 16, padding: 18,
      background: C.bg1, borderRadius: 12,
      border: `1px solid ${C.accent}40`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.accent }}>
          {draft.id ? `编辑：${draft.name}` : '新建合同'}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={onCancel} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'transparent', color: C.dim, border: `1px solid ${C.border}` }}>取消</button>
        <button onClick={onSave} style={{ padding: '6px 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: C.accent, color: '#fff', border: 'none', fontWeight: 700 }}>保存</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <div>
          <label style={LABEL}>名称</label>
          <input style={INPUT} value={draft.name} onChange={e => update({ name: e.target.value })} />
        </div>
        <div>
          <label style={LABEL}>状态</label>
          <select style={INPUT} value={draft.active ? '1' : '0'} onChange={e => update({ active: e.target.value === '1' })}>
            <option value="1">启用</option>
            <option value="0">停用</option>
          </select>
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={LABEL}>描述</label>
          <input style={INPUT} value={draft.description || ''} onChange={e => update({ description: e.target.value })} placeholder="（可选）合同剧情/给玩家看的提示" />
        </div>
      </div>

      {/* 目标 */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ ...LABEL, margin: 0 }}>目标 ({(draft.objectives || []).length})</span>
          <button onClick={addObjective} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: `${C.green}18`, color: C.green, border: `1px solid ${C.green}40` }}>+ 添加目标</button>
        </div>
        {(draft.objectives || []).length === 0 ? (
          <div style={{ padding: 14, color: C.dim2, fontSize: 12, textAlign: 'center', borderRadius: 8, border: `1px dashed ${C.border}` }}>
            还没有目标，点上方「添加目标」
          </div>
        ) : (draft.objectives || []).map((obj, i) => (
          <ObjectiveRow
            key={i}
            obj={obj}
            items={items} npcs={npcs}
            onChange={p => updateObjective(i, p)}
            onDelete={() => removeObjective(i)}
          />
        ))}
      </div>

      {/* 奖励 */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ ...LABEL, margin: 0 }}>奖励（道具入账户库） ({(draft.rewards || []).length})</span>
          <button onClick={addReward} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: `${C.yellow}18`, color: C.yellow, border: `1px solid ${C.yellow}40` }}>+ 添加奖励</button>
        </div>
        {(draft.rewards || []).map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <select
              style={{ ...INPUT, flex: 1 }}
              value={r.name || ''}
              onChange={e => updateReward(i, { name: e.target.value })}
            >
              <option value="">选择道具…</option>
              {items.map(it => <option key={it.id} value={it.name}>{it.name}</option>)}
            </select>
            <input
              type="number" min={1}
              style={{ ...INPUT, width: 100 }}
              value={r.quantity}
              onChange={e => updateReward(i, { quantity: parseInt(e.target.value, 10) || 1 })}
            />
            <button onClick={() => removeReward(i)} style={{ padding: '6px 10px', borderRadius: 6, fontSize: 14, cursor: 'pointer', background: 'transparent', color: C.dim2, border: `1px solid ${C.border}` }}>🗑️</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ObjectiveRow({ obj, items, npcs, onChange, onDelete }) {
  const meta = OBJECTIVE_TYPES.find(t => t.value === obj.type) || OBJECTIVE_TYPES[0]

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 8,
      padding: '10px 12px', borderRadius: 8, background: C.bg2, border: `1px solid ${C.border}`,
    }}>
      <div style={{ width: 140 }}>
        <label style={LABEL}>类型</label>
        <select
          style={INPUT}
          value={obj.type}
          onChange={e => {
            const next = { type: e.target.value, count: obj.count || 1 }
            onChange(next)
          }}
        >
          {OBJECTIVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {meta.fields.includes('itemName') && (
        <div style={{ flex: 1 }}>
          <label style={LABEL}>道具</label>
          <select style={INPUT} value={obj.itemName || ''} onChange={e => onChange({ itemName: e.target.value })}>
            <option value="">选择…</option>
            {items.map(it => <option key={it.id} value={it.name}>{it.name}</option>)}
          </select>
        </div>
      )}
      {meta.fields.includes('npcName') && (
        <div style={{ flex: 1 }}>
          <label style={LABEL}>NPC</label>
          <select style={INPUT} value={obj.npcName || ''} onChange={e => onChange({ npcName: e.target.value })}>
            <option value="">选择…</option>
            {npcs.map(n => <option key={n.id} value={n.name}>{n.name} ({n.level})</option>)}
          </select>
        </div>
      )}
      {meta.fields.includes('extractionPointId') && (
        <div style={{ flex: 1 }}>
          <label style={LABEL}>撤离点 ID</label>
          <input
            style={INPUT}
            value={obj.extractionPointId || ''}
            onChange={e => onChange({ extractionPointId: e.target.value })}
            placeholder="如 extract_xxx"
          />
        </div>
      )}
      {meta.fields.includes('count') && (
        <div style={{ width: 80 }}>
          <label style={LABEL}>数量</label>
          <input
            type="number" min={1}
            style={INPUT}
            value={obj.count || 1}
            onChange={e => onChange({ count: parseInt(e.target.value, 10) || 1 })}
          />
        </div>
      )}

      <button onClick={onDelete} style={{ padding: '8px 10px', borderRadius: 6, fontSize: 14, cursor: 'pointer', background: 'transparent', color: C.dim2, border: `1px solid ${C.border}` }}>🗑️</button>
    </div>
  )
}
