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

## §3 房间物品投放 + 库存状态

### `room_items`（配置表，admin 编辑）
```
room_items
  id            bigint PK
  br_room_id    int NOT NULL            -- 投放到哪个物理房间(1..N)；按房间(用户要"固定在哪几个房间")
  entry_kind    text NOT NULL DEFAULT 'item'   -- 'item' | 'equipment_tier'
  item_name     text NULL  REFERENCES item_pool(name)       -- entry_kind='item'
  tier_id       int  NULL  REFERENCES equipment_tiers(id)    -- entry_kind='equipment_tier'
  fixed_count   int  NOT NULL DEFAULT 0     -- 固定保底 N 件
  random_min    int  NOT NULL DEFAULT 0     -- 额外随机件数下界
  random_max    int  NOT NULL DEFAULT 0     -- 额外随机件数上界
  random_chance real NOT NULL DEFAULT 1.0   -- 该条整体触发概率 0..1
  spawn_phase_min int NOT NULL DEFAULT 0    -- 越晚越肥：effPhase>=此值才显形(0=开局即有)
  enabled       boolean NOT NULL DEFAULT true
  notes         text
  CHECK (entry_kind='item' AND item_name IS NOT NULL AND tier_id IS NULL
      OR entry_kind='equipment_tier' AND tier_id IS NOT NULL AND item_name IS NULL)
```
> 字段映射用户需求：属性/功能 ← 引用的 `item_pool`/`equipment_tiers` 自带；使用次数 ← `item_pool` 新增 `bundle_count`(广义化现有恢复剂 BUNDLE hack，一份=N件)；几禁 ← `spawn_phase_min`；固定 ← `fixed_count`；随机 ← `random_min/max`+`random_chance`；按房间 ← `br_room_id`。

### `gamevars.br.roomInv`（运行时库存·一次性）
- **init 时铺货**：对每个房间，遍历其 `room_items`，按 `random_chance` 决定是否生效，生效则放入 `fixed_count + rand(random_min..random_max)` 件，每件记 `{ref, kind, revealPhase=spawn_phase_min, taken:false}`。
- **结构精简**：仅给「有投放」的房间建 `roomInv[roomId]`；紧凑数组 `[[refIdx,kind,revealPhase], ...]`（控 gamevars.br ≤ ~8KB）。
- **搜索取货**：`resolveSearchAction` 命中 loose-item 分支时，**先**看 `roomInv[roomId]` 里 `revealPhase<=effPhase && !taken` 的件 → 有则优先发一件 + 标 taken（一次性消耗）；无则**回落**现有 `amount` 权重程序化抽取（procedural 不破，经济基线守住）。
- **装备件**：`entry_kind='equipment_tier'` 取货走 `createLootSideEffect` INSERT `equipment_instances(tier_id,owner_id,room_id,durability=tier.durability_max)` + loot prompt。

### 经济护栏
- 每局每房 `roomInv` 件数上限（防爆装备）；authored 投放仍受 `itemChance`/污染/体力 搜索门控（不旁路经济）—— 即「房间有货」也要搜索成功才拿到。

## §4 编辑器 UI

- **房间编辑器**（扩展/新 tab `🗺️ 房间编辑器`）：CRUD `br_rooms`（name/region/grid_x,y/neighbor_ids/enabled/close_phase 可选覆盖）；支持增删房间达成 30-40；保存即 bump topology 版本。
- **房间内物品列表**（房间编辑里嵌「物品投放」子区，room-centric）：选房间 → 列出该房 `room_items` → 行内编辑 引用(道具/装备)·fixed·random[min,max]·chance·spawn_phase_min·enabled；复用 MapsTab 拖拽卡片(`@/components/cards`)。便于用户「列出物品列表来编辑」。

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
