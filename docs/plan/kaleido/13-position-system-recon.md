# KALEIDO · 13 位置系统与「场景永久改动」承载层 —— 勘察报告（只报不做）

> 出处：🧭 派单「先给我报一件事(不用实现)：那个 10x10 / chamber 位置系统现在的真实形态是什么？场景状态要挂在哪一层才能做到跨单位持久？**这决定 operate 能不能落，以及落在哪一期。**」
> 状态：**勘察结论，零实现、零 DDL**。基准 HEAD `bdfd334`；DB 数字经 postgres MCP 只读 SELECT 实测。

## 0. ⚠ 先订正教义的一处措辞

教义 §7.1 项 6（`11-diegetic-ui-doctrine.md:231`）记的是「10x10 位置系统**已存在、只是没有观测窗口**」。**不准确**：

- **多人局的 10x10 有完整观测窗口** —— `gameUi.js:544 BrGridPanel` 渲染格子 + 点击移动 + 缩圈着色；
- **kaleido 局里这套系统根本没被启动**（`br.enabled=false`，从未初始化）。

不是「启动了但没 UI」，是**「没启动」**。这不是文字游戏 —— 它决定 `operate` 样板是「接一个已在跑的系统」还是「给 kaleido 新建一个系统」，**工作量差一个量级**。

## 1. 那套 10x10 的真实形态

**它是 BR「100 房网格」**，现役实现 = re-home 进主游戏的 `gamevars.br`（Phase 31）：

| 环节 | 锚点 |
|---|---|
| 初始化 | `gameActions.js:3115 initBrRoomLayer`（幂等门 `:3117`），**唯一调用点在 `joinRoom` `:3249`** |
| 落盘形状 | `roomState.js:210-245 normalizeBrBlock`（slim 快照） |
| 位置字段 | `player.roomId`（`roomState.js:327`） |
| 移动 | `gameActions.js:3803 moveToRoom`，守卫 `:3810 if (!br?.enabled) throw` |
| 派生层 | `br/raidLayout.js:70 getRaidLayout`，进程级 memo，key=`${seed}:${topoVersion}:${roomCount}`（`:88-90`） |

「10x10」的真来源：`br_rooms` 实测 **100 行**，`grid_x=(g-1)%10 / grid_y=(g-1)/10`（`phase-30-timejump-br-schema.sql:117-118`）+ 四邻 `neighbor_ids`。网格尺寸**已参数化**（`gameActions.js:3142-3151` 从数据推 `gridW/gridH`），不再写死 10。

### 1.1 kaleido 里它是什么状态 —— **从未初始化**（三重原因链）

1. `startKaleidoRun`（`gameActions.js:2685`）**自建房 + 自 persistRoom**，不经 `joinRoom`；
2. `joinRoom` 对 kaleido **先抛错**：`:3261 throw new Error('单人对局，无法加入')`，位置在 BR 判据 `:3268 const isBr = …` **之前** ⇒ `initBrRoomLayer` 对 kaleido **永不可达**；
3. `normalizeBrBlock:212 const enabled = b.enabled === true` ⇒ 缺省 false。

实测 `rooms` 表：多人房（gametype=0）`br.enabled=true`、`raidPath` 长度 0；kaleido 房（gametype=30）`br.enabled=false`、`raidPath` 长度 5。

## 2. kaleido 用的是哪套 / 两套关系

kaleido = **`raidPath` + `chamberIndex` 线性阶梯**：`runs.js:158 sampleRun` 出 5 节点 → `gameActions.js:2810 raidPath`；移动 `movePlayer` `:3653 nextIdx = currentIdx + 1`（**只能 +1、不能回头**）+ 门禁 `:3661-3666`。

**两套是互斥 if/else 分支，不是叠加层**：`getChamberForPlayer`（`gameActions.js:182`）`br.enabled && roomId!=null` → BR 伪 chamber，否则 → `raidPath[chamberIndex]`。

### 2.1 ⚠ **不能靠「给 kaleido 打开 `br.enabled`」共存**

一旦 kaleido 局 `br.enabled=true`，`getChamberForPlayer:184` 立刻短路到 BR 分支，返回 `templateMeta` 拼的伪 chamber，而 `kaleidoExit` / `kaleidoMode` / `kaleidoEnemy` / `kaleidoEventDeck` / `kaleidoEnvRules` / `kaleidoFormulaOverrides` **只挂在 `raidPath` 节点上**（`runs.js:131-141`）⇒ 过关判定、战斗模板、敌人投放、逐关规则**全部读不到** ⇒ **kaleido 玩法整体失效**。

> **方向上是好消息**：新结构 step1「探索求生 → 走到安全屋 = 存档点提交」本质上**是图**（要能绕、能回头、能选路径），比现在的 5 节点直线更贴 BR 拓扑。⟹ 正确做法不是打开 `br.enabled`，而是**在 kaleido 侧新写第三条分支**：复用 `br_rooms` 拓扑数据 + `raidLayout` 的派生/memo 范式，走独立的 `gamevars.kaleidoMap`（形状可抄 slim `br` 块）⇒ 多人局逐字节零触碰。

## 3. 场景改动挂哪一层才能「跨单位持久」

评判六维：**世界级？运行时可写？无 TTL？不与多人局共用？不挂 run/账号？可按日批量重置？**

| 候选 | 判定 | 关键理由 |
|---|---|---|
| `rooms.gamevars` | ❌ **run 级** | **每个 run 建一张新房**（`startKaleidoRun → createRoom`）⇒ 上一程对下一程结构性不可见。`kaleido-p0-schema.sql:11` 已明文「gamevars 会被生命周期清洗，**不能当档案**」 |
| `runs` / `levels` | ❌ run 级 | `levels` 还随 run 级联删；教义 `:117` 明令场景状态不得挂 run |
| `profiles` | ⚠ **触教义红线** | `:117`「不得与 UI 解锁共用字段/表」，而 `profiles.ui_unlocks` 正在这张表上；且它是**账号级不是世界级**（别人开的灯你看不到） |
| `chamber_templates` | ❌ | ①**与多人局共用**（`gameActions.js:2747`/`raidLayout.js:84` 都读）②`getRaidLayout` 的 memo key 不含它 ⇒ **改它不会让 memo 失效**，warm 进程读陈旧模板 |
| `content_pool` | ✅ **stopgap** | 世界级、无 TTL、id 稳定；**全仓唯一读点** `gameActions.js:2750` 且带 `.eq('entity_type','level')` 过滤 ⇒ 新 `entity_type='scene_state'` 不污染既有读、**多人局完全不读此表**。缺点：无 `(scene,prop)` 唯一键与 upsert 并发语义；`entity_type` 枚举硬编码在 `admin/_engine/schemas/contentPool.js:32/:39` 两处 |
| `chamber_residue` | ⚠ 形状不对但**有先例价值** | 世界级、键 = `chamber_template_id`（**恰是稳定身份**），但 `expires_at DEFAULT now()+72h`（`phase-25i-chamber-residue.sql:53`）且**全仓零调用点 = 死代码**。它证明「按 template_id 挂世界级状态」这条路**已被设计过一次** |
| `br_rooms` | ❌ | ①多人 BR 实时依赖 ②**每写一次 `updated_at` 变 → `topoVersion` 变 → memo 全 miss** ⇒ 玩家开一次灯 ≡ 全局重建拓扑缓存 |
| `br_zone_tables` | ❌ | **schema 级只读禁令**（`phase-30-timejump-br-schema.sql:29` + `br/zones.js:8-9`） |
| `br_match_room_state` | ❌ match 级，但**形状最像** | `physical_state ∈ intact/bombed/repaired` + 覆盖写 ⇒ **拿它当新表的设计范本** |

### 结论

> **现有候选里没有任何一个同时满足六维。**

- **能立刻用（零 DDL）**：`content_pool` 新 `entity_type` —— 但要改 `contentPool.js` 两处枚举，并发靠应用层。
- **该做的**：新开一张 `kaleido_scene_state`（形状抄 `br_match_room_state` 去掉 `match_id`、去掉 TTL，加 `reset_scope:'daily'|'permanent'` 以支持教义 §8.2 的按日重置），PK `(scene_key, prop_key)`，RLS 照 `content_pool` 范式。**纯新增表、不 ALTER 任何现有表 ⇒ 多人局逐字节零变化。**
  ⚠ **未解**：按日重置的**触发器形态**——仓库有 cron 先例（`dtsv-healthcheck-daily`）但那是只读报告；这是**改游戏状态**的 cron，且跑在 Vercel serverless 上。
- **`kaleido` 瞬态可挂 gamevars**：`normalizeGamevars:137` 首行 `...gamevars` 全透传且**不归一 `kaleido` 键** ⇒ run 级瞬态（`uiKnown`/`uiHidden`/线索账本）零迁移即可挂。**但场景状态绝不能挂这里。**

## 4. 房间是否有「稳定身份」

**有** —— `chamber_template_id` / `template_key`（`runs.js:116-117` 写进节点）。两个不同 run 走到同一个模板房时能对上号。
⟹ **P1 的 `scene_key` 用 `'chamber:<template_key>'`**；step1 的图结构落地后改用 `'site:<site_key>'`。

> ⚠ 但要注意粒度：`template_key` 是**模板**不是**实例**。同一 run 里若两个节点抽到同一模板（`sampleRun` 用 `usedChambers` 去重，当前不会），或不同 run 抽到同一模板 —— 后者正是我们**想要**的「同一个房间」语义，前者会串味。当前采样器保证 run 内唯一 ⇒ P1 安全。

## 5. `operate` 能不能落、落在哪一期

**能落，但不是「接现成的」。** 前置三条：
1. **kaleido 侧的图拓扑**（第三条分支 `gamevars.kaleidoMap`）——step1 的图结构本来就要做，`operate` 可搭车；
2. **`kaleido_scene_state` 表**（或 `content_pool` stopgap）——待 🧭/🔒 批；
3. **`interact` 动词 + fixtures 节点字段**——`route.js` 对动词无知 ⇒ route 零改动；handler 首行 `isKaleidoRoom` 守卫；**不进 `TURN_ACTIONS`**（进了会 `turnCount+1` 并重判 exit_condition，打红现有回合配额断言）。
   ⚠ 由此带出一个**要 ⚙️ 认的经济问题**：按开关**不烧回合** = 免费试探，与法则二「探索要争取」在经济上矛盾。教义 §3.4 的 `actionKind:'notice'|'operate'` 分野正是为此——「注意到」零代价、「操作」应有代价。

**建议期**：跟 step1 图结构同期（不早于它），**不排进 P1 投影重构**。

---

## 6. 样例走查：「关上那扇门」（step1 里程碑 · 第一个 `operate` 实例 · 2026-07-23 增补）

🧭：「拿它验证比抽象讨论有用。」下面把这一条从触发到持久走一遍，逐段标出**现在缺什么**。

| 段 | 需要什么 | 现状 |
|---|---|---|
| ① 门这个物件存在于某关 | `kaleidoFixtures: [{ fid:'door_a', kind:'door', word:'门', hint:'subtle', actionKind:'operate' }]` 挂在节点上 | ❌ 字段不存在。加它要**三处同改**（`chamberToNode` 白名单逐 key 拷贝 / `sampleRun` 读键 / `buildLevelRows`）——漏一处静默丢弃，本仓 `env_rules` 真踩过 |
| ② 玩家看得到「门」这个词 | 走 doc 15 的 `lure`/`offer` 行（带 `action.word`） | ❌ 通道未实现（doc 15 待会签） |
| ③ 玩家点它 | `interact` 动词（`route.js` 对动词无知 ⇒ route 零改动；handler 首行 `isKaleidoRoom` 守卫；**不进 `TURN_ACTIONS`**） | ❌ 未实现 |
| ④ 世界真的变了 | `kaleido_scene_state` upsert：`(scene_key='chamber:<template_key>', prop_key='door_a') → {closed:true}` | ❌ 表未建（待 🧭/🔒 批） |
| ⑤ 这个改动**永不复原** | `reset_scope='permanent'`（🧭 已裁：门的恢复周期 = 永不） | ✅ 形状已预留 |
| ⑥ step 推进到 1 | 第二张注册表 `KALEIDO_STEPS` 的 `match` 读「本动作是否 close 了 door_a」 | ❌ 注册表未建（形状见 doc 14 §3） |
| ⑦ 下一个单位进来看到门是关的 | 读 `kaleido_scene_state`，注入节点渲染态 | ❌ 读侧未接 |

**由此确认三件事**：

1. **`scene_key` 用 `chamber:<template_key>` 成立** —— `template_key` 跨 run 稳定（`runs.js:117`），两个 run 走到「同一个房间」能对上号。⇒ ④⑦ 的身份问题**不是阻塞**。
2. **恢复周期是「参数」不是「档位」** —— ⚠ **本条已按 🧭 转达的 Kanata 原话订正（2026-07-23）**，我原先提的两档枚举 `reset_scope:'daily'|'permanent'` **被否**：

   > 「灯 = 日常（当天有效，次日复原），**但有的『灯』，比如重大事件玩家拿炸药给一个区块炸毁了，我们可能需要过几天才恢复** …… **这个不是固定的**。」

   ⇒ **最终形状（🧭 裁定的第三解·2026-07-23）**：`restore_at TIMESTAMPTZ **NOT NULL** DEFAULT 'infinity'`，**「永不」= `'infinity'`**。
   它同时保住了两边：无 NULL 的「未设置/永不」歧义（我最初担心的那条），又能表达「几天」这种连续参数；
   且 `DELETE ... WHERE restore_at <= now()` 对 `'infinity'` **永远不成立** ⇒ 与枚举**同等的结构性保证**，不靠人记得写条件。
   已定三例：**安全屋的门 = NULL（永不）** / 灯 = 次日 / 炸毁区块 = 数天后。
   **我原来的反对理由（NULL 在「未设置」与「永不」之间有歧义）不成立**：本表的行**只有被写入时才存在**，「未设置」这个状态根本不落行 ⇒ NULL 只有一种含义。枚举真正的代价才是硬的 —— 加「三天」「一周」要改 schema + 改重置作业 + 迁存量，而参数化零成本。
   DDL 见 `scripts/kaleido-item-...` 同批的 `scripts/kaleido-scene-state.sql`（待审）。
3. **step1 里程碑现在是「进度关键件」** —— 不关门就推不进 step1 ⇒ ①②③④⑥ **五段全在关键路径上**，任何一段没落地，step1 就没有出口。这比原来的「首次到达某地」重得多（那个只需要位置判定）。**建议 🧭 按这条重估 step1 的排期依赖。**
