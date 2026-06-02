/**
 * stamina.js — BR 体力系统纯计算（移动经济）
 *
 * 设计：体力是「只由移动消耗」的资源，配合移动惩罚倍率（短间隔连续移动单步更贵）双层耦合，
 *   把「瞬移刷图」逼成「走两步歇一下」。详见 constants.js 的 STAMINA_CONFIG 注释（数值 single source of truth）。
 *
 * 本模块**完全无副作用**：所有函数为纯计算，不修改入参、返回新对象，`now` 可注入（默认 Date.now()）。
 *   被 moveToRoom（服务端权威扣除/拦截）与客户端预览（UX 推算）共享同一份算法，保证前后端不漂移。
 *
 * 用相对路径 import constants.js（而非 @/ 别名）：与 pollution.js / roomState.js 同样照顾
 *   scripts/smoke-check.mjs 以原生 Node ESM 直接 import（Node 不解析 webpack @/ 别名；constants.js 自身零 import 可被解析）。
 *
 * 体力字段（落在 player 上，持久化到 rooms.gamevars.players[uid]；normalizeGamevars 对 players 原样透传）：
 *   stamina      number   上次结算时刻的体力快照
 *   maxStamina   number   本局上限（恒 = STAMINA_CONFIG.MAX_STAMINA，留作未来职业 perk 扩展位）
 *   staminaAt    number   stamina 快照对应的 wall-clock 毫秒时刻；懒回复锚点
 *   lastMoveAt   number|null  上次成功移动的毫秒时间戳；惩罚倍率自变量 dt 的锚点；首次移动为 null
 *
 * ── 自测（node 实算已校验，见 scripts/smoke-check.mjs）──
 *   movePenaltyMultiplier: 4 锚点精确命中 0s→6 / 5s→5 / 15s→3 / 30s→1；中间值 2.5s→5.5 / 10s→4 / 22.5s→2；
 *     首次(null→+Infinity) / dt≥30 / 负值 / NaN / Infinity ⇒ 1（按 1× 不冤枉）。
 *   moveStaminaCost: ceil(10×mult) ⇒ dt=29s→ceil(11.33)=12，dt≥30→10，dt=2.5s→55。
 *   effectiveStamina: clamp(stamina + 4×Δs, 0, max)，Δs<0 钳到 0、上溢钳到 max。
 *   applyMoveStamina: 不足时 blocked=true 且不改体力字段；通过时 stamina=回复后−cost、staminaAt=now、lastMoveAt=now。
 */

import { STAMINA_CONFIG } from './constants.js'

function clamp(v, lo, hi) {
  if (!Number.isFinite(v)) return lo
  if (v < lo) return lo
  if (v > hi) return hi
  return v
}

/**
 * 自上次移动到 now 经过的秒数（惩罚倍率自变量 dt）。
 * lastMoveAt 为 null / 非有限 ⇒ 返回 +Infinity（首次移动哨兵 ⇒ 倍率恒 1×，不冤枉新移动）。
 * @param {number|null} lastMoveAt 毫秒时间戳
 * @param {number} nowMs
 * @returns {number} 秒数（>=0）或 +Infinity
 */
export function dtSecSince(lastMoveAt, nowMs) {
  if (lastMoveAt == null || !Number.isFinite(lastMoveAt)) return Infinity
  const dt = (nowMs - lastMoveAt) / 1000
  return Number.isFinite(dt) ? dt : Infinity
}

/**
 * 移动惩罚倍率：以 STAMINA_CONFIG.PENALTY_ANCHORS 对「总消耗倍率」分段线性插值。
 * 锚点 (0s,6×) → (5s,5×) → (15s,3×) → (30s+,1×)；dt≥末锚 dtSec ⇒ 末锚倍率（1×）。
 * 边界：首次(dt=+Infinity) / dt≥30 / dt 非有限 / dt<0 ⇒ 1（按 1× 处理，绝不放大首次/异常移动）。
 * @param {number} dtSec
 * @param {object} [cfg=STAMINA_CONFIG]
 * @returns {number} 倍率，恒 >= 1
 */
export function movePenaltyMultiplier(dtSec, cfg = STAMINA_CONFIG) {
  const anchors = cfg?.PENALTY_ANCHORS || STAMINA_CONFIG.PENALTY_ANCHORS
  // 非法 / 负 dt ⇒ 1×（不冤枉）；首次移动 dt=+Infinity 走「>=末锚」分支同样回 1×
  if (!Number.isFinite(dtSec) || dtSec < 0) return 1
  const last = anchors[anchors.length - 1]
  // dt 落在最后锚点之后（含 30s+）⇒ 取末锚倍率（设计上恒为 1×）
  if (dtSec >= last[0]) return last[1]
  // 落在某相邻锚点区间内 ⇒ 线性插值
  for (let i = 0; i < anchors.length - 1; i++) {
    const [x0, y0] = anchors[i]
    const [x1, y1] = anchors[i + 1]
    if (dtSec >= x0 && dtSec <= x1) {
      const span = x1 - x0
      if (span <= 0) return y0
      const t = (dtSec - x0) / span
      return y0 + (y1 - y0) * t
    }
  }
  // dt 小于首锚 dtSec（首锚通常为 0，理论不可达）⇒ 取首锚倍率
  return anchors[0][1]
}

/**
 * 本次移动实际消耗体力 = ceil(MOVE_COST × movePenaltyMultiplier(dt))。
 * 用 Math.ceil 保证「至少不少扣」，避免边界少收（dt=29s→raw 11.33→ceil 12；dt≥30→恰 10）。
 * @param {number} dtSec
 * @param {object} [cfg=STAMINA_CONFIG]
 * @returns {number} 整数消耗 >= MOVE_COST
 */
export function moveStaminaCost(dtSec, cfg = STAMINA_CONFIG) {
  const base = Number(cfg?.MOVE_COST) || STAMINA_CONFIG.MOVE_COST
  return Math.ceil(base * movePenaltyMultiplier(dtSec, cfg))
}

/**
 * 懒回复后的有效体力（不修改入参）。
 *   effectiveStamina = clamp(stamina + REGEN_PER_SEC × max(0, now−staminaAt)/1000, 0, maxStamina)
 * 旧存档缺字段时退化安全：stamina 缺→0（随即被钳）、staminaAt 缺→不回复、maxStamina 缺→MAX_STAMINA。
 * @param {object} player
 * @param {number} nowMs
 * @param {object} [cfg=STAMINA_CONFIG]
 * @returns {number} clamp 后体力
 */
export function effectiveStamina(player, nowMs, cfg = STAMINA_CONFIG) {
  const max = Number.isFinite(player?.maxStamina) ? player.maxStamina : cfg.MAX_STAMINA
  const cur = Number.isFinite(player?.stamina) ? player.stamina : 0
  const at = Number.isFinite(player?.staminaAt) ? player.staminaAt : null
  if (at == null) return clamp(cur, 0, max)
  const elapsedSec = Math.max(0, (nowMs - at) / 1000)
  const regen = (Number(cfg?.REGEN_PER_SEC) || 0) * elapsedSec
  return clamp(cur + regen, 0, max)
}

/**
 * 旧存档 backfill：本特性上线前已开局的 BR 老玩家无体力字段 → 补默认值（不修改入参，返回新对象）。
 * 已有字段则原样保留（不覆盖、不重置回复进度）。staminaAt 缺失时锚到 now（视为「此刻满血」起算）。
 * @param {object} player
 * @param {number} nowMs
 * @param {object} [cfg=STAMINA_CONFIG]
 * @returns {object} player（含完整体力字段）
 */
export function ensureStaminaFields(player, nowMs, cfg = STAMINA_CONFIG) {
  if (!player) return player
  const hasStamina = Number.isFinite(player.stamina)
  const hasMax = Number.isFinite(player.maxStamina)
  const hasAt = Number.isFinite(player.staminaAt)
  const hasLastMove = ('lastMoveAt' in player)
  // 全字段齐备 ⇒ 原样返回（避免无谓新对象）
  if (hasStamina && hasMax && hasAt && hasLastMove) return player
  const maxStamina = hasMax ? player.maxStamina : cfg.MAX_STAMINA
  return {
    ...player,
    stamina:    hasStamina ? player.stamina : maxStamina,
    maxStamina,
    staminaAt:  hasAt ? player.staminaAt : nowMs,
    lastMoveAt: hasLastMove ? player.lastMoveAt : null,
  }
}

/**
 * 一站式移动体力结算（收口「backfill → 懒回复 → 判消耗 → 扣除/刷两时间戳」）。
 * moveToRoom 与客户端预览共用其中纯函数；服务端用本函数把逻辑收一处。
 *
 * 时序（同一 now 下原子结算，回复与消耗不漂移）：
 *   1. backfill 兜底老玩家无字段
 *   2. dt = dtSecSince(lastMoveAt, now) → multiplier → cost
 *   3. curStam = effectiveStamina(now)（懒回复到 now）
 *   4. curStam < cost ⇒ blocked=true，**不改任何体力字段**（拦截零副作用，调用方据此抛 no_stamina）
 *   5. 通过 ⇒ stamina = curStam − cost、staminaAt = now、lastMoveAt = now
 *
 * @param {object} player
 * @param {number} nowMs
 * @param {object} [cfg=STAMINA_CONFIG]
 * @returns {{ player:object, cost:number, multiplier:number, blocked:boolean, before:number }}
 *   player：blocked 时为 backfill 后的原玩家（体力字段不变）；通过时为已扣体力 + 刷时间戳的新玩家。
 *   before：本次结算前懒回复到 now 的有效体力（用于日志/调试）。
 */
export function applyMoveStamina(player, nowMs, cfg = STAMINA_CONFIG) {
  const ensured = ensureStaminaFields(player, nowMs, cfg)
  const dtSec = dtSecSince(ensured.lastMoveAt, nowMs)
  const multiplier = movePenaltyMultiplier(dtSec, cfg)
  const cost = moveStaminaCost(dtSec, cfg)
  const before = effectiveStamina(ensured, nowMs, cfg)
  if (before < cost) {
    return { player: ensured, cost, multiplier, blocked: true, before }
  }
  const max = Number.isFinite(ensured.maxStamina) ? ensured.maxStamina : cfg.MAX_STAMINA
  const next = {
    ...ensured,
    stamina:    clamp(before - cost, 0, max),
    staminaAt:  nowMs,
    lastMoveAt: nowMs,
  }
  return { player: next, cost, multiplier, blocked: false, before }
}
