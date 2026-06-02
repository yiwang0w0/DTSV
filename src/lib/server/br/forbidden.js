/**
 * forbidden.js — 虚拟空间BR「禁区」纯函数层（gamevars 路径 · Phase 31 re-home）
 *
 * 设计宪法 docs/timejump-br-design.md §3：缩圈 = 禁区集合随 phase 单调增长。
 * 本模块把「禁区 / 物资档」从 br_zone_tables（DB 读）改造成 **per-raid 确定性种子在代码里算**：
 *   - 不读 br_zone_tables、不建 br_match* 对局表；纯函数、无 DB、无副作用、可单测。
 *   - 同 seed 同结果（崩溃安全：禁区按 wall-clock 阶段实时算，不落库、不需 cron）。
 *
 * ⚠️ 本文件供 game 路径（gameActions.js + roomState.js）使用。
 *    独立 /br 路径（br/zones.js 的 DB 版 + br_match*）保持不动，两条路径并存。
 *
 * 缩圈语义（与 schema phase-30 注释等价，但 close_phase 来自 seed 洗牌而非 DB）：
 *   - 每房恰好一个 close_phase ∈ 1..5；每阶段恰好 20 房进入禁区。
 *   - 开放房数：phase0=100 / phase1=80 / phase2=60 / phase3=40 / phase4=20。
 *   - forbidden(seed, phase, roomId) = (phase >= closePhaseOf(roomId))，等价旧 is_forbidden。
 */

// 网格房间总数（与 schema 种子拓扑 10×10 = 100 房对齐）
export const ROOM_COUNT = 100
// 每阶段进入禁区的房间数（100 / 5 = 20）
export const ROOMS_PER_STAGE = 20
// close_phase 上限（5 个阶段桶）
export const MAX_CLOSE_PHASE = 5

/* ── PRNG（项目无现成，标准实现） ───────────────────────────── */

/**
 * xmur3 字符串散列 → 返回一个「每次调用吐 uint32」的生成器。
 * （标准实现，用于把任意字符串种子折算成可重现的 32-bit 整数流。）
 * @param {string} str
 * @returns {() => number} 调用一次返回一个 uint32
 */
export function xmur3(str) {
  let h = 1779033703 ^ String(str).length
  for (let i = 0; i < String(str).length; i++) {
    h = Math.imul(h ^ String(str).charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return h >>> 0
  }
}

/**
 * mulberry32 — 由一个 uint32 种子产出 [0,1) 浮点 RNG（标准实现）。
 * @param {number} a uint32 种子
 * @returns {() => number} 调用一次返回 [0,1)
 */
export function mulberry32(a) {
  let t = a >>> 0
  return function () {
    t |= 0
    t = (t + 0x6d2b79f5) | 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 把若干 key 拼接散列成一个 uint32（派生子种子 / 一次性散列用）。
 * @param  {...(string|number)} keys
 * @returns {number} uint32
 */
export function hashSeed(...keys) {
  return xmur3(keys.join(':'))()
}

/* ── per-raid 种子生成 ──────────────────────────────────────── */

/**
 * 为一局生成确定性种子（joinRoom 首玩家调用一次，存 gamevars.br.seed 后永不变）。
 * 与对局绑定（room.id + gamenum + created_at），对同一局稳定。
 *
 * @param {object} room rooms 行：{ id, gamenum, created_at }
 * @returns {number} uint32 seed
 */
export function makeRaidSeed(room) {
  const id = room?.id ?? 0
  const gamenum = room?.gamenum ?? 0
  const createdAt = room?.created_at ?? Date.now()
  return hashSeed(String(id), String(gamenum), String(createdAt))
}

/* ── close_phase 洗牌分配 ───────────────────────────────────── */

// 模块内记忆化（避免每次动作重洗牌）：seed → Map<roomId, closePhase>
const _closePhaseCache = new Map()

/**
 * 按 seed 确定性洗牌 100 房，每 20 房分一个 close_phase（1..5）。
 * Fisher-Yates 洗牌（mulberry32(hashSeed(seed,'close')) 作 RNG）得到排列，
 * 排列前 20 → close_phase=1，次 20 → 2，… 末 20 → 5。
 *   ⇒ 单调累计：phase p 禁区数 = 20*p；开放数 = 100-20*p（100/80/60/40/20）。
 *
 * 纯函数 + 模块内 memo（同 seed 命中缓存，不重算）。
 *
 * @param {number} seed
 * @returns {Map<number, number>} roomId(1..100) → closePhase(1..5)
 */
export function computeClosePhases(seed) {
  const key = String(seed >>> 0)
  const cached = _closePhaseCache.get(key)
  if (cached) return cached

  // 1..ROOM_COUNT 的房间号数组
  const rooms = []
  for (let i = 1; i <= ROOM_COUNT; i++) rooms.push(i)

  // Fisher-Yates 洗牌（确定性 RNG）
  const rng = mulberry32(hashSeed(seed, 'close'))
  for (let i = rooms.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = rooms[i]
    rooms[i] = rooms[j]
    rooms[j] = tmp
  }

  // 前 20 → phase1, 次 20 → phase2, …（末 20 → phase5）
  const map = new Map()
  for (let idx = 0; idx < rooms.length; idx++) {
    const stage = Math.min(MAX_CLOSE_PHASE, Math.floor(idx / ROOMS_PER_STAGE) + 1)
    map.set(rooms[idx], stage)
  }

  _closePhaseCache.set(key, map)
  return map
}

/**
 * 取某房的 close_phase（缺失兜底 MAX_CLOSE_PHASE = 最晚关，最安全）。
 * @param {number} seed
 * @param {number} roomId
 * @returns {number} 1..5
 */
export function closePhaseOf(seed, roomId) {
  const m = computeClosePhases(seed)
  return m.get(Number(roomId)) ?? MAX_CLOSE_PHASE
}

/* ── 唯一生死判据 + 物资档 ──────────────────────────────────── */

/**
 * forbidden(seed, phase, roomId) — 该有效阶段下此房是否禁区（踏入即死）。
 * 等价旧 zones is_forbidden=(phase>=close_phase)，但 close_phase 来自 seed 洗牌。
 *
 * @param {number} seed
 * @param {number} phase 有效阶段（调用方应已钳到 [0, maxPhase]）
 * @param {number} roomId
 * @returns {boolean} true=禁区
 */
export function forbidden(seed, phase, roomId) {
  const p = Number.isFinite(phase) ? Math.max(0, Math.floor(phase)) : 0
  return p >= closePhaseOf(seed, roomId)
}

/**
 * lootTier(seed, phase, roomId) — 该阶段此房物资档位 T1..T5。
 * 本期沿用 phase+1（与 schema L130 一致）；per-room 差异留后续 phase。
 * seed/roomId 入参保留（接口稳定，未来可加 per-room 扰动）。
 *
 * @param {number} seed
 * @param {number} phase
 * @param {number} roomId
 * @returns {number} 1..5
 */
export function lootTier(seed, phase, roomId) {
  const p = Number.isFinite(phase) ? Math.max(0, Math.floor(phase)) : 0
  return Math.max(1, Math.min(5, p + 1))
}

/**
 * 一次性导出整局的 closePhases 普通对象（{ [roomId]: closePhase }），
 * 供 joinRoom 写进 gamevars.br.closePhases（客户端着色用「公开禁区表」，不下发 seed）。
 *
 * @param {number} seed
 * @returns {Object<number, number>}
 */
export function closePhasesObject(seed) {
  const m = computeClosePhases(seed)
  const obj = {}
  for (const [roomId, cp] of m.entries()) obj[roomId] = cp
  return obj
}
