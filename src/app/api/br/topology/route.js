/**
 * /api/br/topology — BR 静态拓扑 + 模板元数据端点（gamevars 瘦身·客户端一次性拉取）
 *
 * 背景：gamevars.br 此前内嵌 rooms（18.7KB 静态拓扑）+ templateMeta（10.9KB），每动作整段写库 + realtime
 *   广播 ~40-50KB → 拖慢免费服务器。这两块对**所有对局完全相同**（br_rooms 拓扑 + 全部 enabled
 *   chamber_templates 折算的伪 chamber 字段），故抽成独立端点：客户端跨对局/跨组件拉一次永久缓存，
 *   不再随每个动作广播。收益即在于此。
 *
 * 返回（强缓存 immutable，所有对局共用）：
 *   rooms        [{ roomId, label, region, gridX, gridY, neighborIds }]（br_rooms 全表 ~100 行）
 *   templateMeta { [templateId]: 伪 chamber 字段子集 }（全部 enabled chamber_templates，经 toTemplateMeta）
 *
 * 鉴权：照 /api/br 的 requireRequestUser 范式取 service-role supabase（br_rooms / chamber_templates
 *   无面向匿名的 RLS 读策略，既有 BR 读路径全走 service-role，故服务端路由最稳）。
 *
 * 与 gamevars 解耦：拓扑/模板纯静态、从不随对局变 → 客户端即便命中旧缓存也正确，可长缓存。
 */

import { NextResponse } from 'next/server'
import { requireRequestUser } from '@/lib/serverSupabase'
import { loadRooms } from '@/lib/server/br/zones'
import { toTemplateMeta } from '@/lib/server/br/roomTemplates'

export async function GET(request) {
  const auth = await requireRequestUser(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.response.error }, { status: auth.response.status })
  }

  try {
    // 并发拉静态拓扑（br_rooms 全表）+ 全部 enabled 模板
    const [rooms, chamberRes] = await Promise.all([
      loadRooms(auth.supabase),
      auth.supabase.from('chamber_templates').select('*').eq('enabled', true),
    ])

    // 精简拓扑字段（closePhase 客户端从 gamevars.br.closePhases 读，此处不下发）
    const slimRooms = (Array.isArray(rooms) ? rooms : []).map((r) => ({
      roomId: r.roomId,
      label: r.label,
      region: r.region,
      gridX: r.gridX,
      gridY: r.gridY,
      neighborIds: r.neighborIds,
    }))

    // 全部 enabled 模板 → { [templateId]: 伪 chamber 字段子集 }（与 getRaidLayout 同一折算源）
    const templateMeta = Object.fromEntries(
      (chamberRes?.data || []).map((t) => [t.id, toTemplateMeta(t)]),
    )

    return NextResponse.json(
      { rooms: slimRooms, templateMeta },
      { headers: { 'Cache-Control': 'public, max-age=86400, immutable' } },
    )
  } catch (e) {
    console.error('[br/topology] GET 失败:', e?.message || e)
    return NextResponse.json({ error: e?.message || '请求失败' }, { status: 500 })
  }
}
