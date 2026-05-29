/**
 * heat.js — 高危出勤 / High-risk deployment（research 2026-05-29-B P1）
 *
 * 自愿"上行难度阀门"（Hades Heat / Roguelike Ascension 等价），与 Streak-breaker（raids.js，
 * 下行减负）构成双向自适应难度：玩家出勤前自选 heatLevel，等级越高难度越高、结算奖励越多，
 * 给数值饱和的老玩家"再挑战换奖励"出口。难度旋钮（污染加速 / NPC 密度 / Ω 窗口收紧）与
 * 奖励旋钮（残片掉率 / 可购买点数倍率）全部由 constants.HIGH_RISK.LEVELS 单一来源驱动。
 *
 * 设计红线（economy-canon §6.1）：奖励倍率是"承担更高死亡风险"的对价而非免费 faucet ——
 *   `class_pt`（保底里程碑·非经济点数）永不被倍率放大，防加速 legendary 软保底跳关；
 *   Phase 24b 须把 pointsMult 调到扣除高危死亡损失后的 EV 仍落在 12% 周通胀预算内。
 *
 * 纯函数：不写 DB、不改入参，返回新对象 / 新数组。预埋不启用（HIGH_RISK.ENABLED=false），
 *   此时 sanitizeHeatLevel 恒返回 0 → 全部读取自然短路为 no-op。
 *   等 Phase 24b 接 PrepareModal heat 选择 → gamevars.heatLevel + pathGenerator/pollution/extract 读取后翻 true。
 */
import { HIGH_RISK } from '../constants'

/**
 * 把任意输入规范成合法 heatLevel。未启用 / 非正整数 / 超界 → 钳制。
 * @param {*} level
 * @returns {number} 0..(LEVELS.length-1)；HIGH_RISK.ENABLED=false 时恒为 0
 */
export function sanitizeHeatLevel(level) {
  if (!HIGH_RISK.ENABLED) return 0
  const n = Math.floor(Number(level))
  if (!Number.isFinite(n) || n <= 0) return 0
  const max = HIGH_RISK.LEVELS.length - 1
  return Math.min(max, n)
}

/** 取某等级的配置对象（下标即等级；越界回退标准出勤）。 */
export function heatLevelDef(level) {
  const lv = sanitizeHeatLevel(level)
  return HIGH_RISK.LEVELS[lv] || HIGH_RISK.LEVELS[0]
}

/** 整局环境污染额外加速量（pollution.js tickEnvPollution 读 gv.heatLevel；标准出勤为 0）。 */
export function heatEnvAccelBonus(level) {
  return Number(heatLevelDef(level).envAccelBonus) || 0
}

/** 奖励倍率对价：{ fragmentDropMult, pointsMult }（标准出勤均为 1）。 */
export function heatRewardMultipliers(level) {
  const def = heatLevelDef(level)
  return {
    fragmentDropMult: Number.isFinite(def.fragmentDropMult) ? def.fragmentDropMult : 1,
    pointsMult: Number.isFinite(def.pointsMult) ? def.pointsMult : 1,
  }
}

/**
 * 把 heat 难度修正应用到 raidPath：上调每个 chamber 的 maxNpcs（向上取整）+ 收紧 omegaWindow。
 * 返回新数组，不 mutate 入参；标准出勤（无上行修正）原样返回。
 * @param {Array} raidPath — generateRaidPath 产物
 * @param {number} level — heatLevel
 * @returns {Array}
 */
export function applyHeatToRaidPath(raidPath, level) {
  if (!Array.isArray(raidPath)) return []
  const def = heatLevelDef(level)
  const densityMult = Number(def.npcDensityMult) || 1
  const omegaDelta = Number(def.omegaWindowDelta) || 0
  if (densityMult <= 1 && omegaDelta >= 0) return raidPath
  return raidPath.map((ch) => {
    const next = { ...ch }
    const npc = Number(ch?.maxNpcs)
    if (densityMult > 1 && Number.isFinite(npc) && npc > 0) {
      next.maxNpcs = Math.ceil(npc * densityMult)
    }
    const ow = Number(ch?.omegaWindow)
    if (omegaDelta < 0 && Number.isFinite(ow) && ow > 0) {
      next.omegaWindow = Math.max(1, ow + omegaDelta) // Ω 窗口最少保留 1 回合，不归零
    }
    return next
  })
}

/**
 * 撤离结算时按 pointsMult 放大可购买点数（high/low/item）。
 * 红线：class_pt 是保底里程碑·非经济点数，永不放大（防加速 legendary 跳关）。
 * 返回新数组，不 mutate；标准出勤 / pointsMult<=1 时原样返回。
 * @param {Array<{type:string, amount:number}>} credits
 * @param {number} level
 * @returns {Array}
 */
export function applyHeatPointsMultiplier(credits, level) {
  if (!Array.isArray(credits)) return []
  const { pointsMult } = heatRewardMultipliers(level)
  if (!(pointsMult > 1)) return credits
  return credits.map((c) => {
    if (!c || c.type === 'class_pt') return c
    const amt = Number(c.amount)
    if (!Number.isFinite(amt) || amt <= 0) return c
    return { ...c, amount: Math.round(amt * pointsMult) }
  })
}

/**
 * 撤离链残片发现概率按 fragmentDropMult 放大（钳制 ≤ 1）。
 * 标准出勤 / mult<=1 / baseChance 非法时原样返回。
 * @param {number} baseChance — 0..1
 * @param {number} level
 * @returns {number}
 */
export function heatFragmentDropChance(baseChance, level) {
  const base = Number(baseChance)
  if (!Number.isFinite(base)) return baseChance
  const { fragmentDropMult } = heatRewardMultipliers(level)
  if (!(fragmentDropMult > 1)) return base
  return Math.min(1, base * fragmentDropMult)
}
