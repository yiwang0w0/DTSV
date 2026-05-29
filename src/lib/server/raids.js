/**
 * raids.js — Raid 准备阶段 helper（Phase 24b 预埋）
 *
 * research 2026-05-28-D P0 → 2026-05-29-B P1 升级 — Streak-breaker 连败兜底。
 * 玩家连续撤离失败局数 ≥ STREAK_BREAKER.THRESHOLD 时，下一局自动施加
 * "只降难度、不加经济收益"的兜底 buff：
 *   - 免费 basic 保险（死亡返还消耗装备的概率，非净新经济）
 *   - chamber NPC 密度按减负等级线性递减（-10%/级，封顶 -40%）
 *   - PI 引导者关怀对白（纯叙事安抚）
 *
 * 05-29-B 升级为 Hades God Mode 式渐进自平衡（替代旧的固定 -20% 二元触发）：
 *   - 减负等级 reliefLevel = clamp(fails - THRESHOLD + 1, 0, MAX_RELIEF_LEVEL)，连败越多减负越强；
 *   - 成功撤离即衰减归零：消费方在撤离成功后把 consecutiveFailedRaids 清 0，
 *     下一局本函数自然返回 reliefLevel=0、密度回满，永不永久 trivialize；
 *   - opt-in 可见：返回 reliefLevel + reliefLabel（"引导减负 LvN"），由 PrepareModal 出勤前显式展示，
 *     而非静默施加（呼应 God Mode "不锁内容 + 不剥夺成就感"）。
 *
 * 红线：本模块严禁产出任何点数 / 掉落 / stash 加成，防"故意送死刷 buff"套利。
 * 全部为纯函数、无 DB 副作用 — Phase 24b raid 入场流程（generateRaidPath 之后）
 * 调用，把返回的 modifier 应用到 raidPath + 玩家入场状态。
 */

import { STREAK_BREAKER, FIRST_CONTACT_FRAMING } from '../constants'

/**
 * 把连败局数换算为减负等级：0 = 未触发；触发后每多连败一局 +1，封顶 MAX_RELIEF_LEVEL。
 * @param {number} fails — 已校验为有限数的连续撤离失败局数
 * @returns {number} 0..MAX_RELIEF_LEVEL
 */
function reliefLevelFromFails(fails) {
  if (!(fails >= STREAK_BREAKER.THRESHOLD)) return 0
  const raw = fails - STREAK_BREAKER.THRESHOLD + 1
  return Math.min(STREAK_BREAKER.MAX_RELIEF_LEVEL, Math.max(0, raw))
}

/**
 * 判定是否触发 streak-breaker，并给出渐进 buff 包。
 * @param {number} consecutiveFailedRaids — 玩家连续撤离失败局数（撤离成功后消费方应清 0）
 * @returns {{ active: boolean, reliefLevel: number, maxReliefLevel: number, reliefLabel: (string|null), npcDensityMultiplier: number, grantInsuranceTier: (string|null), guideDialogue: (string|null) }}
 */
export function computeStreakBreaker(consecutiveFailedRaids) {
  const fails = Number(consecutiveFailedRaids)
  const reliefLevel = Number.isFinite(fails) ? reliefLevelFromFails(fails) : 0
  const active = reliefLevel > 0
  if (!active) {
    return {
      active: false,
      reliefLevel: 0,
      maxReliefLevel: STREAK_BREAKER.MAX_RELIEF_LEVEL,
      reliefLabel: null,
      npcDensityMultiplier: 1,
      grantInsuranceTier: null,
      guideDialogue: null,
    }
  }
  // 线性递减并钳制在 [1 - MAX_RELIEF_LEVEL*REDUCTION_PER_LEVEL, 1]，浮点round 防累积误差
  const floor = 1 - STREAK_BREAKER.MAX_RELIEF_LEVEL * STREAK_BREAKER.REDUCTION_PER_LEVEL
  const rawMult = 1 - reliefLevel * STREAK_BREAKER.REDUCTION_PER_LEVEL
  const npcDensityMultiplier = Math.round(Math.max(floor, rawMult) * 100) / 100
  const pool = Array.isArray(STREAK_BREAKER.GUIDE_DIALOGUE) ? STREAK_BREAKER.GUIDE_DIALOGUE : []
  const guideDialogue = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null
  return {
    active: true,
    reliefLevel,
    maxReliefLevel: STREAK_BREAKER.MAX_RELIEF_LEVEL,
    reliefLabel: `${STREAK_BREAKER.LABEL_PREFIX} Lv${reliefLevel}`,
    npcDensityMultiplier,
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
 * 首次接触自我筛选框架（research 2026-05-29-C P1，Pathologic 2 范式）。
 * 仅在玩家"第一局"出勤（totalRaidsCompleted === 0）返回元叙事框架文案；否则 inactive。
 * 把"你不会立刻看懂"诚实预告为设计意图而非缺陷 —— 给劝退峰玩家自我筛选信号、
 * 给留存峰玩家使命感。纯叙事，严禁任何点数 / 掉落 / power / 难度收益。
 *
 * 计数语义（与 newbieProtection 保守方向相反）：未知 / 非有限 / null / undefined 一律
 * 视为"非首局"——宁可对加载失败的玩家漏弹框架卡，也绝不对已上手老玩家误弹元叙事说明。
 * 只有显式的 0（或负）计数才判定为首局。预埋期 ENABLED=false 时恒 inactive。
 * @param {number} totalRaidsCompleted — 玩家累计完成 raid 局数（profiles.first_raids_count 或等价计数）
 * @returns {{ active: boolean, title: (string|null), lines: string[], signature: (string|null) }}
 */
export function firstContactFraming(totalRaidsCompleted) {
  const inactive = { active: false, title: null, lines: [], signature: null }
  if (!FIRST_CONTACT_FRAMING.ENABLED) return inactive
  if (totalRaidsCompleted === null || totalRaidsCompleted === undefined) return inactive
  const n = Number(totalRaidsCompleted)
  if (!Number.isFinite(n) || n > 0) return inactive
  const lines = Array.isArray(FIRST_CONTACT_FRAMING.LINES) ? FIRST_CONTACT_FRAMING.LINES.slice() : []
  return {
    active: true,
    title: FIRST_CONTACT_FRAMING.TITLE || null,
    lines,
    signature: FIRST_CONTACT_FRAMING.SIGNATURE || null,
  }
}

/**
 * raid 准备 — 组合 streak-breaker 判定 + 路径密度修正 + 首局自我筛选框架。
 * Phase 24b 入场流程调用：传入玩家连续失败计数 + 累计出勤计数 + 已生成的 raidPath，
 * 取回兜底 buff 包、首局框架包与（可能已降密度的）路径。
 * @param {object} args
 * @param {number} [args.consecutiveFailedRaids=0]
 * @param {Array}  [args.raidPath=[]] — generateRaidPath 产物
 * @param {number} [args.totalRaidsCompleted=null] — 玩家累计完成 raid 局数（null = 未知，不弹框架）
 * @returns {{ streakBreaker: object, firstContact: object, raidPath: Array }}
 */
export function preRaidSetup({ consecutiveFailedRaids = 0, raidPath = [], totalRaidsCompleted = null } = {}) {
  const streakBreaker = computeStreakBreaker(consecutiveFailedRaids)
  const adjustedPath = streakBreaker.active
    ? applyNpcDensityMultiplier(raidPath, streakBreaker.npcDensityMultiplier)
    : (Array.isArray(raidPath) ? raidPath : [])
  const firstContact = firstContactFraming(totalRaidsCompleted)
  return { streakBreaker, firstContact, raidPath: adjustedPath }
}
