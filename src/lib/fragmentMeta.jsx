/**
 * src/lib/fragmentMeta.jsx — 残片展示用共享元数据 / 组件
 *
 * /archive 与 /codex 两页逐字共享的「残片解码」展示原语：
 *   - DECODE_LABELS / DECODE_COLORS：4 级解码度（0→3）的文案与配色
 *   - DecodeBar({ level })：解码进度条（纯展示组件，无 hook）
 *
 * 解码等级语义不变。颜色取 /archive 现值（codex 自述「与 archive 一致」）。
 * 配色在此内联为字面量以保持本模块自包含——两页顶部各自的 C 主题调色板
 * 定义（后续主题统一波次范围）不受影响。
 *
 * DecodeBar 为纯展示组件，未用任何 hook：archive/codex 作为 client 页 import 即可，
 * 本模块无需声明 'use client'。
 */

// 4 级解码度文案：0=未解码 → 3=完全解码
export const DECODE_LABELS = ['未解码', '初步解码', '深度解码', '完全解码']

// 对应配色（取 /archive 现值：dim2 / yellow / accent / green）
export const DECODE_COLORS = ['#484f58', '#d29922', '#58a6ff', '#3fb950']

/** 解码进度条（两页统一视觉语言，取 /archive 现值） */
export function DecodeBar({ level }) {
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
