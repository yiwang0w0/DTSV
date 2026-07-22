// ─────────────────────────────────────────────────────────────────
// KALEIDO 传感层（player_events）· 依据 docs/plan/kaleido/02 §2.4 + 00-spec §5.6
// ─────────────────────────────────────────────────────────────────
// 只对 kaleido 局发射；fire-and-forget + try/catch 吞错 —— 遥测失败绝不阻断玩家动作
//   （镜像 src/lib/server/deathLog.js 的 insert 范式）。批量 insert 省往返。
// 发射 gate 在 persistResolutionWithPollution：`isKaleidoRoom(room) && options.action` 才发；
//   sweep/branches 借道调用无 options.action → 不发（主对话裁决，🔒 已列为审点）。
// 纯模块（无 @/ 别名、无 DB 依赖的顶层 import）：buildActionEvent/sanitizePayload 可被
//   原生 Node ESM 直接 smoke（scripts/smoke-kaleido-events.mjs）。emitPlayerEvents 只在传入 client 时触库。

// action 名（executeGameAction payload.action）→ 规格动词（00-spec §5.6 / 02 §2.4）。
// 路由边界据此发射。不在此表的服务端动词（KP0-R S3）：
//   craft_attempt —— 在 craftItemRecipe 处理器内发（要携带 success_rate/结果，边界拿不到）；
//   npc_overkill —— 在 resolveNpcAttackAction 击杀分支内发（要 damage vs 剩余HP，边界拿不到）；
//   fight_start —— 路由边界对比动作前后 encounter（null→有 = 遭遇建立）内联发。
export const ACTION_VERB = {
  search: 'search',
  attackNpc: 'attack',
  useItem: 'item_use',
  move: 'move',
  advanceChamber: 'move',
  emergencyRetreat: 'flee',        // flee（DTSV 无 normalRetreat 动作，flee=紧急撤退）
  releaseEncounter: 'npc_spare',   // 放走遭遇 NPC = spare
}

// 消耗性动词（02 §2.2 回合模型：每动作 turnCount+1）。与 ACTION_VERB 解耦：
//   craftItem 计回合但不在边界发射（in-handler 发）；flee/spare 发射但不计回合。
export const TURN_ACTIONS = ['search', 'attackNpc', 'craftItem', 'useItem', 'move', 'advanceChamber']

// ── 流血动词（step1 负伤机制 · 2026-07-23 · ⚙️ 口径变更经 🧭 批）─────────────────
//   口径**不是**「搜索导致掉血」，而是「**负伤在持续流血，每个消耗性动作都在流**」。
//   三条理由（🧭 采纳 ⚙️ 提议）：
//     ① 堵掉 `releaseEncounter` 的零成本洞 —— 走开是正当策略，但走开也要花血，免费就不是决策；
//     ② 贴 Kanata 的原用词「**负伤 BUFF**」——是伤在流血，不是翻找在流血；
//     ③ 结构性收益：以后新增动作**默认落在流血面里**，不用每次再想一遍会不会又开一个零成本洞。
//   ⚠ 与 TURN_ACTIONS 的区别是**刻意的**：`releaseEncounter` **流血但不计回合** ——
//     计回合会改 survive_turns 的清关速度（那是 ⚙️ 没要的平衡变更），而流血只花血、不改过关节奏。
//   ⚠ kaleido-scoped：多人局不读本表（Phase 37 的 releaseEncounter 语义原样不动）。
export const BLEED_ACTIONS = [...TURN_ACTIONS, 'releaseEncounter']

// 事件 level_seq 归因的**唯一口径**（KP0-R 缺陷B）：物理关 = player.chamberIndex + 1。
//   不用 gamevars.kaleido.currentSeq——advance 过关后 currentSeq 已指向下一关，会把「清关那记动作」
//   及「清关后滞留原关的动作」错标到还没进入的下一关；chamberIndex 只由 movePlayer 推进，是真实物理关。
//   与 advanceKaleidoProgress 的 level_clear（用物理 seq=chamberIndex+1）口径合一。
export function kaleidoLevelSeq(player) {
  return Number.isFinite(player?.chamberIndex) ? player.chamberIndex + 1 : null
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
    level_seq: kaleidoLevelSeq(player), // 物理关口径（缺陷B），非 kal.currentSeq
    verb,
    payload: {
      action, // 原始动作名（flee 的 kind / move vs advanceChamber 消歧）
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
