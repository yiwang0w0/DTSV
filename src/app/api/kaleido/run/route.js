import { NextResponse } from 'next/server'
import { requireRequestUser } from '@/lib/serverSupabase'
import { startKaleidoRun } from '@/lib/server/gameActions'

// KALEIDO 单人 run 启动（KP0-S 交付物 5 · 02 §2.6）。
// 不走 /api/game/actions：分发器入口强制已有 roomId，而本动作要「建房」。
// 幂等：已有 active run 直接返回其 { roomId, runId }（客户端拿到即跳 /game/[roomId]）。
export async function POST(request) {
  const auth = await requireRequestUser(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.response.error }, { status: auth.response.status })
  }
  try {
    const result = await startKaleidoRun(auth.supabase, auth.user)
    return NextResponse.json(result) // { roomId, runId }
  } catch (error) {
    return NextResponse.json({ error: error.message || '启动 run 失败' }, { status: 400 })
  }
}
