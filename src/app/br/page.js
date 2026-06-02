'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '../layout'
import { Spinner } from '../admin/_shared/ui'
import { T, Btn, PanelTitle } from '@/app/game/[id]/gameUi'
import { getGameApi, postGameApi } from '@/lib/gameApi'

// ── 大时钟纯计算（与 src/lib/server/br/clock.js 同款公式，本地 tick 用） ──
// realPhase = (active && started) ? min(maxPhase, floor((now-started)/phase_ms)) : 0
const PHASE_SECONDS_DEFAULT = 900
const MIN_PHASE_SECONDS = 5
const MAX_PHASE_DEFAULT = 4

function localClock(m, nowMs = Date.now()) {
  const phaseSeconds = m.phaseSeconds || PHASE_SECONDS_DEFAULT
  const maxPhase = m.maxPhase ?? MAX_PHASE_DEFAULT
  if (m.status !== 'active' || !m.startedAtMs) {
    return { realPhase: 0, secondsToNextPhase: null, isEnded: m.status === 'ended' }
  }
  const phaseMs = phaseSeconds * 1000
  const elapsed = nowMs - m.startedAtMs
  const realPhase = Math.min(maxPhase, Math.max(0, Math.floor(elapsed / phaseMs)))
  const isEnded = realPhase >= maxPhase
  const phaseEndsAtMs = m.startedAtMs + (realPhase + 1) * phaseMs
  const secondsToNextPhase = isEnded ? null : Math.max(0, Math.ceil((phaseEndsAtMs - nowMs) / 1000))
  return { realPhase, secondsToNextPhase, isEnded }
}

function mmss(secs) {
  if (secs == null) return '—'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatCreated(ms) {
  if (!ms) return '—'
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const STATUS_META = {
  lobby:  { label: '集结中', color: T.yellow },
  active: { label: '运行中', color: T.green },
  ended:  { label: '已结束', color: T.dimB },
}

export default function BRLobbyPage() {
  const { user } = useAuth()
  const router = useRouter()

  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // 建房表单（允许较短 phase_seconds 便于走查）
  const [phaseSeconds, setPhaseSeconds] = useState(PHASE_SECONDS_DEFAULT)
  const [maxPhase, setMaxPhase] = useState(MAX_PHASE_DEFAULT)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)

  const [joining, setJoining] = useState(null) // matchId 正在加入

  const [nowMs, setNowMs] = useState(() => Date.now())
  const loadingRef = useRef(false)

  const loadMatches = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const data = await getGameApi('/api/br?action=list&status=openable')
      setMatches(Array.isArray(data?.matches) ? data.matches : [])
      setError(null)
    } catch (err) {
      setError(err?.message || '无法读取对局列表')
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [])

  // 初次加载 + 每 5s 刷新列表
  useEffect(() => {
    if (!user) return
    loadMatches()
    const poll = setInterval(loadMatches, 5000)
    return () => clearInterval(poll)
  }, [user, loadMatches])

  // 本地 1s tick，仅用于驱动 active 对局的倒计时展示（不重新请求）
  useEffect(() => {
    const tick = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  async function handleCreate() {
    if (creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const ps = Math.max(MIN_PHASE_SECONDS, Number(phaseSeconds) || PHASE_SECONDS_DEFAULT)
      const mp = Math.max(1, Number(maxPhase) || MAX_PHASE_DEFAULT)
      const res = await postGameApi('/api/br', { action: 'create', phaseSeconds: ps, maxPhase: mp })
      const matchId = res?.matchId
      if (matchId != null) {
        // 对局页挂载时会自动 join；直接进入
        router.push(`/br/${matchId}`)
      } else {
        setCreateError('未能创建对局')
        setCreating(false)
      }
    } catch (err) {
      setCreateError(err?.message || '创建失败，请稍后再试')
      setCreating(false)
    }
  }

  async function handleJoin(matchId) {
    if (joining != null) return
    setJoining(matchId)
    try {
      await postGameApi('/api/br', { action: 'join', matchId })
      router.push(`/br/${matchId}`)
    } catch (err) {
      setError(err?.message || '加入失败，请稍后再试')
      setJoining(null)
    }
  }

  if (!user) {
    return (
      <div className="animate-in" style={{ textAlign: 'center', padding: 60 }}>
        <p style={{ color: T.dimB, fontSize: 16 }}>
          请先 <Link href="/login" style={{ color: T.cyan }}>登录</Link> 后进入虚拟空间
        </p>
      </div>
    )
  }

  if (loading) return <Spinner />

  return (
    <div className="animate-in" style={{ color: T.text }}>
      {/* 标题 */}
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.text }}>虚拟空间</h2>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: T.dimB, lineHeight: 1.6 }}>
          单一共享世界、单一大时钟。每个阶段过去，禁区表收缩、更多扇区落入禁区。
          建立或加入一场对局，按真实世界时钟推进。
        </p>
      </div>

      {/* 建房面板 */}
      <div style={{
        background: T.bg2,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        marginBottom: 24,
        overflow: 'hidden',
      }}>
        <PanelTitle>建立对局</PanelTitle>
        <div style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="阶段时长（秒）" hint="走查可填 30 以加速大时钟">
              <input
                type="number"
                min={MIN_PHASE_SECONDS}
                value={phaseSeconds}
                onChange={e => setPhaseSeconds(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="阶段数 (max_phase)" hint="缩圈推进的总阶段数">
              <input
                type="number"
                min={1}
                value={maxPhase}
                onChange={e => setMaxPhase(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Btn
              variant="primary"
              size="md"
              loading={creating}
              loadingText="创建中…"
              onClick={handleCreate}
              sx={{ marginBottom: 1 }}
            >
              建房并进入
            </Btn>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: T.dim }}>
            默认 {PHASE_SECONDS_DEFAULT}s（15min）/阶段 × {MAX_PHASE_DEFAULT} 阶段 ≈ 60min 一局。下限 {MIN_PHASE_SECONDS}s。
          </div>
          {createError && (
            <div style={{ marginTop: 8, fontSize: 12, color: T.red }}>⚠ {createError}</div>
          )}
        </div>
      </div>

      {/* 对局列表 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.dimB, textTransform: 'uppercase', letterSpacing: 1 }}>
          可加入对局 ({matches.length})
        </div>
        <Btn variant="ghost" size="sm" onClick={loadMatches}>刷新</Btn>
      </div>

      {error && (
        <div style={{
          marginBottom: 12, padding: '10px 14px', borderRadius: 8,
          background: `${T.red}12`, border: `1px solid ${T.red}30`,
          color: T.red, fontSize: 12,
        }}>
          ⚠ {error}
        </div>
      )}

      {matches.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 56,
          color: T.dim, background: T.bg1,
          border: `1px solid ${T.border}`, borderRadius: 12,
        }}>
          <div style={{ fontSize: 38, marginBottom: 12 }}>🛰️</div>
          <p style={{ margin: 0, fontSize: 14, color: T.dimB }}>当前没有进行中的对局</p>
          <p style={{ margin: '6px 0 0', fontSize: 12 }}>使用上方面板建立一场。</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {matches.map(m => {
            const ck = localClock(m, nowMs)
            const realPhase = m.status === 'active' ? ck.realPhase : (m.realPhase ?? 0)
            const secs = m.status === 'active'
              ? (ck.secondsToNextPhase ?? m.secondsToNextPhase)
              : null
            const sm = STATUS_META[m.status] || STATUS_META.lobby
            const isJoining = joining === m.matchId

            return (
              <div
                key={m.matchId}
                style={{
                  background: T.bg2,
                  border: `1px solid ${T.border}`,
                  borderLeft: `3px solid ${sm.color}`,
                  borderRadius: 12,
                  padding: '14px 18px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  {/* 左：标识 + 状态 + 阶段 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 220 }}>
                    <span style={{
                      fontSize: 16, fontWeight: 700,
                      fontFamily: 'var(--font-jetbrains-mono), monospace',
                      color: T.text,
                    }}>
                      对局 #{m.matchId}
                    </span>
                    <span style={{
                      padding: '2px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                      background: `${sm.color}18`, color: sm.color,
                    }}>
                      {sm.label}
                    </span>
                    <span style={{ fontSize: 12, color: T.dimB }}>
                      阶段 <strong style={{ color: T.cyan }}>{realPhase}</strong>
                      <span style={{ color: T.dim }}> / {m.maxPhase ?? MAX_PHASE_DEFAULT}</span>
                    </span>
                  </div>

                  {/* 右：入局按钮 */}
                  <Btn
                    variant="primary"
                    size="sm"
                    loading={isJoining}
                    loadingText="进入中…"
                    disabled={joining != null && !isJoining}
                    onClick={() => handleJoin(m.matchId)}
                  >
                    {m.status === 'ended' ? '查看' : '入局 →'}
                  </Btn>
                </div>

                {/* 数据行 */}
                <div style={{ display: 'flex', gap: 18, marginTop: 10, fontSize: 12, color: T.dimB, flexWrap: 'wrap' }}>
                  <span>玩家 <strong style={{ color: T.text }}>{m.playerCount ?? 0}</strong></span>
                  <span>存活 <strong style={{ color: T.green }}>{m.aliveCount ?? 0}</strong></span>
                  {m.status === 'active' && (
                    <span title="距下一次缩圈">
                      距收缩 <strong style={{ color: secs != null && secs <= 180 ? T.yellow : T.text, fontFamily: 'var(--font-jetbrains-mono), monospace' }}>{mmss(secs)}</strong>
                    </span>
                  )}
                  <span>阶段时长 <strong style={{ color: T.text }}>{m.phaseSeconds ?? PHASE_SECONDS_DEFAULT}s</strong></span>
                  <span style={{ color: T.dim }}>建于 {formatCreated(m.createdAtMs)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const inputStyle = {
  width: 140,
  padding: '8px 10px',
  borderRadius: 6,
  background: T.bg0,
  border: `1px solid ${T.border}`,
  color: T.text,
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: T.dimB, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </span>
      {children}
      {hint && <span style={{ fontSize: 10, color: T.dim }}>{hint}</span>}
    </label>
  )
}
