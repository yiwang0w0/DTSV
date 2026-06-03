'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { BTN, INPUT, LABEL, C, NPC_LEVEL_META } from '../_shared/ui'
import CandidateRoomPicker from './CandidateRoomPicker'

/* Phase 38 敌人投放 tab —「NPC 为中心 · 全图分布」模型（克隆自 RoomItemsTab）
 * ─ 与房间投放(placement_rules)平行范式，但实体为 NPC 单形（无 item/equipment 双形）。
 * ─ 模型：一条规则 = 一个敌人(npc_pool) + 一组候选房（带权）+ 全图投放只数 [count_min, count_max]。
 *   分配在服务端 initBrRoomLayer 用确定性 PRNG(allocateRoomNpcs · hashSeed(seed,'npcplace:'+rule.id))
 *   从候选里加权无放回抽样 → gamevars.br.roomNpcs 快照（每房 [[npcId,revealPhase],…]）。
 * ─ 本 tab 两区：
 *   ① 规则中心（主）：列 npc_placement_rules，每条一卡 — 敌人按名 + 候选房多选(权重) +
 *      数量[min,max] + 几禁(越晚越肥) + 互斥组 + 启用 + 保存/删（候选不足黄字警告）。
 *   ② 按房只读派生（次）：选一房 → 派生「这房作为候选的规则」，只读，引导去规则中心编辑。
 * ─ 直连 supabase CRUD（RLS 关·authenticated 全权）。写库严格符合 phase-38 CHECK：
 *   npc_id NOT NULL · count_min<=count_max · max_per_room>=1 ·
 *   spawn_phase_min>=0 · npc_placement_rule_rooms.weight>0。
 * ─ npc_pool 只读（仅选 npc_id，绝不 UPDATE）。
 * ─ 不碰 server/SQL/RoomItemsTab；CandidateRoomPicker 复用（NPC 候选房与道具完全一致）；page.js tab 已注册。
 */

const MAX_PHASE = 5        // = MAX_CLOSE_PHASE（src/lib/server/br/forbidden.js）；spawn_phase_min 下拉 0..5

// 一条规则在本地编辑态的空壳（__cands = [{br_room_id, weight}] 候选；__isNew 标未落库）
function emptyRule(npcPool) {
  return {
    id: null, __isNew: true, __dirty: true,
    npc_id: npcPool[0]?.id ?? null,
    count_min: 1, count_max: 1, max_per_room: 1,
    spawn_phase_min: 0,
    exclusion_group: null,
    enabled: true,
    notes: null,
    __cands: [],
  }
}

export default function NpcPlacementTab({ toast }) {
  const [rooms, setRooms] = useState([])
  const [npcPool, setNpcPool] = useState([])
  const [rules, setRules] = useState([])          // 本地编辑态（含 __cands / __dirty / __isNew）
  const [loading, setLoading] = useState(true)
  const [confirmDelId, setConfirmDelId] = useState(null)   // 用规则 id（或 'new-<idx>'）做确认键

  // ── 按房只读区状态 ──
  const [roomSearch, setRoomSearch] = useState('')
  const [selectedRoomId, setSelectedRoomId] = useState(null)

  // ── 初始加载：四查并行（缺表静默降级，不崩 UI）──
  async function loadAll() {
    setLoading(true)
    setConfirmDelId(null)
    const [r1, r2, r3, r4] = await Promise.all([
      supabase.from('br_rooms').select('room_id,label,region,grid_x,grid_y,enabled').order('room_id'),
      supabase.from('npc_pool').select('id,name,level,hp,atk,def').order('id'),
      supabase.from('npc_placement_rules').select('*').order('id'),
      supabase.from('npc_placement_rule_rooms').select('*'),
    ])
    setRooms(r1.data || [])
    setNpcPool(r2.data || [])

    // 候选归并：rule_id → [{br_room_id, weight}]（升序）
    const candByRule = new Map()
    for (const rr of (r4.data || [])) {
      const k = Number(rr.rule_id)
      if (!candByRule.has(k)) candByRule.set(k, [])
      candByRule.get(k).push({ br_room_id: Number(rr.br_room_id), weight: Number(rr.weight) })
    }
    for (const list of candByRule.values()) list.sort((a, b) => a.br_room_id - b.br_room_id)

    setRules((r3.data || []).map((rule) => ({
      ...rule,
      __isNew: false, __dirty: false,
      __cands: candByRule.get(Number(rule.id)) || [],
    })))
    setLoading(false)

    // npc_placement_rules / npc_placement_rule_rooms 可能尚未建表（SQL migration 未跑）→ 提示而非崩
    if (r3.error || r4.error) {
      const msg = (r3.error || r4.error).message || ''
      if (/relation .* does not exist|npc_placement/i.test(msg)) {
        toast('敌人投放规则表尚未建立（请先跑 phase-38 migration）', 'error')
      } else {
        toast('加载敌人投放规则失败: ' + msg, 'error')
      }
    }
    const baseErr = [r1, r2].find((r) => r.error)
    if (baseErr) toast('加载基础数据失败: ' + baseErr.error.message, 'error')
  }

  useEffect(() => { loadAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 已用过的互斥组名（datalist 建议）
  const groupSuggestions = useMemo(() => {
    const set = new Set()
    for (const r of rules) {
      const g = (r.exclusion_group ?? '').trim()
      if (g) set.add(g)
    }
    return Array.from(set).sort()
  }, [rules])

  // ── 本地编辑（改 rules，存盘时才落库）──
  function patchRule(idx, patch) {
    setRules((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch, __dirty: true } : r)))
  }

  function addRule() {
    setRules((rs) => [emptyRule(npcPool), ...rs])   // 置顶，便于立即编辑
    setConfirmDelId(null)
  }

  // ── 存盘单条规则（规则 upsert + 候选全量同步）──
  async function saveRule(idx) {
    const r = rules[idx]
    // 前端预校验（与 CHECK 同形，给友好 toast 而非 DB 报错）
    if (r.npc_id == null) { toast('请选择敌人', 'error'); return }

    const cMin = Math.max(0, Math.floor(Number(r.count_min) || 0))
    const cMax = Math.max(cMin, Math.floor(Number(r.count_max) || 0))   // 钳 min<=max
    const grpRaw = (r.exclusion_group ?? '').trim()
    const payload = {
      npc_id: Number(r.npc_id),
      count_min: cMin,
      count_max: cMax,
      max_per_room: 1,                                                     // 本期固定 1（CHECK max_per_room>=1）
      spawn_phase_min: Math.max(0, Math.floor(Number(r.spawn_phase_min) || 0)),
      exclusion_group: grpRaw === '' ? null : grpRaw,                      // 空串→null（不互斥）
      enabled: !!r.enabled,
      notes: r.notes || null,
    }

    // 候选：仅 weight>0（CHECK weight>0），去重 br_room_id，升序
    const candMap = new Map()
    for (const c of (r.__cands || [])) {
      const rid = Number(c.br_room_id)
      const w = Number(c.weight)
      if (!Number.isFinite(rid)) continue
      if (!(w > 0)) continue
      candMap.set(rid, w)   // 后者覆盖（理论无重复）
    }
    const candRows = (id) => Array.from(candMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([br_room_id, weight]) => ({ rule_id: id, br_room_id, weight }))

    let ruleId = r.id
    if (r.__isNew) {
      const { data, error } = await supabase.from('npc_placement_rules').insert(payload).select('id').single()
      if (error) { toast('添加规则失败: ' + error.message, 'error'); return }
      ruleId = data.id
    } else {
      const { error } = await supabase.from('npc_placement_rules').update(payload).eq('id', r.id)
      if (error) { toast('更新规则失败: ' + error.message, 'error'); return }
    }

    // 候选全量同步：先清后插（CASCADE 不触发；这里仅清本规则候选）
    const { error: delErr } = await supabase.from('npc_placement_rule_rooms').delete().eq('rule_id', ruleId)
    if (delErr) { toast('候选清理失败: ' + delErr.message, 'error'); return }
    const rows = candRows(ruleId)
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from('npc_placement_rule_rooms').insert(rows)
      if (insErr) { toast('候选写入失败: ' + insErr.message, 'error'); return }
    }

    toast(r.__isNew ? '规则已添加' : '规则已更新')
    loadAll()   // 重拉，清 dirty/new、拿回 DB id 与候选
  }

  // ── 删规则（inline 两步确认；CASCADE 自动清候选）──
  async function removeRule(idx) {
    const r = rules[idx]
    if (r.__isNew) { setRules((rs) => rs.filter((_, i) => i !== idx)); setConfirmDelId(null); return }  // 未落库直接丢
    const { error } = await supabase.from('npc_placement_rules').delete().eq('id', r.id)
    if (error) { toast('删除失败: ' + error.message, 'error'); return }
    toast('规则已删除')
    setConfirmDelId(null)
    loadAll()
  }

  // 规则展示名（NPC 名）
  function ruleLabel(r) {
    return npcPool.find((n) => n.id === Number(r.npc_id))?.name ?? '（未选敌人）'
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.dim }}>加载中...</div>

  const filteredRooms = rooms.filter((r) =>
    !roomSearch
    || (r.label || '').includes(roomSearch)
    || (r.region || '').includes(roomSearch)
    || String(r.room_id).includes(roomSearch),
  )

  return (
    <div>
      {/* ── 标题区 ── */}
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: C.text }}>👹 敌人投放</h3>
        <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.6 }}>
          NPC 为中心 · 全图分布。每条规则 = 一个敌人 + 一组候选房（带权）+ 全图投放只数 [下界, 上界]。
          开局确定性分配（同对局 seed → 同结果），从候选里加权无放回抽样。互斥组保证同组敌人落到不同房。
        </div>
      </div>

      {/* ══════ ① 规则中心（主区）══════ */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>规则中心 <span style={{ fontSize: 11, color: C.dim, fontWeight: 400 }}>· {rules.length} 条</span></div>
        <button onClick={addRule} style={BTN('#58a6ff', '#fff')}>+ 新增规则</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rules.map((r, idx) => {
          const confKey = r.id ?? `new-${idx}`
          const isConf = confirmDelId === confKey
          // 欠铺警告：count_min > 有效候选数（weight>0）
          const validCandCount = (r.__cands || []).filter((c) => Number(c.weight) > 0).length
          const under = Math.max(0, Math.floor(Number(r.count_min) || 0)) > validCandCount
          return (
            <div
              key={confKey}
              style={{
                background: C.bg2, borderRadius: 10,
                border: `1px solid ${C.border}`,
                borderLeft: `3px solid ${r.__dirty ? C.yellow : (r.enabled ? C.green : C.dim2)}`,
                padding: 14,
              }}
            >
              {/* 卡头：展示名 + 启用 + 操作 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                  👹 {ruleLabel(r)}
                </span>
                {r.__isNew && <span style={{ fontSize: 10, color: C.yellow, border: `1px solid ${C.yellow}`, borderRadius: 5, padding: '1px 6px' }}>未保存</span>}
                {!r.enabled && <span style={{ fontSize: 10, color: C.dim2, border: `1px solid ${C.dim2}`, borderRadius: 5, padding: '1px 6px' }}>已禁用</span>}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.dim, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!r.enabled} onChange={(e) => patchRule(idx, { enabled: e.target.checked })} />
                    启用
                  </label>
                  <button onClick={() => saveRule(idx)} style={BTN('#58a6ff', '#fff', { fontSize: 11, padding: '6px 14px' })}>保存</button>
                  {isConf ? (
                    <>
                      <button onClick={() => removeRule(idx)} style={BTN('rgba(248,81,73,0.15)', '#f85149', { fontSize: 11, padding: '6px 10px', border: '1px solid rgba(248,81,73,0.3)' })}>确认</button>
                      <button onClick={() => setConfirmDelId(null)} style={BTN('transparent', '#8b949e', { fontSize: 11, padding: '6px 10px', border: '1px solid #30363d' })}>取消</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDelId(confKey)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.dim2, fontSize: 15, padding: '2px 4px' }}>🗑️</button>
                  )}
                </div>
              </div>

              {/* 配置行：敌人 / 数量 / 几禁 / 互斥组 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10, marginBottom: 12 }}>
                {/* 敌人（单形 · 按名）*/}
                <div style={{ flex: 1, minWidth: 240 }}>
                  <label style={{ ...LABEL, marginBottom: 3 }}>敌人</label>
                  <select
                    style={{ ...INPUT, padding: '6px 8px' }}
                    value={r.npc_id ?? ''}
                    onChange={(e) => patchRule(idx, { npc_id: Number(e.target.value) })}
                  >
                    {r.npc_id == null && <option value="">— 选择敌人 —</option>}
                    {npcPool.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}（{NPC_LEVEL_META[n.level]?.label ?? n.level}·HP{n.hp}/ATK{n.atk}/DEF{n.def}）
                      </option>
                    ))}
                  </select>
                </div>

                {/* 全图只数 min–max */}
                <div>
                  <label style={{ ...LABEL, marginBottom: 3 }}>全图只数<span style={{ color: C.dim2, marginLeft: 3 }}>[下界, 上界]</span></label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="number" min={0}
                      style={{ ...INPUT, width: 56, padding: '6px 8px' }}
                      value={r.count_min}
                      onChange={(e) => patchRule(idx, { count_min: Number(e.target.value) })}
                    />
                    <span style={{ color: C.dim, fontSize: 12 }}>–</span>
                    <input
                      type="number" min={0}
                      style={{ ...INPUT, width: 56, padding: '6px 8px' }}
                      value={r.count_max}
                      onChange={(e) => patchRule(idx, { count_max: Number(e.target.value) })}
                    />
                  </div>
                </div>

                {/* 几禁 */}
                <div>
                  <label style={{ ...LABEL, marginBottom: 3 }}>几禁<span style={{ color: C.dim2, marginLeft: 3 }}>越晚越肥</span></label>
                  <select
                    style={{ ...INPUT, width: 120, padding: '6px 8px' }}
                    value={r.spawn_phase_min ?? 0}
                    onChange={(e) => patchRule(idx, { spawn_phase_min: Number(e.target.value) })}
                  >
                    {Array.from({ length: MAX_PHASE + 1 }).map((_, p) => (
                      <option key={p} value={p}>{p === 0 ? '0（开局可见）' : `${p} 禁后`}</option>
                    ))}
                  </select>
                </div>

                {/* 互斥组 */}
                <div>
                  <label style={{ ...LABEL, marginBottom: 3 }}>互斥组<span style={{ color: C.dim2, marginLeft: 3 }}>空=不互斥</span></label>
                  <input
                    list="npc-placement-excl-groups"
                    style={{ ...INPUT, width: 140, padding: '6px 8px' }}
                    value={r.exclusion_group ?? ''}
                    onChange={(e) => patchRule(idx, { exclusion_group: e.target.value })}
                    placeholder="如 boss-core"
                  />
                </div>
              </div>

              {/* 欠铺警告 */}
              {under && (
                <div style={{
                  fontSize: 11, color: C.yellow, marginBottom: 10,
                  background: 'rgba(210,153,34,0.08)', border: `1px solid ${C.yellow}40`,
                  borderRadius: 6, padding: '6px 10px',
                }}>
                  ⚠ 候选不足：当前有效候选 {validCandCount} 房，最多铺 {validCandCount} 只 / 需 {Math.floor(Number(r.count_min) || 0)} 只（下界）。请增加候选房或调低只数。
                </div>
              )}

              {/* 候选房多选 + 权重 */}
              <div>
                <label style={{ ...LABEL, marginBottom: 6 }}>候选房（点格子或列表加入 · 每房可设权重）</label>
                <CandidateRoomPicker
                  rooms={rooms}
                  value={r.__cands || []}
                  onChange={(next) => patchRule(idx, { __cands: next })}
                />
              </div>
            </div>
          )
        })}

        {rules.length === 0 && (
          <div style={{ textAlign: 'center', padding: 36, color: C.dim, fontSize: 12, background: C.bg2, border: `1px dashed ${C.border}`, borderRadius: 10 }}>
            还没有敌人投放规则，点击「+ 新增规则」开始
          </div>
        )}
      </div>

      <datalist id="npc-placement-excl-groups">
        {groupSuggestions.map((g) => <option key={g} value={g} />)}
      </datalist>

      {/* ══════ ② 按房只读派生（次区）══════ */}
      <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>按房查看（只读）</div>
        <div style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>
          选一房，看它作为候选出现在哪些规则里。此处只读，编辑请回上方规则中心。
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>
          {/* 选房区 */}
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
            <input
              placeholder="搜索房名 / 区域 / 房号..."
              value={roomSearch}
              onChange={(e) => setRoomSearch(e.target.value)}
              style={{ ...INPUT, marginBottom: 8 }}
            />
            <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filteredRooms.map((r) => {
                const sel = r.room_id === selectedRoomId
                return (
                  <button
                    key={r.room_id}
                    onClick={() => setSelectedRoomId(r.room_id)}
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

          {/* 派生只读列 */}
          <div>
            {selectedRoomId == null ? (
              <div style={{ textAlign: 'center', padding: 60, color: C.dim }}>请选择房间查看其作为候选的规则</div>
            ) : (() => {
              const sr = rooms.find((r) => r.room_id === selectedRoomId)
              // 该房作为候选的规则（遍历本地 rules.__cands）
              const hits = rules
                .map((rule) => {
                  const c = (rule.__cands || []).find((c) => Number(c.br_room_id) === Number(selectedRoomId))
                  return c ? { rule, weight: c.weight } : null
                })
                .filter(Boolean)
              return (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 10 }}>
                    {sr?.label || `#${selectedRoomId}`}
                    {sr?.region && <span style={{ fontSize: 11, color: C.dim, fontWeight: 400 }}>（{sr.region}）</span>}
                    <span style={{ fontSize: 11, color: C.dim, fontWeight: 400, fontFamily: 'monospace', marginLeft: 6 }}>· #{selectedRoomId}</span>
                  </div>
                  {hits.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: C.dim, fontSize: 12, background: C.bg2, border: `1px dashed ${C.border}`, borderRadius: 8 }}>
                      该房不在任何规则候选中
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {hits.map(({ rule, weight }) => (
                        <div key={rule.id ?? ruleLabel(rule)} style={{
                          background: C.bg2, border: `1px solid ${C.border}`,
                          borderLeft: `3px solid ${rule.enabled ? C.green : C.dim2}`,
                          borderRadius: 8, padding: '10px 12px',
                          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                        }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                            👹 {ruleLabel(rule)}
                          </span>
                          <span style={{ fontSize: 11, color: C.dim }}>只数 [{rule.count_min}, {rule.count_max}]</span>
                          <span style={{ fontSize: 11, color: C.accent }}>本房权重 {weight}</span>
                          <span style={{ fontSize: 11, color: C.dim }}>
                            {Number(rule.spawn_phase_min) > 0 ? `${rule.spawn_phase_min} 禁后` : '开局可见'}
                          </span>
                          {rule.exclusion_group && <span style={{ fontSize: 10, color: C.cyan, border: `1px solid ${C.cyan}40`, borderRadius: 5, padding: '1px 6px' }}>互斥 {rule.exclusion_group}</span>}
                          {!rule.enabled && <span style={{ fontSize: 10, color: C.dim2 }}>（已禁用）</span>}
                        </div>
                      ))}
                      <div style={{ fontSize: 10, color: C.dim2, marginTop: 2 }}>共 {hits.length} 条规则把本房列为候选 · 去上方规则中心编辑</div>
                    </div>
                  )
                  }
                </div>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
