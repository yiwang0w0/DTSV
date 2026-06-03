'use client'
import { useState, useMemo } from 'react'
import { INPUT, C } from '../_shared/ui'

/* 候选房网格多选 + 权重 — Phase 36 投放规则（道具中心 · 全图分布）
 * - 复用 NeighborPicker 的网格视觉范式（grid_x/grid_y → repeat(cols,1fr) · aspectRatio 1/1 · gap3 ·
 *   状态色透明度叠加 · 图例行）但用 _shared/ui.js 的 C（GitHub dark），不 import gameUi.js。
 * - 与 NeighborPicker 的关键区别：
 *   · 无 currentRoomId（规则中心没有「当前房」概念）。
 *   · value = [{ br_room_id:number, weight:number>0 }]（带权候选），非 number[]。
 * - 受控组件：点格 toggle 候选；每选中房可单独编辑 weight；列表视图兜底远连。
 * - onChange 输出 value 按 br_room_id 升序（diff 友好）。
 */

// 房名形如「扇区 X-NN」：放不下时取末 4 字符（最具区分度）
function abbrev(s) {
  return s.length <= 4 ? s : s.slice(-4)
}

// 升序归一（按 br_room_id），保证 diff 稳定 + 分配确定性锚点一致
function sortCands(list) {
  return [...list].sort((a, b) => a.br_room_id - b.br_room_id)
}

export default function CandidateRoomPicker({ rooms, value, onChange }) {
  const [view, setView] = useState('grid')
  const [listSearch, setListSearch] = useState('')

  const safeRooms = useMemo(() => (Array.isArray(rooms) ? rooms : []), [rooms])
  const safeValue = useMemo(() => (Array.isArray(value) ? value : []), [value])

  // br_room_id → weight（快速查 + 选中态判定）
  const weightById = useMemo(() => {
    const m = new Map()
    for (const c of safeValue) m.set(Number(c.br_room_id), Number(c.weight))
    return m
  }, [safeValue])

  // 网格 bounds（空集兜底 1×1；逻辑同 NeighborPicker/RoomsEditorTab）
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

  const byId = useMemo(() => {
    const m = new Map()
    for (const r of safeRooms) m.set(r.room_id, r)
    return m
  }, [safeRooms])

  // 杜绝 repeat(0,1fr)：守卫非有限/<1 → 回退 1（仿 NeighborPicker）
  const cols = Number.isFinite(bounds.gridW) && bounds.gridW >= 1 ? Math.floor(bounds.gridW) : 1
  const gridRows = Number.isFinite(bounds.gridH) && bounds.gridH >= 1 ? Math.floor(bounds.gridH) : 1

  const totalWeight = safeValue.reduce((s, c) => s + (Number(c.weight) || 0), 0)

  // ── 增删候选 ──
  function toggle(roomId) {
    const rid = Number(roomId)
    if (weightById.has(rid)) {
      onChange(safeValue.filter((c) => Number(c.br_room_id) !== rid))
    } else {
      onChange(sortCands([...safeValue, { br_room_id: rid, weight: 1 }]))   // 默认 weight=1（CHECK weight>0）
    }
  }

  // ── 改某候选 weight（受控，立即上抛）──
  function setWeight(roomId, w) {
    const rid = Number(roomId)
    const num = Number(w)
    onChange(safeValue.map((c) => (Number(c.br_room_id) === rid ? { ...c, weight: num } : c)))
  }

  function cellState(room) {
    if (!room) return 'empty'
    if (weightById.has(room.room_id)) return 'selected'
    return 'pickable'
  }

  const segBtn = (active) => ({
    padding: '6px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
    border: `1px solid ${active ? C.accent : C.border}`,
    background: active ? 'rgba(88,166,255,0.12)' : 'transparent',
    color: active ? C.accent : C.dim,
  })

  // 列表视图过滤（含权重远连编辑）
  const listRooms = safeRooms
    .filter((r) => !listSearch || (r.label || '').includes(listSearch) || (r.region || '').includes(listSearch))
    .sort((a, b) => a.room_id - b.room_id)

  // 已选候选（按 br_room_id 升序）的权重编辑区数据
  const chosen = sortCands(safeValue)

  return (
    <div>
      {/* ── 视图切换条 + 计数 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={() => setView('grid')} style={segBtn(view === 'grid')}>🛰 网格</button>
          <button type="button" onClick={() => setView('list')} style={segBtn(view === 'list')}>☰ 列表</button>
        </div>
        <span style={{ fontSize: 11, color: C.dim }}>
          已选候选 <b style={{ color: C.green }}>{safeValue.length}</b> · 总权重 <b style={{ color: C.accent }}>{totalWeight.toFixed(1)}</b>
        </span>
      </div>

      {/* ── 已选候选权重编辑区 ── */}
      <div style={{ marginBottom: 10 }}>
        {chosen.length === 0 ? (
          <span style={{ fontSize: 11, color: C.dim2 }}>未选候选房 — 点网格格子或列表加入；分配时会从候选里加权抽取</span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {chosen.map((c) => {
              const room = byId.get(Number(c.br_room_id))
              const badW = !(Number(c.weight) > 0)   // CHECK weight>0：非正权重红框警示
              return (
                <span key={c.br_room_id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'rgba(63,185,80,0.12)', color: C.green,
                  borderRadius: 6, padding: '3px 8px', fontSize: 11,
                  border: `1px solid ${badW ? C.red : 'rgba(63,185,80,0.3)'}`,
                }}>
                  <span style={{ fontWeight: 600 }}>{room?.label || ('#' + c.br_room_id)}</span>
                  <span style={{ color: C.dim, fontSize: 9 }}>w</span>
                  <input
                    type="number" min={0.1} step={0.1}
                    value={c.weight}
                    onChange={(e) => setWeight(c.br_room_id, e.target.value)}
                    style={{
                      width: 54, padding: '2px 6px', borderRadius: 5, fontSize: 11,
                      border: `1px solid ${badW ? C.red : C.border}`,
                      background: C.bg2, color: C.text, outline: 'none',
                    }}
                  />
                  <span onClick={() => toggle(c.br_room_id)} style={{ cursor: 'pointer', opacity: 0.8, color: C.dim }}>✕</span>
                </span>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 网格视图 ── */}
      {view === 'grid' && (
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 8 }}>
            🛰 扇区网格 {cols}×{gridRows} · 点格子加入/移除候选
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 3 }}>
            {Array.from({ length: gridRows }).map((_, y) =>
              Array.from({ length: cols }).map((_, x) => {
                const room = cellByXY.get(`${x},${y}`)
                const st = cellState(room)
                const disabled = room && room.enabled === false
                const cellStyle =
                  st === 'selected'
                    ? { background: 'rgba(63,185,80,0.16)', border: `1px solid ${C.green}`, color: C.green }
                    : st === 'pickable'
                      ? { background: 'rgba(48,54,61,0.4)', border: `1px solid ${C.border}`, color: C.dim, cursor: 'pointer' }
                      : { background: 'transparent', border: `1px dashed ${C.border2}`, color: C.dim2 }
                const w = room ? weightById.get(room.room_id) : undefined
                const tip = room
                  ? `${room.label || '#' + room.room_id}（${room.region || ''}）${weightById.has(room.room_id) ? ` · 候选 w=${w}` : ' · 点击设为候选'}`
                  : ''
                return (
                  <div
                    key={`${x},${y}`}
                    title={tip}
                    onClick={room && st !== 'empty' ? () => toggle(room.room_id) : undefined}
                    style={{
                      aspectRatio: '1 / 1', borderRadius: 4,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, overflow: 'hidden', padding: 2, textAlign: 'center', lineHeight: 1.1,
                      transition: 'background .2s, border-color .2s',
                      opacity: disabled ? 0.45 : 1,
                      ...cellStyle,
                    }}
                  >
                    {room ? abbrev(room.label || ('#' + room.room_id)) : ''}
                    {room && weightById.has(room.room_id) && (
                      <span style={{ fontSize: 7, opacity: 0.85, marginTop: 1 }}>w{w}</span>
                    )}
                  </div>
                )
              }),
            )}
          </div>
          {/* 图例行（仿 NeighborPicker）*/}
          <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap', fontSize: 10, color: C.dim }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(63,185,80,0.16)', border: `1px solid ${C.green}` }} /> 候选房
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

      {/* ── 列表视图（兜底 + 跨网格远选 + weight 编辑）── */}
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
              const sel = weightById.has(r.room_id)
              const w = weightById.get(r.room_id)
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {sel && (
                      <input
                        type="number" min={0.1} step={0.1}
                        value={w}
                        onChange={(e) => setWeight(r.room_id, e.target.value)}
                        title="权重"
                        style={{
                          width: 60, padding: '4px 8px', borderRadius: 6, fontSize: 12,
                          border: `1px solid ${Number(w) > 0 ? C.border : C.red}`,
                          background: C.bg0, color: C.text, outline: 'none',
                        }}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => toggle(r.room_id)}
                      style={{
                        padding: '4px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        background: sel ? 'rgba(63,185,80,0.15)' : 'transparent',
                        color: sel ? C.green : C.dim,
                        border: `1px solid ${sel ? 'rgba(63,185,80,0.3)' : C.border}`,
                      }}
                    >
                      {sel ? '移除' : '候选'}
                    </button>
                  </div>
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
