'use client'

// 【临时 · dev 验证用】KALEIDO 单人壳组件预览页（KP0-C ③④ 隔离验证）。
//   在 ⚙️ 的 startKaleidoRun/动作落地前，用 mock 数据把壳组件挂出来按 390×844/桌面截图验证。
//   联调（GameClientPage kaleido 分支接真数据）后本页可删。
import { useState } from 'react'
import { T } from '@/app/game/[id]/gameUi'
import {
  KaleidoEntryCard,
  KaleidoLevelHeader,
  KaleidoRuleCard,
  KaleidoLevelClearBanner,
  KaleidoConvergenceScreen,
} from '@/app/game/[id]/kaleido/kaleidoShell'

export default function KaleidoPreviewPage() {
  const [overlay, setOverlay] = useState(null) // 'banner' | 'cleared' | 'dead' | null
  const [entryStarting, setEntryStarting] = useState(false)
  const [entryError, setEntryError] = useState(null)

  return (
    <div style={{ background: T.bg0, color: T.text, minHeight: '100dvh', padding: 16, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480, margin: '0 auto' }}>
      <div style={{ fontSize: 12, color: T.dim }}>【dev】KALEIDO 单人壳预览 · mock 数据</div>

      {/* ① 单人出勤入口卡 */}
      <Section title="① 单人出勤卡 KaleidoEntryCard（/rooms 置顶）">
        <KaleidoEntryCard
          onStart={() => { setEntryError(null); setEntryStarting(true); setTimeout(() => { setEntryStarting(false); setEntryError('单人 run 服务端建设中（KP0-S），联调后开放') }, 700) }}
          starting={entryStarting}
          error={entryError}
        />
      </Section>

      {/* 关卡头 */}
      <Section title="② 关卡头 KaleidoLevelHeader">
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <KaleidoLevelHeader seq={3} levelCount={5} turnCount={12} exitCondition={{ type: 'boss_kill', params: { name: '锈蚀主锚' } }} />
        </div>
        <div style={{ height: 8 }} />
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <KaleidoLevelHeader seq={5} levelCount={5} turnCount={31} exitCondition={{ type: 'survive_turns', params: { turns: 8 } }} />
        </div>
      </Section>

      {/* 本关规则卡：填充态 + 空态 */}
      <Section title="③ 本关规则卡 KaleidoRuleCard（R6）">
        <KaleidoRuleCard
          combatMode={{ template_ref: 'stance_duel', params: { counterMul: 1.6 } }}
          envRules={[{ rule_key: 'pollution_accel', value: 1.5 }, { rule_key: 'search_bonus', value: -0.2 }]}
          formulaOverrides={[{ target: 'damage', formula: 'atk * 1.3 - def' }]}
        />
        <div style={{ height: 8 }} />
        <div style={{ fontSize: 11, color: T.dim, marginBottom: 4 }}>gauntlet 波次:</div>
        <KaleidoRuleCard combatMode={{ template_ref: 'gauntlet', params: { waves: 3 } }} envRules={[]} formulaOverrides={[]} />
        <div style={{ height: 8 }} />
        <div style={{ fontSize: 11, color: T.dim, marginBottom: 4 }}>服务端预渲染 describe 优先（level.payload.combat_mode.describe）:</div>
        <KaleidoRuleCard combatMode={{ template_ref: 'stance_duel', params: { counterMul: 1.6 }, describe: '三态克制（猜拳）：攻 克 技、技 克 守、守 克 攻；克制方伤害 ×1.6、被克方 ÷。每回合双方各出一态，先清零对方 HP 者胜。' }} envRules={[]} formulaOverrides={[]} />
        <div style={{ height: 8 }} />
        <div style={{ fontSize: 11, color: T.dim, marginBottom: 4 }}>P0 空态（数据多为空 → 优雅容器）:</div>
        <KaleidoRuleCard combatMode={{ template_ref: 'standard' }} envRules={[]} formulaOverrides={[]} />
      </Section>

      {/* 覆盖层触发 */}
      <Section title="④ 覆盖层（横幅 / 收敛页）">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <PreviewBtn onClick={() => setOverlay('banner')}>关间横幅</PreviewBtn>
          <PreviewBtn onClick={() => setOverlay('cleared')}>收敛 · 通关</PreviewBtn>
          <PreviewBtn onClick={() => setOverlay('dead')}>收敛 · 阵亡</PreviewBtn>
        </div>
      </Section>

      {overlay === 'banner' && (
        <KaleidoLevelClearBanner seq={3} nextSeq={4} levelCount={5} onContinue={() => setOverlay(null)} onStay={() => setOverlay(null)} />
      )}
      {overlay === 'cleared' && (
        <KaleidoConvergenceScreen
          status="cleared"
          summary={{ levelsCleared: 5, levelCount: 5, turnCount: 7, kills: 9, itemsCarried: 14 }}
          codex={[
            { seq: 1, name: '锈蚀回廊', cleared: true },
            { seq: 2, name: '静默资源舱', cleared: true },
            { seq: 3, name: '精英遭遇区', cleared: true },
            { seq: 4, name: '污染剪切带', cleared: true },
            { seq: 5, name: 'Ω-段首领室', cleared: true },
          ]}
          onRestart={() => setOverlay(null)}
          onLobby={() => setOverlay(null)}
        />
      )}
      {overlay === 'dead' && (
        <KaleidoConvergenceScreen
          status="dead"
          summary={{ levelsCleared: 2, levelCount: 5, turnCount: 4, kills: 3, itemsCarried: 5, cause: '于第 3 关被首领击败' }}
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
