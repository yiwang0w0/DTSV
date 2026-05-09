/**
 * /api/contracts
 *
 * GET    — 列出当前玩家的合同（已接受 + 可接受）
 * POST   — { action: 'accept', contractId }
 *          { action: 'create', name, description, objectives, rewards }   仅管理员
 *          { action: 'update', id, ...patch }                              仅管理员
 *          { action: 'delete', id }                                        仅管理员
 */

import { NextResponse } from 'next/server'
import { createServerSupabase, getRequestUser } from '@/lib/serverSupabase'
import { isAdmin } from '@/lib/auth'
import { loadPlayerContracts, acceptContract } from '@/lib/server/contracts'

export async function GET(request) {
  const supabase = createServerSupabase()
  const auth = await getRequestUser(request, supabase)
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const url = new URL(request.url)
    const includeAvailable = url.searchParams.get('available') !== '0'
    const list = await loadPlayerContracts(supabase, auth.user.id, { includeAvailable })
    return NextResponse.json({ contracts: list })
  } catch (error) {
    return NextResponse.json({ error: error.message || '加载合同失败' }, { status: 400 })
  }
}

export async function POST(request) {
  const supabase = createServerSupabase()
  const auth = await getRequestUser(request, supabase)
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let payload
  try { payload = await request.json() } catch { payload = {} }
  const action = payload.action

  try {
    if (action === 'accept') {
      if (!payload.contractId) {
        return NextResponse.json({ error: '缺少合同 ID' }, { status: 400 })
      }
      const result = await acceptContract(supabase, auth.user.id, payload.contractId)
      return NextResponse.json(result)
    }

    if (action === 'create') {
      if (!isAdmin(auth.user)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 })
      const insert = {
        name: payload.name || '未命名合同',
        description: payload.description || '',
        objectives: payload.objectives || [],
        rewards: payload.rewards || [],
        active: payload.active !== false,
      }
      const { data, error } = await supabase.from('contracts').insert(insert).select().single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ contract: data })
    }

    if (action === 'update') {
      if (!isAdmin(auth.user)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 })
      const { id, ...rest } = payload
      if (!id) return NextResponse.json({ error: '缺少 ID' }, { status: 400 })
      const allowed = {}
      for (const key of ['name', 'description', 'objectives', 'rewards', 'active']) {
        if (rest[key] !== undefined) allowed[key] = rest[key]
      }
      const { data, error } = await supabase.from('contracts').update(allowed).eq('id', id).select().single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ contract: data })
    }

    if (action === 'delete') {
      if (!isAdmin(auth.user)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 })
      if (!payload.id) return NextResponse.json({ error: '缺少 ID' }, { status: 400 })
      const { error } = await supabase.from('contracts').delete().eq('id', payload.id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: '未知动作' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error.message || '操作失败' }, { status: 400 })
  }
}
