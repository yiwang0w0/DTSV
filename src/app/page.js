'use client'

/**
 * 首页 / 远星函馆 × DTSV
 *
 * 结构：
 *   1. Hero 区 — 世界观介绍 + 主 CTA「立即出勤」
 *   2. 当前对局快照（如果存在）
 *   3. 4 类实体预览
 *   4. 4 装备槽预览
 *   5. 已登录侧加个人状态卡（库存 / 合同 / 撤离次数）
 *   6. 底部版本注释
 */

import { useAuth } from './layout'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import {
  ENTITY_TYPE_META,
  LOADOUT_SLOT_META,
  LOADOUT_SLOTS,
  POLLUTION_TIER_META,
} from '@/lib/constants'

// FX 组件动态导入：避免 SSR 试图初始化 WebGL / Canvas
const Shader = dynamic(() => import('@/components/fx/Shader'), { ssr: false })
const ParticleText = dynamic(() => import('@/components/fx/ParticleText'), { ssr: false })

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

function pollutionTier(env) {
  if (env >= 100) return 'meltdown'
  if (env >= 80)  return 'severe'
  if (env >= 60)  return 'moderate'
  if (env >= 40)  return 'mild'
  return 'none'
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
      const [stash, contracts, profile] = await Promise.all([
        supabase.from('player_stash').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('player_contracts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'active'),
        supabase.from('profiles').select('stash_capacity').eq('id', user.id).maybeSingle(),
      ])
      setMeStats({
        stashCount: stash.count || 0,
        capacity: profile.data?.stash_capacity || 40,
        activeContracts: contracts.count || 0,
      })
    }
    loadMe()
  }, [user])

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60, color: C.dim }}>加载中...</div>
  }

  return (
    <div className="animate-in" style={{ paddingBottom: 40 }}>
      <HeroSection user={user} envPollution={envPollution} snapshot={snapshot} />
      <RaidSnapshotCard snapshot={snapshot} />
      {user && meStats && <PersonalStatsCard meStats={meStats} />}
      <EntitiesPreview />
      <LoadoutPreview />
      <Footer />
    </div>
  )
}

// ── Hero ──────────────────────────────────────────
// 设计稿来源：claude.ai/design 远星函馆 FX 演示。Hero 用「污染场」shader（fbm 域扭曲，柔和云团）+
// 「decode」文字粒子（纯 DOM，0 Canvas）。pollution 用当前 active 对局的 envPollution 联动。
// 注：原型 deep_path（隧道）首页太晕，按用户反馈改用 pollution_field 与设计稿一致。
function HeroSection({ user, envPollution = 0, snapshot }) {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden', isolation: 'isolate',
      padding: '80px 28px 70px',
      borderRadius: 20, marginBottom: 28, minHeight: 460,
      border: `1px solid ${C.border}`,
      background: C.bg0, // shader 加载/兜底前的底色
    }}>
      {/* WebGL 着色器层（污染场 - fbm 域扭曲；intensity 0.85 让前景文字更清晰） */}
      <Shader name="pollution_field" pollution={envPollution / 100} intensity={0.85} />

      {/* 暗角遮罩，让中央文字更清晰 */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 70% 60% at 50% 50%, transparent 30%, rgba(14,17,23,0.55) 100%)',
      }} />

      <div style={{ position: 'relative', zIndex: 2, maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: C.purple, letterSpacing: 4, marginBottom: 14, fontWeight: 600 }}>
          第六纪元 · 深界时代
        </div>

        {/* 标题文字粒子（decode：字符在符号池中乱滚后定格） */}
        <div style={{ marginBottom: 8 }}>
          <ParticleText
            text="远星函馆 × DTSV"
            mode="decode"
            pollution={envPollution / 100}
            color={C.purple}
            accent={C.accent}
            size={48}
            weight={800}
            letterSpacing={2}
          />
        </div>
        <div style={{ fontSize: 14, color: C.dim, marginBottom: 28, fontFamily: 'monospace' }}>
          17 号异常段 · PI 引导者协议 · v1.0
        </div>

        <p style={{
          fontSize: 14, color: C.dim, lineHeight: 1.9, marginBottom: 36,
          maxWidth: 560, margin: '0 auto 36px',
        }}>
          深界结构在塌陷环带边缘缓慢漂移，泡层文明的残响仍在 17 号异常段循环。
          作为 PI 引导者（Pioneer Interface Operator），你被派往未归档主控路径的最深处，
          完成 <span style={{ color: C.accent }}>探查 / 对抗 / 提取</span>，
          决定这段异常的归属——
          <span style={{ color: C.purple }}>崩解 / 清算 / 合流 / 探索</span>。
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {user ? (
            <Link href={snapshot ? `/game/${snapshot.id}` : '/rooms'} style={ctaPrimary}>🚀 立即出勤</Link>
          ) : (
            <>
              <Link href="/login" style={ctaPrimary}>登录</Link>
              <Link href="/register" style={ctaSecondary}>注册</Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 当前对局快照 ──────────────────────────────────
function RaidSnapshotCard({ snapshot }) {
  if (!snapshot) {
    return (
      <div style={sectionCard}>
        <SectionHeader title="🌌 现役异常段" subtitle="对局状态" />
        <div style={{ padding: '24px 0', textAlign: 'center', color: C.dim2, fontSize: 13 }}>
          系统正在重新部署 17 号异常段，下一段对局即将就绪
        </div>
      </div>
    )
  }
  const env = snapshot.gamevars?.envPollution || 0
  const tier = pollutionTier(env)
  const tierMeta = POLLUTION_TIER_META[tier]
  const turn = snapshot.gamevars?.turn || 0
  const players = Object.values(snapshot.gamevars?.players || {})
  const extracted = players.filter(p => p?.extracted).length
  const isActive = snapshot.gamestate === 1

  return (
    <Link href={`/game/${snapshot.id}`} style={{ textDecoration: 'none' }}>
      <div style={{ ...sectionCard, cursor: 'pointer', transition: 'border-color .2s' }}
           className="hov-card">
        <SectionHeader
          title="🌌 现役异常段"
          subtitle={`#${snapshot.gamenum || snapshot.id} · ${isActive ? '进行中' : '等待集结'}`}
          right={<span style={{ fontSize: 11, color: C.accent }}>查看详情 →</span>}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 14 }}>
          <Stat label="在场" value={snapshot.alivenum || 0} color={C.text} />
          <Stat label="已撤离" value={extracted} color={C.green} />
          <Stat label="阵亡" value={snapshot.deathnum || 0} color={C.red} />
          <Stat label="周目" value={turn} color={C.dim} />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
            <span style={{ color: C.dim }}>污染度 · {tierMeta?.label}</span>
            <span style={{ color: tierMeta?.color, fontFamily: 'monospace', fontWeight: 700 }}>{env}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: C.bg2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${env}%`, background: tierMeta?.color, transition: 'width .3s' }} />
          </div>
        </div>
      </div>
    </Link>
  )
}

// ── 个人简报（已登录） ─────────────────────────────
function PersonalStatsCard({ meStats }) {
  return (
    <div style={sectionCard}>
      <SectionHeader title="👤 你的引导者档案" subtitle="档案速览" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        <Stat
          label="账户库容量"
          value={`${meStats.stashCount} / ${meStats.capacity}`}
          color={C.accent}
        />
        <Stat label="进行中合同" value={meStats.activeContracts} color={C.yellow} />
      </div>
      <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link href="/stash" style={miniLink}>🎒 查看账户库</Link>
        <Link href="/contracts" style={miniLink}>📜 查看合同</Link>
      </div>
    </div>
  )
}

// ── 4 类实体预览 ──────────────────────────────────
function EntitiesPreview() {
  const ENTITIES = [
    { key: 'remnant',     desc: '泡层文明残响。主动搜查目标，周期性撤回 Ω-段。', subTag: '敌对' },
    { key: 'infiltrator', desc: '伪造 PI 编号潜入异常段。隐蔽攻击，识别失败可致命。', subTag: '敌对' },
    { key: 'symbiote',    desc: '驻守关键节点。可交易：环段部件 ↔ Ω物质。', subTag: '可交易' },
    { key: 'observer',    desc: '只记录、不直接对抗。可换取深界路径情报。', subTag: '可交易' },
  ]
  return (
    <div style={sectionCard}>
      <SectionHeader title="🌐 4 类异常实体" subtitle="入侵者档案" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {ENTITIES.map(e => {
          const meta = ENTITY_TYPE_META[e.key]
          return (
            <div key={e.key} style={{
              padding: '14px 14px 14px 16px',
              borderRadius: 10,
              background: C.bg2,
              border: `1px solid ${meta.color}30`,
              borderLeft: `3px solid ${meta.color}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>{meta.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: meta.color }}>{meta.label}</span>
                <span style={{
                  marginLeft: 'auto', fontSize: 9, padding: '1px 6px', borderRadius: 6,
                  background: `${meta.color}18`, color: meta.color, border: `1px solid ${meta.color}40`,
                }}>{e.subTag}</span>
              </div>
              <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.7 }}>{e.desc}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 4 装备槽预览 ──────────────────────────────────
function LoadoutPreview() {
  return (
    <div style={sectionCard}>
      <SectionHeader title="🎒 装载 · 4 槽" subtitle="栖居带预部署模块" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {LOADOUT_SLOTS.map(slot => {
          const meta = LOADOUT_SLOT_META[slot]
          return (
            <div key={slot} style={{
              padding: '14px 14px 14px 16px',
              borderRadius: 10,
              background: C.bg2,
              border: `1px solid ${meta.color}30`,
              borderLeft: `3px solid ${meta.color}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>{meta.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: meta.color }}>{meta.label}</span>
              </div>
              <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.7 }}>{meta.desc}</div>
            </div>
          )
        })}
      </div>
      <div style={{
        marginTop: 14, padding: '10px 14px', borderRadius: 8,
        background: `${C.yellow}10`, border: `1px solid ${C.yellow}30`, fontSize: 11, color: C.yellow,
      }}>
        ⚠ 出勤前最多带：4 装备 + 4 消耗品 = 8 件总载荷。死亡 = 全失，撤离 = 入库。
      </div>
    </div>
  )
}

// ── Footer ────────────────────────────────────────
function Footer() {
  return (
    <div style={{
      marginTop: 28, padding: '20px 28px',
      borderTop: `1px solid ${C.border}`,
      textAlign: 'center', fontSize: 11, color: C.dim2,
      fontFamily: 'monospace', letterSpacing: 1,
    }}>
      DTSV × 远星函馆 · Phase 9 · 深界路径已开放
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
