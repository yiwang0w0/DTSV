'use client'

/**
 * ItemCard — 道具卡片（纯视觉组件）
 *
 * 用于在拖拽分配 / 池子展示中渲染单个道具。
 * 不携带任何拖拽逻辑，由外层 DraggableCard / SortableCard 包装。
 *
 * 视觉规则：
 *   - 卡片左边竖条按 kind 颜色高亮
 *   - 顶部：图标 + 名称 + sub_kind 徽章
 *   - 中部：ATK / DEF / HEAL 属性行
 *   - 底部（仅在池中）：权重输入框
 *   - 操作按钮（移除 / 加入）右上角
 *
 * Props:
 *   item        — 道具对象 { id, name, kind, sub_kind, atk, def, heal, amount, description }
 *   inPool      — 是否已在当前地图的池中（影响视觉高亮）
 *   weight      — 当前权重（仅在 inPool=true 时有意义）
 *   onWeightChange(newWeight) — 权重变更回调（带防抖建议在外层做）
 *   onAction()  — 主操作（加入 / 移除）按钮回调
 *   actionLabel — 主按钮文字（默认按 inPool 推断）
 *   busy        — 是否正在保存
 *   compact     — 紧凑模式（隐藏描述与权重栏，用于网格密集排布）
 *   draggable   — 是否显示拖拽把手图标（视觉提示，不绑定行为）
 */

import { ITEM_KIND_META } from '@/lib/constants'

const C = {
  bg:        '#1c2129',
  bgIdle:    '#161b22',
  border:    '#30363d',
  borderHi:  '#58a6ff',
  text:      '#e6edf3',
  dim:       '#8b949e',
  dim2:      '#484f58',
  green:     '#3fb950',
  red:       '#f85149',
  cyan:      '#58a6ff',
  yellow:    '#d29922',
}

export default function ItemCard({
  item,
  inPool = false,
  weight,
  onWeightChange,
  onAction,
  actionLabel,
  busy = false,
  compact = false,
  draggable = false,
}) {
  if (!item) return null
  const meta = ITEM_KIND_META[item.kind] || { label: '其他', color: C.dim, icon: '📦' }
  const label = actionLabel || (inPool ? '移除' : '+ 加入')

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
        display:    'flex',
        flexDirection: 'column',
        gap:        compact ? 4 : 6,
        minWidth:   0,
      }}
    >
      {/* 拖拽把手指示（视觉） */}
      {draggable && (
        <div style={{
          position: 'absolute', top: 8, right: 8, fontSize: 12,
          color: C.dim2, letterSpacing: -1, fontFamily: 'monospace',
          pointerEvents: 'none',
        }}>⋮⋮</div>
      )}

      {/* 标题行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: compact ? 14 : 16, flexShrink: 0 }}>{meta.icon}</span>
        <span style={{
          fontWeight: 600, fontSize: compact ? 12 : 13,
          color: C.text,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          flex: 1, minWidth: 0,
        }}>{item.name}</span>
        <span style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 6,
          background: `${meta.color}18`, color: meta.color,
          border: `1px solid ${meta.color}30`, flexShrink: 0,
        }}>{meta.label}</span>
      </div>

      {/* 属性行 */}
      <div style={{ display: 'flex', gap: 10, fontSize: 11, flexWrap: 'wrap' }}>
        {item.atk > 0 && <span style={{ color: C.red }}>ATK +{item.atk}</span>}
        {item.def > 0 && <span style={{ color: C.cyan }}>DEF +{item.def}</span>}
        {item.heal > 0 && <span style={{ color: C.green }}>HEAL +{item.heal}</span>}
        {item.sub_kind && <span style={{ color: C.dim2, fontSize: 10 }}>{item.sub_kind}</span>}
      </div>

      {!compact && item.description && (
        <div style={{
          fontSize: 10, color: C.dim,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          maxWidth: '100%',
        }}>{item.description}</div>
      )}

      {/* 操作 + 权重 */}
      {(onAction || (inPool && onWeightChange)) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          {inPool && onWeightChange && !compact && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <span style={{ fontSize: 10, color: C.dim }}>权重</span>
              <input
                type="number"
                min={1}
                key={`w_${item.id}_${weight}`}
                defaultValue={weight ?? item.amount ?? 1}
                onChange={e => onWeightChange?.(parseInt(e.target.value, 10) || 1)}
                onPointerDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
                style={{
                  width: 52, padding: '3px 6px', borderRadius: 5,
                  border: `1px solid ${C.border}`, background: '#0e1117',
                  color: C.yellow, fontSize: 12, fontWeight: 700,
                  outline: 'none', textAlign: 'center',
                }}
              />
            </div>
          )}
          <div style={{ flex: 1 }} />
          {onAction && (
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
          )}
        </div>
      )}
    </div>
  )
}
