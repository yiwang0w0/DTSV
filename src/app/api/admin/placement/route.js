/**
 * /api/admin/placement — 投放规则写路径（仅管理员 · service_role）。
 *
 * 🔒 phase-56(52b-2c) RLS 收紧联动：placement_rules/npc_placement_rules（+ 候选桥接表）写收到
 *   service_role 后，usePlacementRules 的 saveRule/removeRule 改走这里。
 *   规则表走允许清单（含候选表名映射）；列走白名单；候选 rule_id 服务端强制、weight>0 过滤。
 */
import { NextResponse } from 'next/server'
import { createServerSupabase, getRequestUser } from '@/lib/serverSupabase'
import { isAdmin } from '@/lib/auth'

const PLACEMENT = {
  placement_rules: {
    cand: 'placement_rule_rooms',
    cols: ['entry_kind', 'item_name', 'tier_id', 'count_min', 'count_max', 'max_per_room', 'spawn_phase_min', 'exclusion_group', 'enabled', 'notes'],
  },
  npc_placement_rules: {
    cand: 'npc_placement_rule_rooms',
    cols: ['npc_id', 'count_min', 'count_max', 'max_per_room', 'spawn_phase_min', 'exclusion_group', 'enabled', 'notes'],
  },
}

export async function POST(request) {
  const supabase = createServerSupabase()
  const auth = await getRequestUser(request, supabase)
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!isAdmin(auth.user)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 })

  let body
  try { body = await request.json() } catch { body = {} }
  const { table, op, id, payload, cands } = body
  const t = PLACEMENT[table]
  if (!t) return NextResponse.json({ error: `未知投放表: ${table}` }, { status: 400 })

  try {
    if (op === 'save') {
      const allowed = {}
      for (const k of t.cols) if (payload?.[k] !== undefined) allowed[k] = payload[k]

      let ruleId = id
      if (ruleId != null) {
        const { error } = await supabase.from(table).update(allowed).eq('id', ruleId)
        if (error) throw new Error(error.message)
      } else {
        const { data, error } = await supabase.from(table).insert(allowed).select('id').single()
        if (error) throw new Error(error.message)
        ruleId = data?.id
      }
      if (ruleId == null) return NextResponse.json({ error: '规则保存失败' }, { status: 400 })

      // 候选全量同步：先清后插（rule_id 服务端强制；weight>0 + 去重 br_room_id）
      const { error: delErr } = await supabase.from(t.cand).delete().eq('rule_id', ruleId)
      if (delErr) throw new Error(delErr.message)
      const seen = new Set()
      const rows = (Array.isArray(cands) ? cands : [])
        .map((c) => ({ br_room_id: Number(c.br_room_id), weight: Number(c.weight) }))
        .filter((c) => Number.isFinite(c.br_room_id) && c.weight > 0 && !seen.has(c.br_room_id) && seen.add(c.br_room_id))
        .map((c) => ({ rule_id: ruleId, br_room_id: c.br_room_id, weight: c.weight }))
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from(t.cand).insert(rows)
        if (insErr) throw new Error(insErr.message)
      }
      return NextResponse.json({ ok: true, id: ruleId })
    }

    if (op === 'delete') {
      if (id == null) return NextResponse.json({ error: '缺少规则 ID' }, { status: 400 })
      const { error } = await supabase.from(table).delete().eq('id', id) // 候选 CASCADE 自动清
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: '未知动作' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error.message || '操作失败' }, { status: 400 })
  }
}
