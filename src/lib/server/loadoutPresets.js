/**
 * loadoutPresets.js — 入场装配预设 helper（Phase 24b 预埋）
 *
 * research 2026-05-12 主题 A — "Loadout preset 节省入场摩擦"。
 * 玩家可保存最多 LOADOUT_PRESETS.MAX_SLOTS 套常用装配（职业 + 装备 + 道具 + 兑换），
 * 下次入场一键复用，降低 PrepareModal 重复选择摩擦。
 *
 * 持久载体 = profiles.saved_loadouts JSONB（phase-25m，CHECK 限 <= MAX_SLOTS 槽）。
 * 单槽结构: { name, classId, equip:[id], items:[{id,qty}], exchanges:[{rateId,times}], savedAt }
 *
 * 全部为纯函数、无 DB 副作用 —— Phase 24b PrepareModal 调用:
 *   1. 读取: sanitizeLoadoutPresets(profile.saved_loadouts) → 渲染下拉
 *   2. 应用: applyPresetToCart(preset, { equipment, rates }) → 投影回 cart（过滤失效 id）
 *   3. 保存: upsertLoadoutPresets(cur, buildPresetFromCart(state), MAX_SLOTS) → 写回 profiles
 *
 * 红线（economy-canon §3）：纯装配复用，保存预设绝不预扣点数；应用预设仍走正常 onConfirm
 *   扣点流程，故不引入任何净新经济。商店改版后失效 id 静默丢弃，不报错、不阻断入场。
 */

import { LOADOUT_PRESETS } from '../constants'

function clampName(raw) {
  const s = typeof raw === 'string' ? raw.trim() : ''
  const max = Number(LOADOUT_PRESETS.NAME_MAX_LEN) || 24
  if (!s) return '未命名预设'
  return s.length > max ? s.slice(0, max) : s
}

function toPositiveInt(v) {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

/**
 * 规范化单个 preset：丢弃非法字段，保证 equip/items/exchanges 结构干净。
 * @param {*} raw
 * @returns {{name:string, classId:(number|null), equip:number[], items:Array<{id:number,qty:number}>, exchanges:Array<{rateId:number,times:number}>, savedAt:(string|null)}|null}
 */
export function sanitizePreset(raw) {
  if (!raw || typeof raw !== 'object') return null

  const classId = toPositiveInt(raw.classId)

  const equip = Array.isArray(raw.equip)
    ? Array.from(new Set(raw.equip.map(toPositiveInt).filter(v => v != null)))
    : []

  const items = Array.isArray(raw.items)
    ? raw.items
        .map(it => {
          const id = toPositiveInt(it?.id)
          const qty = toPositiveInt(it?.qty)
          return id != null && qty != null ? { id, qty } : null
        })
        .filter(Boolean)
    : []

  const exchanges = Array.isArray(raw.exchanges)
    ? raw.exchanges
        .map(ex => {
          const rateId = toPositiveInt(ex?.rateId)
          const times = toPositiveInt(ex?.times)
          return rateId != null && times != null ? { rateId, times } : null
        })
        .filter(Boolean)
    : []

  const savedAt = typeof raw.savedAt === 'string' ? raw.savedAt : null

  return { name: clampName(raw.name), classId, equip, items, exchanges, savedAt }
}

/**
 * 规范化整个 saved_loadouts 数组：逐项 sanitize + 截断到 MAX_SLOTS。
 * 列缺失 / 非数组 / null 都安全返回 []。
 * @param {*} raw — profiles.saved_loadouts
 * @returns {Array} 干净的 preset 数组
 */
export function sanitizeLoadoutPresets(raw) {
  if (!Array.isArray(raw)) return []
  const max = Number(LOADOUT_PRESETS.MAX_SLOTS) || 5
  return raw.map(sanitizePreset).filter(Boolean).slice(0, max)
}

/**
 * 从 PrepareModal cart 状态构建一个 preset 对象（保存前调用）。
 * @param {{name:string, classId:(number|null), equipCart:Object, itemCart:Object, exchangeCart:Object}} state
 *   equipCart: { catalogId: true } / itemCart: { catalogId: qty } / exchangeCart: { rateId: times }
 * @returns {Object} 已 sanitize 的 preset
 */
export function buildPresetFromCart({ name, classId, equipCart, itemCart, exchangeCart } = {}) {
  const equip = Object.keys(equipCart || {}).filter(k => equipCart[k]).map(k => Number(k))

  const items = Object.entries(itemCart || {})
    .map(([id, qty]) => ({ id: Number(id), qty: Number(qty) || 0 }))
    .filter(it => it.qty > 0)

  const exchanges = Object.entries(exchangeCart || {})
    .map(([rateId, times]) => ({ rateId: Number(rateId), times: Number(times) || 0 }))
    .filter(ex => ex.times > 0)

  return sanitizePreset({
    name,
    classId,
    equip,
    items,
    exchanges,
    savedAt: new Date().toISOString(),
  })
}

/**
 * 把 preset 投影回 PrepareModal cart，并按当前 catalog/rates 过滤失效 id。
 * 商店改版后旧 preset 引用的不存在商品被静默丢弃 → 不报错、不阻断入场。
 * 职业候选有效性由调用方按 classCandidates 自行校验（此处仅透传 classId）。
 * @param {Object} preset — 单个 preset（建议先 sanitizePreset）
 * @param {{equipment?:Array, consumables?:Array, storyItems?:Array, rates?:Array}} ctx
 *   equipment/consumables/storyItems: shop_catalog 行（含 id）; rates: shop_exchange_rates 行（含 id）
 * @returns {{classId:(number|null), equipCart:Object, itemCart:Object, exchangeCart:Object, dropped:{equip:number,items:number,exchanges:number}}}
 */
export function applyPresetToCart(preset, ctx = {}) {
  const p = sanitizePreset(preset) || { classId: null, equip: [], items: [], exchanges: [] }

  const equipIds = new Set((ctx.equipment || []).map(r => Number(r.id)))
  const itemIds = new Set([...(ctx.consumables || []), ...(ctx.storyItems || [])].map(r => Number(r.id)))
  const rateIds = new Set((ctx.rates || []).map(r => Number(r.id)))

  const equipCart = {}
  let droppedEquip = 0
  // 装备每槽至多 1 件由 UI toggleEquip 保证；此处仅恢复有效 id
  for (const id of p.equip) {
    if (equipIds.has(id)) equipCart[id] = true
    else droppedEquip++
  }

  const itemCart = {}
  let droppedItems = 0
  for (const { id, qty } of p.items) {
    if (itemIds.has(id)) itemCart[id] = qty
    else droppedItems++
  }

  const exchangeCart = {}
  let droppedExchanges = 0
  for (const { rateId, times } of p.exchanges) {
    if (rateIds.has(rateId)) exchangeCart[rateId] = times
    else droppedExchanges++
  }

  return {
    classId: p.classId,
    equipCart,
    itemCart,
    exchangeCart,
    dropped: { equip: droppedEquip, items: droppedItems, exchanges: droppedExchanges },
  }
}

/**
 * 保存 / 覆盖一个 preset（同名覆盖，否则追加）。超出 MAX_SLOTS 且为新增时拒绝。
 * @param {Array} presets — 现有 saved_loadouts（建议先 sanitize）
 * @param {Object} preset — 待保存 preset（建议来自 buildPresetFromCart）
 * @param {number} [maxSlots] — 槽位上限，默认 LOADOUT_PRESETS.MAX_SLOTS
 * @returns {{ok:boolean, presets:Array, reason?:string}} ok=false 时 presets 原样返回 + reason
 */
export function upsertLoadoutPresets(presets, preset, maxSlots) {
  const max = Number(maxSlots) || Number(LOADOUT_PRESETS.MAX_SLOTS) || 5
  const cur = sanitizeLoadoutPresets(presets)
  const clean = sanitizePreset(preset)
  if (!clean) return { ok: false, presets: cur, reason: 'invalid-preset' }

  const idx = cur.findIndex(p => p.name === clean.name)
  if (idx >= 0) {
    const next = cur.slice()
    next[idx] = clean
    return { ok: true, presets: next }
  }
  if (cur.length >= max) {
    return { ok: false, presets: cur, reason: 'slots-full' }
  }
  return { ok: true, presets: [...cur, clean] }
}

/**
 * 按名删除一个 preset。
 * @param {Array} presets
 * @param {string} name
 * @returns {Array} 删除后的数组（已 sanitize）
 */
export function removeLoadoutPreset(presets, name) {
  const target = clampName(name)
  return sanitizeLoadoutPresets(presets).filter(p => p.name !== target)
}
