'use client'

/**
 * 首页 / 远星函馆
 *
 * 结构：
 *   1. Hero 区 — 世界观介绍 + 主 CTA「立即出勤」
 *   2. 当前对局快照（如果存在）
 *   3. 4 类实体预览
 *   4. 4 装备槽预览
 *   5. 已登录侧加个人状态卡（账户库容量）
 *   6. 底部版本注释
 */

import { useAuth } from '@/app/_shell/RootShell'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { postGameApi } from '@/lib/gameApi'

// FX 组件动态导入：避免 SSR 试图初始化 WebGL / Canvas
const Shader = dynamic(() => import('@/components/fx/Shader'), { ssr: false })

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
  orange: '#f0883e',
}

export default function Home() {
  const { user, loading } = useAuth()
  const [snapshot, setSnapshot] = useState(null)
  const [meStats, setMeStats] = useState(null)
  const envPollution = snapshot?.gamevars?.envPollution || 0

  useEffect(() => {
    async function loadSnapshot() {
      // 当前对局快照
      const { data } = await supabase
        .from('rooms')
        .select('id,gamenum,gamestate,gamevars,validnum,alivenum,deathnum,started_at')
        .in('gamestate', [0, 1])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setSnapshot(data || null)
    }
    loadSnapshot()
  }, [])

  useEffect(() => {
    async function loadMe() {
      if (!user) { setMeStats(null); return }
      const [stash, profile] = await Promise.all([
        supabase.from('player_stash').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('profiles').select('stash_capacity').eq('id', user.id).maybeSingle(),
      ])
      setMeStats({
        stashCount: stash.count || 0,
        capacity: profile.data?.stash_capacity || 40,
      })
    }
    loadMe()
  }, [user])

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60, color: C.dim }}>加载中...</div>
  }

  return (
    // 未登录态：外层不加 animate-in —— 其 fadeIn keyframe 带 transform，会使内部 position:fixed 的
    //   全屏 Hero 相对本 div 而非视口定位（动画期错位）。登录态照常 fade-in。（🎨 首页派单④·🧭）
    <div className={user ? 'animate-in' : undefined} style={{ paddingBottom: user ? 40 : 0 }}>
      <HeroSection user={user} envPollution={envPollution} snapshot={snapshot} />
      {user && meStats && <PersonalStatsCard meStats={meStats} />}
    </div>
  )
}

// ── Hero ──────────────────────────────────────────
// 设计稿来源：claude.ai/design 远星函馆 FX 演示。Hero 用「污染场」shader（fbm 域扭曲，柔和云团）+
// 「decode」文字粒子（纯 DOM，0 Canvas）。pollution 用当前 active 对局的 envPollution 联动。
// 注：原型 deep_path（隧道）首页太晕，按用户反馈改用 pollution_field 与设计稿一致。
function HeroSection({ user, envPollution = 0, snapshot }) {
  const router = useRouter()
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState(null)

  async function handleStartRaid() {
    if (snapshot?.id) {
      router.push(`/game/${snapshot.id}`)
      return
    }
    setStarting(true)
    setStartError(null)
    try {
      const { room } = await postGameApi('/api/game/rooms', { ensureNextRound: true })
      if (room?.id) {
        router.push(`/game/${room.id}`)
      } else {
        setStartError('未能获取下一局对局')
      }
    } catch (err) {
      setStartError(err?.message || '启动失败，请稍后再试')
    } finally {
      setStarting(false)
    }
  }

  // 首页派单④(🧭)：未登录态污染场铺满整个视口·零黑框 —— position:fixed inset:0 逃逸 RootShell
  //   padded/maxWidth 的 <main>，去掉 border/borderRadius/marginBottom/minHeight 卡片形态。
  //   登录态保持卡片式（下面还有个人档案卡·Hero 不能全屏盖住其他）→ 条件区分 user===null。
  const immersive = !user
  return (
    <div style={immersive ? {
      position: 'fixed', inset: 0, zIndex: 1,
      overflow: 'hidden', isolation: 'isolate',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: C.bg0, // shader 加载/兜底前的底色
    } : {
      position: 'relative', overflow: 'hidden', isolation: 'isolate',
      padding: '28px',
      borderRadius: 20, marginBottom: 28, minHeight: 520,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: `1px solid ${C.border}`,
      background: C.bg0, // shader 加载/兜底前的底色
    }}>
      {/* WebGL 着色器层（污染场 - fbm 域扭曲） */}
      <Shader name="pollution_field" pollution={envPollution / 100} intensity={0.85} />

      {/* 暗角遮罩，让中央入口更聚焦 */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 70% 60% at 50% 50%, transparent 30%, rgba(14,17,23,0.55) 100%)',
      }} />

      {/* 神秘感首屏：只留入口，不解释、不署名 */}
      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {user ? (
            <button
              onClick={handleStartRaid}
              disabled={starting}
              style={{
                ...ctaPrimary,
                cursor: starting ? 'wait' : 'pointer',
                opacity: starting ? 0.6 : 1,
              }}
            >
              {starting
                ? '准备就绪中…'
                : snapshot
                  ? '🚀 立即进入'
                  : '🚀 启动下一局'}
            </button>
          ) : (
            <>
              <Link href="/login" style={ctaPrimary}>登录</Link>
              <Link href="/register" style={ctaSecondary}>注册</Link>
            </>
          )}
        </div>

        {startError && (
          <div style={{
            marginTop: 16, fontSize: 12, color: C.red,
            background: `${C.red}15`, border: `1px solid ${C.red}40`,
            borderRadius: 8, padding: '8px 14px', display: 'inline-block',
          }}>
            ⚠ {startError}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 个人简报（已登录） ─────────────────────────────
function PersonalStatsCard({ meStats }) {
  return (
    <div style={sectionCard}>
      <SectionHeader title="👤 你的玩家档案" subtitle="档案速览" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        <Stat
          label="账户库容量"
          value={`${meStats.stashCount} / ${meStats.capacity}`}
          color={C.accent}
        />
      </div>
      <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link href="/stash" style={miniLink}>🎒 查看账户库</Link>
      </div>
    </div>
  )
}

// ── 共享样式 / 子组件 ────────────────────────────
const sectionCard = {
  background: C.bg1,
  borderRadius: 14,
  border: `1px solid ${C.border}`,
  padding: '20px 24px',
  marginBottom: 16,
}

function SectionHeader({ title, subtitle, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{title}</span>
      {subtitle && <span style={{ fontSize: 11, color: C.dim }}>{subtitle}</span>}
      <div style={{ flex: 1 }} />
      {right}
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: C.bg2, borderRadius: 8, border: `1px solid ${C.border}`, padding: '10px 14px' }}>
      <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: 'var(--font-jetbrains-mono), monospace', marginTop: 3 }}>{value}</div>
    </div>
  )
}

const ctaPrimary = {
  display: 'inline-block',
  padding: '14px 36px', borderRadius: 12,
  background: `linear-gradient(135deg, ${C.purple} 0%, ${C.accent} 100%)`,
  color: '#fff', textDecoration: 'none',
  fontWeight: 700, fontSize: 15, letterSpacing: 1,
  boxShadow: `0 0 30px ${C.purple}40`,
}

const ctaSecondary = {
  display: 'inline-block',
  padding: '14px 32px', borderRadius: 12,
  border: `1px solid ${C.border}`, background: 'transparent',
  color: C.dim, textDecoration: 'none', fontWeight: 500, fontSize: 15,
}

const miniLink = {
  padding: '6px 14px', borderRadius: 8,
  border: `1px solid ${C.border}`, background: C.bg2,
  color: C.dim, textDecoration: 'none', fontSize: 12,
}
