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
import { isImmersiveShell } from './immersiveRoute'
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
  // 沉浸态（顶栏 Nav 不渲染 + <main> 去边距全屏）。判据与其依据见 ./immersiveRoute.js。
  //   契约依据：GPT skill「游戏界面不显示顶部导航栏或开发控制项」。
  //   ⚠ 必须是**渲染期同步派生**，不能改成 state + effect 释放：那样堵不住第一帧，
  //     且 run 请求挂起时会永久锁死（🧭 对抗验证已否决那个版本）。
  // ⚠ 这里**不能**用 useSearchParams 读 `?kaleido=1`：RootShell 在根布局里，该 hook 会让所有
  //   预渲染页 CSR bailout（实测 13 个页面构建直接报 missing-suspense-with-csr-bailout）。
  //   对局页的「落地零帧」改由**发起方在跳转前置位 immersiveRun** 解决（见 navigateIntoGame /
  //   rooms 的入口卡），不依赖目的地子组件的 effect 回传。
  const [immersiveRun, setImmersiveRun] = useState(false)
  const immersive = isImmersiveShell({ user, frontendOnly, path, immersiveRun })

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
  //   ⚠ 看门狗不是可选项：`.catch(() => null)` 只接 reject，**接不住挂起**（服务端生成慢 / 网关 504 前的
  //     长挂 / 移动网络断流）。而登录态 `/` 现在判沉浸 ⇒ 顶栏没了，`/` 的正文又是纯黑 fixed div，
  //     幕布 1120ms 就自行卸载 ⇒ 请求一挂起，用户面对的是「无顶栏 + 零可点元素」的死屏。
  //     超时兜到 /rooms，与下面 `else` 同款逃生语义 —— 让「离开 /」这件事不依赖网络。
  const NAV_WATCHDOG_MS = 8000
  const navigateIntoGame = useCallback(async () => {
    if (frontendOnly) { router.replace('/play'); return }
    const pending = runPromiseRef.current || postGameApi('/api/kaleido/run', {}).catch(() => null)
    const res = await Promise.race([
      pending,
      new Promise((resolve) => setTimeout(() => resolve(null), NAV_WATCHDOG_MS)),
    ])
    runPromiseRef.current = null
    if (res?.roomId) {
      // 跳转**前**置沉浸位：目的地的第一次提交就没有顶栏，不必等 GameClientPage 的 passive effect
      //   回传（那是 paint 之后，必然先露一帧带顶栏的画面）。
      //   目的地随后由自己的 effect 接管（`isKaleido || kaleidoHint`）——是 kaleido 就维持 true，
      //   不是就落回 false，所以这里置位不会「粘住」。
      setImmersiveRun(true)
      router.replace(`/game/${res.roomId}?kaleido=1`)
    } else {
      router.replace('/rooms')
    }
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
