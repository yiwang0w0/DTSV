/**
 * runGoals — 本局目标 / 个人化胜利评级（research 2026-05-29-A P1）
 *
 * 纯函数，无 DB 副作用。consumed by:
 *   - src/components/PrepareModal.jsx  出勤前 sanitizeRunGoal 规范化玩家选择
 *   - Phase 24b join 控制流          把 sanitizeRunGoal 结果存 per-player gamevars.runGoal
 *   - Phase 24b extract/结局评估       evaluateRunGoal(goal, outcome) → 写 meBase.runGoalResult
 *   - src/app/game/[id]/GameClientPage 结局横幅用 runGoalRating(result) 渲染评级
 *
 * 数据形状：
 *   goal   = { type, target }                            玩家出勤前的选择
 *   outcome= { fragmentsDecoded, pointsEarned, bossKilled, probeLeft, ... } 本局结算快照
 *   result = { type, label, icon, progress, target, achieved }  评估产物（存 gamevars）
 *
 * 设计红线（constants.RUN_GOALS / economy-canon §3）：评级只驱动叙事展示，
 *   绝不附带任何点数 / 掉落 / power 净收益。本模块不产出任何奖励字段。
 */

import { RUN_GOALS } from '@/lib/constants'

// 按 type 查目标定义
export function runGoalDef(type) {
  return RUN_GOALS.TYPES.find(t => t.type === type) || null
}

// 规范化玩家选择 → { type, target }，或 null（未启用 / 无效 / 选了 none 不持久）
export function sanitizeRunGoal(raw) {
  if (!RUN_GOALS.ENABLED) return null
  if (!raw || typeof raw !== 'object') return null
  const def = runGoalDef(raw.type)
  if (!def || def.type === RUN_GOALS.DEFAULT_TYPE || !def.metric) return null

  let target = Number(def.target) || 1
  if (def.targetEditable) {
    const t = Math.round(Number(raw.target))
    if (Number.isFinite(t)) {
      target = Math.max(RUN_GOALS.POINTS_TARGET_MIN, Math.min(RUN_GOALS.POINTS_TARGET_MAX, t))
    }
  }
  return { type: def.type, target: Math.max(1, target) }
}

// 评估达成度 → { type, label, icon, progress, target, achieved }，或 null（无效目标）
// outcome 缺字段时进度按 0 处理（保守不误判达成）
export function evaluateRunGoal(goal, outcome = {}) {
  if (!goal || typeof goal !== 'object') return null
  const def = runGoalDef(goal.type)
  if (!def || !def.metric) return null

  const target = Math.max(1, Number(goal.target) || Number(def.target) || 1)
  const o = outcome && typeof outcome === 'object' ? outcome : {}
  const raw = Number(o[def.metric])
  const progress = Number.isFinite(raw) ? Math.max(0, raw) : 0

  return {
    type: def.type,
    label: def.label,
    icon: def.icon,
    progress,
    target,
    achieved: progress >= target,
  }
}

// 本局评级（纯叙事，无经济含义）：达成 S / 接近 A / 部分 B / 未竟 C
export function runGoalRating(result) {
  if (!result || typeof result !== 'object') return null
  if (result.achieved) return { grade: 'S', text: '目标达成' }
  const target = Math.max(1, Number(result.target) || 1)
  const ratio = (Number(result.progress) || 0) / target
  if (ratio >= 0.66) return { grade: 'A', text: '接近达成' }
  if (ratio >= 0.33) return { grade: 'B', text: '部分进展' }
  return { grade: 'C', text: '目标未竟' }
}
