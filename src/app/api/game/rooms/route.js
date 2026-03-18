import { NextResponse } from 'next/server'
import { createRoom } from '@/lib/server/gameActions'
import { requireRequestUser } from '@/lib/serverSupabase'

export async function POST(request) {
  const auth = await requireRequestUser(request, { admin: true })
  if (!auth.ok) {
    return NextResponse.json({ error: auth.response.error }, { status: auth.response.status })
  }

  try {
    const payload = await request.json()
    const room = await createRoom(auth.supabase, auth.user, payload)
    return NextResponse.json({ room })
  } catch (error) {
    return NextResponse.json({ error: error.message || '创建房间失败' }, { status: 500 })
  }
}

