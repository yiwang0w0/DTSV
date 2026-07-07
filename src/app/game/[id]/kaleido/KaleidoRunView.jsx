// KALEIDO 单人远征视图 · 渐进披露（05 §1「UI 即进度」/ A Dark Room 式）
//   开局只有一个搜索按钮；随解锁逐件浮现（关卡头 / HP / 规则卡 / 战斗面板 / 背包 / 日志 / 前进 / 合成 /
//   三态出招）。全部 UI 件走 unlocks.isUnlocked(ui_key) 门控 + 首现渐次动效；nar_line 走数据（📖 N3）。
//
//   纯展示 + prop 驱动（无自持副作用）——GameClientPage 注入真状态/处理器，dev 预览注入 stub 谐调器。
//   多人局零回归：本视图仅在 isKaleido 分支渲染，多人渲染路径完全不经过这里。
//
//   1b 三态出招（stance_ui 解锁物）：协议 { action:'attackNpc', stance:'atk'|'def'|'skill' }，脏值回落 'atk'。

import { T, Btn, HpBar, LogLine, hpColor } from '../gameUi'
import {
  KaleidoLevelHeader,
  KaleidoRuleCard,
  KaleidoStanceTable,
  KaleidoLevelClearBanner,
  KaleidoConvergenceScreen,
  describeCombatMode,
} from './kaleidoShell'
import { UI_KEYS, KALEIDO_STATIC_LINES } from './kaleidoUiUnlocks'

// 解锁槽：未解锁 → 不渲染（不产 DOM）；首现 → 挂 kaleido-reveal 浮现动效。
function RevealSlot({ show, revealing, children, style, className = '' }) {
  if (!show) return null
  return (
    <div className={`${revealing ? 'kaleido-reveal ' : ''}${className}`.trim()} style={style}>
      {children}
    </div>
  )
}

const STANCE_BTNS = [
  { stance: 'atk', label: '攻', color: T.red, hint: '克技' },
  { stance: 'def', label: '守', color: T.cyan, hint: '克攻' },
  { stance: 'skill', label: '技', color: T.purple, hint: '克守' },
]

export default function KaleidoRunView({
  unlocks,
  // 关/run 状态
  seq = 1, levelCount = 5, turnCount = 0, exitCondition,
  combatMode, envRules = [], formulaOverrides = [],
  // 玩家
  me,
  invCount = {}, itemsByName = new Map(),
  // 战斗
  encounter = null, isStanceLevel = false,
  // 日志
  logs = [],
  // 标志
  busy = false, busyAction = null, canAct = false, gameEnded = false,
  // 处理器
  onSearch, onAttack, onStanceAttack, onRelease, onUseItem, onOpenEquipCraft, onOpenItemCraft,
  onAdvance, canAdvance = false,
  // 覆盖层
  banner = null, convergence = null,
}) {
  const isUnlocked = unlocks?.isUnlocked || (() => false)
  const justRevealed = unlocks?.justRevealed || (() => false)
  const narLog = unlocks?.narLog || []
  const unlockedCount = unlocks?.unlocked?.size ?? 1
  const minimal = unlockedCount <= 1 // 仅搜索按钮：A Dark Room 空景 hero 态

  const mode = combatMode ? describeCombatMode(combatMode) : null
  const showStance = isStanceLevel && isUnlocked(UI_KEYS.STANCE) && !!encounter

  // 最近一条披露 nar（minimal 态作 hero 副标；log 解锁后并入日志面板）。
  const latestNar = narLog.length ? narLog[narLog.length - 1].text : null

  return (
    <div style={{ flex: 1, position: 'relative', overflowY: 'auto', background: T.bg0, display: 'flex', flexDirection: 'column' }}>
      {/* ── 关卡头（level_header / turn_counter）──────────────────────────── */}
      <RevealSlot show={isUnlocked(UI_KEYS.LEVEL_HEADER)} revealing={justRevealed(UI_KEYS.LEVEL_HEADER)} style={{ flexShrink: 0 }}>
        <KaleidoLevelHeader
          seq={seq}
          levelCount={levelCount}
          turnCount={isUnlocked(UI_KEYS.TURN_COUNTER) ? turnCount : 0}
          exitCondition={exitCondition}
        />
      </RevealSlot>

      <div
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 640,
          margin: '0 auto',
          padding: minimal ? '0 16px' : '14px 16px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          justifyContent: minimal ? 'center' : 'flex-start',
          minHeight: minimal ? '60vh' : undefined,
        }}
      >
        {/* ── HP 状态读数（hp_bar · 时序法则：先于首害）──────────────────── */}
        <RevealSlot show={isUnlocked(UI_KEYS.HP) && !!me} revealing={justRevealed(UI_KEYS.HP)}>
          <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{me?.name || '单位'}</span>
              <span style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                <span style={{ color: T.orange }}>ATK {me?.atk ?? '?'}</span>
                <span style={{ color: T.cyan }}>DEF {me?.def ?? '?'}</span>
              </span>
            </div>
            <HpBar hp={me?.hp || 0} max={me?.maxHp || 100} h={8} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11 }}>
              <span style={{ color: hpColor(me?.hp, me?.maxHp), fontFamily: 'monospace', fontWeight: 700 }}>{me?.hp ?? '—'}</span>
              <span style={{ color: T.dim }}>{me?.maxHp ?? '—'}</span>
            </div>
            {me && !me.alive && <div style={{ marginTop: 8, textAlign: 'center', color: T.red, fontSize: 12 }}>{KALEIDO_STATIC_LINES.deathRegistered}</div>}
          </div>
        </RevealSlot>

        {/* ── 本关规则卡（rules_card · 时序法则：规则生效前）──────────────── */}
        <RevealSlot show={isUnlocked(UI_KEYS.RULES_CARD) && !!combatMode} revealing={justRevealed(UI_KEYS.RULES_CARD)}>
          <KaleidoRuleCard combatMode={combatMode} envRules={envRules} formulaOverrides={formulaOverrides} />
        </RevealSlot>

        {/* ── 战斗面板（combat_panel + 遭遇卡；stance_ui 时替换为三态出招）──── */}
        <RevealSlot show={isUnlocked(UI_KEYS.COMBAT) && !!encounter} revealing={justRevealed(UI_KEYS.COMBAT)}>
          <div style={{ background: T.bg1, borderRadius: 10, border: `1px solid ${T.red}40`, borderLeft: `3px solid ${T.red}`, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: T.dimB, marginBottom: 2 }}>遭遇敌对实体</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.red }}>{encounter?.npc?.name || '未知实体'}</div>
              </div>
              <div style={{ fontSize: 10, color: T.dim, fontFamily: 'monospace' }}>#{encounter?.id?.slice(-6) || '????'}</div>
            </div>
            <HpBar hp={encounter?.hp} max={encounter?.maxHp} h={8} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11 }}>
              <span style={{ color: hpColor(encounter?.hp, encounter?.maxHp), fontFamily: 'monospace', fontWeight: 700 }}>HP {encounter?.hp}/{encounter?.maxHp}</span>
              <span style={{ color: T.dim }}>ATK {encounter?.npc?.atk ?? '?'} · DEF {encounter?.npc?.def ?? '?'}</span>
            </div>

            {showStance ? (
              // 1b 三态出招（stance_ui）：三态克制（攻克技/技克守/守克攻），每态一颗按钮。
              <div style={{ marginTop: 12 }}>
                {mode?.kind === 'stance_duel' && <KaleidoStanceTable detail={mode.detail} />}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {STANCE_BTNS.map((s) => (
                    <Btn
                      key={s.stance}
                      variant="default"
                      loading={busyAction === 'attackNpc'}
                      sx={{ flex: 1, flexDirection: 'column', gap: 2, padding: '10px 0', background: `${s.color}18`, color: s.color, border: `1px solid ${s.color}45` }}
                      disabled={!canAct || busy}
                      onClick={() => onStanceAttack && onStanceAttack(s.stance)}
                    >
                      <span style={{ fontSize: 16, fontWeight: 800 }}>{s.label}</span>
                      <span style={{ fontSize: 9, opacity: 0.85 }}>{s.hint}</span>
                    </Btn>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: T.dim2, marginTop: 8, textAlign: 'center' }}>出招后本回合结算 · 详见日志</div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <Btn
                  variant="danger"
                  loading={busyAction === 'attackNpc'}
                  loadingText="袭击中..."
                  sx={{ flex: 2, padding: '10px 0', fontSize: 13, fontWeight: 700 }}
                  disabled={!canAct || busy}
                  onClick={() => onAttack && onAttack()}
                >
                  ⚔️ 袭击
                </Btn>
                <Btn variant="ghost" sx={{ flex: 1, padding: '10px 0' }} disabled={!canAct || busy} onClick={() => onRelease && onRelease()}>
                  放过
                </Btn>
              </div>
            )}
          </div>
        </RevealSlot>

        {/* ── 主行动区：搜索（初始唯一）+ 合成（craft_btn）+ 前进（move_btn）──── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Btn
            variant="primary"
            loading={busyAction === 'search'}
            loadingText="搜索中..."
            sx={{
              width: '100%', fontSize: minimal ? 16 : 14, padding: minimal ? '16px 0' : '12px 0',
              fontWeight: 700, letterSpacing: minimal ? 1 : 0,
            }}
            disabled={!canAct || busy}
            onClick={() => onSearch && onSearch()}
          >
            🔦 搜索
          </Btn>

          {minimal && latestNar && (
            <div className="kaleido-narline" style={{ textAlign: 'center', fontSize: 12, color: T.dim, marginTop: 4, padding: '6px 8px', borderRadius: 8, lineHeight: 1.6 }}>
              {latestNar}
            </div>
          )}

          <RevealSlot show={isUnlocked(UI_KEYS.MOVE) && canAdvance} revealing={justRevealed(UI_KEYS.MOVE)}>
            <Btn variant="default" sx={{ width: '100%', padding: '10px 0', fontWeight: 700, background: `${T.cyan}18`, color: T.cyan, border: `1px solid ${T.cyan}45` }} disabled={!canAct || busy} onClick={() => onAdvance && onAdvance()}>
              继续深入 →
            </Btn>
          </RevealSlot>

          <RevealSlot show={isUnlocked(UI_KEYS.CRAFT)} revealing={justRevealed(UI_KEYS.CRAFT)}>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn variant="warn" sx={{ flex: 1 }} disabled={!canAct || busy} onClick={() => onOpenEquipCraft && onOpenEquipCraft()}>装备合成</Btn>
              <Btn variant="warn" sx={{ flex: 1 }} disabled={!canAct || busy} onClick={() => onOpenItemCraft && onOpenItemCraft()}>道具合成</Btn>
            </div>
          </RevealSlot>
        </div>

        {/* ── 背包（inventory）──────────────────────────────────────────── */}
        <RevealSlot show={isUnlocked(UI_KEYS.INVENTORY)} revealing={justRevealed(UI_KEYS.INVENTORY)}>
          <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: `1px solid ${T.border}`, fontSize: 11, color: T.dim }}>
              <span style={{ fontWeight: 700, color: T.text }}>🎒 随身</span>
              <span>{Object.values(invCount).reduce((a, b) => a + b, 0)} 件</span>
            </div>
            <div style={{ padding: '8px 12px' }}>
              {Object.keys(invCount).length === 0 ? (
                <div style={{ textAlign: 'center', color: T.dim, padding: '10px 0', fontSize: 11 }}>空空如也</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Object.entries(invCount).map(([name, count]) => {
                    const itemDef = itemsByName.get(name)
                    return (
                      <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: T.bg2, border: `1px solid ${T.border}` }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 12, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {name}{count > 1 && <span style={{ color: T.dim, fontSize: 10, marginLeft: 5 }}>×{count}</span>}
                          </div>
                          {itemDef?.description && (
                            <div style={{ fontSize: 10, color: T.dimB, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{itemDef.description}</div>
                          )}
                        </div>
                        {canAct && (
                          <Btn size="sm" variant="default" sx={{ flexShrink: 0, fontSize: 10, padding: '3px 8px' }} disabled={busy} onClick={() => onUseItem && onUseItem(name)}>使用</Btn>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </RevealSlot>

        {/* ── 日志面板（log_panel · 对局 log + stub 披露 nar_line）──────────── */}
        <RevealSlot show={isUnlocked(UI_KEYS.LOG)} revealing={justRevealed(UI_KEYS.LOG)}>
          <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, fontSize: 11, fontWeight: 700, color: T.text }}>📜 日志</div>
            <div style={{ padding: '4px 12px 10px', maxHeight: 260, overflowY: 'auto' }}>
              {logs.length === 0 && narLog.length === 0 ? (
                <div style={{ textAlign: 'center', color: T.dim, marginTop: 16, fontSize: 12 }}>等待事件…</div>
              ) : (
                <>
                  {logs.map((entry, i) => <LogLine key={`${entry.time}-${i}`} entry={entry} />)}
                  {narLog.map((n) => (
                    <div key={`nar-${n.key}`} className="kaleido-narline" style={{ padding: '4px 6px', borderRadius: 6, fontSize: 12, color: T.cyan, lineHeight: 1.6, fontStyle: 'italic' }}>
                      {n.text}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </RevealSlot>
      </div>

      {/* ── 覆盖层：关间横幅 + 收敛页 ─────────────────────────────────────── */}
      {banner?.show && (
        <KaleidoLevelClearBanner
          seq={banner.seq}
          nextSeq={banner.nextSeq}
          levelCount={levelCount}
          onContinue={banner.onContinue}
          onStay={banner.onStay}
          busy={banner.busy}
        />
      )}
      {convergence && (
        <KaleidoConvergenceScreen
          status={convergence.status}
          summary={convergence.summary}
          codex={convergence.codex}
          onRestart={convergence.onRestart}
          onLobby={convergence.onLobby}
        />
      )}
    </div>
  )
}
