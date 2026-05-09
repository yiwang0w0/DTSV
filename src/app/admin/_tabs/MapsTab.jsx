'use client'
import { useState, useRef, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { BTN, INPUT, LABEL, WEATHER_OPTIONS, GAME_TYPES, ITEM_KIND_META } from '../_shared/ui'
import { CardDndProvider, DraggableCard, DroppableArea, ItemCard } from '@/components/cards'

const C = {
  cardBg:    '#1c2129',
  border:    '#30363d',
  border2:   '#21262d',
  text:      '#e6edf3',
  dim:       '#8b949e',
  dim2:      '#484f58',
  accent:    '#58a6ff',
  green:     '#3fb950',
  red:       '#f85149',
  yellow:    '#d29922',
}

export default function MapsTab({ maps, setMaps, items = [], onRefreshItems, toast }) {
  const [search, setSearch]           = useState('')
  const [selectedMap, setSelectedMap] = useState(null)
  const [itemSearch, setItemSearch]   = useState('')
  const [kindFilter, setKindFilter]   = useState('all')
  const [savingItems, setSavingItems] = useState(new Set())
  const [activeDrag, setActiveDrag]   = useState(null) // {item, fromInPool}

  const mapTimers    = useRef({})
  const weightTimers = useRef({})

  const filtered = maps.filter(m => !search || (m.name || '').includes(search))
  const sel = selectedMap ? maps.find(m => m.map_id === selectedMap) : null
  const selMapId = sel?.map_id

  const mapItems = useMemo(
    () => selMapId !== undefined ? items.filter(i => (i.maps || []).includes(selMapId)) : [],
    [items, selMapId],
  )
  const mapItemSet = useMemo(() => new Set(mapItems.map(i => i.id)), [mapItems])

  const matchesFilter = useCallback(
    i => (kindFilter === 'all' || i.kind === kindFilter)
      && (!itemSearch || i.name.includes(itemSearch) || (i.description || '').includes(itemSearch)),
    [kindFilter, itemSearch],
  )

  const availableFiltered = useMemo(
    () => items.filter(i => !mapItemSet.has(i.id) && matchesFilter(i)),
    [items, mapItemSet, matchesFilter],
  )
  const poolFiltered = useMemo(
    () => mapItems.filter(matchesFilter),
    [mapItems, matchesFilter],
  )

  // ── 地图配置（防抖） ──────────────────────────
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

  // ── 加入 / 移除 ─────────────────────────────
  async function addItemToMap(item) {
    if (!sel || mapItemSet.has(item.id)) return
    setSavingItems(prev => new Set(prev).add(item.id))
    const newMaps = [...(item.maps || []), sel.map_id]
    const { error } = await supabase.from('item_pool').update({ maps: newMaps }).eq('id', item.id)
    setSavingItems(prev => { const s = new Set(prev); s.delete(item.id); return s })
    if (error) { toast('操作失败', 'error'); return }
    onRefreshItems?.()
  }

  async function removeItemFromMap(item) {
    if (!sel || !mapItemSet.has(item.id)) return
    setSavingItems(prev => new Set(prev).add(item.id))
    const newMaps = (item.maps || []).filter(mid => mid !== sel.map_id)
    const { error } = await supabase.from('item_pool').update({ maps: newMaps }).eq('id', item.id)
    setSavingItems(prev => { const s = new Set(prev); s.delete(item.id); return s })
    if (error) { toast('操作失败', 'error'); return }
    onRefreshItems?.()
  }

  async function batchToggle(addToMap) {
    const targets = items.filter(i => matchesFilter(i) && (addToMap ? !mapItemSet.has(i.id) : mapItemSet.has(i.id)))
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
    const safe = Math.max(1, newAmount)
    clearTimeout(weightTimers.current[itemId])
    weightTimers.current[itemId] = setTimeout(() => {
      supabase.from('item_pool').update({ amount: safe }).eq('id', itemId)
        .then(() => onRefreshItems?.())
    }, 600)
  }

  // ── DnD 处理 ──────────────────────────────────
  const handleDragStart = ({ active }) => {
    const item = items.find(i => i.id === active.id)
    if (!item) return
    setActiveDrag({ item, fromInPool: mapItemSet.has(item.id) })
  }

  const handleDragEnd = ({ active, over }) => {
    setActiveDrag(null)
    if (!over || !sel) return
    const item = items.find(i => i.id === active.id)
    if (!item) return
    const inPool = mapItemSet.has(item.id)
    if (over.id === 'zone-pool' && !inPool) addItemToMap(item)
    else if (over.id === 'zone-available' && inPool) removeItemFromMap(item)
  }

  const handleDragCancel = () => setActiveDrag(null)

  const totalWeight = mapItems.reduce((s, i) => s + (i.amount || 1), 0)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: sel ? '280px 1fr' : '1fr', gap: 16 }}>

      {/* ── 左：地图列表 ───────────────────────── */}
      <div>
        <input
          style={{ ...INPUT, marginBottom: 12 }}
          placeholder="🔍 搜索地图..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
          {filtered.map(map => {
            const itemCount = items.filter(i => (i.maps || []).includes(map.map_id)).length
            const active = selectedMap === map.map_id
            return (
              <div
                key={map.map_id}
                onClick={() => setSelectedMap(active ? null : map.map_id)}
                style={{
                  padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                  background: active ? `${C.accent}14` : C.cardBg,
                  border: `1px solid ${map.blocked ? C.red : active ? C.accent : C.border}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{map.name || `地图 ${map.map_id}`}</span>
                    {map.blocked && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: C.red, padding: '1px 6px', borderRadius: 6, background: `${C.red}20`, border: `1px solid ${C.red}40` }}>禁区</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: itemCount > 0 ? C.yellow : C.dim2 }}>📦 {itemCount}</span>
                    <span style={{ fontSize: 11, color: C.dim }}>
                      {(WEATHER_OPTIONS.find(w => w.value === map.weather) || WEATHER_OPTIONS[0]).label}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── 右：地图详情 + 道具卡片分配 ──────────── */}
      {sel && (
        <CardDndProvider
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
          dragOverlay={
            activeDrag
              ? <ItemCard item={activeDrag.item} compact inPool={activeDrag.fromInPool} draggable />
              : null
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* — 配置表单 — */}
            <div style={{ background: C.cardBg, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>🗺️ {sel.name || `地图 ${sel.map_id}`}</div>
                <button
                  onClick={() => setSelectedMap(null)}
                  style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 18 }}
                >✕</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={LABEL}>天气</label>
                  <select style={INPUT} value={sel.weather || 'clear'} onChange={e => update(sel.map_id, { weather: e.target.value })}>
                    {WEATHER_OPTIONS.map(w => <option key={w.value} value={w.value}>{w.label} — {w.desc}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LABEL}>游戏模式</label>
                  <select style={INPUT} value={sel.game_type ?? 0} onChange={e => update(sel.map_id, { game_type: Number(e.target.value) })}>
                    {Object.entries(GAME_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LABEL}>最大玩家数</label>
                  <input type="number" style={INPUT} value={sel.max_players || 10} onChange={e => update(sel.map_id, { max_players: Number(e.target.value) })} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={LABEL}>地图名称</label>
                  <input style={INPUT} value={sel.name || ''} onChange={e => update(sel.map_id, { name: e.target.value })} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={LABEL}>描述</label>
                  <input style={INPUT} value={sel.description || ''} onChange={e => update(sel.map_id, { description: e.target.value })} placeholder="地图描述（可选）" />
                </div>
              </div>

              <button
                onClick={() => updateNow(sel.map_id, { blocked: !sel.blocked }, sel.blocked ? '已解除禁区' : '已设为禁区')}
                style={{
                  ...BTN(sel.blocked ? `${C.green}20` : `${C.red}20`, sel.blocked ? C.green : C.red),
                  marginTop: 14, width: '100%', justifyContent: 'center',
                  border: `1px solid ${sel.blocked ? `${C.green}40` : `${C.red}40`}`,
                }}
              >
                {sel.blocked ? '✅ 解除禁区' : '⛔ 设为禁区'}
              </button>
            </div>

            {/* — 筛选条 — */}
            <div style={{
              background: C.cardBg, borderRadius: 12, border: `1px solid ${C.border}`,
              padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <input
                style={{ ...INPUT, flex: 1, minWidth: 180 }}
                placeholder="🔍 搜索道具名称或描述..."
                value={itemSearch}
                onChange={e => setItemSearch(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {['all', ...Object.keys(ITEM_KIND_META)].map(k => (
                  <button
                    key={k}
                    onClick={() => setKindFilter(k)}
                    style={{
                      padding: '6px 12px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                      border: `1px solid ${kindFilter === k ? C.accent : C.border}`,
                      background: kindFilter === k ? `${C.accent}18` : 'transparent',
                      color: kindFilter === k ? C.accent : C.dim,
                    }}
                  >
                    {k === 'all' ? `全部 (${items.length})` : `${ITEM_KIND_META[k].icon} ${ITEM_KIND_META[k].label}`}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => batchToggle(true)}
                  style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: `${C.green}18`, border: `1px solid ${C.green}40`, color: C.green }}
                >全部加入</button>
                <button
                  onClick={() => batchToggle(false)}
                  style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: `${C.red}18`, border: `1px solid ${C.red}40`, color: C.red }}
                >全部移除</button>
              </div>
            </div>

            {/* — 卡片双栏 — */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'stretch' }}>

              {/* 待选区 */}
              <DroppableArea
                id="zone-available"
                highlight={C.red}
                emptyHint="拖到这里移除"
                style={{ padding: 12, minHeight: 240, background: '#0e1117' }}
              >
                <PanelHeader
                  title="待选道具"
                  count={availableFiltered.length}
                  total={items.length - mapItems.length}
                  color={C.dim}
                />
                <CardGrid>
                  {availableFiltered.length === 0 ? (
                    <EmptyHint text={items.length === mapItems.length ? '所有道具已加入' : '没有匹配的待选道具'} />
                  ) : availableFiltered.map(item => (
                    <DraggableCard
                      key={item.id}
                      id={item.id}
                      payload={{ kind: 'item', from: 'available' }}
                    >
                      <ItemCard
                        item={item}
                        inPool={false}
                        draggable
                        compact
                        busy={savingItems.has(item.id)}
                        onAction={() => addItemToMap(item)}
                      />
                    </DraggableCard>
                  ))}
                </CardGrid>
              </DroppableArea>

              {/* 物品池 */}
              <DroppableArea
                id="zone-pool"
                highlight={C.green}
                emptyHint="拖到这里加入物品池"
                style={{ padding: 12, minHeight: 240, background: '#0e1117' }}
              >
                <PanelHeader
                  title="本地图物品池"
                  count={poolFiltered.length}
                  total={mapItems.length}
                  color={C.green}
                  extra={<span style={{ fontSize: 11, color: C.yellow }}>权重 {totalWeight}</span>}
                />
                <CardGrid>
                  {mapItems.length === 0 ? (
                    <EmptyHint text="物品池为空。从左侧拖入或点 + 加入" />
                  ) : poolFiltered.length === 0 ? (
                    <EmptyHint text="没有匹配的池中道具" />
                  ) : poolFiltered.map(item => (
                    <DraggableCard
                      key={item.id}
                      id={item.id}
                      payload={{ kind: 'item', from: 'pool' }}
                    >
                      <ItemCard
                        item={item}
                        inPool
                        weight={item.amount || 1}
                        draggable
                        busy={savingItems.has(item.id)}
                        onWeightChange={w => updateWeight(item.id, w)}
                        onAction={() => removeItemFromMap(item)}
                      />
                    </DraggableCard>
                  ))}
                </CardGrid>
              </DroppableArea>
            </div>
          </div>
        </CardDndProvider>
      )}
    </div>
  )
}

// ── 内部辅助组件 ─────────────────────────────────
function PanelHeader({ title, count, total, color, extra }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${C.border2}` }}>
      <span style={{ fontWeight: 700, fontSize: 12, color: C.text, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</span>
      <span style={{ fontSize: 11, color }}>{count}{total !== undefined && count !== total ? ` / ${total}` : ''}</span>
      <div style={{ flex: 1 }} />
      {extra}
    </div>
  )
}

function CardGrid({ children }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
      gap: 8,
      maxHeight: 520,
      overflowY: 'auto',
      paddingRight: 4,
    }}>
      {children}
    </div>
  )
}

function EmptyHint({ text }) {
  return (
    <div style={{
      gridColumn: '1/-1', textAlign: 'center', padding: '32px 12px',
      color: C.dim2, fontSize: 12,
    }}>
      {text}
    </div>
  )
}
