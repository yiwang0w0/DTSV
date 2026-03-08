'use client'
import { useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { BTN, INPUT, LABEL, WEATHER_OPTIONS, GAME_TYPES, ITEM_KIND_META, Drawer } from '../_shared/ui'

export default function MapsTab({ maps, setMaps, items = [], onRefreshItems, toast }) {
  const [search, setSearch]         = useState('')
  const [selectedMap, setSelectedMap] = useState(null)
  const [itemDrawer, setItemDrawer]   = useState(false)
  const [itemSearch, setItemSearch]   = useState('')
  const [kindFilter, setKindFilter]   = useState('all')
  const [savingItems, setSavingItems] = useState(new Set()) // item ids currently saving

  const mapTimers    = useRef({})
  const weightTimers = useRef({})

  const filtered = maps.filter(m => !search || (m.name || '').includes(search))
  const sel = selectedMap ? maps.find(m => m.map_id === selectedMap) : null

  // items split by in/out of current map
  const mapItems    = sel ? items.filter(i => (i.maps || []).includes(sel.map_id)) : []
  const mapItemSet  = new Set(mapItems.map(i => i.id))

  // drawer filtered items: in-pool first, then not-in-pool
  const drawerFiltered = items.filter(i =>
    (kindFilter === 'all' || i.kind === kindFilter) &&
    (!itemSearch || i.name.includes(itemSearch) || (i.description || '').includes(itemSearch))
  )
  const drawerSorted = [
    ...drawerFiltered.filter(i => mapItemSet.has(i.id)),
    ...drawerFiltered.filter(i => !mapItemSet.has(i.id)),
  ]

  function update(mapId, updates) {
    setMaps(prev => prev.map(m => m.map_id === mapId ? { ...m, ...updates } : m))
    clearTimeout(mapTimers.current[mapId])
    mapTimers.current[mapId] = setTimeout(() => {
      supabase.from('map_config').update(updates).eq('map_id', mapId)
    }, 600)
  }

  function updateNow(mapId, updates, msg) {
    setMaps(prev => prev.map(m => m.map_id === mapId ? { ...m, ...updates } : m))
    supabase.from('map_config').update(updates).eq('map_id', mapId)
    if (msg) toast(msg)
  }

  async function toggleItem(item, currentlyInMap) {
    setSavingItems(prev => new Set(prev).add(item.id))
    const newMaps = currentlyInMap
      ? (item.maps || []).filter(mid => mid !== sel.map_id)
      : [...(item.maps || []), sel.map_id]
    const { error } = await supabase.from('item_pool').update({ maps: newMaps }).eq('id', item.id)
    setSavingItems(prev => { const s = new Set(prev); s.delete(item.id); return s })
    if (error) { toast('操作失败', 'error'); return }
    onRefreshItems?.()
  }

  async function batchToggle(kind, addToMap) {
    const targets = items.filter(i =>
      (kind === 'all' || i.kind === kind) &&
      (addToMap ? !mapItemSet.has(i.id) : mapItemSet.has(i.id))
    )
    if (targets.length === 0) return
    const ids = new Set(targets.map(i => i.id))
    setSavingItems(prev => new Set([...prev, ...ids]))
    await Promise.all(targets.map(item => {
      const newMaps = addToMap
        ? [...(item.maps || []), sel.map_id]
        : (item.maps || []).filter(mid => mid !== sel.map_id)
      return supabase.from('item_pool').update({ maps: newMaps }).eq('id', item.id)
    }))
    setSavingItems(prev => { const s = new Set(prev); ids.forEach(id => s.delete(id)); return s })
    toast(addToMap ? `已加入 ${targets.length} 件道具` : `已移除 ${targets.length} 件道具`)
    onRefreshItems?.()
  }

  function updateWeight(itemId, newAmount) {
    clearTimeout(weightTimers.current[itemId])
    weightTimers.current[itemId] = setTimeout(() => {
      supabase.from('item_pool').update({ amount: Math.max(1, newAmount) }).eq('id', itemId)
    }, 600)
  }

  const totalWeight = mapItems.reduce((s, i) => s + (i.amount || 1), 0)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: sel ? '280px 1fr' : '1fr', gap: 16 }}>

      {/* 左：地图列表 */}
      <div>
        <input style={{ ...INPUT, marginBottom: 12 }} placeholder="🔍 搜索地图..." value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 600, overflowY: 'auto' }}>
          {filtered.map(map => {
            const itemCount = items.filter(i => (i.maps || []).includes(map.map_id)).length
            return (
              <div key={map.map_id} onClick={() => setSelectedMap(map.map_id === selectedMap ? null : map.map_id)}
                style={{ padding: '10px 14px', borderRadius: 10, cursor: 'pointer', background: selectedMap === map.map_id ? 'rgba(88,166,255,0.08)' : '#1c2129', border: `1px solid ${map.blocked ? '#f85149' : selectedMap === map.map_id ? '#58a6ff' : '#30363d'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{map.name || `地图 ${map.map_id}`}</span>
                    {map.blocked && <span style={{ marginLeft: 6, fontSize: 10, color: '#f85149', padding: '1px 6px', borderRadius: 6, background: 'rgba(248,81,73,0.12)', border: '1px solid rgba(248,81,73,0.25)' }}>禁区</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: itemCount > 0 ? '#d29922' : '#484f58' }}>📦 {itemCount}</span>
                    <span style={{ fontSize: 11, color: '#8b949e' }}>{map.weather || 'clear'}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 右：地图详情 */}
      {sel && (
        <div style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>🗺️ {sel.name || `地图 ${sel.map_id}`}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setItemSearch(''); setKindFilter('all'); setItemDrawer(true) }}
                style={{ ...BTN('rgba(210,153,34,0.1)', '#d29922', { border: '1px solid rgba(210,153,34,0.25)' }) }}>
                📦 物品池 <span style={{ opacity: .7 }}>({mapItems.length})</span>
              </button>
              <button onClick={() => setSelectedMap(null)} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LABEL}>天气</label>
              <select style={INPUT} value={sel.weather || 'clear'} onChange={e => update(sel.map_id, { weather: e.target.value })}>
                {WEATHER_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div>
              <label style={LABEL}>游戏模式</label>
              <select style={INPUT} value={sel.game_type ?? 0} onChange={e => update(sel.map_id, { game_type: Number(e.target.value) })}>
                {Object.entries(GAME_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><label style={LABEL}>最大玩家数</label><input type="number" style={INPUT} value={sel.max_players || 10} onChange={e => update(sel.map_id, { max_players: Number(e.target.value) })} /></div>
            <div><label style={LABEL}>危险度 (1-5)</label><input type="number" min={1} max={5} style={INPUT} value={sel.danger_level || 1} onChange={e => update(sel.map_id, { danger_level: Number(e.target.value) })} /></div>
            <div style={{ gridColumn: '1/-1' }}><label style={LABEL}>地图名称</label><input style={INPUT} value={sel.name || ''} onChange={e => update(sel.map_id, { name: e.target.value })} /></div>
            <div style={{ gridColumn: '1/-1' }}><label style={LABEL}>描述</label><input style={INPUT} value={sel.description || ''} onChange={e => update(sel.map_id, { description: e.target.value })} placeholder="地图描述（可选）" /></div>
          </div>

          <button onClick={() => updateNow(sel.map_id, { blocked: !sel.blocked }, sel.blocked ? '已解除禁区' : '已设为禁区')}
            style={{ ...BTN(sel.blocked ? 'rgba(63,185,80,0.12)' : 'rgba(248,81,73,0.12)', sel.blocked ? '#3fb950' : '#f85149'), marginTop: 14, width: '100%', justifyContent: 'center', border: `1px solid ${sel.blocked ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)'}` }}>
            {sel.blocked ? '✅ 解除禁区' : '⛔ 设为禁区'}
          </button>

          {/* 物品池预览 */}
          {mapItems.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #21262d' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: '#8b949e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>物品池</span>
                <span style={{ fontSize: 11, color: '#484f58' }}>总权重 {totalWeight}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {mapItems.slice(0, 14).map(item => {
                  const meta = ITEM_KIND_META[item.kind] || ITEM_KIND_META.special
                  return (
                    <span key={item.id} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 8, background: `${meta.color}12`, color: meta.color, border: `1px solid ${meta.color}25` }}>
                      {meta.icon} {item.name}
                      {item.amount > 1 && <span style={{ opacity: .6, marginLeft: 3 }}>×{item.amount}</span>}
                    </span>
                  )
                })}
                {mapItems.length > 14 && (
                  <span style={{ fontSize: 11, color: '#484f58', cursor: 'pointer' }} onClick={() => setItemDrawer(true)}>
                    +{mapItems.length - 14} 种…
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 物品池 Drawer */}
      <Drawer open={itemDrawer && !!sel} onClose={() => setItemDrawer(false)}
        title={`📦 ${sel?.name || `地图 ${sel?.map_id}`} — 物品池`} width={740}>
        {sel && (
          <div>
            {/* Stats + batch */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, padding: '12px 16px', borderRadius: 10, background: 'rgba(88,166,255,0.06)', border: '1px solid rgba(88,166,255,0.15)' }}>
              <div style={{ display: 'flex', gap: 20 }}>
                <div><span style={{ fontSize: 11, color: '#8b949e' }}>已启用 </span><strong style={{ color: '#58a6ff', fontSize: 16 }}>{mapItems.length}</strong><span style={{ fontSize: 11, color: '#484f58' }}> / {items.length}</span></div>
                <div><span style={{ fontSize: 11, color: '#8b949e' }}>总权重 </span><strong style={{ color: '#d29922' }}>{totalWeight}</strong></div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => batchToggle(kindFilter, true)}
                  style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', color: '#3fb950' }}>
                  全部加入{kindFilter !== 'all' ? `（${ITEM_KIND_META[kindFilter]?.label}）` : ''}
                </button>
                <button onClick={() => batchToggle(kindFilter, false)}
                  style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}>
                  全部移除{kindFilter !== 'all' ? `（${ITEM_KIND_META[kindFilter]?.label}）` : ''}
                </button>
              </div>
            </div>

            {/* Search + kind filter */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <input style={{ ...INPUT, flex: 1, minWidth: 160 }} placeholder="🔍 搜索道具名称..." value={itemSearch} onChange={e => setItemSearch(e.target.value)} />
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {['all', ...Object.keys(ITEM_KIND_META)].map(k => (
                  <button key={k} onClick={() => setKindFilter(k)} style={{ padding: '6px 12px', borderRadius: 20, fontSize: 11, cursor: 'pointer', border: `1px solid ${kindFilter === k ? '#58a6ff' : '#30363d'}`, background: kindFilter === k ? 'rgba(88,166,255,0.12)' : 'transparent', color: kindFilter === k ? '#58a6ff' : '#8b949e' }}>
                    {k === 'all' ? `全部 (${items.length})` : `${ITEM_KIND_META[k].icon} ${ITEM_KIND_META[k].label}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            {drawerFiltered.filter(i => mapItemSet.has(i.id)).length > 0 && (
              <div style={{ fontSize: 10, color: '#3fb950', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                ✓ 已在物品池 ({drawerFiltered.filter(i => mapItemSet.has(i.id)).length})
              </div>
            )}

            {/* Item rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {drawerSorted.map((item, idx) => {
                const meta        = ITEM_KIND_META[item.kind] || ITEM_KIND_META.special
                const inMap       = mapItemSet.has(item.id)
                const isSaving    = savingItems.has(item.id)
                const prevInMap   = idx > 0 && mapItemSet.has(drawerSorted[idx - 1].id)
                const showDivider = !inMap && (idx === 0 || prevInMap)

                return (
                  <div key={item.id}>
                    {showDivider && (
                      <div style={{ fontSize: 10, color: '#484f58', fontWeight: 700, marginTop: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        — 未加入 ({drawerFiltered.filter(i => !mapItemSet.has(i.id)).length})
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 9, background: inMap ? '#1c2129' : 'transparent', border: `1px solid ${inMap ? '#30363d' : '#1c2129'}`, opacity: isSaving ? 0.5 : 1, transition: 'all 0.15s' }}>

                      {/* 状态指示 */}
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: inMap ? '#3fb950' : '#30363d', flexShrink: 0 }} />

                      {/* 名称 + 信息 */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14 }}>{meta.icon}</span>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{item.name}</span>
                          <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, background: `${meta.color}15`, color: meta.color, border: `1px solid ${meta.color}25` }}>{meta.label}</span>
                          {item.sub_kind && <span style={{ fontSize: 10, color: '#484f58' }}>{item.sub_kind}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 10, fontSize: 11, marginTop: 2 }}>
                          {item.atk > 0 && <span style={{ color: '#f85149' }}>ATK +{item.atk}</span>}
                          {item.def > 0 && <span style={{ color: '#58a6ff' }}>DEF +{item.def}</span>}
                          {item.heal > 0 && <span style={{ color: '#3fb950' }}>HEAL +{item.heal}</span>}
                          {item.description && <span style={{ color: '#484f58', fontSize: 10 }}>{item.description.slice(0, 24)}{item.description.length > 24 ? '…' : ''}</span>}
                        </div>
                      </div>

                      {/* 权重编辑（仅在池中时显示） */}
                      {inMap && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                          <span style={{ fontSize: 10, color: '#8b949e' }}>权重</span>
                          <input
                            type="number" min={1}
                            key={`w_${item.id}_${item.amount}`}
                            defaultValue={item.amount || 1}
                            onChange={e => updateWeight(item.id, parseInt(e.target.value) || 1)}
                            style={{ width: 56, padding: '4px 8px', borderRadius: 6, border: '1px solid #30363d', background: '#0e1117', color: '#d29922', fontSize: 12, outline: 'none', textAlign: 'center', fontWeight: 700 }}
                          />
                        </div>
                      )}

                      {/* 加入/移除按钮 */}
                      <button onClick={() => toggleItem(item, inMap)} disabled={isSaving}
                        style={{ flexShrink: 0, padding: '5px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: isSaving ? 'wait' : 'pointer', border: `1px solid ${inMap ? 'rgba(248,81,73,0.3)' : 'rgba(63,185,80,0.3)'}`, background: inMap ? 'rgba(248,81,73,0.1)' : 'rgba(63,185,80,0.1)', color: inMap ? '#f85149' : '#3fb950', minWidth: 60, textAlign: 'center' }}>
                        {isSaving ? '…' : inMap ? '移除' : '+ 加入'}
                      </button>
                    </div>
                  </div>
                )
              })}
              {drawerSorted.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#484f58' }}>没有匹配的道具</div>}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}
