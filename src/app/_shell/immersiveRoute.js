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
// ── 已知边界：直链硬加载 `/game/X?kaleido=1` 仍会闪一次顶栏（**刻意不治** · 🧭 会签）────────
//   现象：硬加载走 SSR，服务端渲染 RootShell 时 `immersiveRun` 必为 false ⇒ HTML 里就带着顶栏，
//     要等 hydration 后才收起。两条主入口（登录直进的解码转场、大厅入口卡）都是**客户端跳转**，
//     由「发起方在 router.push 之前置位」覆盖到零帧，所以这一闪只出现在直链/刷新。
//
//   为什么不治 —— 两条路都比收益贵：
//   (a) RootShell 里用 `useSearchParams` 渲染期派生：**构建直接拒绝**。RootShell 在根布局，
//       该 hook 会让所有预渲染页 CSR bailout（实测 13 页报 missing-suspense-with-csr-bailout）。
//   (b) 段级 CSS（🧭 提的路子）：把 `/game/[id]/page.js` 从现在的一行裸 re-export
//       （`export { default } from './GameClientPage'`）改成读 `searchParams` 的 server 组件，
//       条件吐一段 `<style>` 藏顶栏。CSS 首帧即生效、不需要 JS/hydration、不动根布局 —— 这些都成立。
//       但真实代价有三条，合起来不划算：
//         · 要复制的**不止**「藏顶栏」：`<main>` 的 padding/maxWidth 也得一起改，否则 SSR 那帧是
//           「没顶栏 + 1200px 带边距 main」，比现在闪一下更难看（内容会跳两次）。
//         · **判据分叉**：CSS 只能看 URL 参数，React 看的是**房间真实类型**。手工拼参进多人房时
//           React 侧会自愈（kaleidoHint→false ⇒ 顶栏回来），而 server 吐的那段 style 不会消失
//           ⇒ 多人局顶栏被永久藏掉 —— 直接压到「多人渲染路径零行为变化」这条红线上。
//           要补就得让自愈额外 `router.replace` 抹参数，又多一次导航。
//         · 顶栏显隐从此有两个来源（React 状态 + 段级 CSS），后人改顶栏很可能只改一处。
//
//   ⟹ 什么情况下该重新评估：**硬加载变成主路径**时。最可能的触发点是 PWA（本轨 backlog）——
//      若 manifest 的 start_url 指向对局路由，或对局链接开始被分享/收藏，这一闪就从边缘变主路径，
//      届时按 (b) 做，并**同时**解决上面三条代价（尤其自愈抹参数那条，否则会破多人红线）。
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
