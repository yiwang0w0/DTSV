// 顶栏 Nav / <main> 边距的「沉浸态」判据（纯函数 · 零 import · 零 JSX）。
//
// 抽成独立纯模块的理由：它是**渲染期同步派生**的安全属性（零帧、不依赖 effect 顺序、不可能永不释放），
//   而「时间轴上谁先谁后」的正确性靠肉眼审必漏 —— 独立成纯模块后可以用原生 Node 跑真值表冒烟
//   （含负对照）。参见 scripts/smoke-immersive-route.mjs。
//
// ⚠ 铁律：**能在渲染期判掉的，绝不交给子组件的 effect 回传**。
//   effect 是 paint 之后跑的，靠它 = 目的地必然先提交一帧带顶栏的画面。
//   `immersiveRun` 只作**补充**（覆盖 URL 不带参数的直链场景），主判据一律走这里的路由 + 身份态。
//
// 各条依据：
//   ① 预览壳 `/play`：frontendOnly 专用沉浸路由。
//   ② 登录态出现在 `/` `/login` `/register`：这三条都是**转场跳板**，不是内容页 ——
//      登录态下它们没有任何需要顶栏的东西，且必然正在被转走。
//      · `/`：page.js 在 `loading || user` 时正文就是一块 `position:fixed inset:0` 纯黑全屏 div。
//      · `/login` `/register`：`supabase.auth` 先广播 SIGNED_IN 让 RootShell setUser，
//        `router.push('/')` 之后才提交 ⇒ 中间那段 path 还是 `/login`，正是顶栏闪现的真实现场之一。
//   ③ `immersiveRun`：对局页那一档。**注意它不只是「对局页自报」** ——
//      发起方（RootShell.navigateIntoGame / 大厅入口卡）在 `router.push` **之前**就把它置 true，
//      所以目的地的第一次提交已经是沉浸态，不存在「先露一帧顶栏再补救」。
//      目的地随后用 `isKaleido || kaleidoHint` 接管：是 kaleido 就维持，不是就落回 false（不会粘住）。
//      ⚠ 为什么不在这里按 `?kaleido=1` 判：RootShell 在**根布局**里，用 useSearchParams 会让所有
//        预渲染页 CSR bailout（实测 13 页构建报 missing-suspense-with-csr-bailout）。
//        直链硬加载 `/game/179?kaleido=1` 仍会有一次 SSR→hydration 的顶栏闪 —— 那是 SSR 固有、
//        本来就存在的，不在本次修复范围。
//
// ⚠ 跨文件隐式不变量（无机制约束，改动前必须回看这里）：
//   本模块对 `/` 判沉浸的**前提**是 `src/app/page.js` 在 `loading || user` 时早返回纯黑幕。
//   若将来放宽那个早返回（例如「登录态也想看 Hero / 首页加公告」），`/` 会变回有内容的页面，
//   而本条仍无条件判 true ⇒ 登录用户在首页彻底失去顶栏、`<main>` 还会被 100dvh/overflow:hidden 裁掉。
//   （page.js 那边已加反向注释指回本文件。）
export function isImmersiveShell({ user, frontendOnly, path, immersiveRun } = {}) {
  if (frontendOnly && path === '/play') return true
  if (immersiveRun) return true
  if (!user || frontendOnly) return false
  if (path === '/' || path === '/login' || path === '/register') return true
  return false
}
