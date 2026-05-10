/**
 * /api/stash
 *
 * GET    — 读取当前用户账户库
 * POST   — { action: 'add' | 'remove' | 'grant', items?, instanceIds? }
 *          'grant' 仅管理员可用，用于给指定 user_id 加发道具（开发/测试）
 */

import { NextResponse } from 'next/server'
import { createServerSupabase, getRequestUser } from '@/lib/serverSupabase'
import { isAdmin } from '@/lib/auth'
import {
  loadStash,
  addItemsToStash,
  removeItemsFromStash,
  moveEquipmentToStash,
} from '@/lib/server/stash'

export async function GET(request) {
  const supabase = createServerSupabase()
  const auth = await getRequestUser(request, supabase)
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const stash = await loadStash(supabase, auth.user.id)
    return NextResponse.json({ stash })
  } catch (error) {
    return NextResponse.json({ error: error.message || '读取库存失败' }, { status: 400 })
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
    if (action === 'add') {
      // 当前用户自助添加（仅用于内部流转，不应作为外部入口）
      // 该接口只在受信任内部场景使用，因此不做外部限流，但仍要防越权
      const result = await addItemsToStash(supabase, auth.user.id, payload.items || [])
      const stash = await loadStash(supabase, auth.user.id)
      return NextResponse.json({ stash, result })
    }

    if (action === 'remove') {
      await removeItemsFromStash(supabase, auth.user.id, payload.items || [])
      if (payload.instanceIds?.length) {
        // 把实例移回库（仅在玩家未在对局时使用此接口）
        await moveEquipmentToStash(supabase, auth.user.id, payload.instanceIds)
      }
      const stash = await loadStash(supabase, auth.user.id)
      return NextResponse.json({ stash })
    }

    if (action === 'grant') {
      // 管理员发放：可指定 targetUserId
      if (!isAdmin(auth.user)) {
        return NextResponse.json({ error: '需要管理员权限' }, { status: 403 })
      }
      const targetUserId = payload.targetUserId || auth.user.id
      const result = await addItemsToStash(supabase, targetUserId, payload.items || [], { allowOverflow: true })
      const stash = await loadStash(supabase, targetUserId)
      return NextResponse.json({ stash, result })
    }

    return NextResponse.json({ error: '未知动作' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error.message || '操作失败' }, { status: 400 })
  }
}
