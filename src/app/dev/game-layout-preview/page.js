'use client'

// 【临时 · dev 验证用】ResponsiveGameLayout 响应式壳预览（移动化 P2）。
//   桌面（≥768）：三栏 grid；窄屏（<768）：单列 + 底部 Tab 切换。
//   useIsNarrow 读视口宽度 ⇒ 用 preview_resize 切 mobile(375)/desktop(1280) 验证两态，不能用固定 div 框。
//   联调后可删（本壳的真实消费方 = GameClientPage 多人对局页）。
import ResponsiveGameLayout from '@/app/game/[id]/ResponsiveGameLayout'
import { T } from '@/app/game/[id]/gameUi'

function MockCol({ label, color, side, lines }) {
  const border = side === 'left' ? { borderRight: `1px solid ${T.border}` }
    : side === 'right' ? { borderLeft: `1px solid ${T.border}` } : {}
  return (
    <div style={{ ...border, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bg1 }}>
      <div style={{ padding: '12px', fontWeight: 700, color, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, minHeight: 0 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ padding: '10px 0', borderBottom: `1px solid ${T.border}`, fontSize: 13 }}>{l}</div>
        ))}
      </div>
    </div>
  )
}

export default function GameLayoutPreview() {
  return (
    <div className="game-immersive-root" style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: T.bg0, color: T.text, fontFamily: 'var(--font-noto-sans-sc), system-ui' }}>
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, fontSize: 12, color: T.dim, flexShrink: 0 }}>
        【dev】ResponsiveGameLayout —— 桌面三栏 / 窄屏(&lt;768)单列+底部 Tab。preview_resize 切 mobile/desktop 验证。
      </div>
      <ResponsiveGameLayout
        left={<MockCol label="👤 状态（左栏）" color={T.cyan} side="left" lines={['HP 78 / 100', 'ATK 22 · DEF 9', '🎒 背包 14 件', '📊 区域评估', '⚔️ PvP 目标 ×2', '🌿 交易实体']} />}
        center={<MockCol label="⚔️ 行动（中栏）" color={T.orange} side="center" lines={['🔦 搜索区域', '遭遇：游荡的壳 HP 34/60', '装备合成 / 道具合成', '日志：你翻找了一下。', '日志：有东西在动。', '日志：实体退散。']} />}
        right={<MockCol label="🗺️ 区域（右栏）" color={T.green} side="right" lines={['⏭ 路径前进 3/5', '当前区块：锈蚀回廊', '下一段 [A] 静默资源舱', '下一段 [B] 精英遭遇区']} />}
        badges={{ center: 3 }}
      />
    </div>
  )
}
