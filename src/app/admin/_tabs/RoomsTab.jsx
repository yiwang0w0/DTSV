'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { BTN, ROOM_STATE, GAME_TYPES } from '../_shared/ui'

async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token
}

async function requestAdminRoom(method, { id }) {
  const token = await getAccessToken()
  const response = await fetch(
    method === 'DELETE' ? `/api/admin/rooms?id=${id}` : '/api/admin/rooms',
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(method === 'DELETE' ? {} : { body: JSON.stringify({ id }) }),
    },
  )

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || '操作失败')
  }

  return payload
}

export default function RoomsTab({ rooms, onRefresh, toast }) {
  const [filter, setFilter] = useState('all')
  const [confirmDel, setConfirmDel] = useState(null)

  const filtered = rooms.filter(room => filter === 'all' || String(room.gamestate) === filter)

  async function deleteRoom(id) {
    try {
      await requestAdminRoom('DELETE', { id })
      toast('对局已删除')
      setConfirmDel(null)
      onRefresh('rooms')
    } catch (error) {
      toast(error.message || '删除失败', 'error')
    }
  }

  async function endRoom(id) {
    try {
      await requestAdminRoom('PATCH', { id })
      toast('已强制结束对局')
      onRefresh('rooms')
    } catch (error) {
      toast(error.message || '操作失败', 'error')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[{ k: 'all', l: '全部' }, { k: '1', l: '进行中' }, { k: '0', l: '等待中' }, { k: '2', l: '已结束' }].map(item => (
            <button
              key={item.k}
              onClick={() => setFilter(item.k)}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                fontSize: 12,
                cursor: 'pointer',
                border: `1px solid ${filter === item.k ? '#58a6ff' : '#30363d'}`,
                background: filter === item.k ? 'rgba(88,166,255,0.12)' : 'transparent',
                color: filter === item.k ? '#58a6ff' : '#8b949e',
              }}
            >
              {item.l}
            </button>
          ))}
        </div>
        <button onClick={() => onRefresh('rooms')} style={{ ...BTN('transparent', '#8b949e'), border: '1px solid #30363d' }}>↻ 刷新</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(room => {
          const roomState = ROOM_STATE[room.gamestate] || ROOM_STATE[0]
          const isConfirming = confirmDel === room.id
          const createdAt = room.created_at
            ? new Date(room.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
            : '-'

          return (
            <div
              key={room.id}
              style={{
                background: '#1c2129',
                borderRadius: 12,
                padding: '14px 20px',
                border: `1px solid ${isConfirming ? '#f85149' : '#30363d'}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#58a6ff', fontWeight: 700 }}>#{room.gamenum || room.id}</span>
                  <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 10, background: `${roomState.color}18`, color: roomState.color, border: `1px solid ${roomState.color}30` }}>
                    {roomState.label}
                  </span>
                  <span style={{ fontSize: 12, color: '#8b949e' }}>{GAME_TYPES[room.gametype] || '-'}</span>
                  <span style={{ fontSize: 11, color: '#484f58' }}>{createdAt}</span>
                  {room.winner && <span style={{ fontSize: 11, color: '#d29922' }}>奖杯 {room.winner}</span>}
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  {room.gamestate === 1 && (
                    <button
                      onClick={() => endRoom(room.id)}
                      style={BTN('rgba(210,153,34,0.15)', '#d29922', { padding: '6px 14px', fontSize: 12, border: '1px solid rgba(210,153,34,0.3)' })}
                    >
                      强制结束
                    </button>
                  )}

                  {isConfirming ? (
                    <>
                      <button
                        onClick={() => deleteRoom(room.id)}
                        style={BTN('rgba(248,81,73,0.15)', '#f85149', { padding: '6px 14px', fontSize: 12, border: '1px solid rgba(248,81,73,0.3)' })}
                      >
                        确认删除
                      </button>
                      <button
                        onClick={() => setConfirmDel(null)}
                        style={BTN('transparent', '#8b949e', { padding: '6px 14px', fontSize: 12, border: '1px solid #30363d' })}
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmDel(room.id)}
                      style={BTN('transparent', '#8b949e', { padding: '6px 14px', fontSize: 12, border: '1px solid #30363d' })}
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 56, color: '#8b949e' }}>暂无对局记录</div>}
      </div>
    </div>
  )
}
