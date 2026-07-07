# 历史归档(2026-07-07 文档改版前的 hub 内容)

> 🧭 中控段 + 战斗管线世代 + 全部历史索引。只增不改;更早历史 `git show 66bc4d1:Readme_Claude`。

## 最近变更（2026-07-06 / 🧭 主线切换:KALEIDO 规格入库 + 落地核查 + P0/P1 细化设计 + 三轨派单）

> Kanata 交付 KALEIDO v0.3 规格并拍板为核心主线。中控完成:①规格正本入库 ②4 路只读核查(规格 §10 资产映射 ↔ 真实代码逐条对码) ③P0/P1 施工级细化 ④三轨工作包派发。

- **新增 `docs/plan/kaleido/`**:[`00-spec-v0.3.md`](docs/plan/kaleido/00-spec-v0.3.md)(权威规格·逐字正本) / [`01-groundtruth.md`](docs/plan/kaleido/01-groundtruth.md)(核查:§10 映射基本成立;gameEngine.js/evalFormula/persistResolution 收口均实证) / [`02-detailed-design.md`](docs/plan/kaleido/02-detailed-design.md)(六表 DDL·传感层接线·单人化壳·采样器·3 战斗模板×bot·P2 概设) / [`03-track-packages.md`](docs/plan/kaleido/03-track-packages.md)(KP0-S/KP0-C/KP0-X 派单)。
- **核查三大发现**:①单人房今天就能跑(roomState 无最少人数检查·validnum===1 分支齐全) ②**体力系统 wall-clock 违反 R4/R11** → kaleido 模式改回合计数(设计 D3) ③仓库无 LLM 调用/后台任务设施 → P2 新建(行动泵 + Vercel Cron 兜底)。
- **总决策 D1-D6**(02 §0):执行底盘=复用 rooms+gamevars+/game/[id](gametype=`KALEIDO_GAME_TYPE=30`·整数列勘误见 02 §2.1);runs/levels 为域真源;种子关存 content_pool;SQL 走 `scripts/kaleido-*.sql` 独立命名空间;P0/P1 零 LLM。
- **旧线处置**:多人搜打撤/BR/探针维护态;装备金字塔冻结;roadmap 04/05/06 冻结;⚙️P5 暂停;🎨移动化+色板、🔒phase-52 照旧。00-roadmap / 07-parallel-tracks 已挂主线切换横幅。
- 本次未改动任何游戏代码(纯规划轨)。

## 最近变更（2026-07-04 / 战斗管线 P6 四触发事件全部收口）

> 补齐被动触发事件派发（文档 02 §4.3 的 authoring↔runtime 割裂）。**重要前提**：DB 实测 **0/17 tier 绑定 passive_skill**，整个被动系统内容休眠——P6 接线因此**全部中性但当前不可能触发**（补齐是为「日后内容绑定即生效」）。四事件全部收口：

- **on_hp_below_30**（`dispatchHpBelow30` helper·`26566e5`）：玩家受击后 HP 从 ≥30% 跌破 <30% 且仍存活 → `triggerPassives`。无状态跨阈检测（每场从存储 hp 重算·愈后再破自然重触发·持续低于不重触发）。接 4 处受击点：NPC 反击 / PvP 主伤害(守) / PvP 反击(攻) / 探针反击（actOnProbe 补 `loadBuffPool`）。
- **on_turn_start**（`dispatchTurnStart` helper·`d2593dc`）：3 条战斗动作起手对行动方派发（用该动作**已拉取的 `_pass`**·零额外查询·不入 gamevars）。**取代文档 §5.1 的 gamevars 缓存方案** —— 更省、无缓存失效面、且避与 ⚙️ P5 gamevars 瘦身冲突；语义为异步逐动作「你的回合 = 你的战斗动作」。stat_boost 可作用于随后 calcDamage。
- **on_equip**（`d2593dc`）：装备动作 instance select 补 `passive` join + 装备分支一次性派发。**按「一次性」语义**（trigger 标签即「装备时·一次性」）—— 授予的 buff 走自身 duration 自然过期，**无需卸下对称撤销、不改 buff 引擎**（规避文档 §5.6 的对称撤销 bug 风险）。stat_boost 不持久（atk 每战重算）故对 on_equip 无意义，heal/buff 才有效。
- **on_defend**：已由战斗管线防御阶段覆盖（P3 的 `applyCombatPipeline` 收 defender 的 DEFENSIVE_STAGES），无需旁路派发。
- **中性守恒**：0/17 tier 绑定 ⇒ 战斗 `_pass` 恒空 / 装备 `tier.passive` 恒 null ⇒ 四处 triggerPassives 均无命中、helper 短路 ⇒ 逐值不变（守 Phase 37）。`next build` ✓（26 页）。
- ⚠ **被动系统仍内容休眠**：要真正看到被动生效，需先让装备 tier 能绑 `passive_skill_id`（EquipmentSeriesSection/tier 编辑器）+ 录 demo 被动 —— 这是被动系统真正的下一步缺口。

## 最近变更（2026-07-04 / 残片引擎休眠 — 可逆单开关·为残片重做清场）

> 承接三特性剔除，用户拍板：残片发现引擎整体休眠（**可逆**，不删代码不删表），为「残片系统重做」清场。先摸清全部写入路径 + 耦合面再单点门控。

- **单开关** `constants.FRAGMENTS.ENABLED=false`。lore 残片引擎的写入路径只有两条，全门控：
  - `fragments.js discoverFragment`（搜/打/撤三链的单一入口）顶部 `if (!FRAGMENTS.ENABLED) return null`（置于任何 DB 查询前·零开销）——连带 `evaluateFragmentCombos`（combo 写·仅其内部调用）+ coldCases（本就 `COLD_CASES.ENABLED=false` 双重门控）全部不触发。
  - `probes.js`：`defeatProbe` 夺残片 `carry` 视为空（不写 player_fragments）+ `leaveProbe` 新探针 `fragments_carry:[]`（不带残片）。
- **零残片下自洽**（逐点核验）：搜索命中残片带 → 落「没发现有用的东西」（无报错）；三链调用点均 `if (fragment)` 处理 null；结局横幅无残片段（数据空）；探针卡 `fragmentCount>0` 才显「携带/可夺取」（GameClientPage 加门控）；`totalFragmentsExtracted` 数的是 `tech_fragment` **道具**（经济·与 lore 残片无关）不受影响；endings 不读残片数（critic 确认）；loreInjection 走 `decodedFragmentIds`（空 → 无注入）。
- **保留**：`fragment_pool` / `player_fragments` / `fragment_combos` 表与全部残片代码（discoverFragment/combos/coldCases）原样保留 —— 翻 `FRAGMENTS.ENABLED=true` 即整套复活。既有玩家残片数据不动。
- 验证：全仓 grep 确认 player_fragments 四个写手全被门控覆盖 · `next build` ✓（静态页 26 不变）。

## 最近变更（2026-07-04 / 剔除 档案库·纪元档案·合同 三特性）

> 用户指令：把 档案库(/archive) / 纪元档案(/codex) / 合同(contracts) 完全剔除。先经 5-agent 工作流（3 逐特性足迹 + 交叉引用兜底 + 破坏风险评审）映射全足迹，再按删除顺序约束执行。

- **整删 7 文件**：`src/app/{archive,codex,contracts}/page.js` + `src/app/api/contracts/route.js` + `src/app/admin/_tabs/ContractsTab.jsx` + `src/lib/server/contracts.js` + `src/lib/fragmentMeta.jsx`（DecodeBar——archive/codex 是其仅有的两个消费者，删页后成孤儿一并清）。
- **导航/入口**：`layout.js` 删三条 nav；`page.js` 首页个人卡删「进行中合同」Stat + player_contracts 查询（Promise.all 解构同步改 `[stash, profile]` 防 profile 错位）+ 「查看合同」miniLink；`GameClientPage` 结局横幅删「在档案库查看」链接 + 三处「详情见档案库」文案。
- **服务端**：`gameActions.js` 删 `updateContractProgress` import + 7 处 best-effort 进度钩子（search/loot/attackNpc/joinRoom 购买/extract 留探针/extract 撤离）——全 try/catch 包裹，删除不影响主流程。
- **后台**：`NarrativeTab` 去合同子页，默认 section 从 `contracts` 改 `events`（否则空 tab）。`adminNav` 无需改（合同只是 narrative 子路由）。
- **保留（不动）**：残片发现引擎（fragments.js / discoverFragment / fragment_pool·player_fragments·fragment_combos）—— 评审确认删三特性后残片三链、结局 totalFragmentsExtracted、探针夺残片全部自洽；coldCases「悬案」休眠预埋（被 fragments.js 门控引用·ENABLED=false）；DB 表 contracts/player_contracts/fragment_cold_cases 一律保留不 DROP（红线）。SQL 种子脚本（starter-contracts / cold-cases / migration-*-contracts）作历史存档保留。
- 验证：全仓 grep 无 live 悬空引用（剩余均为保留文件注释）· `next build` ✓ 编译成功（静态页 30→26·少 4 条已删路由）。**玩家端 UI 变更需 PRIMARY_ADMIN 浏览器眼校（部署后）**。

## 最近变更（2026-07-04 / 全盘冗余清除 + 文档重拍 + 分支清理）

> 用户指令:「冗余清除 / 删过时说明 / 复查全盘代码 / 重拍 Readme 和 Handoff / 合并清理分支」。3 个只读侦察 agent（死代码/重复/过时文档）+ 人工复核执行。

- **远端分支清理**：删除 **227 条 `*-codex`/revert 遗产分支**（MongoDB/Vue 旧时代·与现行代码库零关联·含 ~35 条未合并但目标代码已不存在）。存活：`main` + `claude/stupefied-varahamihira-999232`（活跃会话·小游戏「参数」）。清单备份 `D:/Fragments/DTSV-cleanup-backup-20260704/deleted-remote-branches-manifest.txt`。
- **本地清理**：移除 3 个死 worktree（ecstatic-beaver / gifted-johnson / vigorous-boyd·未提交改动已存 backup 目录 .patch）+ 删 4 条本地分支（含孤儿 elated-black）；主仓孤儿文件（reports/research 早期 scheduled task 残留副本）备份后删除。worktree 9 → 6（main + 4 轨 + stupefied）。
- **仓库卫生**：`git rm --cached` 误提交的 `.claude/settings.local.json` + 2 个 worktree gitlink（历史 `git add -A` 事故），`.gitignore` 加 `.claude/settings.local.json`/`.claude/worktrees/`（`launch.json` 保留跟踪·预览工具共享配置）。
- **文档重拍**：本文件 3225→精简版（历史索引见下节）；`docs/session-checkpoint.md` 重写为现役 Handoff；删除 `progress.md`（2026-03 GPT 工作日志·彻底过时）；`docs/plan/02` 顶部加 API 勘误横幅（长阶段名/旧签名已过时·以代码为准）；`docs/plan/00` 加状态注记（02 管线 P0-P4.5 ✅ / 01 引擎 ✅ / 03 部分 ✅）；`docs/plan/07` 轨道状态刷新。
- **代码复查结论**：全 src/ 无孤儿文件（3 个"零引用"文件均为刻意预埋·注释可证·保留）；`AdminPageInner` 的 map_config 查询喂 OverviewTab 统计（非死读·保留）；`constants.js MAP_LIST` 加 `@deprecated`（仍被 4 个 admin tab 引用作 legacy 展示·不可删）。**收敛类待办移交对应轨**：色板/样式统一 → 🎨（38 文件硬编码·RARITY_META ×3·BTN/INPUT 私抄）；Supabase 查询整并 → ⚙️ 随 P5。
- 验证：smoke-pipeline 21/0 · smoke-itemcraft 23/23 · next build ✓ 全绿。

## 近期变更索引（2026-06-20 → 07-04 · Phase 43 战斗管线世代）

| 日期 | 内容 | commit |
|---|---|---|
| 07-04 | **P4.5 方向性**：OFFENSIVE(add/mult/seckill)/DEFENSIVE(invincible/special/limit/insurance) 攻守二分收集；special 无公式硬化（防 ev(null)→0 清零）；编辑器标注攻/守方生效 | `c833f25` |
| 06-30 | **P4 authoring**：被动编辑器加 stage/priority/condition_formula 三字段（金额复用 value/effect_formula）；classes.filterPerks 放行 pipeline_modifiers；职业 modifier 双方向收集 | `69c88d4` |
| 06-30 | **P3 全路径接线**：统一 `applyCombatPipeline` 中性闸口 helper；6 处：玩家→NPC / NPC 反击 / PvP 主伤害 / PvP 反击 / 探针双向。空池短路逐字节等价 | `07ee62b` |
| 06-20 | **P2 首接**：玩家→NPC 主伤害进管线（`if(pipeMods.length)` 中性闸口）。⚠ 设计文档 02 的长阶段名/旧签名过时·以代码为准 | `5e534fc` |
| 06-20 | **道具合成链落地**：itemCraft.js 纯函数运行时 + 局内 craftItem 动作 + ItemCraftModal（仅局内·局外用户拍板不做）。浏览器实测通过 | `b69ad82..4535b15` |
| 06-20 | **并行轨道契约**：docs/plan/07 四轨范围/热文件/SQL 号段/推送协议 | `7f1d307` |
| 06-20 | **后台信息架构总检修**：23 横排 tab → 4 组折叠侧栏 17 入口；4 hub 收编（道具/残片/经济/投放）；`?tab=/?section=` URL 深链；SegTabs 去重×4；admin 硬加载鉴权竞态修复（authLoading 门控）。全程浏览器实测 | `b9aa21d..14c8c7c` |
| 06-20 | 入场准备模态加入成功不关闭修复（补 `setJoinLoadoutOpen(false)`） | `aeb0501` |
| 06-15 | **P0+P1**：passive_skills 加 3 列（中性迁移·phase-43 SQL 已应用）+ combatPipeline.js 纯函数 + smoke | `875e4b1` |

> 同期非本轨：小游戏「参数」（nekogames SWF 真值复刻·/parameters 页 + 内嵌 iframe）经 PR #222-#234 由独立会话合入；顺手修复 `/api/br/topology` 构建期缺 env 报错（强制动态·`ce23312`）。

## 历史变更索引（Phase 0-41 · 详情 `git show 66bc4d1:Readme_Claude` 对应章节）

| 日期 | Phase | 主题 |
|---|---|---|
| 06-04 | 40-41 | 全模块大查三波：提速（getRaidLayout memo·不再每动作重拉 item_pool·耐久 RPC 单往返·withRetry 修 stale room）+ 冗余 + 割裂 |
| 06-04 | 37 | 玩家/NPC 统一战斗阶段A：base × 职业乘区 × 装备乘区 · NPC 同构（**中性铁律出处**） |
| 06-03 | 33 | 地图编辑器阶段1：缩圈 count-derived + 快照致死 + 房间编辑器 |
| 06-03 | 30-32 | 虚拟空间·时间跳跃 BR 重建 → 并入 /game（北极星 docs/timejump-br-design.md·BR 阶段人工走查后启动） |
| 05-28 | 28-profile | 个人主页 /profile（立绘+账户集中） |
| 05-12 | 27 | 角色立绘（预设+上传+审核） |
| 05-12 | 26 | 自动化 healthcheck + 外部调研 + scheduled tasks（spec: scripts/healthcheck-spec.md · reports/TODO_AUTO.md 为 P0/P1 队列） |
| 05-12 | 25+25b-25p | 数据驱动平衡：经济版本号/wipe·death log 扩展·探针遥测/通知/匿名化/密度·保险 schema·Streak-breaker·新手 boost·悬案·高危出勤…（大量 ENABLED=false 预埋） |
| 05-12 | 24c | 职业系统（11 职业·3 候选+10% legendary·class_pt 保底·perk 白名单） |
| 05-12 | 24b | 4 类点数经济 + 商店 + 入场购买（PrepareModal 替代 LoadoutModal） |
| 05-12 | 24a | 残片 lore 重写 F01-F15 六纪元 canon + per-player 可见性（替换缺陷的 23） |
| 05-11 | 18-23 | 10 维评估落地 / 肉鸽路径(19) / 知识驱动池(20) / 异步探针(21) / 抛光平衡(22) / 冷启动(23·缺陷) + 天气系统移除 |
| 05-10 | 8-17 | 远星函馆世界观改造：品牌/术语/lore 重写·FX 壁纸·周目系统·Decode Archive·单次袭击战斗模型·物品使用模式 |
| 05-09 | 0-7 | 搜打撤大改造（5 maps → 7 region/35 maps·装备·合同/事件/分支/结局·Ω-段·污染） |
| 03-24/25 | — | 早期修复记录 |
| 03-30 | — | 旧版代码库总览（一~九章·已被本文件「系统总览」取代）+ 原版 ACFUN 大逃杀全量对比 + game.php 实操记录 |
