// ─────────────────────────────────────────────────────────────────
// KALEIDO 传感层（player_events）· 依据 docs/plan/kaleido/02 §2.4 + 00-spec §5.6
// ─────────────────────────────────────────────────────────────────
// 只对 kaleido 局发射；fire-and-forget + try/catch 吞错 —— 遥测失败绝不阻断玩家动作
//   （镜像 src/lib/server/deathLog.js 的 insert 范式）。批量 insert 省往返。
// 发射 gate 在 persistResolutionWithPollution：`isKaleidoRoom(room) && options.action` 才发；
//   sweep/branches 借道调用无 options.action → 不发（主对话裁决，🔒 已列为审点）。
// 纯模块（无 @/ 别名、无 DB 依赖的顶层 import）：buildActionEvent/sanitizePayload 可被
//   原生 Node ESM 直接 smoke（scripts/smoke-kaleido-events.mjs）。emitPlayerEvents 只在传入 client 时触库。

// action 名（executeGameAction payload.action / 内部动作名）→ 规格动词（00-spec §5.6 / 02 §2.4）
export const ACTION_VERB = {
  search: 'search',
  attackNpc: 'attack',
  craftItem: 'craft_attempt',
  useItem: 'item_use',
  move: 'move',
  advanceChamber: 'move',
  // flee(emergencyRetreat/normalRetreat) / npc_spare / npc_overkill / fight_start：
  //   语义需结算点细节，P0 先接主动词；后续在各结算点显式发（携 payload.kind 区分）。
}

const VERB_MAX = 40          // verb 长度上限（防脏动词）
const PAYLOAD_MAX_KEYS = 24  // payload 键上限（防把整张 gamevars 塞进事件）
const PAYLOAD_STR_MAX = 200  // 字符串值截断

// 只留标量/短值，剔除对象/数组（事件是轻量遥测，不做深拷贝大结构）。
function sanitizePayload(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return {}
  const out = {}
  let n = 0
  for (const k of Object.keys(p)) {
    if (n >= PAYLOAD_MAX_KEYS) break
    const v = p[k]
    if (v === null || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v
      n++
    } else if (typeof v === 'string') {
      out[k] = v.slice(0, PAYLOAD_STR_MAX)
      n++
    }
  }
  return out
}

// 批量插入 player_events（service client）。fire-and-forget：调用方以 `.catch(() => {})` 不 await。
// rows: [{ player_id, run_id?, level_seq?, verb, payload? }]
export async function emitPlayerEvents(client, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return
  try {
    const clean = rows
      .filter((r) => r && r.player_id && r.verb)
      .map((r) => ({
        player_id: r.player_id,
        run_id: r.run_id ?? null,
        level_seq: Number.isFinite(r.level_seq) ? r.level_seq : null,
        verb: String(r.verb).slice(0, VERB_MAX),
        payload: sanitizePayload(r.payload),
      }))
    if (clean.length === 0) return
    const { error } = await client.from('player_events').insert(clean)
    if (error) console.error('[kaleido/events] insert 失败:', error.message)
  } catch (e) {
    console.error('[kaleido/events] 异常:', e?.message)
  }
}

// 从 gamevars + action 推导一条动作事件（在 /api/game/actions 路由边界、kaleido 局 && 已映射动词时调用）。
// 路由边界发射：只有真实玩家动作经路由（sweep/branches 借道属服务端内部、绝不经路由）→ 天然满足
//   「只对 kaleido 局 + 只真实动作 + sweep/branches 不发」（主对话获批语义，实现从 persist 收口下移到路由）。
// run 关联从 gamevars.kaleido（startKaleidoRun 写入 { runId, currentSeq }）取；无则 null（大厅侧事件可空）。
export function buildActionEvent(userId, gamevars, action) {
  const verb = ACTION_VERB[action]
  if (!verb || !userId) return null
  const gv = gamevars || {}
  const kal = gv.kaleido || {}
  const player = (gv.players && gv.players[userId]) || {}
  return {
    player_id: userId,
    run_id: kal.runId ?? null,
    level_seq: Number.isFinite(kal.currentSeq) ? kal.currentSeq : null,
    verb,
    payload: {
      turnCount: player.turnCount ?? null,
      hp: player.hp ?? null,
      alive: player.alive ?? null,
    },
  }
}

// 死亡事件（logPlayerDeath 汇聚点调用；覆盖所有死因）。ctx 里透传 kaleido 关联。
export function buildDeathEvent(userId, { runId = null, levelSeq = null, reason = 'other' } = {}) {
  if (!userId) return null
  return {
    player_id: userId,
    run_id: runId,
    level_seq: Number.isFinite(levelSeq) ? levelSeq : null,
    verb: 'death',
    payload: { reason: String(reason).slice(0, PAYLOAD_STR_MAX) },
  }
}
