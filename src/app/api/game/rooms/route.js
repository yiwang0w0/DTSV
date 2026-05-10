import { NextResponse } from 'next/server'
import { createRoom } from '@/lib/server/gameActions'
import { requireRequestUser } from '@/lib/serverSupabase'

async function findOpenRoom(client) {
  const { data, error } = await client
    .from('rooms')
    .select('*')
    .in('gamestate', [0, 1])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(error.message || '获取对局状态失败')
  }

  return data || null
}

export async function POST(request) {
  const payload = await request.json().catch(() => ({}))
  const ensureNextRound = payload.ensureNextRound === true

  const auth = await requireRequestUser(request, { admin: !ensureNextRound })
  if (!auth.ok) {
    return NextResponse.json({ error: auth.response.error }, { status: auth.response.status })
  }

  try {
    if (ensureNextRound) {
      const existingRoom = await findOpenRoom(auth.supabase)
      if (existingRoom) {
        return NextResponse.json({ room: existingRoom, created: false })
      }
    }

    const room = await createRoom(auth.supabase, auth.user, payload)
    return NextResponse.json({ room, created: true })
  } catch (error) {
    return NextResponse.json({ error: error.message || '创建对局失败' }, { status: 500 })
  }
}
