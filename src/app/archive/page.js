'use client'

/**
 * /archive — 档案库（Decode Archive）
 *
 * 展示玩家跨周目持久化发现的数据残片。
 * 每个残片有 4 级解码度（0→3），显示对应层次的内容。
 * 残片按分类分组，用粒子化文字效果表现未解码部分。
 */

import { useEffect, useState, useMemo } from 'react'
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

const CATEGORY_META = {
  general:   { label: '通用记录',     icon: '📄', color: C.dim },
  omega:     { label: 'Ω 观测记录',   icon: '🌀', color: C.purple },
  eden:      { label: '伊甸协议',     icon: '🌿', color: C.green },
  bubble:    { label: '气泡宇宙',     icon: '🫧', color: C.cyan },
  structure: { label: '结构体档案',   icon: '🔷', color: C.accent },
}

// Phase 18.1: 三链阶段过滤
const CHAIN_META = {
  search:  { label: '搜索链',  icon: '🔍', color: C.accent },
  combat:  { label: '战斗链',  icon: '⚔️', color: C.red },
  extract: { label: '撤离链',  icon: '🚪', color: C.green },
}

const RARITY_META = {
  common:    { label: '普通', color: C.dim },
  uncommon:  { label: '优秀', color: C.green },
  rare:      { label: '稀有', color: C.accent },
  legendary: { label: '传说', color: C.yellow },
}

const DECODE_LABELS = ['未解码', '初步解码', '深度解码', '完全解码']
const DECODE_COLORS = [C.dim2, C.yellow, C.accent, C.green]

/** 根据 decode_level 返回应显示的文本 */
function getFragmentText(fragment, level) {
  switch (level) {
    case 0: return fragment.raw_text || '▓▒░ 数据损坏，无法读取 ░▒▓'
    case 1: return fragment.partial_1 || fragment.raw_text
    case 2: return fragment.partial_2 || fragment.partial_1
    case 3: return fragment.full_text || fragment.partial_2
    default: return fragment.raw_text
  }
}

/** 解码进度条 */
function DecodeBar({ level }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          style={{
            width: 16,
            height: 4,
            borderRadius: 2,
            background: i <= level ? DECODE_COLORS[level] : '#21262d',
            transition: 'background 0.3s',
          }}
        />
      ))}
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        color: DECODE_COLORS[level],
        marginLeft: 6,
      }}>
        {DECODE_LABELS[level]}
      </span>
    </div>
  )
}

/** 单个残片卡片 */
function FragmentCard({ fragment, playerData }) {
  const [expanded, setExpanded] = useState(false)
  const level = playerData.decode_level
  const cat = CATEGORY_META[fragment.category] || CATEGORY_META.general
  const rarity = RARITY_META[fragment.rarity] || RARITY_META.common
  const text = getFragmentText(fragment, level)

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        background: C.bg2,
        borderRadius: 10,
        border: `1px solid ${expanded ? cat.color + '60' : C.border}`,
        borderLeft: `3px solid ${cat.color}`,
        padding: '14px 18px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        opacity: level === 0 ? 0.7 : 1,
      }}
    >
      {/* 标题行 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 16 }}>{cat.icon}</span>
          <span style={{
            fontSize: 14,
            fontWeight: 700,
            color: level >= 3 ? C.text : C.dim,
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            letterSpacing: level === 0 ? 2 : 0,
          }}>
            {level === 0 ? '████████' : fragment.name}
          </span>
          <span style={{
            padding: '1px 8px',
            borderRadius: 10,
            fontSize: 9,
            fontWeight: 700,
            background: `${rarity.color}15`,
            color: rarity.color,
          }}>
            {rarity.label}
          </span>
          {/* Phase 18.1: chain 徽章 */}
          {(() => {
            const chainKey = fragment.phase_chain || 'search'
            const chainMeta = CHAIN_META[chainKey]
            if (!chainMeta) return null
            return (
              <span
                title={chainMeta.label}
                style={{
                  padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 700,
                  background: `${chainMeta.color}18`, color: chainMeta.color,
                  border: `1px solid ${chainMeta.color}40`,
                }}
              >
                {chainMeta.icon}
              </span>
            )
          })()}
        </div>
        <DecodeBar level={level} />
      </div>

      {/* 内容区 */}
      <div style={{
        fontSize: 13,
        lineHeight: 1.7,
        color: level === 0 ? C.dim2 : level >= 3 ? C.text : C.dim,
        fontFamily: level === 0 ? 'var(--font-jetbrains-mono), monospace' : 'inherit',
        letterSpacing: level === 0 ? 1.5 : 0,
        whiteSpace: 'pre-wrap',
        maxHeight: expanded ? 'none' : 60,
        overflow: 'hidden',
        maskImage: !expanded && text.length > 100 ? 'linear-gradient(to bottom, #000 50%, transparent)' : 'none',
        WebkitMaskImage: !expanded && text.length > 100 ? 'linear-gradient(to bottom, #000 50%, transparent)' : 'none',
      }}>
        {text}
      </div>

      {/* 底部信息 */}
      {expanded && (
        <div style={{
          marginTop: 10,
          paddingTop: 8,
          borderTop: `1px solid ${C.border}`,
          display: 'flex',
          gap: 16,
          fontSize: 11,
          color: C.dim2,
        }}>
          <span>分类: {cat.label}</span>
          <span>发现于周目 #{playerData.discover_cycle || '?'}</span>
          <span>首次发现: {new Date(playerData.discovered_at).toLocaleDateString('zh-CN')}</span>
          {playerData.last_decoded && level > 0 && (
            <span>最近解码: {new Date(playerData.last_decoded).toLocaleDateString('zh-CN')}</span>
          )}
        </div>
      )}
    </div>
  )
}

export default function ArchivePage() {
  const { user, loading: authLoading } = useAuth()
  const [fragments, setFragments] = useState([])
  const [playerFragments, setPlayerFragments] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [chainFilter, setChainFilter] = useState('all')

  useEffect(() => {
    if (!user) return

    async function load() {
      // 并行请求残片池和玩家发现记录
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

  // 将玩家数据合并到残片定义上
  const discoveredFragments = useMemo(() => {
    const playerMap = new Map(playerFragments.map(pf => [pf.fragment_id, pf]))
    return fragments
      .filter(f => playerMap.has(f.id))
      .map(f => ({ fragment: f, playerData: playerMap.get(f.id) }))
      .sort((a, b) => {
        // 先按分类，再按解码度降序，再按发现时间
        if (a.fragment.category !== b.fragment.category) {
          return (a.fragment.category || '').localeCompare(b.fragment.category || '')
        }
        if (a.playerData.decode_level !== b.playerData.decode_level) {
          return b.playerData.decode_level - a.playerData.decode_level
        }
        return new Date(b.playerData.discovered_at) - new Date(a.playerData.discovered_at)
      })
  }, [fragments, playerFragments])

  // 按分类 + 三链阶段过滤
  const filtered = useMemo(() => {
    let arr = discoveredFragments
    if (filter !== 'all') {
      arr = arr.filter(d => d.fragment.category === filter)
    }
    if (chainFilter !== 'all') {
      arr = arr.filter(d => (d.fragment.phase_chain || 'search') === chainFilter)
    }
    return arr
  }, [discoveredFragments, filter, chainFilter])

  // 统计
  const stats = useMemo(() => {
    const total = fragments.length
    const discovered = discoveredFragments.length
    const fullyDecoded = discoveredFragments.filter(d => d.playerData.decode_level >= 3).length
    const categories = [...new Set(discoveredFragments.map(d => d.fragment.category))]
    return { total, discovered, fullyDecoded, categories }
  }, [fragments, discoveredFragments])

  if (!user && !authLoading) {
    return (
      <div className="animate-in" style={{ textAlign: 'center', padding: 60 }}>
        <p style={{ color: C.dim, fontSize: 16 }}>
          请先 <Link href="/login" style={{ color: C.accent }}>登录</Link> 后查看档案库
        </p>
      </div>
    )
  }

  if (loading || authLoading) return <Spinner />

  return (
    <div className="animate-in">
      {/* 头部 */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>档案库</h2>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: C.dim }}>
          在异常段搜索中发现的数据残片。每次搜索都有概率发现新残片或推进已知残片的解码。知识跨周目永久保存。
        </p>
      </div>

      {/* 统计条 */}
      <div style={{
        display: 'flex',
        gap: 20,
        marginBottom: 20,
        padding: '14px 20px',
        background: C.bg1,
        borderRadius: 12,
        border: `1px solid ${C.border}`,
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-jetbrains-mono), monospace', color: C.text }}>
            {stats.discovered}
            <span style={{ fontSize: 12, color: C.dim, fontWeight: 400 }}> / {stats.total}</span>
          </div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>已发现</div>
        </div>
        <div style={{ width: 1, background: C.border }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-jetbrains-mono), monospace', color: C.green }}>
            {stats.fullyDecoded}
          </div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>完全解码</div>
        </div>
        <div style={{ width: 1, background: C.border }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-jetbrains-mono), monospace', color: C.accent }}>
            {stats.categories.length}
          </div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>分类覆盖</div>
        </div>
        {stats.total > 0 && (
          <>
            <div style={{ width: 1, background: C.border }} />
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  height: 6,
                  borderRadius: 3,
                  background: '#21262d',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${(stats.discovered / stats.total) * 100}%`,
                    background: `linear-gradient(90deg, ${C.accent}, ${C.green})`,
                    borderRadius: 3,
                    transition: 'width 0.5s',
                  }} />
                </div>
                <div style={{ fontSize: 10, color: C.dim2, marginTop: 4 }}>
                  总进度 {Math.round((stats.discovered / stats.total) * 100)}%
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 分类过滤器 */}
      {stats.categories.length > 1 && (
        <div style={{
          display: 'flex',
          gap: 4,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}>
          <button
            onClick={() => setFilter('all')}
            style={{
              padding: '5px 14px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              background: filter === 'all' ? C.accent : '#21262d',
              color: filter === 'all' ? '#fff' : C.dim,
            }}
          >
            全部 ({discoveredFragments.length})
          </button>
          {Object.entries(CATEGORY_META).map(([key, meta]) => {
            const count = discoveredFragments.filter(d => d.fragment.category === key).length
            if (count === 0) return null
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                style={{
                  padding: '5px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: filter === key ? `${meta.color}25` : '#21262d',
                  color: filter === key ? meta.color : C.dim,
                }}
              >
                {meta.icon} {meta.label} ({count})
              </button>
            )
          })}
        </div>
      )}

      {/* Phase 18.1: 三链阶段过滤器 */}
      {discoveredFragments.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          <button
            onClick={() => setChainFilter('all')}
            style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              border: 'none', cursor: 'pointer',
              background: chainFilter === 'all' ? C.dim : '#21262d',
              color: chainFilter === 'all' ? C.bg0 : C.dim2,
            }}
          >
            全链
          </button>
          {Object.entries(CHAIN_META).map(([key, meta]) => {
            const count = discoveredFragments.filter(d => (d.fragment.phase_chain || 'search') === key).length
            if (count === 0) return null
            return (
              <button
                key={key}
                onClick={() => setChainFilter(key)}
                style={{
                  padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  border: 'none', cursor: 'pointer',
                  background: chainFilter === key ? `${meta.color}25` : '#21262d',
                  color: chainFilter === key ? meta.color : C.dim,
                }}
              >
                {meta.icon} {meta.label} ({count})
              </button>
            )
          })}
        </div>
      )}

      {/* 残片列表 */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: C.dim }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📡</div>
          <p style={{ fontSize: 15 }}>尚未发现任何数据残片</p>
          <p style={{ fontSize: 12, color: C.dim2, marginTop: 8 }}>
            在异常段探索中执行「搜索」行动，有概率发现散落的旧时代数据碎片
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(({ fragment, playerData }) => (
            <FragmentCard
              key={fragment.id}
              fragment={fragment}
              playerData={playerData}
            />
          ))}
        </div>
      )}
    </div>
  )
}
