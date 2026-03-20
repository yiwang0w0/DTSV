Original prompt: 那帮我补齐，记得最后更新readme_GPT

2026-03-20
- 目标：实现“尸体战利品系统”，替代随机装备掉落设想。
- 规则确认：
  - NPC / 玩家死亡后不会直接随机掉装。
  - 击杀者会立刻获得一次从尸体中带走 1 件装备或道具的机会。
  - 尸体和剩余物资继续留在地图上，后续搜索还能继续拿。
- 已完成：
  - `src/lib/server/gameActions.js`
    - 新增 `collectLootableCorpses()`、`searchAreaImpl()`、`attackNpcImpl()`、`fleeNpcImpl()`、`attackPlayerImpl()`、`useItemImpl()`。
    - 新增 `lootCorpse()`、`dismissLootPrompt()`。
    - `executeGameAction()` 现在会拦截未处理的 `lootPrompt`，避免覆盖当前战利品提示。
    - 尸体拾取里的装备转移/实例生成已带回滚，兼容当前 rooms optimistic lock。
  - `src/app/game/[id]/LootModal.jsx`
    - 新增尸体拾取弹窗。
  - `src/app/game/[id]/GameClientPage.jsx`
    - 已接上 `lootPrompt` 展示、拾取、关闭，以及当前地图尸体数量提示。
- 验证：
  - `node --check src/lib/server/gameActions.js`：通过。
  - `node --check src/lib/roomState.js`：通过。
  - `npm run smoke`：通过。
  - `npm run lint`：失败，当前环境缺少可执行 `next`。
- 剩余：
  - `scripts/smoke-check.mjs` 还没补到尸体专项断言。
  - 本地没法跑 `next lint` / `next build` / Playwright 回归。

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
