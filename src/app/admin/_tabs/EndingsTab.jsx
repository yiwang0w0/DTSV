'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { postGameApi, getGameApi } from '@/lib/gameApi'
import { BTN, INPUT, LABEL, Spinner, C, DeleteBtn } from '../_shared/ui'

export default function EndingsTab({ toast }) {
  const [endings, setEndings] = useState([])
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [endRes, { data: its }] = await Promise.all([
        getGameApi('/api/endings'),
        supabase.from('item_pool').select('id,name').order('name'),
      ])
      setEndings(endRes?.endings || [])
      setItems(its || [])
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
      key: `ending_${Date.now().toString(36)}`,
      name: '新结局',
      description: '',
      banner_text: '',
      rewards: [],
      active: true,
    })
  }
  function startEdit(e) { setEditingId(e.id); setDraft({ ...e }) }
  function cancelEdit() { setEditingId(null); setDraft(null) }

  async function save() {
    if (!draft) return
    try {
      if (editingId === 'new') {
        await postGameApi('/api/endings', { action: 'create', ...draft })
        toast('已创建结局')
      } else {
        await postGameApi('/api/endings', { action: 'update', id: editingId, ...draft })
        toast('已保存')
      }
      cancelEdit(); reload()
    } catch (err) { toast(err.message || '保存失败', 'error') }
  }
  async function remove(id) {
    try {
      await postGameApi('/api/endings', { action: 'delete', id })
      toast('已删除'); reload()
    } catch (err) { toast(err.message || '删除失败', 'error') }
  }

  if (loading) return <Spinner />

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>🎬 结局</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: C.dim }}>
            分支节点设置 triggerEnding 时按 key 查找此处定义的结局；对局立即结束并向存活玩家发奖。
          </p>
        </div>
        <button onClick={startNew} style={{ ...BTN(`${C.purple}18`, C.purple), border: `1px solid ${C.purple}40` }}>+ 新建结局</button>
      </div>

      {editingId !== null && draft && (
        <EndingEditor draft={draft} setDraft={setDraft} items={items} onSave={save} onCancel={cancelEdit} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {endings.length === 0 && editingId === null && (
          <div style={{ textAlign: 'center', padding: 60, color: C.dim2 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🎭</div>
            <p style={{ margin: 0 }}>还没有结局</p>
          </div>
        )}

        {endings.map(e => (
          <div key={e.id} style={{
            background: C.bg1, borderRadius: 12,
            border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${e.active ? C.purple : C.dim2}`,
            padding: '14px 18px', opacity: e.active ? 1 : 0.6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{e.name}</span>
              <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 10, background: e.active ? `${C.green}18` : `${C.dim2}18`, color: e.active ? C.green : C.dim, border: `1px solid ${e.active ? `${C.green}40` : C.border}` }}>{e.active ? '启用' : '禁用'}</span>
              <code style={{ fontSize: 10, color: C.accent, fontFamily: 'monospace', background: `${C.accent}10`, padding: '1px 6px', borderRadius: 4 }}>{e.key}</code>
              <span style={{ fontSize: 10, color: C.dim2, fontFamily: 'monospace', marginLeft: 'auto' }}>#{e.id}</span>
              <button onClick={() => startEdit(e)} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: `${C.accent}15`, color: C.accent, border: `1px solid ${C.accent}30` }}>编辑</button>
              <DeleteBtn onConfirm={() => remove(e.id)} />
            </div>
            {e.description && <div style={{ fontSize: 12, color: C.dim, marginBottom: 6 }}>{e.description}</div>}
            {e.banner_text && <div style={{ fontSize: 12, color: C.purple, fontStyle: 'italic', marginBottom: 6 }}>「{e.banner_text}」</div>}
            <div style={{ fontSize: 11, color: C.dim2 }}>
              奖励 {(e.rewards || []).length} 项
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EndingEditor({ draft, setDraft, items, onSave, onCancel }) {
  function update(p) { setDraft({ ...draft, ...p }) }
  function addReward() { update({ rewards: [...(draft.rewards || []), { name: '', quantity: 1 }] }) }
  function updReward(i, p) {
    update({ rewards: (draft.rewards || []).map((r, idx) => idx === i ? { ...r, ...p } : r) })
  }
  function delReward(i) {
    update({ rewards: (draft.rewards || []).filter((_, idx) => idx !== i) })
  }

  return (
    <div style={{ marginBottom: 16, padding: 18, background: C.bg1, borderRadius: 12, border: `1px solid ${C.purple}40` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.purple }}>
          {draft.id ? `编辑：${draft.name}` : '新建结局'}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={onCancel} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'transparent', color: C.dim, border: `1px solid ${C.border}` }}>取消</button>
        <button onClick={onSave} style={{ padding: '6px 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: C.purple, color: '#fff', border: 'none', fontWeight: 700 }}>保存</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 12 }}>
        <div>
          <label style={LABEL}>key（唯一标识）</label>
          <input style={INPUT} value={draft.key} onChange={e => update({ key: e.target.value })} placeholder="如 good_ending" />
        </div>
        <div>
          <label style={LABEL}>名称</label>
          <input style={INPUT} value={draft.name} onChange={e => update({ name: e.target.value })} />
        </div>
        <div>
          <label style={LABEL}>状态</label>
          <select style={INPUT} value={draft.active ? '1' : '0'} onChange={e => update({ active: e.target.value === '1' })}>
            <option value="1">启用</option><option value="0">禁用</option>
          </select>
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={LABEL}>描述（管理员备忘）</label>
          <input style={INPUT} value={draft.description || ''} onChange={e => update({ description: e.target.value })} />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={LABEL}>剧情文本（玩家会看到）</label>
          <input style={INPUT} value={draft.banner_text || ''} onChange={e => update({ banner_text: e.target.value })} placeholder="如 「在火光中，残存者带着古钥匙逃出生天…」" />
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ ...LABEL, margin: 0 }}>结局奖励 ({(draft.rewards || []).length})</span>
          <button onClick={addReward} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: `${C.yellow}18`, color: C.yellow, border: `1px solid ${C.yellow}40` }}>+ 添加奖励</button>
        </div>
        <div style={{ fontSize: 11, color: C.dim2, marginBottom: 8 }}>
          奖励发给所有还存活（含已撤离）的玩家账户库
        </div>
        {(draft.rewards || []).map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <select style={{ ...INPUT, flex: 1 }} value={r.name || ''} onChange={e => updReward(i, { name: e.target.value })}>
              <option value="">选择道具…</option>
              {items.map(it => <option key={it.id} value={it.name}>{it.name}</option>)}
            </select>
            <input type="number" min={1} style={{ ...INPUT, width: 100 }} value={r.quantity} onChange={e => updReward(i, { quantity: parseInt(e.target.value, 10) || 1 })} />
            <button onClick={() => delReward(i)} style={{ padding: '6px 10px', borderRadius: 6, fontSize: 14, cursor: 'pointer', background: 'transparent', color: C.dim2, border: `1px solid ${C.border}` }}>🗑️</button>
          </div>
        ))}
      </div>
    </div>
  )
}
