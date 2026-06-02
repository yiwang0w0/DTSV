/**
 * stamina.js — BR 体力系统纯计算（行动经济）
 *
 * 设计：体力由三个主动作消耗 —— move（走惩罚倍率 + 刷 lastMoveAt）、search/attack（平消耗、不刷 lastMoveAt），
 *   自然回复刻意压低，主回复源是可搜刮的体力回复道具（restoreStamina）。把「瞬移刷图 / 无脑连搜连打」
 *   逼成「有节奏地行动 + 靠搜刮回血」。详见 constants.js 的 STAMINA_CONFIG 注释（数值 single source of truth）。
 *
 * 本模块**完全无副作用**：所有函数为纯计算，不修改入参、返回新对象，`now` 可注入（默认调用方传 nowMs）。
 *   被服务端权威扣除/拦截（moveToRoom / searchArea / attackNpc / attackPlayer / useItem）与客户端预览
 *   （UX 推算）共享同一份算法，保证前后端不漂移。
 *
 * 平消耗 vs 移动消耗的关键区别（applyStaminaCost vs applyMoveStamina）：
 *   - applyMoveStamina：走惩罚倍率（cost = ceil(MOVE_COST × mult)），通过时刷 staminaAt **且** lastMoveAt。
 *   - applyStaminaCost：固定 cost（调用方传 SEARCH_COST / ATTACK_COST），无惩罚倍率，通过时**只刷 staminaAt**，
 *     绝不刷 lastMoveAt（否则污染下一次 move 的 dt 锚点，把「搜完就走」误判成快速移动 → 多收惩罚）。
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
 *   effectiveStamina: clamp(stamina + REGEN×Δs, 0, max)，Δs<0 钳到 0、上溢钳到 max。
 *   applyMoveStamina: 不足时 blocked=true 且不改体力字段；通过时 stamina=回复后−cost、staminaAt=now、lastMoveAt=now。
 *   applyStaminaCost（cost=5, REGEN=0.5, max=100，lastMoveAt=12345 固定锚点）：
 *     before=8（stamina=8,staminaAt=now）→ 扣后 stamina=3、staminaAt=now、**lastMoveAt 仍=12345（未动）**、blocked=false。
 *     before=4 < cost=5 ⇒ blocked=true，player 体力字段与 lastMoveAt 全不变（零副作用）。
 *     懒回复参与判定：stamina=2,staminaAt=now−6000ms ⇒ before=2+0.5×6=5 ≥5 ⇒ 通过，扣后=0。
 *   restoreStamina（amount=50, REGEN=0.5, max=100，lastMoveAt=12345）：
 *     stamina=30,staminaAt=now ⇒ cur=30 → +50=80 ≤100 → stamina=80、staminaAt=now、lastMoveAt 仍=12345。
 *     stamina=70 → +50=120 → clamp 100。stamina=20,staminaAt=now−10000 ⇒ cur=20+0.5×10=25 → +50=75。
 *     amount=0 / 负 / NaN ⇒ 安全（NaN 经 clamp 落 0）；老存档缺字段先 backfill 不崩。
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

/**
 * 平消耗体力结算（search / attack 等「固定单价」动作；与 applyMoveStamina 并列、语义不同）。
 * 与移动消耗的两点关键区别：
 *   1. cost 由调用方传入（固定 SEARCH_COST / ATTACK_COST），**不乘**移动惩罚倍率。
 *   2. 通过时**只刷 staminaAt**，绝不刷 lastMoveAt —— 否则污染下一次 move 的 dt 锚点，
 *      把「搜完/打完就走」误判成快速移动而多收惩罚。
 *
 * 时序（同一 now 下原子结算）：
 *   1. backfill 兜底老玩家无字段
 *   2. before = effectiveStamina(now)（懒回复到 now）
 *   3. before < cost ⇒ blocked=true，**不改任何体力字段**（拦截零副作用，调用方据此抛 no_stamina）
 *   4. 通过 ⇒ stamina = clamp(before − cost, 0, max)、staminaAt = now（lastMoveAt 原样保留）
 *
 * @param {object} player
 * @param {number} nowMs
 * @param {number} cost  本次消耗（平价，由调用方传 SEARCH_COST / ATTACK_COST）
 * @param {object} [cfg=STAMINA_CONFIG]
 * @returns {{ player:object, blocked:boolean, before:number, cost:number }}
 *   player：blocked 时为 backfill 后的原玩家（体力字段不变）；通过时为已扣体力 + 刷 staminaAt 的新玩家。
 *   before：本次结算前懒回复到 now 的有效体力（用于日志/调试）。
 */
export function applyStaminaCost(player, nowMs, cost, cfg = STAMINA_CONFIG) {
  const ensured = ensureStaminaFields(player, nowMs, cfg)
  const need = Number.isFinite(cost) ? cost : 0
  const before = effectiveStamina(ensured, nowMs, cfg)
  if (before < need) {
    return { player: ensured, blocked: true, before, cost: need }
  }
  const max = Number.isFinite(ensured.maxStamina) ? ensured.maxStamina : cfg.MAX_STAMINA
  const next = {
    ...ensured,
    stamina:   clamp(before - need, 0, max),
    staminaAt: nowMs,
    // lastMoveAt 故意不动：平消耗动作不重置移动惩罚锚点
  }
  return { player: next, blocked: false, before, cost: need }
}

/**
 * 恢复体力（体力回复道具用；纯计算、不修改入参、返回新对象）。
 * 懒回复到 now 后再 +amount，clamp 到 [0, max]，刷 staminaAt（lastMoveAt 原样保留 —— 用道具不是移动）。
 * amount 非有限 / 负值经 clamp 安全收敛（NaN → 落 0）。老存档缺字段先 backfill 不崩。
 *
 * @param {object} player
 * @param {number} nowMs
 * @param {number} amount  恢复量（如 RECOVERY_ITEM.RESTORE）
 * @param {object} [cfg=STAMINA_CONFIG]
 * @returns {{ player:object, restored:number, before:number, after:number }}
 *   player：已加体力 + 刷 staminaAt 的新玩家；restored：实际增加量（受上限钳制后 after−before）。
 */
export function restoreStamina(player, nowMs, amount, cfg = STAMINA_CONFIG) {
  const ensured = ensureStaminaFields(player, nowMs, cfg)
  const max = Number.isFinite(ensured.maxStamina) ? ensured.maxStamina : cfg.MAX_STAMINA
  const before = effectiveStamina(ensured, nowMs, cfg)
  const add = Number.isFinite(amount) ? amount : 0
  const after = clamp(before + add, 0, max)
  const next = {
    ...ensured,
    stamina:   after,
    staminaAt: nowMs,
    // lastMoveAt 故意不动：用道具不重置移动惩罚锚点
  }
  return { player: next, restored: after - before, before, after }
}
