'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { BTN, INPUT, LABEL, Modal, NPC_LEVEL_META, MAP_LIST } from '../_shared/ui'

const EMPTY_NPC = { name: '', hp: 50, atk: 10, def: 5, exp: 20, level: 'easy', maps: [], drop_items: [] }

export default function NpcsTab({ npcs, onRefresh, toast }) {
  const [filter,  setFilter]  = useState('all')
  const [search,  setSearch]  = useState('')
  const [modal,   setModal]   = useState(false)
  const [editNpc, setEditNpc] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  const filtered = npcs.filter(n =>
    (filter === 'all' || n.level === filter) &&
    (!search || n.name.includes(search))
  )

  function openAdd()  { setEditNpc({ ...EMPTY_NPC }); setModal(true) }
  function openEdit(n){ setEditNpc({ ...n, maps: n.maps || [], drop_items: n.drop_items || [] }); setModal(true) }

  async function save() {
    if (!editNpc.name.trim()) { toast('请填写NPC名称', 'error'); return }
    const payload = { ...editNpc }; delete payload.created_at
    if (editNpc.id) {
      const id = payload.id; delete payload.id
      const { error } = await supabase.from('npc_pool').update(payload).eq('id', id)
      if (error) { toast('更新失败', 'error'); return }
      toast('NPC已更新')
    } else {
      delete payload.id
      const { error } = await supabase.from('npc_pool').insert(payload)
      if (error) { toast('添加失败', 'error'); return }
      toast('NPC已添加')
    }
    setModal(false); setEditNpc(null); onRefresh('npcs')
  }

  async function del(id) {
    const { error } = await supabase.from('npc_pool').delete().eq('id', id)
    if (error) { toast('删除失败', 'error'); return }
    toast('NPC已删除'); setConfirmDel(null); onRefresh('npcs')
  }

  function toggleMap(arr, id) { return arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id] }

  return (
    <div>
      {/* 工具栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input style={{ ...INPUT, width: 190 }} placeholder="🔍 搜索NPC..." value={search} onChange={e => setSearch(e.target.value)} />
          <div style={{ display: 'flex', gap: 4 }}>
            {['all', ...Object.keys(NPC_LEVEL_META)].map(k => (
              <button key={k} onClick={() => setFilter(k)} style={{
                padding: '6px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                border: `1px solid ${filter === k ? '#58a6ff' : '#30363d'}`,
                background: filter === k ? 'rgba(88,166,255,0.12)' : 'transparent',
                color: filter === k ? '#58a6ff' : '#8b949e',
              }}>{k === 'all' ? '全部' : NPC_LEVEL_META[k].label}</button>
            ))}
          </div>
        </div>
        <button onClick={openAdd} style={BTN('#58a6ff', '#fff')}>+ 新增 NPC</button>
      </div>

      {/* 列表 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {filtered.map(npc => {
          const lv = NPC_LEVEL_META[npc.level] || NPC_LEVEL_META.easy
          const isConf = confirmDel === npc.id
          return (
            <div key={npc.id} style={{ background: '#1c2129', borderRadius: 12, padding: 18, border: `1px solid ${isConf ? '#f85149' : '#30363d'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                    🤖 {npc.name}
                    <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 7px', borderRadius: 8, background: `${lv.color}15`, color: lv.color, border: `1px solid ${lv.color}30` }}>{lv.label}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#8b949e' }}>
                    <span style={{ color: '#3fb950' }}>HP {npc.hp}</span>
                    <span style={{ color: '#f85149' }}>ATK {npc.atk}</span>
                    <span style={{ color: '#58a6ff' }}>DEF {npc.def}</span>
                    <span style={{ color: '#d29922' }}>EXP {npc.exp}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => openEdit(npc)} style={BTN('transparent', '#58a6ff', { padding: '4px 10px', border: '1px solid rgba(88,166,255,0.3)' })}>编辑</button>
                  {isConf
                    ? <><button onClick={() => del(npc.id)} style={BTN('rgba(248,81,73,0.15)', '#f85149', { padding: '4px 10px', border: '1px solid rgba(248,81,73,0.3)' })}>确认</button>
                       <button onClick={() => setConfirmDel(null)} style={BTN('transparent', '#8b949e', { padding: '4px 10px', border: '1px solid #30363d' })}>取消</button></>
                    : <button onClick={() => setConfirmDel(npc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#484f58', fontSize: 15 }}>🗑️</button>}
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(npc.maps || []).slice(0, 4).map(mid => {
                  const m = MAP_LIST.find(x => x.id === mid)
                  return <span key={mid} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(88,166,255,0.1)', color: '#58a6ff' }}>{m?.name || mid}</span>
                })}
                {(npc.maps || []).length > 4 && <span style={{ fontSize: 10, color: '#8b949e' }}>+{npc.maps.length - 4}</span>}
                {(npc.maps || []).length === 0 && <span style={{ fontSize: 10, color: '#484f58' }}>未分配地图</span>}
              </div>
            </div>
          )
        })}
      </div>
      {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 56, color: '#8b949e' }}>{search ? `未找到"${search}"` : '暂无NPC'}</div>}

      {/* Modal */}
      <Modal open={modal} onClose={() => { setModal(false); setEditNpc(null) }}
        title={editNpc?.id ? `编辑NPC：${editNpc?.name}` : '添加 NPC'}>
        {editNpc && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={LABEL}>名称</label><input style={INPUT} value={editNpc.name} onChange={e => setEditNpc({ ...editNpc, name: e.target.value })} /></div>
              <div>
                <label style={LABEL}>难度</label>
                <select style={INPUT} value={editNpc.level} onChange={e => setEditNpc({ ...editNpc, level: e.target.value })}>
                  {Object.entries(NPC_LEVEL_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div><label style={LABEL}>HP 生命值</label><input type="number" style={INPUT} value={editNpc.hp} onChange={e => setEditNpc({ ...editNpc, hp: Number(e.target.value) })} /></div>
              <div><label style={LABEL}>ATK 攻击</label><input type="number" style={INPUT} value={editNpc.atk} onChange={e => setEditNpc({ ...editNpc, atk: Number(e.target.value) })} /></div>
              <div><label style={LABEL}>DEF 防御</label><input type="number" style={INPUT} value={editNpc.def} onChange={e => setEditNpc({ ...editNpc, def: Number(e.target.value) })} /></div>
              <div><label style={LABEL}>EXP 经验</label><input type="number" style={INPUT} value={editNpc.exp} onChange={e => setEditNpc({ ...editNpc, exp: Number(e.target.value) })} /></div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={LABEL}>掉落道具（逗号分隔）</label>
                <input style={INPUT} value={(editNpc.drop_items || []).join(', ')} onChange={e => setEditNpc({ ...editNpc, drop_items: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="例：铁矿, 皮革" />
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ ...LABEL, margin: 0 }}>分配地图 ({editNpc.maps.length} 已选)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditNpc({ ...editNpc, maps: MAP_LIST.map(m => m.id) })} style={{ background: 'none', border: 'none', color: '#58a6ff', fontSize: 12, cursor: 'pointer' }}>全选</button>
                  <button onClick={() => setEditNpc({ ...editNpc, maps: [] })} style={{ background: 'none', border: 'none', color: '#8b949e', fontSize: 12, cursor: 'pointer' }}>清空</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 150, overflowY: 'auto' }}>
                {MAP_LIST.map(m => (
                  <button key={m.id} onClick={() => setEditNpc({ ...editNpc, maps: toggleMap(editNpc.maps, m.id) })}
                    style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer',
                      border: `1px solid ${editNpc.maps.includes(m.id) ? '#58a6ff' : '#30363d'}`,
                      background: editNpc.maps.includes(m.id) ? 'rgba(88,166,255,0.12)' : 'transparent',
                      color: editNpc.maps.includes(m.id) ? '#58a6ff' : '#8b949e' }}>{m.name}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button onClick={() => { setModal(false); setEditNpc(null) }} style={{ ...BTN('transparent', '#8b949e'), border: '1px solid #30363d' }}>取消</button>
              <button onClick={save} style={BTN('#58a6ff', '#fff')}>{editNpc.id ? '保存修改' : '添加 NPC'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
