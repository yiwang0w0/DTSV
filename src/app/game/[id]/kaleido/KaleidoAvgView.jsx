'use client'

// KALEIDO · AVG 呈现骨架原型(10 垂直切片 · seq1-2 · dev/kaleido-preview 单挂)
//   文字舞台为主体 + UI 件随进度在四缘「材质化」析出 + nar_line→件 因果两拍。研究出处见 Claude/frontend/log.md。
//   ⚠ 原型:自驱状态机 + 占位血肉(真叙事 >2500 行是 Kanata 自驱线·不阻塞呈现手感验证)。
//   验证点(🧭):①冷开局钩子(防 10 秒跳出) ②因果两拍手感 ③文字重复烦不烦。
//   复用:T 调色板 / HpBar / kaleidoShell(KaleidoRuleCard) / globals.css(kaleido-line-in/materialize/flash-cyan) / Shader。
//   真接通时:壳不变、把内部 sim 换成 useKaleidoUiUnlocks + logs/narLog 真数据源(改造非推倒·prop 契约见研究 Q1)。

import dynamic from 'next/dynamic'
import { useState, useRef, useEffect, useCallback } from 'react'
import { T, Btn, HpBar, hpColor, StaminaBar, staminaColor } from '../gameUi'
import { KaleidoRuleCard } from './kaleidoShell'
import { UI_KEYS } from './kaleidoUiUnlocks'
import {
  AVG_AWAKEN_LINES as AWAKEN_LINES,
  AVG_SEARCH_LOGS as SEARCH_LOGS,
  AVG_FIND_LOG as FIND_LOG,
  AVG_MOCK_ENEMY as MOCK_ENEMY,
  actionText,
  narFor,
  previewNarFor,
  uiAction,
} from './kaleidoAvgCopy'

const Shader = dynamic(() => import('@/components/fx/Shader'), { ssr: false })

// P2：文案全部下沉到 kaleidoAvgCopy / kaleidoUiUnlocks —— 组件侧零硬编码。
//   开场行 = search_btn 的 nar_line 同源（不再另写一份）；可交互词走结构化元数据（永不字符串搜索）。
const OPENING_NAR = narFor(UI_KEYS.SEARCH)
const STATUS_PROMPT = uiAction(UI_KEYS.HP)

const NAR_DELAY = 620 // 因果两拍:nar 落舞台 → 件延迟材质化(ms)
const SEARCH_COMMIT_DELAY = 1000
const LAYOUT_TRANSITION_MS = 900
const DIALOG_SETTLE_PAUSE = 180
const STAMINA_EXPAND_MS = 640
let _lid = 0
const nextId = () => (_lid += 1)

export default function KaleidoAvgView({
  // ── P1 真数据接线（全部可选；缺省 → 内部预览 sim 兜底，保 /play frontend-only 随时可验手感）──
  unlocks,                   // useKaleidoUiUnlocks 返回（sticky 解锁集 / narLog / justUnlocked / applyServerEvents）
  logs,                      // 真 gamevars.log（时序流·chronological）
  me: liveMe,                // 真玩家态
  encounter: liveEncounter,  // 真遭遇实例
  combatMode, envRules, formulaOverrides, // 真关规则（门口告示卡用）
  onSearch: onSearchLive, onAttack: onAttackLive, onRelease: onReleaseLive,
  busy = false, canAct = true,
  onExit, showDevControls = false,
}) {
  const live = Boolean(unlocks) // 有解锁钩子 = 真数据模式；否则预览兜底
  // phase: boot(黑幕冷开场) → awake(觉醒行+搜索) → playing(舞台激活)
  const [phase, setPhase] = useState('boot')
  const [lines, setLines] = useState([]) // 文字舞台:{ id, text, kind:'log'|'nar'|'awake' }
  // unlocked = 视觉已揭示集（两种模式共用）：预览由 revealPiece 推，真数据由 justUnlocked 经因果两拍延迟推。
  const [unlocked, setUnlocked] = useState(() => new Set())
  const [flashing, setFlashing] = useState(() => new Set()) // 因果两拍:正在闪 cyan 的件
  const [previewMe] = useState({ hp: 78, maxHp: 100, stamina: 72, maxStamina: 100, atk: 22, def: 9 })
  const me = live ? (liveMe || previewMe) : previewMe
  const [simCombat, setSimCombat] = useState(null) // 预览 sim 的遭遇
  const combat = live ? (liveEncounter || null) : simCombat
  // 归一：真 encounterInstance 是 { id, hp, maxHp, npc:{name,atk,def} }，预览 sim 是扁平结构
  const combatView = combat ? {
    name: combat.name || combat.npc?.name || '未知实体',
    hp: combat.hp, maxHp: combat.maxHp,
    atk: combat.atk ?? combat.npc?.atk ?? '?',
    def: combat.def ?? combat.npc?.def ?? '?',
  } : null
  const [atRuleGate, setAtRuleGate] = useState(false) // rules_card 门口告示闸门
  const [searchCount, setSearchCount] = useState(0)
  const [turnCount, setTurnCount] = useState(0) // 消耗动作计数；首搜完成后即记为第 1 回合
  const [searchPending, setSearchPending] = useState(false)
  const [firstSearchDialogueSettled, setFirstSearchDialogueSettled] = useState(false)
  const [staminaRevealed, setStaminaRevealed] = useState(false)
  const [staminaExpanded, setStaminaExpanded] = useState(false)
  const [seq, setSeq] = useState(1)
  const rootRef = useRef(null)
  const streamRef = useRef(null)
  const statusInlineRef = useRef(null)
  const searchInlineRef = useRef(null)
  const statusMaterialized = useRef(false)
  const statusSequenceStarted = useRef(false)
  const dialogueSettleScheduled = useRef(false)
  const searchPendingRef = useRef(false)
  // ── 180ms 停顿的触发源（🧭 裁决）────────────────────────────────────────
  //   主判据：本批 unlockEvents **最后一条**的 animationend —— 确定性，且与 sim 路径**同构**
  //     （复用同一个 settlesFirstSearch 元数据 + 同一个 onFirstSearchDialogueEnd，不引入第二套语义）。
  //   跨批交错：批 B 可能在批 A 的行还在淡入时到达 ⇒ 播放队列计数，
  //     「锚点行已结束 **且** 队列排空」才放行，不抢在后到的行前面收尾。
  //   去抖：仅作**兜底**（浏览器彻底禁用动画 / animationend 丢失时流程不卡死），**不作主判据**。
  const playing = useRef(0)         // 播放队列深度 = 正在淡入的真数据行数
  const settleArmed = useRef(false) // 锚点行已结束，等队列排空
  const timers = useRef([])
  const seenLogs = useRef(0) // P1：真 logs 已追加到舞台的游标
  const seenNar = useRef(0)  // P1：解锁 nar_line 已追加的游标
  const [coldOpenDone, setColdOpenDone] = useState(false) // 冷开场结束前不放真数据进舞台，免抢跑
  const unlocksRef = useRef(unlocks); unlocksRef.current = unlocks
  const logsRef = useRef(logs); logsRef.current = logs
  const [statusStage, setStatusStage] = useState('hidden') // hidden → inline → flying → docked
  const [statusFlight, setStatusFlight] = useState(null)
  const [dialogFramed, setDialogFramed] = useState(false)
  const [dialogDocked, setDialogDocked] = useState(false)

  const isU = (k) => unlocked.has(k)
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.current.push(t); return t }

  const pushLine = useCallback((text, kind = 'log', meta = {}) => {
    setLines((ls) => [...ls, { ...meta, id: nextId(), text, kind }].slice(-60))
  }, [])

  // 因果两拍:nar 先落舞台(因) → 延迟让对应 UI 件材质化析出(果) + 边框闪 nar 同色
  const revealPiece = useCallback((key, narText, lineMeta) => {
    if (narText) pushLine(narText, 'nar', lineMeta)
    later(() => {
      setUnlocked((s) => new Set(s).add(key))
      setFlashing((s) => new Set(s).add(key))
      later(() => setFlashing((s) => { const n = new Set(s); n.delete(key); return n }), 1300)
    }, narText ? NAR_DELAY : 0)
  }, [pushLine])

  // ── 冷开场序列(boot → awake):黑幕 → 觉醒行逐行淡入 → 开场行 → 搜索按钮浮现 ──
  useEffect(() => {
    later(() => setPhase('awake'), 700) // 黑幕停顿(shader 坍缩在 CSS 里)
    let t = 1100
    AWAKEN_LINES.forEach((l) => { later(() => pushLine(l, 'awake'), t); t += 850 })
    later(() => pushLine(OPENING_NAR, 'nar'), t) // 开场行(=search_btn nar·零硬编码同源)
    later(() => {
      // 冷开场收尾：预览模式点亮搜索；真数据模式把「进局时已解锁集」一次同步进来
      //   （首 run 只有 search_btn；veteran 满 UI 也在这一拍落定，符合 B1「一次性惊艳开场」）
      setUnlocked((s) => {
        const n = new Set(s)
        const cur = unlocksRef.current
        if (live && cur?.unlocked) cur.unlocked.forEach((k) => n.add(k))
        else n.add('search_btn')
        return n
      })
      // 游标跳过冷开场之前的历史（run 起始 log / 已积累 nar），此后只追加新增
      seenLogs.current = Array.isArray(logsRef.current) ? logsRef.current.length : 0
      seenNar.current = unlocksRef.current?.narLog?.length || 0
      setColdOpenDone(true)
    }, t + 500)
    return () => { timers.current.forEach(clearTimeout); timers.current = [] }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 舞台贴底自动滚
  useEffect(() => {
    const el = streamRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [dialogDocked, lines])

  // ── P1 真数据接线 ─────────────────────────────────────────────────────────
  // 真 gamevars.log 新增行 → 追加进舞台（沿用 kaleido-line-in 逐段淡入，不改呈现）
  useEffect(() => {
    if (!live || !coldOpenDone || !Array.isArray(logs)) return
    if (logs.length < seenLogs.current) seenLogs.current = 0 // 换 run 重置
    const fresh = logs.slice(seenLogs.current)
    seenLogs.current = logs.length
    playing.current += fresh.length // 入播放队列（queued 行的 animationend 会出队）
    fresh.forEach((l) => pushLine(l?.text || '', l?.type || 'log', { queued: true }))
  }, [live, coldOpenDone, logs, pushLine])

  // 解锁 nar_line（服务端权威·D2 信封）新增 → 追加进舞台
  //   交互词（P2）：以 key 查 UI_ACTIONS 挂 interaction 元数据（**永不字符串搜索**），该行改由结构化
  //   before/word/after 渲染。⚠ 副作用：这一拍会**覆盖服务端 nar 的显示文本** —— 目前只有 hp_bar 一条，
  //   悬案已送 🧭（见 kaleidoAvgCopy.js 的 UI_ACTIONS 注释）；📖 补上带交互词的 nar 后此覆盖即可撤。
  useEffect(() => {
    if (!live || !coldOpenDone) return
    const nar = unlocks.narLog || []
    if (nar.length < seenNar.current) seenNar.current = 0
    const fresh = nar.slice(seenNar.current)
    seenNar.current = nar.length
    // 锚点 = 「含 hp_bar 的那一批」的最后一条 —— 它的 animationend 就是 180ms 停顿的起算点。
    //   只标含 hp_bar 的批次，避免更早的批次抢跑把停顿算在错误的一拍上。
    const anchorAt = fresh.some((n) => n.key === UI_KEYS.HP) ? fresh.length - 1 : -1
    playing.current += fresh.length
    fresh.forEach((n, i) => pushLine(n.text, 'nar', {
      queued: true,
      ...(uiAction(n.key) ? { interaction: n.key } : null),
      ...(i === anchorAt ? { settlesFirstSearch: true } : null),
    }))
  }, [live, coldOpenDone, unlocks?.narLog, pushLine])

  // 新解锁 → 因果两拍：nar 已落舞台，延迟 NAR_DELAY 后件材质化析出 + 闪 nar 同色
  useEffect(() => {
    if (!live || !coldOpenDone) return
    const added = unlocks.justUnlocked || []
    if (!added.length) return
    later(() => {
      setUnlocked((s) => { const n = new Set(s); added.forEach((k) => n.add(k)); return n })
      setFlashing((s) => { const n = new Set(s); added.forEach((k) => n.add(k)); return n })
      later(() => setFlashing((s) => { const n = new Set(s); added.forEach((k) => n.delete(k)); return n }), 1300)
    }, NAR_DELAY)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, coldOpenDone, unlocks?.justUnlocked])

  const hpUnlocked = isU('hp_bar')

  // 兜底（**不是主判据**）：主判据是上面那套「锚点行 animationend + 队列排空」。
  //   仅当浏览器根本不派发 animationend（动画被彻底禁用 / 事件丢失）时，用「一段时间无新行」把流程救回来。
  //   窗口取 1800ms —— 远大于单行淡入 500ms + 180ms 停顿，确保正常路径永远先到，兜底不抢跑。
  useEffect(() => {
    if (!live || !coldOpenDone || !hpUnlocked || firstSearchDialogueSettled) return undefined
    const t = setTimeout(() => setFirstSearchDialogueSettled(true), 1800)
    return () => clearTimeout(t)
  }, [live, coldOpenDone, hpUnlocked, firstSearchDialogueSettled, lines])

  useEffect(() => {
    if (!hpUnlocked || statusMaterialized.current) return
    statusMaterialized.current = true
    setStatusStage('inline')
  }, [hpUnlocked])

  // 状况读数先向右离屏，再从左侧滑入停靠位；对话框与第一段同时重排。
  useEffect(() => {
    const staminaIsExpanding = staminaRevealed && !staminaExpanded
    if (!hpUnlocked || staminaIsExpanding || !firstSearchDialogueSettled || statusSequenceStarted.current) return undefined
    statusSequenceStarted.current = true

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let settleTimer = null

    const moveTimer = window.setTimeout(() => {
      const sourceRect = (statusInlineRef.current?.firstElementChild || statusInlineRef.current)?.getBoundingClientRect()
      const actionSourceRect = searchInlineRef.current?.getBoundingClientRect()
      const narrow = window.innerWidth < 720
      const targetWidth = narrow
        ? Math.max(240, window.innerWidth - 24)
        : Math.min(360, Math.max(280, window.innerWidth * 0.34))
      const fallbackWidth = Math.min(440, window.innerWidth - 40)
      const from = sourceRect?.width
        ? { top: sourceRect.top, left: sourceRect.left, width: sourceRect.width, height: sourceRect.height }
        : { top: window.innerHeight * 0.46, left: (window.innerWidth - fallbackWidth) / 2, width: fallbackWidth, height: 45 }
      const to = { top: narrow ? 12 : 18, left: narrow ? 12 : 18, width: targetWidth, height: from.height }
      const actionFrom = actionSourceRect?.width
        ? { top: actionSourceRect.top, left: actionSourceRect.left, width: actionSourceRect.width }
        : { top: from.top + from.height + 10, left: from.left, width: from.width }
      const actionTo = { top: to.top + to.height + 10, left: to.left, width: targetWidth }

      if (reduced) {
        setDialogFramed(true)
        setDialogDocked(true)
        setStatusStage('docked')
        return
      }

      setStatusFlight({
        from,
        to,
        actionFrom,
        actionTo,
      })
      setStatusStage('flying')
      setDialogFramed(true)
      setDialogDocked(true)

      settleTimer = window.setTimeout(() => {
        setStatusStage('docked')
        setStatusFlight(null)
      }, LAYOUT_TRANSITION_MS)
    }, 0)

    return () => {
      window.clearTimeout(moveTimer)
      if (settleTimer) window.clearTimeout(settleTimer)
    }
  }, [firstSearchDialogueSettled, hpUnlocked, staminaExpanded, staminaRevealed])

  // 队列排空检查：锚点行结束 + 队列深度归零 ⇒ 停 DIALOG_SETTLE_PAUSE 再放行 900ms 迁移。
  //   sim 路径不入队（playing 恒 0）⇒ 锚点一结束即排空，行为与改造前逐字节一致。
  function drainSettle() {
    if (!settleArmed.current || playing.current > 0) return
    if (dialogueSettleScheduled.current) return
    dialogueSettleScheduled.current = true
    later(() => setFirstSearchDialogueSettled(true), DIALOG_SETTLE_PAUSE)
  }

  function onFirstSearchDialogueEnd() {
    settleArmed.current = true
    drainSettle()
  }

  // 舞台每行淡入结束：真数据行出队；锚点行同时点火。两者都走排空判定。
  function handleLineEnd(line, event) {
    if (event.currentTarget !== event.target) return
    if (line.queued) playing.current = Math.max(0, playing.current - 1)
    if (line.settlesFirstSearch) settleArmed.current = true
    drainSettle()
  }

  function onRevealStamina() {
    if (!hpUnlocked || !dialogDocked || statusStage !== 'docked' || staminaRevealed) return
    setStaminaRevealed(true)
    // animationend 是主路径；此处防止浏览器未派发动画事件时流程停住。
    later(() => setStaminaExpanded(true), STAMINA_EXPAND_MS + 80)
  }

  function onStaminaExpandEnd(event) {
    if (event.currentTarget !== event.target) return
    setStaminaExpanded(true)
  }

  // ── 动作:搜索 ──────────────────────────────────────────────────────────
  function onSearch() {
    if (searchPendingRef.current) return
    searchPendingRef.current = true
    setSearchPending(true)
    later(() => {
      searchPendingRef.current = false
      setSearchPending(false)
      commitSearch()
    }, SEARCH_COMMIT_DELAY)
  }

  function commitSearch() {
    if (phase === 'awake') setPhase('playing')
    // 真数据模式：把搜索交给服务端 action；浮现序由回来的 unlockEvents 决定（首物→inventory·再搜材料→craft…）
    if (live) { onSearchLive?.(); return }
    const n = searchCount + 1
    setSearchCount(n)
    setTurnCount((count) => count + 1)
    if (n === 1) {
      // 首搜:座舱结晶一拍 —— log 醒 + hp_bar(gauge-first) + inventory
      pushLine(SEARCH_LOGS[0], 'log')
      revealPiece(UI_KEYS.LOG, previewNarFor(UI_KEYS.LOG))
      // 状况与生命条仍按原流程出现；叙事中的「状态」只展开第二层体力读数。
      later(() => revealPiece(UI_KEYS.HP, actionText(STATUS_PROMPT), { interaction: UI_KEYS.HP }), 500)
      // 首物(seq1 保障):抽屉滑出
      later(() => {
        pushLine(FIND_LOG, 'log')
        revealPiece(UI_KEYS.INVENTORY, previewNarFor(UI_KEYS.INVENTORY), { settlesFirstSearch: true })
      }, 1600)
      // animationend 是主路径；此处只防浏览器禁用动画后没有事件。
      later(() => setFirstSearchDialogueSettled(true), 2600)
    } else {
      pushLine(SEARCH_LOGS[n % SEARCH_LOGS.length], 'log')
      if (n === 3) later(() => pushLine('好像有什么在更深处。', 'log'), 400)
    }
  }

  // ── 动作:遭遇(首战·seq2) ──────────────────────────────────────────────
  function onEncounter() { // 预览 sim 专用（真数据由 search 结果自然带出遭遇）
    setSimCombat({ ...MOCK_ENEMY })
    revealPiece(UI_KEYS.COMBAT, previewNarFor(UI_KEYS.COMBAT))
  }
  function onStrike() {
    if (live) { onAttackLive?.(); return }
    pushLine('你先出手。它踉跄了一下，退回暗处。', 'kill')
    setSimCombat(null)
  }
  function onFlee() {
    if (live) { onReleaseLive?.(); return }
    pushLine('你绕开了它。', 'log'); setSimCombat(null)
  }

  // ── 动作:进规则关(rules_card 门口告示闸门·seq2) ────────────────────────
  function onApproachRuleLevel() {
    setAtRuleGate(true)
    revealPiece(UI_KEYS.RULES_CARD, previewNarFor(UI_KEYS.RULES_CARD))
  }
  function onEnterRuleLevel() { setAtRuleGate(false); setSeq(2); pushLine('你迈过门口。规矩生效了。', 'system') }

  const searchReady = isU('search_btn')
  // 真数据模式还要尊重服务端可行动性（阵亡/终局/请求中）；预览模式只受 sim 的遭遇/闸门约束
  const searchDisabled = !!combat || atRuleGate || (live && (!canAct || busy))
  const statusActionReady = dialogDocked && statusStage === 'docked'
  const flightRect = statusFlight?.from || null
  const actionFlightRect = statusFlight?.actionFrom || null

  return (
    <div ref={rootRef} data-turn-count={turnCount} style={{ position: 'relative', height: '100%', overflow: 'hidden', background: '#05070c', isolation: 'isolate' }}>
      {/* 污染场 shader 背景(转场介质·playing 后压暗让文字可读) */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: phase === 'playing' ? 0.18 : 0.5, transition: 'opacity 1.4s ease' }}>
        <Shader name="pollution_field" pollution={0.4} intensity={phase === 'playing' ? 0.5 : 0.85} />
      </div>
      {/* 黑幕冷开场(boot):盖住一切、渐隐 */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 40, background: '#000', pointerEvents: 'none',
        opacity: phase === 'boot' ? 1 : 0, transition: 'opacity 1.1s ease',
      }} />

      {/* ── 文字舞台：解锁状况后长出框体，并整体滑到右侧 ─────────────────── */}
      <div className={`kaleido-avg-dialog${dialogFramed ? ' is-framed' : ''}${dialogDocked ? ' is-docked' : ''}`}>
        <div ref={streamRef} className="kaleido-avg-dialog-stream">
          <div className="kaleido-avg-dialog-content">
          {lines.map((l) => (
            <div
              key={l.id}
              className="kaleido-line-in"
              style={lineStyle(l.kind)}
              onAnimationEnd={(l.queued || l.settlesFirstSearch) ? (e) => handleLineEnd(l, e) : undefined}
            >
              {uiAction(l.interaction) ? (
                <>
                  {uiAction(l.interaction).before}
                  {statusActionReady ? (
                    <button
                      type="button"
                      // 隐蔽度走数据（教义 §5）：hint 决定描边等级，组件不硬编码视觉。
                      className={`kaleido-inline-action hint-${uiAction(l.interaction).hint || 'underline'}${staminaRevealed ? '' : ' is-arming'}`}
                      onClick={onRevealStamina}
                      disabled={staminaRevealed}
                      aria-pressed={staminaRevealed}
                    >
                      {uiAction(l.interaction).word}
                    </button>
                  ) : (
                    <span className="kaleido-inline-action-pending">{uiAction(l.interaction).word}</span>
                  )}
                  {uiAction(l.interaction).after}
                </>
              ) : l.text}
            </div>
          ))}

            <div
              ref={statusInlineRef}
              style={{
                minHeight: statusStage === 'flying' ? (statusFlight?.from?.height || 96) : 0,
                transition: 'min-height 320ms ease',
              }}
            >
              {statusStage === 'inline' && (
                <StatusPanel
                  me={me}
                  flashing={flashing.has('hp_bar')}
                  staminaRevealed={staminaRevealed}
                  staminaExpanded={staminaExpanded}
                  onStaminaExpandEnd={onStaminaExpandEnd}
                />
              )}
            </div>

            {searchReady && !dialogDocked && (
              <SearchActions
                containerRef={searchInlineRef}
                className="kaleido-materialize"
                style={{ maxWidth: 440, marginTop: 8 }}
                onSearch={onSearch}
                disabled={searchDisabled}
                loading={searchPending}
              />
            )}
          </div>
        </div>
      </div>

      {statusStage === 'flying' && flightRect && (
        <StatusPanel
          me={me}
          flashing
          staminaRevealed={staminaRevealed}
          staminaExpanded
          className="kaleido-status-flight kaleido-wrap-flight"
          style={{
            position: 'fixed',
            zIndex: 24,
            top: flightRect.top,
            left: flightRect.left,
            width: flightRect.width,
            '--wrap-from-top': `${statusFlight.from.top}px`,
            '--wrap-from-left': `${statusFlight.from.left}px`,
            '--wrap-from-width': `${statusFlight.from.width}px`,
            '--wrap-to-top': `${statusFlight.to.top}px`,
            '--wrap-to-left': `${statusFlight.to.left}px`,
            '--wrap-to-width': `${statusFlight.to.width}px`,
            '--wrap-enter-left': `${-statusFlight.to.width - 24}px`,
          }}
        />
      )}

      {statusStage === 'flying' && actionFlightRect && (
        <SearchActions
          className="kaleido-action-flight kaleido-wrap-flight"
          style={{
            position: 'fixed',
            zIndex: 23,
            top: actionFlightRect.top,
            left: actionFlightRect.left,
            width: actionFlightRect.width,
            pointerEvents: 'none',
            '--wrap-from-top': `${statusFlight.actionFrom.top}px`,
            '--wrap-from-left': `${statusFlight.actionFrom.left}px`,
            '--wrap-from-width': `${statusFlight.actionFrom.width}px`,
            '--wrap-to-top': `${statusFlight.actionTo.top}px`,
            '--wrap-to-left': `${statusFlight.actionTo.left}px`,
            '--wrap-to-width': `${statusFlight.actionTo.width}px`,
            '--wrap-enter-left': `${-statusFlight.actionTo.width - 24}px`,
          }}
          onSearch={onSearch}
          disabled={searchDisabled}
          loading={searchPending}
        />
      )}

      {statusStage === 'docked' && (
        <aside className="kaleido-left-rail">
          <StatusPanel
            me={me}
            flashing={flashing.has('hp_bar')}
            staminaRevealed={staminaRevealed}
            staminaExpanded={staminaExpanded}
            onStaminaExpandEnd={onStaminaExpandEnd}
          />
          {searchReady && (
            <SearchActions
              className="kaleido-materialize"
              onSearch={onSearch}
              disabled={searchDisabled}
              loading={searchPending}
            />
          )}
        </aside>
      )}

      {/* ── 事件覆盖层(combat_panel·打断舞台) ──────────────────────────── */}
      {combat && isU('combat_panel') && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 25, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(2,5,10,0.55)', backdropFilter: 'blur(2px)' }}>
          <div className={`kaleido-materialize${flashing.has('combat_panel') ? ' kaleido-flash-cyan' : ''}`}
               style={{ width: '100%', maxWidth: 560, margin: '0 16px 96px', background: T.bg1, border: `1px solid ${T.red}55`, borderLeft: `3px solid ${T.red}`, borderRadius: 12, padding: '14px 16px', boxShadow: '0 -8px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div><div style={{ fontSize: 11, color: T.dimB }}>遭遇</div><div style={{ fontSize: 15, fontWeight: 700, color: T.red }}>{combatView.name}</div></div>
            </div>
            <HpBar hp={combatView.hp} max={combatView.maxHp} h={7} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11 }}>
              <span style={{ color: hpColor(combatView.hp, combatView.maxHp), fontFamily: 'monospace', fontWeight: 700 }}>HP {combatView.hp}/{combatView.maxHp}</span>
              <span style={{ color: T.dim }}>ATK {combatView.atk} · DEF {combatView.def}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Btn variant="danger" sx={{ flex: 2, padding: '10px 0', fontWeight: 700 }} onClick={onStrike}>⚔️ 自卫</Btn>
              <Btn variant="ghost" sx={{ flex: 1, padding: '10px 0' }} onClick={onFlee}>放过</Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── rules_card 门口告示闸门(必须迈过才入关·空间锁死时序法则) ────────── */}
      {atRuleGate && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(2,5,10,0.7)', backdropFilter: 'blur(3px)', padding: 16 }}>
          <div className="kaleido-materialize" style={{ width: '100%', maxWidth: 420 }}>
            <div style={{ textAlign: 'center', fontSize: 11, color: T.yellow, marginBottom: 8, letterSpacing: 0 }}>门口 · 已张贴</div>
            <KaleidoRuleCard
              combatMode={live ? (combatMode || { template_ref: 'standard', params: {} }) : { template_ref: 'stance_duel', params: { counterMul: 1.6 } }}
              envRules={live ? (envRules || []) : [{ rule_key: 'pollution_accel', value: 1.5 }]}
              formulaOverrides={live ? (formulaOverrides || []) : []}
            />
            <Btn variant="primary" size="lg" sx={{ width: '100%', marginTop: 12 }} onClick={onEnterRuleLevel}>读过了，迈过门口 →</Btn>
          </div>
        </div>
      )}

      {/* dev 谐调器:仅独立预览页显示，正式 /play 不暴露测试入口。 */}
      {showDevControls && (
        <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 50, display: 'flex', gap: 6 }}>
          <DevBtn on={!!combat} disabled={phase !== 'playing' || !!combat} onClick={onEncounter}>遭遇</DevBtn>
          <DevBtn on={atRuleGate} disabled={phase !== 'playing' || atRuleGate} onClick={onApproachRuleLevel}>规则关</DevBtn>
          {onExit && <DevBtn onClick={onExit}>✕</DevBtn>}
        </div>
      )}
    </div>
  )
}

function lineStyle(kind) {
  const base = { fontSize: 14, lineHeight: 1.85, letterSpacing: 0 }
  if (kind === 'nar') return { ...base, color: T.cyan, fontStyle: 'italic' } // 「值班的」系统声
  if (kind === 'awake') return { ...base, color: T.text, fontWeight: 500 }
  if (kind === 'kill') return { ...base, color: T.yellow }
  if (kind === 'attack') return { ...base, color: T.orange }
  if (kind === 'system') return { ...base, color: T.dimB }
  return { ...base, color: T.dimB } // log
}

function SearchActions({ onSearch, disabled, loading, containerRef, className = '', style }) {
  return (
    <div ref={containerRef} className={className} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, ...style }}>
      <Btn
        variant="primary"
        sx={{ flex: 1, padding: '13px 0', fontSize: 15, fontWeight: 700, letterSpacing: 0 }}
        onClick={onSearch}
        disabled={disabled}
        loading={loading}
        loadingText="搜索中"
      >
        🔦 搜索
      </Btn>
    </div>
  )
}

function StatusPanel({
  me,
  flashing,
  staminaRevealed = false,
  staminaExpanded = false,
  onStaminaExpandEnd,
  className = '',
  style,
}) {
  const hpPercent = Math.max(0, Math.min(100, Math.round((me.hp / Math.max(me.maxHp, 1)) * 100)))
  const maxStamina = Math.max(me.maxStamina || 1, 1)
  const stamina = Math.max(0, Math.min(maxStamina, me.stamina ?? maxStamina))
  const staminaPercent = Math.round((stamina / maxStamina) * 100)

  return (
    <div
      className={`${className}${flashing ? ' kaleido-flash-cyan' : ''}`.trim()}
      style={{
        padding: '9px 12px',
        background: 'rgba(13,17,23,0.86)',
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        backdropFilter: 'blur(5px)',
        boxShadow: '0 12px 34px rgba(0,0,0,0.24)',
        ...style,
      }}
    >
      <div style={{ color: T.dim, fontSize: 11, marginBottom: 8 }}>状况</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5, fontSize: 11 }}>
        <span style={{ color: T.dimB }}>生命</span>
        <span style={{ color: hpColor(me.hp, me.maxHp), fontFamily: 'monospace', fontWeight: 700 }}>{hpPercent}%</span>
      </div>
      <HpBar hp={me.hp} max={me.maxHp} h={7} />
      {staminaRevealed && (
        <div
          className={staminaExpanded ? 'kaleido-stamina-expanded' : 'kaleido-stamina-expand'}
          onAnimationEnd={staminaExpanded ? undefined : onStaminaExpandEnd}
        >
          <div className="kaleido-stamina-expand-inner">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '9px 0 5px', fontSize: 11 }}>
              <span style={{ color: T.dimB }}>体力</span>
              <span style={{ color: staminaColor(stamina, maxStamina), fontFamily: 'monospace', fontWeight: 700 }}>{staminaPercent}%</span>
            </div>
            <StaminaBar value={stamina} max={maxStamina} h={7} />
          </div>
        </div>
      )}
    </div>
  )
}

function DevBtn({ children, onClick, on, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: '4px 9px', borderRadius: 7, fontSize: 11, fontFamily: 'inherit', cursor: disabled ? 'not-allowed' : 'pointer',
        border: `1px solid ${on ? T.green + '55' : T.border}`, background: on ? `${T.green}18` : 'rgba(13,17,23,0.8)', color: on ? T.green : T.dim, opacity: disabled ? 0.4 : 1 }}>
      {children}
    </button>
  )
}
