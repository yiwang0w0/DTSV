// KALEIDO · 渐进披露钩子（05 §1「UI 即进度」/ 🔧 06 ui_unlocks 契约）
//   维护 sticky 解锁集（只增不减·兼容 R8/R9）、检测新解锁（供渐次动效 + nar_line 落披露日志）。
//
//   两条解锁来源，统一经 commitUnlocks（按 prevRef 去重 ⇒ 每 key 恰处理一次·无双动效/双日志）：
//     ① server-events（🔧 06 §1.2 D2·权威）：响应信封顶层 unlockEvents[{ui_key,nar_line,timing,precedes,seq}]，
//        由 runGameAction 收到响应即经 applyServerEvents 提交（在 hydrateRoom 前 ⇒ 先于 stub-derive ⇒ server nar_line 为准）。
//     ② stub-derive（🔧 route 未 emit 前的兜底）：deriveStubUnlocks(ctx) ∪ readServerUnlocks(me.uiUnlocks)（06 §1.1 D1 真集）。
//   🔧 route 全量 live 后：置 emitNarLog=false ⇒ stub-derive 只维护渲染门集、不落本地文案，nar_line 全由 server-events 供 ⇒ 客户端零本地文案表（🧭 裁决）。

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
//   ⚠ STUB 心智：这些是「近似触发」——🔧 账号级解锁事件上线后由服务端解锁集/事件取代。
export function buildUnlockCtx(gamevars, me, node) {
  const kal = gamevars?.kaleido || null
  const inv = Array.isArray(me?.inventory) ? me.inventory : []
  const clearedSeq = kal?.clearedSeq ?? 0
  const chamberIdx = me?.chamberIndex ?? 0
  // 节点战斗模板在 kaleidoMode（chamberToNode·runs.js:134 = { template_ref, params, describe }）——非 combatMode。
  const cm = node?.kaleidoMode || null
  const hasRuleOverride = !!(cm && (cm.template_ref && cm.template_ref !== 'standard'))
    || (Array.isArray(node?.envRules) && node.envRules.length > 0)
    || (Array.isArray(node?.formulaOverrides) && node.formulaOverrides.length > 0)
  return {
    gamevars,
    me, // 🔧 06/D1：真解锁集读取缝 readServerUnlocks(me) 读 me.uiUnlocks（账号镜像）
    // searched 用 per-level turnCount（run 起始=0；首个消耗动作后=1，advanceKaleidoProgress 维护）——
    //   不用 log 长度：run 创建即播种 1 条「进入万华镜」log，会误在开局点亮 log_panel、破坏「初始仅搜索按钮」。
    //   sticky 兜底 turnCount 每关清零（log_panel 一旦解锁不回收）。
    searched: (me?.turnCount ?? 0) > 0,
    hasItems: inv.length > 0,
    encounter: !!me?.encounter,
    everFought: (me?.kills ?? 0) > 0,
    clearedAny: clearedSeq > 0,
    movedAny: chamberIdx > 0 || clearedSeq > 0,
    ruleLevel: hasRuleOverride,
    stanceLevel: cm?.template_ref === 'stance_duel',
    hasCraftMat: false, // 配方材料判定待 ⚙️ 配方池/材料标；stub 暂不点亮 craft_btn（由 server-events 点亮）
  }
}

// 短时钟标签（仅客户端 effect/事件内调用，无 SSR/hydration 顾虑）。
function nowLabel() {
  try {
    return new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } catch {
    return ''
  }
}

// 主钩子。
//   ctx: buildUnlockCtx(...) 的返回（或 dev 预览自造）。
//   opts.enabled：非 kaleido 局传 false ⇒ 钩子完全惰性（多人零回归：状态恒初始集、无副作用）。
//   opts.emitNarLog：stub 期 true（本地披露日志）；🔧 全量把 nar_line 走 unlockEvents 后置 false（客户端零本地文案表）。
//   opts.deriveStub：**默认 false**。true = 由可观测状态本地推解锁 —— 仅 dev 谐调器可用，正式路径永不开（见下方 effect 注释）。
export function useKaleidoUiUnlocks(ctx, opts = {}) {
  const { enabled = true, emitNarLog = true, deriveStub = false } = opts
  const [unlocked, setUnlocked] = useState(() => new Set(INITIAL_UNLOCKED))
  const [justUnlocked, setJustUnlocked] = useState([]) // 本 tick 新解锁 key（渐次动效用）
  // 初始集（search_btn）的 nar_line = 📖 N3「开场行」——run 起始即在场，播种为披露日志首行。
  //   不用 enabled 门控 seed：room 初值 null ⇒ 首帧 isKaleido=false=enabled ⇒ 惰性初始化只跑一次会漏种，
  //   room 载入后 enabled 翻 true 但初始化器不重跑、effect 又因 search_btn 已在初始集而不 emit ⇒ 开场行永久丢失。
  //   seed 是纯静态数据无副作用；非 kaleido 局 narLog 根本不被消费，无条件 seed 安全。
  const [narLog, setNarLog] = useState(() =>
    emitNarLog
      ? INITIAL_UNLOCKED.map((k) => ({ key: k, time: '', text: unlockEntry(k)?.nar_line || '' })).filter((e) => e.text)
      : [])
  const prevRef = useRef(new Set(INITIAL_UNLOCKED))

  // 统一提交：candidateKeys 中「尚未在 prevRef」的键 = 本次新解锁（按 REVEAL_ORDER 定序）；resolveNar(key) 取其 nar_line。
  //   两条来源共用此路 ⇒ 先到先得、prevRef 去重 ⇒ 每 key 恰处理一次，无双动效/双日志。
  const commitUnlocks = useCallback((candidateKeys, resolveNar) => {
    const prev = prevRef.current
    const added = REVEAL_ORDER.filter((k) => candidateKeys.has(k) && !prev.has(k))
    if (added.length === 0) return
    const next = new Set(prev)
    added.forEach((k) => next.add(k))
    prevRef.current = next
    setUnlocked(next)
    setJustUnlocked(added)
    const t = nowLabel()
    const lines = added.map((k) => ({ key: k, time: t, text: resolveNar(k) })).filter((e) => e.text)
    if (lines.length) setNarLog((log) => [...log, ...lines])
  }, [])

  // D2（🔧 06 §1.2）：消费响应信封顶层 unlockEvents（服务端权威·含 nar_line）。
  //   由 runGameAction 在 hydrateRoom 前调 ⇒ server 事件先提交、后续 stub-derive 见 prevRef 已含即跳过 ⇒ server nar_line 为准。
  const applyServerEvents = useCallback((events) => {
    if (!enabled || !Array.isArray(events) || events.length === 0) return
    const keys = new Set()
    const narMap = {}
    for (const e of events) {
      if (!e || typeof e.ui_key !== 'string') continue
      keys.add(e.ui_key)
      if (typeof e.nar_line === 'string' && e.nar_line) narMap[e.ui_key] = e.nar_line
    }
    if (keys.size === 0) return
    // server nar_line 优先；缺失才回落本地（过渡期兜底，emitNarLog=false 后不回落）。
    commitUnlocks(keys, (k) => narMap[k] || (emitNarLog ? unlockEntry(k)?.nar_line || '' : ''))
  }, [enabled, emitNarLog, commitUnlocks])

  // 渲染门同步：并入服务端真集 me.uiUnlocks（🔧 06/D1）。
  //   ⚠ deriveStubUnlocks **默认已停用**（🧭 P0-2·教义级）：它里面 `if (ctx.searched) { add(LOG); add(HP) }`
  //     是**无条件**的，等于**客户端在替玩家「发现」UI** —— 正是 Diegetic 教义法则二禁止的事
  //     （UI 由玩家的世界内动作获得，不由系统推导授予）。两个连带同样致命：
  //       ① 它会把被服务端**移除**的键加回来 ⇒ 法则三「UI 可以失去」结构上无法生效；
  //       ② 它配 emitNarLog 会补播本地旧宣告式文案（「——已开放：X」），而该句式已被教义 §2 推论禁用。
  //     服务端已在发这些键（unlockEvents + 账号级 uiUnlocks 双路），关掉不会让 UI 消失。
  //   opts.deriveStub=true 仅供 dev 谐调器（无服务端可发事件，靠布尔 ctx 驱动预览）——**正式路径永不开**。
  useEffect(() => {
    if (!enabled) return
    const keys = deriveStub ? deriveStubUnlocks(ctx || {}) : new Set()
    readServerUnlocks(ctx?.me).forEach((k) => keys.add(k))
    if (keys.size === 0) return
    // nar_line：emitNarLog=false（🔧 全量 live）时只维护渲染门、文案一律由 server-events 供。
    commitUnlocks(keys, (k) => (emitNarLog ? unlockEntry(k)?.nar_line || '' : ''))
    // ctx 每 hydrate 换引用 ⇒ 依赖它即「状态变化则重算」；commitUnlocks 的 diff 保证仅新解锁才 setState。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, emitNarLog, deriveStub, ctx, commitUnlocks])

  const isUnlocked = useCallback((uiKey) => unlocked.has(uiKey), [unlocked])
  const justRevealed = useCallback((uiKey) => justUnlocked.includes(uiKey), [justUnlocked])

  return { unlocked, isUnlocked, justUnlocked, justRevealed, narLog, applyServerEvents, UI_KEYS }
}
