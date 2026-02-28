'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../layout'
import { isAdmin } from '@/lib/auth'
import { MAP_LIST, WEATHER_OPTIONS, ITEM_KIND_META, NPC_LEVEL_META } from '@/lib/constants'

/* ─── Toast Hook ─── */
function useToast() {
  const [toasts, setToasts] = useState([])
  const show = useCallback((msg, type = 'success') => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2500)
  }, [])
  const Container = () => (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} className="toast-in" style={{
          padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 500,
          background: t.type === 'error' ? 'rgba(248,81,73,0.15)' : 'rgba(63,185,80,0.15)',
          color: t.type === 'error' ? '#f85149' : '#3fb950',
          border: `1px solid ${t.type === 'error' ? 'rgba(248,81,73,0.3)' : 'rgba(63,185,80,0.3)'}`,
        }}>{t.msg}</div>
      ))}
    </div>
  )
  return { show, Container }
}

/* ─── Modal ─── */
function Modal({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <div className="animate-in" style={{
        position: 'relative', width: 600, maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto',
        background: '#1c2129', borderRadius: 16, border: '1px solid #30363d', padding: 28,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

const INPUT = {
  width: '100%', padding: '10px 14px', borderRadius: 8,
  border: '1px solid #30363d', background: '#161b22', color: '#e6edf3',
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
}
const LABEL = { display: 'block', fontSize: 11, color: '#8b949e', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }
const BTN = (bg, color) => ({
  padding: '10px 20px', borderRadius: 8, border: 'none', background: bg,
  color, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
})

/* ═══════════════════════════════════════
   MAIN ADMIN PAGE
   ═══════════════════════════════════════ */
export default function AdminPage() {
  const { user } = useAuth()
  const { show: toast, Container: ToastContainer } = useToast()
  const [tab, setTab] = useState('items')

  useEffect(() => {
    if (!user || !isAdmin(user)) {
      // 未登录或非管理员返回首页
      router.replace('/')
    }
  }, [user])


  // Data
  const [items, setItems] = useState([])
  const [npcs, setNpcs] = useState([])
  const [maps, setMaps] = useState([])

  // Modals
  const [itemModal, setItemModal] = useState(false)
  const [npcModal, setNpcModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [editNpc, setEditNpc] = useState(null)

  // Filters
  const [itemFilter, setItemFilter] = useState('all')
  const [mapSearch, setMapSearch] = useState('')
  const [selectedMap, setSelectedMap] = useState(null)

  /* ─── Load data ─── */
  async function loadItems() {
    const { data } = await supabase.from('item_pool').select('*').order('kind')
    setItems(data || [])
  }
  async function loadNpcs() {
    const { data } = await supabase.from('npc_pool').select('*').order('level')
    setNpcs(data || [])
  }
  async function loadMaps() {
    const { data } = await supabase.from('map_config').select('*').order('map_id')
    setMaps(data || [])
  }

  useEffect(() => { loadItems(); loadNpcs(); loadMaps() }, [])

  /* ─── ITEM CRUD ─── */
  function openAddItem() {
    setEditItem({ name: '', kind: 'weapon', sub_kind: 'slashing', atk: 0, def: 0, heal: 0, effect: 0, amount: 1, maps: [], description: '' })
    setItemModal(true)
  }
  function openEditItem(item) {
    setEditItem({ ...item, maps: item.maps || [] })
    setItemModal(true)
  }
  async function saveItem() {
    if (!editItem.name) { toast('请填写道具名称', 'error'); return }
    const payload = { ...editItem }
    delete payload.created_at
    if (editItem.id) {
      const id = payload.id; delete payload.id
      await supabase.from('item_pool').update(payload).eq('id', id)
      toast('道具已更新')
    } else {
      delete payload.id
      await supabase.from('item_pool').insert(payload)
      toast('道具已添加')
    }
    setItemModal(false); setEditItem(null); loadItems()
  }
  async function deleteItem(id) {
    await supabase.from('item_pool').delete().eq('id', id)
    toast('道具已删除'); loadItems()
  }

  /* ─── NPC CRUD ─── */
  function openAddNpc() {
    setEditNpc({ name: '', hp: 50, atk: 10, def: 5, exp: 20, level: 'easy', maps: [] })
    setNpcModal(true)
  }
  function openEditNpc(npc) {
    setEditNpc({ ...npc, maps: npc.maps || [] })
    setNpcModal(true)
  }
  async function saveNpc() {
    if (!editNpc.name) { toast('请填写NPC名称', 'error'); return }
    const payload = { ...editNpc }
    delete payload.created_at
    if (editNpc.id) {
      const id = payload.id; delete payload.id
      await supabase.from('npc_pool').update(payload).eq('id', id)
      toast('NPC已更新')
    } else {
      delete payload.id
      await supabase.from('npc_pool').insert(payload)
      toast('NPC已添加')
    }
    setNpcModal(false); setEditNpc(null); loadNpcs()
  }
  async function deleteNpc(id) {
    await supabase.from('npc_pool').delete().eq('id', id)
    toast('NPC已删除'); loadNpcs()
  }

  /* ─── MAP CONFIG ─── */
  async function updateMap(mapId, updates) {
    await supabase.from('map_config').update(updates).eq('map_id', mapId)
    loadMaps()
  }

  /* ─── toggle map in array ─── */
  function toggleMap(arr, mapId) {
    return arr.includes(mapId) ? arr.filter(m => m !== mapId) : [...arr, mapId]
  }

  if (!user) return <div style={{ textAlign: 'center', padding: 60, color: '#8b949e' }}>请先登录</div>

  /* ─── filter items ─── */
  const filteredItems = items.filter(i => itemFilter === 'all' || i.kind === itemFilter)

  const tabs = [
    { key: 'items', label: '⚔️ 道具池', count: items.length },
    { key: 'npcs', label: '🤖 NPC', count: npcs.length },
    { key: 'maps', label: '🗺️ 地图', count: maps.length },
  ]

  return (
    <div className="animate-in">
      <ToastContainer />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>⚙️ 管理后台</h2>
        <nav style={{ display: 'flex', gap: 4, background: '#161b22', borderRadius: 10, padding: 4, border: '1px solid #30363d' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '8px 18px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              background: tab === t.key ? '#58a6ff' : 'transparent',
              color: tab === t.key ? '#fff' : '#8b949e',
            }}>{t.label} <span style={{ fontSize: 11, opacity: 0.7 }}>({t.count})</span></button>
          ))}
        </nav>
      </div>

      {/* ═══ TAB: 道具池 ═══ */}
      {tab === 'items' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['all', ...Object.keys(ITEM_KIND_META)].map(k => (
                <button key={k} onClick={() => setItemFilter(k)} style={{
                  padding: '6px 14px', borderRadius: 20, border: `1px solid ${itemFilter === k ? '#58a6ff' : '#30363d'}`,
                  background: itemFilter === k ? 'rgba(88,166,255,0.12)' : 'transparent',
                  color: itemFilter === k ? '#58a6ff' : '#8b949e', fontSize: 12, cursor: 'pointer',
                }}>{k === 'all' ? '全部' : ITEM_KIND_META[k].label}</button>
              ))}
            </div>
            <button onClick={openAddItem} style={BTN('#58a6ff', '#fff')}>+ 新增道具</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {filteredItems.map(item => {
              const meta = ITEM_KIND_META[item.kind] || ITEM_KIND_META.special
              return (
                <div key={item.id} style={{
                  background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: 18,
                  transition: 'border-color 0.2s',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20 }}>{meta.emoji}</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                        <span style={{ fontSize: 10, color: meta.color, background: `${meta.color}18`, padding: '1px 8px', borderRadius: 10 }}>{meta.label}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => openEditItem(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b949e', fontSize: 14 }}>✏️</button>
                      <button onClick={() => deleteItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f85149', fontSize: 14 }}>🗑️</button>
                    </div>
                  </div>
                  {item.description && <p style={{ fontSize: 11, color: '#8b949e', margin: '0 0 10px' }}>{item.description}</p>}
                  <div style={{ display: 'flex', gap: 14, fontSize: 11, marginBottom: 10 }}>
                    {item.atk > 0 && <span style={{ color: '#f85149' }}>ATK {item.atk}</span>}
                    {item.def > 0 && <span style={{ color: '#58a6ff' }}>DEF {item.def}</span>}
                    {item.heal > 0 && <span style={{ color: '#3fb950' }}>HEAL {item.heal}</span>}
                    <span style={{ color: '#8b949e' }}>×{item.amount}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(item.maps || []).slice(0, 4).map(mid => {
                      const m = MAP_LIST.find(x => x.id === mid)
                      return <span key={mid} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(88,166,255,0.1)', color: '#58a6ff' }}>{m?.name || mid}</span>
                    })}
                    {(item.maps || []).length > 4 && <span style={{ fontSize: 10, color: '#8b949e' }}>+{item.maps.length - 4}</span>}
                  </div>
                </div>
              )
            })}
          </div>
          {filteredItems.length === 0 && <div style={{ textAlign: 'center', padding: 48, color: '#8b949e' }}>暂无道具</div>}
        </div>
      )}

      {/* ═══ TAB: NPC ═══ */}
      {tab === 'npcs' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button onClick={openAddNpc} style={BTN('#58a6ff', '#fff')}>+ 新增 NPC</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {npcs.map(npc => {
              const lv = NPC_LEVEL_META[npc.level] || NPC_LEVEL_META.easy
              return (
                <div key={npc.id} style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>🤖 {npc.name}</div>
                      <span style={{ fontSize: 10, color: lv.color, background: `${lv.color}18`, padding: '1px 8px', borderRadius: 10 }}>{lv.label}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => openEditNpc(npc)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b949e', fontSize: 14 }}>✏️</button>
                      <button onClick={() => deleteNpc(npc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f85149', fontSize: 14 }}>🗑️</button>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px', fontSize: 11, marginBottom: 10 }}>
                    {[{ l: 'HP', v: npc.hp, c: '#3fb950', max: 800 }, { l: 'ATK', v: npc.atk, c: '#f85149', max: 70 },
                      { l: 'DEF', v: npc.def, c: '#58a6ff', max: 40 }, { l: 'EXP', v: npc.exp, c: '#d29922', max: 500 }].map(s => (
                      <div key={s.l}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#8b949e', marginBottom: 2 }}>
                          <span>{s.l}</span><span style={{ color: s.c, fontFamily: "'JetBrains Mono'", fontWeight: 600 }}>{s.v}</span>
                        </div>
                        <div style={{ height: 3, borderRadius: 2, background: `${s.c}20` }}>
                          <div style={{ height: '100%', borderRadius: 2, background: s.c, width: `${Math.min(100, s.v / s.max * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(npc.maps || []).map(mid => {
                      const m = MAP_LIST.find(x => x.id === mid)
                      return <span key={mid} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: `${lv.color}15`, color: lv.color }}>{m?.name || mid}</span>
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══ TAB: 地图 ═══ */}
      {tab === 'maps' && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <input style={{ ...INPUT, maxWidth: 300 }} placeholder="🔍 搜索地图..."
              value={mapSearch} onChange={e => setMapSearch(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {maps.filter(m => !mapSearch || m.name.includes(mapSearch)).map(map => {
              const itemCount = items.filter(i => (i.maps || []).includes(map.map_id)).reduce((s, i) => s + i.amount, 0)
              const npcCount = npcs.filter(n => (n.maps || []).includes(map.map_id)).length
              const w = WEATHER_OPTIONS.find(o => o.value === map.weather) || WEATHER_OPTIONS[0]
              const isOpen = selectedMap === map.map_id
              const dangerColors = ['', '#3fb950', '#3fb950', '#d29922', '#f85149', '#bc8cff']
              return (
                <div key={map.map_id} onClick={() => setSelectedMap(isOpen ? null : map.map_id)}
                  style={{
                    background: isOpen ? '#222830' : map.blocked ? 'rgba(248,81,73,0.05)' : '#1c2129',
                    borderRadius: 12, border: `1px solid ${isOpen ? '#58a6ff' : map.blocked ? '#f85149' : '#30363d'}`,
                    padding: 16, cursor: 'pointer', transition: 'all 0.2s',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: '#484f58' }}>#{map.map_id}</span>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{map.name}</span>
                    </div>
                    {map.blocked && <span style={{ fontSize: 10, color: '#f85149', background: 'rgba(248,81,73,0.12)', padding: '1px 8px', borderRadius: 10 }}>禁区</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#8b949e', marginBottom: 6 }}>
                    <span>{w.label}</span>
                    <span style={{ color: '#58a6ff' }}>道具 {itemCount}</span>
                    <span style={{ color: '#f85149' }}>NPC {npcCount}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10 }}>
                    <span style={{ color: '#8b949e' }}>危险度</span>
                    {[1,2,3,4,5].map(lv => (
                      <div key={lv} style={{ width: 14, height: 3, borderRadius: 2, background: lv <= map.danger_level ? dangerColors[map.danger_level] : 'rgba(72,79,88,0.4)' }} />
                    ))}
                  </div>

                  {isOpen && (
                    <div onClick={e => e.stopPropagation()}
                      style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #30363d' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={LABEL}>天气</label>
                          <select style={INPUT} value={map.weather}
                            onChange={e => { updateMap(map.map_id, { weather: e.target.value }); toast(`${map.name} 天气已更新`) }}>
                            {WEATHER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={LABEL}>危险等级</label>
                          <select style={INPUT} value={map.danger_level}
                            onChange={e => updateMap(map.map_id, { danger_level: Number(e.target.value) })}>
                            {[1,2,3,4,5].map(v => <option key={v} value={v}>Lv.{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={LABEL}>最大道具数</label>
                          <input type="number" style={INPUT} value={map.max_items}
                            onChange={e => updateMap(map.map_id, { max_items: Number(e.target.value) })} />
                        </div>
                        <div>
                          <label style={LABEL}>最大NPC数</label>
                          <input type="number" style={INPUT} value={map.max_npcs}
                            onChange={e => updateMap(map.map_id, { max_npcs: Number(e.target.value) })} />
                        </div>
                      </div>
                      <button style={{ ...BTN(map.blocked ? 'rgba(63,185,80,0.12)' : 'rgba(248,81,73,0.12)', map.blocked ? '#3fb950' : '#f85149'), marginTop: 10, width: '100%', justifyContent: 'center' }}
                        onClick={() => { updateMap(map.map_id, { blocked: !map.blocked }); toast(map.blocked ? '已解除禁区' : '已设为禁区') }}>
                        {map.blocked ? '✅ 解除禁区' : '⛔ 设为禁区'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══ ITEM MODAL ═══ */}
      <Modal open={itemModal} onClose={() => { setItemModal(false); setEditItem(null) }}
        title={editItem?.id ? '编辑道具' : '添加道具'}>
        {editItem && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={LABEL}>名称</label>
                <input style={INPUT} value={editItem.name} onChange={e => setEditItem({ ...editItem, name: e.target.value })} />
              </div>
              <div>
                <label style={LABEL}>类型</label>
                <select style={INPUT} value={editItem.kind} onChange={e => setEditItem({ ...editItem, kind: e.target.value })}>
                  {Object.entries(ITEM_KIND_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              {editItem.kind === 'weapon' && <div>
                <label style={LABEL}>子类</label>
                <select style={INPUT} value={editItem.sub_kind} onChange={e => setEditItem({ ...editItem, sub_kind: e.target.value })}>
                  {['slashing','striking','throwing','shooting','explosive','spirit'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>}
              <div><label style={LABEL}>ATK</label><input type="number" style={INPUT} value={editItem.atk} onChange={e => setEditItem({ ...editItem, atk: Number(e.target.value) })} /></div>
              <div><label style={LABEL}>DEF</label><input type="number" style={INPUT} value={editItem.def} onChange={e => setEditItem({ ...editItem, def: Number(e.target.value) })} /></div>
              <div><label style={LABEL}>HEAL</label><input type="number" style={INPUT} value={editItem.heal} onChange={e => setEditItem({ ...editItem, heal: Number(e.target.value) })} /></div>
              <div><label style={LABEL}>特效值</label><input type="number" style={INPUT} value={editItem.effect} onChange={e => setEditItem({ ...editItem, effect: Number(e.target.value) })} /></div>
              <div><label style={LABEL}>数量</label><input type="number" min={1} style={INPUT} value={editItem.amount} onChange={e => setEditItem({ ...editItem, amount: Math.max(1, Number(e.target.value)) })} /></div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={LABEL}>描述</label>
              <input style={INPUT} value={editItem.description} onChange={e => setEditItem({ ...editItem, description: e.target.value })} />
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={LABEL}>分配地图 (已选 {editItem.maps.length})</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 160, overflowY: 'auto', padding: '6px 0' }}>
                {MAP_LIST.map(m => (
                  <button key={m.id} onClick={() => setEditItem({ ...editItem, maps: toggleMap(editItem.maps, m.id) })}
                    style={{
                      padding: '4px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer',
                      border: `1px solid ${editItem.maps.includes(m.id) ? '#58a6ff' : '#30363d'}`,
                      background: editItem.maps.includes(m.id) ? 'rgba(88,166,255,0.12)' : 'transparent',
                      color: editItem.maps.includes(m.id) ? '#58a6ff' : '#8b949e',
                    }}>{m.name}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => { setItemModal(false); setEditItem(null) }}
                style={{ ...BTN('transparent', '#8b949e'), border: '1px solid #30363d' }}>取消</button>
              <button onClick={saveItem} style={BTN('#58a6ff', '#fff')}>
                {editItem.id ? '保存修改' : '添加道具'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══ NPC MODAL ═══ */}
      <Modal open={npcModal} onClose={() => { setNpcModal(false); setEditNpc(null) }}
        title={editNpc?.id ? '编辑 NPC' : '添加 NPC'}>
        {editNpc && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={LABEL}>名称</label><input style={INPUT} value={editNpc.name} onChange={e => setEditNpc({ ...editNpc, name: e.target.value })} /></div>
              <div><label style={LABEL}>难度</label>
                <select style={INPUT} value={editNpc.level} onChange={e => setEditNpc({ ...editNpc, level: e.target.value })}>
                  {Object.entries(NPC_LEVEL_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div><label style={LABEL}>HP</label><input type="number" style={INPUT} value={editNpc.hp} onChange={e => setEditNpc({ ...editNpc, hp: Number(e.target.value) })} /></div>
              <div><label style={LABEL}>ATK</label><input type="number" style={INPUT} value={editNpc.atk} onChange={e => setEditNpc({ ...editNpc, atk: Number(e.target.value) })} /></div>
              <div><label style={LABEL}>DEF</label><input type="number" style={INPUT} value={editNpc.def} onChange={e => setEditNpc({ ...editNpc, def: Number(e.target.value) })} /></div>
              <div><label style={LABEL}>EXP</label><input type="number" style={INPUT} value={editNpc.exp} onChange={e => setEditNpc({ ...editNpc, exp: Number(e.target.value) })} /></div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={LABEL}>分配地图 (已选 {editNpc.maps.length})</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 160, overflowY: 'auto', padding: '6px 0' }}>
                {MAP_LIST.map(m => (
                  <button key={m.id} onClick={() => setEditNpc({ ...editNpc, maps: toggleMap(editNpc.maps, m.id) })}
                    style={{
                      padding: '4px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer',
                      border: `1px solid ${editNpc.maps.includes(m.id) ? '#58a6ff' : '#30363d'}`,
                      background: editNpc.maps.includes(m.id) ? 'rgba(88,166,255,0.12)' : 'transparent',
                      color: editNpc.maps.includes(m.id) ? '#58a6ff' : '#8b949e',
                    }}>{m.name}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => { setNpcModal(false); setEditNpc(null) }}
                style={{ ...BTN('transparent', '#8b949e'), border: '1px solid #30363d' }}>取消</button>
              <button onClick={saveNpc} style={BTN('#58a6ff', '#fff')}>
                {editNpc.id ? '保存修改' : '添加 NPC'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
