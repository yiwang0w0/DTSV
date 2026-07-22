// 沉浸态判据真值表冒烟（原生 Node 跑，无需浏览器 / 登录态 / DB）。
//   跑：node scripts/smoke-immersive-route.mjs
//
// 它能证明什么：`isImmersiveShell` 这个**纯函数**在各 (身份 × 路由 × 自报位) 组合下的取值，
//   以及新旧判据的差异面。附**负对照** —— 旧判据在几格上判错，证明本冒烟确实抓得到那些 bug。
// 它**不能**证明什么（别再写成「把全部组合钉死」）：
//   纯函数无从表达「immersiveRun 什么时候变成 true」。「落地第一帧有没有顶栏」属于时序问题，
//   在这里传什么都是预设结论 —— 那条靠的是「发起方在 router.push 之前置位」这个结构性保证
//   （见 immersiveRoute.js ③ 与 RootShell.navigateIntoGame / rooms 入口卡），不靠本脚本。
import { isImmersiveShell } from '../src/app/_shell/immersiveRoute.js'

// 负对照：BUG-A 修复前的判据（immersivePreview || immersiveRun）
const oldRule = ({ frontendOnly, path, immersiveRun }) => Boolean((frontendOnly && path === '/play') || immersiveRun)

const U = { id: 'u1' }
const CASES = [
  // ── 未登录：一律不沉浸（顶栏本来也不渲染，但判据不该乱判）──
  ['未登录首页（Hero 全屏）',            { user: null, frontendOnly: false, path: '/' }, false],
  ['未登录 /login',                     { user: null, frontendOnly: false, path: '/login' }, false],

  // ── 登录态转场跳板三兄弟：BUG-A 的两处真实现场 ──
  ['登录态首页（转场跳板）',              { user: U, frontendOnly: false, path: '/' }, true],
  ['登录态 /login（SIGNED_IN 已到·push 未提交）', { user: U, frontendOnly: false, path: '/login' }, true],
  ['登录态 /register（同上）',            { user: U, frontendOnly: false, path: '/register' }, true],

  // ── 登录态常规内容页：必须保留顶栏 ──
  ['登录态 admin',                      { user: U, frontendOnly: false, path: '/admin' }, false],
  ['登录态账户库',                       { user: U, frontendOnly: false, path: '/stash' }, false],
  ['登录态对局记录',                     { user: U, frontendOnly: false, path: '/rooms' }, false],
  ['登录态个人主页',                     { user: U, frontendOnly: false, path: '/profile' }, false],

  // ── 对局页：kaleido 沉浸 / 多人保留顶栏（红线）──
  ['kaleido 对局页（发起方已置位 / 页面已自报）', { user: U, frontendOnly: false, path: '/game/179', immersiveRun: true }, true],
  ['多人对局页（未置位）',                 { user: U, frontendOnly: false, path: '/game/25' }, false],
  ['BR 对局页（未置位）',                 { user: U, frontendOnly: false, path: '/br/m1' }, false],

  // ── frontendOnly 预览模式 ──
  ['预览壳 /play',                      { user: U, frontendOnly: true, path: '/play' }, true],
  ['预览模式首页（顶栏本就不渲染·不该判沉浸）', { user: U, frontendOnly: true, path: '/' }, false],
  ['预览模式对局页（不该沉浸）',            { user: U, frontendOnly: true, path: '/game/1' }, false],
]

let fail = 0
const diffs = []
console.log('用例'.padEnd(42), '期望', ' 实得', ' 旧判据')
for (const [name, input, want] of CASES) {
  const got = isImmersiveShell(input)
  const old = oldRule(input)
  const ok = got === want
  if (!ok) fail++
  if (old !== want) diffs.push(name)
  console.log(
    (ok ? '  ' : '✗ ') + name.padEnd(40),
    String(want).padEnd(5),
    String(got).padEnd(5),
    String(old) + (old !== want ? '  ← 旧判据判错' : ''),
  )
}

console.log()
console.log('新判据:', fail === 0 ? `PASS（${CASES.length}/${CASES.length}）` : `FAIL（${fail} 格不符）`)
console.log('负对照:', diffs.length > 0
  ? `PASS —— 旧判据在 ${diffs.length} 格判错：${diffs.join(' / ')}`
  : 'FAIL —— 新旧判据无差异，本冒烟抓不到 BUG-A，无意义')
process.exit(fail === 0 && diffs.length > 0 ? 0 : 1)
