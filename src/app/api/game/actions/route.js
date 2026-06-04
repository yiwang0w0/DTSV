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
    // 首次用预取的 room（省一往返）；重试时传 null → executeGameAction 重新 fetch 最新版本
    //   （并发下旧 version 必撞乐观锁，复用 stale room 会让 3 次重试全部白废）。
    const room = await withRetry((attempt) =>
      executeGameAction(supabase, auth.user, payload, { prefetchedRoom: attempt === 0 ? roomData : null }),
    )
    return NextResponse.json({ room })
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return NextResponse.json({ error: '操作冲突，请重试' }, { status: 409 })
    }
    // BR 体力不足：下发结构化 code 便于客户端用特定文案/样式（既有通用 400+message 已能兜底显示中文）。
    if (error.code === 'no_stamina') {
      return NextResponse.json({ error: error.message || '体力不足', code: 'no_stamina' }, { status: 400 })
    }
    return NextResponse.json({ error: error.message || '动作执行失败' }, { status: 400 })
  }
}
