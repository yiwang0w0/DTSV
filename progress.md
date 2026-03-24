Original prompt: 那帮我补齐，记得最后更新Readme_GPT

2026-03-21
- 目标：把已经废弃的旧实现和不可达代码直接删掉，减少 `gameActions.js` 体积。
- 已完成：
  - 删除 `searchAreaImpl / attackNpcImpl / fleeNpcImpl / attackPlayerImpl / useItemImpl`
  - 删除五个动作函数中 `return resolve...` 之后的整段不可达旧逻辑
  - 删除只被旧逻辑使用的 `applyTurnEffects()` 与 `ensureCorpsesForNewDeaths()`
- 验证：
  - `node --check src/lib/server/gameActions.js`：通过
  - `npm run smoke`：通过
- 结果：
  - `gameActions.js` 净删约 700+ 行
  - 当前动作入口只剩新事件结算器主链路，后续继续拆文件会更轻松

2026-03-21
- 目标：做一次整体 debug，确认当前仓库是代码问题还是环境问题。
- 已完成：
  - 对 `src/lib/**/*.js`、`src/app/api/**/*.js`、`scripts/*.mjs` 跑了 `node --check`，全部通过。
  - `npm run smoke` 通过。
  - `npm run build` / `npm run lint` 均失败，原因不是新代码报错，而是本地没有可执行的 `next`。
  - `npm ls next` 与 `npm ls playwright` 都为空，确认当前工作区缺少这两类依赖。
- 结论：
  - 当前最主要的问题是环境没有装依赖，不是新一轮代码语法回归。
  - 事件结算器主入口还能正常工作，后续优先补依赖环境再做浏览器回归。
2026-03-20
- 目标：按"优先事件结算器"的方向，先给现有动作层补一层轻量共享结算管线，并移除地图冗余的 `danger_level` 配置。
- 已完成：
  - 新增 `src/lib/eventResolver.js`
    - 提供 `createActionResolution()`、`runTurnStartSettlement()`、`settleNewDeaths()`、日志/玩家状态写回 helper。
  - `src/lib/server/gameActions.js`
    - 新增 `resolveSearchAction()`、`resolveNpcAttackAction()`、`resolveNpcFleeAction()`、`resolvePlayerAttackAction()`、`resolveUseItemAction()`。
    - `search / attackNpc / flee / attackPlayer / useItem` 现已统一走新的事件结算器入口。
    - 抽出 `settleCorpseGeneration()` 与 `persistResolution()`，把 Buff 结算、死亡转尸体、日志累积收口到共享流程。
  - `src/app/admin/_tabs/MapsTab.jsx`
    - 删除 `danger_level` 编辑项。
    - `src/` 内已搜索确认无 `danger_level` 残留引用。
    - 这轮默认只做代码层移除，数据库列未实际 drop。
- 验证：
  - `node --check src/lib/server/gameActions.js`：通过
  - `node --check src/lib/eventResolver.js`：通过
  - `npm run smoke`：通过
- 剩余：
  - `gameActions.js` 里旧版实现残段仍在，后续最好继续拆掉。
  - 还没补事件结算/尸体专项 smoke。
  - 本地依旧缺浏览器回归环境。

2026-03-20
- 目标：实现"尸体战利品系统"，替代随机装备掉落设想。
- 规则确认：
  - NPC / 玩家死亡后不会直接随机掉装。
  - 击杀者会立刻获得一次从尸体中带走 1 件装备或道具的机会。
  - 尸体和剩余物资继续留在地图上，后续搜索还能继续拿。
- 已完成：
  - `src/lib/server/gameActions.js`
    - 新增 `collectLootableCorpses()`、`lootCorpse()`、`dismissLootPrompt()`。
    - `executeGameAction()` 现在会拦截未处理的 `lootPrompt`，避免覆盖当前战利品提示。
    - 尸体拾取里的装备转移/实例生成已带回滚，兼容当前 rooms optimistic lock。
  - `src/app/game/[id]/LootModal.jsx` — 新增尸体拾取弹窗。
  - `src/app/game/[id]/GameClientPage.jsx` — 已接入 lootPrompt 展示、拾取、关闭，以及当前地图尸体数量提示。
- 验证：
  - `node --check`：通过。
  - `npm run smoke`：通过。
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
  - `node --check` 已通过关键文件。
  - 本地未安装 Playwright，暂时无法跑浏览器回归。

2026-03-24
- 目标：去掉首页里不需要的“常磐大逃杀”文案，并补上房间轮次的自动准备逻辑。
- 已完成：
  - `src/app/page.js` 删除副标题“常磐大逃杀 · 现代Web重制版”。
  - `src/app/api/game/rooms/route.js` 增加 `ensureNextRound` 逻辑：允许已登录用户请求“若当前没有等待中/进行中的房间，则创建一个新的等待房间”。
  - `src/app/rooms/page.js` 增加每 60 秒轮询房间状态；当没有可用房间时会自动触发下一轮准备，并更新大厅提示文案。
- 验证：
  - `node --check src/app/api/game/rooms/route.js` 通过。
  - `npm.cmd run smoke` 通过。
  - 检查确认首页源码中已不存在“常磐大逃杀”文本。
  - 本地 `next` / `playwright` 仍不存在，因此没有做浏览器层回归。
- 备注：
  - 当前“自动准备下一轮”是通过大厅页面驱动的，不是独立后台定时任务；只要有已登录用户进入大厅，就会在首次进入和之后每分钟巡检时补房。

2026-03-24
- 目标：修复 Vercel `next build` 被 `react/no-unescaped-entities` 卡住的问题。
- 已完成：
  - `src/app/admin/_tabs/EquipmentSeriesSection.jsx` 中两段包含裸双引号的 JSX 文案已改为 `&quot;`。
  - 对应 Vercel 报错位置为 577 / 606 行，共 5 个 lint 错误。
- 验证：
  - 已检查源码，目标文案现在使用 `&quot;`。
  - 本地没有 `next`，因此未复跑完整 `npm run build`。

2026-03-24
- Ŀ�꣺�޸� Vercel 
ext build ��� Hook ������󣬲�˳�������ѱ�¶�� effect/font lint ���档
- ����ɣ�
  - src/lib/server/gameActions.js �� useItem ����Ϊ performItemUse������ eact-hooks/rules-of-hooks ���С�
  - src/app/admin/_tabs/UsersTab.jsx �� useCallback ��װ loadUsers������ effect ������
  - src/app/admin/page.js �� outer ���������� loadAll �տ�Ϊ useCallback��
  - src/app/layout.js �� src/app/globals.css �л��� 
ext/font/google�����Ѷദ ontFamily ��Ϊ CSS ������
- ��֤��
  - 
ode --check src/lib/server/gameActions.js ͨ����
  - 
ode --check src/app/layout.js ͨ����
  - 
ode --check src/app/admin/page.js ͨ����
  - 
pm.cmd run smoke ͨ����
- ��ע���������� 
ext ��ִ���ļ���δִ������ 
pm run build��
