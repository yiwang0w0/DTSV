Original prompt: 那帮我补齐，记得最后更新readme_GPT

2026-03-19
- 目标：补齐 rooms 乐观锁的收尾问题，重点修复重试导致的副作用重复执行，以及后台强制结束房间绕过 version 的问题。
- 已定位问题：
  - `executeCraft()` 会先改 `equipment_instances`，再写 `rooms`；若 `persistRoom()` 冲突并重试，可能重复删前置装备/重复插入新装备。
  - 战斗耐久扣减发生在 `persistRoom()` 前，冲突重试会重复扣耐久。
  - 管理后台 `RoomsTab.jsx` 直接 `update rooms.gamestate`，会绕过 version 检查。
- 已完成修补：
  - `executeCraft()` 增加 side-effect journal，版本冲突或持久化失败时会回滚合成插入/前置装备删除/降耐久副作用。
  - NPC/PvP 战斗的耐久扣减移动到 `persistRoom()` 成功之后执行，并改成 best-effort，避免冲突重试重复扣耐久。
  - 管理后台房间 Tab 改走 `/api/admin/rooms`，新增服务端 `PATCH` 强制结束房间，并带 version 检查与共享日志写入。
- 验证：
  - `npm run smoke` 通过。
  - `node --check` 已通过 `src/lib/server/gameActions.js`、`src/lib/equipmentEngine.js`、`src/app/api/admin/rooms/route.js`。
  - 本地 `npx` 存在，但未安装 Playwright 包，暂时无法按 `develop-web-game` 技能继续跑浏览器回归。
