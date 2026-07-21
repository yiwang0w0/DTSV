'use client'

// KALEIDO · AVG 呈现骨架原型(10 垂直切片 · seq1-2 · dev/kaleido-preview 单挂)
//   文字舞台为主体 + UI 件随进度在四缘「材质化」析出 + nar_line→件 因果两拍。研究出处见 Claude/frontend/log.md。
//   ⚠ 原型:自驱状态机 + 占位血肉(真叙事 >2500 行是 Kanata 自驱线·不阻塞呈现手感验证)。
//   验证点(🧭):①冷开局钩子(防 10 秒跳出) ②因果两拍手感 ③文字重复烦不烦。
//   复用:T 调色板 / HpBar / kaleidoShell(KaleidoRuleCard) / globals.css(kaleido-line-in/materialize/flash-cyan) / Shader。
//   真接通时:壳不变、把内部 sim 换成 useKaleidoUiUnlocks + logs/narLog 真数据源(改造非推倒·prop 契约见研究 Q1)。

import dynamic from 'next/dynamic'
import { useState, useRef, useEffect, useCallback } from 'react'
import { T, Btn, HpBar, hpColor } from '../gameUi'
import { KaleidoRuleCard } from './kaleidoShell'

const Shader = dynamic(() => import('@/components/fx/Shader'), { ssr: false })

// ── 占位文案(seq1-2) ──────────────────────────────────────────────────────
// C4 冷开局觉醒行(占位·真血肉待 📖/Kanata):首次点击前先有静态文字，不是裸按钮。
const AWAKEN_LINES = [
  '很久没有回音了。',
  '……现在，有一点。',
]
const OPENING_NAR = '供电恢复。可用功能：一项。' // search_btn nar_line(N3·开场行)
// N3 nar_line(揭示行·因果两拍的「因」)
const NAR = {
  log_panel: '开始记录。——从你翻找的这一下算起。',
  hp_bar: '你动起来了。往后有损耗，得盯着了。——已开放：状况读数。',
  inventory: '你把它收了起来。',
  combat_panel: '有东西在动。它先看见了你。——已开放：自卫。',
  rules_card: '这一段，规矩不一样。——已张贴在门口。',
}
// 搜索结果占位池(测「文字重复烦不烦」——刻意给多样变体)
const SEARCH_LOGS = [
  '你翻找了一下。锈迹、灰、更多的锈。',
  '手指探进一道缝。空的。',
  '有东西硌了一下手——只是块碎壳。',
  '这里被人翻过了。很久以前。',
  '风从看不见的地方漏进来。',
  '一排编号，褪得只剩三个字符。你记下了。',
]
const FIND_LOG = '缝里卡着个东西。你把它抠了出来：锈蚀弹匣。'
const MOCK_ENEMY = { name: '游荡的壳', hp: 34, maxHp: 60, atk: 12, def: 4 }

const NAR_DELAY = 620 // 因果两拍:nar 落舞台 → 件延迟材质化(ms)
const SEARCH_COMMIT_DELAY = 1000
const STATUS_EXIT_MS = 320
const STATUS_ENTRY_MS = 380
let _lid = 0
const nextId = () => (_lid += 1)

export default function KaleidoAvgView({ onExit, showDevControls = false }) {
  // phase: boot(黑幕冷开场) → awake(觉醒行+搜索) → playing(舞台激活)
  const [phase, setPhase] = useState('boot')
  const [lines, setLines] = useState([]) // 文字舞台:{ id, text, kind:'log'|'nar'|'awake' }
  const [unlocked, setUnlocked] = useState(() => new Set())
  const [flashing, setFlashing] = useState(() => new Set()) // 因果两拍:正在闪 cyan 的件
  const [me, setMe] = useState({ hp: 78, maxHp: 100, atk: 22, def: 9 })
  const [combat, setCombat] = useState(null) // 事件覆盖层:遭遇实例
  const [atRuleGate, setAtRuleGate] = useState(false) // rules_card 门口告示闸门
  const [searchCount, setSearchCount] = useState(0)
  const [turnCount, setTurnCount] = useState(0) // 消耗动作计数；首搜完成后即记为第 1 回合
  const [searchPending, setSearchPending] = useState(false)
  const [seq, setSeq] = useState(1)
  const rootRef = useRef(null)
  const streamRef = useRef(null)
  const statusInlineRef = useRef(null)
  const searchInlineRef = useRef(null)
  const statusSequenceStarted = useRef(false)
  const searchPendingRef = useRef(false)
  const timers = useRef([])
  const [statusStage, setStatusStage] = useState('hidden') // hidden → inline → flying → docked
  const [statusFlight, setStatusFlight] = useState(null)
  const [dialogFramed, setDialogFramed] = useState(false)
  const [dialogDocked, setDialogDocked] = useState(false)

  const isU = (k) => unlocked.has(k)
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.current.push(t); return t }

  const pushLine = useCallback((text, kind = 'log') => {
    setLines((ls) => [...ls, { id: nextId(), text, kind }].slice(-60))
  }, [])

  // 因果两拍:nar 先落舞台(因) → 延迟让对应 UI 件材质化析出(果) + 边框闪 nar 同色
  const revealPiece = useCallback((key, narText) => {
    if (narText) pushLine(narText, 'nar')
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
    later(() => setUnlocked((s) => new Set(s).add('search_btn')), t + 500) // 搜索按钮最后浮现
    return () => { timers.current.forEach(clearTimeout); timers.current = [] }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 舞台贴底自动滚
  useEffect(() => {
    const el = streamRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [dialogDocked, lines])

  const hpUnlocked = isU('hp_bar')

  // 状况读数先向右离屏，再从左侧滑入停靠位；对话框与第一段同时重排。
  useEffect(() => {
    if (!hpUnlocked || statusSequenceStarted.current) return undefined
    statusSequenceStarted.current = true
    setStatusStage('inline')

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frameA = null
    let frameB = null
    let frameC = null
    let frameD = null
    let exitTimer = null
    let entryTimer = null
    const moveDelay = reduced ? 0 : 900

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
        exitLeft: window.innerWidth + 24,
        enterLeft: -targetWidth - 24,
        leg: 'exit-start',
      })
      setStatusStage('flying')
      setDialogFramed(true)
      frameA = window.requestAnimationFrame(() => {
        frameB = window.requestAnimationFrame(() => {
          setStatusFlight((flight) => (flight ? { ...flight, leg: 'exiting' } : flight))
          setDialogDocked(true)

          exitTimer = window.setTimeout(() => {
            setStatusFlight((flight) => (flight ? { ...flight, leg: 'enter-start' } : flight))
            frameC = window.requestAnimationFrame(() => {
              frameD = window.requestAnimationFrame(() => {
                setStatusFlight((flight) => (flight ? { ...flight, leg: 'entering' } : flight))
                entryTimer = window.setTimeout(() => {
                  setStatusStage('docked')
                  setStatusFlight(null)
                }, STATUS_ENTRY_MS + 30)
              })
            })
          }, STATUS_EXIT_MS)
        })
      })
    }, moveDelay)

    return () => {
      window.clearTimeout(moveTimer)
      if (exitTimer) window.clearTimeout(exitTimer)
      if (entryTimer) window.clearTimeout(entryTimer)
      if (frameA) window.cancelAnimationFrame(frameA)
      if (frameB) window.cancelAnimationFrame(frameB)
      if (frameC) window.cancelAnimationFrame(frameC)
      if (frameD) window.cancelAnimationFrame(frameD)
    }
  }, [hpUnlocked])

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
    const n = searchCount + 1
    setSearchCount(n)
    setTurnCount((count) => count + 1)
    if (n === 1) {
      // 首搜:座舱结晶一拍 —— log 醒 + hp_bar(gauge-first) + inventory
      pushLine(SEARCH_LOGS[0], 'log')
      revealPiece('log_panel', NAR.log_panel)
      // gauge-first:hp_bar 先于任何损耗叙事落定(时序法则)
      later(() => revealPiece('hp_bar', NAR.hp_bar), 500)
      // 首物(seq1 保障):抽屉滑出
      later(() => { pushLine(FIND_LOG, 'log'); revealPiece('inventory', NAR.inventory) }, 1600)
    } else {
      pushLine(SEARCH_LOGS[n % SEARCH_LOGS.length], 'log')
      if (n === 3) later(() => pushLine('好像有什么在更深处。', 'log'), 400)
    }
  }

  // ── 动作:遭遇(首战·seq2) ──────────────────────────────────────────────
  function onEncounter() {
    setCombat({ ...MOCK_ENEMY })
    revealPiece('combat_panel', NAR.combat_panel)
  }
  function onStrike() {
    pushLine('你先出手。它踉跄了一下，退回暗处。', 'kill')
    setCombat(null)
  }
  function onFlee() { pushLine('你绕开了它。', 'log'); setCombat(null) }

  // ── 动作:进规则关(rules_card 门口告示闸门·seq2) ────────────────────────
  function onApproachRuleLevel() {
    setAtRuleGate(true)
    revealPiece('rules_card', NAR.rules_card)
  }
  function onEnterRuleLevel() { setAtRuleGate(false); setSeq(2); pushLine('你迈过门口。规矩生效了。', 'system') }

  const searchReady = isU('search_btn')
  const flightRect = wrapFlightRect(statusFlight, statusFlight?.from, statusFlight?.to)
  const actionFlightRect = wrapFlightRect(statusFlight, statusFlight?.actionFrom, statusFlight?.actionTo)

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
            <div key={l.id} className="kaleido-line-in" style={lineStyle(l.kind)}>{l.text}</div>
          ))}

            <div
              ref={statusInlineRef}
              style={{
                minHeight: statusStage === 'inline' || statusStage === 'flying' ? 54 : 0,
                transition: 'min-height 320ms ease',
              }}
            >
              {statusStage === 'inline' && (
                <StatusPanel me={me} flashing={flashing.has('hp_bar')} className="kaleido-materialize" />
              )}
            </div>

            {searchReady && !dialogDocked && (
              <SearchActions
                containerRef={searchInlineRef}
                className="kaleido-materialize"
                style={{ maxWidth: 440, marginTop: 8 }}
                onSearch={onSearch}
                disabled={!!combat || atRuleGate}
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
          className={`kaleido-status-flight is-${statusFlight.leg}`}
          style={{ position: 'fixed', zIndex: 24, top: flightRect.top, left: flightRect.left, width: flightRect.width }}
        />
      )}

      {statusStage === 'flying' && actionFlightRect && (
        <SearchActions
          className={`kaleido-action-flight is-${statusFlight.leg}`}
          style={{ position: 'fixed', zIndex: 23, top: actionFlightRect.top, left: actionFlightRect.left, width: actionFlightRect.width, pointerEvents: 'none' }}
          onSearch={onSearch}
          disabled={!!combat || atRuleGate}
          loading={searchPending}
        />
      )}

      {statusStage === 'docked' && (
        <aside className="kaleido-left-rail">
          <StatusPanel me={me} flashing={flashing.has('hp_bar')} />
          {searchReady && (
            <SearchActions
              className="kaleido-materialize"
              onSearch={onSearch}
              disabled={!!combat || atRuleGate}
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
              <div><div style={{ fontSize: 11, color: T.dimB }}>遭遇</div><div style={{ fontSize: 15, fontWeight: 700, color: T.red }}>{combat.name}</div></div>
            </div>
            <HpBar hp={combat.hp} max={combat.maxHp} h={7} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11 }}>
              <span style={{ color: hpColor(combat.hp, combat.maxHp), fontFamily: 'monospace', fontWeight: 700 }}>HP {combat.hp}/{combat.maxHp}</span>
              <span style={{ color: T.dim }}>ATK {combat.atk} · DEF {combat.def}</span>
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
            <KaleidoRuleCard combatMode={{ template_ref: 'stance_duel', params: { counterMul: 1.6 } }} envRules={[{ rule_key: 'pollution_accel', value: 1.5 }]} formulaOverrides={[]} />
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

function wrapFlightRect(flight, from, to) {
  if (!flight || !from || !to) return null
  if (flight.leg === 'exiting') return { ...from, left: flight.exitLeft }
  if (flight.leg === 'enter-start') return { ...to, left: flight.enterLeft }
  if (flight.leg === 'entering') return to
  return from
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

function StatusPanel({ me, flashing, className = '', style }) {
  const hpPercent = Math.max(0, Math.min(100, Math.round((me.hp / Math.max(me.maxHp, 1)) * 100)))

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5, fontSize: 11 }}>
        <span style={{ color: T.dim }}>状况</span>
        <span style={{ color: hpColor(me.hp, me.maxHp), fontFamily: 'monospace', fontWeight: 700 }}>{hpPercent}%</span>
      </div>
      <HpBar hp={me.hp} max={me.maxHp} h={7} />
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
