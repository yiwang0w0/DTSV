'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/app/_shell/RootShell'
import { Spinner } from '../../admin/_shared/ui'
import { getGameApi, postGameApi } from '@/lib/gameApi'
import { T, Btn, PanelTitle } from '@/app/game/[id]/gameUi'

// ── 网格尺寸（与 server/br/zones.js GRID_W/GRID_H 对齐）────────────────────
const GRID_W = 10
const GRID_H = 10

// 轮询间隔：契约要求 3-5s 拉一次 state（这里取 4s）
const POLL_MS = 4000
// 本地时钟 tick：每秒刷新倒计时显示（不重新请求）
const TICK_MS = 1000

// ── 大时钟本地推算（clock.js 同款公式，应用层计算不落库）──────────────────
// 入参取自 MatchState.match（startedAtMs / phaseSeconds / maxPhase / status）。
// status!=='active' 或 startedAtMs 为 null ⇒ realPhase=0，无倒计时锚点。
// realPhase        = min(maxPhase, floor((now - started) / (phaseSeconds*1000)))
// phaseEndsAtMs    = started + (realPhase+1)*phaseSeconds*1000
// secondsToNext    = ceil((phaseEndsAtMs - now) / 1000)
function computeLocalClock(match, nowMs) {
  const phaseSeconds = match?.phaseSeconds || 0
  const maxPhase = match?.maxPhase ?? 4
  const startedAtMs = match?.startedAtMs ?? null
  const active = match?.status === 'active' && startedAtMs != null

  if (!active || phaseSeconds <= 0) {
    return {
      realPhase: 0,
      maxPhase,
      phaseEndsAtMs: null,
      secondsToNextPhase: null,
      elapsedSeconds: null,
      isEnded: match?.status === 'ended',
    }
  }

  const elapsedMs = Math.max(0, nowMs - startedAtMs)
  const rawPhase = Math.floor(elapsedMs / (phaseSeconds * 1000))
  const realPhase = Math.min(maxPhase, rawPhase)
  const isEnded = realPhase >= maxPhase
  // 已到末段则没有下一阶段
  const phaseEndsAtMs = isEnded ? null : startedAtMs + (realPhase + 1) * phaseSeconds * 1000
  const secondsToNextPhase = phaseEndsAtMs != null ? Math.max(0, Math.ceil((phaseEndsAtMs - nowMs) / 1000)) : null

  return {
    realPhase,
    maxPhase,
    phaseEndsAtMs,
    secondsToNextPhase,
    elapsedSeconds: Math.floor(elapsedMs / 1000),
    isEnded,
  }
}

function fmtCountdown(secs) {
  if (secs == null) return '--:--'
  const s = Math.max(0, secs)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

// 预警窗口：缩圈前若干秒把"下阶段将收缩"的扇区标黄。
// 规则书"缩圈前 3 分钟"：满阶段(900s)→180s；短 dev 局按 25% 比例缩放、下限 5s。
function warnWindowSeconds(phaseSeconds) {
  const ps = Number.isFinite(phaseSeconds) && phaseSeconds > 0 ? phaseSeconds : 900
  return Math.min(180, Math.max(5, Math.round(ps * 0.25)))
}

// 扇区显示态（本地时钟瞬时推算，不等 4s 轮询 → 修复变红延迟 + 提供预警黄）：
//   forbidden = 已收缩（realPhase >= closePhase）
//   warning   = 下一阶段将收缩（closePhase === realPhase+1）且已进入预警窗口
//   open      = 其余
function cellStateFor(room, realPhase, secondsToNext, warnSecs) {
  if (!room) return 'open'
  const cp = Number.isFinite(room.closePhase) ? room.closePhase : 5
  if (realPhase >= cp) return 'forbidden'
  if (cp === realPhase + 1 && secondsToNext != null && secondsToNext <= warnSecs) return 'warning'
  return 'open'
}

const STATUS_META = {
  lobby: { label: '集结中', color: T.yellow },
  active: { label: '进行中', color: T.green },
  ended: { label: '已结束', color: T.dimB },
}

// 物资档位 T1..T5 着色（仅展示）
function lootTierColor(tier) {
  return (
    {
      1: T.dimB,
      2: T.green,
      3: T.cyan,
      4: T.purple,
      5: T.orange,
    }[tier] || T.dim
  )
}

// ── Phase 32 物理态（属性①）展示元数据 ───────────────────────────────────────
// physicalState 来自 grid 房新字段（br_match_room_state.physical_state，按可见性过滤）。
// 与 open/warning/forbidden（属性②禁区，本地时钟驱动）正交叠加——一个房可同时 open+bombed。
// P32 实际只产出 'intact' | 'bombed'（repair 写回 'intact'）；'repaired' 保留为合法值/未来用。
const PHYS_META = {
  bombed: { icon: '💥', label: '已炸毁', color: T.red },
  repaired: { icon: '🔧', label: '已修复', color: T.cyan },
  intact: null, // 完好态不叠加视觉
}

// ── Phase 32 事件流（visibleEvents）类型 → 图标 + 文案 ────────────────────────
// 中性虚拟空间术语；拾取用 Tx 档位色复用 lootTierColor。
const EVENT_META = {
  move: { icon: '➜', verb: '移动至', color: T.dimB },
  loot: { icon: '◆', verb: '搜刮', color: T.green },
  bomb: { icon: '💥', verb: '炸毁', color: T.red },
  repair: { icon: '🔧', verb: '修复', color: T.cyan },
}

// 事件时间戳 → 极简相对/绝对时分（最新动态条用）
function fmtEventClock(atMs) {
  if (!Number.isFinite(atMs)) return ''
  const d = new Date(atMs)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

// ── 单个扇区格子（显示态由本地时钟驱动：open / warning / forbidden）──────────
// Phase 32 加性：
//   physicalState（'intact'|'bombed'|'repaired'）→ 破坏/修复 overlay，正交叠在禁区着色之上。
//   looted → 物资图标置灰 + 删除线，表示该房已被搜空。
//   movable + onMove → 相邻且开放的格：虚线边 + 小箭头，点击触发移动。
function ZoneCell({ room, cellState = 'open', isMine, hasPlayers, physicalState = 'intact', looted = false, movable = false, onMove }) {
  const forbidden = cellState === 'forbidden'
  const warning = cellState === 'warning'
  const bombed = physicalState === 'bombed'
  const repaired = physicalState === 'repaired'
  const phys = PHYS_META[physicalState] || null
  const accent = forbidden ? T.red : warning ? T.yellow : movable ? T.cyan : T.green
  const tierColor = forbidden ? `${T.red}cc` : warning ? T.yellow : lootTierColor(room?.lootTier)
  const stateLabel = forbidden ? '禁区' : warning ? '预警 · 下阶段收缩' : `开放 · 物资档 T${room?.lootTier ?? '-'}`
  const physLine = phys ? `\n物理态：${phys.label}` : ''
  const lootedLine = looted ? '\n物资：已搜空' : ''
  const moveLine = movable ? '\n（点击移动到此扇区）' : ''
  const tip = room
    ? `${room.label}（${room.region}）\n${stateLabel}\n收缩于阶段 ${room.closePhase}${physLine}${lootedLine}${moveLine}`
    : ''

  return (
    <div
      title={tip}
      onClick={movable && onMove ? () => onMove(room.roomId) : undefined}
      role={movable ? 'button' : undefined}
      style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        borderRadius: 4,
        // 物理态 bombed 叠暗红裂纹底；否则沿用禁区/预警/开放底色
        background: bombed
          ? `${T.red}18`
          : forbidden ? `${T.red}10` : warning ? `${T.yellow}1c` : `${T.green}14`,
        // movable 用虚线 cyan 边（可点提示）；我所在格实线 cyan；其余按态
        border: isMine
          ? `2px solid ${T.cyan}`
          : movable
            ? `1px dashed ${T.cyan}aa`
            : `1px solid ${accent}${warning ? '66' : '40'}`,
        boxShadow: isMine
          ? `0 0 8px ${T.cyan}80`
          : movable ? `0 0 5px ${T.cyan}44` : warning ? `0 0 6px ${T.yellow}55` : 'none',
        animation: warning && !isMine ? 'brPulse 1.2s ease-in-out infinite' : 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 9,
        fontFamily: 'var(--font-jetbrains-mono), monospace',
        color: tierColor,
        cursor: movable ? 'pointer' : 'default',
        transition: 'background .25s, border-color .25s, box-shadow .25s',
        overflow: 'hidden',
      }}
    >
      {/* 主标：禁区✕ / 预警⚠ / 否则 T 档（looted 置灰 + 删除线）*/}
      {forbidden ? (
        <span style={{ opacity: 0.65, fontSize: 11, lineHeight: 1 }}>✕</span>
      ) : (
        <span
          style={{
            fontWeight: 700,
            lineHeight: 1,
            color: looted ? T.dim : undefined,
            opacity: looted ? 0.5 : 1,
            textDecoration: looted ? 'line-through' : 'none',
          }}
        >
          {warning ? '⚠' : `T${room?.lootTier ?? '-'}`}
        </span>
      )}

      {/* 物理态角标：bombed💥(红) / repaired🔧(cyan)，左上角，叠在禁区态之上 */}
      {phys && (
        <span
          style={{
            position: 'absolute',
            top: 1,
            left: 2,
            fontSize: 9,
            lineHeight: 1,
            filter: bombed ? `drop-shadow(0 0 3px ${T.red})` : 'none',
          }}
        >
          {phys.icon}
        </span>
      )}

      {/* bombed 裂纹叠层：暗红对角，不挡主标 */}
      {bombed && (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: `repeating-linear-gradient(135deg, transparent 0 6px, ${T.red}22 6px 7px)`,
          }}
        />
      )}

      {/* movable 小箭头：右下角，提示可移入 */}
      {movable && !isMine && (
        <span style={{ position: 'absolute', bottom: 1, right: 2, fontSize: 8, color: `${T.cyan}cc`, lineHeight: 1 }}>➜</span>
      )}

      {/* 该格有玩家：右上角圆点；我所在格用 cyan，他人用 dimB */}
      {hasPlayers && (
        <span
          style={{
            position: 'absolute',
            top: 2,
            right: 3,
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: isMine ? T.cyan : T.dimB,
            boxShadow: isMine ? `0 0 4px ${T.cyan}` : 'none',
          }}
        />
      )}
    </div>
  )
}

// ── 统计小卡 ───────────────────────────────────────────────────────────────
function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 56 }}>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: color || T.text,
          fontFamily: 'var(--font-jetbrains-mono), monospace',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 10, color: T.dim, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </div>
    </div>
  )
}

// ── 动作浮层提示（搜刮/炸毁/修复/移动后的 message 反馈）────────────────────────
// 轻量短驻留：tone 决定色（ok=green / warn=yellow / err=red / info=cyan）。
function ActionToast({ toast }) {
  if (!toast) return null
  const color =
    toast.tone === 'err' ? T.red : toast.tone === 'warn' ? T.yellow : toast.tone === 'ok' ? T.green : T.cyan
  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 28,
        transform: 'translateX(-50%)',
        zIndex: 50,
        padding: '10px 18px',
        borderRadius: 10,
        background: `${T.bg2}f2`,
        border: `1px solid ${color}66`,
        color,
        fontSize: 13,
        fontWeight: 600,
        boxShadow: `0 6px 24px ${T.bg0}cc, 0 0 16px ${color}33`,
        maxWidth: '90vw',
        pointerEvents: 'none',
      }}
    >
      {toast.text}
    </div>
  )
}

export default function BRMatchPage() {
  const { matchId: matchIdParam } = useParams()
  const matchId = Number(matchIdParam)
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [state, setState] = useState(null) // 整个 MatchState
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  // Phase 32：动作进行中标识（禁双击 + 按钮 loading）+ 动作浮层提示
  const [busyAction, setBusyAction] = useState(null) // 'move'|'search'|'bomb'|'repair'|null
  const [toast, setToast] = useState(null) // { text, tone }

  const pollingRef = useRef(false) // 防重入（照 rooms 页 loadingRef 模式）
  const joinedRef = useRef(false) // 仅尝试 join 一次
  const toastTimerRef = useRef(null) // 浮层自动消失计时器

  // 拉一次 state（轮询用，不阻塞渲染）
  const fetchState = useCallback(async () => {
    if (pollingRef.current) return
    if (!Number.isFinite(matchId)) return
    pollingRef.current = true
    try {
      const data = await getGameApi(`/api/br?action=state&matchId=${matchId}`)
      setState(data)
      setError(null)
    } catch (err) {
      setError(err?.message || '加载对局失败')
    } finally {
      pollingRef.current = false
      setLoading(false)
    }
  }, [matchId])

  // 弹出浮层提示（短驻留 2.6s；新提示覆盖旧计时器）
  const showToast = useCallback((text, tone = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ text, tone })
    toastTimerRef.current = setTimeout(() => setToast(null), 2600)
  }, [])

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
  }, [])

  // ── Phase 32 四动作统一调用 ────────────────────────────────────────────────
  // 经 gameApi POST /api/br → 取 message/结果做即时 toast，再 fetchState 刷新权威态。
  // 合法性全由服务端校验（move 校相邻+目标开放，search/bomb/repair 作用当前房）；
  // 客户端仅做乐观提示，不自行判定成败。
  const runAction = useCallback(
    async (action, extra = {}) => {
      if (!Number.isFinite(matchId)) return
      if (busyAction) return // 串行：一次只跑一个动作
      setBusyAction(action)
      try {
        const res = await postGameApi('/api/br', { action, matchId, ...extra })
        // 各动作的即时反馈（权威态仍以下一次 fetchState 为准）
        if (action === 'move') {
          showToast('已移动到目标扇区', 'ok')
        } else if (action === 'search') {
          if (res?.looted && res?.item) {
            showToast(`搜刮到「${res.item.itemName}」（T${res.item.tier}）`, 'ok')
          } else {
            // looted:false 不是错误，是守恒语义「二次搜刮为空」
            showToast('该扇区已被搜空', 'warn')
          }
        } else if (action === 'bomb') {
          showToast(res?.applied === false ? '已记录炸毁（物理态由更晚动作占据）' : '已炸毁当前扇区', 'ok')
        } else if (action === 'repair') {
          showToast(res?.applied === false ? '已记录修复（物理态由更晚动作占据）' : '已修复当前扇区', 'ok')
        }
        await fetchState()
      } catch (err) {
        showToast(err?.message || '动作失败', 'err')
      } finally {
        setBusyAction(null)
      }
    },
    [matchId, busyAction, fetchState, showToast],
  )

  // 挂载：先 join（幂等），再首拉 + 起轮询
  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setLoading(false)
      return
    }
    if (!Number.isFinite(matchId)) {
      setError('无效的对局编号')
      setLoading(false)
      return
    }

    let interval = null
    let cancelled = false

    async function boot() {
      // join 一次（已加入则后端幂等返回现有行）；失败不阻塞看局
      if (!joinedRef.current) {
        joinedRef.current = true
        try {
          await postGameApi('/api/br', { action: 'join', matchId })
        } catch (err) {
          // join 失败（如已结束）仍尝试读 state 展示
          setError(err?.message || null)
        }
      }
      if (cancelled) return
      await fetchState()
      if (cancelled) return
      interval = setInterval(fetchState, POLL_MS)
    }

    boot()
    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
    }
  }, [authLoading, user, matchId, fetchState])

  // 本地时钟：每秒推进 now，使倒计时自走（不重新请求）
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [])

  // 本地推算的权威时钟（server 每次轮询校正 match.startedAtMs，本地按秒细化）
  const clock = useMemo(() => computeLocalClock(state?.match, nowMs), [state?.match, nowMs])

  const match = state?.match
  // 稳定引用：仅在 state 变化时重建（nowMs 每秒 tick 不应抖动下游 memo）
  const grid = useMemo(() => state?.grid || [], [state?.grid])
  const players = useMemo(() => state?.players || [], [state?.players])
  const me = state?.me || null
  const counts = state?.counts || null

  // 末段（最后一个阶段）：标记“末路”
  const maxPhase = match?.maxPhase ?? 4
  const isFinalPhase = clock.realPhase >= maxPhase && match?.status === 'active'
  const statusMeta = STATUS_META[match?.status] || STATUS_META.lobby

  // 网格按 gridX/gridY 摆位（10×10）；roomId 落位用 grid 的坐标，缺位留空
  const cellByXY = useMemo(() => {
    const m = new Map()
    for (const r of grid) m.set(`${r.gridX},${r.gridY}`, r)
    return m
  }, [grid])

  // 每格是否有玩家（按 roomId 聚合）
  const roomHasPlayer = useMemo(() => {
    const s = new Set()
    for (const p of players) if (p.roomId != null && p.alive !== false) s.add(p.roomId)
    return s
  }, [players])

  const myRoomId = me?.roomId ?? null
  const myRoom = useMemo(
    () => (myRoomId != null ? grid.find(r => r.roomId === myRoomId) : null),
    [grid, myRoomId],
  )

  // Phase 32 顶层新增：事件流（最新在前，由服务端按可见性过滤后下发）
  const visibleEvents = useMemo(() => state?.visibleEvents || [], [state?.visibleEvents])
  // Phase 32 me 新增：背包（搜刮所得物资，仅 me 暴露）
  const inventory = useMemo(() => me?.inventory || [], [me?.inventory])

  // 预警窗口（随 phase_seconds 缩放；满阶段=3min，短 dev 局按比例）
  const warningSeconds = useMemo(() => warnWindowSeconds(match?.phaseSeconds), [match?.phaseSeconds])

  // 扇区显示态全部由"本地时钟"瞬时推算（不等 4s 轮询）→ 修复变红延迟 + 提供预警黄。
  const localZone = useMemo(() => {
    let forbidden = 0
    let warning = 0
    for (const r of grid) {
      const st = cellStateFor(r, clock.realPhase, clock.secondsToNextPhase, warningSeconds)
      if (st === 'forbidden') forbidden++
      else if (st === 'warning') warning++
    }
    return { open: grid.length - forbidden, forbidden, warning }
  }, [grid, clock.realPhase, clock.secondsToNextPhase, warningSeconds])

  const openCount = localZone.open
  const forbiddenCount = localZone.forbidden
  const warningCount = localZone.warning
  const aliveCount = counts?.alive ?? players.filter(p => p.alive !== false).length

  // 我所在扇区的本地显示态（侧栏用）
  const myRoomState = myRoom ? cellStateFor(myRoom, clock.realPhase, clock.secondsToNextPhase, warningSeconds) : null

  // 我是否可行动：在局 + 存活 + 对局进行中（gating 动作条与移动高亮）
  const canAct = !!me && me.alive !== false && match?.status === 'active'

  // ── Phase 32 可移动目标集合（前端预判高亮，合法性以服务端为准）──────────────
  // 规则：myRoom.neighborIds 中、本地显示态非 forbidden（禁区）的房可点移入。
  // 服务端 move 会再校验「相邻 + 目标在有效阶段开放」，此处仅做可视化提示。
  const movableRoomIds = useMemo(() => {
    const s = new Set()
    if (!canAct || !myRoom || !Array.isArray(myRoom.neighborIds)) return s
    const byId = new Map(grid.map(r => [r.roomId, r]))
    for (const nid of myRoom.neighborIds) {
      const r = byId.get(nid)
      if (!r) continue
      const st = cellStateFor(r, clock.realPhase, clock.secondsToNextPhase, warningSeconds)
      if (st !== 'forbidden') s.add(nid) // 开放/预警均可移入（预警仍开放，仅将收缩）
    }
    return s
  }, [canAct, myRoom, grid, clock.realPhase, clock.secondsToNextPhase, warningSeconds])

  // 移动处理：点击可移动格 → runAction('move', { toRoomId })
  const handleMove = useCallback(
    (toRoomId) => {
      if (toRoomId == null) return
      runAction('move', { toRoomId })
    },
    [runAction],
  )

  // ── 渲染分支 ───────────────────────────────────────────────────────────
  if (!authLoading && !user) {
    return (
      <div className="animate-in" style={{ textAlign: 'center', padding: 60 }}>
        <p style={{ color: '#8b949e', fontSize: 16 }}>
          请先 <Link href="/login" style={{ color: '#58a6ff' }}>登录</Link> 后进入虚拟空间对局
        </p>
      </div>
    )
  }

  if (loading || authLoading) return <Spinner />

  if (!state && error) {
    return (
      <div className="animate-in" style={{ textAlign: 'center', padding: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🛰️</div>
        <p style={{ color: T.red, fontSize: 15, marginBottom: 16 }}>{error}</p>
        <Btn variant="ghost" onClick={() => router.push('/br')}>返回大厅</Btn>
      </div>
    )
  }

  return (
    <div className="animate-in" style={{ color: T.text }}>
      {/* 顶部：返回 + 标题 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
            虚拟空间对局 <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', color: T.cyan }}>#{matchId}</span>
          </h2>
          <span
            style={{
              padding: '2px 10px',
              borderRadius: 20,
              fontSize: 10,
              fontWeight: 700,
              background: `${statusMeta.color}18`,
              color: statusMeta.color,
            }}
          >
            {statusMeta.label}
          </span>
        </div>
        <Link href="/br" style={{ fontSize: 12, color: T.dimB, textDecoration: 'none' }}>← 返回大厅</Link>
      </div>

      {error && state && (
        <div style={{ marginBottom: 12, fontSize: 11, color: T.yellow }}>⚠ {error}</div>
      )}

      {/* ── 大时钟 HUD ─────────────────────────────────────────────────── */}
      <div
        style={{
          background: `linear-gradient(180deg, ${T.bg2} 0%, ${T.bg1} 100%)`,
          border: `1px solid ${isFinalPhase ? `${T.red}55` : T.borderB}`,
          borderRadius: 14,
          padding: '20px 24px',
          marginBottom: 20,
          boxShadow: isFinalPhase ? `0 0 24px ${T.red}22` : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          {/* 当前阶段 N/4 */}
          <div>
            <div style={{ fontSize: 10, color: T.dim, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>
              当前阶段
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span
                style={{
                  fontSize: 52,
                  fontWeight: 800,
                  lineHeight: 1,
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  color: isFinalPhase ? T.red : T.cyan,
                  textShadow: `0 0 18px ${isFinalPhase ? T.red : T.cyan}55`,
                }}
              >
                {clock.realPhase}
              </span>
              <span style={{ fontSize: 22, color: T.dim, fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
                / {maxPhase}
              </span>
            </div>
          </div>

          {/* 倒计时 / 末路提示 */}
          <div style={{ textAlign: 'center', flex: 1, minWidth: 200 }}>
            {match?.status !== 'active' ? (
              <div style={{ fontSize: 14, color: T.dimB }}>
                {match?.status === 'ended' ? '对局已结束' : '等待大时钟启动…'}
              </div>
            ) : isFinalPhase ? (
              <div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: T.red,
                    letterSpacing: '2px',
                    textShadow: `0 0 16px ${T.red}66`,
                    animation: 'brPulse 1.4s ease-in-out infinite',
                  }}
                >
                  末路阶段
                </div>
                <div style={{ fontSize: 11, color: `${T.red}cc`, marginTop: 4 }}>
                  收缩边界已达最终态 · 仅余 {openCount} 个开放扇区
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 10, color: T.dim, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>
                  距下次收缩
                </div>
                <div
                  style={{
                    fontSize: 40,
                    fontWeight: 800,
                    lineHeight: 1,
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    color: (clock.secondsToNextPhase ?? 999) <= warningSeconds ? T.yellow : T.text,
                    textShadow: (clock.secondsToNextPhase ?? 999) <= warningSeconds ? `0 0 14px ${T.yellow}44` : 'none',
                  }}
                >
                  {fmtCountdown(clock.secondsToNextPhase)}
                </div>
                {(clock.secondsToNextPhase ?? 999) <= warningSeconds && (
                  <div style={{ fontSize: 11, color: T.yellow, marginTop: 4 }}>
                    ⚠ 收缩警报 · {warningCount} 个扇区即将收缩（推进至阶段 {Math.min(maxPhase, clock.realPhase + 1)}）
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 扇区/玩家计数 */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Stat label="开放" value={openCount} color={T.green} />
            {warningCount > 0 && <Stat label="预警" value={warningCount} color={T.yellow} />}
            <Stat label="禁区" value={forbiddenCount} color={T.red} />
            <div style={{ width: 1, height: 36, background: T.border }} />
            <Stat label="存活" value={aliveCount} color={T.cyan} />
            <Stat label="玩家" value={players.length} color={T.text} />
          </div>
        </div>
      </div>

      {/* ── 主区：网格 + 侧栏 ───────────────────────────────────────────── */}
      <div className="br-grid-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 260px', gap: 16, alignItems: 'start' }}>
        {/* 100 房网格（10×10）*/}
        <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <PanelTitle right={<span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>阶段 {clock.realPhase} 禁区图</span>}>
            扇区网格 {GRID_W}×{GRID_H}
          </PanelTitle>
          <div style={{ padding: 14 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${GRID_W}, 1fr)`,
                gap: 4,
              }}
            >
              {Array.from({ length: GRID_H }).map((_, y) =>
                Array.from({ length: GRID_W }).map((_, x) => {
                  const room = cellByXY.get(`${x},${y}`)
                  const isMine = room != null && room.roomId === myRoomId
                  const hasPlayers = room != null && roomHasPlayer.has(room.roomId)
                  const cellState = cellStateFor(room, clock.realPhase, clock.secondsToNextPhase, warningSeconds)
                  // Phase 32：物理态叠加 + 可移动高亮
                  const movable = room != null && movableRoomIds.has(room.roomId)
                  return (
                    <ZoneCell
                      key={`${x},${y}`}
                      room={room}
                      cellState={cellState}
                      isMine={isMine}
                      hasPlayers={hasPlayers}
                      physicalState={room?.physicalState || 'intact'}
                      looted={room?.looted === true}
                      movable={movable}
                      onMove={handleMove}
                    />
                  )
                }),
              )}
            </div>
            {/* 图例 */}
            <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap', fontSize: 10, color: T.dim }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: `${T.green}20`, border: `1px solid ${T.green}40` }} /> 开放（标 T 档）
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: `${T.yellow}1c`, border: `1px solid ${T.yellow}66` }} /> 预警（下阶段收缩）
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: `${T.red}14`, border: `1px solid ${T.red}40` }} /> 禁区
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, border: `2px solid ${T.cyan}` }} /> 我的扇区
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, border: `1px dashed ${T.cyan}aa` }} /> 可移动（相邻）
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 11, lineHeight: 1 }}>💥</span> 已炸毁
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ textDecoration: 'line-through', opacity: 0.55 }}>T-</span> 已搜空
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.dimB }} /> 有玩家
              </span>
            </div>
          </div>
        </div>

        {/* 侧栏：我的状态 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <PanelTitle>我的状态</PanelTitle>
            <div style={{ padding: 16 }}>
              {me ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 12, color: T.dim }}>所在扇区</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.cyan, fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
                      {myRoom?.label || (myRoomId != null ? `#${myRoomId}` : '—')}
                    </span>
                  </div>
                  {myRoom && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontSize: 12, color: T.dim }}>区段</span>
                      <span style={{ fontSize: 12, color: T.text }}>{myRoom.region}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 12, color: T.dim }}>当前扇区状态</span>
                    {myRoom ? (
                      <span style={{ fontSize: 12, fontWeight: 700, color: myRoomState === 'forbidden' ? T.red : myRoomState === 'warning' ? T.yellow : T.green }}>
                        {myRoomState === 'forbidden' ? '禁区' : myRoomState === 'warning' ? `预警 · T${myRoom.lootTier}` : `开放 · T${myRoom.lootTier}`}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: T.dim }}>—</span>
                    )}
                  </div>

                  {/* 深度（Phase 31 恒 0）*/}
                  <div
                    style={{
                      marginTop: 6,
                      padding: '12px 14px',
                      borderRadius: 10,
                      background: T.bg2,
                      border: `1px solid ${T.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 10, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.5px' }}>跳跃深度</div>
                      <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>
                        有效阶段 = {clock.realPhase} + {me.depth ?? 0}
                      </div>
                    </div>
                    <span style={{ fontSize: 30, fontWeight: 800, color: T.purple, fontFamily: 'var(--font-jetbrains-mono), monospace', lineHeight: 1 }}>
                      {me.depth ?? 0}
                    </span>
                  </div>

                  {/* HP（骨架展示）*/}
                  {me.maxHp != null && (
                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: T.dim }}>生命</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: me.alive === false ? T.red : T.green, fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
                        {me.alive === false ? '阵亡' : `${me.hp ?? '—'} / ${me.maxHp}`}
                      </span>
                    </div>
                  )}

                  {/* ── Phase 32 当前扇区动作条：搜刮 / 炸毁 / 修复 ───────────────── */}
                  {/* 作用于当前房；搜刮在房已搜空时 disabled。合法性服务端为准。*/}
                  <div style={{ marginTop: 14, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
                    <div style={{ fontSize: 10, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                      扇区动作
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                      <Btn
                        variant="primary"
                        size="sm"
                        loading={busyAction === 'search'}
                        loadingText="搜刮中"
                        disabled={!canAct || myRoom?.looted === true || (busyAction != null && busyAction !== 'search')}
                        onClick={() => runAction('search')}
                      >
                        {myRoom?.looted === true ? '已搜空' : '搜刮'}
                      </Btn>
                      <Btn
                        variant="danger"
                        size="sm"
                        loading={busyAction === 'bomb'}
                        loadingText="炸毁中"
                        disabled={!canAct || (busyAction != null && busyAction !== 'bomb')}
                        onClick={() => runAction('bomb')}
                      >
                        炸毁
                      </Btn>
                      <Btn
                        variant="warn"
                        size="sm"
                        loading={busyAction === 'repair'}
                        loadingText="修复中"
                        disabled={!canAct || (busyAction != null && busyAction !== 'repair')}
                        onClick={() => runAction('repair')}
                      >
                        修复
                      </Btn>
                    </div>
                    <div style={{ fontSize: 10, color: T.dim, marginTop: 8, lineHeight: 1.5 }}>
                      {!canAct
                        ? me.alive === false
                          ? '已阵亡，无法行动。'
                          : match?.status === 'active'
                            ? '等待进入对局…'
                            : '对局未进行中。'
                        : '点击网格中虚线高亮的相邻扇区可移动。'}
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.6 }}>
                  尚未进入该对局。
                  <div style={{ marginTop: 10 }}>
                    <Btn
                      variant="primary"
                      size="sm"
                      onClick={async () => {
                        try {
                          await postGameApi('/api/br', { action: 'join', matchId })
                          await fetchState()
                        } catch (err) {
                          setError(err?.message || '加入失败')
                        }
                      }}
                    >
                      加入对局
                    </Btn>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Phase 32 背包：me.inventory（搜刮所得物资，仅 me 可见）──────────── */}
          {me && (
            <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <PanelTitle right={<span style={{ fontWeight: 400 }}>{inventory.length}</span>}>背包</PanelTitle>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {inventory.length === 0 ? (
                  <div style={{ padding: 14, fontSize: 12, color: T.dim }}>暂无物资 · 搜刮开放扇区获取</div>
                ) : (
                  inventory.map((it, i) => {
                    const c = lootTierColor(it.tier)
                    return (
                      <div
                        key={`${it.itemId || 'item'}-${i}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 14px',
                          borderBottom: `1px solid ${T.border}`,
                          fontSize: 12,
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                          <span style={{ width: 6, height: 6, borderRadius: 2, flexShrink: 0, background: c, boxShadow: `0 0 5px ${c}88` }} />
                          <span style={{ color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {it.itemName || it.itemId || '未知物资'}
                          </span>
                        </span>
                        <span style={{ color: c, fontFamily: 'var(--font-jetbrains-mono), monospace', flexShrink: 0, fontWeight: 700 }}>
                          T{it.tier ?? '-'}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {/* ── Phase 32 事件流：visibleEvents（最新在上，服务端按可见性过滤）────── */}
          <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <PanelTitle right={<span style={{ fontWeight: 400 }}>{visibleEvents.length}</span>}>最近动态</PanelTitle>
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              {visibleEvents.length === 0 ? (
                <div style={{ padding: 14, fontSize: 12, color: T.dim }}>暂无动态</div>
              ) : (
                visibleEvents.map(ev => {
                  const meta = EVENT_META[ev.type] || { icon: '·', verb: ev.type, color: T.dimB }
                  const who = ev.isMine ? '你' : `玩家 ${String(ev.actorId || '').slice(0, 6)}`
                  const roomName = ev.roomLabel || (ev.roomId != null ? `#${ev.roomId}` : '')
                  // 各类型文案：移动至X / 搜刮X(拾Tn) / 炸毁X / 修复X
                  let detail = null
                  if (ev.type === 'loot') {
                    const tier = ev.payload?.tier
                    const itemName = ev.payload?.itemName
                    detail = (
                      <>
                        {itemName ? `「${itemName}」` : ''}
                        {Number.isFinite(tier) && (
                          <span style={{ color: lootTierColor(tier), fontWeight: 700, marginLeft: 4 }}>T{tier}</span>
                        )}
                      </>
                    )
                  }
                  return (
                    <div
                      key={ev.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        padding: '8px 12px',
                        borderBottom: `1px solid ${T.border}`,
                        fontSize: 12,
                        background: ev.isMine ? `${T.cyan}08` : 'transparent',
                      }}
                    >
                      <span style={{ fontSize: 12, lineHeight: 1.4, flexShrink: 0, color: meta.color }}>{meta.icon}</span>
                      <span style={{ minWidth: 0, flex: 1, lineHeight: 1.45 }}>
                        <span style={{ color: ev.isMine ? T.cyan : T.text, fontWeight: ev.isMine ? 700 : 500 }}>{who}</span>
                        <span style={{ color: T.dimB }}> {meta.verb} </span>
                        <span style={{ color: meta.color }}>{roomName}</span>
                        {detail}
                      </span>
                      <span style={{ fontSize: 9, color: T.dim, fontFamily: 'var(--font-jetbrains-mono), monospace', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        <span title={`落库阶段 ${ev.clockPhase}`}>P{ev.clockPhase}</span>
                        {Number.isFinite(ev.atMs) && <span style={{ display: 'block', opacity: 0.7 }}>{fmtEventClock(ev.atMs)}</span>}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* 玩家名单（骨架）*/}
          <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <PanelTitle right={<span style={{ fontWeight: 400 }}>{players.length}</span>}>玩家</PanelTitle>
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {players.length === 0 ? (
                <div style={{ padding: 16, fontSize: 12, color: T.dim }}>暂无玩家</div>
              ) : (
                players.map(p => (
                  <div
                    key={p.userId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 14px',
                      borderBottom: `1px solid ${T.border}`,
                      fontSize: 12,
                      background: p.isMe ? `${T.cyan}0c` : 'transparent',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          flexShrink: 0,
                          background: p.alive === false ? T.red : T.green,
                        }}
                      />
                      <span style={{ color: p.isMe ? T.cyan : T.text, fontWeight: p.isMe ? 700 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.isMe ? '你' : `玩家 ${String(p.userId || '').slice(0, 6)}`}
                      </span>
                    </span>
                    <span style={{ color: T.dim, fontFamily: 'var(--font-jetbrains-mono), monospace', flexShrink: 0 }}>
                      深度 {p.depth ?? 0}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Phase 32 动作浮层提示（搜刮/炸毁/修复/移动结果）*/}
      <ActionToast toast={toast} />

      <style>{`
        @keyframes brPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }
        @media (max-width: 820px) {
          .br-grid-split { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
