'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '../../layout'
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

// ── 单个扇区格子 ───────────────────────────────────────────────────────────
function ZoneCell({ room, isMine, hasPlayers }) {
  const open = !!room?.open
  const base = open ? T.green : T.red
  const tierColor = open ? lootTierColor(room.lootTier) : T.red
  const tip = room
    ? `${room.label}（${room.region}）\n${open ? `开放 · 物资档 T${room.lootTier}` : '禁区'}\n收缩于阶段 ${room.closePhase}`
    : ''

  return (
    <div
      title={tip}
      style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        borderRadius: 4,
        background: open ? `${base}14` : `${base}10`,
        border: isMine ? `2px solid ${T.cyan}` : `1px solid ${base}40`,
        boxShadow: isMine ? `0 0 8px ${T.cyan}80` : 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 9,
        fontFamily: 'var(--font-jetbrains-mono), monospace',
        color: open ? tierColor : `${T.red}cc`,
        cursor: 'default',
        transition: 'background .25s, border-color .25s, box-shadow .25s',
        overflow: 'hidden',
      }}
    >
      {open ? (
        <span style={{ fontWeight: 700, lineHeight: 1 }}>T{room?.lootTier ?? '-'}</span>
      ) : (
        <span style={{ opacity: 0.65, fontSize: 11, lineHeight: 1 }}>✕</span>
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

export default function BRMatchPage() {
  const { matchId: matchIdParam } = useParams()
  const matchId = Number(matchIdParam)
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [state, setState] = useState(null) // 整个 MatchState
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const pollingRef = useRef(false) // 防重入（照 rooms 页 loadingRef 模式）
  const joinedRef = useRef(false) // 仅尝试 join 一次

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

  // 开放/禁区计数：优先用 server counts，否则本地从 grid 推
  const openCount = counts?.open ?? grid.filter(r => r.open).length
  const forbiddenCount = counts?.forbidden ?? grid.filter(r => !r.open).length
  const aliveCount = counts?.alive ?? players.filter(p => p.alive !== false).length

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
                    color: (clock.secondsToNextPhase ?? 999) <= 180 ? T.yellow : T.text,
                    textShadow: (clock.secondsToNextPhase ?? 999) <= 180 ? `0 0 14px ${T.yellow}44` : 'none',
                  }}
                >
                  {fmtCountdown(clock.secondsToNextPhase)}
                </div>
                {(clock.secondsToNextPhase ?? 999) <= 180 && (
                  <div style={{ fontSize: 11, color: T.yellow, marginTop: 4 }}>
                    ⚠ 收缩警报 · 边界即将推进至阶段 {Math.min(maxPhase, clock.realPhase + 1)}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 扇区/玩家计数 */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Stat label="开放" value={openCount} color={T.green} />
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
                  return (
                    <ZoneCell
                      key={`${x},${y}`}
                      room={room}
                      isMine={isMine}
                      hasPlayers={hasPlayers}
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
                <span style={{ width: 10, height: 10, borderRadius: 2, background: `${T.red}14`, border: `1px solid ${T.red}40` }} /> 禁区
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, border: `2px solid ${T.cyan}` }} /> 我的扇区
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
                      <span style={{ fontSize: 12, fontWeight: 700, color: myRoom.open ? T.green : T.red }}>
                        {myRoom.open ? `开放 · T${myRoom.lootTier}` : '禁区'}
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

      <style>{`
        @keyframes brPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }
        @media (max-width: 820px) {
          .br-grid-split { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
