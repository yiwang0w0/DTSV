# 🎨 前端轨 · 变更日志(倒序置顶)

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
