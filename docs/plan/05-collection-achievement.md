# 05 · 集卡 / 成就系统设计（元进度 · 残片转向的产品决策）

> 子系统：Collection & Achievement（图鉴集卡 + 成就 + 对局即时反馈 + 解锁收益注入）
> 状态：实现级设计 · 待用户拍板路径（见 §9）
> 依赖：`01 后台内容引擎`（authoring 地基）、`02 战斗钩子管线`（运行触发地基）
> 红线：只取 dts 设计意图，落地 DTSV 原生（Next.js / Supabase / Postgres / JSONB / JS 纯函数）。引用一律 **ID + 外键完整性**，绝不照搬 PHP/eval/全局变量/名串匹配。

---

## 0. TL;DR（给决策者）

- 用户原话「残片系统太难懂了」「更倾向和 dts 一样」。本设计把 dts 成熟的「**图鉴集卡 + 分级成就 + 对局即时反馈 + 达成即注入收益**」意图，落到 DTSV 原生数据层。
- DTSV 已有一套**事实上的成就引擎雏形**：`contracts` / `player_contracts` —— objectives(JSONB) → progress(JSONB) → rewards(JSONB)，且**已经是事件驱动的**（`updateContractProgress(client, userId, event)`，`src/lib/server/contracts.js:87`）。成就系统不该另起炉灶，而该把它**泛化成「事件 → 进度 → 多级阈值 → 收益注入」的通用引擎**，并接到 `02` 的统一钩子。
- DTSV 已有一套**事实上的集卡/图鉴**：`fragment_pool` / `player_fragments` + `/archive` + `/codex`（六纪元时间轴、知识图谱合成链、断链悬案）。问题不是缺收集，而是收集 **meta 不清晰**——缺 dts 那种「**差一张就集齐**」的明确分母/分子与即时反馈。
- 因此本设计给 **3 条路径（A 轻 / B 中 / C 重）**，每条标清动哪些文件、代价、对六纪元叙事的影响（§9）。**默认推荐 A**：保留残片内容，叠一层清晰的「集卡进度 + 分级成就 + 对局即时反馈」，不砸已投入的 lore。

---

## 1. 目标与范围

### 1.1 目标

1. **清晰的收集 meta**：玩家任何时候能一眼看到「我集齐了 X / Y」「再差 Z 张就集齐这套」，对应 dts cardbook 的 `unlock_cards` / `lock_cards` 对比（`D:\Fragments\_dts_clone\cardbook.php:48-58`）。
2. **分级成就**：单个成就有递进阈值（如击杀 100 / 2500 / 10000），每级有独立标题与奖励，对应 dts `achXXX_threshold` + `achXXX_name`（`D:\Fragments\_dts_clone\include\modules\extra\achievement\skills\skill310\main.php:6-59`）。
3. **对局内即时反馈**：达成/推进在 raid 结算日志即时冒出 toast（DTSV 已有 `appendResolutionLog` + `markFragmentLevelUp` 机制，`src/lib/server/gameActions.js:3519-3520`），不必等回大厅。
4. **达成即注入收益**：成就/集齐 → 发奖到账户库（道具）或点数（`creditPoints`，`src/lib/server/points.js:55`），可选解锁「集卡被动效果」（dts card `valid` 注入 loadout，但 DTSV 落地为**可选、可关、显式 ID 引用**的弱被动，守 §8 中性铁律）。
5. **后台可填表 authoring**：成就/集卡套牌全部在 `01 内容引擎` 里建表填写，**不写代码**（对照 dts 每个成就一个 PHP 文件 + eval 的反面教材）。

### 1.2 范围

- **In**：成就定义/进度/结算引擎；图鉴「套牌（collection set）」抽象与进度统计；对局即时反馈；后台 authoring；运行端钩子消费。
- **In（边界内的产品决策）**：残片系统的去留与重构方案（§9 路径 A/B/C）。
- **Out**：道具合成链本身（`03`）、技能树（`04`，排在道具之后）、BR 第二实现（`br_match*` 按项目记录 teardown，不在本系统覆盖）。
- **模式范围**：只服务 **搜打撤 PVE + PVPVE**。成就的 `allowed_modes` 仅取这两类，**不复刻** dts 的 13 模式 `ach_allow_mode`（`D:\Fragments\_dts_clone\...\achievement_base.config.php:42-64` 的 mode 0/4/18/19 等广度直接砍掉）。

### 1.3 dts 意图 vs DTSV 落地（红线对照表）

| dts 做法（参照） | 本设计 DTSV 落地 |
|---|---|
| 每成就一个 `skillNNN/main.php`，`eval(import_module(...))` 动态加载 | 成就是 `achievements` 表的**数据行**，引擎是 1 个 JS 纯函数 + 1 个 SQL 函数。零 eval。 |
| 名串匹配 `MOD_SKILL310_*` 常量、`$cardindex['A']` 全局数组 | 全部 **整数 ID + 外键**：`achievement_tiers.achievement_id → achievements.id`、`collection_set_members.item_id → item_pool.id`。改名不断链。 |
| 成就进度编码进 `users.u_achievements` 单字段 base64 串 | 进度存 `player_achievements.progress JSONB` + 关系行，可查询、可索引、可迁移。 |
| 卡片 `valid` 直接改对局变量（开局 exp=120 等） | 集卡被动落地为**显式 effect token 列表**，复用 `02` 钩子/`equipmentEngine` 既有 effect 词汇；**默认空 = 数值逐值不变**。 |
| 卡片返还「切糕」货币 | 复用现有 4 类点数 `creditPoints`（`src/lib/server/points.js:14`），不引入新货币。 |

---

## 2. 数据模型（真实 SQL）

> 命名遵循 DTSV 既有风格：`*_pool` / `player_*`（见 `fragment_pool` / `player_fragments`、`contracts` / `player_contracts`）。所有外键带 `ON DELETE CASCADE`，避免 dts「改名/删表错位」。RLS 与 `decode-archive-schema.sql:51-67` 同构（模板表全员可读、玩家表只读自己、service_role 写）。

### 2.1 成就引擎（4 表）

```sql
-- ============================================================
-- Phase XX-A — 成就引擎（achievement engine）
-- 设计意图取自 dts achievement_base（分类 + 分级阈值 + 达成注入收益），
-- 落地为 DTSV 原生数据表 + JS/SQL 纯函数。零 eval / 零名串 / 全 ID 引用。
-- ============================================================

-- ── 1. achievements: 成就模板（管理员后台 authoring）──
CREATE TABLE IF NOT EXISTS achievements (
  id            BIGSERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,             -- 稳定机读键（如 'kill_npc_total'）。改 name 不动 code，避免断链。
  name          TEXT NOT NULL,                    -- 展示名（系列名，如「实体猎手」）
  description   TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT 'combat',   -- combat / collect / extract / special / lifetime（对应 dts achtype，砍掉活动/日常的复杂度）
  -- 进度计量：引擎据此把事件累加到 progress.counter
  metric        TEXT NOT NULL,                    -- 计量口径，见 §4.2 METRIC 枚举（如 'npc_killed'）
  metric_filter JSONB NOT NULL DEFAULT '{}'::jsonb, -- 过滤条件（如 {"npc_id": 42} 只统计某 NPC；空=任意）。引用用 ID，不用名。
  icon          TEXT NOT NULL DEFAULT '',         -- 图标 token（前端映射，不存路径）
  sort_order    INTEGER NOT NULL DEFAULT 100,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. achievement_tiers: 成就的分级阈值（一个成就 N 级）──
-- 对应 dts $achXXX_threshold + $achXXX_name + $achXXX_*_prize
CREATE TABLE IF NOT EXISTS achievement_tiers (
  id              BIGSERIAL PRIMARY KEY,
  achievement_id  BIGINT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  tier            INTEGER NOT NULL,               -- 0,1,2,… 递增级别
  threshold       BIGINT NOT NULL,                -- 达成所需计数（>= 即达成）
  title           TEXT NOT NULL DEFAULT '',       -- 该级标题（如「脚本小子→黑客→幻境解离者」）
  -- 收益注入：reward_kind 是显式枚举，绝不 eval。引用一律 ID。
  rewards         JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{kind:'item',item_id:12,quantity:1} | {kind:'points',point_type:'item_pt',amount:50} | {kind:'card',card_id:7} | {kind:'unlock',...}]
  CONSTRAINT achievement_tiers_unique UNIQUE (achievement_id, tier),
  CONSTRAINT achievement_tiers_threshold_pos CHECK (threshold > 0)
);
CREATE INDEX IF NOT EXISTS idx_ach_tiers_ach ON achievement_tiers(achievement_id, tier);

-- ── 3. achievement_modes: 成就允许完成的模式（白名单；空=全模式）──
-- 只服务 PVE / PVPVE 两类，不复刻 dts 13 模式
CREATE TABLE IF NOT EXISTS achievement_modes (
  achievement_id  BIGINT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  gametype        TEXT NOT NULL,                  -- 'pve' | 'pvpve'
  PRIMARY KEY (achievement_id, gametype)
);

-- ── 4. player_achievements: 玩家进度 + 已领级别（跨周目持久）──
CREATE TABLE IF NOT EXISTS player_achievements (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id  BIGINT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  counter         BIGINT NOT NULL DEFAULT 0,      -- 当前累计进度
  claimed_tier    INTEGER NOT NULL DEFAULT -1,    -- 已发放奖励的最高 tier（-1=一级未达成）。幂等防重发。
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT player_ach_unique UNIQUE (user_id, achievement_id)
);
CREATE INDEX IF NOT EXISTS idx_player_ach_user ON player_achievements(user_id);
```

> **关键防注水设计**：`claimed_tier` 取代 dts 的「比较 ox/x 跨阈值」逻辑（`skill310/main.php:39-57`）。引擎结算时只对 `tier > claimed_tier` 且 `counter >= threshold` 的级别发奖，发完把 `claimed_tier` 抬到该级 —— 天然幂等，重放同一事件不会重复发奖。

### 2.2 集卡 / 图鉴套牌（2 表，复用现有 item/fragment）

> dts card 是独立实体（`$cards[]`，含 rare/pack/effect/energy）。DTSV **不引入第三种实体**——把「可收集对象」抽象成对**现有实体的引用**（道具 `item_pool` 或残片 `fragment_pool`），靠 `ref_kind` + `ref_id` 区分。这样合成链产出的道具、搜到的残片，天然都能进图鉴，零数据搬运。

```sql
-- ── 5. collection_sets: 收集套牌（管理员定义「一套要集齐什么」）──
-- 对应 dts $packlist / $packdesc（cardbook 按 pack 分组算 unlock/lock）
CREATE TABLE IF NOT EXISTS collection_sets (
  id            BIGSERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,                    -- 如「构筑纪文档」「猩红誓约」
  description   TEXT NOT NULL DEFAULT '',
  sort_order    INTEGER NOT NULL DEFAULT 100,
  -- 集齐整套的奖励（对应 dts 全能骑士成就 326 的集卡完成奖）
  complete_rewards JSONB NOT NULL DEFAULT '[]'::jsonb, -- 同 achievement_tiers.rewards 形状
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 6. collection_set_members: 套牌成员（指向现有实体，纯 ID 引用）──
CREATE TABLE IF NOT EXISTS collection_set_members (
  id            BIGSERIAL PRIMARY KEY,
  set_id        BIGINT NOT NULL REFERENCES collection_sets(id) ON DELETE CASCADE,
  ref_kind      TEXT NOT NULL CHECK (ref_kind IN ('item','fragment')), -- 收集对象类型
  ref_id        BIGINT NOT NULL,                  -- item_pool.id 或 fragment_pool.id（应用层 + 触发器校验完整性）
  rarity        TEXT NOT NULL DEFAULT 'common',   -- 套牌内展示稀有度（common/uncommon/rare/legendary，对齐 fragment_pool.rarity 既有词汇）
  sort_order    INTEGER NOT NULL DEFAULT 100,
  CONSTRAINT csm_unique UNIQUE (set_id, ref_kind, ref_id)
);
CREATE INDEX IF NOT EXISTS idx_csm_set ON collection_set_members(set_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_csm_ref ON collection_set_members(ref_kind, ref_id);
```

> **「拥有」如何判定（不新建第 7 张表）**：
> - `ref_kind='fragment'` → 玩家是否在 `player_fragments` 有该 `fragment_id`（已存在表）。
> - `ref_kind='item'` → 玩家是否曾经获得过该道具。**注意**：账户库 `addItemsToStash` 是消耗型库存，不能用来判「曾拥有」。需要一张极薄的「曾获得」登记表（见 2.3），由 `02` 的 `item_acquired` 钩子顺手写一行。这是唯一新增的「持有事实」表，幂等 upsert。

### 2.3 道具「曾获得」登记（集卡持有判定，1 表）

```sql
-- ── 7. player_item_dex: 玩家「曾获得过」的道具登记（图鉴持有源，跨周目）──
-- 与账户库（消耗型）解耦：图鉴看的是「见过没」，不是「现在有几个」。
CREATE TABLE IF NOT EXISTS player_item_dex (
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id       BIGINT NOT NULL REFERENCES item_pool(id) ON DELETE CASCADE,
  first_got_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  got_count     BIGINT NOT NULL DEFAULT 1,        -- 累计获得次数（仅统计用，可选展示）
  PRIMARY KEY (user_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_item_dex_user ON player_item_dex(user_id);
```

> 引用完整性兜底（dts「改名即断链」的解药）：给 `collection_set_members` 加轻量校验触发器，插入/更新时按 `ref_kind` 验证 `ref_id` 在对应表存在；删除 `item_pool`/`fragment_pool` 行时 `collection_set_members` 不自动级联（避免静默丢成员），改由后台「孤儿成员」检查列出（§3.4）。

### 2.4 RLS（与现有同构）

```sql
ALTER TABLE achievements            ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievement_tiers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievement_modes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_sets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_set_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_achievements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_item_dex         ENABLE ROW LEVEL SECURITY;

-- 模板表：全员可读（前端图鉴/成就页直接 anon 读，和 fragment_pool 一致）
CREATE POLICY ach_read    ON achievements           FOR SELECT USING (true);
CREATE POLICY ach_t_read  ON achievement_tiers      FOR SELECT USING (true);
CREATE POLICY ach_m_read  ON achievement_modes      FOR SELECT USING (true);
CREATE POLICY cset_read   ON collection_sets        FOR SELECT USING (true);
CREATE POLICY csm_read    ON collection_set_members FOR SELECT USING (true);
-- 玩家表：只读自己（service_role 绕过 RLS 写）
CREATE POLICY pa_read     ON player_achievements    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY pid_read    ON player_item_dex        FOR SELECT USING (auth.uid() = user_id);
-- 写：全部走服务端 service_role（gameActions / api route）。模板表写仅管理员 API。
```

---

## 3. 后台编辑（在 `01 内容引擎` 里 authoring）

> 复用既有 admin tab 范式：`ContractsTab.jsx`（`src/app/admin/_tabs/ContractsTab.jsx`）是**现成模板**——它已经在用「JSONB objectives/rewards 行内编辑器 + 下拉选 item/npc + `postGameApi('/api/contracts', {action})`」。成就/集卡两个新 tab 照抄这套交互，**不发明新 UI**。

### 3.1 新增两个 admin tab

| Tab | 文件 | 后端 API |
|---|---|---|
| 🏆 成就 | `src/app/admin/_tabs/AchievementsTab.jsx` | `src/app/api/achievements/route.js`（create/update/delete + tiers 嵌套保存） |
| 🃏 集卡套牌 | `src/app/admin/_tabs/CollectionsTab.jsx` | `src/app/api/collections/route.js` |

在 `src/app/admin/page.js` 的 tab 注册表加两项（沿用现有 tab 切换机制）。

### 3.2 成就编辑器字段（AchievementsTab）

- **基础**：`code`（机读键，建后只读 + 唯一校验）、`name`、`description`、`category`（下拉：战斗/收集/撤离/特殊/终生）、`icon`、`enabled`、`sort_order`。
- **计量 metric**：下拉选 METRIC 枚举（§4.2），选后按 metric 动态显示 `metric_filter` 子表单——例如 `npc_killed` 显示「限定实体（下拉 npc_pool，ID 引用）/ 任意」；`item_collected` 显示「限定道具（下拉 item_pool）」。**完全复刻 ContractsTab 的 `ObjectiveRow` 按 type 切字段的写法**（`ContractsTab.jsx:263-328`）。
- **分级 tiers**（行内可增删，对应 dts 多阈值）：每行 = `tier`（自动递增）+ `threshold`（数字）+ `title`（该级标题）+ `rewards[]`。
  - reward 行编辑器：`kind` 下拉（道具 / 点数 / 卡片 / 解锁）。道具 → 下拉 `item_pool`（存 `item_id`，**不存名**，修正 contracts 现在用 `name` 的旧坑，见 §7.1）；点数 → 下拉 4 类 `POINT_TYPES` + 数额；卡片 → 下拉某 `collection_set_members`。
- **模式**：多选 `pve` / `pvpve`（写 `achievement_modes`）。空 = 全部允许。
- **预览**：编辑器底部「预览」面板，渲染玩家视角的成就卡（每级标题 + 阈值 + 奖励文案），所见即所得。

### 3.3 集卡套牌编辑器字段（CollectionsTab）

- **套牌**：`code` / `name` / `description` / `sort_order` / `complete_rewards[]` / `enabled`。
- **成员**（行内增删）：`ref_kind`（道具/残片）→ 按类型显示下拉（道具选 `item_pool`，残片选 `fragment_pool`，存 ID）+ `rarity` + `sort_order`。
- **校验**：保存时调后端验 `ref_id` 存在（防 dangling）；前端实时显示「本套 N 张，其中道具 X / 残片 Y」。
- **预览**：模拟 cardbook 的「已解锁 vs 未解锁」格栅（未解锁灰显遮蔽名，对齐 `/codex` 未发现残片的 `████` 处理，`codex/page.js:114`）。

### 3.4 数据健康检查（后台「概览」或新增小工具）

- **孤儿成员**：`collection_set_members` 里 `ref_id` 已不存在于目标表的行 → 列出供修复（替代 dts 删表错位的事故面）。
- **死阈值**：`achievement_tiers` 的 threshold 非递增 / 重复 tier → 警告。
- **不可达成就**：`metric_filter` 引用了 disabled 的 npc/item → 警告。

---

## 4. 运行端集成（DTSV 文件 / 钩子 / 查询）

### 4.1 服务端模块（新增 1 个 + 复用既有）

新增 `src/lib/server/achievements.js`，仿 `contracts.js` 结构，导出：

```js
// 引擎入口：在 02 的统一钩子里被调用。事件驱动、幂等、exception-safe。
export async function recordAchievementEvent(client, userId, event, ctx)
// event 形状对齐 02 钩子事件（见 §4.2）；ctx 携带 gametype 用于 mode 白名单过滤
// 返回 { progressed: [{achievement, tier, rewards}], … } 供调用方写结算日志 + toast

// 集卡持有/进度查询（前端 /collection 页 + 后台预览复用）
export async function loadCollectionProgress(client, userId)
// 道具登记（item_acquired 钩子顺手调，幂等 upsert player_item_dex）
export async function recordItemDex(client, userId, itemId)
```

引擎核心逻辑（纯函数化，避免 dts 的 eval/全局）：

1. 拉该 `userId` 命中 `metric == event.type` 且 `metric_filter` 匹配（JS 侧 `matchFilter(filter, event)`，对照 `contracts.js:149` 的 `matchObjective`）且 `enabled` 且 mode 白名单含 `ctx.gametype` 的 achievements + tiers。
2. `counter += delta`，upsert `player_achievements`。
3. 对所有 `tier > claimed_tier && counter >= threshold` 的级别：发奖（道具 → `addItemsToStash`；点数 → `creditPoints`；卡片/解锁 → 写对应表），把 `claimed_tier` 抬到最高已达级。**单事务/单 RPC 完成，幂等。**
4. 返回新达成的级别清单。

> **可选 SQL 版**：高并发或重计数（如击杀总数）可把步骤 1-3 做成一个 Postgres 函数 `fn_record_achievement(uid, metric, filter_json, delta)`，单往返完成 `upsert + tier 结算`（与 `phase-40-perf-durability-rpc.sql` 的单 RPC 提速一脉相承）。先用 JS 版上线，热点再下沉 SQL。

### 4.2 钩子接线（`02 战斗钩子管线` 是运行地基）

DTSV 现状是**在 `gameActions.js` 散点直调** `updateContractProgress` / `discoverFragment` / `creditPoints`。`02` 的目标是把这些归一成一条钩子管线。本系统**只在钩子点挂载**，不自己满世界插桩。现有调用点即未来钩子点：

| 钩子事件（来自 02） | 现有锚点（file:line） | 成就 metric | 集卡副作用 |
|---|---|---|---|
| `item_acquired {itemId,itemName}` | `gameActions.js:1514` / `1588` / `2209` | `item_collected` | `recordItemDex` 写持有 |
| `npc_killed {npcId,npcName}` | `gameActions.js:1789` | `npc_killed` | — |
| `extracted {mapId}` | `gameActions.js:3538` | `extracted` | — |
| `purchased` | `gameActions.js:2463` | `purchased` | — |
| `probe_left` | `gameActions.js:3391` | `probe_left` | — |
| `fragment_decoded {fragmentId,level}` | `discoverFragment` 返回点（`gameActions.js:1601`/`1771`/`3509`） | `fragment_decoded` | 推进图鉴 |
| `player_death {reason}` | death-log 写入点（`deathLog.js`） | `death`（用于「不死流」反向成就，可选） | — |

> **METRIC 枚举**（成就 metric 字段下拉值）= 上表事件 type 的超集：`npc_killed` / `item_collected` / `extracted` / `purchased` / `probe_left` / `fragment_decoded` / `death` / `craft_completed`(来自 03) / `skill_unlocked`(来自 04，预留)。新增 metric = 加一个枚举值 + 在钩子点发对应事件，**不动引擎**。

**关键**：`item_acquired` 钩子要补 `itemId`（现在 contracts 只传 `itemName`）——这是 §7.1 迁移的一部分。`02` 落地时统一在事件 payload 带 ID。

### 4.3 对局内即时反馈（DTSV 已有机制，直接复用）

- 结算日志：`appendResolutionLog(resolution, note, 'system')`（`gameActions.js:3497/3519`）—— 成就达成/集卡集齐时追加一行（如「🏆 达成成就【黑客 II】」「🃏 集齐套牌【构筑纪文档】」）。
- 升级 toast 信号：仿 `markFragmentLevelUp(resolution, userId, fragment)`（`gameActions.js:3520`，定义见 `gameActions.js:275`）新增 `markAchievementUnlock` / `markSetComplete`，前端结算弹窗读取冒 toast。**前端无需新组件，复用现有残片升级 toast 通道。**

### 4.4 前端页面

- **图鉴/集卡页**：方案 A 下，**升级现有 `/codex`**（`src/app/codex/page.js`）—— 它已是「按维度分组 + 进度分母/分子 + 未解锁遮蔽」的成熟收集页。新增「套牌」分组维度（与现有六纪元/主线时间轴并列的折叠区），每套显示 `已集 X / 共 Y` 进度条 + 「再差 N 张」高亮（这正是「差一张就集齐」的落点）。复用 `DecodeBar` / `Spinner` / `THEME`（`fragmentMeta.jsx`）。
- **成就页**：新增 `src/app/achievements/page.js`，按 category 分组列成就卡，每张显示当前 tier / 进度条 / 下一级阈值与奖励（对照 dts `show_achievement_single`，`achievement_base/main.php:492`，但用 React 渲染数据，不用 PHP 模板）。

---

## 5. 分阶段落地步骤（每步可独立上线）

> 顺序遵循依赖：先有 `01` 的 authoring 能力雏形与 `02` 的钩子骨架，本系统才有地基。但**阶段 1-2 可在 `02` 尚未完全归一前先用现有散点调用上线**（向后兼容）。

**P0 · 成就引擎骨架（无 UI 即可后台手填）**
- 建 §2.1 四表 + RLS（一个 migration `phase-XX-achievements.sql`）。
- 写 `achievements.js` 的 `recordAchievementEvent`（JS 版）。
- 在**已有**的 `npc_killed` / `extracted` 调用点旁挂一行 `recordAchievementEvent`（exception-safe，best-effort，仿 contracts 的 `try/catch`）。
- 验收：后台手 INSERT 一个「击杀 10 次」成就，玩一局达成，账户库收到奖励，结算日志冒一行。**此步不碰残片、不碰前端。**

**P1 · 成就后台 authoring**
- `AchievementsTab.jsx` + `/api/achievements`（抄 ContractsTab）。
- 数据健康检查（§3.4）。
- 验收：非技术用户能在后台完整建一个三级成就并预览。

**P2 · 成就玩家页 + 对局即时反馈**
- `/achievements` 页 + `markAchievementUnlock` toast。
- 验收：玩家能看进度、达成时对局内即时反馈。

**P3 · 集卡套牌引擎 + 持有源**
- 建 §2.2 / §2.3 三表 + RLS + 完整性触发器。
- `item_acquired` 钩子补 `itemId` + `recordItemDex`（§7.1）。
- `loadCollectionProgress`。
- 验收：后台手建一套（混道具+残片），玩家集齐触发 `complete_rewards`。

**P4 · 集卡后台 + 集卡前端（升级 /codex）**
- `CollectionsTab.jsx` + `/api/collections`。
- `/codex` 加「套牌」分组 + 「再差 N 张」高亮 + `markSetComplete`。
- 验收：「差一张就集齐」体验闭环。

**P5（可选）· 集卡被动效果注入**
- 仅在用户拍板要 dts 那种「卡片 effect」时做。落地为 `collection_sets.complete_rewards` 里的 `{kind:'unlock', effect_token, ...}`，由出勤准备/loadout 应用，复用 `02`/`equipmentEngine` effect 词汇。**默认不做、空配置 = 中性（§8）。**

**P6（可选 · 见 §9）· 残片重构**
- 按选定路径（A/B/C）执行。A 几乎无残片改动；B/C 才动 `fragments.js`/`archive`/`codex`。

---

## 6. 与现有 contracts 的关系（合并 or 并存）

`contracts` 与新成就引擎**机制同构**（事件→进度→奖励）。两条路：

- **路径甲（推荐 · 并存）**：contracts 保留为「**可接取的限时任务**」（玩家主动 accept、有 active/completed 生命周期）；achievements 是「**被动追踪的长期成就**」（无需 accept、跨周目累计）。语义不同，各管一摊，零迁移风险。
- **路径乙（统一）**：把 contracts 重构为 achievements 的「`needs_accept=true` 子类」。代价中等，收益是单引擎单后台。**建议先甲后乙**——甲先上线见效，乙作为后续清理（可作为 `01` 内容引擎收口的一部分）。

---

## 7. 安全 / 中性 / 迁移兜底

### 7.1 修正 contracts 的「名串引用」坑（顺带还债）

现状 `contracts` objectives/rewards 用 `itemName` / `npcName` 字符串匹配（`contracts.js:153-155`、reward 用 `r.name`，`contracts.js:137`）—— 这正是 dts「改名即断链」的坑在 DTSV 的残留。新成就引擎**一律用 ID**。迁移：`item_acquired` 钩子 payload 同时带 `itemId` + `itemName`（向后兼容 contracts 的名匹配，同时喂 ID 给成就），后续把 contracts 也切到 ID（路径乙时一并做）。**本系统不强制改 contracts，只是不重蹈覆辙。**

### 7.2 中性铁律（守 Phase 37「空配置 ⇒ 数值逐值不变」）

- 无 `achievements` 行 / 无 `collection_sets` 行 → 引擎 0 命中、0 写、0 副作用，对局数值与现状逐值相同。
- 集卡被动（P5）默认不启用；启用后 effect token 列表为空 = 不改任何战斗数值。
- 所有钩子调用 `try/catch` 包裹、best-effort（仿 `contracts.js` / `coldCases.js` 的 exception-safe），**绝不阻塞 raid 主流程**。
- 经济注水守护：成就/集卡发点数走 `creditPoints` 的既有口径，纳入 `v_weekly_stash_inflation` 监测（对照 `COLD_CASES` 注释里的 12% 周通胀红线，`constants.js:382-388`）；后台 authoring 时显示「该成就奖励 EV」估算辅助控量。

### 7.3 灰度 / 向后兼容

- 仿 `COLD_CASES` 的预埋开关模式（`constants.js:394-400`）：加 `COLLECTION_ACHIEVEMENT = { ENABLED, PASSIVE_EFFECTS_ENABLED, ... }` 到 `constants.js` 作单一真源，分阶段翻 true。
- 历史玩家：`player_achievements` / `player_item_dex` 缺行 = `counter 0` / 未持有，自然态，无需回填。可选「补登记」一次性脚本：扫 `player_fragments` 把已发现残片喂给 `fragment_decoded` 成就的初始 counter（幂等，跑一次）。
- 删模板行不级联玩家进度（`player_achievements.achievement_id` 是 CASCADE，但删成就=玩家进度一并清是预期；删道具→`collection_set_members` 走 §2.3 孤儿检查而非静默丢）。

---

## 8. 与六纪元叙事的关系（产品转向的核心权衡）

残片系统承载了大量已投入的 lore（六纪元、主线 F01-F15、知识图谱合成、断链悬案）。本设计的姿态是：**收集 meta 的清晰化 ≠ 推翻叙事**。

- 默认路径 A 下，残片**内容一字不动**，只是在 `/codex` 之上叠一层「套牌进度 + 再差 N 张」的清晰收集层 —— 把「太难懂」的根因（缺明确分母/即时反馈）解决，而非砍掉 lore。
- 「解码残片 → 主玩法世界看到对应 lore」的融合链路丢失问题（BR 转向遗留），属于**叙事呈现**议题，建议在 `narrative-vision.md` 与本系统的「成就/集齐 → 解锁 lore 展示」钩子里协同解决，不在本系统强行兜底。

---

## 9. 留给用户的开放决策（必须拍板）

### 决策一 · 残片系统去留（3 条路径，从轻到重）

| 路径 | 做什么 | 动哪些文件 | 代价 | 对六纪元叙事影响 |
|---|---|---|---|---|
| **A（轻 · 推荐）** | 残片内容/机制全保留；在 `/codex` 叠「套牌进度 + 再差 N 张 + 即时反馈」；成就引擎独立新增 | 仅**新增**（7 表 + 2 tab + 1 页）；`codex/page.js` 加分组区；`fragments.js` 不动 | 低 | **零影响**，lore 完整保留，只是更易读 |
| **B（中）** | 残片降为**纯叙事收藏**（去掉 decode_level 多级解码的「数值感」，只留发现/不发现两态）；集卡/成就承担全部「数值元进度」 | `fragments.js` 简化（去 decode 推进分支）；`archive`/`codex` 去解码条；`fragmentMeta.jsx` 改 | 中 | 中：叙事保留但「逐级解码」的仪式感弱化 |
| **C（重）** | 残片并入 `collection_set_members(ref_kind='fragment')`，废弃 `/archive` 知识图谱/断链悬案等重机制，统一到集卡/成就 | 删/改 `fragments.js` combo/coldCases、`archive/page.js` 大段、`coldCases.js` | 高 | 高：六纪元呈现需在新集卡框架里重做 |

> 推荐 **A**：风险最低、最快见效、不浪费已投入 lore，且「太难懂」的核心诉求（清晰收集 meta + 即时反馈）已被满足。B/C 留作后续若用户仍嫌残片机制重时再议。

### 决策二 · 集卡被动效果（P5 做不做）
dts 卡片有 `effect`（开局 exp=120 等，注入对局）。DTSV 要不要这层「集卡影响战力」？做了更像 dts、更有元进度激励，但增加平衡负担。**默认不做**（中性最安全），等用户明确要再开 P5。

### 决策三 · contracts 与成就引擎（甲并存 / 乙统一）
见 §6。建议先甲（并存）后乙（统一）。需用户确认是否接受最终把 contracts 合进成就引擎。

### 决策四 · 收集对象范围
集卡套牌成员目前限 `item`(合成链产物 03) + `fragment`(残片)。是否还要纳入 NPC 图鉴（「击败过的实体」）、地图/区块图鉴？纳入即给 `ref_kind` 加枚举值 + 对应持有源，引擎不变。

### 决策五 · 即时反馈强度
成就达成只冒结算日志一行，还是要更强的弹窗/动效（dts 是站内信 message）？影响前端工作量与打断感。
