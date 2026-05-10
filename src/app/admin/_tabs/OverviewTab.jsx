'use client'
import { ITEM_KIND_META, NPC_LEVEL_META, StatCard } from '../_shared/ui'

export default function OverviewTab({ items, npcs, maps, rooms }) {
  const activeRooms  = rooms.filter(r => r.gamestate === 1).length
  const waitingRooms = rooms.filter(r => r.gamestate === 0).length
  const exitMaps     = maps.filter(m => m.is_exit).length

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label="道具总数" value={items.length} icon="🔮" color="#f85149"
          sub={`碎片 ${items.filter(i=>i.kind==='tech_fragment').length} / 部件 ${items.filter(i=>i.kind==='platform_part').length} / 消耗品 ${items.filter(i=>i.kind==='consumable').length}`} />
        <StatCard label="实体总数" value={npcs.length} icon="👻" color="#bc8cff"
          sub={`BOSS ${npcs.filter(n=>n.level==='boss').length} / 困难 ${npcs.filter(n=>n.level==='hard').length} / 中等 ${npcs.filter(n=>n.level==='medium').length}`} />
        <StatCard label="活跃地图" value={maps.length} icon="🗺️" color="#3fb950"
          sub={exitMaps > 0 ? `${exitMaps} 个撤离点 / 共 ${maps.length} 区域` : `共 ${maps.length} 个区域`} />
        <StatCard label="进行中对局" value={activeRooms} icon="🌀" color="#58a6ff"
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
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>实体分布</div>
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
