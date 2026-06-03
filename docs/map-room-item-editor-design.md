# 地图编辑器 + 房间物品投放系统 — 设计宪法

> 触发：用户「制作地图编辑器(编辑房间名，未来 30-40 房间) + 房间物品投放表(联动装备) + 后台整理」。
> 调研：3 个并行 research agent 摸清房间/物品/装备/admin 架构（见本文 §1）。
> 北极星：本文。配套：`docs/timejump-br-design.md`（BR 大时钟/缩圈/深度宪法，本文是其地图层扩展）。

## §0 锁定决策（用户 AskUserQuestion 拍板）

| 决策 | 选择 |
|---|---|
| 推进方式 | **一步到位 30-40**：现在就让战场支持 30-40 个编排房间，同步重构缩圈/网格/中心从「写死 100」改为「从实际房间集推导」 |
| 「几禁刷出」语义 | **越晚越肥**：物品在圈收缩到第 N 禁**之后**才刷出（晚期/深层更肥，呼应 `lootTier=phase+1`）→ 字段 `spawn_phase_min` |
| 固定/随机补货 | **房间库存·一次性**：开局给房间放入「固定 N + 随机[min,max]」件，搜走就少、不再生 → 需 `gamevars.br.roomInv` 房间物品状态 |
| 后台整理范围 | **全面整理**：退役死掉的 MapsTab + DRY 调色板 + 清死字段 + 分组只读分析 tab + 收窄导航 + 合并叙事配置簇 |
| 装备投放（默认） | 道具 + 装备都支持，`entry_kind ∈ {item, equipment_tier}` 判别 |

## §1 架构现状（调研结论）

**三层模型（必须分清）：**
- **物理格子** `br_rooms`（100 行，10×10 网格）：缩圈战场。`label`(扇区 A-01·**存储**) / `region` / `neighbor_ids`(邻接) / `grid_x,grid_y` / `close_phase`(死字段，/game 不读) / `enabled`。
- **内容模板** `chamber_templates`（25 行）：房间「类型」。物品/NPC 按 `chamber_template_ids[]` 归属于模板。每局按种子把每个物理格子采样到一个模板（`gamevars.br.roomTemplates[roomId]=templateId`）。
- **物品投放**：现状只有 `item_pool.chamber_template_ids[]` 布尔归属 + `amount` 权重 + 单次 roll。**无数量/几禁/固定随机/按房间**概念。

**关键事实：**
1. 房间名存 `br_rooms.label`，改它即改显示名（坑：`/api/br/topology` 24h `immutable` 缓存 + 客户端模块级 `_brTopologyCache`）。
2. **缩圈写死 100**：`src/lib/server/br/forbidden.js` `ROOM_COUNT=100 / ROOMS_PER_STAGE=20 / MAX_CLOSE_PHASE=5`；`computeClosePhases(seed)` 对 `[1..100]` 种子洗牌后按 20 一桶分相位。房间变少 → 真实房间挤进前 1-2 桶 → 缩圈崩。
3. 网格 `10×10` 写死 3 处（`gameUi.js:218 BR_GRID_W/H`、`zones.js:18`、`br/[matchId]/page.js:12`）；中心 `(4.5,4.5)` 写死 5 处。
4. 致死权威 = `forbidden(seed,phase,roomId)` 实时重算（`gameActions.js:436,577`）；客户端着色 = `gamevars.br.closePhases` 快照（init 时 `closePhasesObject(seed)` 落）。两者同 seed 同结果。
5. 搜索 = `resolveSearchAction`(gameActions.js:1114)：体力门 → `fetchSearchChamberBundle` 按 `chamber_template_ids` 过滤池 → 单次 roll 概率梯（npc/corpse/loose item/fragment）→ loose item 按 `amount` 权重抽 1 件 → `lootByDepth`(仅 depth>0 加 extra roll)。`amount` 是**权重非数量**；`max_items` **不被读**；**无相位门控基础 loot**。
6. 装备独立：`equipment_series/tiers/instances` 与 `item_pool` 零关联；inventory 存道具**名字串**，装备存 **uuid instance**。桥接靠「名字匹配 `equipment_tiers.name`」（NPC 掉落 `resolveNpcDropEntry`）。捡装备走 `createLootSideEffect` INSERT `equipment_instances`。
7. **MapsTab(638 行)死了**：`map_config` 运行时零 server 读；配置已被 `chamber_templates` 取代、物品归属已迁 `chamber_template_ids`。其拖拽卡片(`@/components/cards`)值得搬走再退役。

## §2 缩圈重构（安全攸关·Phase 1 核心）

**目标**：缩圈/网格/中心从「写死 100」→「从实际启用 `br_rooms` 集推导」，且**每局快照冻结**（admin 改 `br_rooms` 只影响新局，不破坏在飞局的「致死一致性」不变量）。

**改法（snapshot-authoritative）：**
1. `computeClosePhases(seed, roomIds)` 改签名收**实际 room-id 列表**：种子洗牌 `roomIds` → 桶大小 `bucketSize = ceil(roomIds.length / MAX_CLOSE_PHASE)` → `closePhase = min(MAX_CLOSE_PHASE, floor(idx/bucketSize)+1)`。任意房间数都得到比例化 5 段缩圈。
2. `initBrRoomLayer` 把 `closePhases`(roomId→closePhase map) + `gridW/gridH/centerX/centerY`(从 `br_rooms` bounds 推) 快照进 `gamevars.br`（`closePhases` 已在落，新增 grid/center）。
3. **致死改读快照**：`sweepContractionDeaths`/`brTick` 用 `gamevars.br.closePhases[roomId]` 比 `effectivePhase`，**不再** `forbidden(seed,...)` 实时重算 → 在飞局冻结、与客户端着色一致、admin 改房间不伤在飞局。
4. 客户端网格 `BR_GRID_W/H` 改读 `gamevars.br.gridW/gridH`（或 topology）；中心 `(4.5,4.5)` 改读快照 center。
5. **拓扑版本戳**：`br_rooms` 加 `updated_at`，topology 端点带 `?v=<max(updated_at)>` 或降 `max-age`；`getRaidLayout` memo key 加版本 → 编辑后新局拿新拓扑。
6. **闸门**：有 `rooms.gamestate=1` 的 BR 局在飞时，房间数/邻接变更只对新局生效（在飞局用自己的快照）。

**验证红线**：缩圈在 N=36 与 N=100 都得到 5 段比例化；致死与客户端着色逐格一致；现有 100 格局不回归。

## §3 房间物品投放 + 库存状态 — **道具为中心 · 全图分布（Phase 36 重建）**

> **模型迁移**：Phase 34 的 `room_items`（每房一行 · 每条独立 `random_chance` 概率铺货）语义错误 —— 它让「这件稀有道具应该出现在 N 个候选房之一」沦为「每个候选房各掷一次硬币」，结果要么 0 件要么 N 件，无法表达「全图只放 K 件、落在哪几个房随机」。Phase 36 改为**道具为中心**：一条规则 = 一件道具 + 一组候选房 + 数量区间，分配器按全图视角无放回抽房落货。`room_items` **保留不 DROP**（空表 · 注释 deprecated · 红线禁 DROP 现有表）。

### 新模型（确认）
- **一条 `placement_rule`** = 一件道具/装备 + 一组候选房(带权重) + 数量区间 `[count_min, count_max]` + 每房上限(`max_per_room`=1) + 几禁(`spawn_phase_min`) + 互斥组(`exclusion_group` · 可空) + 启用。
- **覆盖 4 情形**：① **N选1**（候选多 · 数量 1）；② **N选K**（数量 K · 每房 1 → K 个不同房各 1 件）；③ **加权倾向**（候选带 `weight` · 倾向高权房）；④ **互斥**（同 `exclusion_group` 的道具同房不共存 · 各自必去**不同**候选房 · 两者都保证出现）。
- **数量 = 区间** `[count_min, count_max]`，每房最多 1 件（`max_per_room`，本期固定 1）；count 在该区间内由 per-raid seed 确定性取值。

### `placement_rules` / `placement_rule_rooms`（配置表，admin 编辑 · 见 `scripts/phase-36-placement-rules.sql`）
```
placement_rules
  id              bigint PK
  entry_kind      text NOT NULL DEFAULT 'item'   -- 'item' | 'equipment_tier'
  item_name       text NULL  REFERENCES item_pool(name) ON UPDATE CASCADE ON DELETE CASCADE   -- item
  tier_id         int  NULL  REFERENCES equipment_tiers(id) ON DELETE CASCADE                  -- equipment_tier
  count_min       int  NOT NULL DEFAULT 1     -- 全图投放件数下界（不是每房！）
  count_max       int  NOT NULL DEFAULT 1     -- 全图投放件数上界
  max_per_room    int  NOT NULL DEFAULT 1     -- 单候选房最多落几件（本期固定 1）
  spawn_phase_min int  NOT NULL DEFAULT 0     -- 越晚越肥：effPhase>=此值才显形(0=开局即有) → roomInv 件 revealPhase
  exclusion_group text NULL                   -- 互斥组键(同组道具不同房 · 各自都出现)；NULL=不互斥
  enabled         boolean NOT NULL DEFAULT true
  notes           text
  created_at / updated_at timestamptz         -- updated_at BEFORE UPDATE 触发器
  CHECK kind_xor:    (entry_kind='item' AND item_name NOT NULL AND tier_id NULL)
                  OR (entry_kind='equipment_tier' AND tier_id NOT NULL AND item_name NULL)
  CHECK count_min>=0 · count_min<=count_max · max_per_room>=1 · spawn_phase_min>=0

placement_rule_rooms              -- 一条规则的候选房集（带权重）
  id          bigint PK
  rule_id     bigint NOT NULL REFERENCES placement_rules(id) ON DELETE CASCADE
  br_room_id  int    NOT NULL                 -- 软引用 br_rooms.room_id（不建 FK，解耦房增删）
  weight      real   NOT NULL DEFAULT 1 CHECK(weight>0)   -- 加权倾向（无放回抽样权重）
  UNIQUE(rule_id, br_room_id) · INDEX by rule_id
```
> 字段映射：属性/功能/耐久 ← 引用的 `item_pool`/`equipment_tiers` 自带；使用次数 ← `item_pool.bundle_count`（保留）；几禁 ← `spawn_phase_min`；数量 ← `[count_min,count_max]`；候选房+倾向 ← `placement_rule_rooms.br_room_id + weight`；互斥 ← `exclusion_group`。
> `br_room_id` 软引用同 phase-34（不建 FK）：分配器只对**本局实际房集** `roomIds` 内的候选生效，孤儿候选自然忽略。

### 全局分配算法 `allocateRoomInventory(seed, roomIds, rules, ruleRooms)`（确定性 · 纯函数 · `roomItems.js`）
- **入口**：`rules`=enabled `placement_rules` 行；`ruleRooms`=`placement_rule_rooms` 行。输出 `{ roomInv, roomInvRefs }`，格式**与 Phase 34 `placeRoomInventory` 完全一致**（`[refIdx,kind,revealPhase]` 三元组 · intern ref · taken=push(1)）→ `takeFromRoom`/`resolveRef`/`resolveSearchAction` 取货链**零改动**。
- **算法**（详细伪码见返回契约 §2）：
  ① `roomIdSet=Set(roomIds)`；`candidatesByRule`=按 `rule_id` 分组 `ruleRooms` · 过滤到 `roomIdSet` · 仅 `weight>0`。
  ② `roomGroups=Map(roomId→Set(exclusion_group))`（记录每房已被哪些互斥组占用）；`rules` 按 `id` 升序遍历（确定性）。
  ③ 逐 enabled rule：`rng=mulberry32(hashSeed(seed,'placement:'+rule.id))`（与 `forbidden.js` 同源）；`count=count_min+floor(rng()*(count_max-count_min+1))`；`eligible`=候选中（若规则有 `exclusion_group`）剔除已被该组占用的房；`chosen`=用 `weightedSampleNoReplace(rng, eligible, min(count, eligible.length))` 确定性加权无放回抽；每 chosen 房 push `[refIdx, kind, revealPhase=spawn_phase_min]`，有互斥组则在 `roomGroups` 标记；受 `GLOBAL_INV_CAP=240` 跨房硬封顶。
  ④ `chosen<count`（候选不足）→ 欠铺（编辑器配置期黄字警告 · 运行期尽力铺到候选耗尽）。
- **语义保证**（红线）：候选足够时稀有道具**必铺够 count**（不再是「每房掷币 → 0 或 N」）；互斥组**同房不共存且各自都铺到不同房**。

### `gamevars.br.roomInv`（运行时库存 · 一次性 · 格式不变）
- **init 时分配**：`initBrRoomLayer` 改查 `placement_rules`(enabled) + `placement_rule_rooms`(其候选) → `allocateRoomInventory(seed, roomIds, rules, ruleRooms)` → 落 `roomInv/roomInvRefs`（格式不变）。失败降级空库存（回落程序化抽取，零回归）。
- **结构精简**：仅给「有投放」的房建 `roomInv[roomId]`；紧凑数组 `[[refIdx,kind,revealPhase], ...]`；去重 ref 表 `roomInvRefs.{items,tiers}`。
- **搜索取货（不动）**：`resolveSearchAction` 命中 loose-item 分支时，`takeFromRoom(roomInv, roomId, effPhase)` 取 `revealPhase<=effPhase && !taken` 的件 → 有则发一件 + 标 taken（一次性）；无则回落现有 `amount` 权重程序化抽取（procedural 不破，经济基线守住）。
- **装备件**：`entry_kind='equipment_tier'` 取货走 `createLootSideEffect` INSERT `equipment_instances`（耐久=tier.durability_max）+ loot prompt。

### 经济护栏
- `GLOBAL_INV_CAP=240`（跨房）+ `max_per_room=1`（单房单件）双阀防爆；authored 投放仍受 `itemChance`/污染/体力 搜索门控（不旁路经济）—— 即「房间有货」也要搜索成功才拿到。
- `ROOM_INV_CAP`（单房上限）在新模型下因 `max_per_room=1` 自然受限于「指向该房的规则条数」，仍保留作消费端兜底封顶。

## §4 编辑器 UI

### Phase 1（已落地）房间编辑器 `🧭 房间编辑器`（`RoomsEditorTab.jsx`）
- CRUD `br_rooms`（label/region/grid_x,y/neighbor_ids/enabled/close_phase 可选覆盖）；支持增删房间达成 30-40；保存即 bump topology 版本（`updated_at` 触发器）。
- 邻接初版 = 逗号分隔 ID 文本（`neighborStr`）→ **Phase 3 升级为网格+列表双视图**（见下）。

### Phase 3（本次）邻接双视图（实现者 A · `RoomsEditorTab.jsx` + 新 `_tabs/NeighborPicker.jsx`）

**决策**：用户选「网格+列表双视图」+「邻接对称同步（默认勾）」。

**`NeighborPicker.jsx` 组件**
- **props**：`{ rooms, currentRoomId, value, onChange }`。`rooms`=全 `br_rooms`（含 `room_id/grid_x/grid_y/label/region/enabled`）；`currentRoomId`=正在编辑的房号（新增时为预填房号）；`value`=已选 neighbor 房号 `number[]`；`onChange(next:number[])`。
- **网格视图（主）**：按 `grid_x/grid_y` 渲染网格（复用 `BrGridPanel`/`BrZoneCell` 视觉范式·GitHub dark `_shared/ui.js` 调色板，**不** import 对局 `gameUi.js` —— admin 与 game 解耦，仅复刻视觉）。`gridW = max(grid_x)+1`、`gridH = max(grid_y)+1`。格子着色：当前房=蓝实线高亮(`C.accent`)、已选邻接=绿(`C.green`)、其它可点=灰(`C.border`)；空格(无房映射)=暗占位。格子内显示**房名**（容不下→末段缩写 + `title` 悬停全名）。点格子 toggle 进/出 `value`（`currentRoomId` 自身不可点）。
- **列表视图（兜底·折叠 details 或并列）**：搜索框（按 `label`/`region` 过滤）；每行 房名 + 区域徽标 + `(gx,gy)` + 开/关按钮（已选高亮绿）。供跨网格/远连用。
- **已选 chips**：`value` 房号 → 房名 chips（蓝底），点 `✕` 移除。

**`RoomsEditorTab.jsx` 接入**
- 编辑/添加 modal 内：把 `neighbor_ids` 那块 `<input value={neighborStr}>` 整块替换为 `<NeighborPicker rooms={rooms} currentRoomId={Number(edit.room_id)} value={edit.neighbor_ids} onChange={(next)=>setEdit({...edit, neighbor_ids: next})} />`。`neighbor_ids` 改为 `edit` 内权威数组态。
- 删 `neighborStr` state + `setNeighborStr` 调用；`neighborsToStr/strToNeighbors` 可删（或保留内部不暴露 UI）。`save` 用 `edit.neighbor_ids`（已是数组）。
- **对称同步**：modal 加复选框「邻接对称（推荐·默认勾）」`symmetricSync` state（默认 true）。`save` 成功写本房后，若勾：diff 旧 `value`（`__origNeighbors`，openEdit/openAdd 时快照）vs 新 `neighbor_ids` → 对**新增**的对面房 UPDATE 其 `neighbor_ids` 并入 `roomId`（去重）；对**移除**的对面房 UPDATE 其 `neighbor_ids` 剔除 `roomId`。只 UPDATE 对面房 `neighbor_ids` 单列，不碰其它列。

### Phase 36（本次）房间投放 tab `🎯 房间投放` — **规则中心 + 按房只读派生**（重写 `_tabs/RoomItemsTab.jsx` + 新 `_tabs/CandidateRoomPicker.jsx`）

**模型变更**：从 Phase 34「按房逐条编辑（每房独立概率）」改为「**规则中心**：一条规则=道具+候选房集+数量区间」+「**按房只读派生视图**：选房看作为候选的规则」。`page.js` 注册不变（`placements` tab / `RoomItemsTab toast={toast}` 已在位）。

**`RoomItemsTab.jsx({ toast })` — 两区**

**① 规则中心（主区）**：列全 `placement_rules`，每条规则一卡（行内/抽屉编辑）：
- **道具/装备**：`entry_kind` 切换（道具/装备）· **按名选**（道具=`item_pool.name` 搜索下拉 · 装备=`equipment_tiers` 按 `name`+`rarity`+`T{tier}` 下拉）。
- **候选房网格多选**：`<CandidateRoomPicker rooms value onChange />`（新组件 · 复用 `NeighborPicker` 网格范式）。每个选中候选房可单独设 `weight`（数字输入 · 默认 1）。
- **数量区间**：`count_min`–`count_max`（全图件数 · 不是每房）。
- **几禁**：`spawn_phase_min` 下拉 0..`MAX_CLOSE_PHASE`=5 · 标「越晚越肥」。
- **互斥组**：`exclusion_group` 文本/下拉（已有组名做 datalist 建议 · 空=不互斥）。
- **启用** 开关 · **保存** · **删除**（inline 两步确认）。`+ 新建规则` 默认 `entry_kind='item' · count_min=count_max=1`。
- **欠铺警告**：每条规则实时校验 `count_min > 候选房数(weight>0)` → 黄字「候选不足 · 最多铺 N 件 / 需 count_min 件」（候选足够时不再是「每房掷币」，而是必铺够 count）。

**② 按房只读派生视图（次区）**：选一房（顶部房名搜索/列表）→ 列「**这房作为候选的规则**」（只读 · 显 道具名 + 全图数量区间 + 本房 `weight` + 几禁 + 互斥组）。纯派生（join `placement_rule_rooms` 上 `br_room_id` → 其 `rule`），不可编辑（编辑去主区）。

**`CandidateRoomPicker.jsx({ rooms, value, onChange })`** — 新组件（不碰 `NeighborPicker`）：
- **props**：`rooms`=全 `br_rooms`（`room_id/grid_x/grid_y/label/region/enabled`）；`value`=候选 `[{ br_room_id, weight }]`；`onChange(next)`。
- **网格视图（主）**：复用 `NeighborPicker` 的 `grid_x/grid_y` 渲染 + `_shared/ui.js` 调色板范式（**不** import `gameUi.js`）。格子着色：已选候选=绿(`C.green`)、可点=灰、空格=暗占位（无「当前房」概念，规则中心无 currentRoomId）。点格 toggle 进/出 `value`（进时 `weight` 默认 1）。
- **权重编辑**：已选候选 chips/列表区每行带 `weight` 数字输入（改 `onChange` 对应项）。
- **列表视图（兜底）**：按 `label`/`region` 搜索 · 每行带开/关 + weight 输入。

**存盘**：直连 `supabase`：`placement_rules` insert/update/delete + `placement_rule_rooms`（删该规则旧候选行 → 批量 insert 新候选，或 diff upsert）。严格符合 phase-36 CHECK（`entry_kind` XOR · `count_min<=count_max` · `max_per_room>=1` · `weight>0` · `spawn_phase_min>=0`）；成功 toast。**不碰** `RoomsEditorTab`/`NeighborPicker`（A 负责）。

> 注：phase-36 schema 由 SQL 实现者建（`placement_rules` / `placement_rule_rooms` · `room_items` 留 deprecated 不 DROP）。`item_pool.name UNIQUE`/`bundle_count` 已在位（phase-34）。`MAX_CLOSE_PHASE=5`（`src/lib/server/br/forbidden.js`）；`GLOBAL_INV_CAP=240`/`max_per_room=1` 双阀（§3）。

## §5 后台全面整理

1. **退役 MapsTab**：搬走拖拽卡片到房间投放编辑器后，删 import/TABS/render(page.js)；移除 `map_config` 预取（page.js:79,85）。
2. **DRY 调色板**：8 个 tab 重复的 `const C={...}` → 收进 `_shared/ui.js`。
3. **清死字段**：FragmentsTab 的 `maps`(无 UI 死字段) + `MAP_LIST` import；DbConsoleTab `map_config.npc_count` 死预设。
4. **分组导航**：只读分析(Playtest/探针遥测)归一「📈 数据」父 tab 内分段；叙事簇(events/branches/endings/contracts)评估合并父 tab；收窄 23 项 flat 导航。
5. **图标去撞**：rooms「对局」与 chambers 都用 🌀 → 换一个。

## §6 阶段计划

| Phase | 内容 | 风险 | 产出 |
|---|---|---|---|
| **1 地基+房间编辑器** | §2 缩圈重构(count-derived+snapshot) + 网格/中心推导 + 拓扑版本 + `br_rooms` CRUD 编辑器 tab | **高**(致死逻辑) | 可编辑房间名 + 安全支持 30-40 |
| **2 物品投放后端** | §3 `room_items` 表 + `item_pool.bundle_count` + `gamevars.br.roomInv` 铺货/取货/相位门 + 装备件 INSERT | 中 | 房间投放生效于对局 |
| **3 投放编辑器** | §4 房间内物品列表 room-centric 编辑(复用拖拽卡片) | 低 | 用户可视化编投放 |
| **4 后台全面整理** | §5 退 MapsTab + DRY + 清死字段 + 分组导航 | 中(退役需稳) | 后台精简一致 |

**红线（贯穿）**：① 致死一致性不变量（§2 快照）；② procedural loot 经济基线不破（§3 回落）；③ 残片可发现性/六纪元 lore/装备耐久 不碰；④ SQL 幂等；⑤ 在飞局不被 admin 编辑破坏。
