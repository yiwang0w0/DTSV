/**
 * events.js — 事件系统服务端模块
 *
 * 事件触发流程（在游戏行为发生时）：
 *   1. 调用 processEventTrigger(client, resolution, userId, triggerType, context)
 *   2. 加载所有 active 事件
 *   3. 过滤匹配 trigger 的事件
 *   4. 应用 once / cooldown 限制
 *   5. weighted 随机选一个
 *   6. 应用 effects 序列到 resolution
 *   7. 返回触发的事件（或 null）
 *
 * 事件状态持久化在 gamevars.eventHistory[userId][eventId]：
 *   { count, lastTurn }
 */

let _eventCache = null
let _cacheTs = 0
const CACHE_TTL = 5 * 60 * 1000  // 5 分钟

export async function loadActiveEvents(client, { force = false } = {}) {
  const now = Date.now()
  if (!force && _eventCache && now - _cacheTs < CACHE_TTL) return _eventCache
  const { data } = await client.from('event_pool').select('*').eq('active', true)
  _eventCache = data || []
  _cacheTs = now
  return _eventCache
}

// 显式失效（admin 改动后）
export function invalidateEventCache() {
  _eventCache = null
  _cacheTs = 0
}

export async function processEventTrigger(client, resolution, userId, triggerType, context = {}) {
  const events = await loadActiveEvents(client)
  if (events.length === 0) return null

  const gamevars = resolution.gamevars
  const history = gamevars.eventHistory?.[userId] || {}
  const currentTurn = gamevars.turn || 0

  // 过滤匹配 trigger 的事件
  const candidates = []
  for (const event of events) {
    if (!matchesTrigger(event, triggerType, context, gamevars, userId)) continue

    const h = history[event.id] || { count: 0, lastTurn: -Infinity }
    if (event.once && h.count > 0) continue
    if (event.cooldown && currentTurn - h.lastTurn < event.cooldown) continue

    candidates.push(event)
  }

  if (candidates.length === 0) return null

  const picked = weightedPick(candidates)
  if (!picked) return null

  // 记录历史
  recordEventInResolution(resolution, userId, picked.id, currentTurn)

  // 应用效果
  applyEventEffects(picked, resolution, userId, context)

  return picked
}

// ── 触发匹配 ──────────────────────────────
function matchesTrigger(event, triggerType, context, gamevars, userId) {
  const t = event.trigger || {}
  if (t.type !== triggerType) return false

  switch (triggerType) {
    case 'on_search':
      // 可指定 map（-1 表示任意地图）
      if (t.mapId !== undefined && t.mapId !== null && t.mapId !== -1 && t.mapId !== context.mapId) return false
      return true

    case 'on_enter_map':
      if (t.mapId !== undefined && t.mapId !== null && t.mapId !== context.mapId) return false
      return true

    case 'on_kill_npc':
      if (t.npcName && t.npcName !== context.npcName) return false
      return true

    case 'on_pickup':
      if (t.itemName && t.itemName !== context.itemName) return false
      return true

    default:
      return false
  }
}

// ── 权重抽取 ──────────────────────────────
function weightedPick(list) {
  if (!list.length) return null
  const totalWeight = list.reduce((s, e) => s + (Number(e.weight) || 1), 0)
  let r = Math.random() * totalWeight
  for (const e of list) {
    r -= (Number(e.weight) || 1)
    if (r <= 0) return e
  }
  return list[list.length - 1]
}

// ── 历史记录 ──────────────────────────────
function recordEventInResolution(resolution, userId, eventId, currentTurn) {
  const gv = resolution.gamevars
  const history = gv.eventHistory || {}
  const userHistory = history[userId] || {}
  const prev = userHistory[eventId] || { count: 0, lastTurn: -1 }
  resolution.gamevars = {
    ...gv,
    eventHistory: {
      ...history,
      [userId]: {
        ...userHistory,
        [eventId]: { count: prev.count + 1, lastTurn: currentTurn },
      },
    },
  }
}

// ── 效果应用（直接修改 resolution）──────────
function applyEventEffects(event, resolution, userId, context) {
  const gv = resolution.gamevars
  const player = gv.players?.[userId]
  if (!player) return

  let nextPlayer = player
  let nextGv = gv
  const logs = []

  // 先记录事件触发本身
  if (event.name) {
    logs.push({ text: `🎲 事件触发：${event.name}`, type: 'system' })
  }
  if (event.description) {
    logs.push({ text: event.description, type: 'system' })
  }

  for (const effect of (event.effects || [])) {
    const result = applyOneEffect(effect, nextPlayer, nextGv, context, userId)
    if (result.player) nextPlayer = result.player
    if (result.gamevars) nextGv = result.gamevars
    if (result.log) logs.push({ text: result.log, type: result.logType || 'system' })
  }

  // 写回
  if (nextPlayer !== player) {
    nextGv = {
      ...nextGv,
      players: { ...nextGv.players, [userId]: nextPlayer },
    }
  }
  resolution.gamevars = nextGv

  // 把日志合并到 resolution 的日志
  for (const entry of logs) {
    resolution.gamevars = {
      ...resolution.gamevars,
      log: [
        ...(resolution.gamevars.log || []),
        {
          text: entry.text,
          type: entry.type,
          time: new Date().toISOString(),
        },
      ],
    }
  }
}

function applyOneEffect(effect, player, gv, context, userId) {
  const type = effect?.type
  switch (type) {
    case 'log_only':
      return { log: effect.text || '一阵微风吹过…' }

    case 'give_item': {
      const name = effect.itemName
      const count = Number(effect.count) || 1
      if (!name) return {}
      const inv = [...(player.inventory || [])]
      for (let i = 0; i < count; i++) inv.push(name)
      return {
        player: { ...player, inventory: inv },
        log: `${player.name} 获得了 ${name}${count > 1 ? ` ×${count}` : ''}`,
        logType: 'heal',
      }
    }

    case 'take_item': {
      const name = effect.itemName
      const count = Number(effect.count) || 1
      if (!name) return {}
      const inv = [...(player.inventory || [])]
      let taken = 0
      for (let i = 0; i < count; i++) {
        const idx = inv.indexOf(name)
        if (idx === -1) break
        inv.splice(idx, 1); taken++
      }
      if (taken === 0) return { log: `${player.name} 想交出 ${name}，却发现自己没有`, logType: 'system' }
      return {
        player: { ...player, inventory: inv },
        log: `${player.name} 失去了 ${name}${taken > 1 ? ` ×${taken}` : ''}`,
        logType: 'damage',
      }
    }

    case 'damage': {
      const amount = Number(effect.amount) || 0
      if (amount <= 0) return {}
      const newHp = Math.max(0, (player.hp || 0) - amount)
      return {
        player: { ...player, hp: newHp, alive: newHp > 0 },
        log: `${player.name} 受到 ${amount} 点伤害`,
        logType: 'damage',
      }
    }

    case 'heal': {
      const amount = Number(effect.amount) || 0
      if (amount <= 0) return {}
      const newHp = Math.min(player.maxHp || 100, (player.hp || 0) + amount)
      return {
        player: { ...player, hp: newHp },
        log: `${player.name} 回复了 ${amount} HP`,
        logType: 'heal',
      }
    }

    case 'set_flag': {
      const key = effect.key
      if (!key) return {}
      const flags = { ...(gv.flags || {}) }
      flags[key] = effect.value
      return { gamevars: { ...gv, flags }, log: effect.silent ? null : `[Flag] ${key} = ${JSON.stringify(effect.value)}` }
    }

    case 'inc_flag': {
      const key = effect.key
      if (!key) return {}
      const flags = { ...(gv.flags || {}) }
      const cur = Number(flags[key] || 0)
      flags[key] = cur + (Number(effect.value) || 1)
      return { gamevars: { ...gv, flags }, log: effect.silent ? null : `[Flag] ${key} → ${flags[key]}` }
    }

    case 'spawn_npc':
    case 'trigger_battle': {
      // 简化：把 npc 数据写入 player.battle，强制进入战斗
      const npc = effect.npc || {}
      const battleNpc = {
        name: npc.name || '神秘敌人',
        hp:   npc.hp   || 30,
        atk:  npc.atk  || 10,
        def:  npc.def  || 5,
        level: npc.level || 'easy',
      }
      return {
        player: {
          ...player,
          battle: {
            npc: battleNpc,
            npcHp: battleNpc.hp,
            npcMaxHp: battleNpc.hp,
            turn: 1,
            log: [],
          },
        },
        log: `${player.name} 遭遇了 ${battleNpc.name}！`,
        logType: 'damage',
      }
    }

    default:
      return {}
  }
}
