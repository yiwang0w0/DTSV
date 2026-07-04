/**
 * Phase 18.3 — 玩家死亡日志（跨周目持久）
 *
 * 用法：在 gameActions.js 各死亡分支（NPC 反击致死、PvP 致死、Ω 倒计时、
 * 污染崩溃）调用 logPlayerDeath()，写入 player_death_log。
 *
 * 写入侧（logPlayerDeath）仍在用；读取展示的 /archive 页已于 2026-07-04 下线，
 * 现仅作遥测/DB 留存（healthcheck 与 DeathReviewModal 单局复盘另有取数路径）。
 */

const REASON_TEXTS = {
  pvp:                 (ctx) => `被 ${ctx.attacker || '未知敌方'} 攻击致死`,
  npc_counter:         (ctx) => `${ctx.npcName || '未知实体'} 反击致命`,
  omega_timeout:       () => 'Ω-段倒计时归零，结构应力撕裂',
  pollution_meltdown:  (ctx) => `污染崩溃（环境 ${ctx.envPollution || 0}% / 个人 ${ctx.personalPollution || 0}%）`,
  // BR 缩圈致死：玩家所在扇区被收缩为禁区（脚下扇区关闭），被时空边界吞没。
  contraction:         () => '所在扇区收缩为禁区，被时空边界吞没',
  other:               () => '未知原因致死',
}

// Phase 25c — reason → cause_category enum 同步（DB ENUM 只接受这些值）
// BR 缩圈致死 'contraction' 需配套 SQL ALTER TYPE death_cause_category ADD VALUE（见 scripts/phase-31-contraction-death-cause.sql）。
const VALID_CAUSE_CATEGORIES = new Set([
  'pvp', 'npc_counter', 'omega_timeout', 'pollution_meltdown', 'contraction', 'other',
])

/**
 * 写入一条死亡记录
 * @param {object} client supabase admin client
 * @param {string} userId 玩家 UUID
 * @param {object} payload { roomId, gamenum, mapId, reason, context, survivedSeconds, chamberDepth }
 *   Phase 25c 新增可选字段:
 *   - survivedSeconds: 该次 raid 存活秒数 (raid 开始 → 死亡)
 *   - chamberDepth:    死亡时 chamber 深度 (1=cold ... 5=volatile, 0/未提供 → null)
 */
export async function logPlayerDeath(client, userId, payload = {}) {
  const reason = payload.reason || 'other'
  const ctx = payload.context || {}
  const reasonText = (REASON_TEXTS[reason] || REASON_TEXTS.other)(ctx)
  const causeCategory = VALID_CAUSE_CATEGORIES.has(reason) ? reason : 'other'

  const survivedSeconds = Number.isFinite(payload.survivedSeconds) && payload.survivedSeconds >= 0
    ? Math.floor(payload.survivedSeconds)
    : null
  const chamberDepth = Number.isFinite(payload.chamberDepth) && payload.chamberDepth >= 0 && payload.chamberDepth <= 10
    ? Math.floor(payload.chamberDepth)
    : null

  try {
    const { error } = await client.from('player_death_log').insert({
      user_id:          userId,
      room_id:          payload.roomId || null,
      gamenum:          payload.gamenum || null,
      map_id:           payload.mapId ?? null,
      reason,
      reason_text:      reasonText,
      context:          ctx,
      cause_category:   causeCategory,
      survived_seconds: survivedSeconds,
      chamber_depth:    chamberDepth,
    })
    if (error) console.error('[deathLog] insert 失败:', error.message)
  } catch (e) {
    console.error('[deathLog] 异常:', e?.message)
  }
}
