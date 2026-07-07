import { NextResponse } from 'next/server'
import { executeGameAction, applyKaleidoPostAction, withRetry, VersionConflictError } from '@/lib/server/gameActions'
import { createServerSupabase, getRequestUser } from '@/lib/serverSupabase'
import { isKaleidoRoom } from '@/lib/roomState'

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
    let room = await withRetry((attempt) =>
      executeGameAction(supabase, auth.user, payload, { prefetchedRoom: attempt === 0 ? roomData : null }),
    )
    // KALEIDO（路由边界·仅 kaleido 局，多人局零行为变化）：动作后处理走单一共享入口
    //   applyKaleidoPostAction（= 推进 + 传感层事件 action/fight_start + ui_unlocks 判定/持久/下发）。
    //   与 scripts/kaleido-e2e.mjs act() 同调此函数（否则时序法则断言测不到真路径·06 §3.6）。
    //   before 快照取预取 roomData（重试路径 before 可能略旧——单人局并发罕见，遥测/解锁级可接受，
    //   解锁单调只增·漏检下动作补上）。sweep/branches 借道属服务端内部、绝不经路由 → 只真实动作。
    let unlockEvents = []
    if (isKaleidoRoom(room)) {
      const beforeMe = roomData?.gamevars?.players?.[auth.user.id] || null
      const beforeClearedSeq = roomData?.gamevars?.kaleido?.clearedSeq ?? 0
      const res = await applyKaleidoPostAction(supabase, room, auth.user, payload.action, { beforeMe, beforeClearedSeq })
      room = res.room
      unlockEvents = res.unlockEvents || []
    }
    // kaleido 局仅在本动作新解锁时扩 unlockEvents 兄弟键（06 §1.2）；否则/多人局回落 { room }（完全向后兼容）。
    return NextResponse.json(unlockEvents.length ? { room, unlockEvents } : { room })
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
