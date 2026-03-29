import { NextResponse } from 'next/server'
import { requireRequestUser } from '@/lib/serverSupabase'

// 仅允许管理员执行 SQL 查询
// 警告级操作（INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE）需要前端二次确认
const DANGEROUS_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i

export async function POST(request) {
  const auth = await requireRequestUser(request, { admin: true })
  if (!auth.ok) {
    return NextResponse.json({ error: auth.response.error }, { status: auth.response.status })
  }

  const body = await request.json().catch(() => ({}))
  const sql = String(body.sql || '').trim()

  if (!sql) {
    return NextResponse.json({ error: '请输入 SQL 语句' }, { status: 400 })
  }

  if (sql.length > 5000) {
    return NextResponse.json({ error: 'SQL 语句过长（最大 5000 字符）' }, { status: 400 })
  }

  const isDangerous = DANGEROUS_KEYWORDS.test(sql)

  try {
    const { data, error } = await auth.supabase.rpc('exec_sql', { query: sql })

    if (error) {
      return NextResponse.json({
        error: error.message || '查询执行失败',
        hint: error.hint || null,
        code: error.code || null,
      }, { status: 400 })
    }

    return NextResponse.json({
      data: data ?? [],
      isDangerous,
      rowCount: Array.isArray(data) ? data.length : 0,
    })
  } catch (error) {
    return NextResponse.json({ error: error.message || '执行失败' }, { status: 500 })
  }
}
