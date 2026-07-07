'use client'

// 【临时 · dev 验证用】KALEIDO 渐进披露（05 §1）谐调器。
//   用 stub 谐调器驱动 useKaleidoUiUnlocks + KaleidoRunView：从「初始态=仅搜索按钮」出发，
//   逐个触发解锁（搜索/拾物/遭遇/通关/前进/规则关/精英关…），观察渐次动效 + nar_line 落日志。
//   联调（GameClientPage 接真 gamevars/解锁事件）后本页可删。
import { useMemo, useState } from 'react'
import { T } from '@/app/game/[id]/gameUi'
import KaleidoRunView from '@/app/game/[id]/kaleido/KaleidoRunView'
import { KaleidoEntryCard } from '@/app/game/[id]/kaleido/kaleidoShell'
import { useKaleidoUiUnlocks } from '@/app/game/[id]/kaleido/useKaleidoUiUnlocks'

const MOCK_ITEMS = new Map([
  ['锈蚀弹匣', { description: '还能用几发。' }],
  ['备用电池', { description: '半格电，够撑一会儿。' }],
])
const MOCK_ENCOUNTER = { id: 'inst-abc123', hp: 34, maxHp: 60, npc: { name: '游荡的壳', atk: 12, def: 4 } }

const STANCE_MODE = { template_ref: 'stance_duel', params: { counterMul: 1.6 } }
const GAUNTLET_MODE = { template_ref: 'gauntlet', params: { waves: 3 } }
const STANDARD_MODE = { template_ref: 'standard', params: {} }

export default function KaleidoPreviewPage() {
  // 谐调器：一组布尔驱动渐进披露（镜像 buildUnlockCtx 的 ctx 形状）。
  const [sim, setSim] = useState({
    searched: false, hasItems: false, encounter: false, everFought: false,
    clearedAny: false, movedAny: false, ruleLevel: false, stanceLevel: false,
    seq: 1, turnCount: 0, logs: [],
  })
  const [overlay, setOverlay] = useState(null) // 'banner' | 'cleared' | 'dead' | null
  const set = (patch) => setSim((s) => ({ ...s, ...patch }))
  const pushLog = (text, type = 'system') =>
    setSim((s) => ({ ...s, turnCount: s.turnCount + 1, logs: [...s.logs, { time: `T${s.turnCount + 1}`, text, type }] }))

  const ctx = useMemo(() => ({
    gamevars: null,
    searched: sim.searched, hasItems: sim.hasItems, encounter: sim.encounter, everFought: sim.everFought,
    clearedAny: sim.clearedAny, movedAny: sim.movedAny, ruleLevel: sim.ruleLevel, stanceLevel: sim.stanceLevel,
    hasCraftMat: false,
  }), [sim])
  const unlocks = useKaleidoUiUnlocks(ctx, { enabled: true, emitNarLog: true })

  const combatMode = sim.stanceLevel ? STANCE_MODE : sim.ruleLevel ? GAUNTLET_MODE : STANDARD_MODE
  const exitCondition = sim.stanceLevel
    ? { type: 'boss_kill', params: { name: '锈蚀主锚' } }
    : { type: 'survive_turns', params: { turns: 8 } }

  return (
    <div style={{ background: '#05070c', color: T.text, minHeight: '100dvh', display: 'flex', gap: 20, padding: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {/* 控制台 */}
      <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 12, color: T.dim, marginBottom: 2 }}>【dev】KALEIDO 渐进披露谐调器</div>
        <div style={{ fontSize: 11, color: T.dim2, lineHeight: 1.5, marginBottom: 6 }}>
          已解锁 {unlocks.unlocked.size} / 11 件。逐个触发看浮现动效 + nar_line 落日志。
        </div>
        <Ctl on={sim.searched} label="① 搜索一次 → log_panel + hp_bar" onClick={() => { set({ searched: true }); pushLog('你翻找了一下。', 'system') }} />
        <Ctl on={sim.hasItems} label="② 拾得道具 → inventory" onClick={() => { set({ hasItems: true }); pushLog('找到：锈蚀弹匣。', 'system') }} />
        <Ctl on={sim.encounter} label="③ 触发遭遇 → combat_panel" onClick={() => { set({ encounter: true }); pushLog('有东西靠近。', 'attack') }} />
        <Ctl on={sim.everFought} label="④ 击退 → 结束遭遇" onClick={() => { set({ encounter: false, everFought: true }); pushLog('实体退散。', 'kill') }} />
        <Ctl on={sim.clearedAny} label="⑤ 通过本关 → move_btn" onClick={() => { set({ clearedAny: true }); setOverlay('banner') }} />
        <Ctl on={sim.movedAny} label="⑥ 前进 → level_header + turn" onClick={() => { set({ movedAny: true, seq: Math.min(sim.seq + 1, 5) }); setOverlay(null); pushLog('往前走了一段。', 'system') }} />
        <Ctl on={sim.ruleLevel} label="⑦ 进规则关 → rules_card" onClick={() => set({ ruleLevel: true, stanceLevel: false })} />
        <Ctl on={sim.stanceLevel} label="⑧ 进精英关 → stance_ui + 遭遇" onClick={() => { set({ ruleLevel: true, stanceLevel: true, encounter: true }); pushLog('这东西讲究路数。', 'system') }} />
        <Ctl on={unlocks.unlocked.has('craft_btn')} label="⑨ 模拟 🔧 unlockEvents(craft_btn·服务端 nar_line·D2)" onClick={() => unlocks.applyServerEvents([{ ui_key: 'craft_btn', nar_line: '（服务端权威）这两样，拼得到一起。——已开放：动手做。', timing: 'after', seq: 2 }])} />
        <div style={{ height: 8 }} />
        <div style={{ fontSize: 10, color: T.dim2 }}>覆盖层</div>
        <Ctl label="收敛 · 通关" onClick={() => setOverlay('cleared')} />
        <Ctl label="收敛 · 阵亡" onClick={() => setOverlay('dead')} />
        <Ctl label="清覆盖层" onClick={() => setOverlay(null)} />
        <div style={{ height: 8 }} />
        <Ctl label="⟲ 重置到初始态" onClick={() => { window.location.reload() }} />
      </div>

      {/* 手机取景框（390×844）：真实渲染 KaleidoRunView */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 11, color: T.dim2 }}>390 × 844（手机基线）</div>
        <div style={{ width: 390, height: 844, border: `1px solid ${T.border}`, borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: T.bg0, boxShadow: '0 12px 48px rgba(0,0,0,0.5)' }}>
          <KaleidoRunView
            unlocks={unlocks}
            seq={sim.seq}
            levelCount={5}
            turnCount={sim.turnCount}
            exitCondition={exitCondition}
            combatMode={combatMode}
            envRules={sim.ruleLevel ? [{ rule_key: 'pollution_accel', value: 1.5 }] : []}
            formulaOverrides={[]}
            me={{ name: '结构工程体', hp: 78, maxHp: 100, atk: 22, def: 9, alive: true }}
            invCount={sim.hasItems ? { 锈蚀弹匣: 2, 备用电池: 1 } : {}}
            itemsByName={MOCK_ITEMS}
            encounter={sim.encounter ? MOCK_ENCOUNTER : null}
            isStanceLevel={sim.stanceLevel}
            logs={sim.logs}
            busy={false}
            busyAction={null}
            canAct
            gameEnded={false}
            onSearch={() => { set({ searched: true }); pushLog('你翻找了一下。', 'system') }}
            onAttack={() => { set({ encounter: false, everFought: true }); pushLog('你击退了它。', 'kill') }}
            onStanceAttack={(st) => { set({ encounter: false, everFought: true }); pushLog(`⚔ 你出【${{ atk: '攻', def: '守', skill: '技' }[st]}】 · 命中。`, 'attack') }}
            onRelease={() => { set({ encounter: false }); pushLog('你绕开了它。', 'system') }}
            onUseItem={(name) => pushLog(`使用：${name}。`, 'heal')}
            onOpenEquipCraft={() => pushLog('（装备合成占位）', 'system')}
            onOpenItemCraft={() => pushLog('（道具合成占位）', 'system')}
            onAdvance={() => { set({ movedAny: true, seq: Math.min(sim.seq + 1, 5) }); pushLog('往前走了一段。', 'system') }}
            canAdvance={sim.clearedAny}
            banner={overlay === 'banner' ? {
              show: true, seq: sim.seq, nextSeq: Math.min(sim.seq + 1, 5),
              onContinue: () => { set({ movedAny: true, seq: Math.min(sim.seq + 1, 5) }); setOverlay(null); pushLog('往前走了一段。', 'system') },
              onStay: () => setOverlay(null), busy: false,
            } : null}
            convergence={(overlay === 'cleared' || overlay === 'dead') ? {
              status: overlay === 'cleared' ? 'cleared' : 'dead',
              summary: overlay === 'cleared'
                ? { levelsCleared: 5, levelCount: 5, turnCount: sim.turnCount, kills: 9, itemsCarried: 14 }
                : { levelsCleared: 2, levelCount: 5, turnCount: sim.turnCount, kills: 3, itemsCarried: 5, cause: '于第 3 关阵亡' },
              codex: overlay === 'cleared' ? [
                { seq: 1, name: '锈蚀回廊', cleared: true }, { seq: 2, name: '静默资源舱', cleared: true },
                { seq: 3, name: '精英遭遇区', cleared: true }, { seq: 4, name: '污染剪切带', cleared: true },
                { seq: 5, name: 'Ω-段首领室', cleared: true },
              ] : [],
              onRestart: () => setOverlay(null), onLobby: () => setOverlay(null),
            } : null}
          />
        </div>
      </div>

      {/* 大厅入口卡（延续既有预览 · 不在 run 视图内） */}
      <div style={{ width: 340, flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: T.dim2, marginBottom: 8 }}>大厅入口卡 KaleidoEntryCard（/rooms 置顶）</div>
        <KaleidoEntryCard onStart={() => {}} starting={false} error={null} />
      </div>
    </div>
  )
}

function Ctl({ label, on, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 12px', borderRadius: 8, textAlign: 'left', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
        border: `1px solid ${on ? T.green + '55' : T.border}`, background: on ? `${T.green}15` : T.bg2, color: on ? T.green : T.text,
      }}
    >
      {on ? '✓ ' : ''}{label}
    </button>
  )
}
