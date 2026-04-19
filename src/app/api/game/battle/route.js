/**
 * POST /api/game/battle
 *
 * 增强版战斗动作 API
 * 接收：{ roomId, action: 'skill'|'defend'|'useItem'|'endTurn'|'flee', skillId?, itemName? }
 * 返回：{ room } 更新后的房间对象
 */

import { NextResponse } from 'next/server'
import { createServerSupabase, getRequestUser } from '@/lib/serverSupabase'
import { loadGameRules } from '@/lib/gameEngine'
import { normalizeGamevars, appendGameLog, applyRoomLifecycle, createLogEntry } from '@/lib/roomState'
import { executeBattleAction } from '@/lib/server/battleActions'

export async function POST(request) {
  const payload = await request.json()
  const roomId = Number(payload.roomId)
  if (!roomId) {
    return NextResponse.json({ error: '缺少房间 ID' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const [auth, { data: room, error: roomError }] = await Promise.all([
    getRequestUser(request, supabase),
    supabase.from('rooms').select('*').eq('id', roomId).single(),
  ])

  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (roomError || !room) {
    return NextResponse.json({ error: '房间不存在' }, { status: 404 })
  }

  try {
    const gamevars = normalizeGamevars(room.gamevars)
    const player = gamevars.players?.[auth.user.id]
    if (!player) {
      return NextResponse.json({ error: '你还未加入该房间' }, { status: 400 })
    }

    const rules = await loadGameRules(supabase)

    // 执行战斗动作（纯计算）
    const result = executeBattleAction(player, rules, payload, gamevars)

    // 更新 gamevars
    let nextGamevars = {
      ...gamevars,
      players: {
        ...gamevars.players,
        [auth.user.id]: result.updatedPlayer,
      },
    }

    // BOSS 击败标记
    if (result.isBossKill) {
      nextGamevars = { ...nextGamevars, bossDefeated: true }
    }

    // 追加日志
    const logEntries = result.logs.map(text => createLogEntry(text, 'damage'))
    if (logEntries.length > 0) {
      nextGamevars = appendGameLog(nextGamevars, logEntries)
    }

    // 生命周期检查（死亡/游戏结束等）
    const { gamevars: finalGamevars, roomPatch } = applyRoomLifecycle(room, nextGamevars)

    // 乐观锁写入
    const currentVersion = room.version ?? 0
    const { data, error } = await supabase
      .from('rooms')
      .update({
        ...roomPatch,
        gamevars: finalGamevars,
        version: currentVersion + 1,
      })
      .eq('id', room.id)
      .eq('version', currentVersion)
      .select('*')
      .single()

    if (!data && !error) {
      return NextResponse.json({ error: '操作冲突，请重试' }, { status: 409 })
    }
    if (error?.code === 'PGRST116') {
      return NextResponse.json({ error: '操作冲突，请重试' }, { status: 409 })
    }
    if (error) {
      throw error
    }

    return NextResponse.json({ room: data })
  } catch (error) {
    return NextResponse.json({ error: error.message || '战斗动作执行失败' }, { status: 400 })
  }
}
