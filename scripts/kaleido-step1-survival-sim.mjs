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

// ⚠ 保底机制两种可能(决定 N 差一倍):
//   (A) **周期保底**:每 G 搜必掉 1 瓶 —— 卡住的玩家会持续补给(需 🔧 支持"每 N 拍保底",现 event_deck.guaranteed 是**每关一次**)
//   (B) **每关一次保底**(现机制):卡在同一关无限搜 ⇒ 保底只给 1 次,之后只剩权重 p ⇒ N 显著更短
//   下表 G=0 的行即 (B) 的近似(起始那瓶另计)。
const CANDS = [
  { d: 4, G: 0,  p: 0.06 }, { d: 4, G: 0,  p: 0.08 }, { d: 4, G: 0,  p: 0.10 },   // (B) 每关一次保底后的稳态

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

// ── 阈值锚点校准(答 📖:百分比锚点 vs 余量拍数锚点)──
//   问题(📖 核出):按 60%/30%/10% HP,在推荐配置下档1 要第 ~80 搜才响、档3 在死前根本到不了
//     ⟹ 正常玩家一次听不到、卡住玩家最该示警的档是死的。
//   我的答案:锚点改 **有效剩余拍数**(把药算进余量)—— `beats = (hp + potions*HEAL) / d`。
//     它 runtime 可精确算,且能区分「40血3瓶(安全)」vs「40血0瓶(危险)」——百分比做不到。
function beatsLeft(hp, potions, d) { return (hp + potions * HEAL) / d }

function anchorCalib(d, G, p, tiers_ = [20, 10, 4], horizon = 30) {
  // 统计:normal(前 horizon 搜)与 stuck(全程至死)各档触发次数
  let normHit = [0, 0, 0], stuckHit = [0, 0, 0], runs = 2000
  for (let i = 0; i < runs; i++) {
    let hp = HP0, potions = 0, n = 0
    let seenN = [false, false, false], seenS = [false, false, false]
    while (n < CAP && hp > 0) {
      while (hp < USE_AT && potions > 0) { potions--; hp = Math.min(MAXHP, hp + HEAL) }
      hp -= d; n++
      if (hp <= 0) break
      if (G > 0 && n % G === 0) potions++
      else if (Math.random() < p) potions++
      const b = beatsLeft(hp, potions, d)
      for (let t = 0; t < 3; t++) {
        if (b <= tiers_[t]) {
          if (!seenS[t]) { seenS[t] = true; stuckHit[t]++ }
          if (n <= horizon && !seenN[t]) { seenN[t] = true; normHit[t]++ }
        }
      }
    }
  }
  return { normal: normHit.map((x) => x / runs), stuck: stuckHit.map((x) => x / runs) }
}

console.log('\n【阈值锚点校准】锚点 = 有效剩余拍数 (hp + 药×30)/d ;档 ≤20 / ≤10 / ≤4 拍')
console.log('  (数值 = 该档在一次 run 中被触发的概率;normal=前 30 搜内 · stuck=一直搜到死)')
//   目标形状:normal(前 30 搜)档1 常响 / 档2 偶响 / 档3 罕见 ;stuck 不早死(N ≥ 4×M,M=21)
for (const c of [
  { d: 3, G: 12, p: 0.00 }, { d: 3, G: 16, p: 0.04 }, { d: 3, G: 18, p: 0.05 },
  { d: 3, G: 20, p: 0.06 }, { d: 4, G: 16, p: 0.06 }, { d: 4, G: 20, p: 0.08 },
]) {
  const a = anchorCalib(c.d, c.G, c.p)
  const t = tiers(c.d, c.G, c.p)
  console.log(`  d=${c.d} G=${String(c.G).padStart(2)} p=${c.p.toFixed(2)}:  normal[档1/2/3] = ${a.normal.map((x) => pct(x).padStart(4)).join(' /')}   stuck = ${a.stuck.map((x) => pct(x).padStart(4)).join(' /')}   N(最坏/中位)=${t.worst}/${t.median}`)
}

// ── 诱饵预算对照:N7 §2.4 复现诱饵每 M 拍一条(初 8)——问「n 次曝光」要多少拍 ──
console.log(`\n【诱饵预算对照】N7 §2.4:复现诱饵每 8 拍 1 条(关数递减 8→5→3,但 step1 只 1-2 关 ⟹ 实际恒 8)`)
for (const exposures of [2, 3, 4, 5]) {
  console.log(`   要 ${exposures} 次曝光 ⟹ M ≈ ${exposures * 8} 拍(还要 + 首现到第 1 条诱饵的 8 拍)`)
}
console.log('')
