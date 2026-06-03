'use client'

import { useCallback, useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { postGameApi, getGameApi } from '@/lib/gameApi'
import { BTN, INPUT, LABEL, Spinner, MAP_LIST, C } from '../_shared/ui'

const TRIGGER_TYPES = [
  { value: 'on_search',    label: '玩家搜索时',     fields: ['mapId'] },
  { value: 'on_enter_map', label: '玩家进入地图时', fields: ['mapId'] },
  { value: 'on_kill_npc',  label: '玩家击杀实体时', fields: ['npcName'] },
  { value: 'on_pickup',    label: '玩家获得道具时', fields: ['itemName'] },
]

const EFFECT_TYPES = [
  { value: 'log_only',       label: '仅添加日志',  fields: ['text'] },
  { value: 'give_item',      label: '给玩家道具',  fields: ['itemName', 'count'] },
  { value: 'take_item',      label: '扣除玩家道具', fields: ['itemName', 'count'] },
  { value: 'damage',         label: '扣血',         fields: ['amount'] },
  { value: 'heal',           label: '回血',         fields: ['amount'] },
  { value: 'spawn_npc',      label: '触发实体战斗', fields: ['npc'] },
  { value: 'set_flag',       label: '设置 flag',    fields: ['key', 'valueJson'] },
  { value: 'inc_flag',       label: 'flag 累加',    fields: ['key', 'value'] },
]

export default function EventsTab({ toast }) {
  const [events, setEvents] = useState([])
  const [items, setItems]   = useState([])
  const [npcs, setNpcs]     = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [evRes, { data: its }, { data: ns }] = await Promise.all([
        getGameApi('/api/events'),
        supabase.from('item_pool').select('id,name,kind').order('name'),
        supabase.from('npc_pool').select('id,name,level').order('name'),
      ])
      setEvents(evRes?.events || [])
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
      name: '新事件', description: '', active: true,
      trigger: { type: 'on_search' },
      effects: [],
      weight: 1, once: false, cooldown: 0,
    })
  }
  function startEdit(ev) {
    setEditingId(ev.id)
    setDraft({ ...ev })
  }
  function cancelEdit() {
    setEditingId(null); setDraft(null)
  }

  async function save() {
    if (!draft) return
    try {
      const payload = { ...draft }
      if (editingId === 'new') {
        await postGameApi('/api/events', { action: 'create', ...payload })
        toast('已创建事件')
      } else {
        await postGameApi('/api/events', { action: 'update', id: editingId, ...payload })
        toast('已保存')
      }
      cancelEdit()
      reload()
    } catch (err) {
      toast(err.message || '保存失败', 'error')
    }
  }

  async function remove(id) {
    if (!confirm('确认删除该事件？')) return
    try {
      await postGameApi('/api/events', { action: 'delete', id })
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
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>🎲 事件库</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: C.dim }}>
            事件由触发器（搜索/移动/击杀/拾取）激活，应用一系列效果（给物品/扣血/触发战斗/设置 flag）。
          </p>
        </div>
        <button onClick={startNew} style={{ ...BTN(`${C.green}18`, C.green), border: `1px solid ${C.green}40` }}>+ 新建事件</button>
      </div>

      {editingId !== null && draft && (
        <EventEditor
          draft={draft} setDraft={setDraft}
          items={items} npcs={npcs}
          onSave={save} onCancel={cancelEdit}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {events.length === 0 && editingId === null && (
          <div style={{ textAlign: 'center', padding: 60, color: C.dim2 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
            <p style={{ margin: 0 }}>还没有事件</p>
          </div>
        )}

        {events.map(ev => (
          <div key={ev.id} style={{
            background: C.bg1, borderRadius: 12,
            border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${ev.active ? C.accent : C.dim2}`,
            padding: '14px 18px', opacity: ev.active ? 1 : 0.6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{ev.name}</span>
              <span style={{
                fontSize: 10, padding: '1px 8px', borderRadius: 10,
                background: ev.active ? `${C.green}18` : `${C.dim2}18`,
                color: ev.active ? C.green : C.dim,
                border: `1px solid ${ev.active ? `${C.green}40` : C.border}`,
              }}>{ev.active ? '启用' : '禁用'}</span>
              <span style={{ fontSize: 10, color: C.dim, fontFamily: 'monospace' }}>
                {(TRIGGER_TYPES.find(t => t.value === ev.trigger?.type)?.label) || ev.trigger?.type}
              </span>
              {ev.once && <span style={{ fontSize: 10, color: C.yellow }}>仅一次</span>}
              {ev.cooldown > 0 && <span style={{ fontSize: 10, color: C.dim }}>冷却 {ev.cooldown}</span>}
              <span style={{ fontSize: 10, color: C.dim2, fontFamily: 'monospace', marginLeft: 'auto' }}>
                #{ev.id} · weight {ev.weight}
              </span>
              <button onClick={() => startEdit(ev)} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: `${C.accent}15`, color: C.accent, border: `1px solid ${C.accent}30` }}>编辑</button>
              <button onClick={() => remove(ev.id)} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: `${C.red}15`, color: C.red, border: `1px solid ${C.red}30` }}>删除</button>
            </div>
            {ev.description && (
              <div style={{ fontSize: 12, color: C.dim, marginBottom: 6 }}>{ev.description}</div>
            )}
            <div style={{ fontSize: 11, color: C.dim2 }}>
              效果 {(ev.effects || []).length} 条
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EventEditor({ draft, setDraft, items, npcs, onSave, onCancel }) {
  function update(patch) { setDraft({ ...draft, ...patch }) }
  function setTrigger(patch) { update({ trigger: { ...draft.trigger, ...patch } }) }
  function addEffect() {
    update({ effects: [...(draft.effects || []), { type: 'log_only', text: '' }] })
  }
  function updateEffect(i, patch) {
    update({ effects: (draft.effects || []).map((e, idx) => idx === i ? { ...e, ...patch } : e) })
  }
  function removeEffect(i) {
    update({ effects: (draft.effects || []).filter((_, idx) => idx !== i) })
  }
  function moveEffect(i, dir) {
    const list = [...(draft.effects || [])]
    const j = i + dir
    if (j < 0 || j >= list.length) return
    const tmp = list[i]; list[i] = list[j]; list[j] = tmp
    update({ effects: list })
  }

  const trigMeta = TRIGGER_TYPES.find(t => t.value === draft.trigger?.type) || TRIGGER_TYPES[0]

  return (
    <div style={{
      marginBottom: 16, padding: 18,
      background: C.bg1, borderRadius: 12,
      border: `1px solid ${C.accent}40`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.accent }}>
          {draft.id ? `编辑：${draft.name}` : '新建事件'}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={onCancel} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'transparent', color: C.dim, border: `1px solid ${C.border}` }}>取消</button>
        <button onClick={onSave} style={{ padding: '6px 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: C.accent, color: '#fff', border: 'none', fontWeight: 700 }}>保存</button>
      </div>

      {/* 基本信息 */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
        <div>
          <label style={LABEL}>名称</label>
          <input style={INPUT} value={draft.name} onChange={e => update({ name: e.target.value })} />
        </div>
        <div>
          <label style={LABEL}>权重</label>
          <input type="number" step="0.1" min={0} style={INPUT} value={draft.weight} onChange={e => update({ weight: parseFloat(e.target.value) || 1 })} />
        </div>
        <div>
          <label style={LABEL}>状态</label>
          <select style={INPUT} value={draft.active ? '1' : '0'} onChange={e => update({ active: e.target.value === '1' })}>
            <option value="1">启用</option><option value="0">禁用</option>
          </select>
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={LABEL}>描述（玩家会看到）</label>
          <input style={INPUT} value={draft.description || ''} onChange={e => update({ description: e.target.value })} placeholder="（可选）显示给玩家的事件文案" />
        </div>
        <div>
          <label style={LABEL}>仅触发一次</label>
          <select style={INPUT} value={draft.once ? '1' : '0'} onChange={e => update({ once: e.target.value === '1' })}>
            <option value="0">否</option><option value="1">是</option>
          </select>
        </div>
        <div>
          <label style={LABEL}>冷却（回合）</label>
          <input type="number" min={0} style={INPUT} value={draft.cooldown || 0} onChange={e => update({ cooldown: parseInt(e.target.value, 10) || 0 })} />
        </div>
      </div>

      {/* 触发器 */}
      <div style={{ marginTop: 16 }}>
        <label style={LABEL}>触发器</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            style={{ ...INPUT, width: 200 }}
            value={draft.trigger?.type || 'on_search'}
            onChange={e => setTrigger({ type: e.target.value })}
          >
            {TRIGGER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          {trigMeta.fields.includes('mapId') && (
            <select
              style={{ ...INPUT, flex: 1 }}
              value={draft.trigger?.mapId ?? ''}
              onChange={e => setTrigger({ mapId: e.target.value === '' ? null : Number(e.target.value) })}
            >
              <option value="">（任意地图）</option>
              {MAP_LIST.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
          {trigMeta.fields.includes('npcName') && (
            <select
              style={{ ...INPUT, flex: 1 }}
              value={draft.trigger?.npcName || ''}
              onChange={e => setTrigger({ npcName: e.target.value })}
            >
              <option value="">（任意实体）</option>
              {npcs.map(n => <option key={n.id} value={n.name}>{n.name}</option>)}
            </select>
          )}
          {trigMeta.fields.includes('itemName') && (
            <select
              style={{ ...INPUT, flex: 1 }}
              value={draft.trigger?.itemName || ''}
              onChange={e => setTrigger({ itemName: e.target.value })}
            >
              <option value="">（任意道具）</option>
              {items.map(it => <option key={it.id} value={it.name}>{it.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* 效果 */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ ...LABEL, margin: 0 }}>效果序列 ({(draft.effects || []).length})</span>
          <button onClick={addEffect} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: `${C.green}18`, color: C.green, border: `1px solid ${C.green}40` }}>+ 添加效果</button>
        </div>
        {(draft.effects || []).length === 0 ? (
          <div style={{ padding: 14, color: C.dim2, fontSize: 12, textAlign: 'center', borderRadius: 8, border: `1px dashed ${C.border}` }}>
            还没有效果
          </div>
        ) : (draft.effects || []).map((eff, i) => (
          <EffectRow
            key={i} idx={i}
            effect={eff}
            items={items}
            onChange={p => updateEffect(i, p)}
            onDelete={() => removeEffect(i)}
            onMoveUp={() => moveEffect(i, -1)}
            onMoveDown={() => moveEffect(i, +1)}
          />
        ))}
      </div>
    </div>
  )
}

function EffectRow({ idx, effect, items, onChange, onDelete, onMoveUp, onMoveDown }) {
  const meta = EFFECT_TYPES.find(t => t.value === effect.type) || EFFECT_TYPES[0]

  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8, marginBottom: 8,
      background: C.bg2, border: `1px solid ${C.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: C.dim2, fontFamily: 'monospace' }}>#{idx + 1}</span>
        <select
          style={{ ...INPUT, width: 200 }}
          value={effect.type}
          onChange={e => onChange({ type: e.target.value })}
        >
          {EFFECT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button onClick={onMoveUp}   style={btnIcon}>▲</button>
        <button onClick={onMoveDown} style={btnIcon}>▼</button>
        <button onClick={onDelete}   style={{ ...btnIcon, color: C.red }}>🗑️</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {meta.fields.includes('text') && (
          <div style={{ gridColumn: '1/-1' }}>
            <label style={LABEL}>日志文本</label>
            <input style={INPUT} value={effect.text || ''} onChange={e => onChange({ text: e.target.value })} placeholder="将作为日志显示给玩家" />
          </div>
        )}
        {meta.fields.includes('itemName') && (
          <div>
            <label style={LABEL}>道具</label>
            <select style={INPUT} value={effect.itemName || ''} onChange={e => onChange({ itemName: e.target.value })}>
              <option value="">选择…</option>
              {items.map(it => <option key={it.id} value={it.name}>{it.name}</option>)}
            </select>
          </div>
        )}
        {meta.fields.includes('count') && (
          <div>
            <label style={LABEL}>数量</label>
            <input type="number" min={1} style={INPUT} value={effect.count || 1} onChange={e => onChange({ count: parseInt(e.target.value, 10) || 1 })} />
          </div>
        )}
        {meta.fields.includes('amount') && (
          <div>
            <label style={LABEL}>数值</label>
            <input type="number" min={1} style={INPUT} value={effect.amount || 1} onChange={e => onChange({ amount: parseInt(e.target.value, 10) || 1 })} />
          </div>
        )}
        {meta.fields.includes('npc') && (
          <div style={{ gridColumn: '1/-1' }}>
            <label style={LABEL}>实体（即兴生成）</label>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 6 }}>
              <input style={INPUT} value={effect.npc?.name || ''} onChange={e => onChange({ npc: { ...(effect.npc || {}), name: e.target.value } })} placeholder="名称" />
              <input type="number" style={INPUT} value={effect.npc?.hp  || ''} onChange={e => onChange({ npc: { ...(effect.npc || {}), hp:  parseInt(e.target.value, 10) || 0 } })} placeholder="HP" />
              <input type="number" style={INPUT} value={effect.npc?.atk || ''} onChange={e => onChange({ npc: { ...(effect.npc || {}), atk: parseInt(e.target.value, 10) || 0 } })} placeholder="ATK" />
              <input type="number" style={INPUT} value={effect.npc?.def || ''} onChange={e => onChange({ npc: { ...(effect.npc || {}), def: parseInt(e.target.value, 10) || 0 } })} placeholder="DEF" />
              <select style={INPUT} value={effect.npc?.level || 'easy'} onChange={e => onChange({ npc: { ...(effect.npc || {}), level: e.target.value } })}>
                <option value="easy">普通</option>
                <option value="medium">中等</option>
                <option value="hard">困难</option>
                <option value="boss">BOSS</option>
              </select>
            </div>
          </div>
        )}
        {meta.fields.includes('key') && (
          <div>
            <label style={LABEL}>flag 键名</label>
            <input style={INPUT} value={effect.key || ''} onChange={e => onChange({ key: e.target.value })} placeholder="如 quest_started" />
          </div>
        )}
        {meta.fields.includes('valueJson') && (
          <div>
            <label style={LABEL}>值 (JSON)</label>
            <input
              style={INPUT}
              value={effect.value !== undefined ? JSON.stringify(effect.value) : ''}
              onChange={e => {
                try { onChange({ value: JSON.parse(e.target.value) }) }
                catch { onChange({ value: e.target.value }) }
              }}
              placeholder="如 true / 5 / &quot;done&quot;"
            />
          </div>
        )}
        {meta.fields.includes('value') && !meta.fields.includes('valueJson') && (
          <div>
            <label style={LABEL}>累加值</label>
            <input type="number" style={INPUT} value={effect.value || 1} onChange={e => onChange({ value: parseInt(e.target.value, 10) || 1 })} />
          </div>
        )}
      </div>
    </div>
  )
}

const btnIcon = {
  padding: '6px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
  background: 'transparent', color: '#8b949e', border: '1px solid #30363d',
}
