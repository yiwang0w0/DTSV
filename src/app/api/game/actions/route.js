import { NextResponse } from 'next/server'
import { executeGameAction } from '@/lib/server/gameActions'
import { requireRequestUser } from '@/lib/serverSupabase'

export async function POST(request) {
  const auth = await requireRequestUser(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.response.error }, { status: auth.response.status })
  }

  try {
    const payload = await request.json()
    const room = await executeGameAction(auth.supabase, auth.user, payload)
    return NextResponse.json({ room })
  } catch (error) {
    return NextResponse.json({ error: error.message || '动作执行失败' }, { status: 400 })
  }
}

