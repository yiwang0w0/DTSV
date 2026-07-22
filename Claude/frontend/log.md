# 🎨 前端轨 · 变更日志(倒序置顶)

## 2026-07-23 · 🎨 停工收口 —— P0 前置批 / BUG-A·B / 只在上下文里的判断落盘

> 停工前按 🧭 要求做的收口。工作树干净，本轮四个 commit 全已推 main：
> `2a36851`(P0 前置批) · `2999a46`+`02ab154`(线上三 bug 首修) · `969f633f`(BUG-A/B 修正版) · `b0ff12cf`(SSR 边界记档)。
> 交接见 `Claude/HANDOFF.md`：🎨 = **待命，等 P1-c（必须与 🔧 同 PR 合）**。

### 已写进代码注释的（恢复时读源码即可，不必回翻对话）
- `src/app/_shell/immersiveRoute.js` —— 沉浸判据三条的依据；**`useSearchParams` 不能进根布局**（实测 13 个预渲染页 CSR bailout）；「渲染期能判掉的绝不交给子组件 effect 回传」铁律；SSR 直链顶栏闪的**两条治法 + 代价 + 什么情况该翻案（PWA）**；与 `page.js` 早返回的跨文件隐式不变量（两端都加了反向锚）。
- `GameClientPage.jsx` —— **Next 14 的 URL 在 commit 阶段才更新**，故渲染期读 `window.location.search` 恒得旧值（实测复现）；BUG-B 的完整根因链（supabase auth-js 的 `visibilitychange` → 整树卸载重挂）；`&& !(room && isKaleido)` 为何必须收窄到 kaleido（多人会出**状态回滚**）；为何不去 RootShell 钉死 user 引用（那是多人唯一的 focus-recovery）。
- `RootShell.jsx` —— 看门狗为何不是可选项（`.catch` 接 reject **接不住挂起**）。
- `useKaleidoUiUnlocks.js` —— `deriveStubUnlocks`（要停）与 `readServerUnlocks`（**不能停**，是 D1 权威来源）的区别；`deriveStub` 仅 dev 谐调器可开。
- `kaleidoUiUnlocks.js` —— `REVEAL_ORDER` 同时是**白名单**，不在表里的键会被静默丢弃。
- `kaleidoAvgCopy.js` —— hp_bar 本地覆盖是**临时特例**及其撤销条件；`AVG_PREVIEW_NAR_OVERRIDES` 待 📖 重写后清空。

### 只在上下文里、这次补落盘的六条
1. **本地 `.env.local` 是占位 Supabase ⇒ 登不进真实账号态。** 这是我每份报告都带「哪半截验不了」的根因。可用 `NEXT_PUBLIC_APP_MODE=frontend npx next dev -p 3100` 进预览登录态（`localStorage` 播种 `dtsv.frontend-preview.session`），但**它只覆盖 frontendOnly 分支** —— 凡判据里带 `!frontendOnly` 的（如登录态 `/` 判沉浸）一律测不到，只能线上验。
2. **`&& !(room && isKaleido)` 有个附带效应**：kaleido 树现在比改前**早一次提交**挂载（`hydrateRoom` 先 `setRoom`，再 await 两个网络请求才 `setLoading(false)`），那一拍装备/NPC 数据还没到。AVG 只显示百分比、`me` 来自已就位的 `gamevars`，所以目前无害；**将来若 AVG 要显示装备派生值（ATK/DEF 绝对值），这里会先渲染一拍不完整数据**。
3. **`package-lock.json` 会被 `next dev`/`build` 自动 patch**（"Found lockfile missing swc dependencies"）。构建栈是 🧭 的域 ⇒ **每次提交前 `git checkout -- package-lock.json`**，否则会带进无关 diff。
4. **ESLint `@next/next` plugin conflict 是本地 worktree 嵌套产生的假报**（父目录也有 `.eslintrc.json`）。**`next build` 的 exit code 才是权威门**，看到这条别去追。
5. **`next build` 与 `next dev` 不能同时跑**，会写坏 `.next`（症状：`Cannot find module './xxxx.js'` 的 500）。流程固定为：先按端口找 PID `taskkill` 掉 3100 → `rm -rf .next` → build。**永远只杀自己那个 PID，不要 `taskkill /IM node.exe`**（3000 是 Kanata 的 dev）。
6. **P1-c 的 `statusActionReady` 我已摸清范围**（免得恢复时重查）：它现在是**全局编舞门** —— 只要 hp_bar 未解锁，舞台上**每个**带 `interaction` 的行都渲染成不可点的 `span`（含开场那句「翻找」）。要解耦成**逐行门**：判据从「全局 statusActionReady」改为「该行自己的 uiKey 是否已解锁 + 该行自己的动作是否可用」，`UI_ACTIONS` 已是 per-key 结构（`{uiKey,before,word,after,hint}`），容器不用动，只换门的取值来源。

### 方法论（这轮验证下来确实管用的两条）
- **验证脚本要声明自己的边界。** `scripts/smoke-immersive-route.mjs` 头部明写了它*不能*证明什么（纯函数表达不了 effect 时序）—— 防的是后人误读「15/15 全绿」为「时序也钉死了」。同理删掉了一格入参与上一格逐字节相同的自证循环用例。
- **通用检查直接提交进 `scripts/`，别只在本地跑**（🧭 嘱记）。我那个 ui_key 键对拍只在 scratchpad 跑完就报结论 ⇒ 🔧 白核实一轮后自己重写（`scripts/check-ui-key-parity.mjs`，已进 gate，做法照我的）。方法被采纳了，但绕了一圈。
- **「我的改动造出的新死角」直接补上，不用等派单**（🧭 授权）—— 本轮的 8s 看门狗即此例：留着比改了更糟，而中控不一定看得见。

## 2026-07-22 · 🎨 AVG 复刻 P1:真数据接线 + 登录直进 KALEIDO + 180ms 触发源重做

> 方向沿革（🧭 两次更正）：自建 AVG 壳作废 → 改以 GPT 分支实现为**样板复刻**（主线仍是我方六轨 · Vercel/Next，**不引入 vinext/Vite**）。关键发现：GPT **没有推倒我的原型，是在它上面扩写** —— 冷开场/revealPiece/commitSearch/战斗覆盖/规则闸门/lineStyle/DevBtn 逐字节存活；且其呈现层**零构建栈绑定**（只用 next/dynamic·next/navigation·react hooks·我方模块·纯 CSS）—— 我用仓库里还在的 Next 14.2.21 + React 18.3.1 直接 build 通过即为证，这条证据被 🧭 用来把主线构建栈拉回 Next（`e917266`）。

- **P1 真数据接线**：`KaleidoAvgView` 加一套**全可选** props（`unlocks`/`logs`/`me`/`encounter`/`combatMode`/`envRules`/`formulaOverrides`/`onSearch`/`onAttack`/`onRelease`/`busy`/`canAct`），`const live = Boolean(unlocks)` 分流 —— 缺省即回落内部预览 sim，`/play`（frontend-only）随时可验手感不受影响。真 logs/narLog 追加进舞台、`justUnlocked` 走因果两拍、`combatView` 归一（真 `encounterInstance` 是 `{hp,maxHp,npc:{name,atk,def}}`，sim 是扁平结构）。冷开场收尾一次性同步「进局时已解锁集」并把游标推到历史末尾（首 run 只有 search_btn；veteran 满 UI 也在这一拍落定 = B1 一次性惊艳开场）。
- **登录直进 KALEIDO**（`d195633` · Kanata 线上实测提的：登录后首页仍要手点「立即进入」，且点进去是**多人房**不是 KALEIDO run）：
  - `src/app/page.js`：登录态进首页即触发 `beginGameEntry`；loading/登录态渲染纯底色幕不闪 Hero。
  - `RootShell`：`beginGameEntry` 一开始就**并行**发起 `/api/kaleido/run` 预热（幂等自愈：active 续接 / ended 开新），转场 navigate 那拍消费 → `router.replace('/game/<roomId>?kaleido=1')`。
  - `GameClientPage` kaleido 早返回改渲染 `KaleidoAvgView`，并把 `KaleidoLevelClearBanner`/`KaleidoConvergenceScreen` 两个 fixed overlay **一并挂上**（本排在 P5，但直接切 AVG 会丢终局呈现 ⇒ 提前并入）。
  - ⚠ 两条纪律写进代码注释：①**绝不挂 `onAuthStateChange` 做跳转**（token 刷新/切 tab 都会 fire，会把人从 admin/账户库/多人页强拽进 run·砸全站）—— 只在首页这一次性入口触发；②**逃生路径**：顶栏保留、run 创建失败一律兜到 `/rooms`。
  - 多人零回归：改动全落在 `if (isKaleido)` 早返回块内（diff hunk 全在 1106-1183），下方 3 栏壳 return 一字未动。
- **180ms 停顿触发源重做**（`cd6153f` · 🧭 裁决）：主判据 = **含 hp_bar 那一批的最后一条 nar** 打 `settlesFirstSearch` → 复用 sim 路径**同一个** handler（不引入第二套语义）；跨批交错 = 真数据行入**播放队列**（计数·animationend 出队），「锚点已结束 **且** 队列排空」才放行；原去抖降级为**纯兜底**（700→1800ms 并注明不作主判据）。顺手加 `currentTarget===target` 守卫，挡行内 `kaleido-inline-action-arm` 子元素冒泡误触发。
- **新技巧 · 冻结环境下怎么验动画驱动的编舞**：浏览器面板 tab 恒 `visibilityState:hidden` ⇒ CSS 动画被**冻结**（行的 `playState` 卡在 running 30s+·`animationend` 一次都不派发）、`setTimeout` 也被节流（2000ms 实测 2928ms）。⟹ 时序测量在此环境**天然失真**（首测「最后一行→docked=2439ms」量到的其实是兜底在兜）。解法：**按 delay 值拦掉兜底**（`window.setTimeout` 包一层丢弃 `ms===1800`/`2600`）**+ 合成 `AnimationEvent('animationend',{bubbles:true})` 精确驱动** —— live：①只放锚点→false ②再等 1200ms 仍 false（队列门生效）③排空→④true；sim：全部新行 animationend→true（`playing` 恒 0·与改造前一致）。反向证据：不拦兜底且无任何 animationend 时流程仍在 ~2.4s 被救回、**不死锁**。
- **遗留 / 待接**：① P2 = 文案（`AWAKEN_LINES`/`OPENING_NAR`/`NAR`/`STATUS_PROMPT`/`SEARCH_LOGS`）挪数据层 + `action:{word,uiKey}`；② P3 = 补齐后段 ui_key（**背包按 🧭 裁决 A 跳过**·守 GPT 契约开局不显示；12 项按 🔧 B4 已扩到 15 项对齐）；③ P4 窄屏/移动化 `is-docked`；④ P5 剩余挂载；⑤ P6 `/play` 与 `/game/[id]` 收敛路径（先别动）。
- **两个悬而未决（已送 🧭）**：① `docs/plan/kaleido/11-diegetic-ui-doctrine.md` §2 推论禁「——已开放：XXX」宣告式，我本地 stub 文案表全是该格式；§5 又派给 🎨「隐蔽度可配·提示等级数据化」⇒ P2 的 `action` 是否一次到位扩成 `{word,uiKey,hint}`。② hp_bar 文案冲突：📖 N3 定稿该行**无可点词**，GPT `STATUS_PROMPT` 有「状态」交互词，而 `interaction:'status'` 分支会整行改渲染 ⇒ 真数据模式下**覆盖掉服务端 nar 显示文本**、与「服务端权威」相悖。倾向请 📖 补一条带交互词的 hp_bar nar。

## 2026-07-15 · 🎨 KALEIDO AVG 呈现骨架:可行性研究 → 垂直切片原型

- **前端可行性研究**（🧭 命题·3 角度并行调研 + 综合·送 🧭）：判定=**改造非推倒**（解锁引擎 100% 呈现无关·~3-5 人天·冲击收敛在 KaleidoRunView render 层）。形态=文字流逐段淡入（非打字机作主体）+ UI 件材质化 + **nar_line→件 因果两拍** + 转场混合（黑幕基线 + pollution shader 坍缩增强）。落地=Kanata 拍板见 `docs/plan/kaleido/10-avg-vertical-slice.md`。
- **AVG 垂直切片原型**（`b70d743`·🧭 转实现·seq1-2·dev 取景框）：
  - 新 [`KaleidoAvgView.jsx`](src/app/game/[id]/kaleido/KaleidoAvgView.jsx)：文字舞台为主体 + UI 件四缘材质化析出 + 因果两拍；5 落点区（舞台/顶带/底坞/事件覆盖/边缘抽屉）；自驱状态机 boot→awake→playing + 占位血肉；复用 T/HpBar/KaleidoRuleCard/Shader。
  - 5 特性：①黑幕冷开场 + shader 背景 ②逐段淡入 + 贴底自动滚 ③因果两拍（nar 落舞台→件延迟材质化 + 闪 cyan 同色）④冷开局觉醒行（C4·防 10 秒跳出）⑤hp_bar gauge-first + rules_card 门口告示闸门。
  - globals.css：`kaleido-line-in`/`materialize`/`flash-cyan`/`caret`（+reduced-motion）。dev/kaleido-preview：模式切换（AVG 原型/旧栈式）+ 重放冷开场。
  - dev 验证（端口 3100）：3 验证点机制全成立（冷开局钩子/因果两拍/文字变体池）；手感留 Kanata 线上验。
  - **复用兑现**：真接通时壳不变·内部 sim 换 `useKaleidoUiUnlocks` + 真 logs/narLog。**新技巧**：公开 dev 页可在备用端口(3100)起自己的 dev server 自验（不碰 Kanata 占用的 3000）。

## 2026-07-08 · 🎨 色板收敛(对局簇) + 首页重构派单①

- **色板收敛**（🧭 派单·纯 token 提取零视觉变化·仅精确值匹配才换·dev 计算色抽查证零视觉）：
  - 批次1 pilot（`a24c0e4`）：kaleido 子目录裸 hex→T token（stance 颜色/克制表/灰）；dev 抽查 stance 按钮计算色==原 hex 逐字节一致。
  - 批次2 对局簇（`b502589`）：gameUi 补 `bg4=THEME.panel3`/`dim3=THEME.dim3` 别名（🧭 裁·单一色源=T）；GameClientPage `CHAMBER_TYPE_META` 5 色→T；**CraftModal/ItemCraftModal 经 Workflow(转换+对抗 verify 双 PASS)** 全部映射 hex→T（模板字面量/alpha 后缀正确处理）。对局簇色板收敛基本完成，剩 admin 簇(31 文件·低优)。
  - **遗留色 backlog**（🧭 裁·出纯提取范围·需 Kanata 过目）：#c9d1d9/#ff8c42/gameUi 体力条 #00d4ff·#26c6da·#ff4455（视觉特调·改值=改观感）。
- **首页重构派单①**（`bcc93e0`）：新协作模式(Kanata 看 localhost 描述→🧭 转派→我推 main→🧭 同步 Kanata worktree)。`src/app/page.js` 归我主改（🧭 已过渡改 Hero=极简入口 `9746ba8`）。删 `RaidSnapshotCard`+`EntitiesPreview` 两块渲染+定义+连带死码(pollutionTier/2 import)；保留 HeroSection/PersonalStatsCard/LoadoutPreview/Footer；纯删除 100 行·登录态零变化·build+smoke 过。视觉终验在 Kanata localhost(端口 3000=其 dev)。
- **教训**（🧭 嘱记·已入 memory）：`Edit replace_all` 跨不同缩进的重复串会静默漏命中(P3-A 多人根曾漏)→多处同改用逐处显式 Edit + grep 计数核验。

## 2026-07-08 · 🎨 移动化 P3 对局页全屏化 + 模态窄屏适配

> 🧭 派单 P3（P2 桌面线上复核 PASS 后）。两件打包：① 对局页移动端全屏（逃逸 RootShell chrome·拿回 ~110px）② 模态窄屏适配。红线：桌面/多人零变化·kaleido 与多人两路径都验。

- **P3-A 对局页移动全屏化**（含补丁 · 🧭 线上复核抓漏）：两个对局根（kaleido 早返回根 6 空格缩进 + 多人根 4 空格缩进·**BR 走多人根**）+ dev harness 根加 `game-immersive-root` 类。⚠ 初版 `replace_all` old_string 用 6 空格缩进只命中 kaleido 根、漏多人根 → 🧭 线上 /game/25(BR) 查无类 → 补类到多人根（1189）修复；非「第三个 BR 根」（page.js 仅 re-export GameClientPage·两游戏根已全覆盖）。`globals.css` 加 `@media (max-width:767px){ .game-immersive-root{ position:fixed; inset:0; z-index:200; height:100dvh } }`——窄屏逃逸 RootShell `<Nav>`(sticky z100) + padded `<main>` chrome、拿回顶部 ~110px；**CSS 媒体查询首帧生效·无 JS/hydration 闪烁**。桌面(≥768)无规则 ⇒ root `position:static` 留在 chrome 内（桌面/多人零变化）。dev 实测：窄屏 375 root fixed 覆盖满视口(top0/375×812)·z200 覆盖 nav；桌面 1280 root static·nav 可见。
- **P3-B 模态窄屏适配**（`useIsNarrow` 条件切 grid·首帧桌面态·模态开在鉴权后无闪烁顾虑）：
  - `CraftModal` `260px 1fr` → 窄屏 `1fr`（列表/详情堆叠）；`ItemCraftModal` `240px 1fr` → `1fr`——二者 kaleido 也用（Kanata 手机主力形态）。
  - `PrepareModal` 4 类点数栏 `repeat(4,1fr)` → 窄屏 `repeat(2,1fr)`（多人 loadout·custom 模态）；其 loadout 网格 `auto-fit minmax(280px,1fr)` 本就响应式、不动。
  - 共享 `Modal`(admin/_shared/ui)`width:90% maxWidth:640 maxHeight:85vh overflow:auto` 本就窄屏友好、不动。
- **验证**：build+lint+类型+smoke 全过。P3-A DOM 双态实测通过；P3-B 编译 + useIsNarrow(已验) + grid 条件正确（模态开态视觉复核需游戏上下文=🧭 线上）。截图渲染器与 fixed 全屏根冲突超时（本会话间歇）——DOM 断言为等价证据 + 🧭 线上复核（同 P2 模式）。
- **遗留**：色板收敛（38 文件硬编码→theme.js）/ PWA（manifest+SW）押后待派单。

## 2026-07-08 · 🎨 移动化 P2 对局页响应式（三栏→窄屏竖排+底部 Tab）

> 🧭 派单 P2（死码清理验收 PASS 后放行）。对局页三栏在窄屏（<768）转单列 + 底部 Tab 切换；桌面（≥768）逐字节保持现有三栏 grid。dev harness 双态实测（截图 + DOM 断言）。

- **[`useIsNarrow`](src/lib/useIsNarrow.js)**（新）：视口窄屏检测钩子。SSR/首渲安全（初值 false=桌面态·无 hydration mismatch），仅 useEffect 内经 matchMedia 更新；断点默认 768。
- **[`ResponsiveGameLayout`](src/app/game/[id]/ResponsiveGameLayout.jsx)**（新）：响应式壳。**宽屏恒等渲染现有 grid `300px 1fr 300px`**（桌面 DOM 逐字节一致）；窄屏单列（当前 Tab 栏）+ 底部 Tab 导航（状态/行动/区域·触控 52px+·active cyan 高亮·可选角标）。**底栏 `position:fixed` 锚视口底**——对局根在 RootShell `<Nav>` + padded `<main>` 之下（非全屏），in-flow 底栏会被推出视口外，故 fixed + 内容区留 56px+safe-area 底 padding 防遮挡。
- **GameClientPage 接线**：三栏 grid 外包 `<ResponsiveGameLayout left/center/right>`（9 增 5 删·纯边界包裹 + import·**三列内容零改动**）；`badges={{ center: 遭遇/探针 → 红点 }}`（战斗中在他栏也可见）。kaleido 走 KaleidoRunView 早返回、不经此壳。
- **[dev harness](src/app/dev/game-layout-preview/page.js)**（新·联调后可删）：mock 三栏驱动 ResponsiveGameLayout；preview_resize 切 375/1280 验两态。
- **验证**：build+lint+类型+smoke 全过。dev 实测——桌面 1280：grid `300px 1fr 300px`、三栏全显、无底栏；窄屏 375：单列（默认 行动）+ fixed 底栏（top 754/bottom 812=视口底）、Tab 切换（状态→左栏）、零横向溢出、combat 角标。**双态截图已取**（新 dev server renderer 恢复可用）。
- **kaleido 窄屏（🧭 P1-LIVE 更正纳入）**：KaleidoRunView 在 390×844 零横向溢出、stance 三态按钮 99×48px（触控友好）——已响应式、rules_card/stance_ui/1b 窄屏正常，无需改。
- **遗留（P3 候选）**：移动端顶部仍有 RootShell `<Nav>`（吃 ~110px）——对局页全屏化（route group 逃逸 chrome）留 P3；PrepareModal 等模态窄屏适配 P3。

## 2026-07-07 · 🎨 KP1-C v2 渐进披露结构级改造（05 §1「UI 即进度」/ A Dark Room 式）

> 恢复令 KP1-C v2 落地：kaleido 全部 UI 件改解锁物、初始态=一个搜索按钮、逐件浮现 + nar_line 落日志（文案走数据·零硬编码）。三次提交，全程 build+lint+类型+smoke 过、dev 预览按 390×844 验证、多人渲染路径零回归可证。

- **基建**（`5ee35b7`）：
  - [`kaleido/kaleidoUiUnlocks.js`](src/app/game/[id]/kaleido/kaleidoUiUnlocks.js)：12 项 ui_key + nar_line（📖 N3 全量·组件零硬编码）+ `deriveStubUnlocks`（前端 stub·镜像 05 §1.3 触发）+ `readServerUnlocks`（🔧 真数据读缝）+ `REVEAL_ORDER`/`KALEIDO_STATIC_LINES`（死亡登记行·N3 §4）。
  - [`kaleido/useKaleidoUiUnlocks.js`](src/app/game/[id]/kaleido/useKaleidoUiUnlocks.js)：sticky 解锁集（只增不减·兼容 R8/R9）+ 新解锁 diff → 渐次动效 + nar_line 落披露日志；`enabled=false`（多人局）完全惰性。
  - [`kaleido/KaleidoRunView.jsx`](src/app/game/[id]/kaleido/KaleidoRunView.jsx)：A Dark Room 渐进布局（初始仅搜索按钮 hero 态 → 逐件浮现）；复用已交付壳件（关卡头/R6 卡/横幅/收敛页）；含 **1b 三态出招**（stance_ui·`{action:'attackNpc', stance:'atk'|'def'|'skill'}`）。
  - `globals.css`：`kaleido-reveal`/`kaleido-narline` 动效（+ `prefers-reduced-motion`）。
  - [`/dev/kaleido-preview`](src/app/dev/kaleido-preview/page.js) 改为渐进披露谐调器（stub 驱动·390×844 取景框）。
- **生产集成 + 对抗复审修正**（`50a9ec2`）：
  - GameClientPage：`if (isKaleido) return <KaleidoRunView/>` **早返回**（多人 3 栏壳 return 93 行纯新增/0 删除 ⇒ 多人渲染路径字节级不变）；共享模态（Toast/合成/拾取）重挂；解锁钩子 `enabled=isKaleido`。
  - 5-lens 对抗复审 Workflow：**多人零回归 / 硬时序法则 = PASS**；抓 3 HIGH + 1 med 全修 ——
    - 节点战斗模板字段是 **`kaleidoMode`** 非 `combatMode`（runs.js:134）→ 三态UI/规则卡/stance解锁曾恒失效（**连既有壳代码一起错**·老规则卡恒回落 standard）；
    - `searched` 信号改 `me.turnCount>0`（run 创建播种 1 条 log·旧 `logs.length>0` 开局误亮 log_panel）；
    - narLog 开场行 seed 去 `enabled` 门控（room 初 null 致开场行永久丢失）；
    - 死亡登记行改数据源（N3 §4）。
- **对齐 🔧 06 契约 §8**（`232fd87`·D1-D6）：
  - D1 解锁集读缝 → `me.uiUnlocks`（账号镜像·契约定稿字段，替换占位 `gamevars.kaleido.uiUnlocks`）；
  - **D3 时序法则修正**：hp_bar 触发 `fight_start`→`search`（🔧 对抗验证：污染/Ω/收缩死亡先于战斗 → hp_bar 首搜即显、与 combat_panel 解耦）；
  - D4/D5/D6 verb 词汇对齐（search+condition / move / cleared_seq_increased·元数据）。
- **D2 unlockEvents 客户端消费已接齐**（`🧭 验收后补·六处校订全收`）：`useKaleidoUiUnlocks` 抽 `commitUnlocks`（prevRef 去重·每 key 恰处理一次）+ `applyServerEvents`（消费响应信封顶层 `unlockEvents`·服务端 nar_line 权威）；`runGameAction` 在 `hydrateRoom` 前提交 ⇒ server 事件先于 stub-derive ⇒ server nar_line 为准、无本地副本漂移；🔧 route 未 emit 时 stub-derive 兜底，全量 live 后置 `emitNarLog=false` ⇒ 客户端零本地文案表（🧭 裁决）。dev 验证：模拟 server unlockEvents 解锁 `craft_btn`（stub 永不解锁的键）+ server nar_line 落日志恰 1 次 + 动效。至此 🔧 06 §8 **D1-D6 全收**。
- **死码清理已落地**（`2aa9bd7`·🧭 批准三条件）：删多人 return 内被 `if(isKaleido)` 早返回（line 1110）架空的 4 块（横幅/收敛/关卡头/规则卡）+ 仅服务它们的 4 处 import。纯删除（1 注释/54 删除）·自证不可达（早返回前不达 + 多人 isKaleido 恒假 no-op）·build+smoke 过。多人局截图=🧭 线上 post-deploy 检查（本地占位 env 登不进对局页 + 截图渲染器整会话超时）。
- **🔧 unlockEvents route 已 LIVE**（`ec38ed6`）：代码级对账我的 D2 消费缝与真 emit 精确匹配——响应顶层 `{room,unlockEvents}`、payload `{ui_key,nar_line,timing,seq,precedes?}`（snake_case）、REVEAL_ORDER=注册表序（level_header→turn_counter）；applyServerEvents 在 hydrateRoom 前提交 ⇒ server 事件先到、stub-derive 经 prevRef 去重退居兜底。
- **认知更正（🧭·作废「P1 恒不触发」）**：`rules_card`/`stance_ui` **P1 即 LIVE**（采样器按 archetype 出非标准 combat_mode 关·读 `kaleidoMode.template_ref`）——我 stub derive 用的正是该字段、代码无需改，真 run 会点亮 → **移动化 P2 须纳入这两件的窄屏验证**。`craft_btn` 是唯一 P1-DEAD（待 ⚙️ 投放 + 🔧 消费器）。
- **遗留 / 待接**：① 🔧 route 全量稳定后置 `emitNarLog=false` + 删本地 nar_line 表（最终清理·消漂移）；② 收敛页 abandon 终态**不做**「值班的」末行日志（🧭 叙事口径·勿三终态对称）；③ 移动化 P2 对局页响应式（下一派单·含 rules_card/stance_ui/三态出招窄屏）。

## 最近变更（2026-07-06 / 🎨 KP0-C 单人壳 UI 全五件 + KP0-R-C 修复批 C1-C5）

> 🎨 前端轨 KALEIDO 交付汇总（含此前 P1 移动地基）。全部 UI 按 390×844 + 桌面验证、零横向溢出；多人局渲染路径零改动（全部 kaleido 件走 `isKaleido` 条件，false 分支 JSX 逐字节不变）。

- **P1 移动地基**（`f0d0355`）：layout.js 改 Server Component 导出 `viewport`（含 viewport-fit=cover）+ metadata + themeColor，客户端逻辑抽 [`src/app/_shell/RootShell.jsx`](src/app/_shell/RootShell.jsx)（**useAuth 迁此，10 处引用改 `@/app/_shell/RootShell`**）；globals.css 移动基线（输入 16px 防缩放/touch-action/overscroll/safe-area 工具类）；GameClientPage 100vh→100dvh。另：LocatorJS 开发期 Alt+click 跳源码（`b7e4a0d`·dev-only）。
- **KP0-C ①③④⑤**：`/rooms` 单人出勤入口卡（`123906f`）；[`kaleido/kaleidoShell.jsx`](src/app/game/[id]/kaleido/kaleidoShell.jsx) 纯展示壳（关卡头/R6 规则卡/关间横幅/收敛页 + describe 中文助手·`c6b37e3`）；admin 内容引擎注册 content_pool schema + 通用 `json`/`readOnly` 字段类型（`38f41f6`/`4d866c6`·provenance 只读对齐 🔒 服务端强制）；dev 预览页 [`/dev/kaleido-preview`](src/app/dev/kaleido-preview/page.js)（mock 挂全部壳组件·联调后可删）。
- **KP0-R-C 修复批（04 §1 C1-C5·本段提交）**：
  - **C1(HIGH)**：入口卡端点对齐契约 `POST /api/kaleido/run` → `{roomId,runId}` → 跳 `/game/[roomId]`；catch 不再吞错（透出冷却等服务端消息）。
  - **C2**：大厅列表查询加 gametype + `isKaleidoRoom` 过滤单人房（本人续跑走入口卡幂等返回，不靠列表）。
  - **C3(方案 c)**：入口卡跳转带 `?kaleido=1`；GameClientPage 以 hint 在 room 载入前跳过首帧订阅（多人链接永不带 → 严格中性；hint 与实况不符自愈清除）。
  - **C4(② 收尾)**：kaleido 分支接入 —— 顶部关卡头（第 N/5 关·本关回合·exit_condition 目标）、右栏 R6「本关规则」卡（P0 空态容器）、关间横幅（进入下一关=复用 `move` 动作·可留在本关）、收敛页（通关/死亡/放弃 · summary=clearedSeq/本关回合/击败/携带道具·再来一次=幂等开新 run）；隐藏 撤离/紧急撤离/ExtractionModal/PvP 面板（服务端已 throw·UI 一并不渲染）。
  - **C5**：beacon 发射端 —— `fetch keepalive` + Bearer（token 预缓存·sendBeacon 发不了头）+ visibilitychange/pagehide 上报 `session_end`(context: after_death/after_clear/mid_combat/idle)；每次隐藏只发一次；多人局三 effect 全早退。
- 移动化 P2-P4（对局页响应式/其余页/PWA）+ 色板收敛照旧在本轨 backlog。
- **⏸ 停点（2026-07-07 Kanata 全轨暂停令）**：KP1-C 已完成 1a（R6 克制表/波次·canonical 对齐 `b1d8844`）+ 3（收敛图鉴逐关容器·codex prop）；**下一步 = 1b 三态出招交互**（⚙️ 裁决 C「stance_duel 接 live attackNpc·真可玩」已上 main `ae5a813`，动作协议已解锁待接）→ 之后 4 移动化 P2 对局页响应式。工作区干净、全部已推 main、无半成品。恢复令后从 1b 起步。
- **📡 状态同步（2026-07-07 · e92d0b0 · 仍待命）**：Kanata 定向「开局无 UI 只有一个搜索按钮，UI 渐进披露」（`docs/plan/kaleido/05`）——恢复后为本轨结构级改动：kaleido 全部 UI 件（含已做的关卡头/R6 卡）变解锁物、初始态=一个搜索按钮、1b 三态 UI 变 `stance_ui` 解锁物（05 §1.3 十二项 ui_key 清单）；📖 N3（`docs/narrative/kaleido-n3-static-layer.md`）已供全部 nar_line/挂载点文案 +「引导者」替换表（本轨仅入口卡标题一处，过渡文案「单人 · 往里走」）。⚙️ stance_duel 动作协议定稿已录任务卡（attackNpc+stance:'atk'|'def'|'skill'·脏值回落 atk·log 尾结算行·boss 关无 stance）。文档改版：本轨家=`Claude/frontend/`，hub=`Claude/Readme_Claude`；恢复后开工先读 `Claude/frontend/GPT.md`（只读协作接口）。等 🧭 按 05 重切的新派单。
