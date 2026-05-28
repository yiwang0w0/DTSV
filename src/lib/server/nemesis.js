/**
 * nemesis.js — Nemesis 重复遭遇升级（Phase 21/24b 预埋）
 *
 * research 2026-05-28-E P1 — 把"同一对玩家反复在异步探针层相遇"的重复噪声
 * 升级为 emergent narrative（USPTO 9539518 Nemesis 模式）。
 *
 * 触发点（record）：每次探针遭遇结算后，按 (attacker, owner) 成对累计。
 * 升级条件：30 天滚动窗口内同对遭遇 >= NEMESIS_THRESHOLD 次 → 标记 nemesis。
 * 消费点（status）：遭遇 UI banner + 双方"宿敌再次相遇"通知（Phase 21/24b 接入）。
 *
 * 反 PII（28-E anonymization 一致性）：本 helper 操作的 probe_encounter_pairs 存真实
 * user_id（服务端撮合用，与 cross_room_probes 同口径）。面向玩家的文案必须用
 * probes.js buildOwnerPseudonym 派生的稳定代号，绝不渲染真实 id。
 *
 * 全部 exception-safe — 任何失败仅 console.error，绝不阻塞遭遇/战斗结算。
 * 预埋不启用：等 Phase 21/24b 把遭遇埋点接到 gameActions / 探针遭遇分支。
 */

const NEMESIS_THRESHOLD = 3            // 窗口内遭遇次数达到此值 → 宿敌
const NEMESIS_WINDOW_DAYS = 30        // 滚动窗口长度（天）
const NEMESIS_WINDOW_MS = NEMESIS_WINDOW_DAYS * 24 * 3600 * 1000

const VALID_OUTCOMES = new Set([
  'encountered',
  'spared',
  'defeated',
  'killed_attacker',
  'escaped',
])

export const NEMESIS_CONFIG = Object.freeze({
  THRESHOLD: NEMESIS_THRESHOLD,
  WINDOW_DAYS: NEMESIS_WINDOW_DAYS,
})

/**
 * 记录一次探针遭遇，成对累计，必要时升级为宿敌。
 *
 * @param {object} client - supabase admin client
 * @param {object} opts
 * @param {string} opts.attackerId - 遭遇方（进入 chamber 遇到对方探针的玩家）
 * @param {string} opts.ownerId    - 探针主人
 * @param {string} [opts.outcome='encountered'] - probes.js outcome 同词表
 * @returns {{isNemesis:boolean, justBecameNemesis:boolean, encounterCount:number}|null}
 *          null = 入参无效 / 失败（调用方不应据此中断结算）
 */
export async function recordEncounterPair(client, opts) {
  const { attackerId, ownerId, outcome = 'encountered' } = opts || {}

  if (!attackerId || !ownerId || attackerId === ownerId) return null
  const safeOutcome = VALID_OUTCOMES.has(outcome) ? outcome : 'encountered'

  try {
    const nowMs = Date.now()
    const nowIso = new Date(nowMs).toISOString()

    const { data: existing, error: readErr } = await client
      .from('probe_encounter_pairs')
      .select('id, encounter_count, window_started_at, nemesis_since')
      .eq('attacker_id', attackerId)
      .eq('owner_id', ownerId)
      .maybeSingle()
    if (readErr) {
      console.error('[recordEncounterPair] 读取失败:', readErr?.message)
      return null
    }

    // 首次遭遇 → 新建一行
    if (!existing) {
      const justBecameNemesis = NEMESIS_THRESHOLD <= 1
      const { error: insErr } = await client
        .from('probe_encounter_pairs')
        .insert({
          attacker_id: attackerId,
          owner_id: ownerId,
          encounter_count: 1,
          last_outcome: safeOutcome,
          last_encounter_at: nowIso,
          first_encounter_at: nowIso,
          window_started_at: nowIso,
          nemesis_since: justBecameNemesis ? nowIso : null,
        })
      if (insErr) {
        console.error('[recordEncounterPair] insert 失败:', insErr?.message)
        return null
      }
      return { isNemesis: justBecameNemesis, justBecameNemesis, encounterCount: 1 }
    }

    // 已有记录 → 判断窗口是否过期
    const windowStartMs = existing.window_started_at
      ? Date.parse(existing.window_started_at)
      : NaN
    const windowExpired =
      !Number.isFinite(windowStartMs) || nowMs - windowStartMs > NEMESIS_WINDOW_MS

    const nextCount = windowExpired ? 1 : (existing.encounter_count || 0) + 1
    const alreadyNemesis = !!existing.nemesis_since
    const justBecameNemesis = !alreadyNemesis && nextCount >= NEMESIS_THRESHOLD

    const patch = {
      encounter_count: nextCount,
      last_outcome: safeOutcome,
      last_encounter_at: nowIso,
    }
    if (windowExpired) patch.window_started_at = nowIso
    if (justBecameNemesis) patch.nemesis_since = nowIso // 一旦标记不再清空

    const { error: updErr } = await client
      .from('probe_encounter_pairs')
      .update(patch)
      .eq('id', existing.id)
    if (updErr) {
      console.error('[recordEncounterPair] update 失败:', updErr?.message)
      return null
    }

    return {
      isNemesis: alreadyNemesis || justBecameNemesis,
      justBecameNemesis,
      encounterCount: nextCount,
    }
  } catch (e) {
    console.error('[recordEncounterPair] 异常:', e?.message)
    return null
  }
}

/**
 * 查一对玩家的宿敌状态（遭遇 UI banner / 通知判定用）。
 *
 * @param {object} client
 * @param {string} attackerId
 * @param {string} ownerId
 * @returns {{isNemesis:boolean, encounterCount:number, nemesisSince:(string|null)}}
 *          失败 / 无记录时返回 isNemesis=false 的兜底对象
 */
export async function getNemesisStatus(client, attackerId, ownerId) {
  const fallback = { isNemesis: false, encounterCount: 0, nemesisSince: null }
  if (!attackerId || !ownerId) return fallback

  try {
    const { data, error } = await client
      .from('probe_encounter_pairs')
      .select('encounter_count, nemesis_since')
      .eq('attacker_id', attackerId)
      .eq('owner_id', ownerId)
      .maybeSingle()
    if (error || !data) return fallback
    return {
      isNemesis: !!data.nemesis_since,
      encounterCount: data.encounter_count || 0,
      nemesisSince: data.nemesis_since || null,
    }
  } catch (e) {
    console.error('[getNemesisStatus] 异常:', e?.message)
    return fallback
  }
}
