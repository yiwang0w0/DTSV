'use client'

/**
 * Phase 27 — PortraitDisplay
 *
 * 在游戏左侧栏展示玩家当前选定的立绘。3:5 比例容器。
 * 点击立绘 / "换立绘"按钮 → 弹出 PortraitSelectorModal。
 *
 * Props:
 *   portraitUrl: string | null - 立绘 URL（来自 meBase.portraitUrl）
 *   onChangeClick(): 点击触发(打开 selector)
 */

const C = {
  bg0: '#07090f', bg1: '#0c1018', bg2: '#111827',
  border: '#1f2d42', text: '#d4e4f7', dim: '#4a6a8a', dimB: '#6a8aaa',
  cyan: '#00d4ff', purple: '#b47dff',
}

export default function PortraitDisplay({ portraitUrl, onChangeClick, dead = false }) {
  return (
    <div style={{
      position: 'relative',
      margin: '12px',
      aspectRatio: '3 / 5',
      borderRadius: 8,
      background: portraitUrl
        ? C.bg0
        : `linear-gradient(135deg, ${C.bg2} 0%, ${C.bg1} 60%, ${C.bg0} 100%)`,
      border: `1px solid ${C.border}`,
      overflow: 'hidden',
      cursor: 'pointer',
      transition: 'border-color 0.2s, box-shadow 0.2s',
    }}
      onClick={onChangeClick}
      onMouseEnter={e => { e.currentTarget.style.borderColor = C.cyan; e.currentTarget.style.boxShadow = `0 0 12px ${C.cyan}30` }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = 'none' }}
    >
      {portraitUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={portraitUrl}
            alt="角色立绘"
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              filter: dead ? 'grayscale(0.8) brightness(0.5)' : 'none',
              transition: 'filter 0.3s',
            }}
            onError={e => { e.target.style.display = 'none' }}
          />
          {dead && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 38, color: '#ff4455', textShadow: '0 0 12px #ff445580',
              fontWeight: 900, letterSpacing: 4,
            }}>
              ✕ KIA
            </div>
          )}
          {/* hover overlay 提示换立绘 */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '6px 10px',
            background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)',
            fontSize: 10, color: C.dimB, textAlign: 'center',
            pointerEvents: 'none',
          }}>
            点击更换
          </div>
        </>
      ) : (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 8, color: C.dim,
        }}>
          <div style={{ fontSize: 56, opacity: 0.4 }}>👤</div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>选择角色立绘</div>
          <div style={{ fontSize: 10, color: C.dim, padding: '0 14px', textAlign: 'center', lineHeight: 1.5 }}>
            可从预设选取，或上传后由管理员审核
          </div>
        </div>
      )}
    </div>
  )
}
