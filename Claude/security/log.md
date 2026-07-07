# 🔒 安全性轨 · 变更日志(倒序置顶)

> **状态锚点（2026-07-07 · ▶ 已复工 · KP1-X）**：恢复令已收（`git rebase origin/main` = `473ddb4`；读毕 `docs/plan/kaleido/03-track-packages.md` 末段「KP1-R 恢复令重排」🔒 小节）。**item 1（kaleido-e2e.mjs 安全复核）已完成 —— 见下节**；item 2/3（🔧 ui_unlocks 账号级持久化 DDL 跟审 / LW-3·D3 触发审）待 🧭 转审。原停机期锚点保留 ↓ ——
>
> **状态锚点（2026-07-07 · 停机期 · 非恢复令）**：中控全局同步点 `e92d0b0`。① 剧情线定向落定（权威见 `docs/plan/kaleido/05`：开局仅搜索按钮 / UI 渐进披露 / 失衡时代叙事 / 玩家=结构工程体）② 文档改版：本轨家 = `Claude/security/`（README+log）· hub = `Claude/Readme_Claude` · dated 段写本 log.md ③ 恢复后**开工先读** `Claude/security/GPT.md`（只读 · GPT 投放参考）④ 恢复后审点预告：**ui_unlocks 账号级持久化**（新表 / profiles 列）+ kaleido-e2e 脚本安全复核（在队）。本轨停点 = phase-52 全库收官 + KP1-X #1 resolveTurn R1 审毕。继续待命。

## 最近变更（2026-07-07 / 🔒 KP1-X · `scripts/kaleido-e2e.mjs` 安全复核[只读·不改脚本]）

> 恢复令 KP1-X 首项（低优）：对 `scripts/kaleido-e2e.mjs`（service-role 直驱真库的 KALEIDO 状态机 E2E 回归）做三轴安全复核 —— **凭证读取面 / 清理完备性 / 生产表写入面**。方法：三轴 finder 追调用图 + 逐条对抗验证（16 采 → **4 confirmed / 12 rejected**）。**结论：无 high/medium，脚本可继续跑；一处值得修的低危（raid_stats 清理遗漏）+ 两处稳健性建议。均只出意见、不改脚本（E2E 资产 🔧 共管）。**

- **① 凭证读取面 = clean**：`SUPABASE_SERVICE_ROLE_KEY` 只读、绝不打印/落日志（缺凭证仅报「缺凭证」·无 KEY 值）；所有 `console.*` 与断言 detail（slice 220）不含 KEY；supabase-js 错误对象不回带 service key（KEY 只在 Authorization 头、不入 error 体）。`loadEnv` 把 `.env.local` 全部大写变量载入 env 对象但从不 dump。**零泄密面**。
- **② 清理完备性 = 3 处低危缺口**：
  1. **raid_stats 清理遗漏（唯一有实际复发影响 · 建议修）**：通关 run（块①）最后一步 converged → 写 `endingResult` → `persistRoom`（[`gameActions.js:743`](src/lib/server/gameActions.js:743)）检测 `gamestate 1→2` → `writeRaidStats` INSERT 一行（[:829](src/lib/server/gameActions.js:829)）。自清理（[`kaleido-e2e.mjs:157`](scripts/kaleido-e2e.mjs:157)）删 `{player_events,levels,runs,rooms}` **不含 `raid_stats`** → 每次成功通关遗留 1 行孤儿（`room_id` 指向已删房）。该表喂 PlaytestTab / ChambersTab / DbConsoleTab「最近 30 局」聚合，测试行（duration≈0s·注入 boss 属性）会拉偏内部平衡 dashboard。**非引用完整性问题**（`raid_stats.room_id` 是裸 `BIGINT`·无 FK·实读 `phase-22-1-raid-stats.sql:23-40`），纯数据质量污染；可按 `ending_key='kaleido_clear'`+`room_id` 追踪。**建议**：清理段补 `await sb.from('raid_stats').delete().in('room_id', out.ids.rooms)`（置于删 rooms 之前）。死亡 run（块②）走死亡分支提前 `return` 不调 `persistRoom` → 不产 raid_stats；故每次完整 E2E **仅 1 行**。
  2. **部分失败级联**：157-163 为单个 `try/catch` 顺序包 4 条 `await DELETE`；中途某条抛错则后续 DELETE 被跳过 → 部分孤儿。缓解已有：catch 打 `CLEANUP_FAIL + out.ids` 到 stderr 供人工补删。**建议**：每条 DELETE 独立 `try/catch`、互不阻断。
  3. **无 `finally`/信号处理**：清理是顶层最佳努力代码，非 `try/finally` 亦无 `process.on('SIGINT'/'SIGTERM')`；run 循环中途 Ctrl+C/kill/崩溃 → 整段清理不跑，留 rooms/runs/levels/player_events 脏行。孤儿可追踪（测试 UUID·`gametype=30` 空房·日志内 `E2E-clear/E2E-death` 显示名）。**建议**：抽 `cleanup()` 函数 + `finally { await cleanup() }` + 信号兜底。
- **③ 生产表写入面 = 已清点 · 仅 raid_stats 一处异常**：E2E 调用图写入面 = `{ rooms(INSERT/UPDATE), runs(INSERT/UPDATE), levels(INSERT/UPDATE), player_events(INSERT), raid_stats(INSERT) }` + 脚本内直接 rooms UPDATE（[:89](scripts/kaleido-e2e.mjs:89) 注 boss 属性 · [:140](scripts/kaleido-e2e.mjs:140) 注 alive=false）。全部落 `out.ids` 可追踪、happy-path 自清理（唯 raid_stats 漏，见 ②-1）。**不写** `profiles`/`auth.users`（测试用户纯内存对象；profiles 三处写全在 joinRoom/extractPlayer，E2E 只发 search/attackNpc/move 不走）、**不写** `player_death_log`（6 处调用点全 gate 于实际战斗致死：块①买血不死 / 块② 裸改 gamevars 绕过战斗）、**不写** player_points/player_stash/classes。service key 全程留 client 内、不入日志/响应体。
- **对抗验证驳回 12 条**（防误报）：含「无生产库守卫 = high」（全仓仅一个 Supabase 项目·「直驱真库」是脚本头注 line 2 书面既定设计·非误配；残余仅「缺硬断言兜底 cleanup 失败」= low）、「profiles 0 行 UPDATE 孤儿」（路径不执行）、「player_events 污染分析」（唯一消费者是 owner-scoped beacon `count`·无聚合 dashboard 读该表）、「cleanup 顺序 FK 级联」（`player_events.run_id` 无 FK·`levels→runs` 为 ON DELETE CASCADE）、「line 89 未版本化 race」（单进程串行·跨 run 房隔离）、「runs/levels 无事务边界」（越域批生产码·E2E 不注故障·已有补偿 catch）等。
- **未改动任何文件**（E2E 资产 🔧 共管·仅出意见）；已 `send_message` 报 🧭。

## 最近变更（2026-07-06 / 🔒 phase-52a 服务端专属表 RLS 锁死）

> phase-52 广义 RLS 扫描的 52a（零写路径风险·即时收口）。把 RLS-off 27 表按客户端可达性分档，锁死【仅 service_role 触达】的 14 表。

- **审计**：逐表核实 anon 可达性 —— 字符 `from('x')` + **动态 `from(变量)`**（`usePlacementRules` 动态表名差点漏掉 4 张 placement 表 → 已正确归 52b）+ realtime 订阅（全仓仅 `rooms`）。
- **[`scripts/phase-52a-server-only-rls.sql`](scripts/phase-52a-server-only-rls.sql)·已应用**：14 表开 RLS·无策略 = deny anon 读写、service_role 绕过。`br_match*`(5) / chamber_residue / cross_room_probes / economy_wipe_log / fragment_cold_cases / probe_encounter_pairs / room_items / player_expedition_opt_ins / player_notifications / seasonal_expeditions。验证 14 表 rls_enabled=true·policies=0。`contracts`/`player_contracts` 早已 RLS-on（免处理）。
- **52b 待办**（有 anon 编辑器/客户端读·需读策略或写路由，照 phase-51 范式）：br_rooms / chamber_templates / classes / fragment_pool / player_class_runs / player_points / raid_stats / shop_catalog / shop_exchange_rates / placement 四表 + authenticated-write 档（buff_pool / equipment_series / equipment_tiers / item_pool / map_config / npc_pool）。

## 最近变更（2026-07-07 / 🔒 phase-52b 剩余批 · 子批 1（玩家数据）+ 2a（5 内容表））

> 52b 剩余批开工。子批 1 = 玩家数据组（**HIGH·数据暴露**）：player_points/player_class_runs/raid_stats 当前 RLS 全关 → anon 可读**所有玩家点数余额**并篡改。

- **[`scripts/phase-54-player-data-rls.sql`](scripts/phase-54-player-data-rls.sql)·已应用**：player_points/player_class_runs → **owner-read**（`user_id=auth.uid()`）+ 放行 PRIMARY_ADMIN 邮箱读全表（保 PointsConfigTab/ClassesTab 聚合）+ 写仅 service_role；raid_stats（无 user_id·聚合无 PII）→ public read + service write。
- **纯 SQL·无编辑器改动**：三表客户端只读、写全服务端；owner-read 对 PrepareModal（`.eq(user_id)` 读自己）零影响。
- **实测**：`P54_PROBE service_rows=1 anon_read=0 anon_insert_ok=f` —— anon 从「可读全部余额」→ 0 行、写被拒。
- **子批 2a（5 内容表·[`phase-55`](scripts/phase-55-content-rls-2a.sql)·已应用）**：chamber_templates/classes/fragment_pool/shop_catalog/shop_exchange_rates → 开 RLS·public read·写仅 service_role。新通用 `/api/admin/table` 扁平表写路由（表+列白名单）；5 编辑器改 postGameApi：**ChambersTab/ClassesTab/FragmentsTab/ShopTab/PointsConfigTab**（🎨 避让）。实测 anon 读 25 行·写被拒。
- **子批 2c（placement 四表·[`phase-56`](scripts/phase-56-placement-rls.sql)·已应用）**：placement_rules/placement_rule_rooms/npc_placement_rules/npc_placement_rule_rooms → 开 RLS·public read·写仅 service_role。新 `/api/admin/placement` 路由（规则 upsert + 候选先清后插 + rule_id 服务端强制 + weight>0/去重）；**usePlacementRules**（RoomItemsTab/NpcPlacementTab 共用）改 postGameApi。实测 anon 写被拒。
- **子批 2b（br_rooms·[`phase-57`](scripts/phase-57-br-rooms-rls.sql)·已应用）**：br_rooms → 开 RLS·public read·写仅 service_role；RoomsEditorTab（主写 + 对称同步双向 + remove + toggle）改 postGameApi（`/api/admin/table` br_rooms 列白名单纳入用户指派 pk room_id）。实测 rls=t·anon 读 100 房·写被拒。
- **✅ phase-52b 全部完成** —— 至此 **phase-51 + 52a + 52b 全批**：全库「anon / 任意登录用户可写内容表」漏洞面清零；玩家数据（player_points/player_class_runs）owner-read；所有 admin 写路径经 `/api/admin/*` service_role。

## 最近变更（2026-07-06 / 🔒 phase-52b 第一批：6 内容表写权收紧 + 编辑器服务端化）

> 52b 起步批：6 张「authenticated-write 过宽（HIGH·任意登录用户可写内容表）+ 有 anon 编辑器」的表，照 phase-51 范式收紧。

- **写路径服务端化**（`feat(52b)`·先 ship 零窗口）：新 4 路由（`/api/admin/buff-pool`·`equipment`(series+tiers)·`item-pool`·`npc-pool`，均三段闸 + 列白名单=表列去 id/created_at）；编辑器改 `postGameApi`：RulesBuffModal+RulesTab(buff_pool)·EquipmentSeriesSection(series/tiers)·ItemsTab(item_pool)·NpcsTab(npc_pool)。map_config 无编辑器（仅 AdminPageInner 读）。
- **[`scripts/phase-53-content-write-rls.sql`](scripts/phase-53-content-write-rls.sql)·已应用**：6 表 DROP 过宽写策略（admin_write_*=authenticated / *_all=auth.uid() IS NOT NULL）+ 标准化 public_read + service_write。先 ship 路由（线上 4 路由 401 验证）→ 再跑迁移，零窗口。
- **实测**：6 表 rls_enabled=true·各 2 策略；anon 读 item_pool=15 行正常、anon 写被拒（RLS53_PROBE anon_insert_ok=f）。build(35 页)+smoke ✓。
- **52b 剩余（下批·RLS-off·有 anon 客户端读/写）**：br_rooms / chamber_templates / classes / fragment_pool / shop_catalog / shop_exchange_rates（读+写）· player_points / raid_stats / player_class_runs（仅客户端读·加读策略即可）· placement 四表（usePlacementRules 动态 `from(tableName)`）。

## 最近变更（2026-07-06 / 🔒 KP0-X #1 kaleido 六表 schema 审+执行 + content_pool 写路径）

- **KALEIDO 六表 schema 审+执行**（`dd17323`）：审 ⚙️ 的 [`kaleido-p0-schema.sql`](scripts/kaleido-p0-schema.sql)（runs/levels/player_events/player_profile/generation_jobs/content_pool）—— 3 视角对抗式工作流（跨玩家泄漏 / 写越权+append-only / SQL 幂等）全 clean + 逐策略手工核对，无高危。经 postgres MCP 执行、标「已应用」。实测 6 表 RLS·私有五表 owner-read+service 写·player_events append-only·content_pool 公开读·owner 隔离 service_sees=1/anon_sees=0。
- **content_pool 写路径服务端化**（修 🎨 编辑器 4xx·中控裁决归 🔒）：`adminContent.js` CONTENT_SCHEMAS 加 content_pool；**provenance 服务端强制** `{source:'seed',anonymized:true}`（不信客户端·promoted 走 P2）；payload 尺寸上限 100KB；`validateContent` 加通用 select 枚举校验（防非法 entity_type 注入）。build(31 页)+smoke ✓。

## 最近变更（2026-07-06 / 🔒 KP0-X 公式沙箱硬化 + API 密钥规范）

> KALEIDO 数据层安全第一批（KP0-X #3/#4 已上线）。#1 审 kaleido schema、#2 审 beacon/防刷 待 ⚙️ 交付触发；#5 phase-52 续推。

- **evalFormula 白名单硬化**（`da7758c`·公式沙箱 = P2「LLM 产物语义闸」地基）：旧黑名单只禁符号，未拦 `.` 属性访问 / 裸全局标识符 / 无引号造串 → 对不可信输入(未来 LLM 产物)可 `process.exit(1)`(DoS) 或 `Function(String.fromCharCode(...))()`(RCE)。改白名单：新 [`src/lib/formulaSandbox.js`](src/lib/formulaSandbox.js)（零 import 纯函数）字符白名单 + 剔数字后标识符必须 ∈ {注入变量 ∪ 安全函数 ∪ Math 成员}，拒 process/Function/constructor/String/globalThis/new/require/this/__proto__ 等；导出 `isFormulaSafe` 静态校验（P2 写库前语义闸）；`gameEngine.js` 改 re-export（既有导入方零改）。[`scripts/smoke-evalformula-adversarial.mjs`](scripts/smoke-evalformula-adversarial.mjs) 65 断言全绿（23 逃逸用例→eval 0+unsafe / 真实 DB 公式逐值不变 / hex·科学计数不误杀）。
- **ANTHROPIC_API_KEY 规范**（`.env.example` 占位 + 约定，P2 用）：仅服务端（`src/lib/server/generation/`）· 禁 `NEXT_PUBLIC_` 前缀 · 禁进任何客户端组件/日志/API 响应体 · 生产经 Vercel env 注入，绝不提交真值。

## 最近变更（2026-07-05 / 🔒 phase-51 内容表 RLS 收紧 + 写路径服务端化）

> 安全性轨第一棒。审计（postgres MCP 实测）修正「全库 RLS 全关」旧认知为**混合态**（55 表 33 关 22 开）；对 7 张 anon / 任意登录用户可写的内容表收紧，写路径同批服务端化，零「能读不能写」窗口。

- **审计**：坏模式 = `cmd=ALL, roles={public}, USING(auth.role()='authenticated')`（任意登录用户可写）；RLS 关的表 anon 直接可写。`tier_recipes/recipe_ingredients/game_rules` 有策略但 RLS 关着 = inert 失效。
- **phase-51 迁移**（[`scripts/phase-51-content-rls.sql`](scripts/phase-51-content-rls.sql)·已应用）：7 表开 RLS + `*_public_read`(USING true) + `*_service_write`(FOR ALL TO service_role) + DROP 过宽旧策略。幂等。
- **写路径服务端化**（`feat(51)`）：新增 `src/lib/server/adminContent.js` + 4 条路由（`/api/admin/content`·`tier-recipes`·`passive-skills`·`game-rules`，均 createServerSupabase + getRequestUser + isAdmin 三段闸口·列白名单）；编辑器（useContentCrud / EquipmentSeriesSection.saveRecipe / EquipmentPassivesSection / RulesRuleRow）改走 `postGameApi`；读仍走 anon 公开读。
- **零窗口顺序**：先 ship 路由（表未开 RLS 时 service_role 照写）→ 部署验证（4 路由线上 401）→ 再跑迁移。
- **实测验证**：7 表 rls_enabled=true·各 2 策略；anon 写被拒（`new row violates row-level security policy`）；anon 读正常；service_role 写正常。build + smoke ✓。
- **未收（留 phase-52）**：其余 ~26 张 RLS-off 表（shop_catalog/chamber_templates/classes/placement_*/npc_placement_*/fragment_pool/fragment_combos/raid_stats/player_points/room_items/cross_room_probes/br_* 等）+ HIGH 档 authenticated-write 表（buff_pool/equipment_series/equipment_tiers/item_pool/map_config/npc_pool，其写路径亦需一并服务端化）。⚠ contracts/player_contracts（合同已下线·表孤立）可顺带收。
