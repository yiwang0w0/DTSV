/**
 * Phase 24c — 职业系统 helper
 *
 * 入场流程：
 *   1. PrepareModal 打开 → 客户端调 /api/classes/roll → rollClassChoices
 *   2. 玩家选定 classId（可选 useHighPt=true 消耗 1 class_pt 保底高级）
 *   3. join 提交 → joinRoom 调 commitClassChoice → applyClassToPlayer
 *
 * Perk 白名单（5-8 个，admin 编辑时不接受 unknown key，运行时也只读这些）
 */

import { getBalances, debitPoints } from './points'

/** 5-8 个 perk 白名单 */
export const PERK_WHITELIST = [
  'search_bonus',         // 搜索成功率 +
  'pollution_resist',     // 个人污染累积 ×(1-x)（负值则加快）
  'combat_dmg_mult',      // 玩家伤害 ×(1+x)
  'combat_def_mult',      // 玩家防御 ×(1+x)
  'omega_window_bonus',   // Ω-段倒计时 +N 回合
  'fragment_drop_bonus',  // 残片掉率 +N（绝对加值）
  'catalog_unlock_tag',   // 解锁 shop_catalog.required_class_ids 含 self 的条目
]

const LEGENDARY_NATURAL_CHANCE = 0.10 // 10% 自然 roll 出 legendary 候选

/**
 * 入场前 roll 候选：3 个 normal + 10% 概率多 1 个 legendary。
 * 同时返回玩家当前 class_pt 余额 + 能否保底（class_pt >= 1）。
 *
 * @returns {Promise<{candidates: Class[], hasLegendary: boolean, canForceHigh: boolean, classPtBalance: number}>}
 */
export async function rollClassChoices(client, userId) {
  // 拉所有 enabled 的 classes 分类
  const { data: all } = await client
    .from('classes')
    .select('id, name, description, rarity, base_atk_bonus, base_def_bonus, base_hp_bonus, perks')
    .eq('enabled', true)

  const normals = (all || []).filter(c => c.rarity === 'normal')
  const legendaries = (all || []).filter(c => c.rarity === 'legendary')

  const shuffled = (arr) => {
    const out = arr.slice()
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }

  const candidates = []
  // 3 个 normal 候选（不足时全选）
  for (const c of shuffled(normals).slice(0, Math.min(3, normals.length))) {
    candidates.push(c)
  }

  // 10% 概率追加 1 个 legendary
  let hasLegendary = false
  if (legendaries.length > 0 && Math.random() < LEGENDARY_NATURAL_CHANCE) {
    candidates.push(shuffled(legendaries)[0])
    hasLegendary = true
  }

  // 查 class_pt 余额（供前端判断保底按钮）
  const balances = await getBalances(client, userId)

  return {
    candidates,
    hasLegendary,
    canForceHigh: (balances.class_pt || 0) >= 1 && legendaries.length > 0,
    classPtBalance: balances.class_pt || 0,
  }
}

/**
 * 玩家用 1 class_pt 强制刷一个 legendary 候选（保底）。
 * 调用方需保证此前 rollClassChoices 已发起且玩家明确确认。
 *
 * @returns {Promise<{candidate: Class, debited: number}>}
 */
export async function forceRollLegendary(client, userId) {
  await debitPoints(client, userId, [{ type: 'class_pt', amount: 1 }])
  const { data: legendaries } = await client
    .from('classes')
    .select('id, name, description, rarity, base_atk_bonus, base_def_bonus, base_hp_bonus, perks')
    .eq('enabled', true)
    .eq('rarity', 'legendary')
  if (!legendaries || legendaries.length === 0) {
    throw new Error('当前没有可用的 legendary 职业')
  }
  const pick = legendaries[Math.floor(Math.random() * legendaries.length)]
  return { candidate: pick, debited: 1 }
}

/**
 * 在 joinRoom 内提交玩家选定的 classId。
 *
 * @param {number} classId
 * @param {boolean} usedHighPt - 玩家是否消耗了 class_pt 保底
 * @returns {Promise<Class>} 选定的 class 完整对象
 */
export async function commitClassChoice(client, userId, roomId, classId, usedHighPt = false) {
  if (!classId) throw new Error('未选择职业')
  const { data: cls, error } = await client
    .from('classes')
    .select('id, name, description, rarity, base_atk_bonus, base_def_bonus, base_hp_bonus, perks')
    .eq('id', classId)
    .eq('enabled', true)
    .maybeSingle()
  if (error) throw new Error(`职业查询失败: ${error.message}`)
  if (!cls) throw new Error('该职业不存在或已禁用')

  // 写入 player_class_runs（每 raid 仅 1 行）
  await client
    .from('player_class_runs')
    .upsert(
      {
        user_id: userId,
        room_id: roomId,
        class_id: classId,
        used_class_pt: usedHighPt ? 1 : 0,
        acquired_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,room_id' },
    )

  return cls
}

/**
 * 把职业属性加成应用到 player 对象（纯函数，不写库）。
 * — base_atk_bonus / base_def_bonus / base_hp_bonus 加到对应属性
 * — perks 整体挂到 player.classPerks（只过滤白名单 key）
 * — classId / className 记录便于日志
 */
export function applyClassToPlayer(player, classObj) {
  if (!classObj) return player
  const perks = {}
  const raw = classObj.perks || {}
  for (const key of PERK_WHITELIST) {
    if (raw[key] !== undefined && raw[key] !== null) perks[key] = raw[key]
  }
  return {
    ...player,
    atk: (player.atk || 0) + (Number(classObj.base_atk_bonus) || 0),
    def: (player.def || 0) + (Number(classObj.base_def_bonus) || 0),
    maxHp: (player.maxHp || 100) + (Number(classObj.base_hp_bonus) || 0),
    hp: (player.hp || (player.maxHp || 100)) + (Number(classObj.base_hp_bonus) || 0),
    classId: classObj.id,
    className: classObj.name,
    classRarity: classObj.rarity,
    classPerks: perks,
  }
}

/**
 * 读取 player.classPerks[key]，返回数值（缺省 0）。
 * 给 search/combat/pollution/omega 系统在 runtime 查询。
 */
export function getClassPerk(player, key) {
  if (!player?.classPerks || !PERK_WHITELIST.includes(key)) return 0
  return Number(player.classPerks[key]) || 0
}

/**
 * 获取 player 的 catalog_unlock_tag（用于 shop 过滤）
 */
export function getCatalogUnlockTag(player) {
  return player?.classPerks?.catalog_unlock_tag || null
}
