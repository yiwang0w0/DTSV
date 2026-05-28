/**
 * /api/profile — Phase 28 个人主页账户配置
 *
 * GET   — 拉当前玩家 profile（账户情报 + 统计 + 当前立绘）
 * POST  — { action: 'update_info', username?, motto?, killmsg?, lastword?, gender? }
 *         更新账户情报（username 写 auth user_metadata，其余写 profiles 表）
 *
 * 立绘的选择 / 上传 / 撤回仍走 /api/portraits（本路由不重复）。
 */

import { NextResponse } from 'next/server'
import { createServerSupabase, getRequestUser } from '@/lib/serverSupabase'

// 可由玩家自行编辑的 profiles 字段白名单
const EDITABLE_PROFILE_FIELDS = ['motto', 'killmsg', 'lastword', 'gender']
const MAX_LEN = { motto: 80, killmsg: 60, lastword: 60, gender: 8 }

export async function GET(request) {
  const supabase = createServerSupabase()
  const auth = await getRequestUser(request, supabase)
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select(`
        id, username, gender, motto, killmsg, lastword,
        validgames, wingames, credits, gold, elo_rating, created_at,
        selected_portrait_id,
        portraits ( id, name, image_url, status )
      `)
      .eq('id', auth.user.id)
      .maybeSingle()

    return NextResponse.json({
      profile: profile || null,
      // username 权威源是 auth metadata；profiles.username 是镜像
      username: auth.user.user_metadata?.username || profile?.username || auth.user.email,
      email: auth.user.email,
      portrait: profile?.portraits || null,
    })
  } catch (e) {
    return NextResponse.json({ error: e.message || '加载个人资料失败' }, { status: 400 })
  }
}

export async function POST(request) {
  const supabase = createServerSupabase()
  const auth = await getRequestUser(request, supabase)
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let payload
  try { payload = await request.json() } catch { payload = {} }

  if (payload.action !== 'update_info') {
    return NextResponse.json({ error: '未知的 action' }, { status: 400 })
  }

  try {
    // 1. profiles 表字段（白名单 + 长度裁剪）
    const patch = {}
    for (const f of EDITABLE_PROFILE_FIELDS) {
      if (payload[f] !== undefined && payload[f] !== null) {
        const v = String(payload[f]).slice(0, MAX_LEN[f] || 100)
        patch[f] = v
      }
    }
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('profiles').update(patch).eq('id', auth.user.id)
      if (error) throw new Error(`profiles 更新失败: ${error.message}`)
    }

    // 2. username 写 auth user_metadata（+ profiles.username 镜像）
    let newUsername = auth.user.user_metadata?.username
    if (typeof payload.username === 'string' && payload.username.trim()) {
      newUsername = payload.username.trim().slice(0, 24)
      const { error: authErr } = await supabase.auth.admin.updateUserById(auth.user.id, {
        user_metadata: { ...auth.user.user_metadata, username: newUsername },
      })
      if (authErr) throw new Error(`username 更新失败: ${authErr.message}`)
      // 镜像到 profiles.username（best-effort）
      await supabase.from('profiles').update({ username: newUsername }).eq('id', auth.user.id)
    }

    return NextResponse.json({ ok: true, username: newUsername, patched: Object.keys(patch) })
  } catch (e) {
    return NextResponse.json({ error: e.message || '更新失败' }, { status: 400 })
  }
}
