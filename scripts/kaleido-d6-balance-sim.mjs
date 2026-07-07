// ─────────────────────────────────────────────────────────────────
// KALEIDO D6 平衡核算 harness(⚙️ KP1-G ② · 只读分析工具 · 双战斗模型)
// ─────────────────────────────────────────────────────────────────
// ⚠ 重要发现(对抗验证 + 读真码 gameActions.js:1817-2015 确认):
//   kaleido 现有 standard/boss 战斗**不走** combatModes,走**遗留富路径** resolveNpcAttackAction:
//     · 玩家命中 Math.random()<0.85(15% miss)
//     · 敌反击仅 counter_rate(默认0.3) × npc_accuracy(0.85) ≈ 0.255/回合(非每回合)
//     · calcDamage(gameEngine.js:65)公式 = combatModes.hit 同式(atk·1 − def·0.5, crit 0.1×1.5)
//     · applyPollutionCombatModifier 放大伤害(boss 关 pollution 高)
//     · 用 Math.random(违反 R1!)—— 迁 combatModes(seed-PRNG)是 🔧 D5/LW-3 待办
//   combatModes(100% 命中 + 敌每回合)只有 stance_duel 走 live(LW-2)。standard/gauntlet 迁移未做。
//   ∴ 本 harness 建**两套模型**,boss 数值随 🧭/🔧 的模型选型待定(见 08 §1)。
// 跑法:node scripts/kaleido-d6-balance-sim.mjs
// 非引擎代码:纯离线分析,零 DB/gamevars/runtime;用 Math.random 做统计(非游戏运行时,R1 不适用)。
// ─────────────────────────────────────────────────────────────────

import { COMBAT_MODES } from '../src/lib/server/kaleido/combatModes/index.js' // seq3 stance_duel 是唯一 live-faithful 档(LW-2),用真模块

const TRIALS = 8000
const CRIT_RATE = 0.10, CRIT_MUL = 1.5

// 共享伤害公式(= calcDamage / combatModes.hit):max(1, floor(atk − def·0.5)),暴击 ×1.5。
function hitDmg(atk, def) {
  let d = Math.max(1, Math.floor(atk * 1 - def * 0.5))
  if (Math.random() < CRIT_RATE) d = Math.max(1, Math.floor(d * CRIT_MUL))
  return d
}

// ── 模型 A:combatModes 语义(玩家 100% 命中 + 敌每回合出手)——= 迁移目标(R1 seed-PRNG)/ stance_duel 现状 ──
function simCombatModes(P, E) {
  let php = P.hp, pot = P.potions, ehp = E.hp, turns = 0
  while (php > 0 && ehp > 0 && turns < 300) {
    turns++
    if (php / P.maxHp < 0.3 && pot > 0) { pot--; php = Math.min(P.maxHp, php + P.heal) } // 用药(占回合)
    else { ehp -= hitDmg(P.atk, E.def) }                                                  // 攻击(必中)
    if (ehp <= 0) break
    php -= hitDmg(E.atk, P.def)                                                            // 敌每回合反击
  }
  return { win: ehp <= 0 && php > 0, turns, potUsed: P.potions - pot }
}

// ── 模型 B:遗留富路径语义(玩家 85% 命中 + 敌 counter 0.3×acc 0.85 ≈ 0.255/回合 + 可选污染放大)——= 现 live ──
function simRichPath(P, E, pollutionMult = 1) {
  let php = P.hp, pot = P.potions, ehp = E.hp, turns = 0
  while (php > 0 && ehp > 0 && turns < 400) {
    turns++
    if (php / P.maxHp < 0.3 && pot > 0) { pot--; php = Math.min(P.maxHp, php + P.heal); continue } // 用药动作:无敌反击(rich path useItem 独立动作)
    if (Math.random() < 0.85) ehp -= hitDmg(P.atk, E.def)                                          // 玩家攻击 85% 命中
    if (ehp <= 0) break
    if (Math.random() < 0.3 && Math.random() < 0.85) {                                             // 敌反击 counter×acc
      php -= Math.floor(hitDmg(E.atk, P.def) * pollutionMult)                                       // 污染放大(sensitivity)
    }
  }
  return { win: ehp <= 0 && php > 0, turns, potUsed: P.potions - pot }
}

function rate(simFn, P, E, ...extra) {
  let win = 0, tt = 0, pp = 0
  for (let i = 0; i < TRIALS; i++) { const r = simFn(P, E, ...extra); if (r.win) win++; tt += r.turns; pp += r.potUsed }
  return { clear: win / TRIALS, turns: tt / TRIALS, pot: pp / TRIALS }
}

const PROFILES = {
  naked:    { atk: 10, def: 5,  hp: 100, maxHp: 100, potions: 2, heal: 30 },
  minimal:  { atk: 12, def: 6,  hp: 110, maxHp: 110, potions: 4, heal: 30 },
  solid:    { atk: 14, def: 8,  hp: 120, maxHp: 120, potions: 4, heal: 30 },
  prepared: { atk: 16, def: 9,  hp: 130, maxHp: 130, potions: 5, heal: 30 },
  over:     { atk: 19, def: 11, hp: 145, maxHp: 145, potions: 6, heal: 30 },
}
const pct = (x) => `${(x * 100).toFixed(0).padStart(4)}%`

console.log(`\n=== KALEIDO D6 平衡核算 · 双战斗模型 (${TRIALS} trials/格) ===\n`)

// ── 【0】数据点核对:naked vs 旧采样 boss(102/20/3)哪个模型复现"8 交换死"? ──
console.log('【0】数据点核对 — naked vs 旧 boss(102/20/3),各模型 clearRate / avgTurns:')
{
  const cm = rate(simCombatModes, PROFILES.naked, { hp: 102, maxHp: 102, atk: 20, def: 3 })
  const rp1 = rate(simRichPath, PROFILES.naked, { hp: 102, maxHp: 102, atk: 20, def: 3 }, 1)
  const rp2 = rate(simRichPath, PROFILES.naked, { hp: 102, maxHp: 102, atk: 20, def: 3 }, 2)
  const rp3 = rate(simRichPath, PROFILES.naked, { hp: 102, maxHp: 102, atk: 20, def: 3 }, 3)
  console.log(`     combatModes(A)     : ${pct(cm.clear)}  ${cm.turns.toFixed(1)}t   ← 复现"死"(0%)`)
  console.log(`     richPath poll×1(B) : ${pct(rp1.clear)}  ${rp1.turns.toFixed(1)}t   ← 现 live 无污染:naked 反而稳赢`)
  console.log(`     richPath poll×2    : ${pct(rp2.clear)}  ${rp2.turns.toFixed(1)}t`)
  console.log(`     richPath poll×3    : ${pct(rp3.clear)}  ${rp3.turns.toFixed(1)}t   ← 高污染才逼近"死"`)
  console.log(`     → 数据点"8 交换死"只在 combatModes 或 高污染 richPath 下成立(见 08 §1 判读)\n`)
}

// ── 【1】seq5 boss 反解 · 两模型对照 ──
const PKEYS = ['naked', 'minimal', 'solid', 'prepared', 'over']
const BOSSES = [
  { label: '160/20/5', hp: 160, atk: 20, def: 5 },
  { label: '168/20/5', hp: 168, atk: 20, def: 5 },
  { label: '200/26/6', hp: 200, atk: 26, def: 6 },
  { label: '260/34/8', hp: 260, atk: 34, def: 8 },
  { label: '320/44/10', hp: 320, atk: 44, def: 10 },
]
for (const [name, simFn, extra] of [['模型A combatModes(迁移目标)', simCombatModes, []], ['模型B richPath poll×1(现 live)', simRichPath, [1]], ['模型B richPath poll×2', simRichPath, [2]]]) {
  console.log(`【1】seq5 boss × 准备度 — ${name}:`)
  console.log('     boss        ' + PKEYS.map((k) => k.padStart(6)).join(' '))
  for (const b of BOSSES) {
    const row = PKEYS.map((k) => pct(rate(simFn, PROFILES[k], { hp: b.hp, maxHp: b.hp, atk: b.atk, def: b.def }, ...extra).clear))
    console.log(`     ${b.label.padEnd(11)} ${row.join(' ')}`)
  }
  console.log('')
}

// ── 【2】seq3 elite(stance_duel · 已 LW-2 走 combatModes live)——用真模块(唯一 live-faithful 档) ──
console.log('【2】seq3 elite(stance_duel · combatModes.stance_duel 真模块 live via LW-2)× minimal:')
{
  const mode = COMBAT_MODES.stance_duel
  const params = { counterMul: 1.6, atkMul: 1, defMul: 0.5 }
  for (const e of [{ l: '70/12/4', hp: 70, atk: 12, def: 4 }, { l: '80/13/4', hp: 80, atk: 13, def: 4 }, { l: '90/15/5', hp: 90, atk: 15, def: 5 }]) {
    let win = 0, tt = 0
    for (let i = 0; i < TRIALS; i++) {
      const setup = { seed: `elite:${e.l}:${i}`, player: { ...PROFILES.minimal }, enemy: { hp: e.hp, maxHp: e.hp, atk: e.atk, def: e.def } }
      let s = mode.initState(setup, params); let n = 0
      while (!s.over && n < 300) { s = mode.resolveTurn(s, mode.bot(s, params), params); n++ }
      if ((s.outcome || (s.player.hp > 0 ? 'win' : 'lose')) === 'win') win++; tt += n
    }
    console.log(`     ${e.l.padEnd(9)} clear=${pct(win / TRIALS)}  ${(tt / TRIALS).toFixed(1)}t  (stance 克制 washout·clear≈属性函数·见 08 §5)`)
  }
}

console.log('\n=== 完 ===\n')
