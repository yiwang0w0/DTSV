/**
 * /api/admin/buff-pool — Buff 池写路径（仅管理员 · service_role）。
 *
 * 🔒 phase-53(52b) RLS 收紧联动：buff_pool 写从 authenticated 收到 service_role 后，
 *   RulesBuffModal(save)/RulesTab(delete) 改走这里。列走白名单（防注入任意列）。
 */
import { NextResponse } from 'next/server'
import { createServerSupabase, getRequestUser } from '@/lib/serverSupabase'
import { isAdmin } from '@/lib/auth'

const BUFF_COLS = ['name', 'icon', 'description', 'type', 'target', 'effect_formula', 'value', 'duration', 'max_stack', 'is_debuff']

export async function POST(request) {
  const supabase = createServerSupabase()
  const auth = await getRequestUser(request, supabase)
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!isAdmin(auth.user)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 })

  let body
  try { body = await request.json() } catch { body = {} }
  const { op, id, buff } = body

  try {
    if (op === 'save') {
      if (!buff?.name || !String(buff.name).trim()) return NextResponse.json({ error: '请填写 Buff 名称' }, { status: 400 })
      const allowed = {}
      for (const k of BUFF_COLS) if (buff[k] !== undefined) allowed[k] = buff[k]
      if (id) {
        const { error } = await supabase.from('buff_pool').update(allowed).eq('id', id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('buff_pool').insert(allowed)
        if (error) throw new Error(error.message)
      }
      return NextResponse.json({ ok: true })
    }

    if (op === 'delete') {
      if (id == null) return NextResponse.json({ error: '缺少 ID' }, { status: 400 })
      const { error } = await supabase.from('buff_pool').delete().eq('id', id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: '未知动作' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error.message || '操作失败' }, { status: 400 })
  }
}
