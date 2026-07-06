'use client'

// 【临时 · dev 验证用】KALEIDO 单人壳组件预览页（KP0-C ③④ 隔离验证）。
//   在 ⚙️ 的 startKaleidoRun/动作落地前，用 mock 数据把壳组件挂出来按 390×844/桌面截图验证。
//   联调（GameClientPage kaleido 分支接真数据）后本页可删。
import { useState } from 'react'
import { T } from '@/app/game/[id]/gameUi'
import {
  KaleidoLevelHeader,
  KaleidoRuleCard,
  KaleidoLevelClearBanner,
  KaleidoConvergenceScreen,
} from '@/app/game/[id]/kaleido/kaleidoShell'

export default function KaleidoPreviewPage() {
  const [overlay, setOverlay] = useState(null) // 'banner' | 'cleared' | 'dead' | null

  return (
    <div style={{ background: T.bg0, color: T.text, minHeight: '100dvh', padding: 16, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480, margin: '0 auto' }}>
      <div style={{ fontSize: 12, color: T.dim }}>【dev】KALEIDO 单人壳预览 · mock 数据</div>

      {/* 关卡头 */}
      <Section title="① 关卡头 KaleidoLevelHeader">
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <KaleidoLevelHeader seq={3} levelCount={5} turnCount={12} exitCondition={{ type: 'boss_kill', params: { name: '锈蚀主锚' } }} />
        </div>
        <div style={{ height: 8 }} />
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <KaleidoLevelHeader seq={5} levelCount={5} turnCount={31} exitCondition={{ type: 'survive_turns', params: { turns: 8 } }} />
        </div>
      </Section>

      {/* 本关规则卡：填充态 + 空态 */}
      <Section title="② 本关规则卡 KaleidoRuleCard（R6）">
        <KaleidoRuleCard
          combatMode={{ template_ref: 'stance_duel', params: {} }}
          envRules={[{ rule_key: 'pollution_accel', value: 1.5 }, { rule_key: 'search_bonus', value: -0.2 }]}
          formulaOverrides={[{ target: 'damage', formula: 'atk * 1.3 - def' }]}
        />
        <div style={{ height: 8 }} />
        <div style={{ fontSize: 11, color: T.dim, marginBottom: 4 }}>P0 空态（数据多为空 → 优雅容器）:</div>
        <KaleidoRuleCard combatMode={{ template_ref: 'standard' }} envRules={[]} formulaOverrides={[]} />
      </Section>

      {/* 覆盖层触发 */}
      <Section title="③④ 覆盖层（横幅 / 收敛页）">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <PreviewBtn onClick={() => setOverlay('banner')}>关间横幅</PreviewBtn>
          <PreviewBtn onClick={() => setOverlay('cleared')}>收敛 · 通关</PreviewBtn>
          <PreviewBtn onClick={() => setOverlay('dead')}>收敛 · 阵亡</PreviewBtn>
        </div>
      </Section>

      {overlay === 'banner' && (
        <KaleidoLevelClearBanner seq={3} nextSeq={4} levelCount={5} onContinue={() => setOverlay(null)} />
      )}
      {overlay === 'cleared' && (
        <KaleidoConvergenceScreen
          status="cleared"
          summary={{ levelsCleared: 5, levelCount: 5, totalTurns: 47, kills: 9, itemsFound: 14 }}
          onRestart={() => setOverlay(null)}
          onLobby={() => setOverlay(null)}
        />
      )}
      {overlay === 'dead' && (
        <KaleidoConvergenceScreen
          status="dead"
          summary={{ levelsCleared: 2, levelCount: 5, totalTurns: 19, kills: 3, itemsFound: 5, cause: '于第 3 关被首领击败' }}
          onRestart={() => setOverlay(null)}
          onLobby={() => setOverlay(null)}
        />
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.cyan, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

function PreviewBtn({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg2, color: T.text, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}
    >
      {children}
    </button>
  )
}
