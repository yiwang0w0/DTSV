/**
 * /api/admin/content — 内容引擎(ContentEngine)通用写路径（schema 驱动 · 仅管理员 · service_role）。
 *
 * 🔒 phase-51 RLS 收紧联动：item_recipes / item_recipe_ingredients / item_tags 收紧写权后，
 *   编辑器保存/删除改走这里。表名走服务端允许清单校验（CONTENT_SCHEMAS），拒绝任意表注入。
 * 范式同 /api/endings：createServerSupabase + getRequestUser + isAdmin 三段闸口。
 */
import { NextResponse } from 'next/server'
import { createServerSupabase, getRequestUser } from '@/lib/serverSupabase'
import { isAdmin } from '@/lib/auth'
import { CONTENT_SCHEMAS, saveContent, removeContent, validateContent } from '@/lib/server/adminContent'

export async function POST(request) {
  const supabase = createServerSupabase()
  const auth = await getRequestUser(request, supabase)
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!isAdmin(auth.user)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 })

  let body
  try { body = await request.json() } catch { body = {} }
  const { table, op, draft, row } = body

  const schema = CONTENT_SCHEMAS[table]
  if (!schema) return NextResponse.json({ error: `未知内容表: ${table}` }, { status: 400 })

  try {
    if (op === 'save') {
      const err = validateContent(schema, draft || {})
      if (err) return NextResponse.json({ error: err }, { status: 400 })
      const res = await saveContent(supabase, schema, draft || {})
      return NextResponse.json(res)
    }
    if (op === 'remove') {
      const res = await removeContent(supabase, schema, row || draft || {})
      return NextResponse.json(res)
    }
    return NextResponse.json({ error: '未知动作' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error.message || '操作失败' }, { status: 400 })
  }
}
