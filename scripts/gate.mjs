// ─────────────────────────────────────────────────────────────────
// npm run gate —— 无凭据、可离线跑的全部静态门（跨栈一致性 + 全量 smoke）
// ─────────────────────────────────────────────────────────────────
// 由来（2026-07-22 · 🧭 批准并提优先级）：本仓**没有 CI**（无 .github/workflows），
//   `npm run smoke` 只跑 smoke-check.mjs（只 import roomState.js，完全不碰 kaleido），
//   而 scripts/ 下 6 个 smoke-* 与新增的一致性检查**没有任何 runner 引用** ——
//   ⇒ 所有「门」实际上都是「靠人记得跑」。在跨轨行为变更批之前这是不可接受的。
//
// 本文件把它们串成一条命令。**不含**需要凭据的 E2E：
//   scripts/kaleido-e2e.mjs 要 service-role key + 真库，跑法见该文件头：
//     npx tsx --tsconfig scripts/tsconfig.e2e.json scripts/kaleido-e2e.mjs
//   改 kaleido 状态机后**它仍然必跑**，gate 不替代它。
// ─────────────────────────────────────────────────────────────────
import { spawnSync } from 'node:child_process'

const STEPS = [
  ['跨栈一致性 · ui_key 注册表 ⟷ 客户端表', 'scripts/check-ui-key-parity.mjs'],
  ['教义硬不变式 · §3.3 三条 + I9 操作面不得剥夺', 'scripts/check-doctrine-invariants.mjs'],
  ['smoke · roomState/gamevars 基线', 'scripts/smoke-check.mjs'],
  ['smoke · evalFormula 对抗', 'scripts/smoke-evalformula-adversarial.mjs'],
  ['smoke · itemCraft', 'scripts/smoke-itemcraft.mjs'],
  ['smoke · kaleido 战斗模板', 'scripts/smoke-kaleido-combat.mjs'],
  ['smoke · kaleido 传感层事件', 'scripts/smoke-kaleido-events.mjs'],
  ['smoke · kaleido 采样器/run', 'scripts/smoke-kaleido-runs.mjs'],
  ['smoke · pipeline', 'scripts/smoke-pipeline.mjs'],
]

const failed = []
for (const [label, script] of STEPS) {
  const r = spawnSync(process.execPath, [script], { stdio: 'inherit' })
  if (r.status !== 0) failed.push(`${label} (${script})`)
}

console.log('\n' + '─'.repeat(60))
if (failed.length) {
  console.error(`❌ gate FAILED —— ${failed.length}/${STEPS.length} 步未通过：`)
  for (const f of failed) console.error('  · ' + f)
  console.error('\n（改 kaleido 状态机还需另跑 E2E：npx tsx --tsconfig scripts/tsconfig.e2e.json scripts/kaleido-e2e.mjs）')
  process.exit(1)
}
console.log(`✅ gate 通过 —— ${STEPS.length}/${STEPS.length} 步全绿`)
console.log('（改 kaleido 状态机还需另跑 E2E：npx tsx --tsconfig scripts/tsconfig.e2e.json scripts/kaleido-e2e.mjs）')
console.log(`
📋 写断言时的自查清单（本仓踩过的固定模式）：
  1. **单发假设 + 掷骰 = flaky gate**。「发一次 attackNpc 就断言敌人已死」在 0.85 命中率下约 15% 的 run 翻红
     （§④ 实测踩过；§③ 同类）。凡断言依赖随机结果，一律改**有界循环**并把兜底概率算给自己看。
  2. **写完断言先做负对照**：把被测的修复回退，确认断言**真的翻红**。本仓已有两次「负对照救命」——
     ui_key 对拍（摘一个键 → 指名报错）与 H3（第一版断言在回退后仍全绿 ⇒ 那版根本没在测 H3）。
  3. **绿 ≠ 覆盖**：E2E 用纯内存 uid，profiles 行不存在 ⇒ 账号级持久化历来是**静默空转**，
     当年「Commit B 已 E2E 验证」只覆盖了房内镜像那一半。断言前先确认那条路**真的会被执行**。`)
