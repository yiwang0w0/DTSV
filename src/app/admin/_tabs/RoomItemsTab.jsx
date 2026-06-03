'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { BTN, INPUT, LABEL, C } from '../_shared/ui'

/* 地图编辑器 Phase 3 §4: 房间投放 tab（新 RoomItemsTab）
 * - 按房名选房 → 编辑该房 room_items（authored 投放）。直连 supabase（RLS 关·authenticated 全权）。
 * - 行内编辑：类型(item/equipment_tier) · 物品/装备按名选 · 固定 · 随机 min-max · 概率% · 几禁 · 启用 · 保存 · 删除。
 * - 几禁期望预览：开局可见期望 + 末路期望，末路超 ROOM_INV_CAP 黄字提示。
 * - 写库严格符合 phase-34 CHECK：entry_kind XOR item_name/tier_id · counts 非负 · min<=max · chance∈[0,1] · spawn_phase_min>=0。
 * - equipment_tiers 只读（仅选 tier_id，绝不 UPDATE）；item_pool.name 已有 UNIQUE，存名安全。
 * - 不碰 RoomsEditorTab（A 负责）。
 */

const MAX_PHASE = 5        // = MAX_CLOSE_PHASE（src/lib/server/br/forbidden.js）；spawn_phase_min 下拉 0..5
const ROOM_INV_CAP = 24    // 设计 §3 红线④：单房库存上限（消费端硬封顶）

export default function RoomItemsTab({ toast }) {
  const [rooms, setRooms] = useState([])
  const [itemPool, setItemPool] = useState([])
  const [tiers, setTiers] = useState([])
  const [loading, setLoading] = useState(true)
  const [roomSearch, setRoomSearch] = useState('')
  const [selectedRoomId, setSelectedRoomId] = useState(null)
  const [rows, setRows] = useState([])
  const [rowsLoading, setRowsLoading] = useState(false)
  const [confirmDelIdx, setConfirmDelIdx] = useState(null)

  // ── 初始加载：三表并行（br_rooms 选房 / item_pool 道具源 / equipment_tiers 装备源·只读）──
  useEffect(() => {
    async function loadStatic() {
      const [r1, r2, r3] = await Promise.all([
        supabase.from('br_rooms').select('room_id,label,region,enabled').order('room_id'),
        supabase.from('item_pool').select('id,name,kind').order('name'),
        supabase.from('equipment_tiers').select('id,name,rarity,tier,series_id').order('series_id').order('tier'),
      ])
      setRooms(r1.data || [])
      setItemPool(r2.data || [])
      setTiers(r3.data || [])
      setLoading(false)
      const err = [r1, r2, r3].find((r) => r.error)
      if (err) toast('加载失败: ' + err.error.message, 'error')
    }
    loadStatic()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 选房后拉该房投放行 ──
  async function loadRows(roomId) {
    setRowsLoading(true)
    setConfirmDelIdx(null)
    const { data, error } = await supabase
      .from('room_items')
      .select('*')
      .eq('br_room_id', roomId)
      .order('id')
    if (error) toast('加载投放失败: ' + error.message, 'error')
    setRows((data || []).map((r) => ({ ...r, __dirty: false, __isNew: false })))
    setRowsLoading(false)
  }

  function selectRoom(roomId) {
    setSelectedRoomId(roomId)
    loadRows(roomId)
  }

  const filteredRooms = rooms.filter((r) =>
    !roomSearch
    || (r.label || '').includes(roomSearch)
    || (r.region || '').includes(roomSearch)
    || String(r.room_id).includes(roomSearch)
  )

  const selectedRoom = rooms.find((r) => r.room_id === selectedRoomId)

  // ── 几禁期望预览（仅计 enabled !== false 的行）──
  const preview = useMemo(() => {
    function rowExpected(r) {
      const chance = Number(r.random_chance ?? 1)
      const fixed = Number(r.fixed_count || 0)
      const rmin = Number(r.random_min || 0)
      const rmax = Number(r.random_max || 0)
      return chance * (fixed + (rmin + rmax) / 2)
    }
    let openExp = 0
    let endExp = 0
    for (const r of rows) {
      if (r.enabled === false) continue
      const exp = rowExpected(r)
      endExp += exp
      if (Number(r.spawn_phase_min ?? 0) <= 0) openExp += exp
    }
    return { openExp, endExp, overCap: endExp > ROOM_INV_CAP }
  }, [rows])

  // ── 行编辑纯本地方法（改本地 rows，存盘时才落库）──
  function patchRow(idx, patch) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch, __dirty: true } : r)))
  }

  function addRow() {
    setRows((rs) => [
      ...rs,
      {
        id: null, __isNew: true, __dirty: true,
        br_room_id: selectedRoomId, entry_kind: 'item',
        item_name: itemPool[0]?.name ?? null, tier_id: null,
        fixed_count: 1, random_min: 0, random_max: 0, random_chance: 1, spawn_phase_min: 0,
        enabled: true, notes: null,
      },
    ])
  }

  // 切类型时清对侧引用、设本侧默认（满足 XOR CHECK）
  function switchKind(idx, kind) {
    patchRow(idx, kind === 'item'
      ? { entry_kind: 'item', item_name: itemPool[0]?.name ?? null, tier_id: null }
      : { entry_kind: 'equipment_tier', tier_id: tiers[0]?.id ?? null, item_name: null })
  }

  // ── 存盘单行 ──
  async function saveRow(idx) {
    const r = rows[idx]
    // 前端预校验（与 CHECK 同形，给友好 toast 而非 DB 报错）
    if (r.entry_kind === 'item' && !r.item_name) { toast('请选择道具', 'error'); return }
    if (r.entry_kind === 'equipment_tier' && !r.tier_id) { toast('请选择装备阶', 'error'); return }
    if (Number(r.random_min) > Number(r.random_max)) { toast('随机下界不能大于上界', 'error'); return }
    const chance = Math.max(0, Math.min(1, Number(r.random_chance)))   // 钳 [0,1]
    const payload = {
      br_room_id: selectedRoomId,
      entry_kind: r.entry_kind,
      item_name: r.entry_kind === 'item' ? r.item_name : null,            // XOR：对侧强制 null
      tier_id: r.entry_kind === 'equipment_tier' ? Number(r.tier_id) : null,
      fixed_count: Math.max(0, Number(r.fixed_count) || 0),
      random_min: Math.max(0, Number(r.random_min) || 0),
      random_max: Math.max(0, Number(r.random_max) || 0),
      random_chance: chance,
      spawn_phase_min: Math.max(0, Number(r.spawn_phase_min) || 0),
      enabled: !!r.enabled,
      notes: r.notes || null,
    }
    if (r.__isNew) {
      const { error } = await supabase.from('room_items').insert(payload)
      if (error) { toast('添加失败: ' + error.message, 'error'); return }
      toast('投放已添加')
    } else {
      const { error } = await supabase.from('room_items').update(payload).eq('id', r.id)
      if (error) { toast('更新失败: ' + error.message, 'error'); return }
      toast('投放已更新')
    }
    loadRows(selectedRoomId)   // 重拉，清 dirty/new、拿回 DB id
  }

  // ── 删行（仿 ItemsTab inline 两步确认）──
  async function removeRow(idx) {
    const r = rows[idx]
    if (r.__isNew) { setRows((rs) => rs.filter((_, i) => i !== idx)); setConfirmDelIdx(null); return }  // 未落库直接丢
    const { error } = await supabase.from('room_items').delete().eq('id', r.id)
    if (error) { toast('删除失败: ' + error.message, 'error'); return }
    toast('投放已删除')
    setConfirmDelIdx(null)
    loadRows(selectedRoomId)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.dim }}>加载中...</div>

  return (
    <div>
      {/* ── 标题区 ── */}
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: C.text }}>🎯 房间投放</h3>
        <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.6 }}>
          按房声明 authored 投放；开局确定性铺货，搜到即发、取走不再生。装备只读选阶。
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>
        {/* ── 选房区 ── */}
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
          <input
            placeholder="搜索房名 / 区域 / 房号..."
            value={roomSearch}
            onChange={(e) => setRoomSearch(e.target.value)}
            style={{ ...INPUT, marginBottom: 8 }}
          />
          <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filteredRooms.map((r) => {
              const sel = r.room_id === selectedRoomId
              return (
                <button
                  key={r.room_id}
                  onClick={() => selectRoom(r.room_id)}
                  style={{
                    textAlign: 'left', padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${sel ? C.accent : C.border}`,
                    background: sel ? 'rgba(88,166,255,0.12)' : 'transparent',
                    color: sel ? C.accent : C.text,
                    opacity: r.enabled === false ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{r.label || `#${r.room_id}`}</span>
                  {r.region && <span style={{ fontSize: 9, color: C.dim }}>· {r.region}</span>}
                  <span style={{ fontSize: 9, color: C.dim, fontFamily: 'monospace', marginLeft: 'auto' }}>#{r.room_id}</span>
                </button>
              )
            })}
            {filteredRooms.length === 0 && (
              <div style={{ textAlign: 'center', padding: 24, color: C.dim, fontSize: 12 }}>没有匹配的房间</div>
            )}
          </div>
        </div>

        {/* ── 投放编辑区 ── */}
        <div>
          {!selectedRoom ? (
            <div style={{ textAlign: 'center', padding: 60, color: C.dim }}>请先选择房间</div>
          ) : (
            <div>
              {/* 选中房标题 + 几禁预览 */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>
                  {selectedRoom.label || `#${selectedRoom.room_id}`}
                  {selectedRoom.region && <span style={{ fontSize: 11, color: C.dim, fontWeight: 400 }}>（{selectedRoom.region}）</span>}
                  <span style={{ fontSize: 11, color: C.dim, fontWeight: 400, fontFamily: 'monospace', marginLeft: 6 }}>· #{selectedRoomId}</span>
                </div>
                <div style={{
                  fontSize: 12, color: C.dim, padding: '8px 12px', borderRadius: 6,
                  background: C.bg2, border: `1px solid ${C.border}`,
                }}>
                  预计 开局 ~<b style={{ color: C.green }}>{preview.openExp.toFixed(1)}</b> 件 · 末路 ~<b style={{ color: C.accent }}>{preview.endExp.toFixed(1)}</b> 件
                  {preview.overCap && (
                    <span style={{ color: C.yellow, marginLeft: 10 }}>
                      ⚠ 末路期望超单房上限 {ROOM_INV_CAP}，铺货时会被截断
                    </span>
                  )}
                </div>
              </div>

              {/* 投放行区 */}
              {rowsLoading ? (
                <div style={{ padding: 30, textAlign: 'center', color: C.dim }}>加载中...</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rows.map((r, idx) => {
                    const isConf = confirmDelIdx === idx
                    return (
                      <div
                        key={r.id ?? `new-${idx}`}
                        style={{
                          background: C.bg2, borderRadius: 8,
                          border: `1px solid ${C.border}`,
                          borderLeft: `3px solid ${r.__dirty ? C.yellow : C.border2}`,
                          padding: '10px 12px',
                          display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8,
                        }}
                      >
                        {/* 类型 */}
                        <div>
                          <label style={{ ...LABEL, marginBottom: 3 }}>类型</label>
                          <select
                            style={{ ...INPUT, width: 120, padding: '6px 8px' }}
                            value={r.entry_kind}
                            onChange={(e) => switchKind(idx, e.target.value)}
                          >
                            <option value="item">道具</option>
                            <option value="equipment_tier">装备阶</option>
                          </select>
                        </div>

                        {/* 物品 / 装备（按 entry_kind 切）*/}
                        <div style={{ flex: 1, minWidth: 180 }}>
                          {r.entry_kind === 'item' ? (
                            <>
                              <label style={{ ...LABEL, marginBottom: 3 }}>道具</label>
                              <select
                                style={{ ...INPUT, padding: '6px 8px' }}
                                value={r.item_name || ''}
                                onChange={(e) => patchRow(idx, { item_name: e.target.value })}
                              >
                                {!r.item_name && <option value="">— 选择道具 —</option>}
                                {itemPool.map((i) => (
                                  <option key={i.id} value={i.name}>{i.name}（{i.kind}）</option>
                                ))}
                              </select>
                            </>
                          ) : (
                            <>
                              <label style={{ ...LABEL, marginBottom: 3 }}>装备阶</label>
                              <select
                                style={{ ...INPUT, padding: '6px 8px' }}
                                value={r.tier_id || ''}
                                onChange={(e) => patchRow(idx, { tier_id: Number(e.target.value) })}
                              >
                                {!r.tier_id && <option value="">— 选择装备阶 —</option>}
                                {tiers.map((t) => (
                                  <option key={t.id} value={t.id}>{t.name} · {t.rarity} · T{t.tier}</option>
                                ))}
                              </select>
                            </>
                          )}
                        </div>

                        {/* 固定 */}
                        <div>
                          <label style={{ ...LABEL, marginBottom: 3 }}>固定</label>
                          <input
                            type="number" min={0}
                            style={{ ...INPUT, width: 60, padding: '6px 8px' }}
                            value={r.fixed_count}
                            onChange={(e) => patchRow(idx, { fixed_count: Number(e.target.value) })}
                          />
                        </div>

                        {/* 随机 min–max */}
                        <div>
                          <label style={{ ...LABEL, marginBottom: 3 }}>随机区间</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input
                              type="number" min={0}
                              style={{ ...INPUT, width: 56, padding: '6px 8px' }}
                              value={r.random_min}
                              onChange={(e) => patchRow(idx, { random_min: Number(e.target.value) })}
                            />
                            <span style={{ color: C.dim, fontSize: 12 }}>–</span>
                            <input
                              type="number" min={0}
                              style={{ ...INPUT, width: 56, padding: '6px 8px' }}
                              value={r.random_max}
                              onChange={(e) => patchRow(idx, { random_max: Number(e.target.value) })}
                            />
                          </div>
                        </div>

                        {/* 概率 %（UI 0-100 ↔ 存 0-1）*/}
                        <div>
                          <label style={{ ...LABEL, marginBottom: 3 }}>概率%</label>
                          <input
                            type="number" min={0} max={100}
                            style={{ ...INPUT, width: 64, padding: '6px 8px' }}
                            value={Math.round((r.random_chance ?? 1) * 100)}
                            onChange={(e) => patchRow(idx, { random_chance: (Number(e.target.value) || 0) / 100 })}
                          />
                        </div>

                        {/* 几禁 */}
                        <div>
                          <label style={{ ...LABEL, marginBottom: 3 }}>几禁<span style={{ color: C.dim2, marginLeft: 3 }}>越晚越肥</span></label>
                          <select
                            style={{ ...INPUT, width: 110, padding: '6px 8px' }}
                            value={r.spawn_phase_min ?? 0}
                            onChange={(e) => patchRow(idx, { spawn_phase_min: Number(e.target.value) })}
                          >
                            {Array.from({ length: MAX_PHASE + 1 }).map((_, p) => (
                              <option key={p} value={p}>{p === 0 ? '0（开局可见）' : `${p} 禁后`}</option>
                            ))}
                          </select>
                        </div>

                        {/* 启用 */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.dim, cursor: 'pointer', paddingBottom: 8 }}>
                          <input
                            type="checkbox"
                            checked={!!r.enabled}
                            onChange={(e) => patchRow(idx, { enabled: e.target.checked })}
                          />
                          启用
                        </label>

                        {/* 操作 */}
                        <div style={{ display: 'flex', gap: 6, paddingBottom: 4 }}>
                          <button
                            onClick={() => saveRow(idx)}
                            style={BTN('#58a6ff', '#fff', { fontSize: 11, padding: '6px 12px' })}
                          >
                            保存
                          </button>
                          {isConf ? (
                            <>
                              <button onClick={() => removeRow(idx)} style={BTN('rgba(248,81,73,0.15)', '#f85149', { fontSize: 11, padding: '6px 10px', border: '1px solid rgba(248,81,73,0.3)' })}>确认</button>
                              <button onClick={() => setConfirmDelIdx(null)} style={BTN('transparent', '#8b949e', { fontSize: 11, padding: '6px 10px', border: '1px solid #30363d' })}>取消</button>
                            </>
                          ) : (
                            <button onClick={() => setConfirmDelIdx(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.dim2, fontSize: 15, padding: '2px 4px' }}>🗑️</button>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {rows.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 30, color: C.dim, fontSize: 12 }}>该房暂无投放，点击下方添加</div>
                  )}

                  <div>
                    <button onClick={addRow} disabled={!selectedRoomId} style={BTN('#58a6ff', '#fff', { opacity: selectedRoomId ? 1 : 0.5 })}>+ 添加投放</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
