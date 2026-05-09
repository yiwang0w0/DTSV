'use client'

/**
 * NpcCard — NPC 卡片（纯视觉）
 *
 * 渲染单个 NPC：含等级徽章、HP/ATK/DEF/EXP、（可选）拖拽把手与操作按钮。
 *
 * Props:
 *   npc        — NPC 对象 { id, name, hp, atk, def, exp, level, maps }
 *   inPool     — 是否已在当前地图（影响视觉高亮）
 *   onAction() — 加入 / 移除 主操作回调
 *   actionLabel
 *   busy
 *   compact    — 紧凑模式
 *   draggable  — 显示拖拽把手提示
 */

import { NPC_LEVEL_META } from '@/lib/constants'

const C = {
  bg:        '#1c2129',
  bgIdle:    '#161b22',
  border:    '#30363d',
  text:      '#e6edf3',
  dim:       '#8b949e',
  dim2:      '#484f58',
  green:     '#3fb950',
  red:       '#f85149',
  cyan:      '#58a6ff',
  yellow:    '#d29922',
  purple:    '#bc8cff',
}

export default function NpcCard({
  npc,
  inPool = false,
  onAction,
  actionLabel,
  busy = false,
  compact = false,
  draggable = false,
}) {
  if (!npc) return null
  const meta = NPC_LEVEL_META[npc.level] || NPC_LEVEL_META.easy
  const label = actionLabel || (inPool ? '移除' : '+ 加入')
  const isBoss = npc.level === 'boss'

  return (
    <div
      style={{
        position:   'relative',
        background: inPool ? C.bg : C.bgIdle,
        border:     `1px solid ${inPool ? `${meta.color}40` : C.border}`,
        borderLeft: `3px solid ${meta.color}`,
        borderRadius: 10,
        padding:    compact ? '8px 10px 8px 12px' : '10px 12px 10px 14px',
        opacity:    busy ? 0.55 : 1,
        transition: 'opacity .15s, border-color .15s, background .15s',
        cursor:     draggable ? 'grab' : 'default',
        userSelect: 'none',
        display:    'flex', flexDirection: 'column', gap: compact ? 4 : 6,
        minWidth:   0,
        boxShadow:  isBoss ? `0 0 12px ${meta.color}28` : 'none',
      }}
    >
      {draggable && (
        <div style={{
          position: 'absolute', top: 8, right: 8, fontSize: 12,
          color: C.dim2, letterSpacing: -1, fontFamily: 'monospace',
          pointerEvents: 'none',
        }}>⋮⋮</div>
      )}

      {/* 标题行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: compact ? 14 : 16, flexShrink: 0 }}>
          {isBoss ? '👑' : npc.level === 'hard' ? '💀' : npc.level === 'medium' ? '⚔️' : '🐺'}
        </span>
        <span style={{
          fontWeight: 600, fontSize: compact ? 12 : 13, color: C.text,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          flex: 1, minWidth: 0,
        }}>{npc.name}</span>
        <span style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 6,
          background: `${meta.color}18`, color: meta.color,
          border: `1px solid ${meta.color}30`, flexShrink: 0,
          fontWeight: 700,
        }}>{meta.label}</span>
      </div>

      {/* 属性行 */}
      <div style={{ display: 'flex', gap: 10, fontSize: 11, flexWrap: 'wrap' }}>
        <span style={{ color: C.green }}>HP {npc.hp}</span>
        <span style={{ color: C.red }}>ATK {npc.atk}</span>
        <span style={{ color: C.cyan }}>DEF {npc.def}</span>
        {npc.exp > 0 && <span style={{ color: C.yellow }}>EXP {npc.exp}</span>}
      </div>

      {/* 操作行 */}
      {onAction && (
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 2 }}>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onAction() }}
            onPointerDown={e => e.stopPropagation()}
            disabled={busy}
            style={{
              flexShrink: 0,
              padding: '4px 12px', borderRadius: 6,
              fontSize: 11, fontWeight: 600,
              cursor: busy ? 'wait' : 'pointer',
              border: `1px solid ${inPool ? `${C.red}40` : `${C.green}40`}`,
              background: inPool ? `${C.red}14` : `${C.green}14`,
              color: inPool ? C.red : C.green,
            }}
          >
            {busy ? '…' : label}
          </button>
        </div>
      )}
    </div>
  )
}
