/**
 * chamberResidue.js — chamber 持续痕迹 v1（"the world remembers"，Phase 21/24b 预埋）
 *
 * research 2026-05-28-E P0 — chamber 失忆是异步层根性缺口。
 * 上一位幸存者在某 chamber_template 击杀了什么 / 拿走了什么 / 倒在哪里，
 * 应作为被动环境痕迹留给下一位进场者（"💀 这里曾有人倒下"）。
 *
 * 触发点（snapshot）：raid 结束结算 / 探针被遭遇时。
 * 消费点（prefetch）：玩家进入 chamber 前，取最近 N 条作为环境氛围信息。
 *
 * 反 PII（28-E anonymization 一致性）：只存 owner_pseudonym（观测者-XXXX），
 * 绝不存真实 user_id / username / email。痕迹 72h 过期（DB 默认）。
 *
 * 全部 exception-safe — 任何失败仅 console.error，绝不阻塞 raid 结算。
 * 预埋不启用：等 Phase 21/24b 入场/撤离流程接入。
 */

import { buildOwnerPseudonym } from './probes'

const RESIDUE_PREFETCH_LIMIT = 5 // 进场 prefetch 最近 N 条
const RESIDUE_SOURCES = new Set(['raid_end', 'probe_encounter'])

/**
 * 写一条 chamber 痕迹快照。
 *
 * @param {object} client - supabase admin client
 * @param {object} opts
 * @param {number} opts.chamberTemplateId - 必填
 * @param {string} [opts.ownerId] - 用于派生匿名代号（不直接存库）
 * @param {string} [opts.ownerPseudonym] - 已派生好的代号；优先于 ownerId
 * @param {string} [opts.lastNpcKilled]
 * @param {string} [opts.lastLootTaken]
 * @param {string} [opts.lastDeathLocation]
 * @param {string} [opts.source='raid_end'] - 'raid_end' | 'probe_encounter'
 * @returns {object|null} 写入的 residue 记录 或 null（失败 / 入参缺失时）
 */
export async function snapshotChamberResidue(client, opts) {
  const {
    chamberTemplateId,
    ownerId,
    ownerPseudonym,
    lastNpcKilled = null,
    lastLootTaken = null,
    lastDeathLocation = null,
    source = 'raid_end',
  } = opts || {}

  if (!chamberTemplateId) return null

  // 至少要有一条痕迹内容，否则不写空快照
  if (!lastNpcKilled && !lastLootTaken && !lastDeathLocation) return null

  const safeSource = RESIDUE_SOURCES.has(source) ? source : 'raid_end'
  const pseudonym = ownerPseudonym || buildOwnerPseudonym(ownerId)

  try {
    const { data, error } = await client
      .from('chamber_residue')
      .insert({
        chamber_template_id: chamberTemplateId,
        owner_pseudonym: pseudonym,
        last_npc_killed: lastNpcKilled,
        last_loot_taken: lastLootTaken,
        last_death_location: lastDeathLocation,
        source: safeSource,
      })
      .select()
      .maybeSingle()
    if (error) {
      console.error('[snapshotChamberResidue] insert 失败:', error?.message)
      return null
    }
    return data
  } catch (e) {
    console.error('[snapshotChamberResidue] 异常:', e?.message)
    return null
  }
}

/**
 * 进入 chamber 前取最近的痕迹（仅未过期），作为环境氛围信息。
 *
 * @param {object} client
 * @param {number} chamberTemplateId
 * @param {number} [limit=5]
 * @returns {Array<object>} 痕迹记录数组（最近优先），失败时空数组
 */
export async function prefetchChamberResidue(client, chamberTemplateId, limit = RESIDUE_PREFETCH_LIMIT) {
  if (!chamberTemplateId) return []
  const safeLimit = Math.max(1, Math.min(20, Number(limit) || RESIDUE_PREFETCH_LIMIT))

  try {
    const now = new Date().toISOString()
    const { data, error } = await client
      .from('chamber_residue')
      .select('id, owner_pseudonym, last_npc_killed, last_loot_taken, last_death_location, source, created_at')
      .eq('chamber_template_id', chamberTemplateId)
      .gt('expires_at', now)
      .order('created_at', { ascending: false })
      .limit(safeLimit)

    if (error) {
      console.error('[prefetchChamberResidue] 查询失败:', error?.message)
      return []
    }
    return Array.isArray(data) ? data : []
  } catch (e) {
    console.error('[prefetchChamberResidue] 异常:', e?.message)
    return []
  }
}
