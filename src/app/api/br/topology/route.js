/**
 * /api/br/topology — BR 静态拓扑 + 模板元数据端点（gamevars 瘦身·客户端一次性拉取）
 *
 * 背景：gamevars.br 此前内嵌 rooms（18.7KB 静态拓扑）+ templateMeta（10.9KB），每动作整段写库 + realtime
 *   广播 ~40-50KB → 拖慢免费服务器。这两块对**所有对局完全相同**（br_rooms 拓扑 + 全部 enabled
 *   chamber_templates 折算的伪 chamber 字段），故抽成独立端点：客户端跨对局/跨组件拉一次永久缓存，
 *   不再随每个动作广播。收益即在于此。
 *
 * 返回（可重验缓存，所有对局共用）：
 *   rooms        [{ roomId, label, region, gridX, gridY, neighborIds }]（br_rooms 全表 ~100 行）
 *   templateMeta { [templateId]: 伪 chamber 字段子集 }（全部 enabled chamber_templates，经 toTemplateMeta）
 *   version      int（= max(updated_at) 毫秒戳，拓扑版本指纹）——admin 改 br_rooms → 触发器 bump
 *                updated_at → version 变大 → 客户端凭 gamevars.br.topoVersion 比对失效旧缓存。
 *
 * 鉴权：照 /api/br 的 requireRequestUser 范式取 service-role supabase（br_rooms / chamber_templates
 *   无面向匿名的 RLS 读策略，既有 BR 读路径全走 service-role，故服务端路由最稳）。
 *
 * 缓存策略：拓扑可被 admin 编辑（§5 拓扑版本），故从 immutable 改为 max-age=60 +
 *   stale-while-revalidate=300（60s 内新鲜、之后后台重验）。客户端另以 `?v=<topoVersion>`
 *   query 打破 HTTP 缓存 + localStorage version 比对 → 在飞局凭自己冻结的 topoVersion 不受污染。
 */

import { NextResponse } from 'next/server'
import { requireRequestUser } from '@/lib/serverSupabase'
import { loadRooms } from '@/lib/server/br/zones'
import { toTemplateMeta } from '@/lib/server/br/roomTemplates'

// 本路由做 per-request 鉴权 + 读实时 Supabase,绝不能被静态预渲染。
// 之前 next build 会在构建期执行 GET → requireRequestUser 读环境变量 →
// 缺 env 时抛「Missing required environment variable」使导出失败。强制动态即修复。
export const dynamic = 'force-dynamic'

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

    // 拓扑版本指纹 = max(updated_at) 毫秒戳（§5）。loadRooms 已映射每行 updatedAt（D 改 zones.js
    //   select + 映射）；旧无该列（迁移未跑）⇒ 全部 0 ⇒ version=0，与「无版本」语义一致、不崩。
    //   与 getRaidLayout 的 computeTopoVersion 同口径（取 max 毫秒），故客户端比对的两侧一致。
    let maxUpdatedAtMs = 0
    for (const r of Array.isArray(rooms) ? rooms : []) {
      const t = r?.updatedAt ? Date.parse(r.updatedAt) : 0
      if (Number.isFinite(t) && t > maxUpdatedAtMs) maxUpdatedAtMs = t
    }

    return NextResponse.json(
      { rooms: slimRooms, templateMeta, version: maxUpdatedAtMs },
      // 可重验缓存：60s 内新鲜，之后后台 revalidate 拿新版本（admin 编辑后客户端另以 ?v= 强制打破）。
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
    )
  } catch (e) {
    console.error('[br/topology] GET 失败:', e?.message || e)
    return NextResponse.json({ error: e?.message || '请求失败' }, { status: 500 })
  }
}
