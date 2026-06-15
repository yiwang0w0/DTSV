# 03 · 道具合成链 (Crafting / Synthesis) 实现级设计

> 子系统：crafting-synthesis · 状态：补完烂尾（引擎/UI/编辑器/分发已写，缺**内容 + RLS + 经济闭环 + 局外入口**）
> ROI 评级：**最高**（90% 代码已落地，缺口集中在「建表语义补丁 + 录数据 + 接经济 + 接撤离循环」）
> 依赖：**01 后台内容引擎**（authoring 地基，已大体就位）；**02 战斗钩子管线**（仅在「合成产物进战斗数值」处弱耦合，本子系统不改战斗）
> 红线：只取 dts「物品组合 → 升阶产物」的设计**意图**，落地全部 DTSV 原生（Postgres/JSONB/JS 纯函数）；引用一律 **ID + FK 完整性**，绝不照搬 dts 的 `eval(__MAGIC__)` / 名串匹配 / `$mixinfo` 全局数组。

---

## 0. 核实结论：代码已写、表已建，缺口与前序对比不完全一致

前序对比结论说「tier_recipes / recipe_ingredients 从未建 migration、线上查询报错」。**实测线上 DB（postgres MCP）后该结论已过时**，真实状态如下，本设计据此重写：

| 资产 | 前序结论 | 实测真相 | 结论 |
|---|---|---|---|
| `tier_recipes` 表 | 从未建 / 查询报错 | **已存在**，含 PK / FK(result_tier_id→equipment_tiers ON DELETE CASCADE) / **UNIQUE(result_tier_id)** | 表在，无需重建 |
| `recipe_ingredients` 表 | 从未建 | **已存在**，含 FK(recipe_id→tier_recipes CASCADE, item_id→item_pool SET NULL, equipment_tier_id→equipment_tiers SET NULL) | 表在 |
| 列名对齐代码 | 需建表对齐 | **完全对齐** `equipmentEngine.js` / `EquipmentSeriesSection.jsx` 的查询 | 无列名缺口 |
| **RLS** | — | `tier_recipes` / `recipe_ingredients` **rls_enabled = false**，但**已各有 2 条 policy（inert，未生效）** | **真实安全漏洞：表对 anon key 完全敞开写** |
| 配方数据 | 零配方 | `recipes=0, ingredients=0` | **真实缺口：零内容** |
| `equipment_tiers` 数据 | 8 件占位 | 实测 `series=5, tiers=17`（farstar 4 系列 8 件 + 旧 9 件） | 有底子，无深链（无 T3+ 串升） |
| `equipment_instances` | 假设 int id | **实测 id 是 UUID**（`gen_random_uuid()`），引擎/stash 用字符串 id 已自洽 | 注意：任何新 SQL 不可假设 int 实例 id |

> **真实缺口收敛为 5 条**：①RLS 关着（安全） ②`tier_recipes` policy 写权限过宽（`auth.role()='authenticated'` = 任意登录用户可写配方） ③零配方内容 ④`equipment_tiers` 无深链 ⑤引擎三处运行 bug（gold 未扣 / catalyst 未真正豁免 / 宽松匹配消耗 inventory 用名串）。**不需要重建表**，需要一支「**语义补丁 + RLS 修复** migration」+ 录数据 + 引擎补丁 + 局外入口。

锚点：
- 引擎：`src/lib/equipmentEngine.js:58`（getCraftingTree）、`:177`（checkCanCraft）、`:277`（executeCraft）、`:374`（consumeIngredients）、`:472`（rollbackCraftSideEffects）
- 玩家 UI：`src/app/game/[id]/CraftModal.jsx:31`（loadCraftables 查询）、`:98`（handleCraft）
- 后台编辑器：`src/app/admin/_tabs/EquipmentSeriesSection.jsx:223`（saveRecipe）、`:262`（addIngredient）、`:522`（配方 Drawer）
- 服务端分发：`src/lib/server/gameActions.js:3695`（action==='craft' → executeCraft + rollbackCraftResult on throw）
- 入口：`src/app/game/[id]/GameClientPage.jsx:814`（handleCraft）、`:1711`（合成按钮，`disabled={!me?.alive || room.gamestate===2}` ⇒ 仅 raid 内）
- 经济：`src/lib/server/points.js:18`（rarity→points 价值表）、`player_points` 表 ⇒ gold_cost 的天然后端
- 撤离循环：`src/lib/server/stash.js:31`（loadStash）、`:158`（moveEquipmentToStash）、`:168`（consumeForLoadout）

---

## 1. 目标与范围

### 1.1 目标
让「**带材料回港 → 在编辑器录好的配方表里合成 → 升阶装备 → 下次带入 raid**」成为撤离-入库循环的核心回报闭环。具体：
1. **修复**已落地引擎/UI/编辑器的 3 个运行 bug + RLS 安全漏洞，让现有「装备合成」按钮立即真正可用、且写入路径安全。
2. **录入首批配方**：用现成 `EquipmentSeriesSection` 编辑器，把 `item_pool` 材料 → `equipment_tier` 产物串成 T1→T2→T3 升阶链，`success_rate<1` + `fail_behavior` 复刻 dts 的「合成有风险」手感。
3. **接经济**：`gold_cost` 真正从 `player_points` 扣（目前是死值）。
4. **接撤离循环**：新增**局外（lobby/stash）合成入口**，让「带材料回港合成」成立——这是撤离回报的兑现点。

### 1.2 范围（PVE 搜打撤 + PVPVE，不做 dts 13 模式广度）
- **做**：装备升阶链（series→tier 金字塔，已有模型）；item→equipment 配方；前置装备消耗（精确 / 宽松变体）；成功率 + 失败行为；催化剂（持有不消耗）；局内合成 + **局外合成**。
- **不做（本期）**：dts 的 `overlay`（叠加合成）/ `sync`（同步合成）双隐藏分支（`smartmix/main.php:64,75`）——意图过重，先做主线 normal 合成。隐藏配方（dts `class='hidden'`）作为 §7 开放决策留给用户。
- **明确不碰**：战斗结算逻辑（守 Phase 37「空配置⇒数值逐值不变」铁律——合成只改 `equipment_instances` 行，产物属性走既有 `equipment_tiers.base_*`，战斗读法不变）。`br_match*` 第二实现按项目记录 teardown，不接合成。

### 1.3 dts 意图 vs DTSV 落地（红线对照表）
| dts 做法（`smartmix/main.php` + `itemmix`） | 必须丢弃的原因 | DTSV 原生落地 |
|---|---|---|
| `eval(__MAGIC__)` / `eval(import_module(...))` | 任意代码执行 | 纯 JS 函数 `executeCraft` |
| `in_array($itm, $ma['stuff'])` 名串匹配原料 | 改名即断链 | `recipe_ingredients.item_id` / `equipment_tier_id` 走 **FK ID 引用** |
| `$mixinfo` 全局数组（PHP include 文件即配方） | 配方=代码，无法 authoring | 配方=DB 行，编辑器 CRUD |
| `itemmix_name_proc` / `htmlspecialchars_decode` 名归一化 | 名是主键的恶果 | id 是主键，名只做展示 |
| `full_combination($packn,2)` 暴力枚举背包组合 | O(n²) 试错 | 玩家显式选目标 tier，引擎只验单配方 |
| `class='hidden'` 隐藏配方靠名串藏 | — | 列化 `is_hidden boolean`（§7 决策） |

---

## 2. 数据模型

> **不重建表**。现有 `tier_recipes` / `recipe_ingredients` 列名/类型/FK 已对齐代码。本节给出 (a) 现状快照 (b) 一支**幂等补丁 migration**（RLS 修复 + 语义约束 + 索引），沿用项目 `phase-34-room-items.sql` 的 BEGIN/COMMIT + `pg_constraint` 检测 + COMMENT + 验证块范式。

### 2.1 现状（实测，作为权威基线）

```
tier_recipes
  id                       int  PK
  result_tier_id           int  NOT NULL  FK→equipment_tiers(id) ON DELETE CASCADE  UNIQUE   -- 一个 tier 最多一条配方
  recipe_name              text DEFAULT ''
  requires_prev_tier_id    int  NULL  FK→equipment_tiers(id) ON DELETE SET NULL   -- 精确前置变体
  requires_prev_series_id  int  NULL  FK→equipment_series(id) ON DELETE SET NULL  -- 宽松：本系列
  requires_prev_tier_num   int  NULL                                             -- 宽松：第几阶
  gold_cost                int  NOT NULL DEFAULT 0
  success_rate             double precision NOT NULL DEFAULT 1.0
  fail_behavior            text NOT NULL DEFAULT 'keep_materials'                 -- keep_materials|lose_materials|downgrade
  created_at               timestamptz DEFAULT now()

recipe_ingredients
  id                 int  PK
  recipe_id          int  NOT NULL  FK→tier_recipes(id) ON DELETE CASCADE
  ingredient_type    text NOT NULL DEFAULT 'item'        -- 'item' | 'equipment'
  item_id            int  NULL  FK→item_pool(id) ON DELETE SET NULL
  equipment_tier_id  int  NULL  FK→equipment_tiers(id) ON DELETE SET NULL
  quantity           int  NOT NULL DEFAULT 1
  is_consumed        bool NOT NULL DEFAULT true
  is_catalyst        bool NOT NULL DEFAULT false
```

### 2.2 补丁 migration（`scripts/phase-42-crafting-recipes-rls.sql`，只写不跑）

补丁要做 4 件事，每件都幂等：

**A. 修复 RLS（最高优先 · 安全）** —— 当前 `rls_enabled=false` 但有 2 条 policy（敞口）。打开 RLS，并收紧写权限：读公开（玩家 UI / 编辑器要查配方），写仅 service_role（编辑器经服务端写，玩家端永不直写配方）。

```sql
BEGIN;

-- A1. 打开 RLS（policy 已存在但 inert）
ALTER TABLE tier_recipes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients  ENABLE ROW LEVEL SECURITY;

-- A2. 重置过宽的写 policy（原 admin_write_* = auth.role()='authenticated' ⇒ 任意登录用户可写配方）
DROP POLICY IF EXISTS admin_write_recipes      ON tier_recipes;
DROP POLICY IF EXISTS admin_write_ingredients  ON recipe_ingredients;
-- 读：保留公开读（玩家 CraftModal / checkCanCraft 用 anon/authenticated 查）
DROP POLICY IF EXISTS read_tier_recipes        ON tier_recipes;
DROP POLICY IF EXISTS read_recipe_ingredients  ON recipe_ingredients;
CREATE POLICY recipes_public_read     ON tier_recipes       FOR SELECT USING (true);
CREATE POLICY ingredients_public_read ON recipe_ingredients FOR SELECT USING (true);
-- 写：仅 service_role（编辑器保存配方改走服务端 server action，见 §3.4）。
--     与 player_death_log「service_role 写、玩家只读」同安全模型（death-log-schema.sql:23）。
CREATE POLICY recipes_service_write     ON tier_recipes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ingredients_service_write ON recipe_ingredients
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

> ⚠ **联动改动（§3.4 必读）**：收紧写 policy 后，现编辑器 `EquipmentSeriesSection.saveRecipe()` 用浏览器 anon client 直写 `tier_recipes` 会被 RLS 挡。必须把配方保存改走服务端（service_role）。这是本补丁的**唯一破坏性联动**，灰度见 §6。

**B. 语义完整性约束**（`pg_constraint` 检测后 ADD，幂等）：

```sql
-- B1. ingredient_type XOR 引用列（仿 room_items_kind_xor，phase-34:163）
--     'item'→item_id 非空且 equipment_tier_id 空；'equipment'→反之。
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='recipe_ingredients_kind_xor'
                 AND conrelid='recipe_ingredients'::regclass) THEN
    ALTER TABLE recipe_ingredients ADD CONSTRAINT recipe_ingredients_kind_xor CHECK (
      (ingredient_type='item'      AND item_id IS NOT NULL AND equipment_tier_id IS NULL)
   OR (ingredient_type='equipment' AND equipment_tier_id IS NOT NULL AND item_id IS NULL)
    );
  END IF;
END $$;

-- B2. quantity >= 1
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='recipe_ingredients_qty_pos'
                 AND conrelid='recipe_ingredients'::regclass) THEN
    ALTER TABLE recipe_ingredients ADD CONSTRAINT recipe_ingredients_qty_pos CHECK (quantity >= 1);
  END IF;
END $$;

-- B3. success_rate ∈ [0,1]
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tier_recipes_rate_unit'
                 AND conrelid='tier_recipes'::regclass) THEN
    ALTER TABLE tier_recipes ADD CONSTRAINT tier_recipes_rate_unit CHECK (success_rate >= 0 AND success_rate <= 1);
  END IF;
END $$;

-- B4. gold_cost >= 0
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tier_recipes_gold_nonneg'
                 AND conrelid='tier_recipes'::regclass) THEN
    ALTER TABLE tier_recipes ADD CONSTRAINT tier_recipes_gold_nonneg CHECK (gold_cost >= 0);
  END IF;
END $$;

-- B5. fail_behavior 枚举白名单
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tier_recipes_fail_enum'
                 AND conrelid='tier_recipes'::regclass) THEN
    ALTER TABLE tier_recipes ADD CONSTRAINT tier_recipes_fail_enum
      CHECK (fail_behavior IN ('keep_materials','lose_materials','downgrade'));
  END IF;
END $$;

-- B6. 宽松前置一致性：series_id 与 tier_num 必须同时给或同时空（避免半截配置导致引擎宽松分支误判）
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tier_recipes_flexprev_pair'
                 AND conrelid='tier_recipes'::regclass) THEN
    ALTER TABLE tier_recipes ADD CONSTRAINT tier_recipes_flexprev_pair CHECK (
      (requires_prev_series_id IS NULL) = (requires_prev_tier_num IS NULL)
    );
  END IF;
END $$;
```

**C. 索引**（引擎热查询路径）：

```sql
-- checkCanCraft / getCraftingTree 按 result_tier_id 查（已有 UNIQUE 隐式索引，足够）。
-- recipe_ingredients 按 recipe_id 查（每次合成都 join），补显式索引：
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
-- 宽松前置：consumePrevTierForCraft 按 (series_id, tier) 查 equipment_tiers，补复合索引：
CREATE INDEX IF NOT EXISTS idx_equipment_tiers_series_tier ON equipment_tiers(series_id, tier);
```

**D. COMMENT + 验证块**（沿用 phase-34 范式，略；验证查 `relrowsecurity=true`、6 条 CHECK 在位、2 索引在位）。

```sql
COMMIT;
```

### 2.3 不引入新表的理由
- 配方与升阶链完全可由 (tier_recipes 1:1 tier) + (recipe_ingredients N:1 recipe) 表达，金字塔结构已由 `equipment_series.max_tier` + `equipment_tiers.tier/variant` 承载。
- 局外合成**不需要新表**：复用 §4.4 的 stash 读写（`player_stash` 道具 + `equipment_instances WHERE room_id IS NULL` 在库装备）。

---

## 3. 后台编辑（在内容引擎里 authoring）

> 编辑器 `EquipmentSeriesSection.jsx` **已是成品**（系列 CRUD + tier CRUD + 配方 Drawer + 金字塔预览 + 材料行增删 + catalyst/consumed 勾选 + 配方预览）。本节列「直接可用的部分」与「§3.4 必须改的写路径」。

### 3.1 已可用的 authoring 能力（核实过，无需改）
- **系列**（`saveSeries:173`）：name/slot/max_tier/description/icon。
- **阶级 tier**（`saveTier:194`）：name/tier/variant/rarity/base_atk/def/hp/durability_max/atk_pct%/element/passive_skill_id/req_level。variant 空串自动转 NULL（`:198`，主线/变体语义正确）。
- **配方**（`saveRecipe:223`）：recipe_name / requires_prev_tier_id（精确）或 requires_prev_series_id+tier_num（宽松，二选一互斥，UI `:536`/`:549` 已做 disable 互斥）/ gold_cost / success_rate / fail_behavior / 材料行（item|equipment + quantity + is_consumed + is_catalyst）。
- **金字塔预览**（`PyramidView:47`）：实时按 tier 分层、显示变体数、ATK/DEF、被动、材料数。即「预览」需求已满足。

### 3.2 字段校验（编辑器侧补强 — 配合 §2.2 的 DB CHECK 做双层）
现编辑器仅校验 `name.trim()`（`:174`/`:195`）。建议在 `saveRecipe` 前置校验（避免 DB CHECK 报错直接抛给 admin）：
1. T≥2 的 tier 配方应有前置（精确 or 宽松其一），否则 toast 警示「T2+ 通常应消耗前一阶」（warn 非 block，留隐藏配方/特殊配方空间）。
2. 材料行 item/equipment 已选（现 `saveRecipe:246` 已 `.filter(i => i.item_id || i.equipment_tier_id)` 过滤空行，good）。
3. success_rate ∈ [0,1]、quantity ≥ 1（DB 已兜底，UI 提示更友好）。
4. **防自引用环**：`requires_prev_tier_id !== result_tier_id`，且不应指向更高 tier（防 T2 要求 T3 这种倒挂死链）。

### 3.3 预览增强（可选，低优先）
配方 Drawer 已有「📋 配方预览」（`:605`）。可加一行**实时成功期望**：`E[材料损耗] = (1-success_rate)·(lose_materials?材料:0)`，帮策划直觉量化风险手感。纯前端计算，零 DB。

### 3.4 ⚠ 必改：配方保存改走服务端（RLS 收紧的联动）
§2.2-A 把写 policy 收成 service_role-only 后，`saveRecipe`（`:237` `supabase.from('tier_recipes').update(...)`）用浏览器 anon client 会被挡。改法：
- 新增服务端 action：`src/lib/server/adminActions.js`（或并入 gameActions 的 admin 分支）`saveRecipe(client/*service_role*/, payload)`，做 (a) admin 鉴权（复用 `src/lib/auth.js isAdmin` / `PRIMARY_ADMIN_EMAIL`） (b) upsert tier_recipes (c) 删旧 ingredients + 插新（保持现 `:243` 的「先删后插」事务语义，但**放进单个 RPC/事务**避免半截）。
- 编辑器 `saveRecipe` 改为 `postGameApi('/api/admin/recipe', payload)`。
- **收益顺带**：解决现编辑器 `:243` 删插非原子的隐患（删 ingredients 后插失败 ⇒ 配方变空，无回滚）。服务端事务一次性解决。

---

## 4. 运行端集成（DTSV 哪个文件怎么消费）

### 4.1 数据流（已接通的主干）
```
玩家点「装备合成」(GameClientPage:1711, 仅 raid 内)
  → CraftModal 打开 → loadCraftables (CraftModal:37) 查 equipment_tiers + recipe(tier_recipes) + ingredients
  → 选目标 tier → checkCanCraft (equipmentEngine:177) 算 canCraft/missing → 预览
  → 「开始合成」→ handleCraft (GameClientPage:814) → runEquipmentAction('craft',{resultTierId})
  → POST → executeEquipmentAction (gameActions:3695) → executeCraft (equipmentEngine:277)
       ├ checkCanCraft 复验（服务端权威）
       ├ roll <= success_rate 判定
       ├ 成功：consumeIngredients(扣 inventory) + consumePrevTierForCraft(删前置 instance) + INSERT 新 instance
       └ 失败：按 fail_behavior 处理（keep/lose/downgrade）
  → persistRoom 写 gamevars + log；throw 时 rollbackCraftResult → rollbackCraftSideEffects (equipmentEngine:472)
```
此主干**已工作**（接线齐全，rollback 齐全），录入配方即可跑通。以下是**必修的 3 个运行 bug**。

### 4.2 ⚠ Bug 1：`gold_cost` 从不扣（经济闭环缺口）
- 现状：`checkCanCraft:254` 有 `// missing.push(...) — 待接入金币系统` 死注释；`executeCraft` 全程不碰金币；UI（CraftModal:174）显示 gold_cost 但纯装饰。
- 落地：DTSV 没有「gold」，有 `player_points`（`points.js`）。决策（§7）后二选一：
  (a) `gold_cost` 语义重定义为「价值点数（low_equip_pt 或专用 craft_pt）」，`executeCraft` 成功分支前先 `checkPoints(ownerId) >= gold_cost`，失败入 missing；成功后 `deductPoints(ownerId, gold_cost)`。
  (b) 本期 gold_cost 一律录 0（编辑器默认即 0），引擎不接经济，先跑通材料合成，经济作为 §7 后续 phase。
- 推荐 (b) 先上线（零经济耦合、零风险），(a) 排进 §5 Phase D。

### 4.3 ⚠ Bug 2：catalyst / is_consumed=false 实际仍被消耗逻辑漏判
- `consumeIngredients:380` 只在 `ing.is_consumed && ...` 时移除 ⇒ catalyst（is_consumed 应为 false）**不消耗，正确**。但 `checkCanCraft:242` 的材料检查**对 catalyst 也只查 item 且未区分**——catalyst 需「持有但不消耗」，当前逻辑「持有量 < quantity 即 missing」对 catalyst 是对的（要求持有），故功能正确，但**语义未显式标注**，且 `is_catalyst` 字段在引擎里**完全没读**（只靠 is_consumed=false 间接生效）。
- 落地：在编辑器保存时保证 `is_catalyst=true ⇒ is_consumed=false`（互斥语义，UI 或 §3.4 服务端兜底），引擎行为即正确。低风险，归类「语义清洁」而非阻断 bug。

### 4.4 ⚠ Bug 3 + 主要新功能：局外（撤离回报）合成入口不存在
- 现状：合成按钮 `disabled={!me?.alive || room.gamestate===2}`（`GameClientPage:1711`）⇒ **只能在 raid 内合成**。`executeCraft` 全程依赖 `gamevars.players[ownerId].inventory`（局内背包）与 `equipment_instances WHERE room_id = 当前roomId`。
- 缺口：用户拍板「带材料回港合成 = 撤离回报」。局外（lobby/stash 页）没有 raid roomId、没有 gamevars，材料在 `player_stash`、装备在 `equipment_instances WHERE room_id IS NULL`。现引擎**无法直接复用**。
- 落地（最干净的方案，避免改动局内主干）：新增**局外合成路径** `executeStashCraft(resultTierId, ownerId, client/*service_role*/)`：
  - 读材料：`player_stash`（`stash.loadStash`）替代 gamevars.inventory；
  - 读前置装备：`equipment_instances WHERE owner_id=? AND room_id IS NULL`（在库）替代局内；
  - 复用 `checkCanCraft` 的纯校验（传入从 stash 构造的 inventoryMap + 在库装备列表，**checkCanCraft 已是 client 无关纯查询**，无需改）；
  - 成功：`removeItemsFromStash`（扣库材料，`stash.js:118`）+ 删在库前置 instance + INSERT 新 instance（room_id=NULL，即直接进库）；
  - 失败：fail_behavior 同语义（lose→扣库材料；downgrade→改在库前置 durability）。
  - rollback：复用 `rollbackCraftSideEffects` 形状（insertedInstanceId / deletedInstances / degradedInstances）+ stash 扣减回滚。
  - 入口 UI：在 `PrepareModal`（局外装备/装载界面，已 import `equipment_tiers`）或 stash 页加「合成」Tab，复用 `CraftModal` 组件（传 stash 来源的 player.inventory 形状）。
- **为何不直接放宽局内按钮**：局外没有 room/gamevars/persistRoom，硬塞会污染局内 resolution 管线。独立 `executeStashCraft` + service_role 写，隔离干净。

### 4.5 中性保证（与战斗解耦）
合成只 INSERT/DELETE/UPDATE `equipment_instances` 行 + 改 inventory/stash。产物属性走既有 `equipment_tiers.base_atk/def/hp/element/passive_skill_id`，**战斗读法（combatStats.js / 单发战斗）完全不变**。零配方时 CraftModal 列表为空（`CraftModal:54` filter 掉无配方 tier），按钮在但无可选项 ⇒ **空配置 = 现状不变**，守 Phase 37 铁律。

---

## 5. 分阶段落地（每步独立上线，标先后）

| Phase | 标题 | 内容 | 独立可上线 | 依赖 |
|---|---|---|---|---|
| **A** | RLS 修复 + 语义约束 migration | `scripts/phase-42-crafting-recipes-rls.sql`（§2.2 A/B/C/D）。**只写不跑**，主代理审后 postgres MCP 执行。 | ✅ 安全补丁，零行为变化（零配方时） | — |
| **B** | 配方保存改服务端 | §3.4：admin server action + 编辑器改 postGameApi。配合 A 的 RLS 收紧。 | ✅ 编辑器恢复可写（A 之后必须） | A |
| **C** | 录首批升阶链 | 用编辑器为 1-2 个 weapon series 录 T1→T2→T3：T1 配方=纯 item_pool 材料；T2 配方=T1 成品(精确/宽松)+材料+success_rate 0.8;T3=T2+稀有材料+0.6+downgrade。`equipment_tiers` 扩到深链。 | ✅ 局内合成立即真可用 | A,B,01 编辑器 |
| **D** | gold_cost 接经济（可选） | §4.2(a)：gold_cost→player_points 扣减。或本期跳过（录 0）。 | ✅ | C |
| **E** | 局外合成入口（撤离回报） | §4.4：`executeStashCraft` + PrepareModal/stash 页「合成」Tab 复用 CraftModal。 | ✅ 撤离循环闭合 | C, stash 系统(已在) |
| **F** | 引擎语义清洁 | catalyst↔is_consumed 互斥兜底、宽松匹配消耗用 id 而非名串复核、防自引用环编辑器校验。 | ✅ 健壮性 | C |

> **firstBuildableStep = Phase A**（RLS 修复 migration）：纯安全补丁，零配方时零行为变化，可独立审查执行，立即堵住「配方表对 anon key 敞开写」的真实漏洞，且为后续所有步骤扫清安全前提。

---

## 6. 安全 / 中性 / 迁移兜底

- **向后兼容**：表已存在、列名不变、不 DROP 任何列 ⇒ 现引擎/UI/编辑器查询**零改写即继续工作**（除 §3.4 配方写路径因 RLS 收紧而必须改，这是有意的安全收紧，灰度：先上 A+B 同一批，避免编辑器「能读不能写」窗口期）。
- **空配置中性**：`recipes=0` 时 CraftModal 列表空、按钮无害（守 Phase 37）。录入是纯加法，不改任何现有 tier 数值，不触战斗。
- **RLS 灰度**：A（开 RLS + 收紧写）与 B（写改服务端）**必须同批上线**或 B 先于 A。若分批，A 单独上会导致编辑器 anon 写被挡（admin 无法保存配方）——这是已知顺序约束，文档强标。
- **幂等**：migration 全文 BEGIN/COMMIT + `IF NOT EXISTS` + `pg_constraint` 检测 + `DROP POLICY IF EXISTS` 后重建，可重复执行（仿 phase-34）。
- **回滚**：合成运行期有 `rollbackCraftSideEffects`（已存在）；局外路径补 stash 扣减回滚（§4.4）。migration 回滚 = 关 RLS + DROP 新增 CHECK（保留旧 policy 不动则零数据风险）。
- **不部署**：migration 文件只写不跑，由主代理审后用 postgres MCP 执行（沿用 phase-33/34 模式）。
- **UUID 注意**：`equipment_instances.id` 是 UUID，任何新 SQL/server 代码处理实例 id 用字符串，不可假设 int 自增。
- **dts 红线复核**：零 PHP、零 eval、零名串匹配（材料/前置全 FK id 引用）、零全局数组（配方=DB 行）、零 MyISAM（Postgres + FK + RLS）。✅

---

## 7. 留给用户的开放决策

1. **gold_cost 经济**：(a) 接 `player_points`（合成消耗点数，强化「点数=硬通货」）还是 (b) 本期纯材料合成、gold_cost 一律录 0 后续再说？（推荐 b 先上）
2. **失败手感强度**：首批配方默认 `fail_behavior` 用哪个？dts 是「有风险」感——`lose_materials`（狠，材料没）/ `downgrade`（前置装备受损）/ `keep_materials`（仁慈，可重试）。建议低阶 keep、高阶 lose/downgrade 制造决策张力。要不要全局兜底「至少前 N 次必成功」防新手劝退？
3. **隐藏配方**：dts 有 `class='hidden'`（不在提示里显示、要玩家试出来）。要不要加 `tier_recipes.is_hidden boolean`？（本期默认全显式可见）
4. **局外 vs 局内合成的边界**：合成是否应**只**在港口（局外 stash）做（强化「回港兑现」仪式感、撤离回报更聚焦），还是局内也保留（raid 中临场升阶）？影响 §4.4 是否要禁用局内按钮。
5. **集卡/成就回归 dts 模型**：用户已表态「残片系统太难懂」。本子系统不直接做集卡，但合成产出/配方解锁是否要挂未来的成就/图鉴解锁条件（`equipment_series.unlock_condition` jsonb 列**已存在**但未用）？这是与 04/06 的接口预留点，需用户确认是否在 03 阶段就埋钩子。
6. **dts overlay/sync 双合成分支**：本期明确不做。确认这两类隐藏合成永久砍掉，还是排进远期 backlog？
