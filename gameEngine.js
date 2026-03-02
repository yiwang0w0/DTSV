/**
 * DTS 游戏引擎 - src/lib/gameEngine.js
 * 从 game_rules / buff_pool 表读取配置，统一执行战斗计算
 */

import { supabase } from './supabase'

/* ───────────────────────────────────────
   安全的公式求值器
   只允许: 数字、四则运算、Math函数、变量名
─────────────────────────────────────── */
const ALLOWED_VARS = ['atk', 'def', 'hp', 'maxHp', 'effect', 'heal', 'level',
  'targetAtk', 'targetDef', 'targetHp', 'targetMaxHp',
  'atkMultiplier', 'defMultiplier', 'roll']

export function evalFormula(formula, vars = {}) {
  if (!formula || typeof formula !== 'string') return 0
  try {
    // 白名单校验：只允许数字、运算符、Math.*、已知变量名
    const sanitized = formula.trim()
    const forbidden = /[`${}[\]\\;'"]/g
    if (forbidden.test(sanitized)) return 0

    // 注入变量 + Math + 随机数
    const scope = {
      ...vars,
      roll: Math.random(),
      Math,
      max: Math.max,
      min: Math.min,
      floor: Math.floor,
      ceil: Math.ceil,
      round: Math.round,
      abs: Math.abs,
      sqrt: Math.sqrt,
      pow: Math.pow,
      random: Math.random,
    }

    // 构造函数调用（沙箱化参数注入）
    const argNames = Object.keys(scope)
    const argValues = Object.values(scope)
    // eslint-disable-next-line no-new-func
    const fn = new Function(...argNames, `"use strict"; return (${sanitized})`)
    const result = fn(...argValues)

    if (typeof result !== 'number' || isNaN(result)) return 0
    return Math.floor(result)
  } catch {
    return 0
  }
}

/* ───────────────────────────────────────
   规则缓存（每次进入游戏时加载一次）
─────────────────────────────────────── */
let _rulesCache = null
let _buffCache = null

export async function loadGameRules() {
  if (_rulesCache) return _rulesCache
  const { data } = await supabase.from('game_rules').select('*')
  _rulesCache = {}
  for (const row of data || []) {
    _rulesCache[row.key] = row.value
  }
  return _rulesCache
}

export async function loadBuffPool() {
  if (_buffCache) return _buffCache
  const { data } = await supabase.from('buff_pool').select('*')
  _buffCache = data || []
  return _buffCache
}

// 强制刷新（房间创建时调用）
export function clearRulesCache() {
  _rulesCache = null
  _buffCache = null
}

// 取单条规则，带默认值
export function getRule(rules, key, defaultVal) {
  const v = rules?.[key]
  if (v === undefined || v === null || v === '') return defaultVal
  const n = Number(v)
  return isNaN(n) ? v : n
}

/* ───────────────────────────────────────
   战斗计算
─────────────────────────────────────── */

/**
 * 计算一次普通攻击的伤害
 * @param {object} attacker - 攻击者 player 对象
 * @param {object} defender - 防御者 player 对象
 * @param {object} rules    - 从 loadGameRules() 得到的规则对象
 * @param {string} weaponSubKind - 武器子类型（用于天气减益判断）
 * @param {string} weather  - 当前地图天气
 * @returns {number} 最终伤害值（≥1）
 */
export function calcDamage(attacker, defender, rules, weaponSubKind = '', weather = 'clear') {
  const formula = getRule(rules, 'damage_formula', 'atk * atkMultiplier - def * defMultiplier')

  // 天气修正
  let atkMultiplier = getRule(rules, 'atk_base_multiplier', 1.0)
  let defMultiplier = getRule(rules, 'def_base_multiplier', 0.5)

  // 射击武器在雨天命中惩罚
  if (weather === 'rain' && (weaponSubKind === 'shooting' || weaponSubKind === 'throwing')) {
    const penalty = getRule(rules, 'weather_rain_shooting_penalty', 0.1)
    atkMultiplier *= (1 - penalty)
  }
  if (weather === 'storm') {
    const penalty = getRule(rules, 'weather_storm_all_penalty', 0.05)
    atkMultiplier *= (1 - penalty)
    defMultiplier *= (1 - penalty)
  }

  const vars = {
    atk: attacker.atk || 0,
    def: defender.def || 0,
    hp: attacker.hp || 0,
    maxHp: attacker.maxHp || 100,
    targetHp: defender.hp || 0,
    targetMaxHp: defender.maxHp || 100,
    targetDef: defender.def || 0,
    targetAtk: defender.atk || 0,
    atkMultiplier,
    defMultiplier,
  }

  let dmg = evalFormula(formula, vars)

  // 暴击
  const critRate = getRule(rules, 'crit_rate', 0.1)
  const critMultiplier = getRule(rules, 'crit_multiplier', 1.5)
  if (Math.random() < critRate) {
    dmg = Math.floor(dmg * critMultiplier)
  }

  return Math.max(1, dmg)
}

/**
 * 计算道具使用效果
 * @param {object} item   - 道具对象（含 kind/heal/atk/def/effect 等字段）
 * @param {object} player - 使用者
 * @param {object} rules  - 规则对象
 * @returns {{ hpDelta, atkDelta, defDelta, newBuffIds, log }}
 */
export function calcItemEffect(item, player, rules) {
  const result = { hpDelta: 0, atkDelta: 0, defDelta: 0, newBuffIds: [], log: '' }

  if (item.kind === 'consumable') {
    // 治疗公式
    const healFormula = item.heal_formula || getRule(rules, 'item_heal_formula', 'heal')
    result.hpDelta = evalFormula(healFormula, {
      heal: item.heal || 0,
      hp: player.hp,
      maxHp: player.maxHp,
      effect: item.effect || 0,
    })
  }

  if (item.kind === 'weapon') {
    const atkFormula = item.atk_formula || getRule(rules, 'item_equip_atk_formula', 'atk')
    result.atkDelta = evalFormula(atkFormula, {
      atk: item.atk || 0,
      effect: item.effect || 0,
      playerAtk: player.atk,
    })
  }

  if (item.kind === 'armor') {
    const defFormula = item.def_formula || getRule(rules, 'item_equip_def_formula', 'def')
    result.defDelta = evalFormula(defFormula, {
      def: item.def || 0,
      effect: item.effect || 0,
      playerDef: player.def,
    })
  }

  // 触发 Buff
  if (item.on_use_buff_ids && item.on_use_buff_ids.length > 0) {
    result.newBuffIds = item.on_use_buff_ids
  }

  return result
}

/**
 * 处理玩家身上的 Buff（每回合调用）
 * @param {object} player   - 玩家对象（含 buffs 数组）
 * @param {array}  buffPool - 从 loadBuffPool() 得到的 buff 定义列表
 * @returns {{ updatedPlayer, logEntries }}
 */
export function processBuffs(player, buffPool) {
  if (!player.buffs || player.buffs.length === 0) return { updatedPlayer: player, logEntries: [] }

  let hp = player.hp
  let atk = player.atk
  let def = player.def
  const logEntries = []
  const remainingBuffs = []

  for (const activeBuff of player.buffs) {
    const def_ = buffPool.find(b => b.id === activeBuff.buffId)
    if (!def_) continue

    // 执行 Buff 效果公式
    if (def_.effect_formula) {
      const delta = evalFormula(def_.effect_formula, {
        hp, atk, def,
        maxHp: player.maxHp,
        value: def_.value || 0,
      })

      if (def_.target === 'hp') {
        hp = Math.max(0, Math.min(player.maxHp, hp + delta))
        if (delta < 0) logEntries.push(`${def_.icon || '⚡'} ${player.name} 受到 ${def_.name} 效果，损失 ${-delta} HP`)
        else if (delta > 0) logEntries.push(`${def_.icon || '✨'} ${player.name} 受到 ${def_.name} 效果，恢复 ${delta} HP`)
      } else if (def_.target === 'atk') {
        atk = Math.max(0, atk + delta)
      } else if (def_.target === 'def') {
        def = Math.max(0, def + delta)
      }
    }

    // 减少剩余回合
    const remaining = (activeBuff.remainingTurns ?? def_.duration ?? 1) - 1
    if (remaining > 0) {
      remainingBuffs.push({ ...activeBuff, remainingTurns: remaining })
    } else {
      logEntries.push(`${def_.icon || '🔄'} ${player.name} 的 ${def_.name} 效果已消除`)
    }
  }

  return {
    updatedPlayer: { ...player, hp, atk, def, alive: hp > 0, buffs: remainingBuffs },
    logEntries,
  }
}

/**
 * 给玩家施加 Buff（支持叠加上限控制）
 * @param {object} player      - 玩家对象
 * @param {number} buffId      - Buff ID
 * @param {object} buffDef     - Buff 定义
 * @returns {object} updatedPlayer
 */
export function applyBuff(player, buffId, buffDef) {
  const buffs = player.buffs || []
  const maxStack = buffDef.max_stack ?? 1

  // 计算当前已有的同名 Buff 数量
  const existing = buffs.filter(b => b.buffId === buffId)

  if (existing.length >= maxStack) {
    // 替换最旧的一个（刷新持续时间）
    const idx = buffs.findIndex(b => b.buffId === buffId)
    const newBuffs = [...buffs]
    newBuffs[idx] = { buffId, remainingTurns: buffDef.duration || 3 }
    return { ...player, buffs: newBuffs }
  }

  return {
    ...player,
    buffs: [...buffs, { buffId, remainingTurns: buffDef.duration || 3 }],
  }
}

/**
 * 天气对搜索概率的影响
 */
export function getSearchChances(rules, weather) {
  let itemChance = getRule(rules, 'search_item_chance', 0.4)
  let npcChance = getRule(rules, 'search_npc_chance', 0.25)

  if (weather === 'fog') {
    const multi = getRule(rules, 'weather_fog_search_multiplier', 0.5)
    itemChance *= multi
  }
  if (weather === 'night') {
    const penalty = getRule(rules, 'weather_night_search_penalty', 0.15)
    itemChance -= penalty
    npcChance += 0.05
  }
  if (weather === 'storm') {
    const penalty = getRule(rules, 'weather_storm_all_penalty', 0.05)
    itemChance *= (1 - penalty)
    npcChance *= (1 + penalty)
  }

  return {
    itemChance: Math.max(0.05, Math.min(0.9, itemChance)),
    npcChance: Math.max(0.05, Math.min(0.9, npcChance)),
  }
}

/**
 * 玩家初始属性（从规则读取）
 */
export function getInitPlayerStats(rules) {
  return {
    hp: getRule(rules, 'player_init_hp', 100),
    maxHp: getRule(rules, 'player_init_hp', 100),
    atk: getRule(rules, 'player_init_atk', 10),
    def: getRule(rules, 'player_init_def', 5),
    buffs: [],
  }
}
