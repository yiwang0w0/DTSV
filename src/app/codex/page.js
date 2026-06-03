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
import { COLD_CASES } from '@/lib/constants'
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

// 残片所属纪元的主题色（主线卡每行保留各自纪元色，呼应时间轴）
const EPOCH_COLOR_BY_ID = Object.fromEntries([...EPOCHS, OTHER_EPOCH].map(e => [e.id, e.color]))
const EPOCH_NAME_BY_ID = Object.fromEntries([...EPOCHS, OTHER_EPOCH].map(e => [e.id, e.name]))
function epochColorOf(fragment) {
  return EPOCH_COLOR_BY_ID[epochIdOf(fragment)] || C.accent
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
    </div>
  )
}

export default function CodexPage() {
  const { user, loading: authLoading } = useAuth()
  const [fragments, setFragments] = useState([])
  const [playerFragments, setPlayerFragments] = useState([])
  const [coldCases, setColdCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [mainOpen, setMainOpen] = useState(true)
  const [coldOpen, setColdOpen] = useState(true)

  useEffect(() => {
    if (!user) return
    async function load() {
      const reqs = [
        supabase.from('fragment_pool').select('*').eq('enabled', true),
        supabase.from('player_fragments').select('*').eq('user_id', user.id),
      ]
      // 断链悬案区受 COLD_CASES.ENABLED 门控（关闭时不查询）
      if (COLD_CASES.ENABLED) {
        reqs.push(
          supabase.from('fragment_cold_cases')
            .select('id, fragment_id, missing_anchor_id, opened_at')
            .eq('user_id', user.id)
            .eq('status', 'open')
            .order('opened_at', { ascending: true }),
        )
      }
      const [poolRes, playerRes, coldRes] = await Promise.all(reqs)
      setFragments(poolRes.data || [])
      setPlayerFragments(playerRes.data || [])
      setColdCases((coldRes && coldRes.data) || [])
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

  // 主线故事链残片（is_main_story），按 F01→F15 编码顺序；未发现的占位为 decode_level 0
  const mainStory = useMemo(() => {
    const playerMap = new Map(playerFragments.map(pf => [pf.fragment_id, pf]))
    const list = fragments
      .filter(f => f.is_main_story)
      .sort((a, b) => (codeOf(a.name) || 'ZZ').localeCompare(codeOf(b.name) || 'ZZ'))
      .map(f => {
        const pd = playerMap.get(f.id)
        return { fragment: f, playerData: pd || { decode_level: 0 }, discovered: !!pd }
      })
    const discovered = list.filter(e => e.discovered).length
    const fullyDecoded = list.filter(e => e.discovered && e.playerData.decode_level >= 3).length
    return { list, discovered, fullyDecoded, total: list.length }
  }, [fragments, playerFragments])

  // 断链悬案视图：把 cold_cases 行 join 到 fragment_pool 取名/编码/纪元。
  // 已知碎片（fragment_id）= 玩家持有，显名；缺失锚点（missing_anchor_id）= 未持有，
  // 仅显编码作"开放循环"线索，名/内容保持遮蔽（不剧透，与主线时间轴未发现残片一致）。
  const coldCaseView = useMemo(() => {
    if (!COLD_CASES.ENABLED || coldCases.length === 0) return []
    const poolMap = new Map(fragments.map(f => [f.id, f]))
    return coldCases
      .map(cc => {
        const known = poolMap.get(cc.fragment_id)
        const anchor = poolMap.get(cc.missing_anchor_id)
        if (!known || !anchor) return null
        return {
          id: cc.id,
          known: { code: codeOf(known.name), name: displayName(known.name), epochColor: epochColorOf(known) },
          anchor: { code: codeOf(anchor.name), epochId: epochIdOf(anchor), epochColor: epochColorOf(anchor) },
        }
      })
      .filter(Boolean)
      .sort((a, b) => (a.known.code || 'ZZ').localeCompare(b.known.code || 'ZZ'))
  }, [coldCases, fragments])

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
          你已发现的数据残片，按远星函馆的六个纪元沿时间轴排列——这里是<strong style={{ color: C.text }}>进度总览</strong>：每个纪元的发现与解码进度一目了然。残片的完整内容、合成图谱与死亡记录在 <Link href="/archive" style={{ color: C.accent, textDecoration: 'none' }}>档案库</Link>。这条线只增不减，永久保存。
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

      {/* 主线时间轴折叠卡 — F01→F15 编码顺序，支线背景残片仅在下方各纪元分组里出现 */}
      {mainStory.total > 0 && (
        <section style={{
          border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2,
          overflow: 'hidden', marginBottom: 18,
        }}>
          <button
            onClick={() => setMainOpen(o => !o)}
            style={{
              width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
              padding: '12px 18px', border: 'none',
              background: `linear-gradient(90deg, ${C.purple}1c, transparent)`,
              borderBottom: mainOpen ? `1px solid ${C.border}` : 'none',
              borderLeft: `4px solid ${C.purple}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>📜 主线时间轴</span>
              <span style={{ fontSize: 11, color: C.purple, opacity: 0.85 }}>F01 → F15 主故事链</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: C.dim, fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
                {mainStory.discovered}/{mainStory.total} 发现
                {mainStory.fullyDecoded > 0 && <span style={{ color: C.green, marginLeft: 8 }}>· 全解 {mainStory.fullyDecoded}</span>}
              </span>
              <span style={{
                fontSize: 11, color: C.dim,
                transform: mainOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s',
              }}>▶</span>
            </span>
          </button>
          {mainOpen && (
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.6, padding: '0 2px 4px' }}>
                构成核心叙事的主线残片，按编号顺序排列。支线背景残片（修复规程 / 调度令）见下方各纪元分组。
              </div>
              {mainStory.list.map(({ fragment, playerData }) => (
                <FragmentRow
                  key={fragment.id}
                  fragment={fragment}
                  playerData={playerData}
                  epochColor={epochColorOf(fragment)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* 断链悬案折叠卡 — 持有残片却缺前置锚点时登记的"开放循环"，补齐锚点后回溯点亮 */}
      {COLD_CASES.ENABLED && coldCaseView.length > 0 && (
        <section style={{
          border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2,
          overflow: 'hidden', marginBottom: 18,
        }}>
          <button
            onClick={() => setColdOpen(o => !o)}
            style={{
              width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
              padding: '12px 18px', border: 'none',
              background: `linear-gradient(90deg, ${C.yellow}1c, transparent)`,
              borderBottom: coldOpen ? `1px solid ${C.border}` : 'none',
              borderLeft: `4px solid ${C.yellow}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>🔍 待解悬案</span>
              <span style={{ fontSize: 11, color: C.yellow, opacity: 0.85 }}>已知碎片指向尚未寻得的前置</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: C.dim, fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
                {coldCaseView.length} 条未解
              </span>
              <span style={{
                fontSize: 11, color: C.dim,
                transform: coldOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s',
              }}>▶</span>
            </span>
          </button>
          {coldOpen && (
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.6, padding: '0 2px 4px' }}>
                这些残片提到了你尚未寻得的前置记录。寻得缺失的锚点残片后，悬案会自动回溯点亮。
              </div>
              {coldCaseView.map(cc => (
                <div key={cc.id} style={{
                  background: C.bg2,
                  border: `1px solid ${C.border}`,
                  borderLeft: `3px solid ${C.yellow}`,
                  borderRadius: 8,
                  padding: '10px 14px',
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                }}>
                  {/* 已知碎片（持有，显名） */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {cc.known.code && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
                        background: `${cc.known.epochColor}1c`, color: cc.known.epochColor,
                        fontFamily: 'var(--font-jetbrains-mono), monospace', flexShrink: 0,
                      }}>
                        {cc.known.code}
                      </span>
                    )}
                    <span style={{
                      fontSize: 13, fontWeight: 700, color: C.text,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {cc.known.name}
                    </span>
                  </span>
                  {/* 断链指向 */}
                  <span style={{ fontSize: 12, color: C.dim2, fontFamily: 'var(--font-jetbrains-mono), monospace' }}>……（断链）⟶</span>
                  {/* 缺失锚点（未持有，仅显编码 + 纪元，名/内容遮蔽） */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {cc.anchor.code && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
                        background: `${cc.anchor.epochColor}1c`, color: cc.anchor.epochColor,
                        fontFamily: 'var(--font-jetbrains-mono), monospace', flexShrink: 0,
                      }}>
                        {cc.anchor.code}
                      </span>
                    )}
                    <span style={{
                      fontSize: 12, color: C.dim,
                      fontFamily: 'var(--font-jetbrains-mono), monospace', letterSpacing: 2,
                    }}>
                      ████
                    </span>
                    <span style={{ fontSize: 11, color: C.dim2 }}>
                      缺失锚点 · {EPOCH_NAME_BY_ID[cc.anchor.epochId] || '未编年档案'}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

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
                    : `尚未发现本纪元的残片（共 ${b.total} 个待发现）。在虚拟空间搜索 / 战斗 / 撤离中触达。`}
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
