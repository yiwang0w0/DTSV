/**
 * raids.js — Raid 准备阶段 helper（Phase 24b 预埋）
 *
 * research 2026-05-28-D P0 — Streak-breaker 连败兜底。
 * 玩家连续撤离失败局数 ≥ STREAK_BREAKER.THRESHOLD 时，下一局自动施加
 * "只降难度、不加经济收益"的兜底 buff：
 *   - 免费 basic 保险（死亡返还消耗装备的概率，非净新经济）
 *   - chamber NPC 密度 ×0.8（-20%）
 *   - PI 引导者关怀对白（纯叙事安抚）
 *
 * 红线：本模块严禁产出任何点数 / 掉落 / stash 加成，防"故意送死刷 buff"套利。
 * 全部为纯函数、无 DB 副作用 — Phase 24b raid 入场流程（generateRaidPath 之后）
 * 调用，把返回的 modifier 应用到 raidPath + 玩家入场状态。
 */

import { STREAK_BREAKER } from '../constants'

/**
 * 判定是否触发 streak-breaker，并给出 buff 包。
 * @param {number} consecutiveFailedRaids — 玩家连续撤离失败局数
 * @returns {{ active: boolean, npcDensityMultiplier: number, grantInsuranceTier: (string|null), guideDialogue: (string|null) }}
 */
export function computeStreakBreaker(consecutiveFailedRaids) {
  const fails = Number(consecutiveFailedRaids)
  const active = Number.isFinite(fails) && fails >= STREAK_BREAKER.THRESHOLD
  if (!active) {
    return { active: false, npcDensityMultiplier: 1, grantInsuranceTier: null, guideDialogue: null }
  }
  const pool = Array.isArray(STREAK_BREAKER.GUIDE_DIALOGUE) ? STREAK_BREAKER.GUIDE_DIALOGUE : []
  const guideDialogue = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null
  return {
    active: true,
    npcDensityMultiplier: STREAK_BREAKER.NPC_DENSITY_MULTIPLIER,
    grantInsuranceTier: STREAK_BREAKER.FREE_INSURANCE_TIER,
    guideDialogue,
  }
}

/**
 * 把 NPC 密度 multiplier 应用到 raidPath（每个 chamber.maxNpcs 向下取整，最少保留 1）。
 * 返回新数组，不 mutate 入参；multiplier >= 1 时原样返回。
 * @param {Array} raidPath — generateRaidPath 产物
 * @param {number} multiplier — 密度系数（< 1 才生效）
 * @returns {Array}
 */
export function applyNpcDensityMultiplier(raidPath, multiplier) {
  if (!Array.isArray(raidPath) || !(multiplier < 1)) return Array.isArray(raidPath) ? raidPath : []
  const m = Math.max(0, multiplier)
  return raidPath.map((ch) => {
    const base = Number(ch?.maxNpcs)
    if (!Number.isFinite(base) || base <= 0) return ch
    return { ...ch, maxNpcs: Math.max(1, Math.floor(base * m)) }
  })
}

/**
 * raid 准备 — 组合 streak-breaker 判定 + 路径密度修正。
 * Phase 24b 入场流程调用：传入玩家连续失败计数 + 已生成的 raidPath，
 * 取回兜底 buff 包与（可能已降密度的）路径。
 * @param {object} args
 * @param {number} [args.consecutiveFailedRaids=0]
 * @param {Array}  [args.raidPath=[]] — generateRaidPath 产物
 * @returns {{ streakBreaker: object, raidPath: Array }}
 */
export function preRaidSetup({ consecutiveFailedRaids = 0, raidPath = [] } = {}) {
  const streakBreaker = computeStreakBreaker(consecutiveFailedRaids)
  const adjustedPath = streakBreaker.active
    ? applyNpcDensityMultiplier(raidPath, streakBreaker.npcDensityMultiplier)
    : (Array.isArray(raidPath) ? raidPath : [])
  return { streakBreaker, raidPath: adjustedPath }
}
