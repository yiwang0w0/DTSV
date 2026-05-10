'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { postGameApi, getGameApi } from '@/lib/gameApi'
import { BTN, INPUT, LABEL, Spinner, MAP_LIST } from '../_shared/ui'

const C = {
  bg1: '#1c2129', bg2: '#161b22', bg0: '#0e1117',
  border: '#30363d', border2: '#21262d',
  text: '#e6edf3', dim: '#8b949e', dim2: '#484f58',
  accent: '#58a6ff', green: '#3fb950', red: '#f85149', yellow: '#d29922', purple: '#bc8cff',
}

const COND_TYPES = [
  { value: 'flagEquals',      label: 'flag 等于',         fields: ['key', 'valueJson'] },
  { value: 'flagAtLeast',     label: 'flag ≥ N',          fields: ['key', 'value'] },
  { value: 'anyPlayerHas',    label: '任一玩家持有道具', fields: ['itemName'] },
  { value: 'allPlayersHave',  label: '全员持有道具',     fields: ['itemName'] },
  { value: 'anyPlayerKilled', label: '任一玩家击杀过',  fields: ['npcName'] },
  { value: 'mapVisited',      label: '玩家进过该地图',  fields: ['mapId'] },
  { value: 'extractedCount',  label: '撤离人数 ≥ N',     fields: ['count'] },
  { value: 'aliveCount',      label: '存活人数 op N',    fields: ['op', 'value'] },
  { value: 'playerCount',     label: '总人数 op N',      fields: ['op', 'value'] },
]

const OP_OPTIONS = ['<', '<=', '==', '>=', '>', '!=']

export default function BranchesTab({ toast }) {
  const [nodes, setNodes] = useState([])
  const [items, setItems] = useState([])
  const [npcs, setNpcs]   = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [nodeRes, { data: its }, { data: ns }] = await Promise.all([
        getGameApi('/api/branches'),
        supabase.from('item_pool').select('id,name').order('name'),
        supabase.from('npc_pool').select('id,name').order('name'),
      ])
      setNodes(nodeRes?.nodes || [])
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
      name: '新分支节点', description: '', active: true,
      once: true, scope: 'room',
      conditions: [], branches: [],
    })
  }
  function startEdit(n) { setEditingId(n.id); setDraft({ ...n }) }
  function cancelEdit() { setEditingId(null); setDraft(null) }

  async function save() {
    if (!draft) return
    try {
      if (editingId === 'new') {
        await postGameApi('/api/branches', { action: 'create', ...draft })
        toast('已创建')
      } else {
        await postGameApi('/api/branches', { action: 'update', id: editingId, ...draft })
        toast('已保存')
      }
      cancelEdit(); reload()
    } catch (err) {
      toast(err.message || '保存失败', 'error')
    }
  }

  async function remove(id) {
    if (!confirm('确认删除该分支节点？')) return
    try {
      await postGameApi('/api/branches', { action: 'delete', id })
      toast('已删除'); reload()
    } catch (err) {
      toast(err.message || '删除失败', 'error')
    }
  }

  if (loading) return <Spinner />

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>🌿 分支节点（剧情条件引擎）</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: C.dim }}>
            一个节点 = 一组条件 + 一组分支动作。条件支持 flag / 玩家行为 / 对局状态等；
            聚合器支持 all / any / atLeast(N) / atMost(N) / default。
          </p>
        </div>
        <button onClick={startNew} style={{ ...BTN(`${C.purple}18`, C.purple), border: `1px solid ${C.purple}40` }}>+ 新建节点</button>
      </div>

      {editingId !== null && draft && (
        <BranchEditor
          draft={draft} setDraft={setDraft}
          items={items} npcs={npcs}
          onSave={save} onCancel={cancelEdit}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {nodes.length === 0 && editingId === null && (
          <div style={{ textAlign: 'center', padding: 60, color: C.dim2 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🌳</div>
            <p style={{ margin: 0 }}>还没有分支节点</p>
          </div>
        )}

        {nodes.map(n => (
          <div key={n.id} style={{
            background: C.bg1, borderRadius: 12,
            border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${n.active ? C.purple : C.dim2}`,
            padding: '14px 18px', opacity: n.active ? 1 : 0.6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{n.name}</span>
              <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 10, background: n.active ? `${C.green}18` : `${C.dim2}18`, color: n.active ? C.green : C.dim, border: `1px solid ${n.active ? `${C.green}40` : C.border}` }}>
                {n.active ? '启用' : '停用'}
              </span>
              <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 10, background: `${C.accent}18`, color: C.accent, border: `1px solid ${C.accent}30` }}>
                {n.scope === 'player' ? '玩家级' : '对局级'}
              </span>
              {n.once && <span style={{ fontSize: 10, color: C.yellow }}>仅一次</span>}
              <span style={{ fontSize: 10, color: C.dim2, fontFamily: 'monospace', marginLeft: 'auto' }}>#{n.id}</span>
              <button onClick={() => startEdit(n)} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: `${C.accent}15`, color: C.accent, border: `1px solid ${C.accent}30` }}>编辑</button>
              <button onClick={() => remove(n.id)} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: `${C.red}15`, color: C.red, border: `1px solid ${C.red}30` }}>删除</button>
            </div>
            {n.description && (
              <div style={{ fontSize: 12, color: C.dim, marginTop: 6 }}>{n.description}</div>
            )}
            <div style={{ fontSize: 11, color: C.dim2, marginTop: 6 }}>
              {(n.conditions || []).length} 个条件 · {(n.branches || []).length} 个分支
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BranchEditor({ draft, setDraft, items, npcs, onSave, onCancel }) {
  function update(p) { setDraft({ ...draft, ...p }) }
  function updCond(i, p) {
    update({ conditions: (draft.conditions || []).map((c, idx) => idx === i ? { ...c, ...p } : c) })
  }
  function addCond() {
    update({ conditions: [...(draft.conditions || []), { type: 'flagEquals', key: '', value: true }] })
  }
  function delCond(i) {
    update({ conditions: (draft.conditions || []).filter((_, idx) => idx !== i) })
  }
  function updBr(i, p) {
    update({ branches: (draft.branches || []).map((b, idx) => idx === i ? { ...b, ...p } : b) })
  }
  function addBr() {
    update({ branches: [...(draft.branches || []), { when: 'all', do: {} }] })
  }
  function delBr(i) {
    update({ branches: (draft.branches || []).filter((_, idx) => idx !== i) })
  }

  return (
    <div style={{ marginBottom: 16, padding: 18, background: C.bg1, borderRadius: 12, border: `1px solid ${C.purple}40` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.purple }}>
          {draft.id ? `编辑：${draft.name}` : '新建分支节点'}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={onCancel} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'transparent', color: C.dim, border: `1px solid ${C.border}` }}>取消</button>
        <button onClick={onSave} style={{ padding: '6px 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: C.purple, color: '#fff', border: 'none', fontWeight: 700 }}>保存</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12 }}>
        <div>
          <label style={LABEL}>名称</label>
          <input style={INPUT} value={draft.name} onChange={e => update({ name: e.target.value })} />
        </div>
        <div>
          <label style={LABEL}>状态</label>
          <select style={INPUT} value={draft.active ? '1' : '0'} onChange={e => update({ active: e.target.value === '1' })}>
            <option value="1">启用</option><option value="0">停用</option>
          </select>
        </div>
        <div>
          <label style={LABEL}>触发范围</label>
          <select style={INPUT} value={draft.scope} onChange={e => update({ scope: e.target.value })}>
            <option value="room">对局级（共享）</option>
            <option value="player">玩家级（独立）</option>
          </select>
        </div>
        <div>
          <label style={LABEL}>仅触发一次</label>
          <select style={INPUT} value={draft.once ? '1' : '0'} onChange={e => update({ once: e.target.value === '1' })}>
            <option value="1">是</option><option value="0">否</option>
          </select>
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={LABEL}>描述</label>
          <input style={INPUT} value={draft.description || ''} onChange={e => update({ description: e.target.value })} placeholder="（管理员备忘，非玩家可见）" />
        </div>
      </div>

      {/* 条件 */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ ...LABEL, margin: 0 }}>条件 ({(draft.conditions || []).length})</span>
          <button onClick={addCond} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: `${C.green}18`, color: C.green, border: `1px solid ${C.green}40` }}>+ 添加条件</button>
        </div>
        {(draft.conditions || []).length === 0 ? (
          <div style={{ padding: 14, color: C.dim2, fontSize: 12, textAlign: 'center', borderRadius: 8, border: `1px dashed ${C.border}` }}>
            还没有条件
          </div>
        ) : (draft.conditions || []).map((c, i) => (
          <ConditionRow key={i} idx={i} cond={c} items={items} npcs={npcs} onChange={p => updCond(i, p)} onDelete={() => delCond(i)} />
        ))}
      </div>

      {/* 分支 */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ ...LABEL, margin: 0 }}>分支动作 ({(draft.branches || []).length})</span>
          <button onClick={addBr} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: `${C.purple}18`, color: C.purple, border: `1px solid ${C.purple}40` }}>+ 添加分支</button>
        </div>
        <div style={{ fontSize: 11, color: C.dim2, marginBottom: 8 }}>
          按顺序匹配，第一个 when 满足的分支会执行。把 default 放最后兜底。
        </div>
        {(draft.branches || []).map((b, i) => (
          <BranchRow key={i} idx={i} branch={b} onChange={p => updBr(i, p)} onDelete={() => delBr(i)} />
        ))}
      </div>
    </div>
  )
}

function ConditionRow({ idx, cond, items, npcs, onChange, onDelete }) {
  const meta = COND_TYPES.find(t => t.value === cond.type) || COND_TYPES[0]
  return (
    <div style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 6, background: C.bg2, border: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: C.dim2, fontFamily: 'monospace', width: 32 }}>#{idx + 1}</span>
        <select style={{ ...INPUT, width: 200 }} value={cond.type} onChange={e => onChange({ type: e.target.value })}>
          {COND_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>

        {meta.fields.includes('key') && (
          <input style={{ ...INPUT, flex: 1 }} value={cond.key || ''} placeholder="flag 键名" onChange={e => onChange({ key: e.target.value })} />
        )}
        {meta.fields.includes('value') && !meta.fields.includes('valueJson') && (
          <input type="number" style={{ ...INPUT, width: 100 }} value={cond.value ?? 1} onChange={e => onChange({ value: parseInt(e.target.value, 10) || 0 })} placeholder="数值" />
        )}
        {meta.fields.includes('valueJson') && (
          <input
            style={{ ...INPUT, flex: 1 }} value={cond.value !== undefined ? JSON.stringify(cond.value) : ''}
            placeholder="JSON 值"
            onChange={e => { try { onChange({ value: JSON.parse(e.target.value) }) } catch { onChange({ value: e.target.value }) } }}
          />
        )}
        {meta.fields.includes('itemName') && (
          <select style={{ ...INPUT, flex: 1 }} value={cond.itemName || ''} onChange={e => onChange({ itemName: e.target.value })}>
            <option value="">选择道具…</option>
            {items.map(it => <option key={it.id} value={it.name}>{it.name}</option>)}
          </select>
        )}
        {meta.fields.includes('npcName') && (
          <select style={{ ...INPUT, flex: 1 }} value={cond.npcName || ''} onChange={e => onChange({ npcName: e.target.value })}>
            <option value="">选择 NPC…</option>
            {npcs.map(n => <option key={n.id} value={n.name}>{n.name}</option>)}
          </select>
        )}
        {meta.fields.includes('mapId') && (
          <select style={{ ...INPUT, flex: 1 }} value={cond.mapId ?? ''} onChange={e => onChange({ mapId: Number(e.target.value) })}>
            <option value="">选择地图…</option>
            {MAP_LIST.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        {meta.fields.includes('count') && (
          <input type="number" min={1} style={{ ...INPUT, width: 80 }} value={cond.count ?? 1} onChange={e => onChange({ count: parseInt(e.target.value, 10) || 1 })} />
        )}
        {meta.fields.includes('op') && (
          <select style={{ ...INPUT, width: 80 }} value={cond.op || '>='} onChange={e => onChange({ op: e.target.value })}>
            {OP_OPTIONS.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
        )}

        <button onClick={onDelete} style={{ padding: '6px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'transparent', color: C.dim2, border: `1px solid ${C.border}` }}>🗑️</button>
      </div>
    </div>
  )
}

function BranchRow({ idx, branch, onChange, onDelete }) {
  const whenMode = branch.when === 'all' ? 'all'
                 : branch.when === 'any' ? 'any'
                 : branch.when === 'default' ? 'default'
                 : (branch.when?.atLeast !== undefined ? 'atLeast'
                 : (branch.when?.atMost !== undefined ? 'atMost'
                 : (branch.when?.exactly !== undefined ? 'exactly' : 'all')))

  function setWhen(mode, n) {
    if (mode === 'all' || mode === 'any' || mode === 'default') onChange({ when: mode })
    else onChange({ when: { [mode]: Number(n) || 0 } })
  }

  function setDoField(key, value) {
    onChange({ do: { ...(branch.do || {}), [key]: value } })
  }

  return (
    <div style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 6, background: C.bg2, border: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: C.dim2, fontFamily: 'monospace', width: 32 }}>#{idx + 1}</span>
        <span style={{ fontSize: 11, color: C.dim }}>当</span>
        <select style={{ ...INPUT, width: 130 }} value={whenMode} onChange={e => setWhen(e.target.value, branch.when?.[e.target.value])}>
          <option value="all">全部满足</option>
          <option value="any">任一满足</option>
          <option value="atLeast">至少 N 个</option>
          <option value="atMost">最多 N 个</option>
          <option value="exactly">恰好 N 个</option>
          <option value="default">兜底（最后）</option>
        </select>
        {(whenMode === 'atLeast' || whenMode === 'atMost' || whenMode === 'exactly') && (
          <input
            type="number" min={0} style={{ ...INPUT, width: 70 }}
            value={branch.when?.[whenMode] ?? 1}
            onChange={e => setWhen(whenMode, e.target.value)}
          />
        )}
        <div style={{ flex: 1 }} />
        <button onClick={onDelete} style={{ padding: '6px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'transparent', color: C.dim2, border: `1px solid ${C.border}` }}>🗑️</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={LABEL}>设置 flags（JSON）</label>
          <input
            style={INPUT}
            value={branch.do?.setFlags ? JSON.stringify(branch.do.setFlags) : ''}
            placeholder='{ "branch": "good" }'
            onChange={e => {
              try { setDoField('setFlags', JSON.parse(e.target.value || '{}')) }
              catch { /* noop, keep raw */ }
            }}
          />
        </div>
        <div>
          <label style={LABEL}>触发结局（key）</label>
          <input
            style={INPUT}
            value={branch.do?.triggerEnding || ''}
            placeholder="如 good_ending"
            onChange={e => setDoField('triggerEnding', e.target.value || null)}
          />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={LABEL}>日志说明（可选）</label>
          <input
            style={INPUT}
            value={branch.do?.log || ''}
            placeholder="该分支触发时显示给玩家的日志"
            onChange={e => setDoField('log', e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}
