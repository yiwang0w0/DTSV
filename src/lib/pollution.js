/**
 * pollution.js — 远星函馆污染引擎
 *
 * 双层污染模型（spec §3）：
 *   - 环境污染 envPollution (gamevars 级，对局共享)
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

import { POLLUTION_CONFIG, SIGNAL_LOCK, HIGH_RISK } from './constants'
import { clamp, randInt } from './num'

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
//  Loadout 4 槽效果识别（spec §6.3）
// ══════════════════════════════════════════════════════

/**
 * 读取玩家 loadout 4 槽是否装载，返回布尔标记
 * 说明：spec §6.3 装备效果按槽位为单位（不区分 tier1 / tier2 倍率），
 *      因此此处仅判 truthy。后续如要按 tier 差异化效果再扩展。
 */
export function getLoadoutEffects(player) {
  const lo = player?.loadout || {}
  return {
    probe:  !!lo.probe,
    shield: !!lo.shield,
    weapon: !!lo.weapon,
    comm:   !!lo.comm,
  }
}

/** Shield 装载 → 个人污染累积 ×0.7 */
function shieldPersonalFactor(player) {
  return getLoadoutEffects(player).shield ? 0.7 : 1.0
}

// ══════════════════════════════════════════════════════
//  动作触发：个人污染修正（spec §3.2）
// ══════════════════════════════════════════════════════

export function applySearchPollution(player) {
  const factor = shieldPersonalFactor(player)
  return bumpPersonal(player, Math.round(POLLUTION_CONFIG.SEARCH_PERSONAL * factor))
}
export function applyCombatPollution(player, npc) {
  const factor = shieldPersonalFactor(player)
  const fromNpc = Number(npc?.pollution_on_kill) || 0
  const base = POLLUTION_CONFIG.COMBAT_PERSONAL + (fromNpc > 4 ? fromNpc - 4 : 0)
  return bumpPersonal(player, Math.round(base * factor))
}
export function applyInteractPollution(player) {
  // 交互降污染保持原值，shield 不放大负向效果
  return bumpPersonal(player, POLLUTION_CONFIG.INTERACT_PERSONAL)
}
export function applyPvpPollution(player) {
  const factor = shieldPersonalFactor(player)
  return bumpPersonal(player, Math.round(POLLUTION_CONFIG.PVP_PERSONAL * factor))
}
export function applyEmergencyRetreatPollution(player) {
  const factor = shieldPersonalFactor(player)
  return bumpPersonal(player, Math.round(POLLUTION_CONFIG.EMERGENCY_COST * factor))
}
export function applyMeltdownTraversePollution(player) {
  const factor = shieldPersonalFactor(player)
  return bumpPersonal(player, Math.round(POLLUTION_CONFIG.MELTDOWN_COST * factor))
}

/**
 * 29-A P0: 撤离信号锁定期 — 发出信号玩家个人污染额外加速（每回合调用一次）。
 * 非锁定期原样返回。SIGNAL_LOCK.ENABLED=false 时玩家不会有 signalLock 状态，故等价 no-op。
 */
export function applySignalLockPollution(player) {
  const t = player?.signalLock?.turnsLeft
  if (!(Number.isFinite(t) && t > 0)) return player
  return bumpPersonal(player, Math.round(Number(SIGNAL_LOCK.PERSONAL_ACCEL) || 0))
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
  // 收集所有玩家所在地图的最大 accel；同时统计武器持有者人数
  // Phase 22.4: 30 分钟节奏调优 — 按对局进程缩放 BASE_GROWTH，
  //   早期(< 25% 路径) 0.5x / 中期 1.0x / 末段(>= 75%) 1.6x
  //   配合 chamber.pollution_accel 在末段的天然提升，让前段呼吸更长，末段压迫感更强。
  const players = Object.values(gv?.players || {})
  let maxAccel = 0
  let weaponHolders = 0
  let maxChamberProgress = 0
  // 29-A P0: 撤离信号锁定期 — 每个处于脆弱态的玩家额外加速环境污染（仅 SIGNAL_LOCK.ENABLED 后才会有锁定玩家）
  let signalLockAccel = 0
  for (const p of players) {
    if (!p?.alive || p?.extracted) continue
    const mapId = p.map ?? 0
    const accel = mapAccelLookup(mapAccelById, mapId)
    if (accel > maxAccel) maxAccel = accel
    if (p.loadout?.weapon) weaponHolders++
    if (Number.isFinite(p?.signalLock?.turnsLeft) && p.signalLock.turnsLeft > 0) {
      signalLockAccel += Number(SIGNAL_LOCK.ENV_ACCEL_BONUS) || 0
    }
    // 取所有玩家最深进度（chamberIndex / raidPath 长度）
    const pathLen = Array.isArray(gv.raidPath) ? gv.raidPath.length : 0
    const progress = pathLen > 0 ? ((p.chamberIndex || 0) / pathLen) : 0
    if (progress > maxChamberProgress) maxChamberProgress = progress
  }

  // 阶段倍率：opening/early < 25% / middle 25-75% / late+finale >= 75%
  let stageMultiplier = 1.0
  if (maxChamberProgress < 0.25) stageMultiplier = 0.5
  else if (maxChamberProgress >= 0.75) stageMultiplier = 1.6

  // 29-B P1: 高危出勤 — 整局环境污染额外加速（room 级 gv.heatLevel；HIGH_RISK.ENABLED=false 时
  //   下方钳制恒回 0，自然 no-op）。下标即等级，O(1) 查表，与 heat.js 同一 LEVELS 来源。
  let heatAccel = 0
  if (HIGH_RISK.ENABLED) {
    const lv = Math.max(0, Math.min(HIGH_RISK.LEVELS.length - 1, Math.floor(Number(gv?.heatLevel)) || 0))
    heatAccel = Number(HIGH_RISK.LEVELS[lv]?.envAccelBonus) || 0
  }

  // 武器装载者每人额外 +1 环境污染/回合（spec §6.3 weapon 副作用）
  const baseInc = POLLUTION_CONFIG.BASE_GROWTH * stageMultiplier
  const inc = baseInc + maxAccel + weaponHolders + signalLockAccel + heatAccel
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

/**
 * 修正搜索成功率：返回新概率（保留 0-1 范围）
 * @param {number} baseChance
 * @param {number} effective
 * @param {object} [opts] — { hasProbe?: boolean }，probe 装载额外 +15%
 */
export function applyPollutionSearchModifier(baseChance, effective, opts = {}) {
  const tier = tierFromValue(effective)
  let mod = 0
  if (tier === 'mild')     mod = POLLUTION_CONFIG.SEARCH_PENALTY_MILD
  if (tier === 'moderate') mod = POLLUTION_CONFIG.SEARCH_PENALTY_MODERATE
  if (tier === 'severe')   mod = POLLUTION_CONFIG.SEARCH_PENALTY_SEVERE
  if (opts.hasProbe) mod += 0.15  // probe 装载：搜索成功率 +15%
  return clamp(baseChance + mod, 0, 1)
}

/**
 * 重度污染降低战斗伤害；weapon 装载提升对实体伤害 25%
 * @param {number} damage
 * @param {number} effective
 * @param {object} [opts] — { hasWeapon?: boolean }
 */
export function applyPollutionCombatModifier(damage, effective, opts = {}) {
  let d = damage
  const tier = tierFromValue(effective)
  if (tier === 'severe') {
    d = Math.floor(d * (1 + POLLUTION_CONFIG.COMBAT_DAMAGE_REDUCTION_SEVERE))
  }
  if (opts.hasWeapon) {
    d = Math.floor(d * 1.25)  // weapon 装载：对实体伤害 +25%
  }
  return Math.max(1, d)
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
  // Phase 24c: pollution_resist 仅对"增量"生效（减量比如低污染区衰减不应被强化）
  let appliedDelta = delta
  if (delta > 0) {
    const resist = Number(player.classPerks?.pollution_resist) || 0
    appliedDelta = Math.max(0, Math.round(delta * (1 - resist)))
  }
  const next = clamp((player.personalPollution || 0) + appliedDelta, 0, 100)
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
