'use client'

// 【临时 · dev 验证用】KALEIDO 渐进披露（05 §1）谐调器。
//   用 stub 谐调器驱动 useKaleidoUiUnlocks + KaleidoRunView：从「初始态=仅搜索按钮」出发，
//   逐个触发解锁（搜索/拾物/遭遇/通关/前进/规则关/精英关…），观察渐次动效 + nar_line 落日志。
//   联调（GameClientPage 接真 gamevars/解锁事件）后本页可删。
import { useMemo, useState } from 'react'
import { T } from '@/app/game/[id]/gameUi'
import KaleidoRunView from '@/app/game/[id]/kaleido/KaleidoRunView'
import KaleidoAvgView from '@/app/game/[id]/kaleido/KaleidoAvgView'
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
  // 预览模式:avg = AVG 呈现骨架原型(10 垂直切片·seq1-2) / runview = 旧渐进披露栈式谐调器。
  const [mode, setMode] = useState('avg')
  const [avgKey, setAvgKey] = useState(0) // 重放 AVG 冷开场
  const [avgLive, setAvgLive] = useState(false) // P1：AVG 吃真 ui_unlocks 数据 vs 内部预览 sim
  const [avgResuming, setAvgResuming] = useState(false) // Bug③：模拟「再进」——跳觉醒行、直接延续

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
  // dev 谐调器无服务端可发 unlockEvents ⇒ 显式开 deriveStub 靠布尔 ctx 驱动预览。
  //   正式路径（GameClientPage）**永不开**：那会让客户端替玩家「发现」UI（教义法则二）。
  const unlocks = useKaleidoUiUnlocks(ctx, { enabled: true, emitNarLog: true, deriveStub: true })

  const combatMode = sim.stanceLevel ? STANCE_MODE : sim.ruleLevel ? GAUNTLET_MODE : STANDARD_MODE
  const exitCondition = sim.stanceLevel
    ? { type: 'boss_kill', params: { name: '锈蚀主锚' } }
    : { type: 'survive_turns', params: { turns: 8 } }

  return (
    <div style={{ background: '#05070c', color: T.text, minHeight: '100dvh', padding: 20 }}>
      {/* 预览模式切换 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: T.dim }}>【dev】KALEIDO 预览：</span>
        <ModeBtn on={mode === 'avg'} onClick={() => setMode('avg')}>AVG 呈现骨架原型（10 · seq1-2）</ModeBtn>
        <ModeBtn on={mode === 'runview'} onClick={() => setMode('runview')}>渐进披露栈式谐调器（旧）</ModeBtn>
      </div>

      {mode === 'avg' ? (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ maxWidth: 320, fontSize: 12, color: T.dim2, lineHeight: 1.7 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.cyan, marginBottom: 8 }}>AVG 呈现骨架原型</div>
            文字舞台为主体 · UI 件随进度在四缘「材质化」析出 · nar_line→件 因果两拍。<br /><br />
            <b>验证点</b>：① 冷开局钩子（黑幕→觉醒行→搜索·防 10 秒跳出）② 因果两拍手感（nar 落舞台→件延迟析出 + 闪 cyan）③ 文字重复烦不烦（占位血肉测节奏）。<br /><br />
            <b>操作</b>：等冷开场结束→点「🔦 搜索」看座舱结晶一拍（log 醒 + 血条 gauge-first + 抽屉）；连点几次测文字节奏；右上「遭遇」触发首战覆盖、「规则关」触发门口告示闸门。<br /><br />
            占位文案（真血肉 &gt;2500 行 = Kanata 自驱线·不阻塞手感验证）。
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => { setAvgKey((k) => k + 1) }} style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg2, color: T.text, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>⟲ 重放冷开场</button>
              {/* P1：真数据接线开关 —— 开启后 AVG 吃真 useKaleidoUiUnlocks(sticky 集/narLog/justUnlocked) + logs */}
              <button
                onClick={() => { setAvgLive((v) => !v); setAvgKey((k) => k + 1) }}
                style={{ padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
                  border: `1px solid ${avgLive ? T.green + '66' : T.border}`, background: avgLive ? `${T.green}18` : T.bg2, color: avgLive ? T.green : T.text }}
              >
                {avgLive ? '✓ 真数据模式（ui_unlocks 驱动）' : '○ 预览兜底模式（内部 sim）'}
              </button>
              {/* Bug③：冷开场只播一次。开=模拟「再进」(跳觉醒行·直接延续)，关=账号首次醒来(完整冷开场)。 */}
              <button
                onClick={() => { setAvgResuming((v) => !v); setAvgKey((k) => k + 1) }}
                style={{ padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
                  border: `1px solid ${avgResuming ? T.cyan + '66' : T.border}`, background: avgResuming ? `${T.cyan}18` : T.bg2, color: avgResuming ? T.cyan : T.text }}
              >
                {avgResuming ? '✓ 再进（延续·跳觉醒行）' : '○ 账号首次醒来（完整冷开场）'}
              </button>
              {avgLive && (
                <div style={{ fontSize: 11, color: T.dim2, lineHeight: 1.6, borderLeft: `2px solid ${T.green}55`, paddingLeft: 8 }}>
                  AVG 现在吃 <b>真 useKaleidoUiUnlocks</b>：舞台文字来自 logs + narLog，浮现由 justUnlocked 走因果两拍。
                  在框内点「🔦 搜索」推进 ctx（log_panel+hp_bar 解锁）；下面 ⑨ 按钮可注入 <b>服务端 D2 unlockEvents</b> 看真信封驱动浮现。
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Ctl on={sim.hasItems} label="② 拾得道具 → inventory 浮现" onClick={() => { set({ hasItems: true }); pushLog('缝里卡着个东西：锈蚀弹匣。', 'system') }} />
                    <Ctl on={unlocks.unlocked.has('craft_btn')} label="⑨ 注入服务端 unlockEvents(craft_btn·D2)" onClick={() => unlocks.applyServerEvents([{ ui_key: 'craft_btn', nar_line: '（服务端权威）这两样，拼得到一起。——已开放：动手做。', timing: 'after', seq: 1 }])} />
                  </div>
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, color: T.dim2 }}>390 × 844（手机基线 · 沉浸全屏）{avgLive && <span style={{ color: T.green }}> · 真数据</span>}</div>
            <div style={{ width: 390, height: 844, border: `1px solid ${avgLive ? T.green + '55' : T.border}`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 12px 48px rgba(0,0,0,0.5)' }}>
              {avgLive ? (
                <KaleidoAvgView
                  key={`live-${avgKey}-${avgResuming}`}
                  showDevControls
                  resuming={avgResuming}
                  unlocks={unlocks}
                  logs={sim.logs}
                  me={{ hp: 78, maxHp: 100, stamina: 72, maxStamina: 100, atk: 22, def: 9 }}
                  encounter={sim.encounter ? MOCK_ENCOUNTER : null}
                  combatMode={combatMode}
                  envRules={sim.ruleLevel ? [{ rule_key: 'pollution_accel', value: 1.5 }] : []}
                  canAct
                  onSearch={() => { set({ searched: true }); pushLog('你翻找了一下。锈迹、灰、更多的锈。', 'system') }}
                  onAttack={() => { set({ encounter: false, everFought: true }); pushLog('你先出手。它退回暗处。', 'kill') }}
                  onRelease={() => { set({ encounter: false }); pushLog('你绕开了它。', 'system') }}
                  // 逃生路径（对局页顶栏已隐藏时的唯一出口）——dev 侧只做可见性/手感验证，不真跳转。
                  onExit={() => pushLog('（dev）切断信号 —— 线上此处 router.push("/rooms")。', 'system')}
                />
              ) : (
                <KaleidoAvgView key={`${avgKey}-${avgResuming}`} showDevControls resuming={avgResuming} />
              )}
            </div>
          </div>
        </div>
      ) : (
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
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
      )}
    </div>
  )
}

function ModeBtn({ children, on, onClick }) {
  return (
    <button onClick={onClick} style={{ padding: '7px 12px', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', border: `1px solid ${on ? T.cyan + '66' : T.border}`, background: on ? `${T.cyan}18` : T.bg2, color: on ? T.cyan : T.dim, fontWeight: on ? 700 : 400 }}>
      {children}
    </button>
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
