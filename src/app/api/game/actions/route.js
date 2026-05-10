import { NextResponse } from 'next/server'
import { executeGameAction, withRetry, VersionConflictError } from '@/lib/server/gameActions'
import { createServerSupabase, getRequestUser } from '@/lib/serverSupabase'

export async function POST(request) {
  const payload = await request.json()
  const roomId = Number(payload.roomId)
  if (!roomId) {
    return NextResponse.json({ error: '缺少对局 ID' }, { status: 400 })
  }

  // ── 并行：认证 + 对局数据同时拉取，省一个往返 ──
  const supabase = createServerSupabase()
  const [auth, { data: roomData, error: roomError }] = await Promise.all([
    getRequestUser(request, supabase),
    supabase.from('rooms').select('*').eq('id', roomId).single(),
  ])

  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (roomError || !roomData) {
    return NextResponse.json({ error: '对局不存在' }, { status: 404 })
  }

  try {
    const room = await withRetry(() =>
      executeGameAction(supabase, auth.user, payload, { prefetchedRoom: roomData }),
    )
    return NextResponse.json({ room })
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return NextResponse.json({ error: '操作冲突，请重试' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message || '动作执行失败' }, { status: 400 })
  }
}
