'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../layout'
import { GAME_TYPES } from '@/lib/constants'
import Link from 'next/link'

export default function Rooms() {
  const { user } = useAuth()
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)

  async function loadRooms() {
    const { data } = await supabase.from('rooms').select('*').in('gamestate', [0, 1]).order('created_at', { ascending: false })
    setRooms(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadRooms()
    // 实时订阅房间变化
    const channel = supabase.channel('rooms-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => loadRooms())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  async function createRoom() {
    const { data, error } = await supabase.from('rooms').insert({
      gamenum: Date.now() % 100000,
      gametype: 0,
      gamestate: 0,
    }).select().single()
    if (!error) loadRooms()
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
        <button onClick={createRoom} style={{
          padding: '10px 20px', borderRadius: 8, border: 'none', background: '#58a6ff',
          color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>+ 创建房间</button>
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
            return (
              <div key={r.id} style={{
                background: '#1c2129', borderRadius: 12, border: '1px solid #30363d',
                padding: 20, borderLeft: `3px solid ${isActive ? '#3fb950' : '#484f58'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'JetBrains Mono'" }}>房间 #{r.id}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <span style={{
                        padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        background: isActive ? 'rgba(63,185,80,0.12)' : 'rgba(72,79,88,0.3)',
                        color: isActive ? '#3fb950' : '#8b949e',
                      }}>{isActive ? '进行中' : '等待中'}</span>
                      <span style={{
                        padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        background: 'rgba(88,166,255,0.12)', color: '#58a6ff',
                      }}>{GAME_TYPES[r.gametype] || '个人战'}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: '#8b949e', fontFamily: "'JetBrains Mono'", textAlign: 'right' }}>
                    #{r.gamenum}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 24, marginBottom: 14 }}>
                  {[
                    { l: '参战', v: r.validnum, c: '#e6edf3' },
                    { l: '存活', v: r.alivenum, c: '#3fb950' },
                    { l: '阵亡', v: r.deathnum, c: '#f85149' },
                  ].map(s => (
                    <div key={s.l} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono'", color: s.c }}>{s.v}</div>
                      <div style={{ fontSize: 11, color: '#8b949e' }}>{s.l}</div>
                    </div>
                  ))}
                </div>
                <button style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: isActive ? 'rgba(63,185,80,0.12)' : 'rgba(88,166,255,0.12)',
                  color: isActive ? '#3fb950' : '#58a6ff',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', width: '100%',
                }}>
                  {isActive ? '观战' : '加入房间'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
