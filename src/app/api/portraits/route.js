/**
 * /api/portraits — Phase 27 角色立绘 API
 *
 * GET                          — 列出当前用户可见立绘（approved 全部 + 自己 pending）
 * POST { action: 'select', portraitId }   — 玩家选择立绘
 * POST { action: 'record_upload', name, imageUrl, storagePath } — 客户端 Storage 上传完成后记录到表
 * POST { action: 'cancel_upload', portraitId } — 撤回自己 pending
 *
 * Admin only:
 * POST { action: 'approve', portraitId }
 * POST { action: 'reject',  portraitId, reason }
 * POST { action: 'create_preset', name, imageUrl, storagePath }
 * POST { action: 'disable', portraitId }
 */

import { NextResponse } from 'next/server'
import { createServerSupabase, getRequestUser } from '@/lib/serverSupabase'
import { isAdmin } from '@/lib/auth'
import {
  listVisiblePortraits,
  listPendingPortraits,
  listAllPortraits,
  recordUserUpload,
  approveByAdmin,
  rejectByAdmin,
  createPreset,
  disablePortrait,
  selectPortrait,
} from '@/lib/server/portraits'

export async function GET(request) {
  const supabase = createServerSupabase()
  const auth = await getRequestUser(request, supabase)
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const url = new URL(request.url)
    const mode = url.searchParams.get('mode')

    if (mode === 'admin') {
      if (!isAdmin(auth.user)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 })
      const listType = url.searchParams.get('list') || 'pending'
      const list = listType === 'all'
        ? await listAllPortraits(supabase)
        : await listPendingPortraits(supabase)
      return NextResponse.json({ portraits: list, total: list.length })
    }

    // 玩家视角:approved + own pending
    const list = await listVisiblePortraits(supabase, auth.user.id)
    // 查当前选择
    const { data: profile } = await supabase
      .from('profiles')
      .select('selected_portrait_id')
      .eq('id', auth.user.id)
      .maybeSingle()
    return NextResponse.json({
      portraits: list,
      selectedId: profile?.selected_portrait_id || null,
    })
  } catch (e) {
    return NextResponse.json({ error: e.message || '加载立绘失败' }, { status: 400 })
  }
}

export async function POST(request) {
  const supabase = createServerSupabase()
  const auth = await getRequestUser(request, supabase)
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let payload
  try { payload = await request.json() } catch { payload = {} }
  const action = payload.action
  const admin = isAdmin(auth.user)

  try {
    if (action === 'select') {
      const result = await selectPortrait(supabase, auth.user.id, payload.portraitId)
      return NextResponse.json(result)
    }

    if (action === 'record_upload') {
      const result = await recordUserUpload(supabase, {
        userId: auth.user.id,
        name: payload.name,
        imageUrl: payload.imageUrl,
        storagePath: payload.storagePath,
      })
      return NextResponse.json({ portrait: result })
    }

    if (action === 'cancel_upload') {
      // 玩家撤回自己的 pending(也清 storage 文件)
      const { data: p } = await supabase
        .from('portraits')
        .select('id, storage_path, uploader_id, status')
        .eq('id', payload.portraitId)
        .maybeSingle()
      if (!p || p.uploader_id !== auth.user.id) {
        return NextResponse.json({ error: '不存在或无权操作' }, { status: 403 })
      }
      if (p.status !== 'pending') {
        return NextResponse.json({ error: '只能撤回待审核立绘' }, { status: 400 })
      }
      await supabase.from('portraits').delete().eq('id', p.id)
      if (p.storage_path) {
        try { await supabase.storage.from('portraits').remove([p.storage_path]) } catch { /* ignore */ }
      }
      return NextResponse.json({ ok: true })
    }

    // ── Admin only actions ──
    if (!admin) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 })

    if (action === 'approve') {
      const r = await approveByAdmin(supabase, payload.portraitId, auth.user.id)
      return NextResponse.json({ portrait: r })
    }
    if (action === 'reject') {
      const r = await rejectByAdmin(supabase, payload.portraitId, auth.user.id, payload.reason || '')
      return NextResponse.json({ portrait: r })
    }
    if (action === 'create_preset') {
      const r = await createPreset(supabase, {
        name: payload.name,
        imageUrl: payload.imageUrl,
        storagePath: payload.storagePath,
      }, auth.user.id)
      return NextResponse.json({ portrait: r })
    }
    if (action === 'disable') {
      await disablePortrait(supabase, payload.portraitId)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: '未知的 action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e.message || '操作失败' }, { status: 400 })
  }
}
