/**
 * /api/admin/item-pool — 道具池写路径（仅管理员 · service_role）。
 *
 * 🔒 phase-53(52b)：item_pool 写收到 service_role 后，ItemsTab 的 save/del 改走这里。
 *   列走白名单（= 表列去 id/created_at）；客户端的字段规整（chamber_template_ids/tag_ids 等）保留在编辑器侧。
 */
import { NextResponse } from 'next/server'
import { createServerSupabase, getRequestUser } from '@/lib/serverSupabase'
import { isAdmin } from '@/lib/auth'

const ITEM_COLS = ['name', 'kind', 'sub_kind', 'atk', 'def', 'heal', 'effect', 'amount', '_legacy_maps',
  'description', 'on_use_buff_ids', 'heal_formula', 'atk_formula', 'def_formula', 'use_mode', 'inspect_text',
  'chamber_template_ids', 'stamina_restore', 'jump_charge', 'bundle_count', 'tag_ids']

export async function POST(request) {
  const supabase = createServerSupabase()
  const auth = await getRequestUser(request, supabase)
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!isAdmin(auth.user)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 })

  let body
  try { body = await request.json() } catch { body = {} }
  const { op, id, item } = body

  try {
    if (op === 'save') {
      if (!item?.name || !String(item.name).trim()) return NextResponse.json({ error: '请填写道具名称' }, { status: 400 })
      const allowed = {}
      for (const k of ITEM_COLS) if (item[k] !== undefined) allowed[k] = item[k]
      if (id) {
        const { error } = await supabase.from('item_pool').update(allowed).eq('id', id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('item_pool').insert(allowed)
        if (error) throw new Error(error.message)
      }
      return NextResponse.json({ ok: true })
    }
    if (op === 'delete') {
      if (id == null) return NextResponse.json({ error: '缺少 ID' }, { status: 400 })
      const { error } = await supabase.from('item_pool').delete().eq('id', id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: '未知动作' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error.message || '操作失败' }, { status: 400 })
  }
}
