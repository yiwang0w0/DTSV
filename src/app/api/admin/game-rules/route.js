/**
 * /api/admin/game-rules — 战斗规则值写路径（仅管理员 · service_role）。
 *
 * 🔒 phase-51 RLS 收紧联动：game_rules 写仅 service_role 后，RulesRuleRow 改走这里。
 *   只允许改单条规则的 value（不放行任意列/新增行 —— 规则集是种子数据，后台只调值）。
 */
import { NextResponse } from 'next/server'
import { createServerSupabase, getRequestUser } from '@/lib/serverSupabase'
import { isAdmin } from '@/lib/auth'

export async function POST(request) {
  const supabase = createServerSupabase()
  const auth = await getRequestUser(request, supabase)
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!isAdmin(auth.user)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 })

  let body
  try { body = await request.json() } catch { body = {} }
  const { op, id, value } = body

  try {
    if (op === 'update') {
      if (id == null) return NextResponse.json({ error: '缺少规则 ID' }, { status: 400 })
      const { error } = await supabase.from('game_rules').update({ value }).eq('id', id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: '未知动作' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error.message || '操作失败' }, { status: 400 })
  }
}
