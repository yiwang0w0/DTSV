'use client'
import { useState, useMemo } from 'react'
import { INPUT, C } from '../_shared/ui'

/* 邻接双视图（纯受控, 无 supabase）— 地图编辑器 Phase 3
 * - 网格视图：复刻 BrZoneCell/BrGridPanel 视觉范式（aspectRatio 1/1 · repeat(cols,1fr) gap3 ·
 *   状态色透明度叠加 · 图例行）但用 _shared/ui.js 的 C（GitHub dark），不 import gameUi.js。
 * - 列表视图：按房名/区域搜索的兜底/远连选择。
 * - toggle 后 onChange(排序后的新数组)，diff 友好。
 */

// 房名形如「扇区 X-NN」：放不下时取末 4 字符（最具区分度，如 "扇区 A-01"→"A-01"）
function abbrev(s) {
  return s.length <= 4 ? s : s.slice(-4)
}

export default function NeighborPicker({ rooms, currentRoomId, value, onChange }) {
  const [view, setView] = useState('grid')
  const [listSearch, setListSearch] = useState('')

  const safeRooms = useMemo(() => (Array.isArray(rooms) ? rooms : []), [rooms])
  const safeValue = useMemo(() => (Array.isArray(value) ? value : []), [value])

  // 网格 bounds（空集兜底 1×1；逻辑同 RoomsEditorTab）
  const bounds = useMemo(() => {
    let maxGX = 0, maxGY = 0
    for (const r of safeRooms) {
      if (Number.isFinite(r.grid_x) && r.grid_x > maxGX) maxGX = r.grid_x
      if (Number.isFinite(r.grid_y) && r.grid_y > maxGY) maxGY = r.grid_y
    }
    return { gridW: maxGX + 1, gridH: maxGY + 1 }
  }, [safeRooms])

  // "gx,gy" → room（跳过 grid_x/grid_y 非有限的）
  const cellByXY = useMemo(() => {
    const m = new Map()
    for (const r of safeRooms) {
      if (Number.isFinite(r.grid_x) && Number.isFinite(r.grid_y)) {
        m.set(`${r.grid_x},${r.grid_y}`, r)
      }
    }
    return m
  }, [safeRooms])

  const valueSet = useMemo(() => new Set(safeValue), [safeValue])
  const byId = useMemo(() => {
    const m = new Map()
    for (const r of safeRooms) m.set(r.room_id, r)
    return m
  }, [safeRooms])

  function toggle(roomId) {
    if (roomId === currentRoomId) return            // 自身不可选
    onChange(valueSet.has(roomId)
      ? safeValue.filter((n) => n !== roomId)
      : [...safeValue, roomId].sort((a, b) => a - b)) // 排序稳定, diff 友好
  }

  function cellState(room) {
    if (!room) return 'empty'
    if (room.room_id === currentRoomId) return 'current'
    if (valueSet.has(room.room_id)) return 'selected'
    return 'pickable'
  }

  // 杜绝 repeat(0,1fr)：守卫非有限/<1 → 回退 1（仿 gameUi.js:540-541）
  const cols = Number.isFinite(bounds.gridW) && bounds.gridW >= 1 ? Math.floor(bounds.gridW) : 1
  const rows = Number.isFinite(bounds.gridH) && bounds.gridH >= 1 ? Math.floor(bounds.gridH) : 1

  const segBtn = (active) => ({
    padding: '6px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
    border: `1px solid ${active ? C.accent : C.border}`,
    background: active ? 'rgba(88,166,255,0.12)' : 'transparent',
    color: active ? C.accent : C.dim,
  })

  // 列表视图过滤
  const listRooms = safeRooms
    .filter((r) => r.room_id !== currentRoomId
      && (!listSearch || (r.label || '').includes(listSearch) || (r.region || '').includes(listSearch)))
    .sort((a, b) => a.room_id - b.room_id)

  return (
    <div>
      {/* ── 视图切换条 + 已选计数 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={() => setView('grid')} style={segBtn(view === 'grid')}>🛰 网格</button>
          <button type="button" onClick={() => setView('list')} style={segBtn(view === 'list')}>☰ 列表</button>
        </div>
        <span style={{ fontSize: 11, color: C.dim }}>已选 {safeValue.length}</span>
      </div>

      {/* ── 已选 chips ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {safeValue.length === 0
          ? <span style={{ fontSize: 11, color: C.dim2 }}>未选邻接</span>
          : safeValue.map((id) => (
            <span key={id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'rgba(88,166,255,0.12)', color: C.accent,
              borderRadius: 6, padding: '2px 8px', fontSize: 11,
            }}>
              {byId.get(id)?.label || ('#' + id)}
              <span onClick={() => toggle(id)} style={{ cursor: 'pointer', opacity: 0.8 }}>✕</span>
            </span>
          ))}
      </div>

      {/* ── 网格视图 ── */}
      {view === 'grid' && (
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 8 }}>
            🛰 扇区网格 {cols}×{rows} · 点格子增删邻接
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 3 }}>
            {Array.from({ length: rows }).map((_, y) =>
              Array.from({ length: cols }).map((_, x) => {
                const room = cellByXY.get(`${x},${y}`)
                const st = cellState(room)
                const disabled = room && room.enabled === false
                const cellStyle =
                  st === 'current'
                    ? { background: 'rgba(88,166,255,0.18)', border: `2px solid ${C.accent}`, color: C.accent }
                    : st === 'selected'
                      ? { background: 'rgba(63,185,80,0.16)', border: `1px solid ${C.green}`, color: C.green }
                      : st === 'pickable'
                        ? { background: 'rgba(48,54,61,0.4)', border: `1px solid ${C.border}`, color: C.dim, cursor: 'pointer' }
                        : { background: 'transparent', border: `1px dashed ${C.border2}`, color: C.dim2 }
                const tip = room
                  ? `${room.label || '#' + room.room_id}（${room.region || ''}）${room.room_id === currentRoomId ? ' · 当前房' : valueSet.has(room.room_id) ? ' · 已邻接' : ' · 点击设为邻接'}`
                  : ''
                return (
                  <div
                    key={`${x},${y}`}
                    title={tip}
                    onClick={room && st !== 'empty' ? () => toggle(room.room_id) : undefined}
                    style={{
                      aspectRatio: '1 / 1', borderRadius: 4,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, overflow: 'hidden', padding: 2, textAlign: 'center', lineHeight: 1.1,
                      transition: 'background .2s, border-color .2s',
                      opacity: disabled ? 0.45 : 1,
                      ...cellStyle,
                    }}
                  >
                    {room ? abbrev(room.label || ('#' + room.room_id)) : ''}
                  </div>
                )
              }),
            )}
          </div>
          {/* 图例行（仿 gameUi.js:571-590）*/}
          <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap', fontSize: 10, color: C.dim }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(88,166,255,0.18)', border: `2px solid ${C.accent}` }} /> 当前房
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(63,185,80,0.16)', border: `1px solid ${C.green}` }} /> 已选邻接
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(48,54,61,0.4)', border: `1px solid ${C.border}` }} /> 可选
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, border: `1px dashed ${C.border2}` }} /> 空
            </span>
          </div>
        </div>
      )}

      {/* ── 列表视图 ── */}
      {view === 'list' && (
        <div>
          <input
            style={{ ...INPUT, marginBottom: 8 }}
            placeholder="搜索房名 / 区域..."
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
          />
          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {listRooms.map((r) => {
              const sel = valueSet.has(r.room_id)
              return (
                <div key={r.room_id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                  background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 8, padding: '8px 12px',
                  opacity: r.enabled === false ? 0.55 : 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.label || ('#' + r.room_id)}</span>
                    {r.region && <span style={{ fontSize: 10, color: C.dim }}>· {r.region}</span>}
                    <span style={{ fontSize: 10, color: C.accent, fontFamily: 'monospace' }}>
                      ({Number.isFinite(r.grid_x) ? r.grid_x : '—'},{Number.isFinite(r.grid_y) ? r.grid_y : '—'})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(r.room_id)}
                    style={{
                      flexShrink: 0, padding: '4px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      background: sel ? 'rgba(63,185,80,0.15)' : 'transparent',
                      color: sel ? C.green : C.dim,
                      border: `1px solid ${sel ? 'rgba(63,185,80,0.3)' : C.border}`,
                    }}
                  >
                    {sel ? '移除' : '邻接'}
                  </button>
                </div>
              )
            })}
            {listRooms.length === 0 && (
              <div style={{ textAlign: 'center', padding: 24, color: C.dim, fontSize: 12 }}>
                {listSearch ? '没有匹配的房间' : '没有可选房间'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
