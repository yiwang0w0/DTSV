/**
 * Phase 21 — 异步 PvPVE 探针系统
 *
 * 玩家撤离时可消耗 1 件 platform_part 留下"探针"，长 7 天放在该 chamber 模板池里。
 * 其他玩家进入同 chamber_template 时有 5-10% 概率遭遇该探针 → 选择"袭击/放过"。
 * 击败探针 → 抢主人 1 条残片 decode +1。
 */

import { weightedPick } from '@/lib/weightedPick'
import { clamp } from '@/lib/num'

const PROBE_ENCOUNTER_CHANCE = 0.08 // 8% 进入 chamber 时遭遇探针
const PROBE_FRAGMENTS_CARRY_LIMIT = 3 // 主人留下的可被夺残片最多 3 条
const PROBE_ENCOUNTER_LOG_MAX = 50  // Phase 25d encounter_log 每条探针最多保留 50 条事件（防 JSONB 膨胀）

// research-2026-05-27-v3 P1 — 抽取长尾衰减权重 + chamber 级密度上限
const PROBE_TTL_BOOST_HOURS = 24    // 剩余 TTL 低于此值开始加权（给临近过期探针"最后一次被遇到"的机会）
const PROBE_TTL_BOOST_MULT = 4      // remaining TTL → 0 时的最大权重倍数（长尾上限）
const PROBE_DRAW_CANDIDATE_LIMIT = 20 // 单次抽取纳入加权的候选探针上限（兼作抽样密度上限，防大池全量加载）
const CHAMBER_PROBE_DENSITY_CAP = 8 // 单 chamber 同时存活探针上限；超出时 FIFO 逐出最旧

// research-2026-05-29-E P0 — 探针遭遇属性按遭遇者实力相对缩放 + 硬封顶。
// 治两个体裁失败模式：① whale 探针（高配 equipment_snapshot）单方面碾压新人；
// ② 刻意构造的"毒包"探针。缩放只钳制 instance 战斗属性（落在 player.probeEncounter），
// 绝不回写 DB（owner 真实 snapshot 保留，对每个遭遇者各自相对缩放）。
// 语义：只向下钳制，永不向上 buff —— 弱探针对强玩家保持弱，强探针对弱玩家被压到上限。
//   ceil   = min(硬封顶, max(地板, round(遭遇者对应属性 × 倍率)))
//   scaled = min(原始值, ceil)
const PROBE_HP_CAP_MULT = 1.0    // 探针 HP ≤ 遭遇者 maxHp × 此倍率（相对）
const PROBE_ATK_CAP_MULT = 1.1   // 探针 ATK ≤ 遭遇者 atk × 此倍率（防爆发秒杀）
const PROBE_DEF_CAP_MULT = 1.5   // 探针 DEF ≤ 遭遇者 def × 此倍率（防玩家攻击被完全抵消、探针变不可杀）
const PROBE_HP_HARD_CAP = 150    // 绝对 HP 上限（防遭遇者属性异常被注水）
const PROBE_ATK_HARD_CAP = 40    // 绝对 ATK 上限
const PROBE_DEF_HARD_CAP = 30    // 绝对 DEF 上限
const PROBE_HP_FLOOR = 20        // 相对上限不因弱玩家而塌到 0：探针 ceil 不低于此（仍受 min(原始值) 约束，不会上 buff）
const PROBE_ATK_FLOOR = 6
const PROBE_DEF_FLOOR = 4

/** 单值钳制：非有限输入兜底取地板；只向下钳制到 ceil，永不超过原始值。 */
function clampProbeStat(raw, floor, ceil) {
  const r = Number(raw)
  const lo = Number.isFinite(floor) ? floor : 0
  const hi = Math.max(lo, Number.isFinite(ceil) ? ceil : lo)
  if (!Number.isFinite(r)) return lo
  return Math.min(Math.round(r), hi)
}

/**
 * research-2026-05-29-E P0 — 按遭遇者实力对探针战斗属性做相对缩放 + 硬封顶。
 * @param {object} probe - 探针 DB 行（含 hp/max_hp/atk/def）
 * @param {object} encounterStats - 遭遇者 { hp, maxHp, atk, def }
 * @returns {{hp,max_hp,atk,def}|null} 缩放后属性；遭遇者属性无效时返回 null（调用方回退原始值，保持旧行为）
 */
export function scaleProbeToEncounter(probe, encounterStats) {
  const pHp = Number(encounterStats?.maxHp ?? encounterStats?.hp)
  const pAtk = Number(encounterStats?.atk)
  const pDef = Number(encounterStats?.def)
  if (!Number.isFinite(pHp) || !Number.isFinite(pAtk) || !Number.isFinite(pDef)) return null

  // clamp(round(stat×mult), floor, hardCap) — pHp/pAtk/pDef 上方已 finite 校验，round 后恒有限，与原内联 min/max 逐值等价
  const ceilHp = clamp(Math.round(pHp * PROBE_HP_CAP_MULT), PROBE_HP_FLOOR, PROBE_HP_HARD_CAP)
  const ceilAtk = clamp(Math.round(pAtk * PROBE_ATK_CAP_MULT), PROBE_ATK_FLOOR, PROBE_ATK_HARD_CAP)
  const ceilDef = clamp(Math.round(pDef * PROBE_DEF_CAP_MULT), PROBE_DEF_FLOOR, PROBE_DEF_HARD_CAP)

  const maxHp = clampProbeStat(probe?.max_hp, PROBE_HP_FLOOR, ceilHp)
  const hp = Math.min(clampProbeStat(probe?.hp, PROBE_HP_FLOOR, ceilHp), maxHp)
  return {
    hp,
    max_hp: maxHp,
    atk: clampProbeStat(probe?.atk, PROBE_ATK_FLOOR, ceilAtk),
    def: clampProbeStat(probe?.def, PROBE_DEF_FLOOR, ceilDef),
  }
}

// Phase 25e — outcome → 收件箱文案 / kind 映射
// 28-E P0 anonymization: 不存 attacker user_id，只存 pseudonym
const PROBE_NOTIFY_META = {
  spared:          { kind: 'probe_spared',          emoji: '🕊️', verb: '放过' },
  defeated:        { kind: 'probe_defeated',        emoji: '💥', verb: '击败' },
  killed_attacker: { kind: 'probe_killed_attacker', emoji: '⚔️', verb: '反杀' },
}

/**
 * research-2026-05-27-v3 P1 — 长尾衰减抽取权重。
 * 剩余 TTL 越接近 0，权重越高（线性升到 PROBE_TTL_BOOST_MULT），
 * 让快过期的探针在消失前更可能被遇到，减少"留了探针却从没被遇到就过期"的失落感。
 *  - remaining >= PROBE_TTL_BOOST_HOURS → 基准权重 1
 *  - 0 < remaining < PROBE_TTL_BOOST_HOURS → 1 → PROBE_TTL_BOOST_MULT 线性
 *  - remaining <= 0 或时间无法解析 → 兜底权重 1
 */
function probeDrawWeight(probe, nowMs) {
  const exp = probe?.expires_at ? Date.parse(probe.expires_at) : NaN
  if (!Number.isFinite(exp)) return 1
  const remainingHours = (exp - nowMs) / 3600000
  if (!(remainingHours > 0) || remainingHours >= PROBE_TTL_BOOST_HOURS) return 1
  const closeness = (PROBE_TTL_BOOST_HOURS - remainingHours) / PROBE_TTL_BOOST_HOURS // 0..1
  return 1 + closeness * (PROBE_TTL_BOOST_MULT - 1)
}

/**
 * 按长尾衰减权重从候选探针里抽一个。candidates 为空返回 null。
 * weightFn 为基于 nowMs 的时间衰减闭包；probeDrawWeight 恒 >= 1，故共享 weightedPick
 * 与原实现逐值等价（原 total<=0 兜底分支在此权重下不可达）。
 */
function weightedPickProbe(candidates, nowMs) {
  return weightedPick(candidates, (p) => probeDrawWeight(p, nowMs))
}

/**
 * research-2026-05-27-v3 P1 — chamber 级密度上限。
 * leaveProbe 写入前调用：若该 chamber 存活探针数已接近 CAP，把最旧的若干条
 * 提前过期（expires_at = now，复用既有时间过期过滤，不引入新 status / 不删行），
 * 给即将插入的新探针腾出位置，使存活数稳定在 CHAMBER_PROBE_DENSITY_CAP 以内。
 * 任何异常仅 console.error，不阻塞新探针写入（玩家已为此消耗了部件）。
 */
async function enforceChamberProbeDensity(client, chamberTemplateId) {
  if (!chamberTemplateId) return
  try {
    const now = new Date().toISOString()
    const { data: actives, error } = await client
      .from('cross_room_probes')
      .select('id')
      .eq('chamber_template_id', chamberTemplateId)
      .eq('status', 'active')
      .gt('expires_at', now)
      .order('created_at', { ascending: true })
    if (error || !Array.isArray(actives)) return
    // 即将再插入 1 条 → 逐出到 CAP - 1，保证插入后 <= CAP
    const overflow = actives.length - (CHAMBER_PROBE_DENSITY_CAP - 1)
    if (overflow <= 0) return
    const evictIds = actives.slice(0, overflow).map((r) => r.id)
    if (evictIds.length === 0) return
    await client
      .from('cross_room_probes')
      .update({ expires_at: now })
      .in('id', evictIds)
  } catch (e) {
    console.error('[enforceChamberProbeDensity] 失败:', e?.message)
  }
}

function buildProbePseudonym(byUserId) {
  if (!byUserId) return '未知幸存者'
  const short = String(byUserId).replace(/-/g, '').slice(0, 4).toUpperCase()
  return `观测者-${short}`
}

/**
 * 28-E P0 — 探针主人匿名化：从 probe id（BIGSERIAL）派生稳定 pseudonym。
 * 遭遇方只能看到这个代号，绝不暴露主人的 owner_id / username / email。
 * 同一探针每次遭遇得到相同代号 → 支持 Nemesis / Ghost Player 叙事识别。
 */
export function buildOwnerPseudonym(probeId) {
  if (probeId == null || probeId === '') return '匿名观测者'
  const s = String(probeId).replace(/-/g, '')
  return `观测者-${s.slice(-4).padStart(4, '0').toUpperCase()}`
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
    // research-2026-05-27-v3 P1 — 写入前先收敛该 chamber 的探针密度
    await enforceChamberProbeDensity(client, chamberTemplateId)

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
 * @param {object} [encounterStats] - 遭遇者 { hp, maxHp, atk, def }；提供时按其实力相对缩放探针属性（research-2026-05-29-E P0）
 * @returns {object|null} 探针记录（战斗属性已相对缩放）或 null
 */
export async function tryEncounterProbe(client, userId, chamberTemplateId, encounterStats) {
  if (!chamberTemplateId) return null
  if (Math.random() >= PROBE_ENCOUNTER_CHANCE) return null

  try {
    const now = new Date().toISOString()
    // research-2026-05-27-v3 P1 — 取一批候选（最旧优先,兼作密度抽样上限）后按长尾衰减权重抽一个,
    // 而非固定取最旧的一条;让临近过期的探针更可能在消失前被遇到。
    const { data: candidates, error } = await client
      .from('cross_room_probes')
      .select('*')
      .eq('chamber_template_id', chamberTemplateId)
      .eq('status', 'active')
      .neq('owner_id', userId)
      .gt('expires_at', now)
      .order('created_at', { ascending: true })
      .limit(PROBE_DRAW_CANDIDATE_LIMIT)

    if (error) {
      // 不是真错误 — 单纯没找到
      return null
    }
    if (!Array.isArray(candidates) || candidates.length === 0) return null

    const data = weightedPickProbe(candidates, Date.now())
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

    // research-2026-05-29-E P0 — 生成遭遇实例时按遭遇者实力相对缩放 + 硬封顶。
    // 只钳制返回给战斗的属性，不回写 DB（owner 真实 snapshot 保留）。encounterStats 缺省时返回 null → 沿用原始值（旧行为）。
    const scaled = scaleProbeToEncounter(data, encounterStats)
    if (scaled) {
      return { ...data, hp: scaled.hp, max_hp: scaled.max_hp, atk: scaled.atk, def: scaled.def }
    }
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
