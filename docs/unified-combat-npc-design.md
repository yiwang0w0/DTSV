# 玩家/NPC 统一战斗模型 + 敌人投放 — 设计宪法

> 触发：用户「敌人机制有问题——NPC 不该配死的 atk/def；玩家和 NPC 各项面板应一致（同职业/装备槽/物品槽），攻击力等 = 一个基础值 × 职业乘区 × 装备乘区，所有模板这样设计；把实体页改为敌人投放（像房间投放）；chamber 还有必要吗」。
> 调研：3 个并行 research agent（chamber 必要性 / 战斗属性模型 / NPC 模型）。
> 配套：`docs/timejump-br-design.md`（BR 宪法）、`docs/map-room-item-editor-design.md`（房间/投放）。

## §0 锁定决策（用户 AskUserQuestion 拍板）

| 决策 | 选择 |
|---|---|
| Chamber 去留 | **分两步退役**：本次只做 NPC 统一战斗 + 敌人投放；`chamber_templates` 退役作为干净后续（等敌人投放跑通 → pollution_accel/is_exit/exit_cost 迁 `br_rooms`、probe/residue 改键 `room_id`） |
| 战斗乘区 | **全游戏数值重排**（不做轻量）：基础值 × 职业乘区 × 装备乘区；职业乘区/加法区 由我定（采**乘区为主·保留加法兼容**，见 §2） |
| 敌人投放结构 | **平行系统**：新 `npc_placement_rules` + 👹 敌人投放 tab；`npc_pool` 加 class_id/装备槽/物品槽；开局**确定性**实例化（修掉 `Math.random`） |

## §1 现状（调研结论·关键事实）

**战斗属性（agent 实测）：**
- 玩家：`atk =（base + 职业 flat base_*_bonus + Σ装备 flat）×（1+combat_dmg_mult）` —— 一堆**加法** + **一个**职业乘子。装备**纯加法**(无乘区)、HP **无乘区**；职业半加法半乘法（`classes.base_*_bonus` flat + `perks.combat_dmg_mult/combat_def_mult` mult）。`buildCombatPlayer`(gameActions.js:369-386) 是唯一组装器·**仅玩家**。
- NPC：纯 flat `npc_pool.atk/def/hp` 直进 `calcDamage`（gameActions.js:1453/1587）·**无职业无装备无 base/乘区** —— 即"有问题"的不对称。
- `calcDamage`(gameEngine.js:103-132)：`dmg = attacker.atk×1.0 - defender.def×0.5`(+暴击)·**实体无关**（读 .atk/.def 即可，公式不动）。
- **2 个既有 bug**：① NPC spawn `pickOrSpawnNpcInstance`(gameActions.js:1085) 用 `Math.random` 均匀抽 —— **非确定·破坏 BR 重放一致性**。② NPC 掉落**死了**：`createNpcCorpse`(829-846) 读 `npc.drop_items`，但 `npc_pool` **无此列** → NPC 啥都不掉。③ `accuracy`/`counter_rate` 被 combat+NpcsTab 读但 `npc_pool` **无此列**（回落默认）。

**NPC 模型：** `npc_pool`(19 列：hp/atk/def/exp/level/entity_type/hostile/trade*/pollution_on_kill/spawn_weight/min_pollution/chamber_template_ids…)；`npcInstances` gamevars = `{id,npcId,npc(整行快照),hp,maxHp,mapId,createdAt}`，combat 只读 `instance.npc` 当属性源。NPC 现按 `chamber_template_ids.includes(tid)` 过滤池 + 按搜索 RNG 惰性 spawn（无预投放）。

**玩家槽位**（`createPlayerState` roomState.js:279-335·NPC 要镜像的目标）：class(`classId/classPerks`) + 装备槽 `loadout{probe,shield,weapon,comm}`（真装备在 `equipment_instances` DB·`calcEquippedStats` 聚合）+ `inventory[]`。**探针**(`cross_room_probes.equipment_snapshot` jsonb) 是"给 NPC 装备但不铸实例"的现成范式。

## §2 统一战斗模型（核心）

### 统一公式（玩家 = NPC = 探针，同一 `computeCombatStats(entity)`）
每属性（atk / def / maxHp）：
```
canonical:  stat = round( base × (1 + classMult) × (1 + equipMult) )
通用兼容式:  stat = round( (base + classAdd + equipAdd) × (1 + classMult) × (1 + equipMult) )
```
- `base`：实体该属性基础值。玩家 ← `game_rules.player_init_*`（重排后设为统一基线如 100）；NPC ← `npc_pool.atk/def/hp`（重新诠释为 base）；探针 ← 其快照 base。
- **职业乘区 `classMult`**：实体 class 的 perk 乘子（`combat_dmg_mult`→atk、`combat_def_mult`→def、新增 `combat_hp_mult`→hp）。玩家+NPC 都有 `class_id` → 同源。
- **装备乘区 `equipMult`**：实体已装备 tier 的百分比列之和（**新增** `equipment_tiers.atk_pct/def_pct/hp_pct`）。玩家 ← `equipment_instances`；NPC ← `loadout_tiers` 快照。
- `classAdd/equipAdd`：兼容旧加法数据（`classes.base_*_bonus`、`equipment_tiers.base_atk/def/hp`）。**重排目标是 classAdd/equipAdd→0、纯乘区**；但引擎保留加法项 → ① 迁移期数值不崩（旧平衡可由加法项暂时保住）② 满足用户"职业乘区**或加法区**"的灵活。
- **buff/被动**：仍在 combat 时追加（`processBuffs`/`triggerPassives`），叠加在 `computeCombatStats` 之上（不变）。

### Schema（Phase A）
```sql
-- 装备乘区：百分比列（DEFAULT 0 → 现有装备 equipMult=0·迁移期靠 base_atk 加法项保平衡）
ALTER TABLE equipment_tiers ADD COLUMN IF NOT EXISTS atk_pct real NOT NULL DEFAULT 0;  -- 0.2 = +20%
ALTER TABLE equipment_tiers ADD COLUMN IF NOT EXISTS def_pct real NOT NULL DEFAULT 0;
ALTER TABLE equipment_tiers ADD COLUMN IF NOT EXISTS hp_pct  real NOT NULL DEFAULT 0;
-- 职业 hp 乘区（perks 里加 combat_hp_mult·白名单扩展·无需新列·存 perks jsonb）

-- NPC 槽位（镜像玩家·快照不铸实例）
ALTER TABLE npc_pool ADD COLUMN IF NOT EXISTS class_id bigint REFERENCES classes(id);          -- 可空
ALTER TABLE npc_pool ADD COLUMN IF NOT EXISTS loadout_tiers jsonb NOT NULL DEFAULT '{}'::jsonb;  -- {probe,shield,weapon,comm: tierId} 快照
ALTER TABLE npc_pool ADD COLUMN IF NOT EXISTS item_slots jsonb NOT NULL DEFAULT '[]'::jsonb;     -- [{item,qty}] 镜像 inventory·兼作掉落表(修死掉落)
-- 补缺列（既有 bug）
ALTER TABLE npc_pool ADD COLUMN IF NOT EXISTS accuracy real NOT NULL DEFAULT 0.85;
ALTER TABLE npc_pool ADD COLUMN IF NOT EXISTS counter_rate real NOT NULL DEFAULT 0.3;
```

### NPC 战斗实体（结构同玩家·为未来"夺舍"铺路）
- spawn/init 时解析 `npc_pool.loadout_tiers` → `equipment_tiers`（批量 `.in('id',…)` join·同探针/掉落范式）→ 经现有 `calcEquippedStats` 算装备聚合；套 `class_id` 的 `classes.perks` → classMult。
- `npcInstances` 项加镜像字段：`classId/classPerks/loadout(快照)/equip 聚合/inventory(=item_slots)`。
- combat：`{...instance.npc}` 裸属性 → 改走 `computeCombatStats(instance)`（与玩家 `buildCombatPlayer` 同一函数·对称）。被动 `triggerPassives` 对 NPC 也触发（装备 passives）。
- **修死掉落**：`createNpcCorpse` 改读 `instance.inventory(item_slots) + loadout` → 尸体可拾（接上玩家尸体 loot 逻辑）。

## §3 敌人投放（Phase B·平行系统）

平行 `placement_rules` 范式（房间投放），但**输出不同**（NPC 是活实体·进 `npcInstances`，不是惰性取货的 roomInv）：
```
npc_placement_rules:      id · npc_id REF npc_pool(id) · count_min/max · max_per_room · spawn_phase_min · exclusion_group · enabled · notes · timestamps
npc_placement_rule_rooms: id · rule_id REF↑ CASCADE · br_room_id(软引用) · weight>0 · UNIQUE(rule_id,br_room_id)
```
- 新 `allocateRoomNpcs(seed, roomIds, rules, ruleRooms)`：复用 `weightedSampleNoReplace` + `hashSeed(seed,'npcplace:'+rule.id)` → 确定性 → `{roomId:[npcId,…]}`。
- `initBrRoomLayer` 在 roomInv 块之后：查两表 → `allocateRoomNpcs` → 批量 fetch `npc_pool` 行 → 逐个 `normalizeNpcInstance` + §2 装备/class 解析 → 落 `gamevars.npcInstances`。**替代** `pickOrSpawnNpcInstance` 的 `Math.random` 路径 → NPC 投放确定性。
- `spawn_phase_min` → NPC 遭遇可见性门（越晚越肥·或预生成+门控）。
- **👹 敌人投放 tab**：克隆 `RoomItemsTab`（去 entry_kind 切换·物品下拉换 NPC 下拉·留 `CandidateRoomPicker`）。
- **NpcsTab 扩展**：加 class_id 下拉 + 4 装备槽下拉(probe/shield/weapon/comm·从 equipment_tiers 按 series.slot) + 物品槽 repeater（"NPC 是什么" 在 NpcsTab·"NPC 在哪刷" 在敌人投放 tab·同道具/房间投放分工）。

## §4 Chamber 退役（Phase D·后续·分两步）
敌人投放跑通后：① `br_rooms` 加 pollution_accel/is_exit/exit_cost（从各房当前采样模板回填）；② NPC spawn 已走敌人投放（不再 chamber_template_ids）；③ probe/residue 键 `chamber_template_id`→`room_id`（旧 probe 过期处理）；④ 改 `getChamberAsMapConfig`/`buildChamberAccelTable` 读 br_rooms；删 `roomTemplates.js` 采样 / `gamevars.br.roomTemplates` / topology `templateMeta` / `ChambersTab`；⑤ 退役 `chamber_templates` + `*.chamber_template_ids`。**风险**：在飞局快照、旧 probe 键、过程化密度曲线需手排（用户重排数值时一并）。

## §5 阶段计划

| Phase | 内容 | 风险 |
|---|---|---|
| **A 统一战斗引擎+schema** | `computeCombatStats`(base×职业乘区×装备乘区·兼容加法) 泛化 `buildCombatPlayer`·玩家+NPC 同构；equipment_tiers pct 列；npc_pool class/装备槽/物品槽+补缺列；NPC 战斗实体(class+装备快照)；**修死掉落**；NpcsTab 加 class/装备/物品槽编辑 | **高**(改全战斗·迁移期靠加法项保平衡) |
| **B 敌人投放** | `npc_placement_rules`+表 + `allocateRoomNpcs` 确定性 + initBrRoomLayer 实例化(**修 Math.random**) + 👹 敌人投放 tab | 中 |
| **C 全游戏数值重排** | 重排 base/职业乘区/装备 pct/NPC base —— **数据·用户主导**(我给合理默认+工具·用户调) | 中(平衡) |
| **D chamber 退役** | §4·后续 | 高(迁移) |

**红线（贯穿）**：① `calcDamage` 实体无关·不动公式。② Phase A 迁移期**现有玩家平衡不崩**（新乘区列 DEFAULT 0/中性·旧加法项暂保平衡）→ 数值真正重排在 Phase C 用户主导。③ 确定性：NPC 投放/装备解析用种子 PRNG（同 seed 同结果）。④ 残片可发现性/六纪元 lore/缩圈致死/房间投放(placement_rules) 不碰。⑤ SQL 幂等。⑥ 探针(probeEncounter)combat 路径一并纳入 `computeCombatStats`（已有 snapshot atk/def）。
