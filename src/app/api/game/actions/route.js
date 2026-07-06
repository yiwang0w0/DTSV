import { NextResponse } from 'next/server'
import { executeGameAction, advanceKaleidoProgress, withRetry, VersionConflictError } from '@/lib/server/gameActions'
import { createServerSupabase, getRequestUser } from '@/lib/serverSupabase'
import { isKaleidoRoom } from '@/lib/roomState'
import { emitPlayerEvents, buildActionEvent, kaleidoLevelSeq } from '@/lib/server/kaleido/events'

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
    // KALEIDO（路由边界·仅 kaleido 局，多人局零行为变化）：
    //   ① 推进：turnCount+1 → exit_condition 判定 → 过关/收敛（吞错，失败返回原 room）；
    //   ② 传感层发射：已映射动词 → player_events（发射在推进后，事件携带最新 turnCount/currentSeq）；
    //      fight_start = 动作前后 encounter null→有 的边界 diff（KP0-R S3；before 取预取 roomData，
    //      重试路径 before 可能略旧——单人局并发罕见，遥测级可接受）。
    //   sweep/branches 借道属服务端内部、绝不经路由 → 天然满足「只真实动作」。
    if (isKaleidoRoom(room)) {
      const beforeMe = roomData?.gamevars?.players?.[auth.user.id] || null
      room = await advanceKaleidoProgress(supabase, room, auth.user, payload.action)
      const rows = []
      const ev = buildActionEvent(auth.user.id, room?.gamevars, payload.action)
      if (ev) rows.push(ev)
      const afterMe = room?.gamevars?.players?.[auth.user.id] || null
      if (!beforeMe?.encounter && afterMe?.encounter) {
        const kal = room?.gamevars?.kaleido || {}
        rows.push({
          player_id: auth.user.id,
          run_id: kal.runId ?? null,
          level_seq: kaleidoLevelSeq(afterMe), // 物理关（缺陷B），与 level_clear 口径合一
          verb: 'fight_start',
          payload: { action: payload.action },
        })
      }
      if (rows.length > 0) await emitPlayerEvents(supabase, rows) // KP0-R S4：await，防 Vercel 冻结丢事件
    }
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
