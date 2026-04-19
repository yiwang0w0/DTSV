'use client'

/**
 * BattleModal.jsx — 增强版战斗界面
 *
 * 全屏战斗面板：
 *   - 顶栏：回合数 + 先手标记
 *   - 双方状态卡片：HP条 + ATK/DEF + Buff列表
 *   - AP 条：●●●●○○
 *   - 技能栏：武器技能按钮（含 AP 消耗 + 伤害预估）
 *   - 通用操作：防御 / 道具 / 逃跑 / 结束回合
 *   - 战斗日志
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { T, HpBar, Btn, hpColor } from './gameUi'

// ── AP 条组件 ──
function ApBar({ current, max }) {
  const dots = []
  for (let i = 0; i < max; i++) {
    dots.push(
      <span
        key={i}
        style={{
          display: 'inline-block',
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: i < current ? T.cyan : `${T.dim}40`,
          border: `1px solid ${i < current ? T.cyan : T.dim}`,
          boxShadow: i < current ? `0 0 6px ${T.cyan}60` : 'none',
          transition: 'all .3s',
        }}
      />
    )
  }
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {dots}
      <span style={{ fontSize: 10, color: T.dimB, marginLeft: 4 }}>{current}/{max}</span>
    </div>
  )
}

// ── Buff 标签 ──
function BattleBuff({ buff }) {
  const BUFF_LABELS = {
    defUp: { label: 'DEF↑', color: T.green, icon: '🛡️' },
    defDown: { label: 'DEF↓', color: T.red, icon: '💔' },
    atkDown: { label: 'ATK↓', color: T.red, icon: '⬇️' },
    atkUp: { label: 'ATK↑', color: T.green, icon: '⬆️' },
    apDown: { label: 'AP↓', color: T.yellow, icon: '⏳' },
  }
  const meta = BUFF_LABELS[buff.type] || { label: buff.type, color: T.dimB, icon: '✦' }

  return (
    <span
      title={`${meta.label} ${Math.round(buff.value * 100)}%（剩余 ${buff.duration} 回合）`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        padding: '1px 6px',
        borderRadius: 6,
        fontSize: 10,
        background: `${meta.color}15`,
        border: `1px solid ${meta.color}30`,
        color: meta.color,
      }}
    >
      {meta.icon} {meta.label} {buff.duration}
    </span>
  )
}

// ── 技能按钮 ──
function SkillButton({ skill, ap, disabled, busy, onClick, estimate }) {
  const canUse = ap >= skill.apCost && !disabled && !busy
  const isAttack = skill.damageMult > 0

  return (
    <button
      onClick={canUse ? onClick : undefined}
      disabled={!canUse}
      className="hov"
      style={{
        background: canUse
          ? (isAttack ? `${T.red}18` : `${T.cyan}15`)
          : `${T.bg0}80`,
        border: `1px solid ${canUse ? (isAttack ? `${T.red}50` : `${T.cyan}40`) : T.border}`,
        borderRadius: 8,
        padding: '8px 10px',
        cursor: canUse ? 'pointer' : 'not-allowed',
        opacity: canUse ? 1 : 0.4,
        textAlign: 'center',
        minWidth: 72,
        transition: 'all .2s',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: canUse ? T.text : T.dim }}>
        {skill.name}
      </div>
      <div style={{ fontSize: 10, color: T.dimB, marginTop: 2 }}>
        {skill.apCost} AP
      </div>
      {isAttack && estimate > 0 && (
        <div style={{ fontSize: 10, color: T.orange, marginTop: 1 }}>
          ~{estimate} 伤害
        </div>
      )}
      {skill.effect && skill.effect !== 'armorPierce' && skill.effect !== 'critBoost' && (
        <div style={{ fontSize: 9, color: T.purple, marginTop: 1 }}>
          {skill.description?.slice(0, 12)}
        </div>
      )}
    </button>
  )
}

// ── 战斗日志条目 ──
function BattleLogEntry({ entry }) {
  const colorMap = {
    damage: T.red,
    crit: T.yellow,
    heal: T.green,
    buff: T.purple,
    debuff: T.red,
    skill: T.purple,
    flee: T.cyan,
    death: T.red,
    system: T.dimB,
  }
  const color = colorMap[entry.type] || T.dimB

  return (
    <div style={{
      padding: '3px 0',
      fontSize: 11,
      color,
      lineHeight: 1.5,
      borderBottom: `1px solid ${T.border}`,
    }}>
      <span style={{ color: T.dim, fontSize: 9, marginRight: 4, fontFamily: 'monospace' }}>
        R{entry.turn}
      </span>
      {entry.text}
    </div>
  )
}

// ══════════════════════════════════════
//  主组件
// ══════════════════════════════════════

export default function BattleModal({ battle, player, roomId, onBattleAction, busy }) {
  const logRef = useRef(null)
  const [animDmg, setAnimDmg] = useState(null)

  // 日志自动滚动到底部
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [battle?.log?.length])

  if (!battle || !battle.opponent) return null

  const opponent = battle.opponent
  const ap = battle.playerAp || 0
  const maxAp = 6 // 默认最大AP
  const isPlayerTurn = battle.whoseTurn === 'player'

  // 技能列表：武器技能 + 通用动作
  const weaponSkills = (battle.playerSkills || []).filter(
    s => s.id !== 'defend' && s.id !== 'useItem' && s.id !== 'flee'
  )

  // 伤害预估（简易版：用前端数据估算）
  const estimates = useMemo(() => {
    const result = {}
    for (const skill of weaponSkills) {
      if (skill.damageMult > 0) {
        // 简易估算：damageMult × ATK - DEF × 0.5
        const atk = player?.atk || 10
        const def = opponent.def || 5
        result[skill.id] = Math.max(1, Math.floor(skill.damageMult * atk - def * 0.5))
      }
    }
    return result
  }, [weaponSkills, player?.atk, opponent.def])

  // ── 操作函数 ──
  const doSkill = useCallback((skillId) => {
    onBattleAction({ action: 'skill', skillId })
  }, [onBattleAction])

  const doDefend = useCallback(() => {
    onBattleAction({ action: 'defend' })
  }, [onBattleAction])

  const doEndTurn = useCallback(() => {
    onBattleAction({ action: 'endTurn' })
  }, [onBattleAction])

  const doFlee = useCallback(() => {
    onBattleAction({ action: 'flee' })
  }, [onBattleAction])

  const doUseItem = useCallback((itemName) => {
    onBattleAction({ action: 'useItem', itemName })
  }, [onBattleAction])

  // 可用消耗品
  const consumables = (player?.inventory || []).filter(name =>
    /药|治|血|包扎|绷带|食|水|饭/.test(name)
  )

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)',
      zIndex: 1000,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 16,
    }}>
      <div style={{
        background: T.bg1,
        border: `1px solid ${T.borderB}`,
        borderRadius: 12,
        width: '100%',
        maxWidth: 600,
        maxHeight: '95vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: `0 0 40px rgba(0,0,0,0.5), 0 0 2px ${T.cyan}30`,
      }}>

        {/* ── 顶栏 ── */}
        <div style={{
          padding: '10px 16px',
          borderBottom: `1px solid ${T.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: `${T.bg2}80`,
        }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: T.red }}>
            ⚔ 战斗 · 回合 {battle.turn}
          </span>
          <span style={{ fontSize: 11, color: T.dimB }}>
            {battle.firstStrike === 'player' ? '你先手' : `${opponent.name}先手`}
          </span>
        </div>

        {/* ── 双方状态卡片 ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          gap: 12,
          padding: '12px 16px',
          alignItems: 'start',
        }}>
          {/* 玩家 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.cyan, marginBottom: 4 }}>
              {player?.name || '你'}
            </div>
            <HpBar hp={player?.hp || 0} max={player?.maxHp || 100} h={8} />
            <div style={{ fontSize: 10, color: T.dim, marginTop: 3 }}>
              HP {player?.hp || 0}/{player?.maxHp || 100}
            </div>
            <div style={{ fontSize: 10, color: T.dimB, marginTop: 2 }}>
              ATK {player?.atk || 0} · DEF {player?.def || 0}
            </div>
            {/* AP 条 */}
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 9, color: T.dim, marginBottom: 2 }}>AP</div>
              <ApBar current={ap} max={maxAp} />
            </div>
            {/* 玩家 Buff */}
            {(battle.playerBuffs || []).length > 0 && (
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 4 }}>
                {battle.playerBuffs.map((b, i) => <BattleBuff key={i} buff={b} />)}
              </div>
            )}
            {battle.isDefending && (
              <div style={{ fontSize: 10, color: T.green, marginTop: 3 }}>🛡️ 防御中</div>
            )}
          </div>

          {/* VS */}
          <div style={{ fontSize: 22, color: T.dim, alignSelf: 'center', padding: '0 4px' }}>
            VS
          </div>

          {/* 对手 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.red, marginBottom: 4 }}>
              {opponent.name}
              {opponent.level === 'boss' && (
                <span style={{ fontSize: 9, color: T.yellow, marginLeft: 4, border: `1px solid ${T.yellow}40`, borderRadius: 4, padding: '0 4px' }}>BOSS</span>
              )}
              {opponent.level === 'elite' && (
                <span style={{ fontSize: 9, color: T.purple, marginLeft: 4, border: `1px solid ${T.purple}40`, borderRadius: 4, padding: '0 4px' }}>精英</span>
              )}
            </div>
            <HpBar hp={opponent.hp} max={opponent.maxHp} h={8} />
            <div style={{ fontSize: 10, color: T.dim, marginTop: 3 }}>
              HP {opponent.hp}/{opponent.maxHp}
            </div>
            <div style={{ fontSize: 10, color: T.dimB, marginTop: 2 }}>
              ATK {opponent.atk} · DEF {opponent.def}
            </div>
            <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>
              策略：{opponent.strategy === 'counter' ? '重视反击' : opponent.strategy === 'defense' ? '重视防御' : opponent.strategy === 'evade' ? '重视躲避' : '通常'}
            </div>
            {/* 对手 Buff */}
            {(opponent.buffs || []).length > 0 && (
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 4 }}>
                {opponent.buffs.map((b, i) => <BattleBuff key={i} buff={b} />)}
              </div>
            )}
            {opponent.isDefending && (
              <div style={{ fontSize: 10, color: T.green, marginTop: 3 }}>🛡️ 防御中</div>
            )}
          </div>
        </div>

        {/* ── 技能栏 ── */}
        {isPlayerTurn && (
          <div style={{
            padding: '8px 16px',
            borderTop: `1px solid ${T.border}`,
            borderBottom: `1px solid ${T.border}`,
            background: `${T.bg0}60`,
          }}>
            <div style={{ fontSize: 10, color: T.dim, marginBottom: 6 }}>武器技能</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {weaponSkills.map(skill => (
                <SkillButton
                  key={skill.id}
                  skill={skill}
                  ap={ap}
                  disabled={!isPlayerTurn}
                  busy={busy}
                  estimate={estimates[skill.id] || 0}
                  onClick={() => doSkill(skill.id)}
                />
              ))}
            </div>

            {/* 通用操作 */}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Btn
                variant="ghost"
                size="sm"
                disabled={busy || ap < 2 || battle.isDefending}
                onClick={doDefend}
                sx={{ fontSize: 11 }}
              >
                🛡️ 防御 (2AP)
              </Btn>

              {consumables.length > 0 && (
                <Btn
                  variant="ghost"
                  size="sm"
                  disabled={busy || ap < 2}
                  onClick={() => doUseItem(consumables[0])}
                  sx={{ fontSize: 11 }}
                >
                  💊 {consumables[0]} (2AP)
                </Btn>
              )}

              <Btn
                variant="ghost"
                size="sm"
                disabled={busy || ap < 6}
                onClick={doFlee}
                sx={{ fontSize: 11, color: T.yellow }}
              >
                🏃 逃跑 (6AP)
              </Btn>

              <div style={{ flex: 1 }} />

              <Btn
                variant="primary"
                size="sm"
                disabled={busy}
                onClick={doEndTurn}
                sx={{ fontSize: 12, fontWeight: 700, padding: '6px 16px' }}
              >
                结束回合 ▸
              </Btn>
            </div>
          </div>
        )}

        {/* 等待 NPC 回合 */}
        {!isPlayerTurn && (
          <div style={{
            padding: '16px',
            textAlign: 'center',
            color: T.dimB,
            fontSize: 13,
            borderTop: `1px solid ${T.border}`,
          }}>
            {opponent.name} 的回合...
          </div>
        )}

        {/* ── 战斗日志 ── */}
        <div
          ref={logRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 16px',
            minHeight: 100,
            maxHeight: 180,
          }}
        >
          <div style={{ fontSize: 10, color: T.dim, marginBottom: 4, fontWeight: 700 }}>战斗记录</div>
          {(battle.log || []).map((entry, i) => (
            <BattleLogEntry key={i} entry={typeof entry === 'string' ? { text: entry, type: 'system', turn: 0 } : entry} />
          ))}
        </div>
      </div>
    </div>
  )
}
