// ─────────────────────────────────────────────────────────────────
// Diegetic UI 教义 · 硬不变式门（doctrine 11 §3.3 三条 + I9）
// ─────────────────────────────────────────────────────────────────
// 🧭：「没有 gate，我 §3.3 那三条硬约束没有任何东西在守。」——本文件即那个守卫。
//
// ⚠ 诚实声明：三条里**现在只有第 1 条能真正执行**。第 2/3 条依赖注册表里还不存在的**关系字段**
//   （「被哪个 key 的呈现状态门控」/「上游依赖键」）——那些字段属 P1 字段落点草案（待 🧭 审）。
//   本文件对未落地的部分**明确报告「待字段」**，不假装在守。字段一落地，把 TODO 段打开即生效。
//
// 设计取向：`gate`/`missCost` 字段本身也还没进注册表 ⇒ 本检查**在字段缺席时 PASS 并说明**，
//   不阻塞任何人；字段一出现就自动开始强制。这样不变式先于实现存在，而不是事后补。
//
// 跑：node scripts/check-doctrine-invariants.mjs（经 npm run gate）
// ─────────────────────────────────────────────────────────────────
import { KALEIDO_UI_UNLOCKS } from '../src/lib/server/kaleido/uiUnlocks.js'

// I9（🧭 已立为硬不变式）：操作面 = UI 是该功能**唯一输入路径**的键。
//   剥夺读数 = 教义本意（观测要争取）；剥夺操作面 = 剥夺 agency，与法则一「功能常在」自相矛盾。
//   实证依据：KaleidoAvgView 的战斗按钮是全仓唯一战斗输入出口 ⇒ boss 关剥夺 combat_panel = 软锁。
export const OPERATION_FACE_KEYS = ['search_btn', 'combat_panel', 'move_btn', 'craft_btn']

const fail = []
const pending = []

const withGate = KALEIDO_UI_UNLOCKS.filter((e) => e.gate !== undefined || e.missCost !== undefined)

if (withGate.length === 0) {
  pending.push('注册表尚无 gate/missCost 字段（等 P1 字段落点草案获批后落地）⇒ §3.3 三条暂不可执行')
} else {
  // 约束 1（可执行）：missCost:'fatal' 一律不得为 gate:'click'
  for (const e of KALEIDO_UI_UNLOCKS) {
    if (e.missCost === 'fatal' && e.gate === 'click') {
      fail.push(`§3.3-1 违反：${e.ui_key} 是 missCost:'fatal' 却走 gate:'click'（诱饵还没升到明示，人已经死了）`)
    }
    if (e.gate !== undefined && !['auto', 'click'].includes(e.gate)) {
      fail.push(`gate 取值非法：${e.ui_key} = ${JSON.stringify(e.gate)}（只允许 'auto'|'click'）`)
    }
    if (e.missCost !== undefined && !['none', 'harder', 'fatal'].includes(e.missCost)) {
      fail.push(`missCost 取值非法：${e.ui_key} = ${JSON.stringify(e.missCost)}（只允许 'none'|'harder'|'fatal'）`)
    }
  }
  // 约束 2/3：需要关系字段（hostGatedBy / requires），尚未建模
  const hasRel = KALEIDO_UI_UNLOCKS.some((e) => e.hostGatedBy !== undefined || Array.isArray(e.requires))
  if (!hasRel) {
    pending.push('§3.3-2（宿主不得 click）与 §3.3-3（click 上游不得 click）需要注册表的关系字段 hostGatedBy/requires，尚未建模')
  } else {
    const byKey = Object.fromEntries(KALEIDO_UI_UNLOCKS.map((e) => [e.ui_key, e]))
    for (const e of KALEIDO_UI_UNLOCKS) {
      if (e.hostGatedBy && e.gate === 'click') {
        fail.push(`§3.3-2 违反：${e.ui_key} 的可交互词被 ${e.hostGatedBy} 的呈现状态门控，宿主不得为 click（点击层自锁）`)
      }
      for (const dep of (e.requires || [])) {
        if (e.gate === 'click' && byKey[dep]?.gate === 'click') {
          fail.push(`§3.3-3 违反：${e.ui_key}(click) 的上游依赖 ${dep} 也是 click（一次漏点滚成多件永久缺失）`)
        }
      }
    }
  }
}

// I9（可执行）：剥夺表若已落地，操作面键不得进剥夺表
let hides = null
try { ({ KALEIDO_UI_HIDES: hides } = await import('../src/lib/server/kaleido/uiHide.js')) } catch { /* P1 前不存在，正常 */ }
if (!hides) {
  pending.push('剥夺表 uiHide.js 尚未落地（P1）⇒ I9「操作面不得被剥夺」暂不可执行')
} else {
  for (const h of hides) {
    if (OPERATION_FACE_KEYS.includes(h.ui_key)) {
      fail.push(`I9 违反：${h.ui_key} 是操作面（UI 即唯一输入路径），不得进剥夺表 —— boss 关剥夺它 = 玩家无法操作 = 软锁`)
    }
  }
}

if (fail.length) {
  console.error('❌ 教义硬不变式 FAILED')
  for (const f of fail) console.error('  · ' + f)
  process.exit(1)
}
console.log(`✅ 教义硬不变式通过（注册表 ${KALEIDO_UI_UNLOCKS.length} 条）`)
for (const p of pending) console.log('   ⏳ 待字段：' + p)
