/**
 * coldCases.js — 断链残片"开放循环"（悬案 / 推测，Phase 24b 预埋）
 *
 * research 2026-05-29-C P1 — Disco Elysium Thought Cabinet + Cultist Simulator
 * "再玩就 click" 范式。把"持有某残片却缺其前置锚点"的断链态从死胡同
 * （"……（断链中）……"）改成被追踪的"悬案"：
 *   - detect：出勤发现 / combo 解锁后，扫玩家残片，凡持有 F 但缺其
 *     requires_fragment_id 锚点 R → 登记一条 open 悬案 (F, R)（幂等）。
 *   - resolve：补齐锚点 R（发现 R）时，把所有 missing_anchor_id=R 的 open 悬案
 *     标 resolved + 回溯点亮 + 发小奖励（decode_accel 给下游残片解码加速 /
 *     item_pt 小额道具点）。困惑→悬念→延迟奖励。
 *
 * 奖励 / 门控 single source of truth：src/lib/constants.js COLD_CASES。
 * 经济红线（economy-canon §3 / §6.1）：默认 decode_accel（纯叙事·非 faucet）；
 * item_pt 极小额且 Phase 24b 须纳入 v_weekly_stash_inflation 监测；class_pt 永不发放。
 * reward_granted / reward_amount（DB）防重复发放注水。
 *
 * 全部 exception-safe — 任何失败仅 console.error，绝不阻塞残片发现。
 * 预埋不启用：COLD_CASES.ENABLED=false 时全部 early-return（0 查询），
 * 等 Phase 24b 接 discoverFragment detect/resolve 钩子 + /codex 悬案卡后翻 true。
 */

import { COLD_CASES } from '../constants'
import { creditPoints } from './points'

/**
 * 检测并登记玩家当前的断链悬案（幂等，可反复调用）。
 *
 * 断链 = 玩家持有残片 F，但 F.requires_fragment_id 指向的锚点 R 玩家未持有。
 * 已 resolved 的同 (F,R) 不会被重新打开（靠 UNIQUE + ignoreDuplicates）。
 *
 * @param {object} client - supabase admin client
 * @param {string} userId
 * @returns {Promise<Array<{fragmentId:number, missingAnchorId:number}>>} 本次新登记的悬案
 */
export async function detectColdCases(client, userId) {
  if (!COLD_CASES.ENABLED || !userId) return []
  try {
    // 1. 玩家已持有的残片 id
    const { data: ownedRows } = await client
      .from('player_fragments')
      .select('fragment_id')
      .eq('user_id', userId)
    const owned = new Set((ownedRows || []).map(r => r.fragment_id))
    if (owned.size === 0) return []

    // 2. 这些残片里哪些有前置锚点（requires_fragment_id 非空）
    const { data: pool } = await client
      .from('fragment_pool')
      .select('id, requires_fragment_id')
      .in('id', [...owned])
      .not('requires_fragment_id', 'is', null)

    // 3. 锚点缺失 = 断链候选
    const candidates = (pool || [])
      .filter(f => f.requires_fragment_id && !owned.has(f.requires_fragment_id))
      .map(f => ({ fragmentId: f.id, missingAnchorId: f.requires_fragment_id }))
    if (candidates.length === 0) return []

    // 4. open 悬案上限（防 UI 膨胀）
    const { count: openCount } = await client
      .from('fragment_cold_cases')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'open')
    let remaining = Math.max(0, (COLD_CASES.MAX_OPEN_PER_USER || 50) - (openCount || 0))
    if (remaining <= 0) return []

    // 5. 幂等登记（onConflict 忽略已存在的，含已 resolved 的，不重开）
    const opened = []
    for (const c of candidates) {
      if (remaining <= 0) break
      const { error } = await client
        .from('fragment_cold_cases')
        .upsert(
          {
            user_id: userId,
            fragment_id: c.fragmentId,
            missing_anchor_id: c.missingAnchorId,
            status: 'open',
          },
          { onConflict: 'user_id,fragment_id,missing_anchor_id', ignoreDuplicates: true },
        )
      if (!error) {
        opened.push(c)
        remaining -= 1
      }
    }
    return opened
  } catch (e) {
    console.error('[detectColdCases] 异常:', e?.message)
    return []
  }
}

/**
 * 补齐锚点 foundFragmentId 时，回溯点亮所有以它为缺失锚点的 open 悬案 + 发小奖励。
 *
 * 奖励作用于"下游已知碎片"（悬案的 fragment_id）：
 *   - decode_accel：把下游残片 decode_level +DECODE_ACCEL_LEVELS（钳制 ≤3，无 headroom 则 delta=0）
 *   - item_pt：发 ITEM_PT_AMOUNT 道具点
 * 仅处理 status='open'（隐含 reward 未发），防重复注水。
 *
 * @param {object} client - supabase admin client
 * @param {string} userId
 * @param {number} foundFragmentId - 刚被发现 / 解锁的残片 id（潜在锚点）
 * @returns {Promise<Array<{fragmentId:number, missingAnchorId:number, rewardKind:string, rewardAmount:number}>>}
 */
export async function resolveColdCasesForFragment(client, userId, foundFragmentId) {
  if (!COLD_CASES.ENABLED || !userId || !foundFragmentId) return []
  try {
    const { data: open } = await client
      .from('fragment_cold_cases')
      .select('id, fragment_id')
      .eq('user_id', userId)
      .eq('missing_anchor_id', foundFragmentId)
      .eq('status', 'open')
    if (!open || open.length === 0) return []

    const kind = COLD_CASES.REWARD_KIND === 'item_pt' ? 'item_pt' : 'decode_accel'
    const resolved = []

    for (const cc of open) {
      let rewardAmount = 0

      if (kind === 'item_pt') {
        const amount = Math.max(0, Math.round(Number(COLD_CASES.ITEM_PT_AMOUNT) || 0))
        if (amount > 0) {
          await creditPoints(client, userId, [{ type: 'item_pt', amount }])
          rewardAmount = amount
        }
      } else {
        // decode_accel：给下游已知碎片解码加速（钳制 ≤3）
        const accel = Math.max(0, Math.round(Number(COLD_CASES.DECODE_ACCEL_LEVELS) || 0))
        if (accel > 0) {
          const { data: pf } = await client
            .from('player_fragments')
            .select('decode_level')
            .eq('user_id', userId)
            .eq('fragment_id', cc.fragment_id)
            .maybeSingle()
          if (pf) {
            const cur = Number(pf.decode_level) || 0
            const next = Math.min(3, cur + accel)
            if (next > cur) {
              await client
                .from('player_fragments')
                .update({ decode_level: next, last_decoded: new Date().toISOString() })
                .eq('user_id', userId)
                .eq('fragment_id', cc.fragment_id)
            }
            rewardAmount = next - cur
          }
        }
      }

      const { error } = await client
        .from('fragment_cold_cases')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          reward_granted: true,
          reward_kind: kind,
          reward_amount: rewardAmount,
        })
        .eq('id', cc.id)
        .eq('status', 'open') // 二次条件防并发重复发放

      if (!error) {
        resolved.push({
          fragmentId: cc.fragment_id,
          missingAnchorId: foundFragmentId,
          rewardKind: kind,
          rewardAmount,
        })
      }
    }
    return resolved
  } catch (e) {
    console.error('[resolveColdCasesForFragment] 异常:', e?.message)
    return []
  }
}
