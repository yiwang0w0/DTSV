/**
 * /api/admin/passive-skills — 被动技能写路径（仅管理员 · service_role）。
 *
 * 🔒 phase-51 RLS 收紧联动：passive_skills 写仅 service_role 后，EquipmentPassivesSection 改走这里。
 *   列走白名单；服务端再做一次战斗管线字段归一（stage/condition 空→null · priority→int），守 DB CHECK。
 */
import { NextResponse } from 'next/server'
import { createServerSupabase, getRequestUser } from '@/lib/serverSupabase'
import { isAdmin } from '@/lib/auth'

const PASSIVE_COLS = [
  'name', 'icon', 'description', 'trigger_event', 'effect_type', 'effect_formula', 'effect_target',
  'trigger_chance', 'buff_id', 'cooldown_turns', 'value', 'stage', 'priority', 'condition_formula',
]

export async function POST(request) {
  const supabase = createServerSupabase()
  const auth = await getRequestUser(request, supabase)
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!isAdmin(auth.user)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 })

  let body
  try { body = await request.json() } catch { body = {} }
  const { op, id, passive } = body

  try {
    if (op === 'save') {
      if (!passive?.name || !String(passive.name).trim()) {
        return NextResponse.json({ error: '请填写技能名称' }, { status: 400 })
      }
      const allowed = {}
      for (const k of PASSIVE_COLS) if (passive[k] !== undefined) allowed[k] = passive[k]
      // 战斗管线字段归一（守 passive_skills_stage_check + parseModifier 中性）
      allowed.stage = allowed.stage ? allowed.stage : null
      allowed.condition_formula = (allowed.condition_formula && String(allowed.condition_formula).trim()) || null
      allowed.priority = Number.isFinite(parseInt(allowed.priority)) ? parseInt(allowed.priority) : 100

      if (id) {
        const { error } = await supabase.from('passive_skills').update(allowed).eq('id', id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('passive_skills').insert(allowed)
        if (error) throw new Error(error.message)
      }
      return NextResponse.json({ ok: true })
    }

    if (op === 'delete') {
      if (id == null) return NextResponse.json({ error: '缺少 ID' }, { status: 400 })
      const { error } = await supabase.from('passive_skills').delete().eq('id', id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: '未知动作' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error.message || '操作失败' }, { status: 400 })
  }
}
