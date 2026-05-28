'use client'

/**
 * /codex — 纪元档案（Codex）
 *
 * 把玩家已发现的数据残片按"六纪元"（最深层 lore 时间轴）分组陈列，
 * 配合每纪元的情感主题与解码进度摘要。
 * 与 /archive（按分类 / 三链陈列、含死亡日志 / 知识图谱）互补：
 * 本页只回答一个问题——"我在这条时间轴上走到哪了"。
 *
 * 纪元定义与残片归属来自 docs/narrative-vision.md 第二 / 四章。
 * fragment_pool 无 epoch 列，按残片名的 F01-F15 编码映射到纪元。
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../layout'
import { Spinner } from '../admin/_shared/ui'

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
  cyan:   '#39d2c0',
}

// 六纪元权威分期（docs/narrative-vision.md 第二章）。chronological，1→6。
const EPOCHS = [
  { id: 1, name: '构筑纪', theme: '宏大 · 清单化',    blurb: '远星函馆主环结构原始建造期',            color: '#79c0ff' },
  { id: 2, name: '运维纪', theme: '例行 · 麻木 · 推卸', blurb: '长稳运行、17 号段日常巡检、文档官僚化',   color: '#d8b886' },
  { id: 3, name: '伊甸纪', theme: '野心 · 技术乐观',   blurb: '伊甸港高密度泡层投放期、平台繁盛',        color: '#f0a868' },
  { id: 4, name: '失衡纪', theme: '失控 · 震惊',       blurb: '3 号干道事故 → Ω-段诞生（"它留下来了"）', color: '#f85149' },
  { id: 5, name: '封锁纪', theme: '恐惧 · 孤立',       blurb: '伊甸港封锁、D-8821 逃逸、PI 序列启用',    color: '#39d2c0' },
  { id: 6, name: '共构纪', theme: '未完待续 · 共生',   blurb: 'PI-1 探针、Ω-段分类失败、深界路径暴露',   color: '#bc8cff', current: true },
]

// 残片编码 → 主要纪元（docs/narrative-vision.md 第四章对照表）。
const FRAGMENT_EPOCH = {
  F01: 2, F02: 5, F03: 2, F04: 5, F05: 5,
  F06: 4, F07: 5, F08: 5, F09: 5, F10: 5,
  F11: 6, F12: 6, F13: 6, F14: 6, F15: 6,
}

const OTHER_EPOCH = { id: 0, name: '未编年档案', theme: '尚未归入时间轴', blurb: '无法对应到六纪元的残片', color: C.dim }

const DECODE_LABELS = ['未解码', '初步解码', '深度解码', '完全解码']
const DECODE_COLORS = [C.dim2, C.yellow, C.accent, C.green]

function codeOf(name) {
  const m = (name || '').match(/^F\d{2}/)
  return m ? m[0] : null
}

function displayName(name) {
  return (name || '').replace(/^F\d{2}\s*/, '')
}

function epochIdOf(fragment) {
  const code = codeOf(fragment.name)
  if (code && FRAGMENT_EPOCH[code]) return FRAGMENT_EPOCH[code]
  return 0
}

/** 当前 decode_level 应展示的文本（用于摘要预览） */
function fragmentText(fragment, level) {
  switch (level) {
    case 1: return fragment.partial_1 || fragment.raw_text
    case 2: return fragment.partial_2 || fragment.partial_1
    case 3: return fragment.full_text || fragment.partial_2
    default: return ''
  }
}

/** 解码进度条（与 /archive 一致的视觉语言） */
function DecodeBar({ level }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{
          width: 14, height: 4, borderRadius: 2,
          background: i <= level ? DECODE_COLORS[level] : '#21262d',
          transition: 'background 0.3s',
        }} />
      ))}
      <span style={{ fontSize: 10, fontWeight: 600, color: DECODE_COLORS[level], marginLeft: 6 }}>
        {DECODE_LABELS[level]}
      </span>
    </div>
  )
}

function FragmentRow({ fragment, playerData, epochColor }) {
  const level = playerData.decode_level
  const code = codeOf(fragment.name)
  const preview = fragmentText(fragment, level)
  return (
    <div style={{
      background: C.bg2,
      border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${epochColor}`,
      borderRadius: 8,
      padding: '10px 14px',
      opacity: level === 0 ? 0.78 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          {code && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
              background: `${epochColor}1c`, color: epochColor, fontFamily: 'var(--font-jetbrains-mono), monospace',
              flexShrink: 0,
            }}>
              {code}
            </span>
          )}
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: level >= 1 ? C.text : C.dim,
            fontFamily: level === 0 ? 'var(--font-jetbrains-mono), monospace' : 'inherit',
            letterSpacing: level === 0 ? 2 : 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {level === 0 ? '████████' : displayName(fragment.name)}
          </span>
        </div>
        <DecodeBar level={level} />
      </div>
      {level >= 1 && preview && (
        <div style={{
          marginTop: 6, fontSize: 12, lineHeight: 1.6,
          color: level >= 3 ? C.dim : C.dim2,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {preview}
        </div>
      )}
    </div>
  )
}

export default function CodexPage() {
  const { user, loading: authLoading } = useAuth()
  const [fragments, setFragments] = useState([])
  const [playerFragments, setPlayerFragments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    async function load() {
      const [poolRes, playerRes] = await Promise.all([
        supabase.from('fragment_pool').select('*').eq('enabled', true),
        supabase.from('player_fragments').select('*').eq('user_id', user.id),
      ])
      setFragments(poolRes.data || [])
      setPlayerFragments(playerRes.data || [])
      setLoading(false)
    }
    load()
  }, [user])

  // 按纪元聚合：每纪元的全部残片（total）+ 玩家已发现的残片（discovered，带 playerData）
  const byEpoch = useMemo(() => {
    const playerMap = new Map(playerFragments.map(pf => [pf.fragment_id, pf]))
    const buckets = new Map()
    const ensure = id => {
      if (!buckets.has(id)) buckets.set(id, { total: 0, fullyDecoded: 0, discovered: [] })
      return buckets.get(id)
    }
    for (const f of fragments) {
      const epochId = epochIdOf(f)
      const b = ensure(epochId)
      b.total += 1
      const pd = playerMap.get(f.id)
      if (pd) {
        b.discovered.push({ fragment: f, playerData: pd })
        if (pd.decode_level >= 3) b.fullyDecoded += 1
      }
    }
    // 每纪元内：先按编码顺序（F01→F15），无编码垫底
    for (const b of buckets.values()) {
      b.discovered.sort((a, x) => {
        const ca = codeOf(a.fragment.name) || 'ZZ'
        const cx = codeOf(x.fragment.name) || 'ZZ'
        return ca.localeCompare(cx)
      })
    }
    return buckets
  }, [fragments, playerFragments])

  const stats = useMemo(() => {
    const total = fragments.length
    const discovered = playerFragments.filter(pf => fragments.some(f => f.id === pf.fragment_id)).length
    const fullyDecoded = playerFragments.filter(pf => pf.decode_level >= 3).length
    return { total, discovered, fullyDecoded }
  }, [fragments, playerFragments])

  if (!user && !authLoading) {
    return (
      <div className="animate-in" style={{ textAlign: 'center', padding: 60 }}>
        <p style={{ color: C.dim, fontSize: 16 }}>
          请先 <Link href="/login" style={{ color: C.accent }}>登录</Link> 后查看纪元档案
        </p>
      </div>
    )
  }

  if (loading || authLoading) return <Spinner />

  const allEpochs = [...EPOCHS, OTHER_EPOCH]

  return (
    <div className="animate-in">
      {/* 头部 */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>纪元档案</h2>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: C.dim, lineHeight: 1.7 }}>
          你已解码的数据残片，按远星函馆的六个纪元沿时间轴排列。
          每个残片对应一个时代——从最初的「构筑纪」到你当下身处的「共构纪」。这条线只增不减，永久保存。
        </p>
      </div>

      {/* 总进度条 */}
      <div style={{
        display: 'flex', gap: 20, marginBottom: 24, padding: '14px 20px',
        background: C.bg1, borderRadius: 12, border: `1px solid ${C.border}`, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-jetbrains-mono), monospace', color: C.text }}>
            {stats.discovered}
            <span style={{ fontSize: 12, color: C.dim, fontWeight: 400 }}> / {stats.total}</span>
          </div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>已发现残片</div>
        </div>
        <div style={{ width: 1, background: C.border }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-jetbrains-mono), monospace', color: C.green }}>
            {stats.fullyDecoded}
          </div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>完全解码</div>
        </div>
        {stats.total > 0 && (
          <div style={{ flex: 1, minWidth: 160, display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ height: 6, borderRadius: 3, background: '#21262d', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${(stats.discovered / stats.total) * 100}%`,
                  background: `linear-gradient(90deg, ${C.accent}, ${C.purple})`,
                  borderRadius: 3, transition: 'width 0.5s',
                }} />
              </div>
              <div style={{ fontSize: 10, color: C.dim2, marginTop: 4 }}>
                时间轴揭示度 {Math.round((stats.discovered / stats.total) * 100)}%
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 六纪元时间轴 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {allEpochs.map(epoch => {
          const b = byEpoch.get(epoch.id) || { total: 0, fullyDecoded: 0, discovered: [] }
          // 其他档案桶若无任何残片则不渲染
          if (epoch.id === 0 && b.total === 0) return null
          return (
            <section key={epoch.id} style={{
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              background: C.bg2,
              overflow: 'hidden',
            }}>
              {/* 纪元表头 */}
              <div style={{
                padding: '12px 18px',
                background: `linear-gradient(90deg, ${epoch.color}14, transparent)`,
                borderBottom: b.discovered.length > 0 ? `1px solid ${C.border}` : 'none',
                borderLeft: `4px solid ${epoch.color}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    {epoch.id > 0 && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: epoch.color,
                        fontFamily: 'var(--font-jetbrains-mono), monospace',
                      }}>
                        第 {epoch.id} 纪元
                      </span>
                    )}
                    <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{epoch.name}</span>
                    {epoch.current && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
                        background: `${epoch.color}22`, color: epoch.color, border: `1px solid ${epoch.color}55`,
                      }}>
                        当前
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: epoch.color, opacity: 0.85 }}>{epoch.theme}</span>
                  </div>
                  <span style={{
                    fontSize: 11, color: C.dim, fontFamily: 'var(--font-jetbrains-mono), monospace', flexShrink: 0,
                  }}>
                    {b.total > 0 ? `${b.discovered.length}/${b.total} 发现` : '仅文档残存'}
                    {b.fullyDecoded > 0 && <span style={{ color: C.green, marginLeft: 8 }}>· 全解 {b.fullyDecoded}</span>}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>{epoch.blurb}</div>
              </div>

              {/* 残片列表 / 空态 */}
              {b.discovered.length > 0 ? (
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {b.discovered.map(({ fragment, playerData }) => (
                    <FragmentRow
                      key={fragment.id}
                      fragment={fragment}
                      playerData={playerData}
                      epochColor={epoch.color}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ padding: '14px 18px', fontSize: 12, color: C.dim2 }}>
                  {b.total === 0
                    ? '本纪元仅以文档形式残存，暂无可拾取的残片。'
                    : `尚未发现本纪元的残片（共 ${b.total} 个待发现）。在异常段搜索 / 战斗 / 撤离中触达。`}
                </div>
              )}
            </section>
          )
        })}
      </div>

      {/* 底部引导：跳转完整档案库 */}
      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <Link href="/archive" style={{ fontSize: 12, color: C.accent, textDecoration: 'none' }}>
          → 前往档案库查看完整残片内容、合成图谱与死亡记录
        </Link>
      </div>
    </div>
  )
}
