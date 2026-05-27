'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Phase 25d — 探针遥测 (cross_room_probes)
 *
 * 读 v_probe_telemetry (per-owner aggregate) + v_probe_telemetry_by_chamber
 * 三个核心指标：probes_left / total_encountered / outcome_breakdown
 */

const C = {
  bg2: '#161b22', border: '#30363d', dim: '#8b949e', dim2: '#484f58',
  green: '#3fb950', red: '#f85149', yellow: '#d29922',
  cyan: '#39d2c0', purple: '#bc8cff', accent: '#58a6ff',
}

export default function ProbeTelemetryTab({ toast }) {
  const [byOwner, setByOwner] = useState([])
  const [byChamber, setByChamber] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const [r1, r2] = await Promise.all([
      supabase
        .from('v_probe_telemetry')
        .select('*')
        .order('total_encountered', { ascending: false })
        .limit(100),
      supabase
        .from('v_probe_telemetry_by_chamber')
        .select('*')
        .order('probes_active', { ascending: false })
        .limit(50),
    ])
    if (r1.error) toast(`owner 视图加载失败: ${r1.error.message}`, 'error')
    if (r2.error) toast(`chamber 视图加载失败: ${r2.error.message}`, 'error')
    setByOwner(r1.data || [])
    setByChamber(r2.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const agg = useMemo(() => {
    if (byOwner.length === 0) return null
    let probesLeft = 0, encountered = 0, defeated = 0, spared = 0, killedAttacker = 0
    for (const r of byOwner) {
      probesLeft     += Number(r.probes_left || 0)
      encountered    += Number(r.total_encountered || 0)
      defeated       += Number(r.total_defeated || 0)
      spared         += Number(r.total_spared || 0)
      killedAttacker += Number(r.total_killed_attacker || 0)
    }
    const recorded = defeated + spared + killedAttacker
    return {
      probesLeft, encountered, defeated, spared, killedAttacker,
      defeatedPct:       recorded > 0 ? Math.round(defeated * 100 / recorded) : 0,
      sparedPct:         recorded > 0 ? Math.round(spared * 100 / recorded) : 0,
      killedAttackerPct: recorded > 0 ? Math.round(killedAttacker * 100 / recorded) : 0,
      uniqueOwners:      byOwner.length,
    }
  }, [byOwner])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.dim }}>加载中...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 13, color: C.dim }}>
          🛰️ 探针遥测 — research-2026-05-27-v3 主题 E 埋点视图
        </div>
        <button onClick={load} style={{
          padding: '4px 12px', borderRadius: 6, background: C.bg2, color: C.dim,
          border: `1px solid ${C.border}`, fontSize: 12, cursor: 'pointer',
        }}>↻ 刷新</button>
      </div>

      {!agg ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.dim }}>暂无探针数据（cross_room_probes 表为空）</div>
      ) : (
        <>
          {/* 汇总卡片 */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10,
            marginBottom: 20,
          }}>
            <Card label="留存探针" value={agg.probesLeft} color={C.accent} hint={`active & 未过期`} />
            <Card label="累计遭遇" value={agg.encountered} color={C.cyan} />
            <Card label="击败" value={`${agg.defeated} (${agg.defeatedPct}%)`} color={C.red} />
            <Card label="放过" value={`${agg.spared} (${agg.sparedPct}%)`} color={C.green} />
            <Card label="反杀玩家" value={`${agg.killedAttacker} (${agg.killedAttackerPct}%)`} color={C.purple} />
            <Card label="探针 owner 数" value={agg.uniqueOwners} color={C.yellow} />
          </div>

          {/* outcome breakdown 横条 */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, color: C.dim, marginBottom: 6 }}>outcome 分布 (defeated / spared / killed_attacker)</div>
            <div style={{ display: 'flex', height: 18, borderRadius: 9, overflow: 'hidden', background: C.bg2, border: `1px solid ${C.border}` }}>
              <Bar pct={agg.defeatedPct}       color={C.red}    label="击败" />
              <Bar pct={agg.sparedPct}         color={C.green}  label="放过" />
              <Bar pct={agg.killedAttackerPct} color={C.purple} label="反杀" />
            </div>
          </div>

          {/* per-owner 表 */}
          <SectionTitle>Per-Owner（Top 100，按累计遭遇排序）</SectionTitle>
          <TableWrap>
            <table style={{ width: '100%', fontSize: 11, color: '#e6edf3', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#1f2937' }}>
                <tr>
                  <Th>owner_id</Th>
                  <Th>留存</Th>
                  <Th>累计</Th>
                  <Th>遭遇</Th>
                  <Th>击败</Th>
                  <Th>放过</Th>
                  <Th>反杀</Th>
                  <Th>平均寿命h</Th>
                  <Th>最新</Th>
                </tr>
              </thead>
              <tbody>
                {byOwner.map(r => (
                  <tr key={r.owner_id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <Td><code style={{ fontSize: 10, color: C.dim }}>{shortId(r.owner_id)}</code></Td>
                    <Td color={C.accent}>{r.probes_left}</Td>
                    <Td>{r.probes_ever}</Td>
                    <Td color={C.cyan}>{r.total_encountered}</Td>
                    <Td color={C.red}>{r.total_defeated}</Td>
                    <Td color={C.green}>{r.total_spared}</Td>
                    <Td color={C.purple}>{r.total_killed_attacker}</Td>
                    <Td>{Number(r.avg_lifetime_hours || 0).toFixed(1)}</Td>
                    <Td>{r.most_recent_probe_at ? new Date(r.most_recent_probe_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>

          {/* per-chamber 表 */}
          <SectionTitle style={{ marginTop: 24 }}>Per-Chamber（Top 50，按 active 探针排序）</SectionTitle>
          <TableWrap>
            <table style={{ width: '100%', fontSize: 11, color: '#e6edf3', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#1f2937' }}>
                <tr>
                  <Th>chamber_template</Th>
                  <Th>active</Th>
                  <Th>累计</Th>
                  <Th>遭遇</Th>
                  <Th>击败</Th>
                  <Th>放过</Th>
                  <Th>反杀</Th>
                </tr>
              </thead>
              <tbody>
                {byChamber.map(r => (
                  <tr key={r.chamber_template_id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <Td>#{r.chamber_template_id}</Td>
                    <Td color={C.accent}>{r.probes_active}</Td>
                    <Td>{r.probes_ever}</Td>
                    <Td color={C.cyan}>{r.total_encountered}</Td>
                    <Td color={C.red}>{r.total_defeated}</Td>
                    <Td color={C.green}>{r.total_spared}</Td>
                    <Td color={C.purple}>{r.total_killed_attacker}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </>
      )}
    </div>
  )
}

function shortId(id) {
  if (!id) return '-'
  return String(id).slice(0, 8)
}

function Card({ label, value, color, hint }) {
  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${color}`,
      borderRadius: 8, padding: 12,
    }}>
      <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: C.dim2, marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

function Bar({ pct, color, label }) {
  if (pct <= 0) return null
  return (
    <div title={`${label}: ${pct}%`} style={{
      width: `${pct}%`, background: color, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10, fontWeight: 600,
    }}>
      {pct >= 8 ? `${label} ${pct}%` : ''}
    </div>
  )
}

function SectionTitle({ children, style }) {
  return <div style={{ fontSize: 13, color: C.dim, marginBottom: 8, fontWeight: 600, ...(style || {}) }}>{children}</div>
}

function TableWrap({ children }) {
  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8,
      maxHeight: 400, overflowY: 'auto',
    }}>
      {children}
    </div>
  )
}

function Th({ children }) {
  return <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, color: C.dim, fontWeight: 600 }}>{children}</th>
}

function Td({ children, color }) {
  return <td style={{ padding: '6px 10px', color: color || '#e6edf3', whiteSpace: 'nowrap' }}>{children}</td>
}
