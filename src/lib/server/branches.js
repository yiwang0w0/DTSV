/**
 * branches.js — 分支节点条件引擎
 *
 * 在游戏行为后调用 evaluateBranchNodes(client, resolution)：
 *   1. 加载所有 active 的 branch_nodes
 *   2. 跳过已触发过的（once=true 时）— 通过 gamevars.branchHistory 追踪
 *   3. 对每个节点评估 conditions[]
 *   4. 选择第一个匹配的 branches[i] 应用
 *   5. 应用 branch.do（setFlags / triggerEventId / triggerEnding / log）
 *
 * 支持的条件类型见 migration-add-branch-nodes.sql。
 *
 * 条件评估器与聚合器都是纯函数，方便单独测试。
 */

import { invalidateEventCache } from './events'

let _branchCache = null
let _cacheTs = 0
const CACHE_TTL = 5 * 60 * 1000

export async function loadActiveBranches(client, { force = false } = {}) {
  const now = Date.now()
  if (!force && _branchCache && now - _cacheTs < CACHE_TTL) return _branchCache
  const { data } = await client.from('branch_nodes').select('*').eq('active', true)
  _branchCache = data || []
  _cacheTs = now
  return _branchCache
}

export function invalidateBranchCache() {
  _branchCache = null
  _cacheTs = 0
}

// ── 主入口 ───────────────────────────────────
export async function evaluateBranchNodes(client, resolution, userId) {
  const nodes = await loadActiveBranches(client)
  if (nodes.length === 0) return []

  const fired = []
  for (const node of nodes) {
    const matched = evaluateOneNode(node, resolution, userId)
    if (matched) {
      applyBranchAction(matched.branch, node, resolution, userId)
      markNodeFired(resolution, node, userId)
      fired.push({ node, branch: matched.branch, matched: matched.matched })
    }
  }
  return fired
}

// ── 单个节点评估 ─────────────────────────────
function evaluateOneNode(node, resolution, userId) {
  // 跳过已触发的（once）
  if (node.once && hasFired(resolution, node, userId)) return null

  const gv = resolution.gamevars
  const conditions = Array.isArray(node.conditions) ? node.conditions : []
  const matchedFlags = conditions.map(c => evaluateCondition(c, gv))
  const matchedCount = matchedFlags.filter(Boolean).length

  const branches = Array.isArray(node.branches) ? node.branches : []
  for (const br of branches) {
    if (matchesAggregator(br.when, matchedFlags, matchedCount)) {
      return { branch: br, matched: matchedCount }
    }
  }
  return null
}

// ── 条件评估器 ───────────────────────────────
export function evaluateCondition(condition, gamevars) {
  if (!condition?.type) return false
  const flags = gamevars.flags || {}
  const players = Object.values(gamevars.players || {})

  switch (condition.type) {
    case 'flagEquals':
      return flags[condition.key] === condition.value

    case 'flagAtLeast':
      return Number(flags[condition.key] || 0) >= Number(condition.value || 0)

    case 'anyPlayerHas':
      // 远星函馆扩展：支持 { key, minValue } 检查玩家数值字段
      if (condition.minValue !== undefined) {
        const minV = Number(condition.minValue)
        return players.some(p => Number(p?.[condition.key] || 0) >= minV)
      }
      // 原语义：检查任一玩家 inventory 含 itemName
      return players.some(p => Array.isArray(p?.inventory) && p.inventory.includes(condition.itemName))

    case 'allPlayersHave':
      if (players.length === 0) return false
      return players.every(p => Array.isArray(p?.inventory) && p.inventory.includes(condition.itemName))

    case 'anyPlayerKilled':
      // 简化实现：检查 flags['killed_<npcName>'] 是否为 true
      // 可由事件系统在 NPC 死亡时调用 set_flag 来设置
      return !!flags[`killed_${condition.npcName}`]

    case 'mapVisited':
      return !!flags[`visited_map_${condition.mapId}`]

    case 'extractedCount': {
      const extracted = players.filter(p => p?.extracted).length
      return extracted >= Number(condition.count || 1)
    }

    case 'aliveCount':
      return numberCompare(players.filter(p => p?.alive && !p?.extracted).length, condition.op, condition.value)

    case 'playerCount':
      return numberCompare(players.length, condition.op, condition.value)

    default:
      return false
  }
}

function numberCompare(actual, op, value) {
  const v = Number(value)
  switch (op) {
    case '<':  return actual < v
    case '<=': return actual <= v
    case '>':  return actual > v
    case '>=': return actual >= v
    case '==': case '=': return actual === v
    case '!=': return actual !== v
    default: return false
  }
}

// ── 聚合器：判断哪一个 branch.when 匹配 ───────
export function matchesAggregator(when, matchedFlags, matchedCount) {
  if (when === undefined || when === 'default') return when === 'default' ? true : false
  if (when === 'all') return matchedFlags.length > 0 && matchedFlags.every(Boolean)
  if (when === 'any') return matchedFlags.some(Boolean)
  if (typeof when === 'object' && when !== null) {
    if (typeof when.atLeast === 'number') return matchedCount >= when.atLeast
    if (typeof when.atMost === 'number')  return matchedCount <= when.atMost
    if (typeof when.exactly === 'number') return matchedCount === when.exactly
  }
  return false
}

// 注：'default' 的语义是"必须放在最后" — 上面 evaluateOneNode 按顺序检测，
// 第一个匹配即返回；'default' 永远 true，所以会兜底任何未匹配项。
// 但 'all' 与 'any' 需要严格判定，所以单独处理。

// ── 触发记录 ──────────────────────────────────
function hasFired(resolution, node, userId) {
  const gv = resolution.gamevars
  const history = gv.branchHistory || {}
  if (node.scope === 'player') {
    return !!(history.players?.[userId]?.[node.id])
  }
  return !!(history.room?.[node.id])
}

function markNodeFired(resolution, node, userId) {
  const gv = resolution.gamevars
  const history = gv.branchHistory || { room: {}, players: {} }
  const nextHistory = {
    room: { ...(history.room || {}) },
    players: { ...(history.players || {}) },
  }
  if (node.scope === 'player') {
    nextHistory.players[userId] = { ...(nextHistory.players[userId] || {}), [node.id]: Date.now() }
  } else {
    nextHistory.room[node.id] = Date.now()
  }
  resolution.gamevars = { ...gv, branchHistory: nextHistory }
}

// ── 应用 branch.do 动作 ──────────────────────
function applyBranchAction(branch, node, resolution, userId) {
  const action = branch.do || {}
  const gv = resolution.gamevars

  // 设置 flags
  if (action.setFlags && typeof action.setFlags === 'object') {
    const flags = { ...(gv.flags || {}) }
    for (const [k, v] of Object.entries(action.setFlags)) {
      flags[k] = v
    }
    resolution.gamevars = { ...resolution.gamevars, flags }
  }

  // 触发结局（gamevars.endingTriggered 标记，由结算逻辑读取）
  if (action.triggerEnding) {
    resolution.gamevars = { ...resolution.gamevars, endingTriggered: action.triggerEnding }
  }

  // 日志
  const summary = action.log || `分支节点【${node.name}】触发`
  resolution.gamevars = {
    ...resolution.gamevars,
    log: [
      ...(resolution.gamevars.log || []),
      { text: `🌿 ${summary}`, type: 'system', time: new Date().toISOString() },
    ],
  }

  // triggerEventId 会在外层处理（需要异步调用 events 模块）
  // 这里先把它存到 resolution.pendingEventTriggers 供外层处理
  if (action.triggerEventId) {
    const list = resolution.pendingEventTriggers || []
    list.push({ eventId: Number(action.triggerEventId), userId })
    resolution.pendingEventTriggers = list
  }
}

// ── 一些便利钩子（供 gameActions 调用）────────
// 当事件 / 战斗 / 撤离等会改变 flags 的关键行为发生时，
// 调用 setVisitedMapFlag / setKilledNpcFlag 自动为分支引擎打 flag。
export function setVisitedMapFlag(resolution, mapId) {
  const flags = { ...(resolution.gamevars.flags || {}) }
  flags[`visited_map_${mapId}`] = true
  resolution.gamevars = { ...resolution.gamevars, flags }
}

export function setKilledNpcFlag(resolution, npcName) {
  const flags = { ...(resolution.gamevars.flags || {}) }
  flags[`killed_${npcName}`] = true
  resolution.gamevars = { ...resolution.gamevars, flags }
}
