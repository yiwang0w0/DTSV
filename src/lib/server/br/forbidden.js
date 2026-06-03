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
 * 缩圈语义（close_phase 来自 seed 洗牌而非 DB；按「实际启用房集」比例分桶，自适应任意房数 N）：
 *   - 每房恰好一个 close_phase ∈ 1..MAX_CLOSE_PHASE；bucketSize=ceil(N/MAX) 房进一阶段禁区。
 *   - N=100,MAX=5 → 每段 20（开放数 phase0=100/80/60/40/20，与旧固定语义同段数·零回归）。
 *   - forbidden(seed, phase, roomId, roomIds) = (phase >= closePhaseOf(roomId))，等价旧 is_forbidden。
 *   - 一局 init 时一次性把 closePhases 落进 gamevars.br.closePhases 快照；之后服务端致死与客户端
 *     着色都读该快照（不再实时重算 seed）→ 逐格自洽，且不被「在飞局改拓扑」破坏（快照冻结）。
 */

// @deprecated 旧固定 100 房语义。新版 computeClosePhases 按传入 roomIds 比例分桶，
//   不再引用 ROOM_COUNT/ROOMS_PER_STAGE（二者降为纯文档常量；保留导出以免外部 import 断裂）。
// 网格房间总数（旧 10×10 = 100 房拓扑的历史值）
export const ROOM_COUNT = 100
// @deprecated 旧每阶段进入禁区的房间数（旧 100/5 = 20）；新版改用 bucketSize=ceil(N/MAX) 比例分桶。
export const ROOMS_PER_STAGE = 20
// close_phase 上限（5 个阶段桶）—— 仍是核心常量，新旧版都用。
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
 * computeClosePhases(seed, roomIds) — 按 seed 确定性洗牌「实际启用房集」，比例分桶成 close_phase（1..MAX）。
 *
 * 比例分桶（自适应任意房数 N）：
 *   - Fisher-Yates 洗牌（mulberry32(hashSeed(seed,'close')) 作 RNG，与旧版同源）得到排列。
 *   - bucketSize = ceil(N / MAX_CLOSE_PHASE)；closePhase = min(MAX, floor(idx/bucketSize)+1)。
 *   ⇒ 单调累计；N=100,MAX=5 → bucketSize=20 → 5 段每段 20（与旧 100 房语义同段数）。
 *   ⇒ 与旧固定数组洗牌**逐格序列不保证 bit 一致**（旧洗 1..100，新洗传入 roomIds），但回归红线是
 *     「N=100 仍 5 段、每段 ~20」而非「与旧序列相等」：同一局 init 一次性落 closePhases 快照，
 *     服务端致死与客户端着色之后都读该快照 → 自洽。
 *
 * 纯函数 + 模块内 memo（key 含 roomIds 指纹：不同房集不命中错缓存）。
 * N=0 守卫：roomIds 空 → 返回空 Map（**禁止回退 1..ROOM_COUNT**，避免漏传 roomIds 时静默产 100 房幻象）。
 *
 * @param {number} seed
 * @param {number[]} roomIds 实际启用房号集（顺序不敏感，内部洗牌）
 * @returns {Map<number, number>} roomId → closePhase(1..MAX_CLOSE_PHASE)
 */
export function computeClosePhases(seed, roomIds) {
  // memo key 必须含 roomIds 指纹（否则不同房集命中错缓存）
  const ids = (Array.isArray(roomIds) ? roomIds.slice() : []).filter((x) => Number.isFinite(x))
  const key = String(seed >>> 0) + '|' + ids.length + '|' + ids.join(',')
  const cached = _closePhaseCache.get(key)
  if (cached) return cached

  const rooms = ids.slice() // 不再 1..ROOM_COUNT，改用传入房集

  // Fisher-Yates 洗牌（确定性 RNG，与现状同源：mulberry32(hashSeed(seed,'close'))）
  const rng = mulberry32(hashSeed(seed, 'close'))
  for (let i = rooms.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const t = rooms[i]
    rooms[i] = rooms[j]
    rooms[j] = t
  }

  // 比例化分桶：bucketSize = ceil(N / MAX_CLOSE_PHASE)；closePhase = min(MAX, floor(idx/bucketSize)+1)
  const n = rooms.length
  const bucketSize = Math.max(1, Math.ceil(n / MAX_CLOSE_PHASE)) // N=0 守卫（bucketSize≥1，不除零）
  const map = new Map()
  for (let idx = 0; idx < n; idx++) {
    const stage = Math.min(MAX_CLOSE_PHASE, Math.floor(idx / bucketSize) + 1)
    map.set(rooms[idx], stage)
  }

  _closePhaseCache.set(key, map)
  return map
}

/**
 * 取某房的 close_phase（缺失兜底 MAX_CLOSE_PHASE = 最晚关，最安全）。
 * @param {number} seed
 * @param {number} roomId
 * @param {number[]} roomIds 实际启用房号集（透传给 computeClosePhases）
 * @returns {number} 1..MAX_CLOSE_PHASE
 */
export function closePhaseOf(seed, roomId, roomIds) {
  return computeClosePhases(seed, roomIds).get(Number(roomId)) ?? MAX_CLOSE_PHASE
}

/* ── 唯一生死判据 + 物资档 ──────────────────────────────────── */

/**
 * forbidden(seed, phase, roomId, roomIds) — 该有效阶段下此房是否禁区（踏入即死）。
 * 等价旧 zones is_forbidden=(phase>=close_phase)，但 close_phase 来自 seed 洗牌。
 *
 * 致死判据：forbidden ⟺ closePhase <= phase（即 phase >= closePhase，用 `>=` 不是 `>`）。
 *   与客户端 cellStateFor 逐格对齐（差一格会让最内圈房在末路阶段误判可活/误杀）。
 *
 * ⚠️ /game 路径致死现已改读 gamevars.br.closePhases 快照（见 gameActions sweepContractionDeaths /
 *    moveToRoom），不再实时调本函数；本函数保留供 init 选址（forbidden(seed,0,...)）与 /br 兼容。
 *
 * @param {number} seed
 * @param {number} phase 有效阶段（调用方应已钳到 [0, maxPhase]）
 * @param {number} roomId
 * @param {number[]} roomIds 实际启用房号集（透传给 closePhaseOf）
 * @returns {boolean} true=禁区
 */
export function forbidden(seed, phase, roomId, roomIds) {
  const p = Number.isFinite(phase) ? Math.max(0, Math.floor(phase)) : 0
  return p >= closePhaseOf(seed, roomId, roomIds)
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
 * @param {number[]} roomIds 实际启用房号集（透传给 computeClosePhases）
 * @returns {Object<number, number>}
 */
export function closePhasesObject(seed, roomIds) {
  const m = computeClosePhases(seed, roomIds)
  const obj = {}
  for (const [roomId, cp] of m.entries()) obj[roomId] = cp
  return obj
}
