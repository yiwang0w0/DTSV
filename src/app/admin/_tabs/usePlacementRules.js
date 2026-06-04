'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'

/* 投放规则共享 hook —「实体为中心 · 全图分布」模型的 CRUD + 候选房同步。
 * ─ RoomItemsTab（道具/装备双形）与 NpcPlacementTab（NPC 单形）逐字共用本逻辑；两者仅差
 *   表名、payload 形状、缺表提示、规则展示名。差异全部经参数注入，行为与原两文件等价。
 * ─ 规则表 + 候选表（rule_id → [{br_room_id, weight}]）。保存时候选「先清后插」：
 *   delete(eq rule_id) 再 insert 全量（CHECK weight>0，去重 br_room_id，升序）——照旧不变。
 * ─ 直连 supabase（RLS 关·authenticated 全权）。缺表（migration 未跑）静默降级 + toast 提示而非崩。
 *
 * 参数：
 *   tableName        规则表名（如 'placement_rules' / 'npc_placement_rules'）
 *   roomsTableName   房间表名（'br_rooms'）
 *   candTableName    候选表名（如 'placement_rule_rooms' / 'npc_placement_rule_rooms'）
 *   buildPayload(r)  从本地规则态构出写库 payload 的实体专属字段（XOR / npc_id 等）；
 *                    公共字段（count_min·count_max·max_per_room·spawn_phase_min·exclusion_group·enabled·notes）由本 hook 注。
 *   validate(r)      前端预校验，返回错误文案字符串则中止保存（友好 toast 而非 DB 报错）；无误返回 null。
 *   makeEmptyRule()  新增时的空壳（含实体专属默认 + 公共默认 + __cands:[]）。
 *   loadExtra        额外并行查询数组 [{ key, query }]，结果以 key 暴露在返回的 extra 上（如 itemPool/tiers/npcPool）。
 *   missingTableMsg  缺表提示文案（phase-36 / phase-38）。
 *   missingTableRe   判定「规则表缺失」的正则（matches → 用 missingTableMsg）。
 *   loadFailMsg      其它加载失败前缀（如 '加载投放规则失败: '）。
 */
export function usePlacementRules({
  toast,
  tableName,
  roomsTableName = 'br_rooms',
  candTableName,
  buildPayload,
  validate,
  makeEmptyRule,
  loadExtra = [],
  missingTableMsg,
  missingTableRe,
  loadFailMsg,
}) {
  const [rooms, setRooms] = useState([])
  const [rules, setRules] = useState([])          // 本地编辑态（含 __cands / __dirty / __isNew）
  const [extra, setExtra] = useState({})          // 额外查询结果（itemPool/tiers/npcPool 等）
  const [loading, setLoading] = useState(true)
  const [confirmDelId, setConfirmDelId] = useState(null)   // 用规则 id（或 'new-<idx>'）做确认键

  // ── 初始加载：并行（缺表静默降级，不崩 UI）──
  async function loadAll() {
    setLoading(true)
    setConfirmDelId(null)
    const extraKeys = loadExtra.map((e) => e.key)
    const [rRooms, rRules, rCands, ...rExtra] = await Promise.all([
      supabase.from(roomsTableName).select('room_id,label,region,grid_x,grid_y,enabled').order('room_id'),
      supabase.from(tableName).select('*').order('id'),
      supabase.from(candTableName).select('*'),
      ...loadExtra.map((e) => e.query()),
    ])
    setRooms(rRooms.data || [])

    const extraObj = {}
    extraKeys.forEach((k, i) => { extraObj[k] = rExtra[i]?.data || [] })
    setExtra(extraObj)

    // 候选归并：rule_id → [{br_room_id, weight}]（升序）
    const candByRule = new Map()
    for (const rr of (rCands.data || [])) {
      const k = Number(rr.rule_id)
      if (!candByRule.has(k)) candByRule.set(k, [])
      candByRule.get(k).push({ br_room_id: Number(rr.br_room_id), weight: Number(rr.weight) })
    }
    for (const list of candByRule.values()) list.sort((a, b) => a.br_room_id - b.br_room_id)

    setRules((rRules.data || []).map((rule) => ({
      ...rule,
      __isNew: false, __dirty: false,
      __cands: candByRule.get(Number(rule.id)) || [],
    })))
    setLoading(false)

    // 规则表 / 候选表 可能尚未建表（SQL migration 未跑）→ 提示而非崩
    if (rRules.error || rCands.error) {
      const msg = (rRules.error || rCands.error).message || ''
      if (missingTableRe.test(msg)) {
        toast(missingTableMsg, 'error')
      } else {
        toast(loadFailMsg + msg, 'error')
      }
    }
    const baseErr = [rRooms, ...rExtra].find((r) => r.error)
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
    setRules((rs) => [makeEmptyRule(), ...rs])   // 置顶，便于立即编辑
    setConfirmDelId(null)
  }

  // ── 存盘单条规则（规则 upsert + 候选全量同步）──
  async function saveRule(idx) {
    const r = rules[idx]
    // 前端预校验（与 CHECK 同形，给友好 toast 而非 DB 报错）
    const vErr = validate(r)
    if (vErr) { toast(vErr, 'error'); return }

    const cMin = Math.max(0, Math.floor(Number(r.count_min) || 0))
    const cMax = Math.max(cMin, Math.floor(Number(r.count_max) || 0))   // 钳 min<=max
    const grpRaw = (r.exclusion_group ?? '').trim()
    const payload = {
      ...buildPayload(r),                                                  // 实体专属字段（XOR / npc_id）
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
      const { data, error } = await supabase.from(tableName).insert(payload).select('id').single()
      if (error) { toast('添加规则失败: ' + error.message, 'error'); return }
      ruleId = data.id
    } else {
      const { error } = await supabase.from(tableName).update(payload).eq('id', r.id)
      if (error) { toast('更新规则失败: ' + error.message, 'error'); return }
    }

    // 候选全量同步：先清后插（CASCADE 不触发；这里仅清本规则候选）
    const { error: delErr } = await supabase.from(candTableName).delete().eq('rule_id', ruleId)
    if (delErr) { toast('候选清理失败: ' + delErr.message, 'error'); return }
    const rows = candRows(ruleId)
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from(candTableName).insert(rows)
      if (insErr) { toast('候选写入失败: ' + insErr.message, 'error'); return }
    }

    toast(r.__isNew ? '规则已添加' : '规则已更新')
    loadAll()   // 重拉，清 dirty/new、拿回 DB id 与候选
  }

  // ── 删规则（inline 两步确认；CASCADE 自动清候选）──
  async function removeRule(idx) {
    const r = rules[idx]
    if (r.__isNew) { setRules((rs) => rs.filter((_, i) => i !== idx)); setConfirmDelId(null); return }  // 未落库直接丢
    const { error } = await supabase.from(tableName).delete().eq('id', r.id)
    if (error) { toast('删除失败: ' + error.message, 'error'); return }
    toast('规则已删除')
    setConfirmDelId(null)
    loadAll()
  }

  return {
    rooms, rules, extra, loading,
    confirmDelId, setConfirmDelId,
    groupSuggestions,
    patchRule, addRule, saveRule, removeRule,
  }
}
