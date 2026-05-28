'use client'

/**
 * Phase 27 / 28 — PortraitDisplay
 *
 * 游戏左侧栏展示玩家立绘（3:5 比例）。**纯展示**：
 *   - 立绘的选择 / 上传 / 审核全部移到 /profile 个人主页（Phase 28）
 *   - 已设置 → 展示立绘；阵亡时灰度 + ✕ KIA
 *   - 未设置 → 占位提示 + "前往个人主页设置"链接（新标签打开 /profile）
 *
 * Props:
 *   portraitUrl: string | null
 *   dead: boolean
 */

const C = {
  bg0: '#07090f', bg1: '#0c1018', bg2: '#111827',
  border: '#1f2d42', text: '#d4e4f7', dim: '#4a6a8a', dimB: '#6a8aaa',
  cyan: '#00d4ff', purple: '#b47dff',
}

export default function PortraitDisplay({ portraitUrl, dead = false }) {
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
    }}>
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
        </>
      ) : (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 8, color: C.dim, padding: '0 14px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 56, opacity: 0.4 }}>👤</div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>未设置角色立绘</div>
          <a
            href="/profile"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 11, color: C.cyan, textDecoration: 'none',
              padding: '4px 10px', borderRadius: 6,
              background: `${C.cyan}18`, border: `1px solid ${C.cyan}40`,
              marginTop: 2,
            }}
          >
            前往个人主页设置 →
          </a>
        </div>
      )}
    </div>
  )
}
