# 🔧 引擎轨 · 变更日志(倒序置顶)

> 以下历史段由 ⚙️ 游戏性轨(时任引擎职责)交付,2026-07-07 归属移交 🔧。

## 最近变更（2026-07-23 / 🔧 ✅ 条件 A/B + A3 + 字段落点草案 —— E2E 83/83·gate 9/9·build 绿）

- **✅ 条件 A（🧭 审出的静默失效·写进 SQL 注释给 ⚙️）**：我初稿写的「旧 atk/def 列保持原值不动」**是错的**。`ItemsTab.jsx:166-167` 显示的是 `item.atk`（**死列**），补值后「加力件」会同时有 `atk=2`（死列·后台显示它）与 `atk_delta=2`（活列·真生效）⇒ 管理员改成 5 → 界面显示 5 → **实际仍是 2**。已改口径：id32/id33 的旧列**同批归零**（它们在旧列上本就无效果 ⇒ 归零 = 零行为变化）；**id24 结构强化液的 def=50 保持不动**（那是真设计记录·多人存量）。
- **✅ 条件 B（admin 盲区）**：`ITEM_COLS`（`api/admin/item-pool/route.js:11`）补 `atk_delta`/`def_delta`/`max_hp_delta` —— 此前三列**后台既看不到也改不了**（⚙️ 的扩容件 +15 就处在这个盲区）。`ItemsTab` 列表 + 编辑表单拆成「📈 永久增量（真生效）」与「⚔️ 战斗属性（旧列·当前无效果）」两段，死列置灰 + 明写警告。
- **✅ A3（🎨 报）**：`itemPoolPreview.js` 的 kind 选项写死 `weapon/armor/consumable/special`，与当前 6 个 kind **一个都对不上**（除 consumable）⇒ 筛选器筛不出东西。改为从 `ITEM_KIND_META` 同源派生，并把三个 delta 列加进字段表。
- **⚠ 未做浏览器验证（诚实标注）**：admin 页需登录管理员账号，而**输入密码不在我可执行范围内**。本批 admin 改动只有 build + gate 背书，**视觉未验**。请 🧭/🎨 或 Kanata 登录后看一眼「道具池」tab（预期：加力件显示 `ATK +2` 走新列、旧列灰显「ATK(旧) 2」）。
- **✅ 字段落点草案（doc 14·待 🧭 审）**：`uiCommitted`（profiles 写的唯一源·护栏靠命名）/ `uiKnown` / `uiOffered`（对象带 beat）/ `uiHidden` / `uiUnlocks`（投影）+ `profiles.kaleido_step` 独立列。
  - **存档点提交定序**：场景状态 → step → uiCommitted → run 账本；**run 账本最后落**（只有它落了下次才不重复提交）。失败方向**刻意选「宁可重复提交，不可丢」**（前三者皆幂等）。
  - **「step 推进成功但 UI 提交失败」= 接受错位、不补偿** —— §4 已定两者作用域本就该错位，补偿反而制造 step 回滚（而 step 定义是永不回滚）。
  - **信封 `kind` 六值**，不变式：**只有 `unlock`/`hide`/`restore` 带顶层 `ui_key`** ⇒ 叙事类被今天的客户端 `continue` 天然挡住、零改动。⚠ 但 `hide`/`restore` 会被**旧客户端渲染成「获得」** ⇒ **必须与 🎨 的 kind 分流同批上线**（草案里唯一的跨轨同批约束）。
- **✅ doc 13 增补「关上那扇门」样例走查**：七段里**五段在关键路径上且全未落地** ⇒ step1 里程碑从「首次到达某地」改成「关上门」后**重了一个量级**（原来只需位置判定）。`reset_scope` 形状定为**枚举 `'daily'|'permanent'`** 而非可空时间戳 —— NULL 在「未设置」与「永不」之间有歧义，读错就是把存档点锚重置了。

## 最近变更（2026-07-22e / 🔧 ✅ H3 修（铁律路径静默失败）+ 教义不变式门 —— E2E 83/83·gate 9/9·build 绿）

- **✅ H3 修**：`resolveSearchAction` 的「持续效果致死」分支走 `persistResolutionAsync`（DB 写 fire-and-forget，却**立刻返回 version+1 的乐观 room**）⇒ 路由边界的 ui_unlocks persist 拿乐观 version 做 CAS ⇒ 后台写未落即 0 行命中 → `VersionConflictError` → 被吞 ⇒ **解锁不落库、事件不发**。而这正是 06 §1.3 明文要保的那条（首搜当回合致死也必须下发 hp_bar），**且死亡后玩家再进不了 `applyKaleidoPostAction` ⇒ 不可自愈**。
  - 修法：**kaleido 局改走同步 persist**（单人局，异步只省几十毫秒却换来一条不可自愈的静默失败）。多人局逐字节不变。
  - `:3041` 那句「单人局无并发写 → 无版本冲突」在这条路径上本就是错的：**并发写者不是别的请求，是同一请求自己没 await 的那个 promise**。
- **⚠ 负对照两轮，第一版断言是假的（记教训）**：第一版 §⑭ 断言「解锁落库 + 事件已发」，回退修复后**仍然全绿** ⇒ 那版根本没在测 H3。原因：本地后台写通常抢在 CAS 之前落库，竞态偏向成功；H3 的真实暴露场景是 **Vercel serverless 把未 await 的 promise 随函数冻结丢掉**（同 `emitPlayerEvents` 当年要 await 的那条理由）。
  - 重写为**零 await 间隔比对 version**（不经 `act()`，直接 `executeGameAction` 后立刻读库）：同步写 ⇒ 返回 version 必等于库内；异步写那一刻写还在飞。**负对照第二轮成功翻红**（`returned:2 / db:1`）。
  - 原来那两条保留为**不变式守卫**，并在源码里注明「它们的绿不代表 H3 被覆盖」——避免后人误读。
- **✅ 教义硬不变式门**（`scripts/check-doctrine-invariants.mjs`，进 gate 第 2 步）：🧭 指出「没有 gate，§3.3 三条硬约束没有任何东西在守」。
  - **诚实边界**：三条里**现在只有第 1 条（`missCost:'fatal'` 不得 `click`）能真正执行**；第 2/3 条依赖注册表里还不存在的关系字段（`hostGatedBy`/`requires`），I9 依赖尚未落地的剥夺表。**未落地的部分明确报「⏳ 待字段」，不假装在守**；字段一落地自动开始强制。
  - I9 的操作面集合（`search_btn`/`combat_panel`/`move_btn`/`craft_btn`）已写进代码常量。
- **gate 增打自查清单**：把本仓踩过的三个固定模式印在每次 gate 末尾 —— ①单发假设+掷骰=flaky ②写完断言先做负对照 ③绿≠覆盖（E2E 无 profiles 行 ⇒ 账号级持久化历来静默空转）。
- **E2E 79→83**，gate 8→9 步。

## 最近变更（2026-07-22d / 🔧 ✅ 周期保底 + 道具效果链三处 + P0 gate —— E2E 79/79×3·gate 8/8·build 绿）

- **✅ 周期保底（🔴 阻塞 ⚙️ step1 定稿的载重前提）**：`event_deck.guaranteed` 是**每关一次**，而 step1 的卡关场景是**在同一关里无限搜** ⇒ 保底给完一次就不再续（⚙️ harness：N 最坏 25~32 vs 周期保底 40，对 M=21 的余量从 1.9× 掉到 1.2~1.5×）。
  - 新机制：**每 N 次合格搜索必给 1 件**，计数 **run 级、跨关不重置**。
  - **config 播种进 `gamevars.kaleido.cycleGuarantee`**（`startKaleidoRun` 从 `game_rules` 两键读：`kaleido_cycle_guarantee_n` / `kaleido_cycle_guarantee_item`，**默认关**）。不每动作现查 game_rules 的三个理由：①`loadGameRules` 是**进程级全局 memo 无 TTL**（D3 实测），run 中途改规则读不到；②run 自描述 ⇒ 可重放/可离线 sim；③E2E 可直接注入。**⚙️ 开启只需 UPSERT 两行 game_rules，不必改代码发版。**
  - 两个必须的细节：①**先记账再谈发放** —— 本搜若被关内 guaranteed 提前 `return`，这一搜仍要计数，否则周期越走越偏；②判据用 `count - lastAt >= everyN` 而非 `===` ⇒ 被占用的那一搜**下一搜自动补发，不吞**。③配置指向不存在的道具 ⇒ 推进 `lastAt` 跳过本周期 + 告警（不发幽灵物品、也不每搜重试刷屏）；真异常则**不推进** lastAt，下搜重试（保底是载重前提，宁可重试也不能吞）。
- **✅ 道具效果链三处（🧭 派单）**：
  - ① **加力件/加防件是哑的**：`atkDelta`/`defDelta` 只在 `kind==='weapon'/'armor'` 时产，而 `ITEM_KIND_META` **根本没有这两个 kind** ⇒ 死代码；⚙️ 的件是 `consumable`+`atk=2` ⇒ `calcItemEffect` 全零 ⇒ 所有日志块跳过，**但末尾 `removeInventoryItem` 无条件执行** ⇒ **道具没了、属性没变、日志一个字没有**。修：加 `atk_delta`/`def_delta` 扁平列（kind 无关），**置于 kind 分支之后并用 `+=`**（不覆盖死分支将来复活时的算值）。**DDL 已写好但按流程未跑**（`scripts/kaleido-item-atk-def-delta.sql`，待 🧭 审 + 转 🔒）。引擎读法防御式 ⇒ 代码可先上、列后建、⚙️ 再补值，三者无先后依赖。
  - **否决「按现有 atk/def 字段驱动」**（🎨 提议）：实测全库 `atk<>0 OR def<>0` **只有 3 行**，其中 **id24 结构强化液是多人存量道具**（consumable·def=50·当前恒哑），按字段驱动会让它**突然生效** ⇒ 破多人零变化铁律。加列则**中性是结构上不可能被破的**，而不是靠「我数过只有 3 行」的审计结论。
  - ② **`CRAFT_MATERIAL_KINDS` 根因不是少写一个字符串**：注释写的口径一直是「非 consumable 即材料」（排除式），实现却是**正向白名单** ⇒ **每加一个 kind 就静默漏一次**（这次是 `material`，下次还会有）。改回排除式 `isCraftMaterialKind(kind) = kind ∉ ['consumable','equipment']`，新增材料类 kind 自动被认。
  - ③ **material 点「使用」直接 throw**（此前 = 静默销毁）。`inspect_*` 模式不受影响（在效果链前 return）。
- **✅ P0 gate（🧭 批准并提优先级）**：本仓**没有 CI**，`npm run smoke` 只跑一个不碰 kaleido 的脚本，6 个 `smoke-kaleido-*` 与新检查**零 runner 引用** ⇒ 所有「门」都是「靠人记得跑」。新增 `npm run gate`（`scripts/gate.mjs`）串起 8 步。
  - 其中 `scripts/check-ui-key-parity.mjs` 是**跨栈一致性门**（服务端注册表 ⟷ 客户端 `UI_KEYS`/`REVEAL_ORDER` **双向精确匹配**）。⚠ 🧭 说「🎨 已经写好了，收编即可」——**实测仓库里没有这个脚本**（`2a36851` 只改了 4 个源文件），故自写。**做了负对照**：摘掉 `REVEAL_ORDER` 里一个 B4 键 → FAIL 且指名 `loadout_panel`，还原 → PASS ⇒ 证明它确实抓得到 BUG-2 那个形态。
- **E2E 68→79**：+§⑫ 周期保底五条（未配置无键 / 第 N 搜必给 / lastAt 推进不连发 / 未到周期不给 / **跨关不重置**）+§⑬ 道具链六条（material 被拒且**道具还在** / 排除式判据三条含「未来未知 kind 自动算材料」/ atk_delta 列状态登记）。

## 最近变更（2026-07-22c / 🔧 ✅ 账号集 fail-closed 修（自查出的数据丢失级 bug）—— E2E 68/68·build 绿）

> 来源：教义(doc 11)架构评估的地面取证顺带查出的**现网 bug**，与教义本身无关，独立修复先行。

- **🩸 Bug：一次 profiles 读抖动会永久裁小老玩家的账号解锁集**。链路：`startKaleidoRun` 读 `profiles.ui_unlocks` 失败 → 回落空集 → 本 run 的 `uiUnlocks` 只剩 `['search_btn']` → `applyKaleidoPostAction` 对该列是**无条件全列覆盖写**(`merged = 本 run 集 ∪ 新键`) → 老玩家账号集被覆盖成「种子 + 本 run 那 2-3 个键」，**不可逆**。
  - **更糟的一层(我自己写错的)**：supabase-js 是**返回** `{data, error}` 而非 throw ⇒ 原来的 `try/catch` 只兜网络级异常，**普通查询错误连日志都不打**，静默回落。
- **修 = fail-closed**：显式接 `error` → 标 `gamevars.kaleido.accountReadFailed` → 该 run **跳过 profiles 写**（房内解锁照常推进、事件照发，只是不落账号列；下个 run 读成功即自然恢复）。「行不存在且无 error」= 新玩家正常态，**不算失败**，照常可写。写入侧也补了 `error` 显式接收（原来同样静默）。标记走**条件展开**，正常 run 的 `kaleido` 块逐字节同旧。
- **E2E 65→68**：+§⑪ 三条（正常 run 不带标记 / 标记态下房内解锁仍推进 / 标记态下事件照发）。**诚实标注可测性边界**：E2E 用纯内存随机 uid，而 `profiles.id` 有 FK → `auth.users`，故**无法构造真 profiles 行** ⇒ 账号列的写/不写没有自动化网（需 🔒 裁 E2E 能否碰 auth 表）。§⑪ 只钉「不误伤 + 不阻断」两件可测的。
- **补修二（🧭 教义 11 §3.1 对抗验证指出，我复核属实）· update 匹配 0 行也算成功**：`.update()` 不带 `.select()` 时 supabase-js **不 reject、error 为 null**，⇒ profiles 行不存在时账号持久化**静默空转**。已加 `.select('id')` + 0 行告警。**实测结论(打脸但必须记)**：E2E 用户全都没有 profiles 行 ⇒ **账号级持久化在历次 E2E 里从未真正执行过**，Commit B 当时「E2E 验证通过」只覆盖了房内镜像那一半。与 H4 结论一致。
- **顺手修掉一个潜伏的 flaky gate（§④ LW-3）**：该节只发**一次** `attackNpc` 就断言 wave-1 已死。但 D5 seed 化后命中仍是 per-run 掷骰（命中率 0.85）⇒ 约 **15% 的 run 会因首击 miss 翻红**（本次实测撞上）。改为最多 4 击的有界循环（全 miss 概率 0.05%），连跑 3 次 68/68。**这类「单发假设 + 掷骰」是本仓 flaky gate 的固定模式，§③ 那次也是同一类。**

## 最近变更（2026-07-22b / 🔧 ✅ maxHpDelta 钩子 + B4 nar_line 接线 + 终态分支钉死 —— E2E 65/65·build 绿）

- **✅ maxHpDelta 钩子（🧭 裁决 a·解 ⚙️ 扩容件与 08 §4 战力预算）**：
  - `calcItemEffect` 加 `maxHpDelta`（**扁平值·不走公式**，同 `stamina_restore` 家族的防御式读法 `Number(item.max_hp_delta) || 0`）；`resolveUseItemAction` 加分支 **maxHp 与 hp 同量抬**（09 §4「+15 并补满」）。
  - **列名裁定 = `max_hp_delta`**（⚙️ 在 `scripts/kaleido-d6-economy-content.sql:20` 等这个确认）。理由：本值不走 `*_formula`（与 `heal`/`atk`/`def` 不同族），且 item 行上的裸 `max_hp` 会被误读成「道具自身的 hp」；与引擎字段 `maxHpDelta` 1:1。**列已建**（`scripts/kaleido-item-max-hp-delta.sql`·加列 + NOT NULL DEFAULT 0·幂等·已应用并查证）。⚙️ 只差一行 `UPDATE item_pool SET max_hp_delta = 15 WHERE name='扩容件'`。
  - **两个自己加的守卫**：①放在 `hpDelta` **之后** —— 治疗那步按**旧** maxHp 夹紧（`me.maxHp` 含装备加成），扩容再抬底，语义不串；②`alive !== false` 门 —— 否则被本道具打倒的玩家 hp 由 0 抬回正数 = **静默复活**。
  - **无重复吃增益**：consume 路径末尾必扣库存；`inspect_keep` 在效果链前就 return。**多人局零变化**：存量行该列全 0 ⇒ `result.maxHpDelta=0` ⇒ 分支不进入。
  - **副产**：B4 `loadout_panel` 的「持久 stat 件」支**由此变为可达**（`statGained` 检 maxHp 抬高），§⑥ 记录的 gap 现只剩 atk/def 支（consumable 的 def 仍被 `calcItemEffect` 忽略）。
- **✅ B4 三条 nar_line 接线（📖 `88d6694` 供稿）+ 两条 blocking 警告照办**：
  - 三条按 N3 §1 表**逐字**入注册表。⚠ 它们仍是「——已开放:X」宣告式，而教义 11 §2 已**禁用**该句式 → 📖 将在去宣告化批次重写。**判定逻辑零依赖文本**（`match` 不读 `nar_line`，下发只经 `buildUnlockEventsPayload` 透传）⟹ 届时只换字符串。
  - **警告 1（before 锚点）**：`convergence_preview` 的 before 锚**切收敛页之前**，不是 boss 开打前 —— 与 `hp_bar`/`rules_card` 的 before 语义不同、禁止类推。已加 `precedes: ['收敛页']` 把锚点**当数据下发**给 🎨（而非只写注释）。
  - **警告 2（终态分支）**：核对现判据 `clearedSeq 达末关` **天然**满足「只有通关授予首次解锁」：abandon 走 `abandonKaleidoRun` 不动 `clearedSeq`；死亡不过关故不进位。**不是碰巧对**——E2E §⑨ 把 `clearedSeq` 顶到 4/5 再分别走 abandon / 死亡两路径钉死，若判据被误写成「run 收束」必翻红。
- **E2E 56→65**：+§⑨ 终态分支四条（abandon 不触发 / abandon 前正常解锁仍在，证明通道非哑火 / 死亡不授予 / 通关路径 timing=before）；+§⑩ maxHpDelta 五条（列存量为 0 / maxHp+15 / hp 同量+15 / 道具被消耗 / loadout_panel 解锁）。**两节都用「临时改数据→finally 还原原值」**，不靠随机。
- **🔧 工具链修**：新增 `scripts/tsconfig.e2e.json`，跑法改 `npx tsx --tsconfig scripts/tsconfig.e2e.json scripts/kaleido-e2e.mjs`。此前每跑一次 E2E 要在**仓库根**建临时 `tsconfig.json` 再删——忘删会被 `next build` 接管并强改 `moduleResolution`，导致 `build/sites-vite-plugin.ts` 解析 `vite` 类型失败而编译红（本次实测踩到）。专用文件放 `scripts/` 下，Next 不会读，**footgun 消除**。

## 最近变更（2026-07-22 / 🔧 ✅ D3 逐关规则覆盖 + legacy battle 软锁根治 —— E2E 56/56×3 连绿·build 绿）

- **✅ D3 mergeGameRules 落地（🧭 解冻令放行）**：seq3-5 规则关的逐关覆盖链打通。
  - 新纯模块 [kaleido/rules.js](src/lib/server/kaleido/rules.js)：`mergeGameRules(global, envRules, formulaOverrides)`；白名单 `FORMULA_OVERRIDE_KEYS = {damage:[damage_formula,atk_base_multiplier], defense:[def_base_multiplier], crit:[crit_rate,crit_multiplier]}`，名单外键静默忽略 + warn。
  - **接线三处**：`chamberToNode` 带 `kaleidoEnvRules/kaleidoFormulaOverrides` 到运行时 node；`sampleRun` seedMatch 取 `payload.env_rules/formula_overrides`；`buildLevelRows` 由 node 写回 levels 行（**此前恒空 → 作者写的覆盖等于丢弃**）。消费点 = `resolveNpcAttackAction`（战斗结算前合出本次 rules）。
  - **⚠ 派单更正（实测·已报 🧭）**：原派单要求「入关 `clearRulesCache` 调用点」——**实测错误，未采纳**。`loadGameRules` 是**进程级全局 memo 单例**（gameEngine.js:19·无 TTL·kaleido/多人/admin 共享同一对象身份），而逐关覆盖来自 **node（内存）不来自 DB**：清缓存不会带来逐关值，只会造成**跨房全局副作用**（所有房下次重查库）。改为「每次消费合出新对象、绝不写回 `_rulesCache`」；无覆盖时**原样返回同一身份** → 未覆盖关/多人局零拷贝零变化。
- **✅ legacy `battle` 软锁根治（本次真正的收获·E2E §③ 偶发红的真因）**：
  - **症状**：D3 期间 E2E 由 48/48 掉到 49/53，4 红全在 §③(hook① 种子掉落)，且**两次红的形态不同**（一次 0 件、一次 1 件），随后 3 次复跑又全绿 —— 典型 flaky gate。
  - **定位**：加 env 门控探针打 drain 前置条件 → 逐条排除（种子内容未变/node 携带 deck 正确/item_pool id 全在/查询无错），最后定位到 drain **上游**：事件系统 `on_search` 的 `spawn_npc`/`trigger_battle` 效果会置 `player.battle`（legacy 字段），而 `resolveSearchAction` 在 `if (afterEvent.battle)` 处早返 —— **kaleido 无人消费该字段**（战斗走 encounter），置位后**此后每次 search 全部空转**：hook① guaranteed 哑火 + 零产出 + 「残响扑了过来」却无敌可打的幻影叙事。**这是 LW-1 同级软锁，不是测试问题。** 触发条件 = 采样关 templateId 落在 2/3（event_pool id 2/4/5 挂刷怪效果）→ 随房随机 ⟹ 偶发红。
  - **修**：①**源头**（events.js·`processEventTrigger`）kaleido 候选集**整条排除**含 `spawn_npc`/`trigger_battle` 的事件（整条而非只跳效果：否则留幻影叙事）；②`applyOneEffect` 同类效果加 kaleido 空转双保险；③`resolveSearchAction` 兜底：kaleido 局遇脏 `battle` **清字段续算**而非早返（兼容已被历史局写脏的存量房）。
  - **多人局逐字节不变自证**：`context.kaleido` 仅由 3 个 kaleido 调用点传 `isKaleidoRoom(room)` → 多人恒 false，候选集/效果/早返分支全走原路径；smoke ✓ + build ✓。
- **E2E 扩到 56 断言**：+§⑦ D3 五条（纯函数四条：无覆盖同一身份/env 生效不污染原对象/白名单内生效/名单外忽略 + 集成一条：注入 `crit_rate=1,crit_multiplier=10` → seq2 wave-1 一击毙）；+§⑧ 软锁三条（**注入脏 battle** 确定性复现：清字段不早返 / 脏态下 guaranteed 仍投放 / 连续动作后不再被事件重新置位）。**连跑 3 次 56/56**（原 flaky 场景）。
- **待办/在途**：📖 欠 B4 三 nar_line（`loadout_panel`/`prep_readout`/`convergence_preview` 现为空串占位）；⚙️ `prep_readout` 数值口径已给待接；**`stance_duel`(seq3) 自带 `hit()` 不读 game_rules ⟹ 逐关 damage 覆盖在该关静默不生效**（已报 🧭·D3 边界）。

## 最近变更（2026-07-08 / 🔧 ✅ hook① 内容注入消费器落地 —— AVG A1 阻塞已清·E2E 36/36·build 绿）

- **✅ hook① 上 main（`e97c91d`）**：AVG 垂直切片(10-avg)唯一阻塞 A1。5 件 + 校验:
  - **event_deck item_find 排空**(resolveSearchAction·isKaleidoRoom 门·1/search front-load·guaranteed 硬保证·consumedEventDeck 存 `gamevars.kaleido[chamberIdx]`·item id→name 查 item_pool·命中即 return)。
  - **hook④ 零随机刷怪**(npc-spawn gate `:1411` 加 `&& !isKaleidoRoom(room)`)→ 战斗敌只从入关注入·seq1(start·无 move-in + 无 combatSetup)零战斗。
  - **非 boss 入关注入**(movePlayer `:3488` boss 块泛化到任意 `nextChamber.kaleidoEnemy`·level 取 `ke.level`·`isBoss = archetype==='boss' || ke.level==='boss'` → 强制 boss level 保 bossDefeated/boss_kill 链)。
  - **推进层重锁泛化**(advanceKaleidoProgress `:2734` boss 重锁扩到 `node.kaleidoEnemy && mode≠stance_duel && !encounter`·find by `mapId===templateId && hp>0`·usedChambers 保唯一无碰撞·stance_duel 由 LW-2 lock-until-death 自管排除)→ 弱敌可打完不遗弃半血。
  - **hook⑥ `validateSeedLevel`**(runs.js·非致命 warn):boss_kill 缺敌 / guaranteed 超预算(#guaranteed ≤ survive_turns−(非首关 1))。`.eq('enabled',true)` 确认已在 `:2616`。
- **验证 E2E 36/36**(30 回归零破 + §③ 6 新)：§③ 临时点亮 d6-seq1/2(id 2,3)→ 实测 guaranteed 硬保证(seq1 背包+2=id27+id13)/ seq1 零战斗(无 fight_start·attack@seq1)/ consumedEventDeck 记录 → finally 恢复 enabled=false;postgres MCP 查证五关全 false 无残留。build ✓ 绿。多人局中性(全 isKaleidoRoom 门·回归 boss_kill 链不破)。
- **交接 🧭**：seq1-2 已永久 enabled=true(🧭)→ 启用态复跑 E2E 36/36 四点全过(search 计数对齐/guaranteed 活流成立/seq1 零战斗/boss_kill 不破)。**自查修 `fa4fb2e`**:§③ finally 硬编码 enabled=false 会覆盖永久态 → 改「捕获原 enabled 逐 id 还原」(postgres 查证 seq1-2 仍 true)。撤=收敛(extractPlayer 保持 throw·Kanata 拍板)。
- **✅ craft_btn 接通（`aed7b6c`·E2E 38/38·🧭 信号·排 LW-3 前）**：AVG 链「搜→物品→物品栏→合成」完整。口径查证 recipe 表全空 → 按 kind 判材料:`CRAFT_MATERIAL_KINDS=[tech_fragment,platform_part,omega_matter]`(id13/id14=tech_fragment)。hook① drain 搜到材料置 `player.hasCraftMat`(单调);`craftMatGained = after∧!before`(首获材料转变)→ craft_btn 解锁一次。实测 seq1:搜1→log/inventory/hp·搜2→**craft_btn**·清关→move。
- **✅ LW-3 gauntlet 波次落地（`074049c`·E2E 43/43·build 绿）**：裁决 C·07 seq2 首战 2 波完整性。推进层波次编排(advanceKaleidoProgress relock 块扩):gauntlet 关当前波敌死(无活实例)∧ curWave<wavesTotal → 生成下一波(base×enemyScale^(wave-1)·waveHeal clamp maxHp)+ 重锁;波敌走 attackNpc 富战斗路径(裁决 C);exit 仍 survive_turns(波=内容非门);movePlayer 入关 gauntletWave=1。E2E +5(seq2=gauntlet waves≥2/入关 wave-1/杀 wave-1→wave-2 生成+重锁/wave-2 缩放/wave-1 死)。软锁排除:curWave<wavesTotal 封顶·survive_turns 恒收·search-while-encounter 不锁·isKaleidoRoom+template_ref 双门(多人/非 gauntlet 零变化·回归 38/38)。
- **✅ D5 R1 战斗 seed 化落地（`bd29d02`·E2E 44/44·build 绿）**：现 kaleido 战斗走 Math.random 违 R1(P1 闸门「同 seed 回放一致」前提)。resolveNpcAttackAction 顶构 `krng = mulberry32(hashStr(runId:chamberIndex:turnCount:atk))`(每攻击唯一流·内多 roll 顺序步进);5 处战斗 Math.random→rnd()(playerHit/counterTriggered/npcHit/fragment)+ calcDamage 暴击(gameEngine.js 加可选 rng 参·玩家攻击&NPC 反击两处传 krng)。**多人局 krng=null→Math.random 逐字节不动**(isKaleidoRoom 门+calcDamage rng 默认 null·PvP/多人 PvE 不传参零变化);search 路径 Math.random 不在战斗 scope。E2E +1=同状态×2 重放 6-attack 高熵序列(跨 wave 死+累积 crit/counter)逐字节一致。mulberry32 复用 br/forbidden 既有 import(避重声明)。
- **垂直切片引擎侧 + R1 全清**：hook① / craft_btn / LW-3 / D5 全 ✅（E2E 44/44）。**唯余 D3 mergeGameRules**——按 🧭 令**缓到 Kanata 手感/全量拍板**(服务 seq3-5 规则关·seq1-2 env_rules/formula_overrides 都空不涉及)。
- **⏸ 全轨待命（2026-07-16 · 🧭 令）**：所有轨在 Kanata 手感门前停。**D3 + seq3-5 全量引擎影响面「先别研究」**(🧭 明令·避免方向若变白做)。本轨**零欠账·歇着待命**,手感拍板后 🧭 给 seq3-5 全量/调整信号再动。恢复第一步:rebase + 读本条 + 03/07 手感相关新段。
- **📌 GPT 分支 + 定位（🧭 先误后正·以 10-avg §5 为准·main=`5317110`）**：GPT 在 main 推了一批(登录直进 /play + 解码转场 + 渐进 UI + 改名「远星」+ 构建栈 Next14→16 vinext/Vite/CF Worker)。**Kanata 定位(生效)**:主线 = **我方六轨·部署走 Vercel**;**GPT = 分支同步开发,其实现是「参考样板」,不交出任何域所有权**;**呈现层仍归 🎨**(以复刻 GPT 操作流/呈现为目标,在**我方主线**实现,接**我方 ui_unlocks 真数据**);引擎(ui_unlocks/种子关消费器/战斗/seed)仍 **🔧**(GPT 未碰·继续供给)。
  - ⟹ **06 契约消费方 = 我方 🎨 的实现**(非 GPT 的 KaleidoAvgView)。契约(`players[uid].uiUnlocks` 常驻集 + `unlockEvents` 信封)仍是接口真源;扩 ui_key 走我方内部协调。
  - **我方独立核验(非听信)**:`git diff 3387077..HEAD -- gameActions.js kaleido/ gameEngine.js kaleido-e2e.mjs` = **空** → hook①/craft_btn/LW-3/D5 全完好。
  - **E2E 安全网核验**:干跑 import 链(tsx·**无需 npm install**)= `IMPORTCHECK=OK`(supabase/四引擎入口/isKaleidoRoom/注册表 10 键全可加载)。**`kaleido-e2e.mjs` 是 node+tsx 直驱、绕过 next/vinext → 安全网独立于构建栈**,换栈不影响。
  - ⚠ **`next build` 自证路径受影响**:main 上 package.json 现为 `vinext dev/build`(next 16.2.6 + vinext 0.0.50),**构建栈/部署走向 Kanata 未定**(§5.2·很可能改回 next/Vercel)→ 跑 build 前先看 package.json 现状,**别白装**。
  - ✅ **澄清(我方查证·已报 🧭)**:🧭 曾记「GPT 改了 Claude/engine/log.md 3 行」——**实为误记**。`git log 97e95bd..b78ec93 -- Claude/engine/log.md` 唯一命中 = `3387077`,**是我自己的待命锚点提交**(我的 Co-Authored-By·diff 即我那次编辑);该区间含我方自有提交故被连带归因。**GPT 未碰本轨 log,无对称铁律事件**。

## 研究简报（2026-07-08 / 🔧 · ui_unlocks 支撑 AVG 渐进披露引擎可行性 —— 🧭 命题·已 send）

> Kanata AVG 愿景(登录直进 run·初始仅搜索按钮·每搜一次系统一件件浮现·「UI 即进度」)引擎可行性研究。3-reader workflow(w4eq8cw2p·Q2/Q3 绿·Q1 schema 超限我手补读 KaleidoRunView)。**总判:ui_unlocks 正是这个愿景的引擎,核心循环已架构性实现。**

- **Q1 ui_key 覆盖 + 缺口**：11 ui_key **完全覆盖当前 kaleido UI 面**(关卡头/回合计数/HP/规则卡/战斗面板/三态/搜索/前进/合成/背包/日志·KaleidoRunView.jsx 逐件 RevealSlot 门控)。**缺口**:①「撤」(extract)——kaleido 无撤离(用 run 收敛),extractPlayer 对 kaleido throw(:3980)·无 ui_key/按钮 →「搜打撤」的撤=收敛(已覆盖)还是要中途主动撤(新功能)? **设计澄清问 Kanata**;②未上屏系统(污染/Ω/残片/buff/立绘)kaleido 全不渲染——「整套」若要它们长出来 = 各加 1 ui_key(同 pattern·trivial);③convergence 是终态非解锁物(非缺口·spec 已标)。
- **Q2 登录直进 run = yes·小工程**：startKaleidoRun 已幂等(active 续/ended 自动新)·自动进入原语已存在(handleKaleidoRestart / rooms 出勤卡)。改 = 登录后 redirect 到新 /play 路由(调 /api/kaleido/run → /game/[id])。工程:login/page.js:32 `router.push('/')`→/play(trivial)+ 新 /play 页(small·含 loading/error/30s 冷却/空模板兜底)。**风险**:①勿挂 RootShell onAuthStateChange(全局 fire·会劫持 admin/stash 导航)②冷却/空模板 throw 需优雅兜底③多人/admin 逃生(留 Nav 或豁免)④可选 full-bleed 去 Nav chrome。
- **Q3 动作渐现 = yes·已实现**：客户端 RevealSlot(show=isUnlocked(key)→未解锁不产 DOM)已门控每颗动作按钮;新 run uiUnlocks=['search_btn']→仅搜索显 →「初始仅搜索按钮」**已成立**。动作→ui_key 干净(attack→combat_panel/move→move_btn/craft→craft_btn/useItem→inventory/stance→stance_ui)。**缺口**:服务端 dispatcher **unlock-blind**(:3332 纯 action 串路由·「不出现」仅客户端保证)→ 可选 defense-in-depth 服务端解锁门(small);emergencyRetreat 未 kaleido-gate(:4227·API 可达无按钮)→ trivial 补 gate。
- **效果结论**:愿景**已架构性实现**(ui_unlocks+KaleidoRunView 已交付「搜索起手→系统按解锁渐现」核心循环)。补全 = 登录直进(小)+「撤」语义定夺(设计)+ 可选 N 个新 ui_key(污染/残片…若扩)+ 可选服务端解锁门。**无阻塞级引擎缺口·全部 additive**。

## 工作包设计捕获（2026-07-08 / 🔧 · hook①③④+LW-3+D5 · 两 workflow 全测绘后的可续实现蓝图）

> ui_unlocks 全链闭合后转工作包。两轮 seam-mapping(wk93hy7qx gauntlet·w0iysva08 searchArea/注入/RNG/placement)完成 + D6 五关真数据查证(content_pool id2-6·⚙️ 已应用我全部修订:npc_encounter 去冗余·boss 乙值 260/34/8·seq1 无 combatSetup 键)。**下面是可直接开工的实现蓝图。**

- **提交切分**：
  - **C1(安全核·解锁链解阻·零软锁·先做)**：① hook① item_find guaranteed 排空(resolveSearchAction·isKaleidoRoom 门·1/search front-load·consumed 存 `gamevars.kaleido.consumedEventDeck[chamberIdx]=[已消费 index]`·item id→name 查 item_pool) ② hook④ kaleido 搜索零随机刷怪(npc-spawn gate 加 isKaleidoRoom skip·kaleido 战斗敌只从 combatSetup 入关注入·非搜索随机) ③ hook⑥ 校验(boss_kill 缺 combatSetup.enemy 拒 + guaranteed 预算不变式 `#guaranteed_item ≤ 可用 search 数`)。**E2E**:临时点亮 d6-seq1/seq4 → 断言 guaranteed 掉落序 + inventory/craft_btn 解锁 + seq1 零 fight_start。
  - **C2(战斗注入·设计有 nuance)**：非 boss combatSetup.enemy 入关注入(镜像 boss `movePlayer:3488`,扩 encounter/elite/resource) + gauntlet LW-3 波次编排 + **survive_turns×encounter 交界解析**。
  - **C3**：D5 rich-path seed 化(6 Math.random sites)。
- **seam 锚点(w0iysva08)**：
  - inventory-add = `gameActions.js:1573`(`[...polluted.inventory, ...addedEntries]`)·item=item_pool.**name 字符串**(非 id→需查 item_pool)。
  - npc-spawn gate(hook④)= `1411`(`roll<npcChance && bundle.npcPool.length>0`)+`1437`(pickOrSpawnNpcInstance)→加 isKaleidoRoom skip。
  - chamber 取 = `getCurrentChamber(gamevars,player)` roomState.js:249 → node.kaleidoEventDeck / node.kaleidoEnemy。
  - boss 注入(C2 镜像)= `movePlayer:3488`;boss relock=`advanceKaleidoProgress:2734`;encounter step5 无条件清=`attackNpc:2039`。
  - consumed 存 `gamevars.kaleido`(非 players·per-run;normalizeGamevars 透传·读时 `|| {}` 兜底)。
- **⚠ survive_turns×encounter 关键事实(softlock 分析)**：`evaluateExitCondition(survive_turns)` 只读 `turnCount≥turns`·**不管 encounter**(w0iysva08 map B)→ 清 encounter 不阻过关,∴ 非 boss survive_turns 关注入 encounter **不硬软锁**(搜索推 turnCount 即过);但注入后 step5 清、非 boss 无 relock → 再 attackNpc 报「无目标」(非软锁·可搜索兜)。**C2 待定(逐条推演 + 可能问 ⚙️/🧭)**:relock 语义分档——boss=relock(现有)·elite/stance_duel=LW-2 lock-until-death(seq3·:1752)·gauntlet=LW-3 波次管(seq2)·resource/standard 弱敌可不 relock;且 gauntlet survive_turns 是否强制打完波次(vs 搜索 past)= 玩法设计问 ⚙️/🧭。
- **D5 6 sites(C3·isKaleidoRoom 门·mulberry32(hashStr) 复用·seed=runId+chamberIndex+turnCount+seq)**：`gameActions.js:1841`(playerHit)/`1990`(counterTriggered)/`1993`(counterHit)/`1954`(fragment drop)+`gameEngine.js:89`(crit·calcDamage·被 player→npc 1859 & npc→player 1998 双调用→一 PRNG 流串)+`combatModes/index.js:157`(stance·已确定性 stepRng·不动)。PvP resolvePlayerAttackAction:2060+ 也用 calcDamage(多人·不 gate·零变化)。
- **已答 ⚙️(09)**：atk/def 持久强化件现成(resolveUseItemAction:2321/2326 直改 nextPlayer·非 buff);maxHp 需加 `maxHpDelta` 钩子(calcItemEffect + :2296 后分支)——我可接。staminaDelta 已 `!isKaleidoRoom` 排除。
- **待接(工作包内·排 hook① 后)**：跨 run 继承 E2E(专用 E2E-* auth 用户·固定 UUID·跑前 reset ui_unlocks='[]'·绝不碰 4 真人·断言后 🔒 复核签 ui_unlocks 关链)。

## 最近变更（2026-07-07 / 🔧 · step 0 里程碑通过 → KP1-E 增补工单(推进层 payload 消费统一化)）

- **✅ Commit B 落地 —— ui_unlocks 全链闭合**（`6128411`·E2E 30/30·build 绿）：🔒 已执行 DDL+列级守卫(b4502b0·3 探针通过)后接账号持久化——startKaleidoRun 读 profiles.ui_unlocks 种子(service_role·缺行回落 UI_SEED)；applyKaleidoPostAction 解锁时 merged 单调全集写回 profiles(过守卫白名单·失败不阻断)。跨 run 继承真验 = 🔒 step④(合成 UUID 无 profiles FK 行·E2E 测不到·已报 🧭 调 🔒)。**接口形状→运行时机制→账号持久 三段全闭合**，仅剩 🔒 step④ 签字。
- **✅ nar_line 全角同步**（同 6128411 前一 commit）：8 条半角标点→全角逐字取 N3 §1(36a17c1)·supersede a85bc73;全角=逐字一致规约(🎨提议🧭批),以后取稿以 N3 §1 最新表为源。
- **✅ 回执**：hp_bar nar_line 定稿同步(全角)；敌名不回落 npc_pool 实证(boss 分支 ke.name||'首领'·normalizeNpcInstance 零 DB 查)已答 🧭 转 📖/⚙️；payload 批复+敌人单一来源修订已转 ⚙️(出 seq3-5 SQL)。
- **✅ step 0 里程碑通过**（🧭 裁决）：06 契约(ef726b7)+§8(a06b468)+Commit A(ec38ed6) 收讫;🎨 已集成(50a9ec2)+ D2 unlockEvents 消费 landed(cdcb107)。我的方案 supersede ⚙️ 提案。nar_line 存储裁定=**方案 A(引擎内联)**(uiUnlocks.js 📖 供稿逐字·P2 迁 content_pool);hp_bar 首搜批准;命名坑广播(node.**kaleidoMode** 非 combatMode·我已用对)。
- **⚠ 范围变更（🧭 裁决）**：LW-3 并入 **KP1-E 增补工单 = 推进层 payload 消费统一化**(⚙️ 抓到阻塞缺口:event_deck 零运行时读者·非 boss 敌人注入缺失 → 种子关 inert·inventory/craft_btn 解锁链断)。工作包 = ① event_deck 掉落消费 + 非 boss combatSetup.enemy 注入(镜像 boss 3404)② craft_btn 状态检查(已在契约)③ gauntlet 波次编排(LW-3 本体·推进层·D5=乙 富路径 live-wire)④ seq1 零战斗(安全首战法则)⑤ boss 缺 combatSetup.enemy 校验挡板 ⑥ enabled 过滤(已满足·runs.js:2615)。E2E 增「保底掉落 + 首战安全 + seq1 零战斗 + raid_stats 清理」断言。
- **✅ 前置动作:07 §0.3 payload 形状批复=通过 + 1 结构修订**(已 send 🧭 转 ⚙️)。核实可消费(runs.js:178-189 落 node.kaleidoEnemy/kaleidoEventDeck)。**修订**:combatSetup.enemy = 权威战斗敌(入关注入·镜像 boss·gauntlet 用作 wave-1 base + params.waves);event_deck 只消费 item_find;请 ⚙️ 移除 seq2/3/5 的 npc_encounter 冗余(否则双刷)。⚙️ 可出 seq3-5 SQL(enabled=false·boss 用乙值)。
- **LW-3 gauntlet 理解(wk93hy7qx·4 map)**：gauntlet 模板 resolveTurn **自带波次逻辑**(combatModes/index.js:116·敌死∧有余波→scale^(w-1) 造下波+waveHeal 续) = **离线 bot sim 路径**;裁决 C 的 LIVE 路径 = 推进层编排富战斗(D5=乙),**不走** resolveTurn。软锁点:advance 重入需先 reset wave/enemy/outcome 才推进,否则 resolveTurn 早返回不变态。gauntlet 未接 live(attackNpc 只有 stance_duel 分支 1822·零 gauntlet 分支)。
- **🔒 DDL(31f5265)**：列级守卫方案已接受(BEFORE 触发器令 ui_unlocks 客户端不可变·kaleido-ui-unlocks-guard.sql);createServerSupabase()=service_role 确认过守卫;06 §4 已更正(public-read 非 owner-read·案②)。执行顺序 🧭 定(🔒 exec DDL+守卫 → 我 Commit B → 🔒 复验),待 🧭 令。
- **下一步**：实现增补工作包(hook ①③④ + gauntlet LW-3 + seq1 零战斗 + boss 校验)——软锁风险类(遭遇/体力/lifecycle 逐条推演),机制对 sampled 关即可 E2E 测(不必等种子关 enable);改状态机必跑 kaleido-e2e。D3/D5 顺延。Commit B(账号持久)待 🧭 DDL 执行令。

## 最近变更（2026-07-07 / 🔧 ▶ 恢复令开工 · KP1-E step 0 ui_unlocks 接口形状定稿）

- **恢复令收讫**：🧭 KP1-R 解禁,rebase 到 `473ddb4`。队列重排:ui_unlocks 提最优先(接口形状=首里程碑,🎨 结构级改造等它),其后 LW-3/D3/D5。
- **✅ 首里程碑达成（已上 main `a06b468`·已 send 🧭 广播 🎨）**：`docs/plan/kaleido/06-ui-unlocks-contract.md` 接口契约定稿。
  - **契约**：持久解锁集 = `room.gamevars.players[uid].uiUnlocks:string[]`(渲染=∈集合即渲染·种子 ["search_btn"]·veteran 继承);瞬态解锁事件 = 信封顶层 `unlockEvents:[{ui_key,nar_line,timing,precedes,seq}]`(否决 gamevars 内嵌=陈旧回放·幂等每键至多一次·多人局仍 {room});账号持久 = `profiles.ui_unlocks` jsonb(否决 player_profile/新表·DDL 待 🔒 审)。
  - **方法**：2 个理解 workflow(5 子系统 map + 5 视角对抗验证)。**确认 blocker(已改契约)**:时序法则——非战斗死亡向量(污染/Ω/收缩)先于 fight_start → **hp_bar 由 fight_start 改挂首次 search/before** + 路由边界无条件求值(死亡回合亦发)。
  - **🎨 stub(5ee35b7)对齐**:stub 与契约高度一致(已预期服务端解锁集+含 nar_line 事件),6 处小校订见 06 §8(最实质=D3 hp_bar 提前到首搜)。
- **待决策(已报 🧭)**：nar_line 存储(A 引擎内联/B content_pool);condition 判据交 ⚙️ 对齐 seq1-2 投放;rules_card/stance_ui P1 DEAD(待 D3/LW-2)。
- **DDL 待审**：`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ui_unlocks JSONB NOT NULL DEFAULT '[]'::jsonb`(🔒 审 owner 不可自改)。
- **✅ Commit A 落地（`ec38ed6` 上 main·运行时机制·无 profiles 依赖）**：
  - `src/lib/server/kaleido/uiUnlocks.js`（12 项触发注册表 + evaluateUnlocks 纯判定 + unlockEvents payload）；`applyKaleidoPostAction`（gameActions.js·route 边界 + E2E act() 单一共享入口·消除分叉）；route.js 信封扩 unlockEvents；createPlayerState 条件展开 uiUnlocks（多人局无字段=严格中性）；startKaleidoRun 种子 `['search_btn']`；E2E +7 断言。
  - **验证：E2E 30/30**（真库·解锁序 + hp_bar 首搜解锁·id 严格先于首 attack·幂等·镜像）+ **build 绿**（next build 全路由·先修 worktree 缺 locatorjs-nextjs-experimental 声明依赖，--no-save 装入 shared node_modules，无 tracked 改动）。
  - **实测修正**：rules_card/stance_ui P1 **即 LIVE**（采样器出非标准 combat_mode·判定读关 node.kaleidoMode）；craft_btn 唯一 P1-DEAD（item kind 判据待接）。契约 06 §2/§7.1/§8 已更。
  - **retry/原子性**：route 的 kaleido 块在 withRetry **之外**（恰一次）+ persist gates emit → L4 double-emit 结构排除。
- **待办**：① **Commit B（账号持久化）阻塞于 🔒 审 `scripts/kaleido-ui-unlocks.sql`**（profiles.ui_unlocks + RLS owner 不可自改）——已报 🧭 路由；② L2/L4 补跑（确认性·非阻塞）；③ 队列续 LW-3 gauntlet / D3 mergeGameRules / D5 R3 seed。
- **环境备忘**：本 worktree 已放 `.env.local`（从 suspicious-solomon 取·gitignored·跑 E2E 用）；E2E 跑法 = 建临时 tsconfig.json(paths @/*→src/*) + `npx --yes tsx scripts/kaleido-e2e.mjs`，跑后删 tsconfig。

## 最近变更（2026-07-07 / 🔧 ⏸ 全局同步点简报锚点 —— 仍停机待命·非恢复令）

- 🧭 简报要点(`e92d0b0` 全局同步点):①KP1-E(LW-3 波次/D3 mergeGameRules/D5 R3 seed)仍有效,恢复后**可能扩编 ui_unlocks**(UI 渐进披露归 🔧:触发判定复用传感层动词·账号级持久化·解锁事件下发·E2E 增解锁序断言,接口形状+12 项 ui_key 见 05 §1);②新增必读:docs/plan/kaleido/05 全文 + 04 §5 软锁教训(自测第一项);③本轨家=Claude/engine/(README+log);④恢复后开工先读 Claude/engine/GPT.md(只读协作接口);⑤若 /compact,以 hub + Claude/engine/ + 03 KP1-E 段 + 05 + 04 重建上下文。本轨状态:干净停点(HEAD=main),继续待命。

> Kanata 暂停令：全轨收敛到安全停止位待命。本轨停点 = `ae5a813`（LW-2 已完整推送·工作区干净·无半成品）。

- **已完成（全部上 main·smoke+build 绿·多人局中性）**：D4 evalFormula 变量注入（`b7d7e2a`）→ D2 combatModes 3 模板×bot（`90e8cf3`·🔒 R1 审通过·两 finding 已修 `207e4e9`）→ D1 采样器正式化（`4422cee`·E2E 20/20）→ LW-1 seq5 boss 投放+BOSS_KILL_LIVE=true（`97f3e32`·软锁修复 `6e129c2`·E2E 23/23）→ **LW-2 stance_duel 接 attackNpc（`ae5a813`·待 🧭 E2E 断言联验）**。
- **下一步（恢复令后）**：LW-3 gauntlet 波次推进层（live-wiring 最后一块）→ D3 mergeGameRules 逐关覆盖 → D5 R3 seed 化 → D6 种子关 12-15 个 + 难度平衡核算（含 🧭 数据点：裸属性玩家 8 拳死于 seq5 boss → 需核 seq1-4 搜刮期望增益 vs boss 强度）。
- **在途等待**：🧭 E2E 加 stance_duel 断言联验 LW-2；🎨 接 stance UI 协议（已发定稿：`{action:'attackNpc', stance:'atk'|'def'|'skill'}`）。

## 最近变更（2026-07-06 / ⚙️ KP0-S 服务端核心全六件：六表+守卫+传感层+run 生命周期+beacon）

> KALEIDO P0 服务端核心（02 §2）交付完毕，全程 `isKaleidoRoom()` 守卫、多人局零行为变化（smoke-check + build 33/33 自证）。六表已由 🔒 审毕应用（`dd17323`）。

- **🎨 接线契约（单人出勤入口卡用）**：`POST /api/kaleido/run`（Bearer 鉴权、无 body）→ `{ roomId, runId }` → 跳 `/game/[roomId]`。幂等：已有 active run 直接返回同一 `{roomId, runId}`。失败 `{ error }` 400。局内放弃 = 走既有 `/api/game/actions` 发 `{ roomId, action: 'abandonRun' }`。kaleido 局判定：`import { isKaleidoRoom } from '@/lib/roomState'`（`room.gametype === KALEIDO_GAME_TYPE = 30`）。
- **run 生命周期**（[gameActions.js](src/lib/server/gameActions.js) 新增）：`startKaleidoRun`（幂等·runs 行 → 采样 5 关落 levels → 建房 gametype=30 + 落座 + startGame → 回填 room_id·失败补偿弃置 run）；`advanceKaleidoProgress`（路由边界每消耗性动作后：turnCount+1 → exit_condition 三型判定 boss_kill/survive_turns/collect → 过关推进/收敛·通关写 `endingResult` 走通用收房·死亡标 runs.status='dead'·域真源 runs/levels 同步 + level_clear/death 事件）；`abandonRun`（分发器动作·显式放弃·关页≠放弃 R11）。
- **P0 极简采样**（[kaleido/runs.js](src/lib/server/kaleido/runs.js) 纯函数·smoke 29/29）：chamber_templates(enabled) 加权 `spawn_weight` 无放回抽 5，**确定性**（mulberry32(hashStr(seed))·同 seed 同序·禁 Math.random）；节点契约逐 key 对齐 pathGenerator（下游搜索/战斗/污染零改动可用）+ 增量 `kaleidoExit`/`levelId`。P0 exit_condition 全部 `survive_turns(2+seq)`（极简采样无法保证 boss 投放；判定器支持三型，P1 战斗模板保证 boss 后 seq=5 换 boss_kill）。
- **传感层**（[kaleido/events.js](src/lib/server/kaleido/events.js) smoke 21/21）：`emitPlayerEvents` 批量 insert + payload 消毒（键≤24/串≤200/剔对象数组）；发射点=**路由边界**（`/api/game/actions` 动作成功后·仅 kaleido 局·仅已映射动词）——sweep/branches 借道属服务端内部绝不经路由，天然满足「只真实动作」（获批语义的实现下移，deathLog.js 零改动：kaleido 死亡全部经动作产生，路由边界必经，death 事件在 advance 收敛点发）。
- **beacon**（[/api/kaleido/beacon](src/app/api/kaleido/beacon/route.js)·待🔒 KP0-X #2 审）：客户端动词白名单（session_end/ui_read_ms/idle_ms/return_latency/hesitation_ms）+ body≤8KB/≤10 事件/ms≤24h 钳制/run_id UUID 形状校验/身份只信 token。
- **守卫补两处**（超出派单 5 处·均中性）：`applyRoomLifecycle` bossDefeated 判胜分支加 `!isKaleidoRoom` 豁免（否则 kaleido 中途击杀 boss 被抢先收房）；`joinRoom` kaleido 局拒他人加入（owner 重进走既有幂等返回）。
- 尚未做（后续）：P0 验收跑通 5 关 run（待 🎨 UI 或中控闸门验收）；KP1-S（正式采样器/3 战斗模板×bot/mergeGameRules 逐关覆盖）。
