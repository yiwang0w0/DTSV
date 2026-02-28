'use client'
import { useAuth } from './layout'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const { user, loading } = useAuth()
  const [stats, setStats] = useState({ rooms: 0, items: 0, npcs: 0 })

  useEffect(() => {
    async function load() {
      const [r, i, n] = await Promise.all([
        supabase.from('rooms').select('id', { count: 'exact', head: true }).in('gamestate', [0, 1]),
        supabase.from('item_pool').select('id', { count: 'exact', head: true }),
        supabase.from('npc_pool').select('id', { count: 'exact', head: true }),
      ])
      setStats({ rooms: r.count || 0, items: i.count || 0, npcs: n.count || 0 })
    }
    load()
  }, [])

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#8b949e' }}>加载中...</div>

  return (
    <div className="animate-in">
      {/* Hero */}
      <div style={{
        textAlign: 'center', padding: '60px 20px',
        background: 'radial-gradient(ellipse at center, rgba(88,166,255,0.08) 0%, transparent 70%)',
        borderRadius: 16, marginBottom: 32,
      }}>
        <h1 style={{ fontSize: 42, fontWeight: 700, margin: '0 0 12px', fontFamily: "'JetBrains Mono', monospace" }}>
          ⚔️ DTS 大逃杀
        </h1>
        <p style={{ fontSize: 16, color: '#8b949e', margin: '0 0 32px' }}>
          常磐大逃杀 · 现代Web重制版
        </p>
        {user ? (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Link href="/rooms" style={{
              padding: '12px 32px', borderRadius: 10, background: '#58a6ff', color: '#fff',
              textDecoration: 'none', fontWeight: 600, fontSize: 15,
            }}>进入游戏大厅</Link>
            <Link href="/admin" style={{
              padding: '12px 32px', borderRadius: 10, border: '1px solid #30363d',
              background: 'transparent', color: '#8b949e', textDecoration: 'none', fontWeight: 500, fontSize: 15,
            }}>管理后台</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Link href="/login" style={{
              padding: '12px 32px', borderRadius: 10, background: '#58a6ff', color: '#fff',
              textDecoration: 'none', fontWeight: 600, fontSize: 15,
            }}>登录</Link>
            <Link href="/register" style={{
              padding: '12px 32px', borderRadius: 10, border: '1px solid #30363d',
              background: 'transparent', color: '#8b949e', textDecoration: 'none', fontWeight: 500, fontSize: 15,
            }}>注册</Link>
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {[
          { label: '活跃房间', value: stats.rooms, emoji: '🏠', color: '#58a6ff' },
          { label: '道具种类', value: stats.items, emoji: '⚔️', color: '#d29922' },
          { label: 'NPC种类', value: stats.npcs, emoji: '🤖', color: '#f85149' },
        ].map(s => (
          <div key={s.label} style={{
            background: '#1c2129', borderRadius: 12, border: '1px solid #30363d',
            padding: 24, textAlign: 'center',
          }}>
            <div style={{ fontSize: 28 }}>{s.emoji}</div>
            <div style={{ fontSize: 32, fontWeight: 700, fontFamily: "'JetBrains Mono'", color: s.color, margin: '8px 0 4px' }}>{s.value}</div>
            <div style={{ fontSize: 13, color: '#8b949e' }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
