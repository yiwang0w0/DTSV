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
