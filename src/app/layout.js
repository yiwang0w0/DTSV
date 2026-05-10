'use client'

import './globals.css'
import Link from 'next/link'
import { DM_Sans, JetBrains_Mono, Noto_Sans_SC } from 'next/font/google'
import { usePathname } from 'next/navigation'
import { createContext, useContext, useEffect, useState } from 'react'
import { hasSupabaseConfig, supabase } from '@/lib/supabase'
import { ensureAdminMetadata, isAdmin } from '@/lib/auth'

const dmSans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-dm-sans',
  weight: ['400', '500', '600', '700'],
})

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
  weight: ['400', '500', '700'],
})

const notoSansSc = Noto_Sans_SC({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-noto-sans-sc',
  weight: ['400', '500', '700'],
})

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

function Nav({ user, onLogout }) {
  const path = usePathname()
  const links = [
    { href: '/', label: '首页' },
    { href: '/rooms', label: '周目记录' },
    ...(user ? [{ href: '/stash', label: '账户库' }] : []),
    ...(user ? [{ href: '/archive', label: '档案库' }] : []),
    ...(user ? [{ href: '/contracts', label: '合同' }] : []),
    ...(isAdmin(user) ? [{ href: '/admin', label: '管理后台' }] : []),
  ]

  return (
    <header style={{
      background: 'linear-gradient(180deg, #161b22 0%, #0e1117 100%)',
      borderBottom: '1px solid #30363d',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      backdropFilter: 'blur(12px)',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Link href="/" style={{ fontWeight: 700, fontSize: 18, color: '#58a6ff', textDecoration: 'none', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
            远星函馆
          </Link>
          <nav style={{ display: 'flex', gap: 4, background: '#161b22', borderRadius: 10, padding: 4, border: '1px solid #30363d' }}>
            {links.map(link => (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  padding: '6px 16px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  textDecoration: 'none',
                  background: path === link.href ? '#58a6ff' : 'transparent',
                  color: path === link.href ? '#fff' : '#8b949e',
                  transition: 'all 0.2s',
                }}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
          {user ? (
            <>
              <span style={{ color: '#8b949e' }}>用户 {user.user_metadata?.username || user.email}</span>
              <button
                onClick={onLogout}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: '1px solid #30363d',
                  background: 'transparent',
                  color: '#f85149',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                退出
              </button>
            </>
          ) : (
            <Link
              href="/login"
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                background: '#58a6ff',
                color: '#fff',
                textDecoration: 'none',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              登录
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}

export default function RootLayout({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const configured = hasSupabaseConfig()

  useEffect(() => {
    if (!configured) {
      setLoading(false)
      return undefined
    }

    supabase.auth.getUser().then(async ({ data }) => {
      const currentUser = data.user
      await ensureAdminMetadata(currentUser)
      setUser(currentUser)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null
      if (currentUser) {
        await ensureAdminMetadata(currentUser)
      }
      setUser(currentUser)
    })

    return () => subscription.unsubscribe()
  }, [configured])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <html lang="zh">
      <body className={`${dmSans.variable} ${jetBrainsMono.variable} ${notoSansSc.variable}`}>
        <AuthContext.Provider value={{ user, loading }}>
          <Nav user={user} onLogout={handleLogout} />
          <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
            {!configured ? (
              <div className="animate-in" style={{
                marginTop: 40,
                padding: '24px',
                borderRadius: 16,
                background: '#161b22',
                border: '1px solid #30363d',
                color: '#e6edf3',
              }}>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>缺少 Supabase 环境变量</h2>
                <p style={{ margin: '12px 0 0', color: '#8b949e', lineHeight: 1.7 }}>
                  当前运行环境没有检测到 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY`，
                  所以客户端无法初始化 Supabase，页面也无法正常登录或读取数据。
                </p>
                <p style={{ margin: '12px 0 0', color: '#8b949e', lineHeight: 1.7 }}>
                  请参考项目根目录的 `.env.example` 创建 `.env.local`，填入对应的 Supabase 配置后再重新启动应用。
                </p>
              </div>
            ) : (
              children
            )}
          </main>
        </AuthContext.Provider>
      </body>
    </html>
  )
}
