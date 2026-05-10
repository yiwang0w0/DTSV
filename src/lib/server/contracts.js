/**
 * contracts.js — 合同（任务）服务端模块
 *
 * 三大入口：
 *
 *   loadActiveContractsForUser(client, userId)
 *     → 返回 [{ contract, progress, status }]
 *        合并 contracts 表和 player_contracts，
 *        缺失的 player_contracts 视为"未接受"，不返回
 *
 *   acceptContract(client, userId, contractId)
 *     → 创建 player_contracts 行（status='active'）
 *
 *   updateContractProgress(client, userId, eventType, eventPayload)
 *     → 在游戏行为发生时调用，自动推进所有相关合同进度
 *     → 完成时 status='completed' 并发放奖励到账户库
 *     → 返回 { completed: [{contract, rewards}] }
 *
 * 支持的事件：
 *   { type: 'item_acquired', itemName }  — 玩家获得道具（搜索/拾取/合成等）
 *   { type: 'npc_killed',    npcName }   — 玩家击杀实体
 *   { type: 'extracted',     extractionPointId }
 */

import { addItemsToStash } from './stash'

// ── 加载玩家所有 active/completed 合同 ──
export async function loadPlayerContracts(client, userId, { includeAvailable = false } = {}) {
  const [{ data: allContracts }, { data: playerRows }] = await Promise.all([
    client.from('contracts').select('*').eq('active', true).order('id'),
    client.from('player_contracts').select('*').eq('user_id', userId),
  ])

  const playerByContractId = new Map((playerRows || []).map(r => [r.contract_id, r]))

  const result = []
  for (const c of (allContracts || [])) {
    const pc = playerByContractId.get(c.id)
    if (pc) {
      result.push({
        contract: c,
        playerContract: pc,
        status: pc.status,
        progress: pc.progress || {},
        accepted: true,
      })
    } else if (includeAvailable) {
      result.push({
        contract: c,
        playerContract: null,
        status: 'available',
        progress: {},
        accepted: false,
      })
    }
  }
  return result
}

// ── 玩家接受合同 ──
export async function acceptContract(client, userId, contractId) {
  const { data: contract } = await client
    .from('contracts')
    .select('id, active')
    .eq('id', contractId)
    .maybeSingle()
  if (!contract) throw new Error('合同不存在')
  if (!contract.active) throw new Error('合同已停用')

  const { error } = await client
    .from('player_contracts')
    .insert({ user_id: userId, contract_id: contractId, status: 'active', progress: {} })
  if (error?.code === '23505') {
    // 唯一约束：已接受
    return { ok: true, already: true }
  }
  if (error) throw new Error(error.message || '接受合同失败')
  return { ok: true }
}

// ── 推进进度并发放奖励 ──
export async function updateContractProgress(client, userId, event) {
  // 1) 加载玩家所有活跃合同
  const { data: activeRows } = await client
    .from('player_contracts')
    .select('*, contract:contracts(*)')
    .eq('user_id', userId)
    .eq('status', 'active')
  if (!activeRows || activeRows.length === 0) return { completed: [] }

  const completed = []

  for (const row of activeRows) {
    const contract = row.contract
    if (!contract || contract.active === false) continue
    const objectives = Array.isArray(contract.objectives) ? contract.objectives : []
    if (objectives.length === 0) continue

    const progress = { ...(row.progress || {}) }
    let updated = false

    for (let i = 0; i < objectives.length; i++) {
      const obj = objectives[i]
      const before = Number(progress[i] || 0)
      const required = Number(obj.count || 1)
      if (before >= required) continue  // 已完成

      const matched = matchObjective(obj, event)
      if (matched > 0) {
        progress[i] = Math.min(required, before + matched)
        updated = true
      }
    }

    const allDone = objectives.every((obj, i) => Number(progress[i] || 0) >= Number(obj.count || 1))

    if (updated || allDone) {
      // 更新 player_contracts
      const patch = { progress }
      if (allDone) {
        patch.status = 'completed'
        patch.completed_at = new Date().toISOString()
      }
      await client.from('player_contracts').update(patch).eq('id', row.id)
    }

    if (allDone) {
      // 发放奖励到账户库
      const rewards = Array.isArray(contract.rewards) ? contract.rewards : []
      const itemRewards = rewards
        .filter(r => r?.name && Number(r.quantity) > 0)
        .map(r => ({ name: r.name, quantity: Number(r.quantity) }))
      if (itemRewards.length > 0) {
        await addItemsToStash(client, userId, itemRewards, { allowOverflow: true })
      }
      completed.push({ contract, rewards: itemRewards })
    }
  }

  return { completed }
}

// ── 判定一个事件是否推进了一个目标，返回推进的数量 ──
function matchObjective(obj, event) {
  if (!obj || !event) return 0
  switch (obj.type) {
    case 'find_item':
      return event.type === 'item_acquired' && event.itemName === obj.itemName ? 1 : 0
    case 'kill_npc':
      return event.type === 'npc_killed' && event.npcName === obj.npcName ? 1 : 0
    case 'extract':
      return event.type === 'extracted' ? 1 : 0
    case 'extract_at':
      return event.type === 'extracted' && event.extractionPointId === obj.extractionPointId ? 1 : 0
    default:
      return 0
  }
}
