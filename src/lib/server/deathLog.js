/**
 * Phase 18.3 — 玩家死亡日志（跨周目持久）
 *
 * 用法：在 gameActions.js 各死亡分支（NPC 反击致死、PvP 致死、Ω 倒计时、
 * 污染崩溃）调用 logPlayerDeath()，写入 player_death_log。
 *
 * 客户端从 /archive 页读取，按 user_id 列出最近 N 条。
 */

const REASON_TEXTS = {
  pvp:                 (ctx) => `被 ${ctx.attacker || '未知敌方'} 攻击致死`,
  npc_counter:         (ctx) => `${ctx.npcName || '未知实体'} 反击致命`,
  omega_timeout:       () => 'Ω-段倒计时归零，结构应力撕裂',
  pollution_meltdown:  (ctx) => `污染崩溃（环境 ${ctx.envPollution || 0}% / 个人 ${ctx.personalPollution || 0}%）`,
  other:               () => '未知原因致死',
}

/**
 * 写入一条死亡记录
 * @param {object} client supabase admin client
 * @param {string} userId 玩家 UUID
 * @param {object} payload { roomId, gamenum, mapId, reason, context }
 */
export async function logPlayerDeath(client, userId, payload = {}) {
  const reason = payload.reason || 'other'
  const ctx = payload.context || {}
  const reasonText = (REASON_TEXTS[reason] || REASON_TEXTS.other)(ctx)

  try {
    const { error } = await client.from('player_death_log').insert({
      user_id:     userId,
      room_id:     payload.roomId || null,
      gamenum:     payload.gamenum || null,
      map_id:      payload.mapId ?? null,
      reason,
      reason_text: reasonText,
      context:     ctx,
    })
    if (error) console.error('[deathLog] insert 失败:', error.message)
  } catch (e) {
    console.error('[deathLog] 异常:', e?.message)
  }
}
