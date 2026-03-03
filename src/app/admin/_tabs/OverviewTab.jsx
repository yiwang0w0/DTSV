'use client'
import { ITEM_KIND_META, NPC_LEVEL_META, StatCard } from '../_shared/ui'

export default function OverviewTab({ items, npcs, maps, rooms }) {
  const activeRooms  = rooms.filter(r => r.gamestate === 1).length
  const waitingRooms = rooms.filter(r => r.gamestate === 0).length
  const blockedMaps  = maps.filter(m => m.blocked).length

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label="道具总数" value={items.length} icon="⚔️" color="#f85149"
          sub={`武器 ${items.filter(i=>i.kind==='weapon').length} / 防具 ${items.filter(i=>i.kind==='armor').length} / 消耗品 ${items.filter(i=>i.kind==='consumable').length}`} />
        <StatCard label="NPC总数" value={npcs.length} icon="🤖" color="#bc8cff"
          sub={`BOSS ${npcs.filter(n=>n.level==='boss').length} / 困难 ${npcs.filter(n=>n.level==='hard').length} / 中等 ${npcs.filter(n=>n.level==='medium').length}`} />
        <StatCard label="活跃地图" value={maps.length - blockedMaps} icon="🗺️" color="#3fb950"
          sub={blockedMaps > 0 ? `${blockedMaps} 个禁区 / 共 ${maps.length}` : `共 ${maps.length} 个地图`} />
        <StatCard label="进行中房间" value={activeRooms} icon="🏠" color="#58a6ff"
          sub={`等待中 ${waitingRooms} / 历史记录 ${rooms.length}`} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>道具分布</div>
          {Object.entries(ITEM_KIND_META).map(([k, v]) => {
            const count = items.filter(i => i.kind === k).length
            const pct = items.length ? Math.round(count / items.length * 100) : 0
            return (
              <div key={k} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: v.color }}>{v.icon} {v.label}</span>
                  <span style={{ color: '#8b949e' }}>{count}</span>
                </div>
                <div style={{ height: 4, background: '#21262d', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: v.color, borderRadius: 2 }} />
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>NPC 分布</div>
          {Object.entries(NPC_LEVEL_META).map(([k, v]) => {
            const count = npcs.filter(n => n.level === k).length
            const pct = npcs.length ? Math.round(count / npcs.length * 100) : 0
            return (
              <div key={k} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: v.color }}>{v.label}</span>
                  <span style={{ color: '#8b949e' }}>{count}</span>
                </div>
                <div style={{ height: 4, background: '#21262d', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: v.color, borderRadius: 2 }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
