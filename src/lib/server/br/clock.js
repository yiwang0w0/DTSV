/**
 * clock.js — 虚拟空间BR「大时钟」纯计算（Phase 31）
 *
 * 设计宪法 docs/timejump-br-design.md §3「三条派生公式」的唯一权威实现：
 *   当前真实阶段(match) = min(max_phase, floor((now - started_at) / phase_seconds))
 *   有效阶段(player)    = min(max_phase, 真实阶段 + depth)        // Phase 31 depth 恒 0 ⇒ === realPhase
 *   phaseEndsAtMs       = started_at_ms + (realPhase + 1) * phase_seconds * 1000
 *
 * 本模块**完全不碰 DB、无副作用**：入参一个 br_matches 行 + nowMs，出折算好的相位/倒计时。
 * `now` 可注入（默认 Date.now()）便于单元测试。被 match.js（组装 state）与两个前端页面
 * （本地秒级 tick）共享同一份算法，保证前后端不漂移。
 *
 * 防御：status !== 'active' 或 started_at 为 null/未开始 ⇒ realPhase=0，phaseEndsAtMs=null。
 */

// 与 schema br_matches 默认对齐（phase_seconds=900 / max_phase=4）
export const PHASE_SECONDS_DEFAULT = 900
export const MAX_PHASE_DEFAULT = 4
// createMatch 钳制下限：允许 dev 传短值（如 30s）走查大时钟推进，但不得低于 5s
export const MIN_PHASE_SECONDS = 5

/** 把任意输入安全折算成 >=1 的整数秒（用于 phase_seconds 防御） */
function safePhaseSeconds(raw) {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n >= 1 ? n : PHASE_SECONDS_DEFAULT
}

/** 把任意输入安全折算成 >=0 的整数阶段上限 */
function safeMaxPhase(raw) {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n >= 0 ? n : MAX_PHASE_DEFAULT
}

/** 解析 started_at（ISO string / Date / 毫秒数）成毫秒整数；无效 ⇒ null */
function parseStartedAtMs(startedAt) {
  if (startedAt == null) return null
  if (typeof startedAt === 'number') return Number.isFinite(startedAt) ? startedAt : null
  const ms = new Date(startedAt).getTime()
  return Number.isFinite(ms) ? ms : null
}

/**
 * 把一行 br_matches + 当前 wall-clock 折算成大时钟视图。
 *
 * @param {object} match  br_matches 行：{ status, started_at, phase_seconds, max_phase, ... }
 * @param {number} [nowMs=Date.now()]
 * @returns {{
 *   realPhase:number, phaseSeconds:number, maxPhase:number, status:string,
 *   startedAtMs:number|null, isEnded:boolean,
 *   phaseEndsAtMs:number|null, secondsToNextPhase:number|null, elapsedSeconds:number|null
 * }}
 */
export function computeClock(match, nowMs = Date.now()) {
  const status = match?.status || 'lobby'
  const phaseSeconds = safePhaseSeconds(match?.phase_seconds)
  const maxPhase = safeMaxPhase(match?.max_phase)
  const startedAtMs = parseStartedAtMs(match?.started_at)
  const isEnded = status === 'ended'

  // 未开钟（lobby / ended 无 started_at / started_at 缺失）⇒ 相位 0，无倒计时锚点
  if (status !== 'active' || startedAtMs == null) {
    return {
      realPhase: 0,
      phaseSeconds,
      maxPhase,
      status,
      startedAtMs,
      isEnded,
      phaseEndsAtMs: null,
      secondsToNextPhase: null,
      elapsedSeconds: null,
    }
  }

  const elapsedMs = nowMs - startedAtMs
  // 时钟尚未到达 started_at（时钟偏移/刚建局）⇒ 钳到 0
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const rawPhase = Math.floor(Math.max(0, elapsedMs) / (phaseSeconds * 1000))
  const realPhase = Math.min(maxPhase, rawPhase)

  // 已到末路阶段：无"下一阶段"，倒计时归 null
  if (realPhase >= maxPhase) {
    return {
      realPhase: maxPhase,
      phaseSeconds,
      maxPhase,
      status,
      startedAtMs,
      isEnded,
      phaseEndsAtMs: null,
      secondsToNextPhase: null,
      elapsedSeconds,
    }
  }

  const phaseEndsAtMs = startedAtMs + (realPhase + 1) * phaseSeconds * 1000
  const secondsToNextPhase = Math.max(0, Math.ceil((phaseEndsAtMs - nowMs) / 1000))

  return {
    realPhase,
    phaseSeconds,
    maxPhase,
    status,
    startedAtMs,
    isEnded,
    phaseEndsAtMs,
    secondsToNextPhase,
    elapsedSeconds,
  }
}

/**
 * 有效阶段 = min(maxPhase, realPhase + depth)。
 * Phase 31 玩家 depth 恒 0 ⇒ 返回值恒 === realPhase。
 *
 * @param {number} realPhase
 * @param {number} [depth=0]
 * @param {number} [maxPhase=MAX_PHASE_DEFAULT]
 * @returns {number}
 */
export function effectivePhase(realPhase, depth = 0, maxPhase = MAX_PHASE_DEFAULT) {
  const rp = Number.isFinite(realPhase) ? Math.max(0, Math.floor(realPhase)) : 0
  const d = Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : 0
  const mp = Number.isFinite(maxPhase) ? Math.max(0, Math.floor(maxPhase)) : MAX_PHASE_DEFAULT
  return Math.min(mp, rp + d)
}

/**
 * 钳制 phase_seconds 到 [MIN_PHASE_SECONDS, ∞)；无效输入回落默认值。
 * createMatch 用于接受 dev 传入的短 phase_seconds 走查。
 */
export function clampPhaseSeconds(raw) {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n)) return PHASE_SECONDS_DEFAULT
  return Math.max(MIN_PHASE_SECONDS, n)
}

/** 钳制 max_phase 到 [0, ∞) 整数；无效回落默认 4 */
export function clampMaxPhase(raw) {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n < 0) return MAX_PHASE_DEFAULT
  return n
}
