'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { BTN, INPUT, LABEL, Modal, ITEM_KIND_META, MAP_LIST } from '../_shared/ui'

const ITEM_SUB_KINDS = {
  weapon:     ['slashing', 'piercing', 'blunt', 'ranged', 'magic'],
  armor:      ['light', 'medium', 'heavy'],
  consumable: ['heal', 'buff', 'damage', 'utility'],
  material:   ['ore', 'plant', 'drop', 'misc'],
  special:    ['key', 'quest', 'misc'],
}

const EMPTY_ITEM = {
  name: '', kind: 'weapon', sub_kind: 'slashing', atk: 0, def: 0, heal: 0, effect: 0,
  amount: 1, maps: [], description: '', on_use_buff_ids: [],
  heal_formula: '', atk_formula: '', def_formula: '',
}

export default function ItemsTab({ items, buffPool, onRefresh, toast }) {
  const [filter, setFilter]   = useState('all')
  const [search, setSearch]   = useState('')
  const [modal,  setModal]    = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  const filtered = items.filter(i =>
    (filter === 'all' || i.kind === filter) &&
    (!search || i.name.includes(search) || (i.description || '').includes(search))
  )

  function openAdd() {
    setEditItem({ ...EMPTY_ITEM })
    setModal(true)
  }
  function openEdit(item) {
    setEditItem({ ...item, maps: item.maps || [], on_use_buff_ids: item.on_use_buff_ids || [],
      heal_formula: item.heal_formula || '', atk_formula: item.atk_formula || '', def_formula: item.def_formula || '' })
    setModal(true)
  }
  async function save() {
    if (!editItem.name.trim()) { toast('请填写道具名称', 'error'); return }
    const payload = { ...editItem }; delete payload.created_at
    if (editItem.id) {
      const id = payload.id; delete payload.id
      const { error } = await supabase.from('item_pool').update(payload).eq('id', id)
      if (error) { toast('更新失败', 'error'); return }
      toast('道具已更新')
    } else {
      delete payload.id
      const { error } = await supabase.from('item_pool').insert(payload)
      if (error) { toast('添加失败', 'error'); return }
      toast('道具已添加')
    }
    setModal(false); setEditItem(null); onRefresh('items')
  }
  async function del(id) {
    const { error } = await supabase.from('item_pool').delete().eq('id', id)
    if (error) { toast('删除失败', 'error'); return }
    toast('道具已删除'); setConfirmDel(null); onRefresh('items')
  }
  function toggleMap(arr, id)  { return arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id] }
  function toggleBuff(arr, id) { return arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id] }

  return (
    <div>
      {/* 工具栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input style={{ ...INPUT, width: 190 }} placeholder="🔍 搜索道具..." value={search} onChange={e => setSearch(e.target.value)} />
          <div style={{ display: 'flex', gap: 4 }}>
            {['all', ...Object.keys(ITEM_KIND_META)].map(k => (
              <button key={k} onClick={() => setFilter(k)} style={{
                padding: '6px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                border: `1px solid ${filter === k ? '#58a6ff' : '#30363d'}`,
                background: filter === k ? 'rgba(88,166,255,0.12)' : 'transparent',
                color: filter === k ? '#58a6ff' : '#8b949e',
              }}>{k === 'all' ? '全部' : ITEM_KIND_META[k].label}</button>
            ))}
          </div>
        </div>
        <button onClick={openAdd} style={BTN('#58a6ff', '#fff')}>+ 新增道具</button>
      </div>

      {/* 列表 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {filtered.map(item => {
          const meta = ITEM_KIND_META[item.kind] || ITEM_KIND_META.special
          const isConf = confirmDel === item.id
          return (
            <div key={item.id} style={{ background: '#1c2129', borderRadius: 12, padding: 16, border: `1px solid ${isConf ? '#f85149' : '#30363d'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>
                    {meta.icon} {item.name}
                    <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 7px', borderRadius: 8, background: `${meta.color}15`, color: meta.color, border: `1px solid ${meta.color}30` }}>{meta.label}</span>
                  </div>
                  {item.description && <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 4 }}>{item.description}</div>}
                  <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#8b949e' }}>
                    {item.atk > 0 && <span style={{ color: '#f85149' }}>ATK +{item.atk}</span>}
                    {item.def > 0 && <span style={{ color: '#58a6ff' }}>DEF +{item.def}</span>}
                    {item.heal > 0 && <span style={{ color: '#3fb950' }}>HEAL +{item.heal}</span>}
                    <span>权重 {item.amount}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => openEdit(item)} style={BTN('transparent', '#58a6ff', { padding: '4px 10px', border: '1px solid rgba(88,166,255,0.3)' })}>编辑</button>
                  {isConf
                    ? <><button onClick={() => del(item.id)} style={BTN('rgba(248,81,73,0.15)', '#f85149', { padding: '4px 10px', border: '1px solid rgba(248,81,73,0.3)' })}>确认</button>
                       <button onClick={() => setConfirmDel(null)} style={BTN('transparent', '#8b949e', { padding: '4px 10px', border: '1px solid #30363d' })}>取消</button></>
                    : <button onClick={() => setConfirmDel(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#484f58', fontSize: 15 }}>🗑️</button>}
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                {(item.maps || []).slice(0, 5).map(mid => {
                  const m = MAP_LIST.find(x => x.id === mid)
                  return <span key={mid} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(88,166,255,0.1)', color: '#58a6ff' }}>{m?.name || mid}</span>
                })}
                {(item.maps || []).length > 5 && <span style={{ fontSize: 10, color: '#8b949e' }}>+{item.maps.length - 5}</span>}
                {(item.maps || []).length === 0 && <span style={{ fontSize: 10, color: '#484f58' }}>未分配地图</span>}
              </div>
            </div>
          )
        })}
      </div>
      {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 56, color: '#8b949e' }}>{search ? `未找到"${search}"` : '暂无道具'}</div>}

      {/* Modal */}
      <Modal open={modal} onClose={() => { setModal(false); setEditItem(null) }}
        title={editItem?.id ? `编辑道具：${editItem?.name}` : '添加道具'}>
        {editItem && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: editItem.kind === 'weapon' ? '1/-1' : undefined }}>
                <label style={LABEL}>名称</label>
                <input style={INPUT} value={editItem.name} onChange={e => setEditItem({ ...editItem, name: e.target.value })} />
              </div>
              <div>
                <label style={LABEL}>类型</label>
                <select style={INPUT} value={editItem.kind} onChange={e => setEditItem({ ...editItem, kind: e.target.value, sub_kind: ITEM_SUB_KINDS[e.target.value]?.[0] || '' })}>
                  {Object.entries(ITEM_KIND_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label style={LABEL}>子类型</label>
                <select style={INPUT} value={editItem.sub_kind || ''} onChange={e => setEditItem({ ...editItem, sub_kind: e.target.value })}>
                  {(ITEM_SUB_KINDS[editItem.kind] || []).map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div><label style={LABEL}>ATK</label><input type="number" style={INPUT} value={editItem.atk} onChange={e => setEditItem({ ...editItem, atk: Number(e.target.value) })} /></div>
              <div><label style={LABEL}>DEF</label><input type="number" style={INPUT} value={editItem.def} onChange={e => setEditItem({ ...editItem, def: Number(e.target.value) })} /></div>
              <div><label style={LABEL}>HEAL</label><input type="number" style={INPUT} value={editItem.heal} onChange={e => setEditItem({ ...editItem, heal: Number(e.target.value) })} /></div>
              <div><label style={LABEL}>出现权重</label><input type="number" style={INPUT} value={editItem.amount} onChange={e => setEditItem({ ...editItem, amount: Number(e.target.value) })} /></div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={LABEL}>描述</label>
                <input style={INPUT} value={editItem.description || ''} onChange={e => setEditItem({ ...editItem, description: e.target.value })} />
              </div>
            </div>

            {/* Buff 绑定 */}
            {buffPool.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <label style={LABEL}>使用时触发 Buff</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {buffPool.map(b => {
                    const selected = (editItem.on_use_buff_ids || []).includes(b.id)
                    return (
                      <button key={b.id} onClick={() => setEditItem({ ...editItem, on_use_buff_ids: toggleBuff(editItem.on_use_buff_ids || [], b.id) })}
                        style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, cursor: 'pointer',
                          border: `1px solid ${selected ? (b.is_debuff ? '#f85149' : '#3fb950') : '#30363d'}`,
                          background: selected ? (b.is_debuff ? 'rgba(248,81,73,0.12)' : 'rgba(63,185,80,0.12)') : 'transparent',
                          color: selected ? (b.is_debuff ? '#f85149' : '#3fb950') : '#8b949e' }}>
                        {b.icon} {b.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 地图分配 */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ ...LABEL, margin: 0 }}>分配地图 <span style={{ color: '#58a6ff', fontStyle: 'normal', textTransform: 'none', letterSpacing: 0 }}>({editItem.maps.length} 已选)</span></label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditItem({ ...editItem, maps: MAP_LIST.map(m => m.id) })} style={{ background: 'none', border: 'none', color: '#58a6ff', fontSize: 12, cursor: 'pointer' }}>全选</button>
                  <button onClick={() => setEditItem({ ...editItem, maps: [] })} style={{ background: 'none', border: 'none', color: '#8b949e', fontSize: 12, cursor: 'pointer' }}>清空</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 150, overflowY: 'auto' }}>
                {MAP_LIST.map(m => (
                  <button key={m.id} onClick={() => setEditItem({ ...editItem, maps: toggleMap(editItem.maps, m.id) })}
                    style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer',
                      border: `1px solid ${editItem.maps.includes(m.id) ? '#58a6ff' : '#30363d'}`,
                      background: editItem.maps.includes(m.id) ? 'rgba(88,166,255,0.12)' : 'transparent',
                      color: editItem.maps.includes(m.id) ? '#58a6ff' : '#8b949e' }}>{m.name}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button onClick={() => { setModal(false); setEditItem(null) }} style={{ ...BTN('transparent', '#8b949e'), border: '1px solid #30363d' }}>取消</button>
              <button onClick={save} style={BTN('#58a6ff', '#fff')}>{editItem.id ? '保存修改' : '添加道具'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
