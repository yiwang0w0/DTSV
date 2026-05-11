/**
 * Phase 21 — 异步 PvPVE 探针系统
 *
 * 玩家撤离时可消耗 1 件 platform_part 留下"探针"，长 7 天放在该 chamber 模板池里。
 * 其他玩家进入同 chamber_template 时有 5-10% 概率遭遇该探针 → 选择"袭击/放过"。
 * 击败探针 → 抢主人 1 条残片 decode +1。
 */

const PROBE_ENCOUNTER_CHANCE = 0.08 // 8% 进入 chamber 时遭遇探针
const PROBE_FRAGMENTS_CARRY_LIMIT = 3 // 主人留下的可被夺残片最多 3 条

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

    // 增加 found_count
    await client
      .from('cross_room_probes')
      .update({ found_count: (data.found_count || 0) + 1 })
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

    await client
      .from('cross_room_probes')
      .update({
        status: 'defeated',
        defeated_at: new Date().toISOString(),
        defeated_by: attackerId,
        defeated_count: (probe.defeated_count || 0) + 1,
        hp: 0,
      })
      .eq('id', probeId)

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
