import { NextResponse } from 'next/server'
import { requireRequestUser } from '@/lib/serverSupabase'
import {
  appendGameLog,
  computeRoomStats,
  createLogEntry,
  getDisplayName,
  normalizeGamevars,
} from '@/lib/roomState'
import { VersionConflictError, withRetry } from '@/lib/server/gameActions'

async function forceEndRoom(client, user, roomId) {
  const { data: room, error } = await client.from('rooms').select('*').eq('id', roomId).single()
  if (error || !room) {
    throw new Error('房间不存在')
  }

  if (room.gamestate === 2) {
    return room
  }

  const currentVersion = room.version ?? 0
  const gamevars = normalizeGamevars(room.gamevars)
  const { alivePlayers } = computeRoomStats(gamevars)
  const nextGamevars = appendGameLog(gamevars, createLogEntry(`${getDisplayName(user)} 强制结束了房间`, 'system'))
  const winner = room.winner || (alivePlayers.length === 1 ? alivePlayers[0]?.name || null : null)

  const { data, error: updateError } = await client
    .from('rooms')
    .update({
      gamestate: 2,
      winner,
      version: currentVersion + 1,
      gamevars: nextGamevars,
    })
    .eq('id', roomId)
    .eq('version', currentVersion)
    .select('*')
    .single()

  if (!data && !updateError) {
    throw new VersionConflictError()
  }
  if (updateError?.code === 'PGRST116') {
    throw new VersionConflictError()
  }
  if (updateError) {
    throw new Error(updateError.message || '结束房间失败')
  }

  return data
}

export async function PATCH(request) {
  const auth = await requireRequestUser(request, { admin: true })
  if (!auth.ok) {
    return NextResponse.json({ error: auth.response.error }, { status: auth.response.status })
  }

  const payload = await request.json().catch(() => ({}))
  const roomId = Number(payload.id)
  if (!roomId) {
    return NextResponse.json({ error: '缺少房间ID' }, { status: 400 })
  }

  try {
    const room = await withRetry(() => forceEndRoom(auth.supabase, auth.user, roomId))
    return NextResponse.json({ room })
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return NextResponse.json({ error: '操作冲突，请重试' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message || '结束房间失败' }, { status: 400 })
  }
}

export async function DELETE(request) {
  const auth = await requireRequestUser(request, { admin: true })
  if (!auth.ok) {
    return NextResponse.json({ error: auth.response.error }, { status: auth.response.status })
  }

  const roomId = Number(new URL(request.url).searchParams.get('id'))
  if (!roomId) {
    return NextResponse.json({ error: '缺少房间ID' }, { status: 400 })
  }

  const { error } = await auth.supabase.from('rooms').delete().eq('id', roomId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
