/**
 * newbieProtection.js — 新手保护期 helper（Phase 24b 预埋）
 *
 * research 2026-05-12 主题 A — 新手保护期机制。
 * 玩家前 NEWBIE_PROTECTION.FIRST_RAIDS 局 raid 处于保护期：撤离失败（阵亡 /
 * Ω-段未撤离）时返还 REFUND_RATE 比例的"入场购买点数"，降低新玩家 gear fear。
 *
 * 红线（economy-canon §3）：返还基数 = 玩家本局入场实际花费，返还额 = 花费 × REFUND_RATE，
 *   绝不超过实际花费 → 补偿摩擦而非净新经济注水。只返还可购买点数类型，class_pt 不返还。
 *
 * 全部为纯函数、无 DB 副作用 — Phase 24b 失败结算流程调用：
 *   1. 入场计数：raid 完成（成功或失败）后 profiles.first_raids_count = nextFirstRaidsCount(cur)
 *   2. 失败返还：isNewbieRaid(firstRaidsCount) 时，对玩家本局入场 spent（per-type map）
 *      调 computeNewbieRefund → creditPoints(client, userId, refund.credits)
 * 可与 28-D Streak-breaker 叠加（后者降难度，本模块补点数，互不冲突）。
 */

import { NEWBIE_PROTECTION } from '../constants'

/**
 * 判定该玩家当前是否处于新手保护期。
 * @param {number} firstRaidsCount — profiles.first_raids_count（已完成 raid 局数）
 * @returns {boolean}
 */
export function isNewbieRaid(firstRaidsCount) {
  const n = Number(firstRaidsCount)
  if (!Number.isFinite(n) || n < 0) return true // 未知/异常计数保守视为新手
  return n < NEWBIE_PROTECTION.FIRST_RAIDS
}

/**
 * raid 完成后的下一个计数值（成功或失败都自增）。
 * @param {number} current — 当前 first_raids_count
 * @returns {number} 非负整数
 */
export function nextFirstRaidsCount(current) {
  const n = Number(current)
  const base = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  return base + 1
}

/**
 * 计算撤离失败返还的点数（仅可购买类型，按 REFUND_RATE 向下取整）。
 * 不做保护期判定 —— 调用方先用 isNewbieRaid 门控。
 * @param {Record<string, number>} entrySpentByType — 玩家本局入场各类点数实际花费
 *   （来自 gamevars.economyAccumulator.pointsSpent 的玩家维度，或 PrepareModal onConfirm 快照）
 * @returns {{ credits: Array<{type:string, amount:number}>, totalRefunded:number, byType:Record<string,number> }}
 */
export function computeNewbieRefund(entrySpentByType) {
  const rate = Number(NEWBIE_PROTECTION.REFUND_RATE)
  const refundable = Array.isArray(NEWBIE_PROTECTION.REFUNDABLE_POINT_TYPES)
    ? NEWBIE_PROTECTION.REFUNDABLE_POINT_TYPES
    : []
  const spent = entrySpentByType && typeof entrySpentByType === 'object' ? entrySpentByType : {}

  const credits = []
  const byType = {}
  let totalRefunded = 0

  if (!(rate > 0)) return { credits, totalRefunded, byType }

  for (const type of refundable) {
    const s = Number(spent[type])
    if (!Number.isFinite(s) || s <= 0) continue
    const amount = Math.floor(s * rate)
    if (amount <= 0) continue
    credits.push({ type, amount })
    byType[type] = amount
    totalRefunded += amount
  }

  return { credits, totalRefunded, byType }
}
