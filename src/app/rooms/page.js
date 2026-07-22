'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/_shell/RootShell'
import { Spinner } from '../admin/_shared/ui'
import { POLLUTION_TIER_META } from '@/lib/constants'
import { isKaleidoRoom } from '@/lib/roomState'
import { postGameApi } from '@/lib/gameApi'
import { KaleidoEntryCard } from '@/app/game/[id]/kaleido/kaleidoShell'

const ENDING_META = {
  collapse: { label: '崩解', icon: '💥', color: '#f85149', desc: '虚拟空间坠入视界线' },
  purge:    { label: '清算', icon: '⚡', color: '#f0883e', desc: '虚拟空间被隔离清除' },
  merge:    { label: '合流', icon: '🤝', color: '#3fb950', desc: '共存协议签署' },
  explore:  { label: '探索', icon: '🌌', color: '#58a6ff', desc: '发现新路径' },
}

const STATE_META = {
  0: { label: '等待集结', color: '#d29922' },
  1: { label: '进行中',   color: '#3fb950' },
  2: { label: '已结束',   color: '#8b949e' },
}

function pollutionTier(env) {
  if (env >= 100) return 'meltdown'
  if (env >= 80)  return 'severe'
  if (env >= 60)  return 'moderate'
  if (env >= 30)  return 'mild'
  return 'none'
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function RoomsPage() {
  const { user, setImmersiveRun } = useAuth()
  const router = useRouter()
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState(null)
  const [startingKaleido, setStartingKaleido] = useState(false)
  const [kaleidoError, setKaleidoError] = useState(null)
  const loadingRef = useRef(false)

  useEffect(() => {
    async function load() {
      if (loadingRef.current) return
      loadingRef.current = true
      try {
        const { data } = await supabase
          .from('rooms')
          .select('id,gamenum,gametype,gamestate,gamevars,validnum,alivenum,deathnum,winner,created_at')
          .order('created_at', { ascending: false })
          .limit(100)
        // KP0-R-C C2：大厅列表过滤 kaleido 单人房（他人可见会误点加入报错；
        //   本人续跑走入口卡的幂等 /api/kaleido/run，不靠列表）。
        setRooms((data || []).filter(r => !isKaleidoRoom(r)))
      } finally {
        loadingRef.current = false
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleStartKaleido() {
    setStartingKaleido(true)
    setKaleidoError(null)
    try {
      // KP0-R-C C1：契约 = POST /api/kaleido/run（Bearer·无 body）→ { roomId, runId }（幂等：
      //   已有 active run 返回同一对）→ 跳 /game/[roomId]。
      // KP0-R-C C3：带 ?kaleido=1 提示参数 —— GameClientPage 以此在 room 载入前跳过首帧
      //   realtime 订阅（多人链接永不带该参数 → 多人局严格中性）。
      const { roomId } = await postGameApi('/api/kaleido/run', {})
      if (roomId) {
        // 跳转**前**置沉浸位 ⇒ kaleido 对局页的第一次提交就没有顶栏。
        //   这条路径没有解码幕布遮挡，若等目的地 passive effect 回传会实打实闪一下顶栏。
        //   目的地随后自己接管（是 kaleido 维持 true / 不是则落回 false），不会粘住。
        setImmersiveRun?.(true)
        router.push(`/game/${roomId}?kaleido=1`)
      } else {
        setKaleidoError('未能创建单人 run')
        setStartingKaleido(false)
      }
    } catch (err) {
      // 服务端已上线（C1 修复后）：如实透出错误（冷却/校验等服务端消息中文可读）。
      setKaleidoError(err?.message || '启动失败，请稍后再试')
      setStartingKaleido(false)
    }
  }

  async function handleStartNextRound() {
    setStarting(true)
    setStartError(null)
    try {
      const { room } = await postGameApi('/api/game/rooms', { ensureNextRound: true })
      if (room?.id) {
        router.push(`/game/${room.id}`)
      } else {
        setStartError('未能获取下一局对局')
        setStarting(false)
      }
    } catch (err) {
      setStartError(err?.message || '启动失败，请稍后再试')
      setStarting(false)
    }
  }

  if (!user) {
    return (
      <div className="animate-in" style={{ textAlign: 'center', padding: 60 }}>
        <p style={{ color: '#8b949e', fontSize: 16 }}>
          请先 <Link href="/login" style={{ color: '#58a6ff' }}>登录</Link> 后查看对局记录
        </p>
      </div>
    )
  }

  if (loading) return <Spinner />

  const ended = rooms.filter(r => r.gamestate === 2)
  const active = rooms.filter(r => r.gamestate === 0 || r.gamestate === 1)

  return (
    <div className="animate-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>对局记录</h2>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#8b949e' }}>
          虚拟空间内的所有探索尝试。每一次进入都是一局对局，绝大部分以撤离失败告终。
        </p>
      </div>

      {/* KP0-C ① · 单人出勤（KALEIDO 主线入口 · 置顶主 CTA）*/}
      <div style={{ marginBottom: 24 }}>
        <KaleidoEntryCard onStart={handleStartKaleido} starting={startingKaleido} error={kaleidoError} />
      </div>

      {/* 没有进行中的对局 — 显示启动 CTA */}
      {active.length === 0 && (
        <div style={{
          marginBottom: 24,
          padding: '20px 24px',
          background: '#1c2129',
          border: '1px solid #30363d',
          borderLeft: '3px solid #3fb950',
          borderRadius: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e6edf3', marginBottom: 4 }}>
              暂无进行中的对局
            </div>
            <div style={{ fontSize: 12, color: '#8b949e' }}>
              点击右侧按钮启动下一局虚拟空间探查。
            </div>
            {startError && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#f85149' }}>
                ⚠ {startError}
              </div>
            )}
          </div>
          <button
            onClick={handleStartNextRound}
            disabled={starting}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: starting ? '#21262d' : '#3fb950',
              color: starting ? '#8b949e' : '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: starting ? 'wait' : 'pointer',
              opacity: starting ? 0.7 : 1,
            }}
          >
            {starting ? '准备就绪中…' : '🚀 启动下一局'}
          </button>
        </div>
      )}

      {/* 当前进行中 / 等待中 */}
      {active.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#3fb950', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
            当前对局
          </div>
          {active.map(room => {
            const env = room.gamevars?.envPollution || 0
            const tier = pollutionTier(env)
            const tierMeta = POLLUTION_TIER_META[tier]
            const players = Object.values(room.gamevars?.players || {})
            const stateMeta = STATE_META[room.gamestate]

            return (
              <Link key={room.id} href={`/game/${room.id}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  background: '#1c2129',
                  borderRadius: 12,
                  border: '1px solid #3fb950',
                  borderLeft: '3px solid #3fb950',
                  padding: '16px 20px',
                  marginBottom: 8,
                  cursor: 'pointer',
                  transition: 'border-color .2s',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-jetbrains-mono), monospace', color: '#e6edf3' }}>
                        虚拟空间实例 #{room.gamenum || room.id}
                      </span>
                      <span style={{
                        padding: '2px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                        background: `${stateMeta.color}18`, color: stateMeta.color,
                      }}>
                        {stateMeta.label}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: '#58a6ff' }}>进入 →</span>
                  </div>
                  <div style={{ display: 'flex', gap: 20, fontSize: 12, color: '#8b949e' }}>
                    <span>玩家 <strong style={{ color: '#e6edf3' }}>{players.length}</strong></span>
                    <span>存活 <strong style={{ color: '#3fb950' }}>{room.alivenum || 0}</strong></span>
                    <span>阵亡 <strong style={{ color: '#f85149' }}>{room.deathnum || 0}</strong></span>
                    <span>污染度 <strong style={{ color: tierMeta?.color }}>{env}%</strong></span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* 历史对局列表 */}
      <div style={{ fontSize: 12, fontWeight: 700, color: '#8b949e', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
        历史对局 ({ended.length})
      </div>

      {ended.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#8b949e' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🪹</div>
          <p>还没有结束的对局</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ended.map(room => {
            const ending = ENDING_META[room.winner] || null
            const env = room.gamevars?.envPollution || 0
            const tier = pollutionTier(env)
            const tierMeta = POLLUTION_TIER_META[tier]
            const players = Object.values(room.gamevars?.players || {})
            const participated = !!room.gamevars?.players?.[user.id]

            return (
              <Link key={room.id} href={`/game/${room.id}`} style={{ textDecoration: 'none' }}>
                <div
                  className="hov"
                  style={{
                    background: '#161b22',
                    borderRadius: 10,
                    border: `1px solid ${participated ? '#30405a' : '#21262d'}`,
                    borderLeft: `3px solid ${ending?.color || '#484f58'}`,
                    padding: '12px 16px',
                    cursor: 'pointer',
                    transition: 'border-color .15s, background .15s',
                    opacity: 0.85,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-jetbrains-mono), monospace', color: '#8b949e', minWidth: 60 }}>
                        #{room.gamenum || room.id}
                      </span>

                      {ending ? (
                        <span style={{
                          padding: '2px 10px', borderRadius: 16, fontSize: 11, fontWeight: 700,
                          background: `${ending.color}15`, color: ending.color,
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                          {ending.icon} {ending.label}
                        </span>
                      ) : (
                        <span style={{
                          padding: '2px 10px', borderRadius: 16, fontSize: 11, fontWeight: 600,
                          background: 'rgba(72,79,88,0.3)', color: '#8b949e',
                        }}>
                          未知结局
                        </span>
                      )}

                      {participated && (
                        <span style={{
                          padding: '1px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700,
                          background: 'rgba(88,166,255,0.12)', color: '#58a6ff',
                        }}>
                          参与
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, color: '#484f58', flexShrink: 0 }}>
                      <span title="玩家数">👤 {players.length}</span>
                      <span title="阵亡" style={{ color: room.deathnum > 0 ? '#f85149' : '#484f58' }}>
                        💀 {room.deathnum || 0}
                      </span>
                      <span title="最终污染度" style={{ color: tierMeta?.color }}>
                        ☢ {env}%
                      </span>
                      <span style={{ minWidth: 65, textAlign: 'right', color: '#484f58' }}>
                        {formatDate(room.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
