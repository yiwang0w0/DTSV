'use client'

/**
 * /rooms — 出勤入口（远星函馆 × DTSV）
 *
 * 单一全服对局模型：
 *   - 永远只有 1 个 active / waiting 对局，所有 PI 引导者加入它
 *   - 上一局结束后系统自动 ensureNextRound 开新一局
 *   - UI = 1 张当前对局信息卡 + 立即出勤大按钮
 *
 * 状态机：
 *   user 未加入 + currentRaid 等待中 → 「🚀 立即出勤」 弹 LoadoutModal
 *   user 已加入                    → 「↩ 返回对局」 直接跳 /game/[id]
 *   currentRaid 不存在             → 自动 ensureNextRound + 显示准备中
 *   currentRaid 已结束             → 显示归档 + 自动开新一局
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../layout'
import { Spinner, useToast } from '../admin/_shared/ui'
import { postGameApi } from '@/lib/gameApi'
import LoadoutModal from '@/components/LoadoutModal'
import { POLLUTION_TIER_META, MAP_LIST } from '@/lib/constants'

const ROOM_CHECK_INTERVAL_MS = 60_000

const C = {
  bg0:    '#0e1117',
  bg1:    '#1c2129',
  bg2:    '#161b22',
  border: '#30363d',
  text:   '#e6edf3',
  dim:    '#8b949e',
  dim2:   '#484f58',
  accent: '#58a6ff',
  green:  '#3fb950',
  red:    '#f85149',
  yellow: '#d29922',
  purple: '#bc8cff',
}

function pollutionTier(env) {
  if (env >= 100) return 'meltdown'
  if (env >= 80)  return 'severe'
  if (env >= 60)  return 'moderate'
  if (env >= 40)  return 'mild'
  return 'none'
}

export default function RoomsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { show: toast, Container: ToastContainer } = useToast()
  const ensureNextRoundLock = useRef(false)

  const [currentRaid, setCurrentRaid] = useState(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [preparingNextRound, setPreparingNextRound] = useState(false)
  const [loadoutOpen, setLoadoutOpen] = useState(false)
  const loadingRef = useRef(false)

  const loadCurrentRaid = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      // 取最新的 active/waiting 对局；只有 1 个
      const { data, error } = await supabase
        .from('rooms')
        .select('id,gamenum,gametype,gamestate,gamevars,validnum,alivenum,deathnum,winner,started_at,created_at')
        .in('gamestate', [0, 1])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        throw new Error(error.message || '加载对局失败')
      }
      setCurrentRaid(data || null)
    } catch (error) {
      toast(error.message || '加载对局失败', 'error')
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [toast])

  const ensureNextRound = useCallback(async ({ silent = true } = {}) => {
    if (!user || ensureNextRoundLock.current) return
    ensureNextRoundLock.current = true
    setPreparingNextRound(true)
    try {
      const { room, created } = await postGameApi('/api/game/rooms', {
        gametype: 0,
        ensureNextRound: true,
      })
      if (created) {
        await loadCurrentRaid()
        if (!silent) {
          toast(`下一段对局 #${room.gamenum || room.id} 已就绪`)
        }
      }
    } catch (error) {
      if (!silent) toast(error.message, 'error')
    } finally {
      ensureNextRoundLock.current = false
      setPreparingNextRound(false)
    }
  }, [loadCurrentRaid, toast, user])

  useEffect(() => {
    loadCurrentRaid()
    const channel = supabase
      .channel('rooms-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => loadCurrentRaid())
      .subscribe()
    const intervalId = setInterval(() => loadCurrentRaid(), ROOM_CHECK_INTERVAL_MS)
    return () => {
      clearInterval(intervalId)
      supabase.removeChannel(channel)
    }
  }, [loadCurrentRaid])

  // 没有 active 对局时自动开新一局
  useEffect(() => {
    if (!user || loading || currentRaid) return
    ensureNextRound({ silent: true })
  }, [ensureNextRound, currentRaid, loading, user])

  const players = useMemo(
    () => Object.values(currentRaid?.gamevars?.players || {}),
    [currentRaid?.gamevars?.players],
  )
  const meInRaid = !!currentRaid?.gamevars?.players?.[user?.id]
  const envPollution = currentRaid?.gamevars?.envPollution || 0
  const turn = currentRaid?.gamevars?.turn || 0
  const extractedCount = players.filter(p => p?.extracted).length
  const aliveCount = currentRaid?.alivenum ?? players.filter(p => p?.alive).length
  const deathCount = currentRaid?.deathnum ?? players.filter(p => !p?.alive).length

  function openLoadout() {
    if (!user || !currentRaid) return
    setLoadoutOpen(true)
  }

  async function confirmJoinWithLoadout(loadout) {
    if (!currentRaid) return
    const roomId = currentRaid.id
    setJoining(true)
    try {
      await postGameApi('/api/game/actions', { roomId, action: 'join', loadout })
      router.push(`/game/${roomId}`)
    } catch (error) {
      toast(error.message, 'error')
      throw error // 让 modal 不关闭
    } finally {
      setJoining(false)
    }
  }

  if (!user) {
    return (
      <div className="animate-in" style={{ textAlign: 'center', padding: 60 }}>
        <p style={{ color: C.dim, fontSize: 16 }}>
          请先 <Link href="/login" style={{ color: C.accent }}>登录</Link> 后进入出勤入口
        </p>
      </div>
    )
  }

  if (loading) return <Spinner />

  return (
    <div className="animate-in">
      <ToastContainer />
      <LoadoutModal
        open={loadoutOpen}
        roomTitle={currentRaid ? `对局 #${currentRaid.gamenum || currentRaid.id}` : ''}
        onClose={() => setLoadoutOpen(false)}
        onConfirm={confirmJoinWithLoadout}
      />

      {/* ── 顶部说明 ───────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>🌌 出勤入口</h2>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: C.dim }}>
          PI 引导者，请准备装载，进入 17 号异常段当前对局。系统自动维持单一全服对局，结束后将开启下一段。
        </p>
      </div>

      {/* ── 当前对局卡 ─────────────────────── */}
      {!currentRaid ? (
        <PendingCard preparing={preparingNextRound} />
      ) : (
        <CurrentRaidCard
          raid={currentRaid}
          players={players}
          envPollution={envPollution}
          turn={turn}
          aliveCount={aliveCount}
          deathCount={deathCount}
          extractedCount={extractedCount}
          meInRaid={meInRaid}
          joining={joining}
          onEnter={() => router.push(`/game/${currentRaid.id}`)}
          onSortie={openLoadout}
          userId={user.id}
        />
      )}
    </div>
  )
}

// ── 当前对局卡 ────────────────────────────────────
function CurrentRaidCard({
  raid, players, envPollution, turn, aliveCount, deathCount, extractedCount,
  meInRaid, joining, onEnter, onSortie, userId,
}) {
  const tier = pollutionTier(envPollution)
  const tierMeta = POLLUTION_TIER_META[tier] || POLLUTION_TIER_META.none
  const isWaiting = raid.gamestate === 0
  const isActive  = raid.gamestate === 1
  const stateMeta = isActive ? { label: '进行中', color: C.green }
                  : isWaiting ? { label: '等待 PI 引导者集结', color: C.yellow }
                  : { label: '已归档', color: C.dim2 }

  return (
    <div style={{
      background: C.bg1, borderRadius: 14,
      border: `1px solid ${meInRaid ? C.accent : C.border}`,
      borderLeft: `4px solid ${stateMeta.color}`,
      padding: '24px 28px',
      boxShadow: meInRaid ? `0 0 30px ${C.accent}20` : 'none',
    }}>
      {/* 头部 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: 0.5 }}>17 号异常段 · 对局 #{raid.gamenum || raid.id}</span>
            {meInRaid && (
              <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: `${C.accent}22`, color: C.accent, border: `1px solid ${C.accent}40` }}>
                你已加入
              </span>
            )}
          </div>
          <span style={{
            display: 'inline-block', padding: '2px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: `${stateMeta.color}18`, color: stateMeta.color, border: `1px solid ${stateMeta.color}40`,
          }}>{stateMeta.label}</span>
          {turn > 0 && (
            <span style={{ marginLeft: 8, fontSize: 11, color: C.dim, fontFamily: 'var(--font-jetbrains-mono), monospace' }}>· 已运行 {turn} 回合</span>
          )}
        </div>

        {/* 主 CTA */}
        <div>
          {meInRaid ? (
            <button
              onClick={onEnter}
              style={ctaButton(C.accent)}
            >↩ 返回对局</button>
          ) : (
            <button
              onClick={onSortie}
              disabled={joining || raid.gamestate !== 0}
              style={{
                ...ctaButton(C.green),
                opacity: joining || raid.gamestate !== 0 ? 0.55 : 1,
                cursor: joining ? 'wait' : (raid.gamestate !== 0 ? 'not-allowed' : 'pointer'),
              }}
            >{joining ? '装载中…' : raid.gamestate !== 0 ? '对局已开始，等待下一段' : '🚀 立即出勤'}</button>
          )}
        </div>
      </div>

      {/* 数据面板 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 14, marginBottom: 18 }}>
        <Stat label="在场" value={aliveCount} color={C.text} />
        <Stat label="已撤离" value={extractedCount} color={C.green} />
        <Stat label="阵亡" value={deathCount} color={C.red} />
        <Stat label="总参与" value={players.length} color={C.dim} />
      </div>

      {/* 环境污染条 */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11 }}>
          <span style={{ color: C.dim }}>环境污染 · {tierMeta.label}</span>
          <span style={{ color: tierMeta.color, fontFamily: 'var(--font-jetbrains-mono), monospace', fontWeight: 700 }}>
            {envPollution} / 100
          </span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: C.bg2, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${Math.min(100, envPollution)}%`,
            background: tierMeta.color,
            transition: 'width .3s',
          }} />
        </div>
      </div>

      {/* 玩家列表 */}
      {players.length > 0 ? (
        <div>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            PI 引导者状态
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {players.map(p => {
              const isMe = (p.id || p.uid) === userId
              const status = p.extracted ? 'extracted' : !p.alive ? 'dead' : 'alive'
              const statusMeta = {
                alive:     { label: '在场', color: C.green },
                extracted: { label: '已撤离', color: C.accent },
                dead:      { label: '阵亡', color: C.red },
              }[status]
              return (
                <span
                  key={p.id || p.uid}
                  style={{
                    padding: '4px 12px', borderRadius: 14, fontSize: 11,
                    background: `${statusMeta.color}12`, color: statusMeta.color,
                    border: `1px solid ${statusMeta.color}30`,
                    fontWeight: isMe ? 700 : 400,
                  }}
                >
                  {isMe ? '👤 ' : ''}{p.name}
                  {p.map !== undefined && p.alive && !p.extracted && (
                    <span style={{ marginLeft: 6, color: C.dim2, fontSize: 10 }}>
                      @{MAP_LIST.find(m => m.id === p.map)?.name || `map ${p.map}`}
                    </span>
                  )}
                  {' · '}{statusMeta.label}
                </span>
              )
            })}
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '14px 0', color: C.dim2, fontSize: 12 }}>
          尚无 PI 引导者集结，等待你成为第一人
        </div>
      )}
    </div>
  )
}

// ── 等待对局生成卡 ────────────────────────────────
function PendingCard({ preparing }) {
  return (
    <div style={{
      background: C.bg1, borderRadius: 14, border: `1px dashed ${C.border}`,
      padding: '60px 28px', textAlign: 'center', color: C.dim,
    }}>
      <div style={{ fontSize: 48, marginBottom: 18 }}>🌌</div>
      <div style={{ fontSize: 16, color: C.text, marginBottom: 6, fontWeight: 600 }}>
        {preparing ? '正在准备下一段对局…' : '系统正在重新部署 17 号异常段'}
      </div>
      <div style={{ fontSize: 12, color: C.dim2 }}>
        当前没有 active 对局，系统会自动开新一段，请稍候片刻
      </div>
    </div>
  )
}

// ── 工具 ─────────────────────────────────────────
function Stat({ label, value, color }) {
  return (
    <div style={{ background: C.bg2, borderRadius: 10, border: `1px solid ${C.border}`, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, fontFamily: 'var(--font-jetbrains-mono), monospace', marginTop: 4 }}>{value}</div>
    </div>
  )
}

function ctaButton(color) {
  return {
    padding: '12px 24px', borderRadius: 10, border: 'none',
    background: color, color: '#fff', fontSize: 14, fontWeight: 700,
    cursor: 'pointer', minWidth: 160,
    boxShadow: `0 0 20px ${color}30`,
  }
}
