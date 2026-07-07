/**
 * /api/admin/table — 通用扁平内容表写路径（仅管理员 · service_role）。
 *
 * 🔒 phase-55(52b) RLS 收紧联动：这些内容表写收到 service_role 后，各手写编辑器的
 *   save/remove/toggleEnabled 改走这里。表名走服务端允许清单（拒任意表注入），列走白名单（=表列去 pk/时间戳）。
 *   桥接/嵌套结构的表（item_recipes 等）走 /api/admin/content；本路由只服务「无桥接的扁平表」。
 */
import { NextResponse } from 'next/server'
import { createServerSupabase, getRequestUser } from '@/lib/serverSupabase'
import { isAdmin } from '@/lib/auth'

// 允许清单：表 → { pk, cols(可写列白名单 = 表列去 pk/created_at/updated_at) }
const TABLES = {
  chamber_templates: { pk: 'id', cols: ['template_key', 'name', 'type', 'description', 'region_label', 'weather', 'pollution_base', 'pollution_accel', 'is_exit', 'exit_cost', 'omega_window', 'max_items', 'max_npcs', 'spawn_weight', 'exit_count', 'enabled'] },
  classes: { pk: 'id', cols: ['name', 'description', 'rarity', 'base_atk_bonus', 'base_def_bonus', 'base_hp_bonus', 'perks', 'enabled'] },
  fragment_pool: { pk: 'id', cols: ['name', 'raw_text', 'partial_1', 'partial_2', 'full_text', 'category', 'rarity', 'discover_mode', '_legacy_maps', 'min_pollution', 'requires_fragment_id', 'weight', 'enabled', 'chamber_template_ids', 'unlocks_rules', 'phase_chain', 'is_main_story'] },
  shop_catalog: { pk: 'id', cols: ['entry_kind', 'tier_id', 'item_name', 'point_type', 'cost', 'required_class_ids', 'enabled', 'display_order'] },
  shop_exchange_rates: { pk: 'id', cols: ['from_type', 'to_type', 'from_amount', 'to_amount', 'enabled', 'description', 'economy_version'] },
  // br_rooms 已登记（列白名单就绪）；其编辑器 RoomsEditorTab 的对称同步循环待 52b-2b 改造后再启用收紧。
  br_rooms: { pk: 'room_id', cols: ['label', 'region', 'neighbor_ids', 'grid_x', 'grid_y', 'close_phase', 'enabled'] },
}

export async function POST(request) {
  const supabase = createServerSupabase()
  const auth = await getRequestUser(request, supabase)
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!isAdmin(auth.user)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 })

  let body
  try { body = await request.json() } catch { body = {} }
  const { table, op, id, row } = body
  const t = TABLES[table]
  if (!t) return NextResponse.json({ error: `未知表: ${table}` }, { status: 400 })

  try {
    if (op === 'save') {
      const allowed = {}
      for (const k of t.cols) if (row?.[k] !== undefined) allowed[k] = row[k]
      if (id != null) {
        const { error } = await supabase.from(table).update(allowed).eq(t.pk, id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from(table).insert(allowed)
        if (error) throw new Error(error.message)
      }
      return NextResponse.json({ ok: true })
    }
    if (op === 'delete') {
      if (id == null) return NextResponse.json({ error: '缺少 ID' }, { status: 400 })
      const { error } = await supabase.from(table).delete().eq(t.pk, id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: '未知动作' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error.message || '操作失败' }, { status: 400 })
  }
}
