/**
 * pollution.js — 远星函馆污染引擎
 *
 * 双层污染模型（spec §3）：
 *   - 环境污染 envPollution (gamevars 级，房间共享)
 *   - 个人污染 personalPollution (player 级，玩家独立)
 *
 * 有效污染 = envPollution × WEIGHT_ENV + personalPollution × WEIGHT_PERSONAL
 * 区间分级 → 应用搜索/战斗/刷怪/通行修正
 *
 * 所有函数为纯计算（不修改入参，返回新对象），便于测试。
 *
 * 调用者（典型 gameActions.js 流水线）：
 *   1. 玩家动作 → applyXxxPollution 修正个人污染
 *   2. 持久化前 → tickEnvPollution + tickOmegaCountdown
 *   3. tick 后 → recomputeFlags 更新结局判定 flags
 *   4. 应用 search / combat 修正：apply*Modifier(baseValue, effectivePollution)
 */

import { POLLUTION_CONFIG } from './constants'

// ── 默认权重，可通过参数覆盖 ──────────────────────────
export const POLLUTION_WEIGHTS = {
  env:      POLLUTION_CONFIG.WEIGHT_ENV,
  personal: POLLUTION_CONFIG.WEIGHT_PERSONAL,
}

const TIERS = [
  { key: 'meltdown', min: POLLUTION_CONFIG.TIER_MELTDOWN },
  { key: 'severe',   min: POLLUTION_CONFIG.TIER_SEVERE },
  { key: 'moderate', min: POLLUTION_CONFIG.TIER_MODERATE },
  { key: 'mild',     min: POLLUTION_CONFIG.TIER_MILD },
  { key: 'none',     min: 0 },
]

// ══════════════════════════════════════════════════════
//  有效污染计算
// ══════════════════════════════════════════════════════

/**
 * @param envP {number}      环境污染 0-100
 * @param personalP {number} 个人污染 0-100
 * @param weights {{env, personal}=} 可选权重覆盖
 * @returns {{ effective:number (0-100), tier:'none'|'mild'|'moderate'|'severe'|'meltdown' }}
 */
export function calcEffectivePollution(envP = 0, personalP = 0, weights = POLLUTION_WEIGHTS) {
  const wEnv  = Number.isFinite(weights?.env)      ? weights.env      : POLLUTION_WEIGHTS.env
  const wPer  = Number.isFinite(weights?.personal) ? weights.personal : POLLUTION_WEIGHTS.personal
  const env   = clamp(Number(envP) || 0, 0, 100)
  const per   = clamp(Number(personalP) || 0, 0, 100)
  const eff   = clamp(env * wEnv + per * wPer, 0, 100)

  const tier = TIERS.find(t => eff >= t.min)?.key || 'none'
  return { effective: Math.round(eff), tier }
}

// ══════════════════════════════════════════════════════
//  动作触发：个人污染修正（spec §3.2）
// ══════════════════════════════════════════════════════

export function applySearchPollution(player) {
  return bumpPersonal(player, POLLUTION_CONFIG.SEARCH_PERSONAL)
}
export function applyCombatPollution(player, npc) {
  const fromNpc = Number(npc?.pollution_on_kill) || 0
  return bumpPersonal(player, POLLUTION_CONFIG.COMBAT_PERSONAL + (fromNpc > 4 ? fromNpc - 4 : 0))
}
export function applyInteractPollution(player) {
  return bumpPersonal(player, POLLUTION_CONFIG.INTERACT_PERSONAL)
}
export function applyPvpPollution(player) {
  return bumpPersonal(player, POLLUTION_CONFIG.PVP_PERSONAL)
}
export function applyEmergencyRetreatPollution(player) {
  return bumpPersonal(player, POLLUTION_CONFIG.EMERGENCY_COST)
}
export function applyMeltdownTraversePollution(player) {
  return bumpPersonal(player, POLLUTION_CONFIG.MELTDOWN_COST)
}

/** 在低污染区(envPollution≤20%) + 个人污染 > 0 时自然衰减/回合 */
export function applyRetreatDecay(player, envPollution) {
  if ((envPollution || 0) > 20) return player
  if ((player?.personalPollution || 0) <= 0) return player
  return bumpPersonal(player, POLLUTION_CONFIG.RETREAT_DECAY)
}

/** 使用 "环段部件" 修复：减环境污染 [REPAIR_MIN, REPAIR_MAX] */
export function applyPartRepair(gv) {
  const reduce = randInt(POLLUTION_CONFIG.REPAIR_MIN, POLLUTION_CONFIG.REPAIR_MAX)
  return {
    ...gv,
    envPollution: clamp((gv.envPollution || 0) - reduce, 0, 100),
  }
}

// ══════════════════════════════════════════════════════
//  Tick：每持久化前调用一次
// ══════════════════════════════════════════════════════

/**
 * 环境污染每回合自然增长（spec §3.1）
 *
 * @param gv {object}             gamevars
 * @param mapAccelById {Map|object} mapId → pollution_accel
 * @returns {object} 新 gamevars
 */
export function tickEnvPollution(gv, mapAccelById) {
  // 收集所有玩家所在地图的最大 accel
  const players = Object.values(gv?.players || {})
  let maxAccel = 0
  for (const p of players) {
    if (!p?.alive || p?.extracted) continue
    const mapId = p.map ?? 0
    const accel = mapAccelLookup(mapAccelById, mapId)
    if (accel > maxAccel) maxAccel = accel
  }
  const inc = POLLUTION_CONFIG.BASE_GROWTH + maxAccel
  return {
    ...gv,
    envPollution: clamp((gv.envPollution || 0) + inc, 0, 100),
  }
}

/**
 * Ω-段倒计时每回合 -1。归零强制结构退避 → map 3 + 个人污染 +20%
 *
 * @returns {{ player, gv, forcedRetreat?:boolean, log?:string }}
 */
export function tickOmegaCountdown(player, gv) {
  const cd = player?.omegaCountdown
  if (cd === null || cd === undefined) return { player, gv }
  const next = cd - 1
  if (next > 0) {
    return { player: { ...player, omegaCountdown: next }, gv }
  }
  // 归零强制退避
  const newPlayer = {
    ...player,
    map: 3,
    omegaCountdown: null,
    personalPollution: clamp((player.personalPollution || 0) + 20, 0, 100),
  }
  return {
    player: newPlayer,
    gv,
    forcedRetreat: true,
    log: `${player.name || '玩家'} 的 Ω-段窗口归零，被强制退至剪切界面缓冲带（个人污染 +20%）`,
  }
}

// ══════════════════════════════════════════════════════
//  搜索 / 战斗修正（spec §3.3）
// ══════════════════════════════════════════════════════

/** 修正搜索成功率：返回新概率（保留 0-1 范围） */
export function applyPollutionSearchModifier(baseChance, effective) {
  const tier = tierFromValue(effective)
  let mod = 0
  if (tier === 'mild')     mod = POLLUTION_CONFIG.SEARCH_PENALTY_MILD
  if (tier === 'moderate') mod = POLLUTION_CONFIG.SEARCH_PENALTY_MODERATE
  if (tier === 'severe')   mod = POLLUTION_CONFIG.SEARCH_PENALTY_SEVERE
  return clamp(baseChance + mod, 0, 1)
}

/** 重度污染降低战斗伤害 */
export function applyPollutionCombatModifier(damage, effective) {
  const tier = tierFromValue(effective)
  if (tier === 'severe') {
    return Math.max(1, Math.floor(damage * (1 + POLLUTION_CONFIG.COMBAT_DAMAGE_REDUCTION_SEVERE)))
  }
  return damage
}

/** 重度污染时 NPC 出现频率倍率 */
export function getPollutionSpawnMultiplier(effective) {
  const tier = tierFromValue(effective)
  return tier === 'severe' ? POLLUTION_CONFIG.COMBAT_NPC_SPAWN_MULT_SEVERE : 1
}

// ══════════════════════════════════════════════════════
//  结局判定 flag 重算（spec §9.2）
// ══════════════════════════════════════════════════════

/**
 * 重算 gamevars.flags 中的 4 个判定标记
 * 应在每次 persist 前调用，确保分支引擎读到最新状态
 */
export function recomputeFlags(gv) {
  const env = gv.envPollution || 0
  const totalKills    = gv.totalEntityKills || 0
  const totalSpawned  = gv.spawnedEntityCount || 0
  const totalFrags    = gv.totalFragmentsExtracted || 0

  const totalEntityKillRate = totalSpawned > 0
    ? Math.floor((totalKills / totalSpawned) * 100)
    : 0

  return {
    ...gv,
    flags: {
      ...(gv.flags || {}),
      envPollutionMax:     env >= 100,
      envPollutionBelow60: env <= 60,
      lowFragments:        totalFrags <= 5,
      totalEntityKillRate,
    },
  }
}

// ══════════════════════════════════════════════════════
//  内部工具
// ══════════════════════════════════════════════════════

function bumpPersonal(player, delta) {
  if (!player) return player
  const next = clamp((player.personalPollution || 0) + delta, 0, 100)
  if (next === player.personalPollution) return player
  return { ...player, personalPollution: next }
}

function tierFromValue(eff) {
  return TIERS.find(t => eff >= t.min)?.key || 'none'
}

function mapAccelLookup(table, mapId) {
  if (!table) return 0
  if (table instanceof Map) return Number(table.get(mapId)) || 0
  return Number(table[mapId]) || 0
}

function clamp(v, lo, hi) {
  if (v < lo) return lo
  if (v > hi) return hi
  return v
}

function randInt(lo, hi) {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo
}
