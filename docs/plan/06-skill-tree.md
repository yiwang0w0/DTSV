# 06 · 技能树 (Skill Tree) — 实现级设计文档

> 排在合成链 (03 道具) 之后再认真做。
> **启动门槛：02 战斗钩子管线 + 01 后台内容引擎 必须先落地**（本文档标注为「02+03 之后启动」）。
> 北极星：技能 = **数据定义的 pipeline modifier**（注册到已有战斗/搜索/污染/Ω 等系统的命名 tap）+ 触发事件被动 + 树状前置（prereq by ID）。
> 配套已落地基石：`docs/unified-combat-npc-design.md`（统一战斗·02 雏形）、`docs/map-room-item-editor-design.md`（placement_rules authoring 范式·01 雏形）。

---

## §0 一句话定位 + 与既有系统的关系

DTSV **已经存在一个 modifier pipeline**，只是没人叫它这个名字：职业 `classes.perks`（JSONB 白名单）在入场时被聚合进 `player.classPerks`，然后被各系统在**命名 tap 点**逐个读取消费。技能树要做的不是发明新引擎，而是**复用同一条管线**：

- **职业 perk** 已能转 pipeline modifier（`combat_dmg_mult` 等 8 个白名单 key）——`src/lib/server/classes.js:15-24`。
- **统一战斗** `computeCombatStats(entity)` 已读 `entity.classPerks` 当 classMult 分量——`src/lib/combatStats.js:43-71`。玩家 = NPC = 探针 同一函数。
- **装备被动** `passive_skills` 表 + `triggerPassives(event, ...)` 已是「触发事件 + 效果」的现成范式——`src/lib/equipmentEngine.js:552-625`。

**结论：技能 = 一份「与职业 perk 同口径、可叠加」的 modifier，外加（可选）一条 `passive_skills` 风格的触发被动；技能树 = 节点 + prereq（ID 引用）+ 点数门控。** 玩家选完职业后，把已习得技能的 modifier **合并进同一个 `player.classPerks` 聚合**（同时把技能携带的触发被动并进 `_pass`），下游所有 tap 点**一行不改**即自动生效。NPC 复用同一条解析路径（`resolveNpcCombatProfile`）。

---

## §1 目标与范围

### 1.1 目标
1. 后台可**填表 authoring** 一棵/多棵技能树：节点（modifier + 可选触发被动）、前置（prereq）、点数成本——无需写代码（红线①：内容引擎为主轴）。
2. 运行端**零硬编码**消费：技能 modifier 走与职业 perk **完全相同**的命名 tap 聚合；触发被动走 `triggerPassives`。新增 tap 走「白名单扩展」而非散落 `if`。
3. **玩家与 NPC 共用**同一技能解析（dts 的 NPC 也挂技能；DTSV 已统一玩家=NPC stat，技能是自然延伸）。
4. **空配置 ⇒ 数值逐值不变**（Phase 37 中性铁律）：没建任何技能树 / 玩家没习得任何技能 ⇒ `player.classPerks` 与今天逐 key 相同 ⇒ 全战斗/搜索/污染/Ω 输出逐值不变。

### 1.2 范围内
- 模式：**搜打撤 PVE + PVPVE**（红线②，不碰 dts 13 模式广度）。技能在这两种模式同样生效（modifier 与模式无关，PVP 段也读同一 `classPerks`）。
- 技能效果**只能**是：① 命名 modifier（加进 `classPerks` 聚合的白名单 key）；② 一条触发被动（复用 `passive_skills` 形状的内联定义或引用现有 `passive_skills.id`）。**不引入新的 eval / formula 字符串入口**（见 §6 红线）。
- 习得时机：**入场前**（PrepareModal）选树/点节点，与选职业同一时刻；习得状态按 raid 记录（镜像 `player_class_runs`）。

### 1.3 范围外（明确不做 / 留后续）
- 局内动态加点（打到一半升级）——本期只入场前点满；局内加点留后续。
- 主动技能（手动释放、带 CD 的玩家指令）——本期只做**被动 modifier + 触发被动**。主动技能是另一条交互链（需 UI 按钮 + action 路由），单列后续。
- 技能数值的「平衡重排」——给默认中性 + 工具，数值由用户主导（同 Phase C 思路）。

---

## §2 数据模型（真实 SQL）

> 迁移文件：`scripts/phase-42-skill-tree.sql`（编号接 phase-39 之后的下一个空档，落地时确认最新号）。全程 `BEGIN; ... COMMIT;`、`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` 幂等（红线⑤，沿用 phase-24c/37 惯例）。

### 2.1 `skill_trees` — 技能树容器（authoring 顶层）
```sql
CREATE TABLE IF NOT EXISTS skill_trees (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  description   TEXT NOT NULL DEFAULT '',
  -- 可空职业门控：非空 → 该树仅对此职业可见/可点（镜像 shop_catalog.required_class_ids 范式）
  class_id      BIGINT REFERENCES classes(id) ON DELETE SET NULL,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS skill_trees_enabled_idx ON skill_trees(enabled, display_order);
COMMENT ON TABLE skill_trees IS '技能树容器。class_id 非空 = 职业专属树（NULL = 通用，所有职业可点）。';
```

### 2.2 `skill_nodes` — 技能节点（modifier + 可选触发被动 + 树坐标）
```sql
CREATE TABLE IF NOT EXISTS skill_nodes (
  id              BIGSERIAL PRIMARY KEY,
  tree_id         BIGINT NOT NULL REFERENCES skill_trees(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  icon            TEXT NOT NULL DEFAULT '✦',

  -- ── 成本 / 门控 ──
  cost            INTEGER NOT NULL DEFAULT 1 CHECK (cost >= 0),   -- 习得需消耗的 skill_pt
  max_rank        INTEGER NOT NULL DEFAULT 1 CHECK (max_rank >= 1), -- 可叠点次数（>1 = 每点叠加 modifiers 一份）

  -- ── 效果 A：命名 modifier（与 classes.perks 同口径，叠加进 classPerks 聚合） ──
  --   形如 { "combat_dmg_mult": 0.05, "search_bonus": 0.03 }
  --   仅接受 §2.5 白名单 key；非白名单 key 在 authoring 校验期拒绝、运行期 filterSkillModifiers 丢弃。
  modifiers       JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- ── 效果 B（可选）：触发被动 —— 引用现有 passive_skills 行（ID 引用，避免重复定义/改名断链） ──
  passive_skill_id BIGINT REFERENCES passive_skills(id) ON DELETE SET NULL,

  -- ── 树坐标（前端布局，不影响运行）──
  grid_x          INTEGER NOT NULL DEFAULT 0,
  grid_y          INTEGER NOT NULL DEFAULT 0,

  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS skill_nodes_tree_idx ON skill_nodes(tree_id);
COMMENT ON COLUMN skill_nodes.modifiers IS
  '命名 modifier（白名单 key，同 classes.perks 口径）。习得后逐 key 叠进 player.classPerks。max_rank>1 时每点叠一份。';
COMMENT ON COLUMN skill_nodes.passive_skill_id IS
  '可选触发被动，FK passive_skills.id（不内联定义，复用装备被动表 → 改名/改数值不断链）。';
```

> **为何 passive 用 FK 而非内联**：红线⑤「引用一律 ID + 引用完整性」。`passive_skills` 已是装备被动的单源；技能复用同一行 = 同一处编辑、`triggerPassives` 同一执行路径，杜绝「技能侧抄一份被动定义」的双胞胎漂移。

### 2.3 `skill_node_prereqs` — 前置边（树状 DAG，ID 引用）
```sql
CREATE TABLE IF NOT EXISTS skill_node_prereqs (
  id            BIGSERIAL PRIMARY KEY,
  node_id       BIGINT NOT NULL REFERENCES skill_nodes(id) ON DELETE CASCADE,   -- 想点的节点
  requires_id   BIGINT NOT NULL REFERENCES skill_nodes(id) ON DELETE CASCADE,   -- 必须先点的前置
  min_rank      INTEGER NOT NULL DEFAULT 1 CHECK (min_rank >= 1),               -- 前置至少点到几 rank
  CONSTRAINT skill_prereq_no_self CHECK (node_id <> requires_id),
  UNIQUE (node_id, requires_id)
);
CREATE INDEX IF NOT EXISTS skill_node_prereqs_node_idx ON skill_node_prereqs(node_id);
COMMENT ON TABLE skill_node_prereqs IS
  '前置边（多前置 = 多行；语义 AND，全满足才可点）。FK 双向 CASCADE → 删节点自动清边，无悬挂引用（避免 dts 名串匹配断链）。';
```
> **环检测**：DAG 由 authoring 期校验（§3.3）+ 运行期 `canAcquireNode` 的可达性遍历共同保证；DB 层用 `node_id <> requires_id` 挡自环，多跳环靠应用层拓扑校验（PG 无原生防环约束，沿用应用层守卫惯例）。

### 2.4 `player_skill_runs` — 玩家本局习得状态（镜像 `player_class_runs`）
```sql
CREATE TABLE IF NOT EXISTS player_skill_runs (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id       INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
  node_id       BIGINT NOT NULL REFERENCES skill_nodes(id) ON DELETE CASCADE,
  rank          INTEGER NOT NULL DEFAULT 1 CHECK (rank >= 1),
  acquired_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, room_id, node_id)
);
CREATE INDEX IF NOT EXISTS player_skill_runs_user_room_idx ON player_skill_runs(user_id, room_id);
COMMENT ON TABLE player_skill_runs IS
  '每 raid 习得的技能节点（镜像 player_class_runs）。room_id NULL = 跨局持久档（后续可选）；本期按 room 记录。';
```

### 2.5 modifier 白名单（运行 + authoring 双闸）— **扩展 `PERK_WHITELIST`，不另起炉灶**
技能 modifier 与职业 perk **共用同一个白名单**（`src/lib/server/classes.js:15` 的 `PERK_WHITELIST`）。这样技能产出的 modifier 能直接叠进 `classPerks`，下游 tap 零改动。已有 8 个：
`search_bonus / pollution_resist / combat_dmg_mult / combat_def_mult / combat_hp_mult / omega_window_bonus / fragment_drop_bonus / catalog_unlock_tag`。

**叠加语义**（关键，决定「职业 + 技能」如何合并）：
| key 类型 | 例 | 合并规则 |
|---|---|---|
| 乘区类（×(1+x)） | `combat_dmg_mult` 等 | **相加**后再进 `(1+Σ)` —— 职业 0.10 + 技能 0.05 → classPerks 存 0.15。`computeCombatStats` 不变（它只读最终 key）。 |
| 加值类 | `search_bonus` / `fragment_drop_bonus` / `omega_window_bonus` | **相加**。 |
| 标签类 | `catalog_unlock_tag` | 单值（技能不产标签，本期 authoring 期对该 key 在 skill_nodes 拒绝）。 |

> 加法叠加保证「空技能 ⇒ Σ技能=0 ⇒ classPerks 逐值 == 仅职业」——中性铁律的数学闭环。新增 modifier key 时，**同步**在 `PERK_WHITELIST` 与对应 tap 点二处登记（白名单扩展模式，见 §4.4）。

### 2.6 `game_rules` 新增：skill_pt 预算
点数预算用 `game_rules`（已有 K/V 配置表，`gameEngine.js:60-89`），无需新表：
```sql
INSERT INTO game_rules (key, value) VALUES ('skill_pt_per_raid', '3')
  ON CONFLICT (key) DO NOTHING;   -- 默认每局 3 点；0 = 技能系统事实关闭（中性灰度开关）
```

### 2.7 RLS（沿用 phase-27 范式）
- `skill_trees` / `skill_nodes` / `skill_node_prereqs`：**全部已登录用户可读**（`enabled=true`），写仅 admin（service-role 旁路 / admin policy）。authoring 走 admin 客户端。
- `player_skill_runs`：`SELECT/INSERT/DELETE` 仅 `user_id = auth.uid()`；写实际由服务端 `commitSkillChoices` 在 service-role 上下文做（同 `commitClassChoice` 写 `player_class_runs`）。
```sql
ALTER TABLE skill_trees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS skill_trees_select ON skill_trees;
CREATE POLICY skill_trees_select ON skill_trees FOR SELECT USING (enabled = true);
-- skill_nodes / skill_node_prereqs 同形（select enabled / 关联 enabled tree）
ALTER TABLE player_skill_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS psr_own ON player_skill_runs;
CREATE POLICY psr_own ON player_skill_runs FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

---

## §3 后台编辑（在内容引擎里 authoring）

### 3.1 新 tab：`✦ 技能树` — 注册位置
`src/app/admin/page.js`：
- import 新 `SkillTreeTab`（`src/app/admin/_tabs/SkillTreeTab.jsx`），加进 `TABS`（page.js:29-50，建议紧邻 `{ key: 'classes', label: '✦ 职业' }` 之后，图标换 `🌳` 避免与职业 `✦` 撞——参照 §5「图标去撞」）。
- render 行：`{tab === 'skilltree' && <SkillTreeTab toast={toast} />}`（page.js:147 旁）。

### 3.2 UI 结构（复用既有范式，最大化共享）
**A. 树列表 + 树编辑**（镜像 `ClassesTab.jsx` 的 CRUD + Modal 范式，`ClassesTab.jsx:128-268`）：
- `skill_trees` CRUD：name / description / class_id 下拉（来自 `classes`，含「通用（NULL）」选项）/ enabled / display_order。

**B. 节点编辑器**（每棵树展开一个节点画布）：
- **网格画布**：复用 `NeighborPicker.jsx` / `CandidateRoomPicker.jsx` 的 `grid_x/grid_y` 渲染 + `_shared/ui.js` 调色板范式（**不** import 对局 `gameUi.js`，admin 与 game 解耦——与 map-room-editor §4 同纪律）。节点放在 (grid_x, grid_y)，前置边画连线。
- **节点表单**（行内/抽屉，镜像 ClassesTab 的 perks 白名单编辑器 `ClassesTab.jsx:243-261`）：
  - name / icon / description / cost / max_rank。
  - **modifiers**：白名单 7 key 的数字输入网格（**直接复用** `ClassesTab.jsx` 的 `PERK_KEYS` 数组与渲染——抽到 `_shared/perkEditor.jsx` 单源，职业与技能共用）。`catalog_unlock_tag` 在技能侧隐藏（§2.5）。
  - **passive_skill_id**：下拉，选项来自 `passive_skills`（显示 name + trigger_event + icon）；含「无」。
  - **prereqs**：从同树其它节点多选 + 每条 min_rank 输入（`skill_node_prereqs` 行）。

### 3.3 校验（authoring 期，保存前）
1. **modifier 白名单**：非白名单 key 直接拒绝 + 红字（同 `ClassesTab.save` 的 `cleaned` 过滤，`ClassesTab.jsx:82-91`）。
2. **DAG 无环**：保存 prereq 时跑拓扑可达——若 `requires_id` 能经前置链回到 `node_id` 则拒绝（黄字「会形成循环前置」）。
3. **跨树 prereq 禁止**：`requires_id` 必须与 `node_id` 同 `tree_id`（前端过滤候选 + 保存校验）。
4. **孤儿 passive 提示**：`passive_skill_id` 指向 `enabled=false` 的 passive → 黄字提醒（不阻断，运行期 `_pass` 自然不触发）。

### 3.4 预览（authoring 即时反馈）
- **「这棵树点满需要 N 点 / 当前预算 M」**：读 `game_rules.skill_pt_per_raid`，sum 全节点 `cost × max_rank`，对比预算 → 黄字「预算不足以点满（设计意图：取舍）」或绿字。
- **「合并预览」**：选一个职业 + 勾若干节点 → 实时算合并后的 `classPerks`（调 §4.2 的纯函数 `mergeSkillModifiers`），展示「最终 combat_dmg_mult = 职业0.10 + 技能0.05 = 0.15」——让 authoring 者看到叠加结果，杜绝盲配。

---

## §4 运行端集成（DTSV 哪个文件怎么消费）

### 4.1 习得提交：`commitSkillChoices`（新 helper，镜像 `commitClassChoice`）
新文件 `src/lib/server/skills.js`（与 `classes.js` 并列）：
```
commitSkillChoices(client, userId, roomId, nodeRanks)  // nodeRanks = [{ nodeId, rank }]
  1. 拉 enabled skill_nodes（含 modifiers / passive_skill_id / cost / max_rank）+ 其 prereqs。
  2. 校验：预算（Σcost×rank ≤ skill_pt_per_raid）、prereq AND 满足、rank ≤ max_rank、节点属可见树（class_id NULL 或 == 玩家职业）。
  3. upsert player_skill_runs（onConflict user_id,room_id,node_id）。
  4. 返回 { acquiredNodes }（含已解析 modifiers / passive_skill_id）。
```
> 校验失败抛错；joinRoom catch 后**降级为「无技能」**（不阻断进场，同 `commitClassChoice` 的 try/catch，`gameActions.js:2508-2510`）。

### 4.2 合并进 classPerks：`mergeSkillModifiers`（纯函数，无 DB）
`src/lib/server/skills.js` 导出：
```
mergeSkillModifiers(classPerks, acquiredNodes)
  → 克隆 classPerks；逐 node 逐 rank：对每个白名单 modifier key 做【加法叠加】（§2.5）。
  → filterSkillModifiers 过滤非白名单 key（复用 classes.filterPerks 同款白名单）。
  → 返回新 classPerks（catalog_unlock_tag 不被技能覆盖）。

collectSkillPassives(acquiredNodes)
  → 按 passive_skill_id 拉 passive_skills 行 → 返回 passive 列表（去重）。
```

### 4.3 注入点：`joinRoom`（gameActions.js:2500-2511 之后插一段）
**唯一改动点**，紧接 `applyClassToPlayer` 之后：
```
// 现状（gameActions.js:2505）：
player = applyClassToPlayer(player, chosenClass)
// 新增（技能合并 — 在 player.classPerks 已由职业填好之后）：
if (loadout?.skillNodes?.length) {
  try {
    const { acquiredNodes } = await commitSkillChoices(client, user.id, roomId, loadout.skillNodes)
    player.classPerks = mergeSkillModifiers(player.classPerks, acquiredNodes)   // 同口径叠加
    player._skillPass = await collectSkillPassives(client, acquiredNodes)        // 触发被动
  } catch (e) { console.error('[joinRoom] commitSkillChoices 失败:', e?.message) }  // 降级无技能
}
```
- `player.classPerks` 合并后，**所有下游 tap 零改动**自动生效：
  - 战斗乘区：`computeCombatStats` 读 `entity.classPerks`（`combatStats.js:49`）——经 `buildCombatPlayer`（`gameActions.js:396-409`）透传 `basePlayer.classPerks`。
  - 搜索/残片：`gameActions.js:1375-1376` 读 `classPerks.search_bonus / fragment_drop_bonus`。
  - 污染：`pollution.js:308` 读 `classPerks.pollution_resist`。
  - Ω 窗口：`gameActions.js:2830` 读 `classPerks.omega_window_bonus`。
  - 商店：`getCatalogUnlockTag`（`classes.js:183`）。

### 4.4 触发被动接线（`_skillPass` 并进 `_pass`）
战斗实体组装时把技能被动并进 `_pass`（`triggerPassives` 的输入）。`buildCombatPlayer`（`gameActions.js:396`）已透传 `_pass`（来自装备）；改为 `_pass = [...装备被动, ...(basePlayer._skillPass||[])]`。`triggerPassives`（`equipmentEngine.js:552`）按 `trigger_event` 匹配——**一行不改**，技能被动与装备被动同一执行路径。

### 4.5 NPC 复用同一技能（玩家=NPC 对称）
NPC 已通过 `resolveNpcCombatProfile`（`gameActions.js:451`）解析 class → `classPerks`（`filterPerks`）。技能延伸：
- `npc_pool` 加 `skill_node_ids BIGINT[] NOT NULL DEFAULT '{}'`（NPC 习得的节点，快照不入 `player_skill_runs`）。
- `resolveNpcCombatProfile` 末尾：若 `skill_node_ids` 非空 → 拉对应 `skill_nodes` → `mergeSkillModifiers(classPerks, nodes)` + `collectSkillPassives` → 挂上 NPC 的 `classPerks` / `_pass`。
- **中性**：`skill_node_ids` DEFAULT `{}` → 现有 NPC 解析逐值不变（同 phase-37 中性范式）。
- `NpcsTab.jsx` 加「技能节点多选」槽（与 class_id / loadout 槽并列），authoring「这个 NPC 会什么技能」。

---

## §5 分阶段落地步骤（每步可独立上线）

| Phase | 内容 | 依赖 | 风险 | 独立上线后的状态 |
|---|---|---|---|---|
| **S1 schema + 中性闸** | `phase-42-skill-tree.sql`：4 表 + RLS + `game_rules.skill_pt_per_raid` 默认值 + `npc_pool.skill_node_ids`。`PERK_WHITELIST` 不动（已含所需 key）。**无任何运行端改动**。 | 02 已落地（`combatStats`/`classPerks` 管线在位） | **低**（纯加表，全 DEFAULT 中性，零代码） | 库里有空技能表；游戏逐值不变 |
| **S2 authoring tab** | `SkillTreeTab.jsx` + 抽 `_shared/perkEditor.jsx`（职业/技能共用）+ 树/节点/prereq CRUD + DAG 校验 + 预算/合并预览。注册 page.js。 | S1；01 内容引擎范式（ClassesTab/NeighborPicker） | **低**（admin only，运行端不读） | 用户能填技能树；玩家仍无入口、不生效 |
| **S3 玩家习得 + 合并（生效）** | `skills.js`（commitSkillChoices / mergeSkillModifiers / collectSkillPassives）+ joinRoom 注入（§4.3）+ `_pass` 接线（§4.4）+ PrepareModal 加技能加点 UI（镜像选职业）+ `player_skill_runs` 写入。 | S1+S2 | **中**（碰 joinRoom + 战斗输入；靠加法中性兜底） | 玩家可入场前点技能，modifier/被动生效于 PVE+PVPVE |
| **S4 NPC 技能对称** | `npc_pool.skill_node_ids` 消费（resolveNpcCombatProfile 末段）+ NpcsTab 技能槽 authoring。 | S1+S3 | **中**（碰 NPC 解析；DEFAULT {} 中性兜底） | NPC 也能挂技能；玩家=NPC 完全对称 |
| **S5 数值重排（用户主导）** | 提供默认中性 + authoring 工具（预算/合并预览已在 S2）；用户调 cost/modifier/树形。 | S2-S4 | 中（平衡，非工程） | 内容由用户填满 |

**先后铁律**：S1 可单独上线（纯中性）。S2 紧随（authoring 不影响运行）。S3 是「真正生效」的一步——上线即灰度（见 §6）。S4/S5 增量。

---

## §6 安全 / 中性 / 迁移兜底

### 6.1 中性（Phase 37 铁律 —「空配置 ⇒ 数值逐值不变」）
- **数学闭环**：技能 modifier 走**加法叠加**（§2.5）。无技能树 / 没点节点 ⇒ Σ技能 = 0 ⇒ `mergeSkillModifiers` 返回的 `classPerks` 与「仅职业」**逐 key 相等** ⇒ `computeCombatStats` 等所有 tap **逐值不变**。
- **NPC**：`skill_node_ids` DEFAULT `{}` ⇒ resolveNpcCombatProfile 输出不变。
- **被动**：`_skillPass` 默认空数组 ⇒ `_pass` 不变 ⇒ `triggerPassives` 行为不变。

### 6.2 灰度开关（单值，无代码改动可关停）
- `game_rules.skill_pt_per_raid = 0` ⇒ `commitSkillChoices` 预算 0 ⇒ 任何加点都校验失败 ⇒ 技能系统**事实关闭**（玩家点不了，等同未上线）。开放时调成 3。可按需做「PrepareModal 隐藏技能区当预算=0」。

### 6.3 引用完整性（不踩 dts「改名即断链」）
- 所有引用 **ID**：`tree_id` / `node_id` / `requires_id` / `passive_skill_id` / `class_id` / `node_id` 列全 FK + CASCADE/SET NULL。改技能名、改职业名、改被动名 **不断任何链**（与 dts 的「名串匹配 + b64 skill 编号 bitmap」相反）。
- 删节点 → `skill_node_prereqs` / `player_skill_runs` 经 FK CASCADE 自动清，无悬挂。

### 6.4 不引入新 eval 面（红线⑤「绝不照搬 eval」）
- 技能效果**只有两种**：命名 modifier（数字，进白名单聚合）+ 引用现有 `passive_skills`。**不新增任何 formula 字符串字段**。已有的 `evalFormula`（`gameEngine.js:16`）仅服务旧 buff/passive，技能不扩大其入口。dts 的 `eval(__MAGIC__)` / 每技能 PHP 函数 → 在 DTSV 蒸发为「数据行 + 白名单聚合」。

### 6.5 向后兼容 / 迁移
- 纯加表，无破坏性 DELETE/迁移（与 phase-24b 硬迁移不同，本期零数据搬运）。
- 在飞局：S3 上线时，已在飞的 raid 的 player state 无 `_skillPass`/技能 modifier → 读时缺省中性，不崩（同 stamina/jump 新字段经 normalizeGamevars 透传范式，`roomState.js:304-316`）。
- `PERK_WHITELIST` 是玩家与 NPC 共用单源（`classes.js:15`）；技能复用，**不复制**白名单。

### 6.6 确定性
- 习得是玩家显式选择（非 RNG），无种子一致性问题。NPC `skill_node_ids` 是 authored 快照（非随机抽），与 phase-38 敌人投放的确定性纪律一致。

---

## §7 留给用户的开放决策

1. **skill_pt 来源**：本设计默认「每 raid 固定 3 点」（`game_rules.skill_pt_per_raid`）。是否改为**里程碑/进度获得**（接 `runGoals` / raid 成就），或做成**跨局持久点数**（`player_skill_runs.room_id = NULL` + 复用 `player_points` 加一种 `skill_pt` 点型）？涉及「集卡/成就回归 dts 清晰模型」的产品转向（用户原话「残片系统太难懂了」）——技能点是否就挂在那套成就模型上，需与 04/05 一并拍板。
2. **跨局 vs 每局**：技能习得是「每 raid 重选」（镜像职业，本设计默认）还是「永久解锁、越攒越强」（更接近 dts 持久技能）？后者需 `room_id NULL` 持久档 + 防「老玩家碾压」的平衡设计。
3. **主动技能**：本期排除（只被动 modifier + 触发被动）。是否近期就要带 CD 的主动技能（手动释放）？那是另一条 action 路由 + UI 链，会显著扩大范围。
4. **技能 vs 职业的边界**：职业已能给 perk。技能树是「职业内的深化分支」（每职业一棵专属树，`skill_trees.class_id`）还是「与职业正交的通用树」（`class_id=NULL`）？影响 authoring 心智模型与平衡。
5. **新增 modifier key**：当前 7 个白名单 key 够用否？若技能要表达职业 perk 没有的效果（如「撤离点折扣」「耐久消耗减免」），需扩 `PERK_WHITELIST` + 加新 tap 点——每个新 key 都要在对应系统埋一处读取（白名单扩展模式）。请列出技能想要但现 key 表达不了的效果清单。
6. **max_rank 叠点的 UI**：可叠点节点（max_rank>1）在树画布上如何展示「已点 2/5」？需 PrepareModal 加点交互细化。

---

## 附录 · 关键 file:line 锚点（实现时核对）

| 用途 | 文件:行 |
|---|---|
| modifier 白名单单源（扩展点） | `src/lib/server/classes.js:15` (`PERK_WHITELIST`) |
| perk 白名单过滤（技能复用） | `src/lib/server/classes.js:34` (`filterPerks`) |
| 职业属性应用（技能合并紧随其后） | `src/lib/server/classes.js:155` (`applyClassToPlayer`) |
| 统一战斗 stat 组装（读 classPerks 当 classMult） | `src/lib/combatStats.js:43-71` |
| 玩家战斗实体组装（透传 classPerks/_pass） | `src/lib/server/gameActions.js:396-409` (`buildCombatPlayer`) |
| NPC 战斗 profile 解析（技能对称延伸点） | `src/lib/server/gameActions.js:451` (`resolveNpcCombatProfile`) |
| **技能合并注入点**（joinRoom，applyClassToPlayer 之后） | `src/lib/server/gameActions.js:2500-2511` |
| 搜索/残片 perk tap | `src/lib/server/gameActions.js:1375-1376` |
| Ω 窗口 perk tap | `src/lib/server/gameActions.js:2830` |
| 污染 perk tap | `src/lib/pollution.js:305-308` |
| 触发被动执行（技能被动复用） | `src/lib/equipmentEngine.js:552-625` (`triggerPassives`) |
| game_rules K/V 读取（skill_pt 预算） | `src/lib/gameEngine.js:60-89` |
| player state 初始（classPerks 字段） | `src/lib/roomState.js:326-330` |
| authoring CRUD + perks 白名单编辑器范式 | `src/app/admin/_tabs/ClassesTab.jsx:82-91, 243-261` |
| 网格画布范式（节点画布复用） | `src/app/admin/_tabs/NeighborPicker.jsx` / `CandidateRoomPicker.jsx` |
| admin tab 注册 | `src/app/admin/page.js:29-50, 147` |
| 习得历史表范式（player_skill_runs 镜像） | `scripts/phase-24c-classes.sql:39-50` |
| 中性铁律 + 幂等迁移范式 | `scripts/phase-37-unified-combat.sql:16-47` |
| RLS 范式 | `scripts/phase-27-portraits.sql:45-60` |
| dts 技能「意图」原型（PHP 反面教材） | `_dts_clone/include/modules/base/skillbase/main.php:199-243` (`skill_acquire/query` + b64 bitmap) |
