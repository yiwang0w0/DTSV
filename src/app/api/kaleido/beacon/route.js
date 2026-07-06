import { NextResponse } from 'next/server'
import { requireRequestUser } from '@/lib/serverSupabase'
import { emitPlayerEvents } from '@/lib/server/kaleido/events'

// KALEIDO 客户端动词上报（KP0-S 交付物 6 · 02 §2.4 发射点 3 · 00-spec §5.6 客户端侧动词）。
// 信任边界（🔒 KP0-X #2 审计对象）：body = 不可信输入 ——
//   ① 动词白名单：只收客户端侧动词，服务端动词（search/attack/…）一律不收，防伪造行为遥测；
//   ② 身份只信 Bearer token（player_id = auth.user.id），body 里任何身份字段一律忽略；
//   ③ 尺寸上限：body ≤ 8KB、单请求 ≤ 10 事件；数值域钳制（ms ≤ 24h）；
//   ④ run_id 须为 UUID 形状（防批量 insert 被脏值毒死）；context 枚举白名单。
// 客户端用 navigator.sendBeacon / fetch keepalive 上报；失败无害（遥测）。
const CLIENT_VERBS = new Set(['session_end', 'ui_read_ms', 'idle_ms', 'return_latency', 'hesitation_ms'])
const SESSION_END_CONTEXTS = new Set(['after_death', 'after_clear', 'mid_combat', 'idle'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_EVENTS = 10
const MAX_BODY = 8 * 1024
const MAX_MS = 24 * 60 * 60 * 1000

export async function POST(request) {
  const auth = await requireRequestUser(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.response.error }, { status: auth.response.status })
  }

  let raw = ''
  try { raw = await request.text() } catch { raw = '' }
  if (!raw || raw.length > MAX_BODY) {
    return NextResponse.json({ error: '请求体缺失或超限' }, { status: 400 })
  }
  let payload
  try { payload = JSON.parse(raw) } catch {
    return NextResponse.json({ error: '非法 JSON' }, { status: 400 })
  }

  const events = Array.isArray(payload?.events) ? payload.events.slice(0, MAX_EVENTS) : []
  const rows = []
  for (const ev of events) {
    if (!ev || typeof ev !== 'object' || !CLIENT_VERBS.has(ev.verb)) continue // 白名单外静默丢弃
    const p = {}
    if (Number.isFinite(ev.ms) && ev.ms >= 0) p.ms = Math.min(Math.floor(ev.ms), MAX_MS)
    if (ev.verb === 'session_end' && SESSION_END_CONTEXTS.has(ev.context)) p.context = ev.context
    rows.push({
      player_id: auth.user.id, // 身份只信 token
      run_id: typeof ev.runId === 'string' && UUID_RE.test(ev.runId) ? ev.runId : null,
      level_seq: Number.isFinite(ev.levelSeq) ? Math.floor(ev.levelSeq) : null,
      verb: ev.verb,
      payload: p,
    })
  }
  if (rows.length > 0) await emitPlayerEvents(auth.supabase, rows)
  return NextResponse.json({ ok: true, accepted: rows.length })
}
