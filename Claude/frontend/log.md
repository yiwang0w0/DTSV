# 🎨 前端轨 · 变更日志(倒序置顶)

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
