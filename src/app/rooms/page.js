'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isAdmin } from '@/lib/auth'
import { useAuth } from '../layout'
import { Spinner, useToast } from '../admin/_shared/ui'
import { postGameApi } from '@/lib/gameApi'

const ROOM_CHECK_INTERVAL_MS = 60_000

export default function RoomsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { show: toast, Container: ToastContainer } = useToast()
  const ensureNextRoundLock = useRef(false)

  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(null)
  const [creating, setCreating] = useState(false)
  const [preparingNextRound, setPreparingNextRound] = useState(false)

  const loadRooms = useCallback(async () => {
    const { data } = await supabase
      .from('rooms')
      .select('*')
      .in('gamestate', [0, 1, 2])
      .order('created_at', { ascending: false })

    setRooms(data || [])
    setLoading(false)
  }, [])

  const hasOpenRoom = rooms.some(room => room.gamestate === 0 || room.gamestate === 1)

  const ensureNextRound = useCallback(async ({ silent = true } = {}) => {
    if (!user || ensureNextRoundLock.current || hasOpenRoom) return

    ensureNextRoundLock.current = true
    setPreparingNextRound(true)

    try {
      const { room, created } = await postGameApi('/api/game/rooms', {
        gametype: 0,
        ensureNextRound: true,
      })

      if (created) {
        await loadRooms()
        if (!silent) {
          toast(`房间 #${room.gamenum || room.id} 已准备好，下一轮可以开始了`)
        }
      }
    } catch (error) {
      if (!silent) {
        toast(error.message, 'error')
      }
    } finally {
      ensureNextRoundLock.current = false
      setPreparingNextRound(false)
    }
  }, [hasOpenRoom, loadRooms, toast, user])

  useEffect(() => {
    loadRooms()

    const channel = supabase
      .channel('rooms-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => loadRooms())
      .subscribe()

    const intervalId = setInterval(() => {
      loadRooms()
    }, ROOM_CHECK_INTERVAL_MS)

    return () => {
      clearInterval(intervalId)
      supabase.removeChannel(channel)
    }
  }, [loadRooms])

  useEffect(() => {
    if (!user || loading || hasOpenRoom) return
    ensureNextRound({ silent: true })
  }, [ensureNextRound, hasOpenRoom, loading, user])

  async function joinRoom(roomId) {
    if (!user) return
    setJoining(roomId)
    try {
      await postGameApi('/api/game/actions', { roomId, action: 'join' })
      router.push(`/game/${roomId}`)
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setJoining(null)
    }
  }

  async function createRoom() {
    setCreating(true)
    try {
      const { room } = await postGameApi('/api/game/rooms', { gametype: 0 })
      toast(`房间 #${room.gamenum || room.id} 已创建`)
      await loadRooms()
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setCreating(false)
    }
  }

  async function deleteRoom(roomId) {
    if (!isAdmin(user)) return
    if (!confirm('确定要删除这个房间吗？')) return

    const session = await supabase.auth.getSession()
    const response = await fetch(`/api/admin/rooms?id=${roomId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${session.data?.session?.access_token}`,
      },
    })

    if (!response.ok) {
      toast('删除房间失败', 'error')
      return
    }

    toast('房间已删除')
    loadRooms()
  }

  if (!user) {
    return (
      <div className="animate-in" style={{ textAlign: 'center', padding: 60 }}>
        <p style={{ color: '#8b949e', fontSize: 16 }}>
          请先 <Link href="/login" style={{ color: '#58a6ff' }}>登录</Link> 后进入游戏大厅
        </p>
      </div>
    )
  }

  if (loading) return <Spinner />

  return (
    <div className="animate-in">
      <ToastContainer />

      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>房间大厅</h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#8b949e' }}>
            系统会每分钟检查一次房间状态；如果当前没有等待中或进行中的房间，就会自动准备下一轮。管理员仍可手动创建房间。
          </p>
        </div>
        {isAdmin(user) && (
          <button
            onClick={createRoom}
            disabled={creating || preparingNextRound}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid rgba(88,166,255,0.25)',
              background: 'rgba(88,166,255,0.12)',
              color: '#58a6ff',
              fontSize: 13,
              fontWeight: 700,
              cursor: creating || preparingNextRound ? 'wait' : 'pointer',
              opacity: creating || preparingNextRound ? 0.7 : 1,
            }}
          >
            {preparingNextRound ? '准备下一轮中...' : creating ? '创建中...' : '+ 创建房间'}
          </button>
        )}
      </div>

      {!hasOpenRoom && (
        <div style={{
          marginBottom: 16,
          padding: '12px 14px',
          borderRadius: 12,
          background: 'rgba(210,153,34,0.1)',
          border: '1px solid rgba(210,153,34,0.25)',
          color: '#d29922',
          fontSize: 12,
        }}>
          {preparingNextRound
            ? '当前没有可加入的房间，系统正在准备下一轮游戏。'
            : '当前没有等待中或进行中的房间，系统会自动准备下一轮游戏。'}
        </div>
      )}

      {rooms.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#8b949e' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🪹</div>
          <p>{preparingNextRound ? '正在自动准备下一轮游戏...' : '暂无房间，系统会自动准备下一轮游戏'}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(280px, 1fr))', gap: 16 }}>
          {rooms.map(room => {
            const isActive = room.gamestate === 1
            const isWaiting = room.gamestate === 0
            const isEnded = room.gamestate === 2
            const players = Object.values(room.gamevars?.players || {})
            const isInRoom = !!room.gamevars?.players?.[user.id]
            const isJoining = joining === room.id

            return (
              <div
                key={room.id}
                style={{
                  background: '#1c2129',
                  borderRadius: 12,
                  border: `1px solid ${isInRoom ? '#58a6ff' : '#30363d'}`,
                  padding: 20,
                  borderLeft: `3px solid ${isEnded ? '#484f58' : isActive ? '#3fb950' : isInRoom ? '#58a6ff' : '#d29922'}`,
                  opacity: isEnded ? 0.7 : 1,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 18, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                        房间 #{room.gamenum || room.id}
                      </span>
                      {isInRoom && (
                        <span style={{ padding: '1px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: 'rgba(88,166,255,0.15)', color: '#58a6ff' }}>
                          你已加入
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <span
                        style={{
                          padding: '2px 10px',
                          borderRadius: 20,
                          fontSize: 11,
                          fontWeight: 700,
                          background: isEnded ? 'rgba(72,79,88,0.3)' : isActive ? 'rgba(63,185,80,0.12)' : 'rgba(210,153,34,0.12)',
                          color: isEnded ? '#8b949e' : isActive ? '#3fb950' : '#d29922',
                        }}
                      >
                        {isEnded ? '已结束' : isActive ? '进行中' : '等待中'}
                      </span>
                    </div>
                  </div>
                  {isAdmin(user) && (
                    <button
                      onClick={() => deleteRoom(room.id)}
                      title="删除房间"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#484f58', fontSize: 16, padding: 4 }}
                    >
                      🗑️
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
                  {[
                    { label: '玩家', value: players.length, color: '#e6edf3' },
                    { label: '存活', value: room.alivenum || 0, color: '#3fb950' },
                    { label: '阵亡', value: room.deathnum || 0, color: '#f85149' },
                  ].map(stat => (
                    <div key={stat.label} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono'", color: stat.color }}>{stat.value}</div>
                      <div style={{ fontSize: 11, color: '#8b949e' }}>{stat.label}</div>
                    </div>
                  ))}
                </div>

                {players.length > 0 && (
                  <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {players.map(player => (
                      <span
                        key={player.id || player.uid}
                        style={{
                          padding: '2px 10px',
                          borderRadius: 12,
                          fontSize: 11,
                          background: player.alive ? 'rgba(63,185,80,0.1)' : 'rgba(248,81,73,0.1)',
                          color: player.alive ? '#3fb950' : '#f85149',
                          border: `1px solid ${player.alive ? 'rgba(63,185,80,0.2)' : 'rgba(248,81,73,0.2)'}`,
                        }}
                      >
                        {(player.id || player.uid) === user.id ? '👤 ' : ''}
                        {player.name}
                        {!player.alive && ' 💀'}
                      </span>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  {isInRoom ? (
                    <button
                      onClick={() => router.push(`/game/${room.id}`)}
                      style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: '#58a6ff', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', flex: 1 }}
                    >
                      进入游戏
                    </button>
                  ) : isWaiting ? (
                    <button
                      onClick={() => joinRoom(room.id)}
                      disabled={isJoining}
                      style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'rgba(63,185,80,0.12)', color: '#3fb950', fontSize: 13, fontWeight: 700, cursor: isJoining ? 'wait' : 'pointer', flex: 1, opacity: isJoining ? 0.6 : 1 }}
                    >
                      {isJoining ? '加入中...' : '加入房间'}
                    </button>
                  ) : isActive ? (
                    <button
                      onClick={() => router.push(`/game/${room.id}`)}
                      style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'rgba(210,153,34,0.12)', color: '#d29922', fontSize: 13, fontWeight: 700, cursor: 'pointer', flex: 1 }}
                    >
                      观战 / 查看
                    </button>
                  ) : (
                    <button
                      onClick={() => router.push(`/game/${room.id}`)}
                      style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'rgba(72,79,88,0.2)', color: '#8b949e', fontSize: 13, fontWeight: 700, cursor: 'pointer', flex: 1 }}
                    >
                      查看结算
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
