// ─────────────────────────────────────────────────────────────────
// 跨栈一致性门：服务端 ui_key 注册表 ⟷ 客户端 UI_KEYS / REVEAL_ORDER
// ─────────────────────────────────────────────────────────────────
// 由来（BUG-2·2026-07-22）：客户端 `REVEAL_ORDER` 曾只有 11 键，而服务端注册表已 13 条；
//   `commitUnlocks` 拿 REVEAL_ORDER 当**白名单过滤**（useKaleidoUiUnlocks.js）⇒ B4 三个新键
//   `loadout_panel`/`prep_readout`/`convergence_preview` 被**静默丢弃**：不进集、不播动效、不落 nar、
//   **不报错**，服务端 E2E 也测不出（服务端一切正常，事件也发了）。只有人眼能发现。
//   ⇒ 这类「两张表靠人手动对齐」的漂移必须变成门，否则每次加 ui_key 都会再踩一次。
//
// 判据 = **双向精确匹配**（≡ 而非 ⊇）：既抓「客户端漏了新键」，也抓「客户端留了服务端已删的键」。
// 两侧都是纯数据模块（服务端注册表刻意无 @/ 别名、客户端表亦无 React 依赖）⇒ 原生 Node 直接 import 对拍。
//
// 跑：node scripts/check-ui-key-parity.mjs   （或经 npm run gate）
// ─────────────────────────────────────────────────────────────────
import { KALEIDO_UI_UNLOCKS, UI_SEED } from '../src/lib/server/kaleido/uiUnlocks.js'
import { UI_KEYS, REVEAL_ORDER } from '../src/app/game/[id]/kaleido/kaleidoUiUnlocks.js'

const fail = []

// 服务端权威集 = 注册表触发键 ∪ 种子键（种子不经触发，但客户端必须能渲染它）
const serverKeys = new Set([...UI_SEED, ...KALEIDO_UI_UNLOCKS.map((e) => e.ui_key)])
const clientKeys = new Set(Object.values(UI_KEYS))
const revealKeys = new Set(REVEAL_ORDER)

const missIn = (a, b) => [...a].filter((k) => !b.has(k)).sort()

const m1 = missIn(serverKeys, clientKeys)
if (m1.length) fail.push(`客户端 UI_KEYS 缺服务端注册表的键（这些 UI 永远不会渲染）: ${m1.join(', ')}`)

const m2 = missIn(clientKeys, serverKeys)
if (m2.length) fail.push(`客户端 UI_KEYS 有服务端注册表没有的键（死键，永远不会被解锁）: ${m2.join(', ')}`)

// REVEAL_ORDER 是 commitUnlocks 的过滤器 —— 它漏一个键，那个键就被静默吞掉
const m3 = missIn(serverKeys, revealKeys)
if (m3.length) fail.push(`REVEAL_ORDER 缺键（会被 commitUnlocks 静默过滤掉，正是 BUG-2 的形态）: ${m3.join(', ')}`)

const m4 = missIn(revealKeys, serverKeys)
if (m4.length) fail.push(`REVEAL_ORDER 有服务端没有的键: ${m4.join(', ')}`)

// nar_line 空串登记（不判红：📖 去宣告化批期间允许占位，但要可见）
const emptyNar = KALEIDO_UI_UNLOCKS.filter((e) => !e.nar_line).map((e) => e.ui_key)

if (fail.length) {
  console.error('❌ ui_key 跨栈一致性 FAILED')
  for (const f of fail) console.error('  · ' + f)
  console.error(`  服务端 ${serverKeys.size} 键 / 客户端 UI_KEYS ${clientKeys.size} / REVEAL_ORDER ${revealKeys.size}`)
  process.exit(1)
}

console.log(`✅ ui_key 跨栈一致 —— 服务端 ${serverKeys.size} 键 ≡ 客户端 UI_KEYS ≡ REVEAL_ORDER`)
if (emptyNar.length) console.log(`   ℹ nar_line 空占位 ${emptyNar.length} 条（待 📖 供稿）: ${emptyNar.join(', ')}`)
