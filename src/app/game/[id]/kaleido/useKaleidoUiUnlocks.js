// KALEIDO · 渐进披露钩子（05 §1「UI 即进度」）
//   维护 sticky 解锁集（只增不减，兼容 R8/R9：收敛/permadeath 不回收 UI）、检测新解锁（供渐次动效）、
//   并把新解锁条目的 nar_line 落到「披露日志」（stub 期；🔧 服务端把 nar_line 写进对局 log 后，
//   将本地 narLog 关掉即可，见 emitNarLog）。
//
//   数据源合流：deriveStubUnlocks(ctx)【前端 stub】 ∪ readServerUnlocks(gamevars)【🔧 真数据源缝】。
//   两者都并进 sticky 集 —— 🔧 解锁集下发后自然接管、stub 冗余即可停用。

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  INITIAL_UNLOCKED,
  REVEAL_ORDER,
  deriveStubUnlocks,
  readServerUnlocks,
  unlockEntry,
  UI_KEYS,
} from './kaleidoUiUnlocks'

// 从可观测对局状态构造 stub 派生所需 ctx（GameClientPage 用；dev 预览自造 ctx）。
//   ⚠ STUB 心智：这些是「近似触发」——🔧 账号级解锁事件上线后由服务端解锁集取代。
export function buildUnlockCtx(gamevars, me, node) {
  const kal = gamevars?.kaleido || null
  const logs = Array.isArray(gamevars?.log) ? gamevars.log : []
  const inv = Array.isArray(me?.inventory) ? me.inventory : []
  const clearedSeq = kal?.clearedSeq ?? 0
  const chamberIdx = me?.chamberIndex ?? 0
  const cm = node?.combatMode || null
  const hasRuleOverride = !!(cm && (cm.template_ref && cm.template_ref !== 'standard'))
    || (Array.isArray(node?.envRules) && node.envRules.length > 0)
    || (Array.isArray(node?.formulaOverrides) && node.formulaOverrides.length > 0)
  return {
    gamevars,
    searched: logs.length > 0 || (gamevars?.turn ?? 0) > 0,
    hasItems: inv.length > 0,
    encounter: !!me?.encounter,
    everFought: (me?.kills ?? 0) > 0,
    clearedAny: clearedSeq > 0,
    movedAny: chamberIdx > 0 || clearedSeq > 0,
    ruleLevel: hasRuleOverride,
    stanceLevel: cm?.template_ref === 'stance_duel',
    hasCraftMat: false, // 配方材料判定待 ⚙️ 配方池/材料标；stub 暂不点亮 craft_btn
  }
}

// 短时钟标签（仅客户端 effect 内调用，无 SSR/hydration 顾虑）。
function nowLabel() {
  try {
    return new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } catch {
    return ''
  }
}

// 主钩子。
//   ctx: buildUnlockCtx(...) 的返回（或 dev 预览自造）。
//   opts.enabled：非 kaleido 局传 false ⇒ 钩子完全惰性（多人零回归：状态恒为初始集、无 effect 副作用）。
//   opts.emitNarLog：stub 期 true（本地披露日志）；🔧 把 nar_line 写进对局 log 后置 false 防重。
export function useKaleidoUiUnlocks(ctx, opts = {}) {
  const { enabled = true, emitNarLog = true } = opts
  const [unlocked, setUnlocked] = useState(() => new Set(INITIAL_UNLOCKED))
  const [justUnlocked, setJustUnlocked] = useState([]) // 本 tick 新解锁 key（渐次动效用）
  // 初始集（search_btn）的 nar_line = 📖 N3「开场行」——run 起始即在场，播种为披露日志首行。
  const [narLog, setNarLog] = useState(() =>
    (enabled && emitNarLog)
      ? INITIAL_UNLOCKED.map((k) => ({ key: k, time: '', text: unlockEntry(k)?.nar_line || '' })).filter((e) => e.text)
      : [])
  const prevRef = useRef(new Set(INITIAL_UNLOCKED))

  useEffect(() => {
    if (!enabled) return
    const derived = deriveStubUnlocks(ctx || {})
    const server = readServerUnlocks(ctx?.gamevars)
    const prev = prevRef.current
    const next = new Set(prev)
    derived.forEach((k) => next.add(k))
    server.forEach((k) => next.add(k))
    const added = REVEAL_ORDER.filter((k) => next.has(k) && !prev.has(k))
    if (added.length === 0) return
    prevRef.current = next
    setUnlocked(next)
    setJustUnlocked(added)
    if (emitNarLog) {
      const t = nowLabel()
      const lines = added
        .map((k) => ({ key: k, time: t, text: unlockEntry(k)?.nar_line || '' }))
        .filter((e) => e.text)
      if (lines.length) setNarLog((log) => [...log, ...lines])
    }
    // ctx 是每次 hydrate 换引用的对象 —— 依赖它即「状态变化则重算」；diff 保证仅新解锁才 setState。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, emitNarLog, ctx])

  const isUnlocked = useCallback((uiKey) => unlocked.has(uiKey), [unlocked])
  const justRevealed = useCallback((uiKey) => justUnlocked.includes(uiKey), [justUnlocked])

  return { unlocked, isUnlocked, justUnlocked, justRevealed, narLog, UI_KEYS }
}
