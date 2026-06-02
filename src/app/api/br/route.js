/**
 * /api/br — 虚拟空间BR 单一 API 端点（Phase 31 骨架）
 *
 * 设计宪法 docs/timejump-br-design.md §3。action 分发（照 src/app/api/game/rooms/route.js
 * 的 POST{action} 与 /api/profile 的鉴权）：
 *   POST { action:'create'|'join', ... }  — 写动作
 *   GET  ?action='state'&matchId= | ?action='list'&status=  — 读
 *
 * 全程 requireRequestUser(request) 取 service-role supabase（绕 RLS）+ 登录 user，
 * 再委托 match.js。鉴权失败统一回 { error }, status。
 *
 * Phase 31 不处理 move/search/bomb/jump（留 32+）。
 */

import { NextResponse } from 'next/server'
import { requireRequestUser } from '@/lib/serverSupabase'
import {
  createMatch,
  joinMatch,
  getMatchState,
  listMatches,
} from '@/lib/server/br/match'

export async function POST(request) {
  const auth = await requireRequestUser(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.response.error }, { status: auth.response.status })
  }

  const body = await request.json().catch(() => ({}))
  const action = body?.action

  try {
    if (action === 'create') {
      const result = await createMatch(auth.supabase, auth.user, {
        phaseSeconds: body.phaseSeconds,
        maxPhase: body.maxPhase,
        config: body.config,
      })
      return NextResponse.json(result)
    }

    if (action === 'join') {
      const matchId = Number(body.matchId)
      if (!Number.isFinite(matchId)) {
        return NextResponse.json({ error: '缺少 matchId' }, { status: 400 })
      }
      const result = await joinMatch(auth.supabase, auth.user, matchId)
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: '未知的 action' }, { status: 400 })
  } catch (e) {
    // joinMatch 抛出的语义错误映射 HTTP 码
    if (e?.code === 'not_found') {
      return NextResponse.json({ error: e.message || '对局不存在' }, { status: 404 })
    }
    if (e?.code === 'ended') {
      return NextResponse.json({ error: e.message || '对局已结束' }, { status: 400 })
    }
    console.error('[br] POST 失败:', e?.message || e)
    return NextResponse.json({ error: e?.message || '请求失败' }, { status: 500 })
  }
}

export async function GET(request) {
  const auth = await requireRequestUser(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.response.error }, { status: auth.response.status })
  }

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'list'

  try {
    if (action === 'state') {
      const matchId = Number(searchParams.get('matchId'))
      if (!Number.isFinite(matchId)) {
        return NextResponse.json({ error: '缺少 matchId' }, { status: 400 })
      }
      const state = await getMatchState(auth.supabase, matchId, auth.user.id)
      if (!state) {
        return NextResponse.json({ error: '对局不存在' }, { status: 404 })
      }
      return NextResponse.json(state)
    }

    if (action === 'list') {
      const status = searchParams.get('status') || 'openable'
      const matches = await listMatches(auth.supabase, { status })
      return NextResponse.json({ matches })
    }

    return NextResponse.json({ error: '未知的 action' }, { status: 400 })
  } catch (e) {
    console.error('[br] GET 失败:', e?.message || e)
    return NextResponse.json({ error: e?.message || '请求失败' }, { status: 500 })
  }
}
