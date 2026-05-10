/**
 * endings.js — 多结局系统
 *
 * 结局触发流程：
 *   1. 分支引擎设置 gamevars.endingTriggered = 'ending_key'
 *   2. applyEndingIfTriggered() 在持久化前调用
 *   3. 加载结局元数据
 *   4. 把对局状态标记为 gamestate=2 + 结局信息存到 gamevars.endingResult
 *   5. 给在 raid 中存活/撤离的玩家发放结局奖励到账户库
 */

import { addItemsToStash } from './stash'

let _endingsCache = null
let _cacheTs = 0
const CACHE_TTL = 5 * 60 * 1000

export async function loadActiveEndings(client, { force = false } = {}) {
  const now = Date.now()
  if (!force && _endingsCache && now - _cacheTs < CACHE_TTL) return _endingsCache
  const { data } = await client.from('endings').select('*').eq('active', true)
  _endingsCache = data || []
  _cacheTs = now
  return _endingsCache
}

export function invalidateEndingsCache() {
  _endingsCache = null
  _cacheTs = 0
}

/**
 * 检查 gamevars.endingTriggered，若有则应用结局到 resolution。
 * 应在 evaluateBranchNodes 之后、persistResolution 之前调用。
 *
 * 返回触发的结局对象 / null。
 */
export async function applyEndingIfTriggered(client, resolution) {
  const gv = resolution.gamevars
  const key = gv.endingTriggered
  if (!key) return null
  if (gv.endingResult) return null  // 已经处理过

  const endings = await loadActiveEndings(client)
  const ending = endings.find(e => e.key === key)
  if (!ending) {
    // 配置错误：未找到此 key 的结局，记录日志后清除标记
    resolution.gamevars = {
      ...gv,
      endingTriggered: null,
      log: [
        ...(gv.log || []),
        { text: `[警告] 触发了未知结局 key="${key}"`, type: 'system', time: new Date().toISOString() },
      ],
    }
    return null
  }

  // 收集要发奖励的玩家：仍存活的（含已撤离的）
  const players = Object.values(gv.players || {})
  const eligiblePlayerIds = players.filter(p => p?.alive).map(p => p.id || p.uid)

  // 异步发放奖励到账户库
  const rewards = Array.isArray(ending.rewards) ? ending.rewards : []
  const validRewards = rewards.filter(r => r?.name && Number(r.quantity) > 0)
                              .map(r => ({ name: r.name, quantity: Number(r.quantity) }))
  if (validRewards.length > 0 && eligiblePlayerIds.length > 0) {
    await Promise.all(eligiblePlayerIds.map(uid =>
      addItemsToStash(client, uid, validRewards, { allowOverflow: true })
        .catch(e => console.error(`[ending] 奖励发放给 ${uid} 失败:`, e?.message)),
    ))
  }

  // 标记 resolution
  resolution.gamevars = {
    ...gv,
    endingTriggered: null,  // 清除标记防止重复
    endingResult: {
      key: ending.key,
      name: ending.name,
      description: ending.description,
      bannerText: ending.banner_text,
      rewardedItems: validRewards,
      rewardedPlayerCount: eligiblePlayerIds.length,
      triggeredAt: new Date().toISOString(),
    },
    log: [
      ...(gv.log || []),
      { text: `🎬 结局触发：${ending.name}`, type: 'system', time: new Date().toISOString() },
      ...(ending.banner_text ? [{ text: ending.banner_text, type: 'system', time: new Date().toISOString() }] : []),
    ],
  }

  return ending
}
