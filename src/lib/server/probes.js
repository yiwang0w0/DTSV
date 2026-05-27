/**
 * Phase 21 — 异步 PvPVE 探针系统
 *
 * 玩家撤离时可消耗 1 件 platform_part 留下"探针"，长 7 天放在该 chamber 模板池里。
 * 其他玩家进入同 chamber_template 时有 5-10% 概率遭遇该探针 → 选择"袭击/放过"。
 * 击败探针 → 抢主人 1 条残片 decode +1。
 */

const PROBE_ENCOUNTER_CHANCE = 0.08 // 8% 进入 chamber 时遭遇探针
const PROBE_FRAGMENTS_CARRY_LIMIT = 3 // 主人留下的可被夺残片最多 3 条
const PROBE_ENCOUNTER_LOG_MAX = 50  // Phase 25d encounter_log 每条探针最多保留 50 条事件（防 JSONB 膨胀）

// Phase 25e — outcome → 收件箱文案 / kind 映射
// 28-E P0 anonymization: 不存 attacker user_id，只存 pseudonym
const PROBE_NOTIFY_META = {
  spared:          { kind: 'probe_spared',          emoji: '🕊️', verb: '放过' },
  defeated:        { kind: 'probe_defeated',        emoji: '💥', verb: '击败' },
  killed_attacker: { kind: 'probe_killed_attacker', emoji: '⚔️', verb: '反杀' },
}

function buildProbePseudonym(byUserId) {
  if (!byUserId) return '未知幸存者'
  const short = String(byUserId).replace(/-/g, '').slice(0, 4).toUpperCase()
  return `观测者-${short}`
}

/**
 * Phase 25e — 给探针主人投递一条"回信"。
 * 仅在最终 outcome (spared/defeated/killed_attacker) 时调用，encountered 中间态不发。
 * 任何异常仅 console.error，不阻塞战斗结算。
 */
async function notifyProbeOwner(client, { ownerId, probeId, chamberTemplateId, byUserId, outcome }) {
  if (!ownerId || !outcome) return
  const meta = PROBE_NOTIFY_META[outcome]
  if (!meta) return
  try {
    const pseudonym = buildProbePseudonym(byUserId)
    const chamberLabel = chamberTemplateId ? `chamber #${chamberTemplateId}` : '某个 chamber'
    const title = `${meta.emoji} 探针回信:${pseudonym}${meta.verb}了你的探针`
    const bodyByOutcome = {
      spared:          `${pseudonym} 在 ${chamberLabel} 选择避开你的探针,无声离开。探针仍在执勤。`,
      defeated:        `${pseudonym} 在 ${chamberLabel} 击败了你的探针,可能夺走了你携带的残片。`,
      killed_attacker: `你的探针在 ${chamberLabel} 反杀了 ${pseudonym}。chamber 仍在你的控制下。`,
    }
    await client.from('player_notifications').insert({
      user_id: ownerId,
      kind: meta.kind,
      title,
      body: bodyByOutcome[outcome] || '',
      payload: {
        probe_id: probeId || null,
        chamber_template_id: chamberTemplateId || null,
        by_pseudonym: pseudonym,
        outcome,
      },
    })
  } catch (e) {
    console.error('[notifyProbeOwner] 失败:', e?.message)
  }
}

/**
 * Phase 25d — 通用 outcome 记录器，追加事件到 encounter_log 并递增对应计数列。
 * outcome: 'spared' | 'defeated' | 'killed_attacker' | 'escaped'
 * 不阻塞调用方（任何失败仅 console.error），不进入事务以避免拖慢战斗结算。
 */
export async function recordProbeOutcome(client, probeId, byUserId, outcome) {
  if (!probeId || !outcome) return
  try {
    const { data: probe } = await client
      .from('cross_room_probes')
      .select('encounter_log, spared_count, killed_attacker_count, owner_id, chamber_template_id')
      .eq('id', probeId)
      .maybeSingle()
    if (!probe) return

    const prevLog = Array.isArray(probe.encounter_log) ? probe.encounter_log : []
    const nextLog = [
      ...prevLog,
      { ts: new Date().toISOString(), by: byUserId || null, outcome },
    ].slice(-PROBE_ENCOUNTER_LOG_MAX)

    const patch = { encounter_log: nextLog }
    if (outcome === 'spared') {
      patch.spared_count = (probe.spared_count || 0) + 1
    } else if (outcome === 'killed_attacker') {
      patch.killed_attacker_count = (probe.killed_attacker_count || 0) + 1
    }

    await client.from('cross_room_probes').update(patch).eq('id', probeId)

    // Phase 25e — 给主人投递回信（spared / killed_attacker，defeated 在 defeatProbe 里自己投）
    if (outcome === 'spared' || outcome === 'killed_attacker') {
      await notifyProbeOwner(client, {
        ownerId: probe.owner_id,
        probeId,
        chamberTemplateId: probe.chamber_template_id,
        byUserId,
        outcome,
      })
    }
  } catch (e) {
    console.error('[recordProbeOutcome] 失败:', e?.message)
  }
}

/**
 * 撤离时留探针：消耗 1 件 platform_part；写入 cross_room_probes。
 *
 * @param {object} client - supabase admin client
 * @param {object} opts - { ownerId, chamberTemplateId, equipmentSnapshot, atk, def, fragmentsCarry }
 * @returns {object|null} 写入的 probe 记录 或 null（失败时）
 */
export async function leaveProbe(client, opts) {
  const {
    ownerId,
    chamberTemplateId,
    equipmentSnapshot = {},
    atk = 12,
    def = 8,
    hp = 60,
    fragmentsCarry = [],
  } = opts || {}

  if (!ownerId || !chamberTemplateId) return null

  try {
    const { data, error } = await client
      .from('cross_room_probes')
      .insert({
        owner_id: ownerId,
        chamber_template_id: chamberTemplateId,
        hp,
        max_hp: hp,
        atk,
        def,
        equipment_snapshot: equipmentSnapshot,
        fragments_carry: fragmentsCarry.slice(0, PROBE_FRAGMENTS_CARRY_LIMIT),
        status: 'active',
      })
      .select()
      .maybeSingle()
    if (error) {
      console.error('[leaveProbe] insert 失败:', error?.message)
      return null
    }
    return data
  } catch (e) {
    console.error('[leaveProbe] 异常:', e?.message)
    return null
  }
}

/**
 * 进入 chamber 时尝试抽一个探针来遭遇。
 * 排除自己留的探针 + 已过期 + 已击败。
 *
 * @param {object} client
 * @param {string} userId - 当前玩家（不能遇到自己的探针）
 * @param {number} chamberTemplateId
 * @returns {object|null} 探针记录 或 null
 */
export async function tryEncounterProbe(client, userId, chamberTemplateId) {
  if (!chamberTemplateId) return null
  if (Math.random() >= PROBE_ENCOUNTER_CHANCE) return null

  try {
    const now = new Date().toISOString()
    const { data, error } = await client
      .from('cross_room_probes')
      .select('*')
      .eq('chamber_template_id', chamberTemplateId)
      .eq('status', 'active')
      .neq('owner_id', userId)
      .gt('expires_at', now)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) {
      // 不是真错误 — 单纯没找到
      return null
    }
    if (!data) return null

    // Phase 25d — found_count 自增 + encounter_log 追加 "encountered" 事件
    const prevLog = Array.isArray(data.encounter_log) ? data.encounter_log : []
    const nextLog = [
      ...prevLog,
      { ts: new Date().toISOString(), by: userId || null, outcome: 'encountered' },
    ].slice(-PROBE_ENCOUNTER_LOG_MAX)

    await client
      .from('cross_room_probes')
      .update({
        found_count: (data.found_count || 0) + 1,
        encounter_log: nextLog,
      })
      .eq('id', data.id)

    return data
  } catch (e) {
    console.error('[tryEncounterProbe] 异常:', e?.message)
    return null
  }
}

/**
 * 玩家击败探针 → 标 defeated + defeated_by + 抢 1 条残片
 *
 * @param {object} client
 * @param {number} probeId
 * @param {string} attackerId
 * @returns {{stolenFragmentId, stolenFragmentName}|null}
 */
export async function defeatProbe(client, probeId, attackerId) {
  try {
    const { data: probe } = await client
      .from('cross_room_probes')
      .select('*')
      .eq('id', probeId)
      .maybeSingle()
    if (!probe || probe.status !== 'active') return null

    // Phase 25d — 追加 "defeated" 事件到 encounter_log
    const prevLog = Array.isArray(probe.encounter_log) ? probe.encounter_log : []
    const nextLog = [
      ...prevLog,
      { ts: new Date().toISOString(), by: attackerId || null, outcome: 'defeated' },
    ].slice(-PROBE_ENCOUNTER_LOG_MAX)

    await client
      .from('cross_room_probes')
      .update({
        status: 'defeated',
        defeated_at: new Date().toISOString(),
        defeated_by: attackerId,
        defeated_count: (probe.defeated_count || 0) + 1,
        encounter_log: nextLog,
        hp: 0,
      })
      .eq('id', probeId)

    // Phase 25e — 给主人投递"被击败"回信（pseudonym，不泄漏 attacker uuid）
    await notifyProbeOwner(client, {
      ownerId: probe.owner_id,
      probeId,
      chamberTemplateId: probe.chamber_template_id,
      byUserId: attackerId,
      outcome: 'defeated',
    })

    // 抢 1 条残片 — 从 fragments_carry 随机选一条让 attacker decode +1
    const carry = Array.isArray(probe.fragments_carry) ? probe.fragments_carry : []
    if (carry.length === 0) return { stolenFragmentId: null, stolenFragmentName: null }

    const targetFragId = carry[Math.floor(Math.random() * carry.length)]

    // 推进 attacker 在 targetFragId 上的 decode_level（如果尚未发现则以 level=1 写入）
    const { data: existing } = await client
      .from('player_fragments')
      .select('decode_level')
      .eq('user_id', attackerId)
      .eq('fragment_id', targetFragId)
      .maybeSingle()

    let newLevel = 1
    if (existing) {
      newLevel = Math.min(3, (existing.decode_level || 0) + 1)
    }

    const upsertPayload = {
      user_id: attackerId,
      fragment_id: targetFragId,
      decode_level: newLevel,
      last_decoded: new Date().toISOString(),
    }
    if (!existing) {
      upsertPayload.discovered_at = new Date().toISOString()
      upsertPayload.discover_cycle = -1 // -1 表示从探针夺取（非搜索/战斗/撤离）
    }
    await client
      .from('player_fragments')
      .upsert(upsertPayload, { onConflict: 'user_id,fragment_id' })

    // 查残片名字（log 用）
    const { data: fragMeta } = await client
      .from('fragment_pool')
      .select('id, name')
      .eq('id', targetFragId)
      .maybeSingle()

    return {
      stolenFragmentId: targetFragId,
      stolenFragmentName: fragMeta?.name || `残片 #${targetFragId}`,
      newLevel,
    }
  } catch (e) {
    console.error('[defeatProbe] 异常:', e?.message)
    return null
  }
}
