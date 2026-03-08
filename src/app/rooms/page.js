'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../layout'
import { isAdmin } from '@/lib/auth'
import { GAME_TYPES } from '@/lib/constants'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Rooms() {
  const { user } = useAuth()
  const router = useRouter()
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(null)

  async function loadRooms() {
    const { data } = await supabase.from('rooms').select('*').in('gamestate', [0, 1, 2]).order('created_at', { ascending: false })
    setRooms(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadRooms()
    const channel = supabase.channel('rooms-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => loadRooms())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  async function createRoom() {
    const gamevars = { players: {}, log: [], turn: 0, mapItems: {}, mapNpcs: {} }
    await supabase.from('rooms').insert({
      gamenum: Date.now() % 100000, gametype: 0, gamestate: 0, gamevars,
    })
    loadRooms()
  }

  async function joinRoom(room) {
    if (!user) return
    setJoining(room.id)
    const { data: latest } = await supabase.from('rooms').select('gamevars, validnum, alivenum').eq('id', room.id).single()
    if (!latest) { setJoining(null); return }
    const gv = latest.gamevars || { players: {}, log: [], turn: 0 }
    if (gv.players?.[user.id]) { router.push(`/game/${room.id}`); return }
    const username = user.user_metadata?.username || user.email?.split('@')[0] || 'Player'
    gv.players[user.id] = { id: user.id, name: username, hp: 100, maxHp: 100, atk: 10, def: 5, map: 0, inventory: [], alive: true, kills: 0 }
    gv.log = [...(gv.log || []), `${username} 加入了游戏`]
    await supabase.from('rooms').update({ gamevars: gv, validnum: (latest.validnum || 0) + 1, alivenum: (latest.alivenum || 0) + 1 }).eq('id', room.id)
    await supabase.from('profiles').update({ roomid: room.id }).eq('id', user.id)
    router.push(`/game/${room.id}`)
  }

  async function deleteRoom(roomId) {
    if (!isAdmin(user)) return
    if (!confirm('确定要删除这个房间吗？')) return
    // 调用管理员专用 API，避免匿名权限漏洞
    const session = await supabase.auth.getSession()
    await fetch(`/api/admin/rooms?id=${roomId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.data?.session?.access_token}` },
    })
    loadRooms()
  }

  async function startGame(roomId) {
    if (!isAdmin(user)) return
    await supabase.from('rooms').update({ gamestate: 1, started_at: new Date().toISOString() }).eq('id', roomId)
    loadRooms()
  }

  if (!user) return (
    <div className="animate-in" style={{ textAlign: 'center', padding: 60 }}>
      <p style={{ color: '#8b949e', fontSize: 16 }}>请先 <Link href="/login" style={{ color: '#58a6ff' }}>登录</Link> 后进入游戏大厅</p>
    </div>
  )

  return (
    <div className="animate-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>🏠 房间大厅</h2>
        <button onClick={createRoom} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#58a6ff', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ 创建房间</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>加载中...</div>
      ) : rooms.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#8b949e' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏚️</div>
          <p>暂无房间，创建一个吧！</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {rooms.map(r => {
            const isActive = r.gamestate === 1
            const isWaiting = r.gamestate === 0
            const isEnded = r.gamestate === 2
            const playerCount = Object.keys(r.gamevars?.players || {}).length
            const isInRoom = !!r.gamevars?.players?.[user.id]
            const isJoining = joining === r.id

            return (
              <div key={r.id} style={{
                background: '#1c2129', borderRadius: 12, border: `1px solid ${isInRoom ? '#58a6ff' : '#30363d'}`,
                padding: 20, borderLeft: `3px solid ${isEnded ? '#484f58' : isActive ? '#3fb950' : isInRoom ? '#58a6ff' : '#484f58'}`,
                opacity: isEnded ? 0.6 : 1,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 18, fontWeight: 700, fontFamily: "'JetBrains Mono'" }}>房间 #{r.id}</span>
                      {isInRoom && <span style={{ padding: '1px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: 'rgba(88,166,255,0.15)', color: '#58a6ff' }}>你在这里</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <span style={{
                        padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        background: isEnded ? 'rgba(72,79,88,0.3)' : isActive ? 'rgba(63,185,80,0.12)' : 'rgba(210,153,34,0.12)',
                        color: isEnded ? '#8b949e' : isActive ? '#3fb950' : '#d29922',
                      }}>{isEnded ? '已结束' : isActive ? '进行中' : '等待中'}</span>
                      <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(88,166,255,0.12)', color: '#58a6ff' }}>{GAME_TYPES[r.gametype] || '个人战'}</span>
                    </div>
                  </div>
                  {isAdmin(user) && (
                    <button onClick={(e) => { e.stopPropagation(); deleteRoom(r.id) }} title="删除房间"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#484f58', fontSize: 16, padding: 4 }}
                      onMouseEnter={e => e.target.style.color = '#f85149'} onMouseLeave={e => e.target.style.color = '#484f58'}>🗑️</button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
                  {[{ l: '玩家', v: playerCount, c: '#e6edf3' }, { l: '存活', v: r.alivenum, c: '#3fb950' }, { l: '阵亡', v: r.deathnum, c: '#f85149' }].map(s => (
                    <div key={s.l} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono'", color: s.c }}>{s.v}</div>
                      <div style={{ fontSize: 11, color: '#8b949e' }}>{s.l}</div>
                    </div>
                  ))}
                </div>

                {playerCount > 0 && (
                  <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {Object.values(r.gamevars?.players || {}).map(p => (
                      <span key={p.id} style={{
                        padding: '2px 10px', borderRadius: 12, fontSize: 11,
                        background: p.alive ? 'rgba(63,185,80,0.1)' : 'rgba(248,81,73,0.1)',
                        color: p.alive ? '#3fb950' : '#f85149',
                        border: `1px solid ${p.alive ? 'rgba(63,185,80,0.2)' : 'rgba(248,81,73,0.2)'}`,
                      }}>{p.id === user.id ? '👤 ' : ''}{p.name}{!p.alive && ' 💀'}</span>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  {isInRoom ? (
                    <button onClick={() => router.push(`/game/${r.id}`)} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: '#58a6ff', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: 1 }}>▶ 进入游戏</button>
                  ) : isWaiting ? (
                    <button onClick={() => joinRoom(r)} disabled={isJoining} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'rgba(63,185,80,0.12)', color: '#3fb950', fontSize: 13, fontWeight: 600, cursor: isJoining ? 'wait' : 'pointer', flex: 1, opacity: isJoining ? 0.6 : 1 }}>
                      {isJoining ? '加入中...' : '➕ 加入房间'}
                    </button>
                  ) : isActive ? (
                    <button onClick={() => router.push(`/game/${r.id}`)} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'rgba(210,153,34,0.12)', color: '#d29922', fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: 1 }}>👁️ 观战</button>
                  ) : null}
                  {isAdmin(user) && isWaiting && playerCount >= 1 && (
                    <button onClick={() => startGame(r.id)} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'rgba(63,185,80,0.12)', color: '#3fb950', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>🚀 开始</button>
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
