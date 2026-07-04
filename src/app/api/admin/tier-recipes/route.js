/**
 * /api/admin/tier-recipes — 装备升阶配方写路径（仅管理员 · service_role）。
 *
 * 🔒 phase-51 RLS 收紧联动：tier_recipes / recipe_ingredients 写仅 service_role 后，
 *   EquipmentSeriesSection.saveRecipe() 改走这里。逻辑与原客户端 saveRecipe 逐值等价：
 *   主表 upsert → 清本配方旧材料 → 批量插新材料。列走白名单（防注入任意列）。
 */
import { NextResponse } from 'next/server'
import { createServerSupabase, getRequestUser } from '@/lib/serverSupabase'
import { isAdmin } from '@/lib/auth'

const RECIPE_COLS = [
  'result_tier_id', 'recipe_name', 'requires_prev_tier_id', 'requires_prev_series_id',
  'requires_prev_tier_num', 'gold_cost', 'success_rate', 'fail_behavior',
]

export async function POST(request) {
  const supabase = createServerSupabase()
  const auth = await getRequestUser(request, supabase)
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!isAdmin(auth.user)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 })

  let body
  try { body = await request.json() } catch { body = {} }
  const { op, recipeId, recipe, ingredients } = body

  try {
    if (op === 'save') {
      const payload = {}
      for (const k of RECIPE_COLS) if (recipe?.[k] !== undefined) payload[k] = recipe[k]
      if (payload.result_tier_id == null) return NextResponse.json({ error: '缺少产出装备阶级' }, { status: 400 })

      let id = recipeId || null
      if (id) {
        const { error } = await supabase.from('tier_recipes').update(payload).eq('id', id)
        if (error) throw new Error(error.message)
      } else {
        const { data, error } = await supabase.from('tier_recipes').insert(payload).select('id').single()
        if (error) throw new Error(error.message)
        id = data?.id
      }
      if (!id) return NextResponse.json({ error: '配方保存失败' }, { status: 400 })

      const { error: delErr } = await supabase.from('recipe_ingredients').delete().eq('recipe_id', id)
      if (delErr) throw new Error(delErr.message)

      const list = Array.isArray(ingredients) ? ingredients : []
      const childRows = list
        .filter((i) => i.item_id || i.equipment_tier_id)
        .map((i) => ({
          recipe_id: id,
          ingredient_type: i.ingredient_type || 'item',
          item_id: i.ingredient_type === 'item' ? i.item_id : null,
          equipment_tier_id: i.ingredient_type === 'equipment' ? i.equipment_tier_id : null,
          quantity: i.quantity || 1,
          is_consumed: i.is_consumed !== false,
          is_catalyst: !!i.is_catalyst,
        }))
      if (childRows.length > 0) {
        const { error: insErr } = await supabase.from('recipe_ingredients').insert(childRows)
        if (insErr) throw new Error(insErr.message)
      }
      return NextResponse.json({ ok: true, id })
    }

    return NextResponse.json({ error: '未知动作' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error.message || '操作失败' }, { status: 400 })
  }
}
