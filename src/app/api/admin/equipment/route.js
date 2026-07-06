/**
 * /api/admin/equipment — 装备系列 / 阶级写路径（仅管理员 · service_role）。
 *
 * 🔒 phase-53(52b)：equipment_series / equipment_tiers 写收到 service_role 后，
 *   EquipmentSeriesSection 的 saveSeries/deleteSeries/saveTier/deleteTier 改走这里。
 *   target 区分表；列走白名单（= 表列去 id/created_at）。
 */
import { NextResponse } from 'next/server'
import { createServerSupabase, getRequestUser } from '@/lib/serverSupabase'
import { isAdmin } from '@/lib/auth'

const TARGETS = {
  series: {
    table: 'equipment_series',
    cols: ['name', 'slot', 'description', 'icon', 'max_tier', 'unlock_condition'],
  },
  tier: {
    table: 'equipment_tiers',
    cols: ['series_id', 'tier', 'variant', 'name', 'rarity', 'base_atk', 'base_def', 'base_hp', 'base_spd',
      'element', 'element_power', 'durability_max', 'passive_skill_id', 'passive_note', 'req_level', 'req_class',
      'special_note', 'atk_pct', 'def_pct', 'hp_pct'],
  },
}

export async function POST(request) {
  const supabase = createServerSupabase()
  const auth = await getRequestUser(request, supabase)
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!isAdmin(auth.user)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 })

  let body
  try { body = await request.json() } catch { body = {} }
  const { target, op, id, row } = body
  const t = TARGETS[target]
  if (!t) return NextResponse.json({ error: `未知目标: ${target}` }, { status: 400 })

  try {
    if (op === 'save') {
      const allowed = {}
      for (const k of t.cols) if (row?.[k] !== undefined) allowed[k] = row[k]
      if (id) {
        const { error } = await supabase.from(t.table).update(allowed).eq('id', id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from(t.table).insert(allowed)
        if (error) throw new Error(error.message)
      }
      return NextResponse.json({ ok: true })
    }
    if (op === 'delete') {
      if (id == null) return NextResponse.json({ error: '缺少 ID' }, { status: 400 })
      const { error } = await supabase.from(t.table).delete().eq('id', id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: '未知动作' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error.message || '操作失败' }, { status: 400 })
  }
}
