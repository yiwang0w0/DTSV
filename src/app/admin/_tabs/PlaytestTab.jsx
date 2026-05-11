'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Phase 22.2 — Playtest 总览
 * 最近 N 局 raid_stats 折线图（平均时长 / 撤离率 / 死亡率）+ 数据点列表
 */

const C = {
  bg2: '#161b22', border: '#30363d', dim: '#8b949e', dim2: '#484f58',
  green: '#3fb950', red: '#f85149', yellow: '#d29922', cyan: '#39d2c0', purple: '#bc8cff', accent: '#58a6ff',
}

export default function PlaytestTab({ toast }) {
  const [stats, setStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [windowSize, setWindowSize] = useState(30)

  async function load() {
    const { data, error } = await supabase
      .from('raid_stats')
      .select('*')
      .order('ended_at', { ascending: false })
      .limit(windowSize)
    if (error) {
      toast('加载失败: ' + error.message, 'error')
      setLoading(false)
      return
    }
    setStats(data || [])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [windowSize])

  const agg = useMemo(() => {
    if (stats.length === 0) return null
    const totalDur = stats.reduce((s, r) => s + (r.duration_seconds || 0), 0)
    const totalExtract = stats.reduce((s, r) => s + (r.extract_count || 0), 0)
    const totalDeath = stats.reduce((s, r) => s + (r.death_count || 0), 0)
    const totalPlayer = stats.reduce((s, r) => s + (r.player_count || 0), 0)
    const totalFragments = stats.reduce((s, r) => s + (r.fragments_extracted || 0), 0)
    const totalChamberAvg = stats.reduce((s, r) => s + Number(r.chamber_count_avg || 0), 0)
    return {
      n: stats.length,
      avgMinutes: stats.length > 0 ? (totalDur / stats.length / 60).toFixed(1) : 0,
      extractRate: totalPlayer > 0 ? Math.round(totalExtract * 100 / totalPlayer) : 0,
      deathRate: totalPlayer > 0 ? Math.round(totalDeath * 100 / totalPlayer) : 0,
      avgFragments: stats.length > 0 ? (totalFragments / stats.length).toFixed(1) : 0,
      avgChamberDepth: stats.length > 0 ? (totalChamberAvg / stats.length).toFixed(1) : 0,
    }
  }, [stats])

  const endingDist = useMemo(() => {
    const counts = {}
    for (const r of stats) {
      const k = r.ending_key || '(无)'
      counts[k] = (counts[k] || 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [stats])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.dim }}>加载中...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 13, color: C.dim }}>
          Playtest 总览 — 最近 {stats.length} 局 raid_stats 汇总
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[10, 30, 100].map(n => (
            <button key={n}
              onClick={() => setWindowSize(n)}
              style={{
                padding: '4px 12px', borderRadius: 6,
                background: windowSize === n ? C.accent : C.bg2,
                color: windowSize === n ? '#fff' : C.dim,
                border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>
              最近 {n}
            </button>
          ))}
        </div>
      </div>

      {!agg ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.dim }}>暂无数据</div>
      ) : (
        <>
          {/* 汇总卡片 */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10,
            marginBottom: 20,
          }}>
            <Card label="样本数" value={agg.n} color={C.accent} />
            <Card label="平均时长" value={`${agg.avgMinutes} 分钟`} color={agg.avgMinutes >= 25 && agg.avgMinutes <= 35 ? C.green : C.yellow}
              hint={agg.avgMinutes >= 25 && agg.avgMinutes <= 35 ? '在 30 分钟节奏目标内' : '偏离 30 分钟节奏目标'} />
            <Card label="撤离率" value={`${agg.extractRate}%`} color={C.green} />
            <Card label="死亡率" value={`${agg.deathRate}%`} color={C.red} />
            <Card label="平均残片提取" value={agg.avgFragments} color={C.purple} />
            <Card label="平均探索深度" value={`${agg.avgChamberDepth} chamber`} color={C.cyan} />
          </div>

          {/* 结局分布 */}
          {endingDist.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: C.dim, marginBottom: 8 }}>结局分布</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {endingDist.map(([k, n]) => (
                  <span key={k} style={{
                    padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    background: `${C.yellow}15`, color: C.yellow, border: `1px solid ${C.yellow}40`,
                  }}>
                    {k}: {n} ({Math.round(n * 100 / agg.n)}%)
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 折线图（时长 + 深度，简单 SVG） */}
          <div style={{
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16,
            marginBottom: 20,
          }}>
            <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>每局时长（分钟）— 旧 → 新</div>
            <DurationChart stats={stats} />
          </div>

          {/* 数据点列表 */}
          <div style={{ fontSize: 13, color: C.dim, marginBottom: 8 }}>数据点（{stats.length} 行）</div>
          <div style={{
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8,
            maxHeight: 480, overflowY: 'auto',
          }}>
            <table style={{ width: '100%', fontSize: 11, color: '#e6edf3', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#1f2937' }}>
                <tr>
                  <Th>结束时间</Th><Th>周目</Th><Th>分钟</Th><Th>玩家</Th><Th>撤离</Th><Th>死亡</Th>
                  <Th>残片</Th><Th>路径长</Th><Th>平均深</Th><Th>污染</Th><Th>结局</Th>
                </tr>
              </thead>
              <tbody>
                {stats.map(r => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <Td>{new Date(r.ended_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</Td>
                    <Td>#{r.gamenum}</Td>
                    <Td color={r.duration_seconds >= 25 * 60 && r.duration_seconds <= 35 * 60 ? C.green : C.yellow}>
                      {Math.round((r.duration_seconds || 0) / 60)}
                    </Td>
                    <Td>{r.player_count || 0}</Td>
                    <Td color={C.green}>{r.extract_count || 0}</Td>
                    <Td color={C.red}>{r.death_count || 0}</Td>
                    <Td color={C.purple}>{r.fragments_extracted || 0}</Td>
                    <Td>{r.raid_path_length || 0}</Td>
                    <Td>{Number(r.chamber_count_avg || 0).toFixed(1)}</Td>
                    <Td>{r.env_pollution_final || 0}%</Td>
                    <Td color={C.yellow}>{r.ending_key || '-'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function Card({ label, value, color, hint }) {
  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${color}`,
      borderRadius: 8, padding: 12,
    }}>
      <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: C.dim2, marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

function Th({ children }) {
  return <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, color: C.dim, fontWeight: 600 }}>{children}</th>
}
function Td({ children, color }) {
  return <td style={{ padding: '6px 10px', color: color || '#e6edf3', whiteSpace: 'nowrap' }}>{children}</td>
}

function DurationChart({ stats }) {
  // 反序：旧 → 新
  const data = [...stats].reverse()
  if (data.length === 0) return <div style={{ height: 100 }} />
  const W = 800, H = 100, padding = 20
  const xs = data.map((_, i) => padding + (i * (W - 2 * padding)) / Math.max(1, data.length - 1))
  const minutes = data.map(r => (r.duration_seconds || 0) / 60)
  const maxMin = Math.max(40, ...minutes)
  const ys = minutes.map(m => H - padding - (m / maxMin) * (H - 2 * padding))
  const points = xs.map((x, i) => `${x},${ys[i]}`).join(' ')

  // 30 分钟目标线
  const targetY = H - padding - (30 / maxMin) * (H - 2 * padding)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 120 }}>
      <line x1={padding} y1={targetY} x2={W - padding} y2={targetY} stroke={C.green} strokeWidth={1} strokeDasharray="4,4" opacity={0.5} />
      <text x={W - padding} y={targetY - 4} fill={C.green} fontSize={10} textAnchor="end">30 min 目标</text>
      <polyline fill="none" stroke={C.cyan} strokeWidth={2} points={points} />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r={3} fill={C.cyan}>
          <title>{minutes[i].toFixed(1)} 分钟</title>
        </circle>
      ))}
    </svg>
  )
}
