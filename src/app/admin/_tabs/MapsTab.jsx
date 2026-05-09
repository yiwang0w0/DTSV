'use client'
import { useState, useRef, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { BTN, INPUT, LABEL, WEATHER_OPTIONS, GAME_TYPES, ITEM_KIND_META, NPC_LEVEL_META } from '../_shared/ui'
import { CardDndProvider, DraggableCard, DroppableArea, ItemCard, NpcCard } from '@/components/cards'

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
  purple:    '#bc8cff',
}

const ZONE_AVAILABLE = 'zone-available'
const ZONE_POOL      = 'zone-pool'

export default function MapsTab({
  maps, setMaps,
  items = [], onRefreshItems,
  npcs = [],  onRefreshNpcs,
  toast,
}) {
  const [search, setSearch]           = useState('')
  const [selectedMap, setSelectedMap] = useState(null)
  const [assignTab, setAssignTab]     = useState('items') // 'items' | 'npcs'

  // 道具相关
  const [itemSearch, setItemSearch]   = useState('')
  const [kindFilter, setKindFilter]   = useState('all')
  const [savingItems, setSavingItems] = useState(new Set())

  // NPC 相关
  const [npcSearch, setNpcSearch]     = useState('')
  const [levelFilter, setLevelFilter] = useState('all')
  const [savingNpcs, setSavingNpcs]   = useState(new Set())

  // 拖拽
  const [activeDrag, setActiveDrag]   = useState(null) // { kind, entity, fromInPool }

  const mapTimers    = useRef({})
  const weightTimers = useRef({})

  const filtered = maps.filter(m => !search || (m.name || '').includes(search))
  const sel = selectedMap ? maps.find(m => m.map_id === selectedMap) : null
  const selMapId = sel?.map_id

  // ── 道具：当前地图池 / 过滤 ──────────────────────
  const mapItems = useMemo(
    () => selMapId !== undefined ? items.filter(i => (i.maps || []).includes(selMapId)) : [],
    [items, selMapId],
  )
  const mapItemSet = useMemo(() => new Set(mapItems.map(i => i.id)), [mapItems])

  const matchesItemFilter = useCallback(
    i => (kindFilter === 'all' || i.kind === kindFilter)
      && (!itemSearch || i.name.includes(itemSearch) || (i.description || '').includes(itemSearch)),
    [kindFilter, itemSearch],
  )

  const itemsAvailable = useMemo(
    () => items.filter(i => !mapItemSet.has(i.id) && matchesItemFilter(i)),
    [items, mapItemSet, matchesItemFilter],
  )
  const itemsInPool = useMemo(() => mapItems.filter(matchesItemFilter), [mapItems, matchesItemFilter])
  const totalWeight = mapItems.reduce((s, i) => s + (i.amount || 1), 0)

  // ── NPC：当前地图池 / 过滤 ───────────────────────
  const mapNpcs = useMemo(
    () => selMapId !== undefined ? npcs.filter(n => (n.maps || []).includes(selMapId)) : [],
    [npcs, selMapId],
  )
  const mapNpcSet = useMemo(() => new Set(mapNpcs.map(n => n.id)), [mapNpcs])

  const matchesNpcFilter = useCallback(
    n => (levelFilter === 'all' || n.level === levelFilter)
      && (!npcSearch || n.name.includes(npcSearch)),
    [levelFilter, npcSearch],
  )

  const npcsAvailable = useMemo(
    () => npcs.filter(n => !mapNpcSet.has(n.id) && matchesNpcFilter(n)),
    [npcs, mapNpcSet, matchesNpcFilter],
  )
  const npcsInPool = useMemo(() => mapNpcs.filter(matchesNpcFilter), [mapNpcs, matchesNpcFilter])

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

  // ── 旧的撤离点编辑器已移除（远星函馆改用 map_config.is_exit + exit_cost） ──

  // ── 道具加入/移除 ─────────────────────────────
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

  async function batchToggleItems(addToMap) {
    const targets = items.filter(i => matchesItemFilter(i) && (addToMap ? !mapItemSet.has(i.id) : mapItemSet.has(i.id)))
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

  // ── NPC 加入/移除 ──────────────────────────────
  async function addNpcToMap(npc) {
    if (!sel || mapNpcSet.has(npc.id)) return
    setSavingNpcs(prev => new Set(prev).add(npc.id))
    const newMaps = [...(npc.maps || []), sel.map_id]
    const { error } = await supabase.from('npc_pool').update({ maps: newMaps }).eq('id', npc.id)
    setSavingNpcs(prev => { const s = new Set(prev); s.delete(npc.id); return s })
    if (error) { toast('操作失败', 'error'); return }
    onRefreshNpcs?.()
  }

  async function removeNpcFromMap(npc) {
    if (!sel || !mapNpcSet.has(npc.id)) return
    setSavingNpcs(prev => new Set(prev).add(npc.id))
    const newMaps = (npc.maps || []).filter(mid => mid !== sel.map_id)
    const { error } = await supabase.from('npc_pool').update({ maps: newMaps }).eq('id', npc.id)
    setSavingNpcs(prev => { const s = new Set(prev); s.delete(npc.id); return s })
    if (error) { toast('操作失败', 'error'); return }
    onRefreshNpcs?.()
  }

  async function batchToggleNpcs(addToMap) {
    const targets = npcs.filter(n => matchesNpcFilter(n) && (addToMap ? !mapNpcSet.has(n.id) : mapNpcSet.has(n.id)))
    if (targets.length === 0) return
    const ids = new Set(targets.map(n => n.id))
    setSavingNpcs(prev => new Set([...prev, ...ids]))
    await Promise.all(targets.map(npc => {
      const newMaps = addToMap
        ? [...(npc.maps || []), sel.map_id]
        : (npc.maps || []).filter(mid => mid !== sel.map_id)
      return supabase.from('npc_pool').update({ maps: newMaps }).eq('id', npc.id)
    }))
    setSavingNpcs(prev => { const s = new Set(prev); ids.forEach(id => s.delete(id)); return s })
    toast(addToMap ? `已加入 ${targets.length} 个 NPC` : `已移除 ${targets.length} 个 NPC`)
    onRefreshNpcs?.()
  }

  // ── DnD 处理 ──────────────────────────────────
  const handleDragStart = ({ active }) => {
    const kind = active.data.current?.kind || (assignTab === 'npcs' ? 'npc' : 'item')
    if (kind === 'npc') {
      const entity = npcs.find(n => n.id === active.id)
      if (!entity) return
      setActiveDrag({ kind: 'npc', entity, fromInPool: mapNpcSet.has(entity.id) })
    } else {
      const entity = items.find(i => i.id === active.id)
      if (!entity) return
      setActiveDrag({ kind: 'item', entity, fromInPool: mapItemSet.has(entity.id) })
    }
  }

  const handleDragEnd = ({ active, over }) => {
    setActiveDrag(null)
    if (!over || !sel) return
    const kind = active.data.current?.kind || (assignTab === 'npcs' ? 'npc' : 'item')
    if (kind === 'npc') {
      const entity = npcs.find(n => n.id === active.id)
      if (!entity) return
      const inPool = mapNpcSet.has(entity.id)
      if (over.id === ZONE_POOL && !inPool)        addNpcToMap(entity)
      else if (over.id === ZONE_AVAILABLE && inPool) removeNpcFromMap(entity)
    } else {
      const entity = items.find(i => i.id === active.id)
      if (!entity) return
      const inPool = mapItemSet.has(entity.id)
      if (over.id === ZONE_POOL && !inPool)        addItemToMap(entity)
      else if (over.id === ZONE_AVAILABLE && inPool) removeItemFromMap(entity)
    }
  }

  const handleDragCancel = () => setActiveDrag(null)

  // ── 渲染 ───────────────────────────────────────
  return (
    <div style={{ display: 'grid', gridTemplateColumns: sel ? '280px 1fr' : '1fr', gap: 16 }}>

      {/* 地图列表 */}
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
            const npcCount  = npcs.filter(n => (n.maps || []).includes(map.map_id)).length
            const active    = selectedMap === map.map_id
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
                    <span style={{ fontSize: 10, color: npcCount  > 0 ? C.purple : C.dim2 }}>👹 {npcCount}</span>
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

      {/* 地图详情 */}
      {sel && (
        <CardDndProvider
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
          dragOverlay={
            activeDrag
              ? (activeDrag.kind === 'npc'
                  ? <NpcCard npc={activeDrag.entity} compact inPool={activeDrag.fromInPool} draggable />
                  : <ItemCard item={activeDrag.entity} compact inPool={activeDrag.fromInPool} draggable />)
              : null
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* 配置表单 */}
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

                {/* ── 远星函馆扩展字段 ── */}
                <div>
                  <label style={LABEL}>污染基线 (0-100)</label>
                  <input type="number" min={0} max={100} style={INPUT}
                    value={sel.pollution_base ?? 0}
                    onChange={e => update(sel.map_id, { pollution_base: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
                </div>
                <div>
                  <label style={LABEL}>每回合污染加速</label>
                  <input type="number" min={0} style={INPUT}
                    value={sel.pollution_accel ?? 0}
                    onChange={e => update(sel.map_id, { pollution_accel: Math.max(0, Number(e.target.value) || 0) })} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={LABEL}>邻接地图（JSON 数组，如 [0,2,10]）</label>
                  <input style={INPUT}
                    value={Array.isArray(sel.adjacent_maps) ? JSON.stringify(sel.adjacent_maps) : '[]'}
                    onChange={e => {
                      try {
                        const parsed = JSON.parse(e.target.value)
                        if (Array.isArray(parsed)) update(sel.map_id, { adjacent_maps: parsed.map(Number).filter(n => !Number.isNaN(n)) })
                      } catch { /* 不更新，等待合法 JSON */ }
                    }}
                    placeholder="[0, 2]" />
                </div>
                <div>
                  <label style={LABEL}>是否撤离出口</label>
                  <select style={INPUT}
                    value={sel.is_exit ? '1' : '0'}
                    onChange={e => update(sel.map_id, { is_exit: e.target.value === '1' })}>
                    <option value="0">否</option>
                    <option value="1">是</option>
                  </select>
                </div>
                <div>
                  <label style={LABEL}>Ω-段倒计时（仅 4 区填 3）</label>
                  <input type="number" min={0} style={INPUT}
                    value={sel.omega_window ?? 0}
                    onChange={e => update(sel.map_id, { omega_window: Math.max(0, Number(e.target.value) || 0) })} />
                </div>
                {sel.is_exit && (
                  <>
                    <div>
                      <label style={LABEL}>撤离消耗物品（空 = 无消耗）</label>
                      <input style={INPUT}
                        value={sel.exit_cost?.item || ''}
                        onChange={e => {
                          const item = e.target.value.trim()
                          if (!item) update(sel.map_id, { exit_cost: null })
                          else update(sel.map_id, { exit_cost: { item, qty: sel.exit_cost?.qty || 1 } })
                        }}
                        placeholder="如 环段部件" />
                    </div>
                    <div>
                      <label style={LABEL}>撤离消耗数量</label>
                      <input type="number" min={1} style={INPUT}
                        value={sel.exit_cost?.qty ?? 1}
                        disabled={!sel.exit_cost?.item}
                        onChange={e => update(sel.map_id, { exit_cost: { item: sel.exit_cost?.item, qty: Math.max(1, Number(e.target.value) || 1) } })} />
                    </div>
                  </>
                )}
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

            {/* 资源 Tab 切换 */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
              {[
                { key: 'items', label: `📦 道具池 (${mapItems.length})`, color: C.yellow },
                { key: 'npcs',  label: `👹 NPC 池 (${mapNpcs.length})`,  color: C.purple },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setAssignTab(tab.key)}
                  style={{
                    padding: '10px 18px', border: 'none', cursor: 'pointer',
                    background: 'transparent',
                    borderBottom: `2px solid ${assignTab === tab.key ? tab.color : 'transparent'}`,
                    color: assignTab === tab.key ? tab.color : C.dim,
                    fontSize: 13, fontWeight: assignTab === tab.key ? 700 : 500,
                  }}
                >{tab.label}</button>
              ))}
            </div>

            {/* === 道具分配视图 === */}
            {assignTab === 'items' && (
              <>
                {/* 筛选条 */}
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
                        style={chipStyle(kindFilter === k)}
                      >
                        {k === 'all' ? `全部 (${items.length})` : `${ITEM_KIND_META[k].icon} ${ITEM_KIND_META[k].label}`}
                      </button>
                    ))}
                  </div>
                  <BatchButtons onAdd={() => batchToggleItems(true)} onRemove={() => batchToggleItems(false)} />
                </div>

                {/* 双栏 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <DroppableArea
                    id={ZONE_AVAILABLE} highlight={C.red}
                    emptyHint="拖到这里移除"
                    style={{ padding: 12, minHeight: 240, background: '#0e1117' }}
                  >
                    <PanelHeader title="待选道具" count={itemsAvailable.length} total={items.length - mapItems.length} color={C.dim} />
                    <CardGrid>
                      {itemsAvailable.length === 0 ? (
                        <EmptyHint text={items.length === mapItems.length ? '所有道具已加入' : '没有匹配的待选道具'} />
                      ) : itemsAvailable.map(item => (
                        <DraggableCard key={item.id} id={item.id} payload={{ kind: 'item', from: 'available' }}>
                          <ItemCard
                            item={item} inPool={false} draggable compact
                            busy={savingItems.has(item.id)}
                            onAction={() => addItemToMap(item)}
                          />
                        </DraggableCard>
                      ))}
                    </CardGrid>
                  </DroppableArea>

                  <DroppableArea
                    id={ZONE_POOL} highlight={C.green}
                    emptyHint="拖到这里加入物品池"
                    style={{ padding: 12, minHeight: 240, background: '#0e1117' }}
                  >
                    <PanelHeader title="本地图物品池" count={itemsInPool.length} total={mapItems.length}
                      color={C.green} extra={<span style={{ fontSize: 11, color: C.yellow }}>权重 {totalWeight}</span>} />
                    <CardGrid>
                      {mapItems.length === 0 ? (
                        <EmptyHint text="物品池为空。从左侧拖入或点 + 加入" />
                      ) : itemsInPool.length === 0 ? (
                        <EmptyHint text="没有匹配的池中道具" />
                      ) : itemsInPool.map(item => (
                        <DraggableCard key={item.id} id={item.id} payload={{ kind: 'item', from: 'pool' }}>
                          <ItemCard
                            item={item} inPool weight={item.amount || 1} draggable
                            busy={savingItems.has(item.id)}
                            onWeightChange={w => updateWeight(item.id, w)}
                            onAction={() => removeItemFromMap(item)}
                          />
                        </DraggableCard>
                      ))}
                    </CardGrid>
                  </DroppableArea>
                </div>
              </>
            )}

            {/* === NPC 分配视图 === */}
            {assignTab === 'npcs' && (
              <>
                <div style={{
                  background: C.cardBg, borderRadius: 12, border: `1px solid ${C.border}`,
                  padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                }}>
                  <input
                    style={{ ...INPUT, flex: 1, minWidth: 180 }}
                    placeholder="🔍 搜索 NPC 名称..."
                    value={npcSearch}
                    onChange={e => setNpcSearch(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {['all', ...Object.keys(NPC_LEVEL_META)].map(k => (
                      <button
                        key={k}
                        onClick={() => setLevelFilter(k)}
                        style={chipStyle(levelFilter === k, NPC_LEVEL_META[k]?.color)}
                      >
                        {k === 'all' ? `全部 (${npcs.length})` : NPC_LEVEL_META[k].label}
                      </button>
                    ))}
                  </div>
                  <BatchButtons onAdd={() => batchToggleNpcs(true)} onRemove={() => batchToggleNpcs(false)} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <DroppableArea
                    id={ZONE_AVAILABLE} highlight={C.red}
                    emptyHint="拖到这里移除"
                    style={{ padding: 12, minHeight: 240, background: '#0e1117' }}
                  >
                    <PanelHeader title="待选 NPC" count={npcsAvailable.length} total={npcs.length - mapNpcs.length} color={C.dim} />
                    <CardGrid>
                      {npcsAvailable.length === 0 ? (
                        <EmptyHint text={npcs.length === mapNpcs.length ? '所有 NPC 已加入' : '没有匹配的待选 NPC'} />
                      ) : npcsAvailable.map(npc => (
                        <DraggableCard key={npc.id} id={npc.id} payload={{ kind: 'npc', from: 'available' }}>
                          <NpcCard
                            npc={npc} inPool={false} draggable compact
                            busy={savingNpcs.has(npc.id)}
                            onAction={() => addNpcToMap(npc)}
                          />
                        </DraggableCard>
                      ))}
                    </CardGrid>
                  </DroppableArea>

                  <DroppableArea
                    id={ZONE_POOL} highlight={C.green}
                    emptyHint="拖到这里加入 NPC 池"
                    style={{ padding: 12, minHeight: 240, background: '#0e1117' }}
                  >
                    <PanelHeader title="本地图 NPC 池" count={npcsInPool.length} total={mapNpcs.length} color={C.green} />
                    <CardGrid>
                      {mapNpcs.length === 0 ? (
                        <EmptyHint text="NPC 池为空。从左侧拖入或点 + 加入" />
                      ) : npcsInPool.length === 0 ? (
                        <EmptyHint text="没有匹配的池中 NPC" />
                      ) : npcsInPool.map(npc => (
                        <DraggableCard key={npc.id} id={npc.id} payload={{ kind: 'npc', from: 'pool' }}>
                          <NpcCard
                            npc={npc} inPool draggable
                            busy={savingNpcs.has(npc.id)}
                            onAction={() => removeNpcFromMap(npc)}
                          />
                        </DraggableCard>
                      ))}
                    </CardGrid>
                  </DroppableArea>
                </div>
              </>
            )}

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

function BatchButtons({ onAdd, onRemove }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <button
        onClick={onAdd}
        style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: `${C.green}18`, border: `1px solid ${C.green}40`, color: C.green }}
      >全部加入</button>
      <button
        onClick={onRemove}
        style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: `${C.red}18`, border: `1px solid ${C.red}40`, color: C.red }}
      >全部移除</button>
    </div>
  )
}

function chipStyle(active, customColor) {
  const color = customColor || C.accent
  return {
    padding: '6px 12px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
    border: `1px solid ${active ? color : C.border}`,
    background: active ? `${color}18` : 'transparent',
    color: active ? color : C.dim,
  }
}
