'use client'

/**
 * ExtractionModal — 撤离选择面板
 *
 * 列出当前地图所有撤离点的状态：
 *   - 时间窗（已开放 / 还需 X 秒 / 已关闭）
 *   - 物品要求（需持有 X / 已持有）
 *   - 撤离物品总数预览（带回多少件）
 *
 * Props:
 *   open
 *   onClose()
 *   onExtract(extractionPointId)
 *   busy
 *   points — 当前地图的 extraction_points
 *   roomStartedAt — ISO 字符串
 *   inventory — 当前 inventory[]（用于物品要求校验）
 *   equippedCount — 当前装备实例数（用于"将带回 X 件"提示）
 */

import { useEffect, useState, useMemo } from 'react'
import { T } from './gameUi'

export default function ExtractionModal({
  open, onClose, onExtract, busy,
  points = [], roomStartedAt, inventory = [], equippedCount = 0,
}) {
  const [now, setNow] = useState(() => Date.now())

  // 每秒刷新一次时间显示
  useEffect(() => {
    if (!open) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [open])

  const elapsed = useMemo(() => {
    if (!roomStartedAt) return 0
    const t = new Date(roomStartedAt).getTime()
    if (Number.isNaN(t)) return 0
    return Math.floor((now - t) / 1000)
  }, [now, roomStartedAt])

  if (!open) return null

  const itemCounts = inventory.reduce((acc, name) => {
    acc.set(name, (acc.get(name) || 0) + 1)
    return acc
  }, new Map())

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(4px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div style={{
        background: T.bg1, borderRadius: 14, border: `1px solid ${T.border}`,
        width: '92%', maxWidth: 600, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: `0 0 60px rgba(0,0,0,0.6), 0 0 2px ${T.green}30`,
      }}>
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.green }}>🚪 撤离</h3>
            <div style={{ marginTop: 3, fontSize: 11, color: T.dimB }}>
              raid 已进行 <strong style={{ color: T.cyan, fontFamily: 'monospace' }}>{formatTime(elapsed)}</strong>
              {inventory.length > 0 || equippedCount > 0 ? ` · 将带回 ${inventory.length} 件道具${equippedCount > 0 ? ` + ${equippedCount} 件装备` : ''}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.dim, cursor: 'pointer', fontSize: 22 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
          {points.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: T.dim2 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🚧</div>
              <p style={{ margin: 0 }}>当前地图没有可用撤离点</p>
              <p style={{ margin: '6px 0 0', fontSize: 11, color: T.dim2 }}>移动到其他地图寻找出口</p>
            </div>
          ) : points.map(point => {
            const openAt = Number(point.openAt) || 0
            const closeAt = (point.closeAt === null || point.closeAt === undefined || point.closeAt === '')
              ? null
              : Number(point.closeAt)
            const isOpen = elapsed >= openAt && (closeAt === null || elapsed <= closeAt)
            const willOpen = elapsed < openAt
            const isClosed = closeAt !== null && elapsed > closeAt

            const reqMet = !point.requiredItem || inventory.includes(point.requiredItem)
            const canExtract = isOpen && reqMet && !busy

            const reqCount = point.requiredItem ? (itemCounts.get(point.requiredItem) || 0) : 0

            return (
              <div
                key={point.id}
                style={{
                  marginBottom: 10, padding: '14px 16px', borderRadius: 10,
                  background: canExtract ? `${T.green}10` : T.bg2,
                  border: `1px solid ${canExtract ? `${T.green}50` : T.border}`,
                  borderLeft: `3px solid ${canExtract ? T.green : isClosed ? T.dim2 : T.yellow}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{point.name || point.id}</span>
                  <StatusBadge isOpen={isOpen} willOpen={willOpen} isClosed={isClosed} />
                </div>

                {point.description && (
                  <div style={{ fontSize: 11, color: T.dim, marginBottom: 8 }}>{point.description}</div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 11, marginBottom: point.requiredItem || (closeAt !== null) ? 8 : 0 }}>
                  <Item label="开放时间" value={
                    willOpen
                      ? <span style={{ color: T.yellow }}>还需 {formatTime(openAt - elapsed)}</span>
                      : isClosed
                        ? <span style={{ color: T.red }}>已关闭</span>
                        : <span style={{ color: T.green }}>已开放</span>
                  } />
                  {closeAt !== null && (
                    <Item label="关闭时间" value={
                      isClosed
                        ? <span style={{ color: T.red }}>—</span>
                        : <span style={{ color: T.dimB }}>剩余 {formatTime(closeAt - elapsed)}</span>
                    } />
                  )}
                </div>

                {point.requiredItem && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, marginBottom: 8 }}>
                    <span style={{ color: T.dim }}>需要：</span>
                    <span style={{
                      padding: '2px 8px', borderRadius: 6,
                      background: reqMet ? `${T.green}15` : `${T.red}15`,
                      color: reqMet ? T.green : T.red,
                      border: `1px solid ${reqMet ? T.green : T.red}40`,
                    }}>
                      {reqMet ? '✓' : '✗'} {point.requiredItem}
                      {reqCount > 1 && <span style={{ opacity: 0.7, marginLeft: 4 }}>×{reqCount}</span>}
                    </span>
                    {point.consumeItem && (
                      <span style={{ fontSize: 10, color: T.yellow }}>（撤离时消耗）</span>
                    )}
                  </div>
                )}

                <button
                  onClick={() => canExtract && onExtract(point.id)}
                  disabled={!canExtract}
                  style={{
                    width: '100%', padding: '10px 0', borderRadius: 8,
                    border: 'none',
                    background: canExtract ? T.green : T.bg0,
                    color: canExtract ? '#fff' : T.dim2,
                    fontSize: 13, fontWeight: 700,
                    cursor: canExtract ? 'pointer' : 'not-allowed',
                    opacity: canExtract ? 1 : 0.6,
                  }}
                >
                  {busy ? '撤离中…' :
                    !isOpen ? (willOpen ? '尚未开放' : '已关闭') :
                    !reqMet ? '物品不足' :
                    '🚪 立即撤离'}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ isOpen, willOpen, isClosed }) {
  if (isOpen) return <Badge color={T.green} text="开放中" />
  if (willOpen) return <Badge color={T.yellow} text="未开放" />
  if (isClosed) return <Badge color={T.dim2} text="已关闭" />
  return null
}

function Badge({ color, text }) {
  return (
    <span style={{
      fontSize: 10, padding: '1px 8px', borderRadius: 12,
      background: `${color}18`, color, border: `1px solid ${color}40`, fontWeight: 700,
    }}>{text}</span>
  )
}

function Item({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: 12, marginTop: 1 }}>{value}</div>
    </div>
  )
}

function formatTime(seconds) {
  if (seconds < 0) seconds = 0
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  if (m === 0) return `${s}s`
  return `${m}m${String(s).padStart(2, '0')}s`
}
