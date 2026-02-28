'use client'
import './globals.css'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from '@/lib/supabase'

// Auth context
const AuthContext = createContext(null)
export function useAuth() { return useContext(AuthContext) }

function Nav({ user, onLogout }) {
  const path = usePathname()
  const links = [
    { href: '/', label: '首页' },
    { href: '/rooms', label: '房间大厅' },
    { href: '/admin', label: '管理后台' },
  ]
  return (
    <header style={{
      background: 'linear-gradient(180deg, #161b22 0%, #0e1117 100%)',
      borderBottom: '1px solid #30363d',
      position: 'sticky', top: 0, zIndex: 100,
      backdropFilter: 'blur(12px)',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Link href="/" style={{ fontWeight: 700, fontSize: 18, color: '#58a6ff', textDecoration: 'none', fontFamily: "'JetBrains Mono', monospace" }}>
            ⚔️ DTS
          </Link>
          <nav style={{ display: 'flex', gap: 4, background: '#161b22', borderRadius: 10, padding: 4, border: '1px solid #30363d' }}>
            {links.map(l => (
              <Link key={l.href} href={l.href} style={{
                padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none',
                background: path === l.href ? '#58a6ff' : 'transparent',
                color: path === l.href ? '#fff' : '#8b949e',
                transition: 'all 0.2s',
              }}>{l.label}</Link>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
          {user ? (
            <>
              <span style={{ color: '#8b949e' }}>👤 {user.user_metadata?.username || user.email}</span>
              <button onClick={onLogout} style={{
                padding: '6px 14px', borderRadius: 8, border: '1px solid #30363d',
                background: 'transparent', color: '#f85149', cursor: 'pointer', fontSize: 12,
              }}>退出</button>
            </>
          ) : (
            <Link href="/login" style={{
              padding: '6px 14px', borderRadius: 8, background: '#58a6ff', color: '#fff',
              textDecoration: 'none', fontSize: 12, fontWeight: 600,
            }}>登录</Link>
          )}
        </div>
      </div>
    </header>
  )
}

export default function RootLayout({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <html lang="zh">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AuthContext.Provider value={{ user, loading }}>
          <Nav user={user} onLogout={handleLogout} />
          <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
            {children}
          </main>
        </AuthContext.Provider>
      </body>
    </html>
  )
}
