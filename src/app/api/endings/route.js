/**
 * /api/endings — 结局 CRUD（仅管理员）
 */

import { NextResponse } from 'next/server'
import { createServerSupabase, getRequestUser } from '@/lib/serverSupabase'
import { isAdmin } from '@/lib/auth'
import { invalidateEndingsCache } from '@/lib/server/endings'

export async function GET(request) {
  const supabase = createServerSupabase()
  const auth = await getRequestUser(request, supabase)
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!isAdmin(auth.user)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 })
  try {
    const { data, error } = await supabase.from('endings').select('*').order('id', { ascending: false })
    if (error) throw new Error(error.message)
    return NextResponse.json({ endings: data || [] })
  } catch (error) {
    return NextResponse.json({ error: error.message || '加载失败' }, { status: 400 })
  }
}

export async function POST(request) {
  const supabase = createServerSupabase()
  const auth = await getRequestUser(request, supabase)
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!isAdmin(auth.user)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 })

  let payload
  try { payload = await request.json() } catch { payload = {} }
  const action = payload.action

  try {
    if (action === 'create') {
      const insert = {
        key:         payload.key         || `ending_${Date.now().toString(36)}`,
        name:        payload.name        || '未命名结局',
        description: payload.description || '',
        banner_text: payload.banner_text || '',
        rewards:     payload.rewards     || [],
        active:      payload.active !== false,
      }
      const { data, error } = await supabase.from('endings').insert(insert).select().single()
      if (error) throw new Error(error.message)
      invalidateEndingsCache()
      return NextResponse.json({ ending: data })
    }

    if (action === 'update') {
      const { id, ...rest } = payload
      if (!id) return NextResponse.json({ error: '缺少 ID' }, { status: 400 })
      const allowed = {}
      for (const key of ['key', 'name', 'description', 'banner_text', 'rewards', 'active']) {
        if (rest[key] !== undefined) allowed[key] = rest[key]
      }
      const { data, error } = await supabase.from('endings').update(allowed).eq('id', id).select().single()
      if (error) throw new Error(error.message)
      invalidateEndingsCache()
      return NextResponse.json({ ending: data })
    }

    if (action === 'delete') {
      if (!payload.id) return NextResponse.json({ error: '缺少 ID' }, { status: 400 })
      const { error } = await supabase.from('endings').delete().eq('id', payload.id)
      if (error) throw new Error(error.message)
      invalidateEndingsCache()
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: '未知动作' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error.message || '操作失败' }, { status: 400 })
  }
}
