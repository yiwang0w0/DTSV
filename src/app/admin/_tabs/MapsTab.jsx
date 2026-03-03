'use client'
import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { BTN, INPUT, LABEL, WEATHER_OPTIONS, GAME_TYPES } from '../_shared/ui'

export default function MapsTab({ maps, setMaps, toast }) {
  const [search, setSearch]           = useState('')
  const [selectedMap, setSelectedMap] = useState(null)
  const timers = useRef({})

  const filtered = maps.filter(m => !search || (m.name || '').includes(search))

  function update(mapId, updates) {
    setMaps(prev => prev.map(m => m.map_id === mapId ? { ...m, ...updates } : m))
    clearTimeout(timers.current[mapId])
    timers.current[mapId] = setTimeout(() => {
      supabase.from('map_config').update(updates).eq('map_id', mapId)
    }, 600)
  }
  function updateNow(mapId, updates, msg) {
    setMaps(prev => prev.map(m => m.map_id === mapId ? { ...m, ...updates } : m))
    supabase.from('map_config').update(updates).eq('map_id', mapId)
    if (msg) toast(msg)
  }

  const sel = selectedMap ? maps.find(m => m.map_id === selectedMap) : null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: sel ? '300px 1fr' : '1fr', gap: 16 }}>
      <div>
        <input style={{ ...INPUT, marginBottom: 12 }} placeholder="🔍 搜索地图..." value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 600, overflowY: 'auto' }}>
          {filtered.map(map => (
            <div key={map.map_id} onClick={() => setSelectedMap(map.map_id === selectedMap ? null : map.map_id)}
              style={{ padding: '10px 14px', borderRadius: 10, cursor: 'pointer', background: selectedMap === map.map_id ? 'rgba(88,166,255,0.08)' : '#1c2129', border: `1px solid ${map.blocked ? '#f85149' : selectedMap === map.map_id ? '#58a6ff' : '#30363d'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{map.name || `地图 ${map.map_id}`}</span>
                  {map.blocked && <span style={{ marginLeft: 6, fontSize: 10, color: '#f85149', padding: '1px 6px', borderRadius: 6, background: 'rgba(248,81,73,0.12)', border: '1px solid rgba(248,81,73,0.25)' }}>禁区</span>}
                </div>
                <span style={{ fontSize: 11, color: '#8b949e' }}>{map.weather || 'clear'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {sel && (
        <div style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>🗺️ {sel.name || `地图 ${sel.map_id}`}</div>
            <button onClick={() => setSelectedMap(null)} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 18 }}>✕</button>
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
        </div>
      )}
    </div>
  )
}
