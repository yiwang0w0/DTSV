/**
 * /api/classes — Phase 24c 职业 API
 *
 * GET   — 拉当前玩家的入场候选（3 normal + 10% legendary）+ class_pt 余额 + 可否保底
 *         可选 ?cached=true 复用 profiles.pending_class_roll（避免每次刷新都重 roll）
 * POST  — { action: 'force' } 消耗 1 class_pt 保底刷一个 legendary 候选追加进列表
 *         { action: 'reroll' } 不消耗,重新 roll 一组候选（仅 dev/admin 可用,默认禁用）
 */

import { NextResponse } from 'next/server'
import { createServerSupabase, getRequestUser } from '@/lib/serverSupabase'
import { rollClassChoices, forceRollLegendary } from '@/lib/server/classes'

export async function GET(request) {
  const supabase = createServerSupabase()
  const auth = await getRequestUser(request, supabase)
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const url = new URL(request.url)
    const cached = url.searchParams.get('cached') === 'true'

    // 复用 profiles.pending_class_roll（如果存在）
    if (cached) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('pending_class_roll')
        .eq('id', auth.user.id)
        .maybeSingle()
      const roll = profile?.pending_class_roll
      if (roll && Array.isArray(roll.candidates) && roll.candidates.length > 0) {
        const { data: cls } = await supabase
          .from('classes')
          .select('id, name, description, rarity, base_atk_bonus, base_def_bonus, base_hp_bonus, perks')
          .in('id', roll.candidates)
          .eq('enabled', true)
        // 还要查 class_pt 余额
        const { data: bal } = await supabase
          .from('player_points')
          .select('balance')
          .eq('user_id', auth.user.id)
          .eq('point_type', 'class_pt')
          .maybeSingle()
        return NextResponse.json({
          candidates: cls || [],
          hasLegendary: (cls || []).some(c => c.rarity === 'legendary'),
          canForceHigh: (bal?.balance || 0) >= 1,
          classPtBalance: bal?.balance || 0,
          cached: true,
        })
      }
    }

    const result = await rollClassChoices(supabase, auth.user.id)

    // 把结果缓存到 profiles.pending_class_roll，跨页面刷新保持
    await supabase
      .from('profiles')
      .update({
        pending_class_roll: {
          candidates: result.candidates.map(c => c.id),
          rolled_at: new Date().toISOString(),
        },
      })
      .eq('id', auth.user.id)

    return NextResponse.json({ ...result, cached: false })
  } catch (e) {
    return NextResponse.json({ error: e.message || '职业候选加载失败' }, { status: 400 })
  }
}

export async function POST(request) {
  const supabase = createServerSupabase()
  const auth = await getRequestUser(request, supabase)
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let payload
  try { payload = await request.json() } catch { payload = {} }
  const action = payload.action

  try {
    if (action === 'force') {
      const result = await forceRollLegendary(supabase, auth.user.id)

      // 把新 candidate 追加到 pending_class_roll
      const { data: profile } = await supabase
        .from('profiles')
        .select('pending_class_roll')
        .eq('id', auth.user.id)
        .maybeSingle()
      const cur = profile?.pending_class_roll || { candidates: [] }
      if (!cur.candidates.includes(result.candidate.id)) {
        cur.candidates.push(result.candidate.id)
      }
      cur.forced_legendary = result.candidate.id
      await supabase.from('profiles').update({ pending_class_roll: cur }).eq('id', auth.user.id)

      return NextResponse.json(result)
    }
    return NextResponse.json({ error: '未知的 action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e.message || '操作失败' }, { status: 400 })
  }
}
