// ─────────────────────────────────────────────────────────────────
// KALEIDO D6 经济闭环 harness(⚙️ KP1-G ③④⑤ · §6 · 只读分析)
// ─────────────────────────────────────────────────────────────────
// 目标:解 weighted 掉落概率,使「玩家回合分配(搜刮量)」平滑映射到准备度 → boss 胜率。
//   模型链:每关 search 次数(profile)→ weighted 掉落(stat 件/材料/恢复·概率 p)→ 合成(材料→stat)
//           → 战力档 → 富路径 boss 战(severe 污染)→ 胜率。
// 🔧 机制核实(定 harness 保真):①encounter 时能搜(边打边搜)②达标后能留关囤货(search 无上限)③清关≠离关。
//   ∴ search 次数下限 = survive_turns(推进门禁),上限开放 → 必跑多档 profile(rush/balanced/hoarder)。
// 跑法:node scripts/kaleido-d6-economy-sim.mjs
// 非引擎代码:纯离线;Math.random 做统计。
// ─────────────────────────────────────────────────────────────────

const TRIALS = 6000

// ── 富路径 boss 战(= 08 harness 模型乙·severe 污染玩家己伤 ×0.85) ──
function hitDmg(atk, def) {
  let d = Math.max(1, Math.floor(atk - def * 0.5))
  if (Math.random() < 0.10) d = Math.max(1, Math.floor(d * 1.5))
  return d
}
function bossFight(P, boss, playerDmgMult = 0.85) {
  let php = P.hp, pot = P.potions, ehp = boss.hp
  for (let t = 0; t < 400 && php > 0 && ehp > 0; t++) {
    if (php / P.maxHp < 0.3 && pot > 0) { pot--; php = Math.min(P.maxHp, php + 30); continue }
    if (Math.random() < 0.85) ehp -= Math.max(1, Math.floor(hitDmg(P.atk, boss.def) * playerDmgMult))
    if (ehp <= 0) break
    if (Math.random() < 0.3 && Math.random() < 0.85) php -= hitDmg(boss.atk, P.def)
  }
  return ehp <= 0 && php > 0
}
const BOSS = { hp: 260, atk: 34, def: 8 }

// ── 玩家画像:每关 search 次数 [seq1,seq2,seq3,seq4](🔧:下限=survive_turns 3/4/5/6·上限开放) ──
//   rush=打完就走(战斗关少搜)/ balanced=搜到清关 / hoarder=超额囤货(尤 seq4 备战窗口)
const PROFILES = {
  rush:     [3, 1, 1, 2],   // 战斗关靠打·最少搜
  balanced: [3, 4, 5, 6],   // = survive_turns 逐关搜到清
  hoarder:  [5, 6, 8, 14],  // 留关囤货·seq4 重仓
}

// ── 掉落:每次 search 至多 1 件(guaranteed front-load 优先,再 weighted roll) ──
//   guaranteed(仅解锁链):seq1 前 2 搜 = [恢复,材料];其余关无 guaranteed。
//   weighted(准备度):stat 件(seq3/4 主·seq2 低)/ 材料 / 恢复。每关 stat 权重不同(seq4 备战高)。
//   stat 权重系数 statW[seq]:seq1=0(纯搜刮无 stat)/seq2=0.3/seq3=1.0/seq4=1.6(itemBias 高)。
function runEconomy(searches, pStat, pMat, pHeal) {
  let statEquiv = 0, materials = 0, potions = 2  // 起始 2 药
  const statW = [0, 0.3, 1.0, 1.6]
  for (let seq = 0; seq < 4; seq++) {
    const s = searches[seq]
    for (let k = 0; k < s; k++) {
      // guaranteed front-load(仅 seq1 前 2 搜)
      if (seq === 0 && k === 0) { potions++; continue }        // 恢复(首道具)
      if (seq === 0 && k === 1) { materials++; continue }       // 材料(首配方材料)
      // weighted roll(互斥:一次搜至多一件)
      const r = Math.random()
      const ps = pStat * statW[seq]
      if (r < ps) statEquiv++                                   // stat 件(直接)
      else if (r < ps + pMat) materials++                      // 材料
      else if (r < ps + pMat + pHeal) potions++                // 恢复
      // else 空搜
    }
  }
  // 合成:2 材料 → 1 stat-equiv(§4:攻击件=材料·常见×2)
  statEquiv += Math.floor(materials / 2)
  return { statEquiv, potions }
}

// stat-equiv 分配到 atk/def/hp(3:2:2·prepared=7 件=+6atk/+4def/+30hp)
function toProfile({ statEquiv, potions }) {
  const atkN = Math.round(statEquiv * 3 / 7), defN = Math.round(statEquiv * 2 / 7), hpN = statEquiv - atkN - defN
  const hp = 100 + 15 * hpN
  return { atk: 10 + 2 * atkN, def: 5 + 2 * defN, hp, maxHp: hp, potions: Math.min(potions, 8) }
}

function clearRate(profileKey, pStat, pMat, pHeal) {
  let win = 0, sumStat = 0
  for (let i = 0; i < TRIALS; i++) {
    const econ = runEconomy(PROFILES[profileKey], pStat, pMat, pHeal)
    sumStat += econ.statEquiv
    if (bossFight(toProfile(econ), BOSS)) win++
  }
  return { clear: win / TRIALS, avgStat: sumStat / TRIALS }
}

const pct = (x) => `${(x * 100).toFixed(0).padStart(4)}%`
console.log(`\n=== KALEIDO D6 经济闭环 · 解 weighted 概率 (${TRIALS} trials·boss 260/34/8·severe 污染) ===\n`)
console.log('目标曲线:rush→solid−(boss <50%)/ balanced→prepared(74-86%)/ hoarder→over(~98%)')
console.log('参照(08 §2·severe):solid 25% / prepared 74% / over 98%\n')

const pMat = 0.30, pHeal = 0.20
for (const pStat of [0.20, 0.30, 0.40, 0.50, 0.60]) {
  console.log(`pStat=${pStat.toFixed(2)} (pMat=${pMat} pHeal=${pHeal}):`)
  for (const k of ['rush', 'balanced', 'hoarder']) {
    const r = clearRate(k, pStat, pMat, pHeal)
    console.log(`   ${k.padEnd(9)} clear=${pct(r.clear)}  avgStatEquiv=${r.avgStat.toFixed(1)}(prepared=7)`)
  }
  console.log('')
}
console.log('=== 完 ===\n')
