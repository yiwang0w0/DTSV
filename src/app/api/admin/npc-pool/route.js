/**
 * /api/admin/npc-pool — NPC/实体池写路径（仅管理员 · service_role）。
 *
 * 🔒 phase-53(52b)：npc_pool 写收到 service_role 后，NpcsTab 的 save/del 改走这里。
 *   列走白名单（= 表列去 id/created_at）；客户端的字段规整（class_id/loadout_tiers/item_slots）保留在编辑器侧。
 */
import { NextResponse } from 'next/server'
import { createServerSupabase, getRequestUser } from '@/lib/serverSupabase'
import { isAdmin } from '@/lib/auth'

const NPC_COLS = ['name', 'hp', 'atk', 'def', 'exp', 'level', '_legacy_maps', 'entity_type', 'hostile',
  'tradeable', 'trade_wants', 'trade_offers', 'pollution_on_kill', 'spawn_weight', 'min_pollution',
  'description', 'chamber_template_ids', 'class_id', 'loadout_tiers', 'item_slots', 'accuracy', 'counter_rate']

export async function POST(request) {
  const supabase = createServerSupabase()
  const auth = await getRequestUser(request, supabase)
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!isAdmin(auth.user)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 })

  let body
  try { body = await request.json() } catch { body = {} }
  const { op, id, npc } = body

  try {
    if (op === 'save') {
      if (!npc?.name || !String(npc.name).trim()) return NextResponse.json({ error: '请填写实体名称' }, { status: 400 })
      const allowed = {}
      for (const k of NPC_COLS) if (npc[k] !== undefined) allowed[k] = npc[k]
      if (id) {
        const { error } = await supabase.from('npc_pool').update(allowed).eq('id', id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('npc_pool').insert(allowed)
        if (error) throw new Error(error.message)
      }
      return NextResponse.json({ ok: true })
    }
    if (op === 'delete') {
      if (id == null) return NextResponse.json({ error: '缺少 ID' }, { status: 400 })
      const { error } = await supabase.from('npc_pool').delete().eq('id', id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: '未知动作' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error.message || '操作失败' }, { status: 400 })
  }
}
