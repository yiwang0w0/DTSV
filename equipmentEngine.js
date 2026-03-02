/**
 * DTS 装备引擎 — src/lib/equipmentEngine.js
 *
 * 职责：
 *  - 合成树查询与渲染数据构建
 *  - 合成条件验证
 *  - 合成执行（升阶/分支）
 *  - 装备属性计算（含被动）
 *  - 被动技能触发（接入 gameEngine）
 */

import { supabase } from './supabase'
import { evalFormula, applyBuff } from './gameEngine'

/* ══════════════════════════════════════════════════════
   稀有度元数据
══════════════════════════════════════════════════════ */
export const RARITY_META = {
  common:    { label: '普通',   color: '#8b949e', glow: 'rgba(139,148,158,0.2)' },
  uncommon:  { label: '优秀',   color: '#3fb950', glow: 'rgba(63,185,80,0.2)'  },
  rare:      { label: '稀有',   color: '#58a6ff', glow: 'rgba(88,166,255,0.2)' },
  epic:      { label: '史诗',   color: '#bc8cff', glow: 'rgba(188,140,255,0.3)'},
  legendary: { label: '传说',   color: '#d29922', glow: 'rgba(210,153,34,0.3)' },
  mythic:    { label: '神话',   color: '#f85149', glow: 'rgba(248,81,73,0.35)' },
}

export const ELEMENT_META = {
  none:    { label: '无', icon: '—',  color: '#484f58' },
  fire:    { label: '火', icon: '🔥', color: '#f85149' },
  ice:     { label: '冰', icon: '❄️', color: '#79c0ff' },
  thunder: { label: '雷', icon: '⚡', color: '#d29922' },
  wind:    { label: '风', icon: '🌀', color: '#3fb950' },
  light:   { label: '光', icon: '✨', color: '#fff'    },
  dark:    { label: '暗', icon: '🌑', color: '#bc8cff' },
  water:   { label: '水', icon: '💧', color: '#58a6ff' },
}

export const SLOT_META = {
  weapon:    { label: '武器',   icon: '⚔️'  },
  armor:     { label: '护甲',   icon: '🛡️'  },
  helmet:    { label: '头盔',   icon: '⛑️'  },
  boots:     { label: '靴子',   icon: '👢'  },
  accessory: { label: '饰品',   icon: '💍'  },
}

/* ══════════════════════════════════════════════════════
   一、合成树查询
══════════════════════════════════════════════════════ */

/**
 * 查询某装备的完整合成树（向上追溯到 T1）
 * 返回嵌套结构，供前端递归渲染
 *
 * @param {number} tierId
 * @param {number} depth - 内部递归深度控制
 * @returns {object} 树节点
 */
export async function getCraftingTree(tierId, depth = 0) {
  if (depth > 10) return null  // 防止循环依赖

  // 查询装备定义
  const { data: tier } = await supabase
    .from('equipment_tiers')
    .select(`
      *,
      series:equipment_series(id, name, slot, icon),
      passive:passive_skills(*)
    `)
    .eq('id', tierId)
    .single()

  if (!tier) return null

  // 查询配方
  const { data: recipe } = await supabase
    .from('tier_recipes')
    .select(`
      *,
      ingredients:recipe_ingredients(
        *,
        item:item_pool(id, name, kind, description),
        equipment:equipment_tiers(id, name, rarity)
      )
    `)
    .eq('result_tier_id', tierId)
    .single()

  // 查询同阶兄弟变体（分支展示用）
  const { data: siblings } = await supabase
    .from('equipment_tiers')
    .select('id, name, variant, rarity, element, base_atk, base_def')
    .eq('series_id', tier.series_id)
    .eq('tier', tier.tier)
    .neq('id', tierId)

  // 递归查询前置装备
  let prevTierTree = null
  if (recipe?.requires_prev_tier_id) {
    prevTierTree = await getCraftingTree(recipe.requires_prev_tier_id, depth + 1)
  } else if (recipe?.requires_prev_series_id && recipe?.requires_prev_tier_num) {
    // 宽松匹配：接受任意变体，取主线（variant=null）作代表展示
    const { data: anyPrev } = await supabase
      .from('equipment_tiers')
      .select('id')
      .eq('series_id', recipe.requires_prev_series_id)
      .eq('tier', recipe.requires_prev_tier_num)
      .is('variant', null)
      .single()
    if (anyPrev) {
      prevTierTree = await getCraftingTree(anyPrev.id, depth + 1)
      prevTierTree._isFlexMatch = true  // 标记为宽松匹配（接受任意变体）
    }
  }

  return {
    ...tier,
    _depth: depth,
    recipe: recipe ? {
      ...recipe,
      prevTierTree,
      ingredients: recipe.ingredients || [],
    } : null,
    siblings: siblings || [],
  }
}

/**
 * 获取某系列的完整升阶树（从 T1 开始向下展开）
 * 用于后台「金字塔预览」
 */
export async function getSeriesTree(seriesId) {
  const { data: allTiers } = await supabase
    .from('equipment_tiers')
    .select(`
      *,
      passive:passive_skills(name, icon, trigger_chance),
      recipe:tier_recipes(
        id, success_rate, gold_cost, fail_behavior,
        requires_prev_tier_id, requires_prev_series_id, requires_prev_tier_num,
        ingredients:recipe_ingredients(
          quantity, is_consumed, is_catalyst,
          item:item_pool(id, name),
          equipment:equipment_tiers(id, name)
        )
      )
    `)
    .eq('series_id', seriesId)
    .order('tier')
    .order('variant')

  if (!allTiers) return null

  // 按阶级分组
  const byTier = {}
  for (const t of allTiers) {
    if (!byTier[t.tier]) byTier[t.tier] = []
    byTier[t.tier].push(t)
  }

  return { seriesId, byTier, maxTier: Math.max(...Object.keys(byTier).map(Number)) }
}

/* ══════════════════════════════════════════════════════
   二、合成条件验证
══════════════════════════════════════════════════════ */

/**
 * 检查玩家是否满足合成某装备的全部条件
 *
 * @param {number} resultTierId - 想要合成的装备ID
 * @param {object[]} playerInventory - 玩家背包 [{ item_id, count }]
 * @param {object[]} playerEquipments - 玩家装备实例列表
 * @param {number} playerLevel
 * @param {string} playerClass
 * @returns {{ canCraft: boolean, missing: string[], recipe: object }}
 */
export async function checkCanCraft(
  resultTierId,
  playerInventory,
  playerEquipments,
  playerLevel = 1,
  playerClass = ''
) {
  // 加载配方
  const { data: recipe } = await supabase
    .from('tier_recipes')
    .select(`
      *,
      result:equipment_tiers(req_level, req_class, name),
      ingredients:recipe_ingredients(
        *, item:item_pool(id, name), equipment:equipment_tiers(id, name)
      )
    `)
    .eq('result_tier_id', resultTierId)
    .single()

  if (!recipe) return { canCraft: false, missing: ['配方不存在'], recipe: null }

  const missing = []

  // ① 等级要求
  if (recipe.result?.req_level > playerLevel) {
    missing.push(`等级不足（需要 Lv.${recipe.result.req_level}，当前 Lv.${playerLevel}）`)
  }

  // ② 职业要求
  const reqClass = recipe.result?.req_class || []
  if (reqClass.length > 0 && !reqClass.includes(playerClass)) {
    missing.push(`职业不符（需要: ${reqClass.join('/')}）`)
  }

  // ③ 前置装备（精确匹配）
  if (recipe.requires_prev_tier_id) {
    const has = playerEquipments.some(
      e => e.tier_id === recipe.requires_prev_tier_id && !e.is_equipped
    )
    if (!has) {
      const prevName = recipe.ingredients?.find(
        i => i.equipment_tier_id === recipe.requires_prev_tier_id
      )?.equipment?.name || `装备#${recipe.requires_prev_tier_id}`
      missing.push(`缺少前置装备「${prevName}」（未装备状态）`)
    }
  }

  // ③' 前置装备（宽松匹配：接受任意变体）
  if (!recipe.requires_prev_tier_id && recipe.requires_prev_series_id && recipe.requires_prev_tier_num) {
    const { data: validPrevIds } = await supabase
      .from('equipment_tiers')
      .select('id')
      .eq('series_id', recipe.requires_prev_series_id)
      .eq('tier', recipe.requires_prev_tier_num)

    const validIds = (validPrevIds || []).map(t => t.id)
    const has = playerEquipments.some(e => validIds.includes(e.tier_id) && !e.is_equipped)
    if (!has) {
      missing.push(`缺少前置装备（T${recipe.requires_prev_tier_num} 任意变体，未装备状态）`)
    }
  }

  // ④ 材料检查
  for (const ing of recipe.ingredients || []) {
    if (ing.ingredient_type === 'item') {
      const have = playerInventory
        .filter(i => i.item_id === ing.item_id)
        .reduce((s, i) => s + i.count, 0)
      if (have < ing.quantity) {
        missing.push(`${ing.item?.name || '材料'} 不足（${have}/${ing.quantity}）`)
      }
    }
  }

  // ⑤ 金币（如有）
  // missing.push(...) — 待接入金币系统

  return {
    canCraft: missing.length === 0,
    missing,
    recipe,
  }
}

/* ══════════════════════════════════════════════════════
   三、执行合成
══════════════════════════════════════════════════════ */

/**
 * 执行合成操作
 * 由 game/[id]/page.js 或 API 层调用
 *
 * @param {number} resultTierId
 * @param {string} ownerId - 玩家UUID
 * @param {number} roomId
 * @param {object} gamevars - 当前 gamevars（用于从 inventory 扣材料）
 * @returns {{ success: boolean, instance: object|null, gamevars: object, log: string }}
 */
export async function executeCraft(resultTierId, ownerId, roomId, gamevars) {
  const { canCraft, missing, recipe } = await checkCanCraft(
    resultTierId,
    buildInventoryMap(gamevars.players?.[ownerId]?.inventory || []),
    await getPlayerEquipments(ownerId, roomId),
    gamevars.players?.[ownerId]?.level || 1
  )

  if (!canCraft) {
    return { success: false, instance: null, gamevars, log: `合成失败: ${missing[0]}` }
  }

  // 掷骰判断成功/失败
  const roll = Math.random()
  const succeeded = roll <= recipe.success_rate
  const playerName = gamevars.players?.[ownerId]?.name || '玩家'

  if (!succeeded) {
    // 失败处理
    let newGv = { ...gamevars }
    let failLog = `🔨 ${playerName} 尝试合成失败！`

    if (recipe.fail_behavior === 'lose_materials') {
      newGv = consumeIngredients(gamevars, ownerId, recipe)
      failLog += '（材料已损失）'
    } else if (recipe.fail_behavior === 'downgrade') {
      // 降阶处理（前置装备耐久度-50%或降为上一阶）
      await degradePrevTier(ownerId, roomId, recipe.requires_prev_tier_id)
      failLog += '（前置装备受损）'
    } else {
      failLog += '（材料保留，可重试）'
    }

    return { success: false, instance: null, gamevars: newGv, log: failLog }
  }

  // ✅ 合成成功
  // 1. 消耗材料
  const newGv = consumeIngredients(gamevars, ownerId, recipe)

  // 2. 消耗前置装备（升阶：从实例表删除）
  if (recipe.requires_prev_tier_id) {
    await supabase
      .from('equipment_instances')
      .delete()
      .eq('owner_id', ownerId)
      .eq('tier_id', recipe.requires_prev_tier_id)
      .eq('room_id', roomId)
      .eq('is_equipped', false)
      .limit(1)
  } else if (recipe.requires_prev_series_id && recipe.requires_prev_tier_num) {
    // 宽松匹配：删除任意满足条件的前置装备
    const { data: prevInstances } = await supabase
      .from('equipment_instances')
      .select('id, tier_id')
      .eq('owner_id', ownerId)
      .eq('room_id', roomId)
      .eq('is_equipped', false)

    const { data: validPrevIds } = await supabase
      .from('equipment_tiers')
      .select('id')
      .eq('series_id', recipe.requires_prev_series_id)
      .eq('tier', recipe.requires_prev_tier_num)

    const validIds = new Set((validPrevIds || []).map(t => t.id))
    const toDelete = (prevInstances || []).find(e => validIds.has(e.tier_id))
    if (toDelete) {
      await supabase.from('equipment_instances').delete().eq('id', toDelete.id)
    }
  }

  // 3. 获取新装备的耐久度默认值
  const { data: resultTier } = await supabase
    .from('equipment_tiers')
    .select('durability_max, name')
    .eq('id', resultTierId)
    .single()

  // 4. 创建新装备实例
  const { data: newInstance } = await supabase
    .from('equipment_instances')
    .insert({
      tier_id: resultTierId,
      owner_id: ownerId,
      room_id: roomId,
      durability_current: resultTier?.durability_max || 0,
    })
    .select()
    .single()

  const log = `🔨 ${playerName} 合成了【${resultTier?.name}】！`

  return { success: true, instance: newInstance, gamevars: newGv, log }
}

/* ── 合成辅助函数 ── */

function buildInventoryMap(inventory) {
  // inventory 是 string[] 格式（现有系统），转换为 [{item_id, count}]
  const map = {}
  for (const name of inventory) {
    map[name] = (map[name] || 0) + 1
  }
  return Object.entries(map).map(([name, count]) => ({ name, count }))
}

function consumeIngredients(gamevars, ownerId, recipe) {
  const player = gamevars.players?.[ownerId]
  if (!player) return gamevars

  let inv = [...(player.inventory || [])]

  for (const ing of recipe.ingredients || []) {
    if (ing.ingredient_type === 'item' && ing.is_consumed && ing.item?.name) {
      let removed = 0
      inv = inv.filter(item => {
        if (item === ing.item.name && removed < ing.quantity) {
          removed++
          return false
        }
        return true
      })
    }
  }

  return {
    ...gamevars,
    players: {
      ...gamevars.players,
      [ownerId]: { ...player, inventory: inv },
    },
  }
}

async function getPlayerEquipments(ownerId, roomId) {
  const { data } = await supabase
    .from('equipment_instances')
    .select('id, tier_id, is_equipped, durability_current')
    .eq('owner_id', ownerId)
    .eq('room_id', roomId)
  return data || []
}

async function degradePrevTier(ownerId, roomId, prevTierId) {
  if (!prevTierId) return
  const { data: inst } = await supabase
    .from('equipment_instances')
    .select('id, durability_current')
    .eq('owner_id', ownerId)
    .eq('room_id', roomId)
    .eq('tier_id', prevTierId)
    .eq('is_equipped', false)
    .single()
  if (!inst) return
  // 耐久减半（最低1）
  const newDur = Math.max(1, Math.floor((inst.durability_current || 50) * 0.5))
  await supabase.from('equipment_instances').update({ durability_current: newDur }).eq('id', inst.id)
}

/* ══════════════════════════════════════════════════════
   四、装备属性计算
══════════════════════════════════════════════════════ */

/**
 * 计算装备实例的总属性（模板属性 + 强化加成）
 */
export function getEquipStats(tierDef, instance) {
  return {
    atk: (tierDef.base_atk || 0) + (instance?.bonus_atk || 0),
    def: (tierDef.base_def || 0) + (instance?.bonus_def || 0),
    hp:   tierDef.base_hp  || 0,
    element: tierDef.element || 'none',
    element_power: tierDef.element_power || 0,
    durability: instance?.durability_current ?? tierDef.durability_max,
    durability_max: tierDef.durability_max,
    passive: tierDef.passive_skill_id,
  }
}

/**
 * 计算玩家所有已装备装备的属性总和
 *
 * @param {object[]} equippedInstances - 已装备实例列表（含 tier 数据）
 * @returns {{ totalAtk, totalDef, totalHp, elements, passives }}
 */
export function calcEquippedStats(equippedInstances) {
  let totalAtk = 0, totalDef = 0, totalHp = 0
  const elements = []
  const passives = []

  for (const inst of equippedInstances) {
    const tier = inst.tier  // 需要 join 查询时带上
    if (!tier) continue
    const stats = getEquipStats(tier, inst)
    totalAtk += stats.atk
    totalDef += stats.def
    totalHp  += stats.hp
    if (stats.element !== 'none') elements.push(stats.element)
    if (tier.passive_skill_id) passives.push(tier.passive)
  }

  return { totalAtk, totalDef, totalHp, elements, passives }
}

/* ══════════════════════════════════════════════════════
   五、被动技能触发
══════════════════════════════════════════════════════ */

/**
 * 在战斗事件时触发被动技能
 * 供 gameEngine.js 的战斗流程调用
 *
 * @param {string} event - 触发事件名
 * @param {object} attacker - 攻击者 player 对象
 * @param {object} defender - 防御者 player 对象（可选）
 * @param {object[]} passiveSkills - 当前玩家携带的被动技能列表
 * @param {object[]} buffPool - 全量 buff 定义（用于施加 buff）
 * @returns {{ attackerUpdated, defenderUpdated, logs: string[] }}
 */
export function triggerPassives(event, attacker, defender, passiveSkills, buffPool) {
  let atkPlayer = { ...attacker }
  let defPlayer = defender ? { ...defender } : null
  const logs = []

  for (const skill of passiveSkills) {
    if (skill.trigger_event !== event) continue

    // 概率判断
    if (Math.random() > skill.trigger_chance) continue

    // 冷却检查（冷却信息存在 player.passiveCooldowns[skillId]）
    const cooldowns = atkPlayer.passiveCooldowns || {}
    if (cooldowns[skill.id] > 0) continue

    // 计算效果值
    const effectValue = evalFormula(skill.effect_formula, {
      atk: atkPlayer.atk,
      def: atkPlayer.def,
      hp: atkPlayer.hp,
      maxHp: atkPlayer.maxHp,
      value: skill.value,
      enemyHp: defPlayer?.hp || 0,
    })

    let logMsg = `${skill.icon} 【${skill.name}】触发！`

    // 应用效果
    if (skill.effect_type === 'damage' && defPlayer) {
      defPlayer = { ...defPlayer, hp: Math.max(0, defPlayer.hp - effectValue), alive: defPlayer.hp - effectValue > 0 }
      logMsg += ` 对 ${defPlayer.name} 造成 ${effectValue} 额外伤害`

    } else if (skill.effect_type === 'heal') {
      const healed = Math.min(atkPlayer.maxHp - atkPlayer.hp, effectValue)
      atkPlayer = { ...atkPlayer, hp: atkPlayer.hp + healed }
      logMsg += ` 恢复 ${healed} HP`

    } else if (skill.effect_type === 'stat_boost') {
      if (skill.effect_target === 'self') {
        atkPlayer = { ...atkPlayer, atk: atkPlayer.atk + effectValue }
        logMsg += ` ATK +${effectValue}`
      }

    } else if ((skill.effect_type === 'buff' || skill.effect_type === 'debuff') && skill.buff_id) {
      const buffDef = buffPool.find(b => b.id === skill.buff_id)
      if (buffDef) {
        const target = skill.effect_target === 'self' ? atkPlayer : defPlayer
        if (target) {
          const updated = applyBuff(target, skill.buff_id, buffDef)
          if (skill.effect_target === 'self') atkPlayer = updated
          else defPlayer = updated
          logMsg += ` 施加【${buffDef.name}】`
        }
      }

    } else if (skill.effect_type === 'elemental' && defPlayer) {
      // 元素反应：基础实现（后续可扩展元素克制表）
      defPlayer = { ...defPlayer, hp: Math.max(0, defPlayer.hp - effectValue) }
      logMsg += ` 元素伤害 ${effectValue}`
    }

    logs.push(logMsg)

    // 设置冷却
    if (skill.cooldown_turns > 0) {
      atkPlayer = {
        ...atkPlayer,
        passiveCooldowns: { ...(atkPlayer.passiveCooldowns || {}), [skill.id]: skill.cooldown_turns },
      }
    }
  }

  return { attackerUpdated: atkPlayer, defenderUpdated: defPlayer, logs }
}

/**
 * 每回合开始时，减少所有被动冷却计数
 */
export function tickPassiveCooldowns(player) {
  if (!player.passiveCooldowns) return player
  const updated = { ...player.passiveCooldowns }
  for (const id of Object.keys(updated)) {
    updated[id] = Math.max(0, updated[id] - 1)
  }
  return { ...player, passiveCooldowns: updated }
}

/**
 * 耐久度扣减（每次战斗/搜索后调用）
 */
export async function consumeDurability(ownerId, roomId, amount = 1) {
  const { data: instances } = await supabase
    .from('equipment_instances')
    .select('id, durability_current')
    .eq('owner_id', ownerId)
    .eq('room_id', roomId)
    .eq('is_equipped', true)
    .gt('durability_current', 0)  // 只扣有限耐久装备

  for (const inst of instances || []) {
    const newDur = Math.max(0, inst.durability_current - amount)
    await supabase.from('equipment_instances')
      .update({ durability_current: newDur, is_equipped: newDur > 0 })
      .eq('id', inst.id)
    // 耐久归零时自动卸下
  }
}
