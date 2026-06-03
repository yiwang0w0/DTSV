'use client'

/**
 * ExtractionModal — 远星函馆撤离面板
 *
 * 简化版：当前 map 已是出口（is_exit=true），直接显示单出口信息卡：
 *   - 出口名称 + 描述
 *   - 消耗品要求（exit_cost.item × qty）+ 玩家持有数 N/M
 *   - "将带回 X 件道具 + Y 件装备" 预览
 *
 * Props:
 *   open
 *   onClose()
 *   onExtract()  — 不传 extractionPointId（服务端按 map 决定）
 *   busy
 *   mapName, mapDescription
 *   exitCost — { item, qty } | null
 *   inventory — 当前 inventory[]
 *   equippedCount — 当前装备实例数
 */

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { T } from './gameUi'
import { SIGNAL_LOCK } from '@/lib/constants'

// 远星函馆 FX：撤离面板顶部 Ω 接口效果（仅打开时按需加载）
const Shader = dynamic(() => import('@/components/fx/Shader'), { ssr: false })

export default function ExtractionModal({
  open, onClose, onExtract, busy,
  mapName = '当前地图', mapDescription = '',
  exitCost = null, inventory = [], equippedCount = 0,
  platformPartCount = 0, // Phase 21.2: 留探针需要的 platform_part 持有数
}) {
  // Phase 21.2: 留探针选项
  const [leaveProbe, setLeaveProbe] = useState(false)
  if (!open) return null

  const itemCounts = inventory.reduce((acc, name) => {
    acc.set(name, (acc.get(name) || 0) + 1)
    return acc
  }, new Map())

  const needQty = Number(exitCost?.qty) || 0
  const needItem = exitCost?.item || null
  const haveQty = needItem ? (itemCounts.get(needItem) || 0) : 0
  const costMet = !needItem || haveQty >= needQty

  const canExtract = costMet && !busy

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
        width: '92%', maxWidth: 520,
        display: 'flex', flexDirection: 'column',
        boxShadow: `0 0 60px rgba(0,0,0,0.6), 0 0 2px ${T.green}30`,
        overflow: 'hidden',
      }}>
        {/* 顶部 Ω 接口干涉环装饰条（120px 高），结构退避的"焦点感" */}
        <div style={{
          position: 'relative', height: 120, isolation: 'isolate',
          borderBottom: `1px solid ${T.border}`, overflow: 'hidden',
        }}>
          <Shader name="omega_iface" pollution={0.4} intensity={0.7} />
          <div style={{
            position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
            background: 'radial-gradient(ellipse 70% 80% at 50% 50%, transparent 30%, rgba(14,17,23,0.6) 100%)',
          }} />
          <div style={{
            position: 'absolute', inset: 0, zIndex: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px',
          }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.green, textShadow: `0 0 12px ${T.green}40` }}>🚪 撤离</h3>
            <button onClick={onClose} style={{ background: 'rgba(14,17,23,0.5)', border: `1px solid ${T.border}`, borderRadius: 6, padding: '4px 10px', color: T.dim, cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{
            padding: '14px 16px', borderRadius: 10,
            background: canExtract ? `${T.green}10` : T.bg2,
            border: `1px solid ${canExtract ? `${T.green}50` : T.border}`,
            borderLeft: `3px solid ${canExtract ? T.green : T.yellow}`,
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>
              {mapName}
            </div>
            {mapDescription && (
              <div style={{ fontSize: 11, color: T.dim, marginBottom: 8 }}>{mapDescription}</div>
            )}

            {needItem ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginTop: 8 }}>
                <span style={{ color: T.dim }}>所需消耗：</span>
                <span style={{
                  padding: '2px 8px', borderRadius: 6,
                  background: costMet ? `${T.green}15` : `${T.red}15`,
                  color: costMet ? T.green : T.red,
                  border: `1px solid ${costMet ? T.green : T.red}40`,
                }}>
                  {costMet ? '✓' : '✗'} {needItem} × {needQty}
                </span>
                <span style={{ fontSize: 11, color: T.dimB }}>
                  你有 {haveQty}/{needQty}
                </span>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: T.green, marginTop: 4 }}>无消耗 — 主出口</div>
            )}
          </div>

          {(inventory.length > 0 || equippedCount > 0) && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, background: T.bg2,
              border: `1px solid ${T.border}`, fontSize: 11, color: T.dimB, marginBottom: 12,
            }}>
              将带回：<strong style={{ color: T.cyan }}>
                {Math.max(0, inventory.length - (needItem && costMet ? needQty : 0))}
              </strong> 件道具
              {equippedCount > 0 && <span> + <strong style={{ color: T.purple }}>{equippedCount}</strong> 件装备</span>}
            </div>
          )}

          {/* Phase 21.2: 留探针选项 */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 8,
            background: leaveProbe ? `${T.purple}10` : T.bg2,
            border: `1px solid ${leaveProbe ? T.purple : T.border}`,
            borderLeft: `3px solid ${platformPartCount > 0 ? T.purple : T.dim2}`,
            marginBottom: 12, cursor: platformPartCount > 0 ? 'pointer' : 'not-allowed',
            opacity: platformPartCount > 0 ? 1 : 0.5,
          }}>
            <input
              type="checkbox"
              checked={leaveProbe}
              disabled={platformPartCount === 0}
              onChange={e => setLeaveProbe(e.target.checked)}
              style={{ accentColor: T.purple }}
            />
            <div style={{ flex: 1, fontSize: 12 }}>
              <div style={{ color: leaveProbe ? T.purple : T.text, fontWeight: 600 }}>
                🛰 留下跃迁者残影（消耗 1 件环段部件）
              </div>
              <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>
                {platformPartCount > 0
                  ? `你有 ${platformPartCount} 件 platform_part — 7 天内其他玩家有概率遭遇`
                  : '没有 platform_part 物品 — 无法留残影'}
              </div>
            </div>
          </label>

          {/* 29-A P0: 撤离信号锁定窗口 — 撤离不是安全按钮而是承诺（预埋，SIGNAL_LOCK.ENABLED 后显示） */}
          {SIGNAL_LOCK.ENABLED && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, marginBottom: 12,
              background: `${T.yellow}12`, border: `1px solid ${T.yellow}55`,
              borderLeft: `3px solid ${T.yellow}`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.yellow, marginBottom: 4 }}>
                🛰 撤离不是安全按钮，是一次承诺
              </div>
              <div style={{ fontSize: 10.5, color: T.dimB, lineHeight: 1.5 }}>
                发出撤离信号后进入 <strong style={{ color: T.yellow }}>{SIGNAL_LOCK.WINDOW_TURNS}</strong> 回合脆弱态：
                环境与个人污染加速、残影遭遇概率提升。坚持到信号锁定完成才能撤离 ——
                压力来自环境，不会有真人蹲点。
              </div>
            </div>
          )}

          <button
            onClick={() => canExtract && onExtract({ leaveProbe: leaveProbe && platformPartCount > 0 })}
            disabled={!canExtract}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 8,
              border: 'none',
              background: canExtract ? T.green : T.bg0,
              color: canExtract ? '#fff' : T.dim2,
              fontSize: 14, fontWeight: 700,
              cursor: canExtract ? 'pointer' : 'not-allowed',
              opacity: canExtract ? 1 : 0.6,
            }}
          >
            {busy ? '撤离中…' : !costMet ? '消耗不足' : (SIGNAL_LOCK.ENABLED ? '🛰 发出撤离信号' : '🚪 确认撤离')}
          </button>
        </div>
      </div>
    </div>
  )
}
