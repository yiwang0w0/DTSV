// ─────────────────────────────────────────────────────────────────
// KALEIDO step1 求生曲线 harness(⚙️ · 新结构 · 09 §6 经济 harness 的镜像)
// ─────────────────────────────────────────────────────────────────
// 镜像关系(🧭 采纳的方法论):旧 = 搜索→掉落→战力累积(往上加);新 = 搜索→掉血→找药续命(往下扣+补)。
//   同一骨架,`statEquiv` 换成 **HP 收支**。
// 目标:解 **N = 生存拍数预算**(满血到死能搜多少次·分档 最坏/中位/好运),供诱饵拍数 M 的上限。
//   设计意图(Kanata):step0→1 **不打算让玩家死**,但要真实紧迫感 ⟹
//   形状 = **掉血确定 · 药的保底确定 · 只有余量薄厚不确定**。
// 模型:
//   · 每次 search:hp -= d;按 保底间隔 G 必掉药 + 权重 p 概率掉药(药进舱=inventory·auto 解锁,恒可用)
//   · 用药:hp < 用药阈时喝一瓶(hp += heal·封顶 maxHp)。**用药是 item_use,不是 search ⟹ 不掉血**
//   · 死亡:hp <= 0 ⟹ N = 已搜次数
// 跑法:node scripts/kaleido-step1-survival-sim.mjs
// 非引擎代码:纯离线统计(Math.random),零 DB。
// ─────────────────────────────────────────────────────────────────

const TRIALS = 20000
const HP0 = 100, MAXHP = 100
const HEAL = 30           // 修补剂(已入库)
const USE_AT = 35         // 用药阈:低于此且有药就喝(≈ 不浪费 30 点治疗)
const CAP = 400           // 模拟上限(防不死循环)

// 一次 run:返回 { n(生存搜索次数), minHp(全程最低血·薄不薄), usedPotions }
function simRun(d, G, p) {
  let hp = HP0, potions = 0, n = 0, minHp = HP0, used = 0
  while (n < CAP) {
    // 喝药(不消耗 search·不掉血)
    while (hp < USE_AT && potions > 0) { potions--; hp = Math.min(MAXHP, hp + HEAL); used++ }
    // 搜一次:掉血
    hp -= d
    n++
    if (hp < minHp) minHp = hp
    if (hp <= 0) return { n, minHp, used }        // 死在这一搜
    // 掉药:保底(每 G 次必掉)+ 权重
    if (G > 0 && n % G === 0) potions++
    else if (Math.random() < p) potions++
  }
  return { n: CAP, minHp, used }                   // 到上限仍活 = 实质不死
}

function tiers(d, G, p) {
  const ns = [], mins = []
  for (let i = 0; i < TRIALS; i++) { const r = simRun(d, G, p); ns.push(r.n); mins.push(r.minHp) }
  ns.sort((a, b) => a - b); mins.sort((a, b) => a - b)
  const q = (arr, f) => arr[Math.min(arr.length - 1, Math.floor(arr.length * f))]
  return {
    worst: q(ns, 0.01),      // 最坏运气(P1)
    median: q(ns, 0.50),
    good: q(ns, 0.99),       // 好运气(P99)
    survRate: ns.filter((x) => x >= CAP).length / ns.length,   // 到上限仍活的比例
    medMinHp: q(mins, 0.50), // 中位最低血 = "薄不薄"
  }
}

const pct = (x) => `${(x * 100).toFixed(0)}%`
console.log(`\n=== KALEIDO step1 求生曲线 · 解 N(${TRIALS} trials·hp100·修补剂 heal30·用药阈 ${USE_AT})===\n`)
console.log('形状目标:正常推进不死(survRate 高)· 但始终薄(中位最低血低)· N 要跑赢诱饵 M\n')
console.log('d=每搜掉血 · G=保底掉药间隔(0=无保底) · p=权重掉药率');
console.log('                          N(最坏P1) N(中位) N(好运P99)  不死率  中位最低血');

const CANDS = [
  { d: 2, G: 0,  p: 0.00 }, { d: 3, G: 0,  p: 0.00 }, { d: 4, G: 0,  p: 0.00 },   // 无药基线(纯掉血)
  { d: 3, G: 12, p: 0.00 }, { d: 3, G: 12, p: 0.06 },
  { d: 3, G: 10, p: 0.06 }, { d: 3, G: 8,  p: 0.06 },
  { d: 4, G: 10, p: 0.08 }, { d: 4, G: 8,  p: 0.08 },
  { d: 5, G: 8,  p: 0.10 },
]
for (const c of CANDS) {
  const t = tiers(c.d, c.G, c.p)
  const tag = `d=${c.d} G=${c.G || '-'} p=${c.p.toFixed(2)}`
  console.log(`  ${tag.padEnd(22)} ${String(t.worst).padStart(7)} ${String(t.median).padStart(8)} ${String(t.good).padStart(9)}   ${pct(t.survRate).padStart(5)}  ${String(t.medMinHp).padStart(6)}`)
}

// ── 诱饵预算对照:N7 §2.4 复现诱饵每 M 拍一条(初 8)——问「n 次曝光」要多少拍 ──
console.log(`\n【诱饵预算对照】N7 §2.4:复现诱饵每 8 拍 1 条(关数递减 8→5→3,但 step1 只 1-2 关 ⟹ 实际恒 8)`)
for (const exposures of [2, 3, 4, 5]) {
  console.log(`   要 ${exposures} 次曝光 ⟹ M ≈ ${exposures * 8} 拍(还要 + 首现到第 1 条诱饵的 8 拍)`)
}
console.log('')
