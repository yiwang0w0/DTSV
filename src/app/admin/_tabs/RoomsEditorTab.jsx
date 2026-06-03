'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { BTN, INPUT, LABEL, Modal } from '../_shared/ui'

/* 地图编辑器 Phase 1 §6: br_rooms 拓扑 CRUD（仿 ChambersTab）
 * - 编辑 label/region/grid_x/grid_y/neighbor_ids/enabled，可选 close_phase
 * - 直连 supabase.from('br_rooms')（RLS 关闭, authenticated 有全权限）
 * - close_phase 仅 /br 旧路径生效; /game 路径按 seed 实时派生 → UI 标注
 * - 保存成功后提示「拓扑版本已更新, 新对局生效, 在飞局不受影响」
 */

const EMPTY = {
  room_id: '',
  label: '',
  region: '',
  grid_x: 0,
  grid_y: 0,
  neighbor_ids: [],
  close_phase: 5,
  enabled: true,
}

// neighbor_ids 数组 ↔ 逗号分隔字符串
function neighborsToStr(arr) {
  return Array.isArray(arr) ? arr.join(', ') : ''
}
function strToNeighbors(str) {
  return String(str || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n))
}

export default function RoomsEditorTab({ toast }) {
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [regionFilter, setRegionFilter] = useState('all')
  const [modal, setModal] = useState(false)
  const [edit, setEdit] = useState(null)
  // neighbor_ids 编辑态用独立字符串缓存（允许中途输入逗号/空格）
  const [neighborStr, setNeighborStr] = useState('')
  const [confirmDel, setConfirmDel] = useState(null)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('br_rooms')
      .select('*')
      .order('room_id')
    if (error) toast('加载失败: ' + error.message, 'error')
    setRooms(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const regions = useMemo(() => {
    const set = new Set()
    for (const r of rooms) if (r.region) set.add(r.region)
    return Array.from(set).sort()
  }, [rooms])

  const filtered = rooms.filter((r) =>
    (regionFilter === 'all' || r.region === regionFilter)
    && (!search
      || String(r.room_id).includes(search)
      || (r.label || '').includes(search)
      || (r.region || '').includes(search))
  )

  // 网格 bounds（用于校验提示, 与服务端 §4 公式同源: gridW = maxGX+1）
  const bounds = useMemo(() => {
    let maxGX = 0, maxGY = 0
    for (const r of rooms) {
      if (Number.isFinite(r.grid_x) && r.grid_x > maxGX) maxGX = r.grid_x
      if (Number.isFinite(r.grid_y) && r.grid_y > maxGY) maxGY = r.grid_y
    }
    return { gridW: maxGX + 1, gridH: maxGY + 1 }
  }, [rooms])

  // room_id → 是否存在（编辑邻接 / 新增唯一性校验）
  const idSet = useMemo(() => new Set(rooms.map((r) => r.room_id)), [rooms])

  function openAdd() {
    // 新增时 room_id 预填一个未占用的最小正整数（便利, 仍可改）
    let suggest = 1
    while (idSet.has(suggest)) suggest++
    setEdit({ ...EMPTY, room_id: suggest, __editing: false })
    setNeighborStr('')
    setModal(true)
  }

  function openEdit(r) {
    setEdit({
      ...EMPTY,
      ...r,
      neighbor_ids: Array.isArray(r.neighbor_ids) ? r.neighbor_ids : [],
      __editing: true,
    })
    setNeighborStr(neighborsToStr(r.neighbor_ids))
    setModal(true)
  }

  async function save() {
    const roomId = Number(edit.room_id)
    if (!Number.isFinite(roomId) || roomId < 1) {
      toast('room_id 必须是 ≥1 的整数', 'error'); return
    }
    // 新增时唯一性校验（编辑时 room_id 只读, 不会撞）
    if (!edit.__editing && idSet.has(roomId)) {
      toast(`room_id ${roomId} 已存在`, 'error'); return
    }

    const neighbor_ids = strToNeighbors(neighborStr)
    const payload = {
      room_id: roomId,
      label: (edit.label || '').trim(),
      region: (edit.region || '').trim(),
      grid_x: Number.isFinite(Number(edit.grid_x)) ? Number(edit.grid_x) : null,
      grid_y: Number.isFinite(Number(edit.grid_y)) ? Number(edit.grid_y) : null,
      neighbor_ids,
      close_phase: Math.max(1, Math.min(5, Number(edit.close_phase) || 5)),
      enabled: !!edit.enabled,
    }

    if (edit.__editing) {
      const id = payload.room_id
      delete payload.room_id
      const { error } = await supabase.from('br_rooms').update(payload).eq('room_id', id)
      if (error) { toast('更新失败: ' + error.message, 'error'); return }
      toast('房间已更新 · 拓扑版本已更新，新对局生效，在飞局不受影响')
    } else {
      const { error } = await supabase.from('br_rooms').insert(payload)
      if (error) { toast('添加失败: ' + error.message, 'error'); return }
      toast('房间已添加 · 拓扑版本已更新，新对局生效，在飞局不受影响')
    }
    setModal(false)
    load()
  }

  async function remove(roomId) {
    const { error } = await supabase.from('br_rooms').delete().eq('room_id', roomId)
    if (error) { toast('删除失败: ' + error.message, 'error'); return }
    toast('房间已删除 · 拓扑版本已更新，新对局生效，在飞局不受影响')
    setConfirmDel(null)
    load()
  }

  async function toggleEnabled(r) {
    const { error } = await supabase.from('br_rooms').update({ enabled: !r.enabled }).eq('room_id', r.room_id)
    if (error) { toast('操作失败: ' + error.message, 'error'); return }
    load()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#8b949e' }}>加载中...</div>

  const enabledCount = rooms.filter((r) => r.enabled).length

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input placeholder="搜索房号 / label / region..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...INPUT, width: 240 }} />
          <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} style={{ ...INPUT, width: 180 }}>
            <option value="all">所有 region</option>
            {regions.map((rg) => <option key={rg} value={rg}>{rg}</option>)}
          </select>
        </div>
        <button onClick={openAdd} style={BTN('#58a6ff', '#fff')}>+ 添加房间</button>
      </div>

      <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8 }}>
        共 {rooms.length} 间 · 显示 {filtered.length} · 启用 {enabledCount} · 推导网格 {bounds.gridW}×{bounds.gridH}
      </div>
      <div style={{ fontSize: 11, color: '#d29922', marginBottom: 12, lineHeight: 1.6 }}>
        ⚠ <b>close_phase</b> 仅 <code style={{ color: '#bc8cff' }}>/br</code> 旧路径生效；<code style={{ color: '#58a6ff' }}>/game</code> 缩圈按 seed 实时派生（每局确定）。
        改拓扑后<b>新对局</b>生效；<b>进行中的对局</b>用各自 gamevars.br 快照，不受影响。
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map((r) => (
          <div key={r.room_id} style={{
            background: '#161b22', borderRadius: 8,
            border: `1px solid ${r.enabled ? '#21262d' : '#f8514930'}`,
            borderLeft: `3px solid ${r.enabled ? '#3fb950' : '#484f58'}`,
            padding: '10px 14px', opacity: r.enabled ? 1 : 0.5,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#e6edf3', fontFamily: 'monospace' }}>#{r.room_id}</span>
                <span style={{ fontWeight: 600, fontSize: 13, color: '#e6edf3' }}>{r.label || <em style={{ color: '#484f58' }}>（无名）</em>}</span>
                {r.region && <span style={{ fontSize: 9, color: '#8b949e' }}>· {r.region}</span>}
                <span style={{ fontSize: 9, color: '#58a6ff', fontFamily: 'monospace' }}>
                  ({Number.isFinite(r.grid_x) ? r.grid_x : '—'},{Number.isFinite(r.grid_y) ? r.grid_y : '—'})
                </span>
                <span style={{ fontSize: 9, color: '#8b949e' }}>
                  邻接 [{(r.neighbor_ids || []).join(', ') || '—'}]
                </span>
                <span title="仅 /br 旧路径生效" style={{ fontSize: 9, color: '#d29922' }}>cp={r.close_phase}</span>
                {/* 邻接对称性提示（非强制, 仅信息）*/}
                {(() => {
                  const broken = (r.neighbor_ids || []).filter((nid) => !idSet.has(nid))
                  if (broken.length === 0) return null
                  return (
                    <span title={`这些邻接房号不存在: ${broken.join(', ')}`} style={{
                      fontSize: 9, padding: '1px 6px', borderRadius: 6,
                      background: '#f8514920', color: '#f85149', border: '1px solid #f8514940',
                    }}>⚠ 悬空邻接 {broken.length}</span>
                  )
                })()}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={() => toggleEnabled(r)} style={BTN('transparent', '#8b949e', { fontSize: 11, padding: '4px 10px', border: '1px solid #30363d' })}>
                {r.enabled ? '禁用' : '启用'}
              </button>
              <button onClick={() => openEdit(r)} style={BTN('transparent', '#58a6ff', { fontSize: 11, padding: '4px 10px', border: '1px solid rgba(88,166,255,0.3)' })}>编辑</button>
              <button onClick={() => setConfirmDel(r)} style={BTN('rgba(248,81,73,0.15)', '#f85149', { fontSize: 11, padding: '4px 10px', border: '1px solid rgba(248,81,73,0.3)' })}>删除</button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>
            {search || regionFilter !== 'all' ? '没有匹配的房间' : '还没有房间，点击右上角添加'}
          </div>
        )}
      </div>

      {confirmDel && (
        <Modal open={true} title="确认删除" onClose={() => setConfirmDel(null)}>
          <p style={{ color: '#e6edf3', marginBottom: 16 }}>
            确定删除房间「#{confirmDel.room_id} {confirmDel.label}」？这会改变拓扑版本，仅影响<b>新对局</b>；进行中对局用自己的快照，不受影响。
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setConfirmDel(null)} style={BTN('transparent', '#8b949e', { border: '1px solid #30363d' })}>取消</button>
            <button onClick={() => remove(confirmDel.room_id)} style={BTN('rgba(248,81,73,0.15)', '#f85149', { border: '1px solid rgba(248,81,73,0.3)' })}>删除</button>
          </div>
        </Modal>
      )}

      {modal && edit && (
        <Modal open={true} title={edit.__editing ? `编辑房间 #${edit.room_id}` : '添加房间'} onClose={() => setModal(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LABEL}>room_id（房号）</label>
              <input
                type="number"
                min={1}
                style={{ ...INPUT, opacity: edit.__editing ? 0.6 : 1 }}
                value={edit.room_id}
                disabled={edit.__editing}
                onChange={(e) => setEdit({ ...edit, room_id: Number(e.target.value) || '' })}
                placeholder="≥1 唯一"
              />
              {edit.__editing && <div style={{ fontSize: 10, color: '#484f58', marginTop: 4 }}>主键不可改</div>}
            </div>
            <div>
              <label style={LABEL}>enabled（启用）</label>
              <select style={INPUT} value={edit.enabled ? '1' : '0'} onChange={(e) => setEdit({ ...edit, enabled: e.target.value === '1' })}>
                <option value="1">启用</option>
                <option value="0">禁用</option>
              </select>
            </div>
            <div>
              <label style={LABEL}>label（房名）</label>
              <input style={INPUT} value={edit.label || ''} onChange={(e) => setEdit({ ...edit, label: e.target.value })} placeholder="如 外环维护廊" />
            </div>
            <div>
              <label style={LABEL}>region（区域）</label>
              <input style={INPUT} value={edit.region || ''} onChange={(e) => setEdit({ ...edit, region: e.target.value })} placeholder="如 outer / mid / core" />
            </div>
            <div>
              <label style={LABEL}>grid_x（0-based, 建议 0..{Math.max(0, bounds.gridW - 1)}）</label>
              <input type="number" min={0} style={INPUT} value={edit.grid_x ?? 0} onChange={(e) => setEdit({ ...edit, grid_x: Number(e.target.value) })} />
            </div>
            <div>
              <label style={LABEL}>grid_y（0-based, 建议 0..{Math.max(0, bounds.gridH - 1)}）</label>
              <input type="number" min={0} style={INPUT} value={edit.grid_y ?? 0} onChange={(e) => setEdit({ ...edit, grid_y: Number(e.target.value) })} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={LABEL}>neighbor_ids（邻接房号, 逗号分隔, 对称性自负）</label>
              <input
                style={{ ...INPUT, fontFamily: 'monospace' }}
                value={neighborStr}
                onChange={(e) => setNeighborStr(e.target.value)}
                placeholder="如 2, 11, 12"
              />
              <div style={{ fontSize: 10, color: '#484f58', marginTop: 4 }}>
                解析为：[{strToNeighbors(neighborStr).join(', ') || '—'}]
                {(() => {
                  const broken = strToNeighbors(neighborStr).filter((nid) => nid !== edit.room_id && !idSet.has(nid))
                  if (broken.length === 0) return null
                  return <span style={{ color: '#d29922', marginLeft: 8 }}>· ⚠ 不存在的房号: {broken.join(', ')}</span>
                })()}
              </div>
            </div>
            <div>
              <label style={LABEL}>close_phase（1-5, 仅 /br 旧路径）</label>
              <input type="number" min={1} max={5} style={INPUT} value={edit.close_phase ?? 5} onChange={(e) => setEdit({ ...edit, close_phase: Number(e.target.value) || 5 })} />
              <div style={{ fontSize: 10, color: '#d29922', marginTop: 4 }}>/game 按 seed 派生，此列不读</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button onClick={() => setModal(false)} style={BTN('transparent', '#8b949e', { border: '1px solid #30363d' })}>取消</button>
            <button onClick={save} style={BTN('#58a6ff', '#fff')}>{edit.__editing ? '保存修改' : '添加'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
