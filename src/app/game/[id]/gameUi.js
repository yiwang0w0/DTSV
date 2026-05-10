import { Modal } from '@/app/admin/_shared/ui'

export const T = {
  bg0: '#07090f',
  bg1: '#0c1018',
  bg2: '#111827',
  bg3: '#1a2335',
  border: '#1f2d42',
  borderB: '#2a3f5f',
  text: '#d4e4f7',
  dim: '#4a6a8a',
  dimB: '#6a8aaa',
  cyan: '#00d4ff',
  green: '#00e676',
  red: '#ff4455',
  yellow: '#ffc740',
  purple: '#b47dff',
  orange: '#ff8c42',
}

export const WEATHER = {
  clear: { label: '晴天', icon: '☀️', mod: '' },
  rain: { label: '暴雨', icon: '🌧️', mod: '远程命中下降' },
  fog: { label: '大雾', icon: '🌫️', mod: '搜索收益下降' },
  storm: { label: '风暴', icon: '⛈️', mod: '全属性轻微波动' },
  night: { label: '黑夜', icon: '🌙', mod: '遭遇风险上升' },
  snow: { label: '暴雪', icon: '❄️', mod: '行动受限' },
}

export const SLOTS = [
  { key: 'probe', label: '探测' },
  { key: 'shield', label: '防护' },
  { key: 'weapon', label: '武器' },
  { key: 'comm', label: '通信' },
]

export function hpColor(hp, max) {
  const ratio = max > 0 ? hp / max : 0
  return ratio > 0.6 ? T.green : ratio > 0.3 ? T.yellow : T.red
}

export function HpBar({ hp, max, h = 6 }) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (hp / max) * 100 : 0))
  const color = hpColor(hp, max)
  return (
    <div style={{ height: h, background: T.bg0, borderRadius: 3, overflow: 'hidden', border: `1px solid ${T.border}` }}>
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          boxShadow: `0 0 6px ${color}80`,
          transition: 'width .4s, background .3s',
          borderRadius: 3,
        }}
      />
    </div>
  )
}

export function BuffTag({ buffDef, remaining }) {
  if (!buffDef) return null
  const color = buffDef.is_debuff ? T.red : T.green
  return (
    <div
      title={`${buffDef.name}（剩余 ${remaining} 回合）`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '2px 7px',
        borderRadius: 8,
        fontSize: 10,
        background: `${color}15`,
        border: `1px solid ${color}30`,
        color,
      }}
    >
      {buffDef.icon} {buffDef.name}
      <span style={{ opacity: 0.6 }}>{remaining}</span>
    </div>
  )
}

export function LogLine({ entry }) {
  const color = {
    damage: T.red,
    heal: T.green,
    crit: T.yellow,
    buff: T.purple,
    system: T.cyan,
    death: T.red,
    kill: T.yellow,
    attack: T.orange,
  }[entry.type] || T.dimB

  return (
    <div style={{ padding: '4px 0', borderBottom: `1px solid ${T.border}`, fontSize: 12, color, lineHeight: 1.5 }}>
      <span style={{ color: T.dim, marginRight: 6, fontFamily: 'monospace', fontSize: 10 }}>{entry.time}</span>
      {entry.text}
    </div>
  )
}

export function PanelTitle({ children, right }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        borderBottom: `1px solid ${T.border}`,
        fontSize: 11,
        fontWeight: 700,
        color: T.dimB,
        textTransform: 'uppercase',
        letterSpacing: '1px',
        flexShrink: 0,
      }}
    >
      <span>{children}</span>
      {right && <span>{right}</span>}
    </div>
  )
}

export function Btn({ children, variant = 'default', size = 'md', onClick, disabled, loading, loadingText, sx = {} }) {
  const sizes = {
    sm: { fontSize: 11, padding: '4px 10px' },
    md: { fontSize: 13, padding: '8px 16px' },
    lg: { fontSize: 15, padding: '12px 24px' },
  }
  const variants = {
    default: { background: T.bg3, color: T.text, border: `1px solid ${T.border}` },
    primary: { background: T.cyan, color: T.bg0 },
    danger: { background: `${T.red}20`, color: T.red, border: `1px solid ${T.red}40` },
    warn: { background: `${T.yellow}18`, color: T.yellow, border: `1px solid ${T.yellow}30` },
    ghost: { background: 'transparent', color: T.dimB, border: `1px solid ${T.border}` },
  }
  const isDisabled = disabled || loading
  const barColor = variant === 'primary' ? T.bg0 : variant === 'danger' ? T.red : T.cyan
  return (
    <button
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      className="hov"
      style={{
        border: 'none',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        borderRadius: 6,
        fontWeight: 600,
        fontFamily: 'inherit',
        opacity: isDisabled && !loading ? 0.45 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        transition: 'filter .15s, opacity .15s',
        position: 'relative',
        overflow: 'hidden',
        ...sizes[size],
        ...variants[variant],
        ...sx,
      }}
    >
      {loading && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
          background: `${barColor}20`, overflow: 'hidden',
        }}>
          <div className="btn-loading-bar" style={{
            height: '100%', width: '40%', borderRadius: 2,
            background: `linear-gradient(90deg, transparent, ${barColor}90, transparent)`,
          }} />
        </div>
      )}
      {loading ? (loadingText || children) : children}
    </button>
  )
}

export { Modal }

