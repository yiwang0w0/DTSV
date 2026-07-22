'use client'

// 根布局的客户端外壳。
// 从 layout.js 抽出：layout.js 需变成 Server Component 才能 `export const viewport`
//   （'use client' 组件不允许 export viewport/metadata）。鉴权上下文/导航/客户端副作用留在这里，
//   layout.js 只保留 <html>/<body>/字体/viewport/metadata 并渲染本组件。
// useAuth/AuthContext 定义在此，各页从 '@/app/_shell/RootShell' 导入。
//   （不能从 server 的 layout.js re-export useAuth —— re-export 'use client' 模块会把 layout 也标记成 client，
//    导致它不能再 export viewport/metadata。）

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import EntryTransition from '@/components/EntryTransition'
import { hasSupabaseConfig, supabase } from '@/lib/supabase'
import { postGameApi } from '@/lib/gameApi'
import { ensureAdminMetadata, isAdmin } from '@/lib/auth'
import {
  createFrontendPreviewUser,
  FRONTEND_PREVIEW_SESSION_KEY,
  isFrontendPreviewMode,
} from '@/lib/runtimeMode'
import { THEME } from '@/lib/theme'

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

function Nav({ user, onLogout }) {
  const path = usePathname()
  const links = [
    { href: '/', label: '首页' },
    { href: '/rooms', label: '对局记录' },
    { href: '/parameters', label: '参数' },
    // Phase 31 re-home: BR 已并入 /game 对局（gametype===20），/br 独立页暂留 dormant 但移除导航入口。
    ...(user ? [{ href: '/stash', label: '账户库' }] : []),
    ...(user ? [{ href: '/profile', label: '个人主页' }] : []),
    ...(isAdmin(user) ? [{ href: '/admin', label: '管理后台' }] : []),
  ]

  return (
    <header style={{
      background: `linear-gradient(180deg, ${THEME.panel} 0%, ${THEME.bg} 100%)`,
      borderBottom: `1px solid ${THEME.border}`,
      position: 'sticky',
      top: 0,
      zIndex: 100,
      backdropFilter: 'blur(12px)',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Link href="/" style={{ fontWeight: 700, fontSize: 18, color: THEME.accent, textDecoration: 'none', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
            远星
          </Link>
          <nav style={{ display: 'flex', gap: 4, background: THEME.panel, borderRadius: 10, padding: 4, border: `1px solid ${THEME.border}` }}>
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
                  background: path === link.href ? THEME.accent : 'transparent',
                  color: path === link.href ? '#fff' : THEME.dim,
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
              <span style={{ color: THEME.dim }}>用户 {user.user_metadata?.username || user.email}</span>
              <button
                onClick={onLogout}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: `1px solid ${THEME.border}`,
                  background: 'transparent',
                  color: THEME.danger,
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
                background: THEME.accent,
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

export default function RootShell({ children }) {
  const path = usePathname()
  const router = useRouter()
  const configured = hasSupabaseConfig()
  const frontendOnly = isFrontendPreviewMode(configured)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [entryTransition, setEntryTransition] = useState(null)
  const runPromiseRef = useRef(null) // 并行发起的 /api/kaleido/run 承诺（转场期预热，navigate 那拍消费）
  const immersivePreview = frontendOnly && path === '/play'
  // 🐛 Bug②（Kanata 线上实测：/game/179?kaleido=1 顶部仍有完整 Nav）：沉浸态**由对局页自己声明**，
  //   不靠 path 猜 —— `/game/[id]` 既跑 kaleido 也跑多人/BR，按路径藏会**动到多人渲染路径**（红线）。
  //   GameClientPage 在 isKaleido 时置 true、离开时置 false ⇒ 多人局这个值恒 false，顶栏一如既往。
  //   契约依据：GPT skill「游戏界面不显示顶部导航栏或开发控制项」。
  const [immersiveRun, setImmersiveRun] = useState(false)
  const immersive = immersivePreview || immersiveRun

  useEffect(() => {
    if (frontendOnly) {
      try {
        const saved = window.localStorage.getItem(FRONTEND_PREVIEW_SESSION_KEY)
        setUser(saved ? createFrontendPreviewUser(JSON.parse(saved)) : null)
      } catch {
        setUser(null)
      }
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
  }, [frontendOnly])

  const beginFrontendSession = ({ email, username }) => {
    const previewUser = createFrontendPreviewUser({ email, username })
    try {
      window.localStorage.setItem(FRONTEND_PREVIEW_SESSION_KEY, JSON.stringify({
        email: previewUser.email,
        username: previewUser.user_metadata.username,
      }))
    } catch {}
    setUser(previewUser)
    return previewUser
  }

  const beginGameEntry = useCallback(({ origin, variant = 'auth' } = {}) => {
    // 真实模式：转场一开始就**并行**开/续 KALEIDO run（startKaleidoRun 幂等自愈：active 续接 / ended 开新 / 30s 冷却），
    //   等到转场的 navigate 那一拍 roomId 通常已就绪 —— 不让网络往返拖慢编舞节拍。
    if (!frontendOnly && !runPromiseRef.current) {
      runPromiseRef.current = postGameApi('/api/kaleido/run', {}).catch(() => null)
    }
    setEntryTransition((current) => current || {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      origin,
      variant,
    })
  }, [frontendOnly])

  const finishGameEntry = useCallback(() => setEntryTransition(null), [])
  // 转场落地：真实模式 → /game/<roomId>?kaleido=1（该页渲染 AVG + 真 ui_unlocks 数据）；预览模式 → /play 预览壳（不动）。
  //   失败一律兜到 /rooms，保住逃生路径，绝不把用户卡死在转场里。
  const navigateIntoGame = useCallback(async () => {
    if (frontendOnly) { router.replace('/play'); return }
    const res = await (runPromiseRef.current || postGameApi('/api/kaleido/run', {}).catch(() => null))
    runPromiseRef.current = null
    if (res?.roomId) router.replace(`/game/${res.roomId}?kaleido=1`)
    else router.replace('/rooms')
  }, [frontendOnly, router])

  const handleLogout = async () => {
    if (frontendOnly) {
      try { window.localStorage.removeItem(FRONTEND_PREVIEW_SESSION_KEY) } catch {}
      setUser(null)
      return
    }
    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      frontendOnly,
      beginFrontendSession,
      beginGameEntry,
      setImmersiveRun,
      transitioning: Boolean(entryTransition),
      logout: handleLogout,
    }}>
      {/* 未登录态（user===null，含 auth 加载中）整个顶栏 Nav 不渲染 —— 神秘极简入口，连品牌名都不露。
          登录态照常显示（登录用户要导航，零改动）。🎨 首页派单②③(🧭)。
          沉浸态（预览壳 /play · KALEIDO AVG 对局页）一并不渲染 —— 见上方 immersiveRun 注释。 */}
      {user && !frontendOnly && !immersive && <Nav user={user} onLogout={handleLogout} />}
      <main style={immersive
        ? { width: '100%', height: '100dvh', margin: 0, padding: 0, overflow: 'hidden' }
        : { maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
        {children}
      </main>
      {entryTransition && (
        <EntryTransition
          key={entryTransition.id}
          {...entryTransition}
          onNavigate={navigateIntoGame}
          onComplete={finishGameEntry}
        />
      )}
    </AuthContext.Provider>
  )
}
