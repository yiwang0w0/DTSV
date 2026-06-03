-- ============================================================
-- Phase 37 — 统一战斗引擎 schema (玩家 = NPC = 探针 同一公式)
-- ============================================================
-- 目标:让玩家 / NPC / 探针 三类实体走同一战斗 stat 组装公式
--   stat = round( (base + classAdd + equipAdd) × (1 + classMult) × (1 + equipMult) )
--   · base     —— 实体基础值(玩家 player.atk/def/maxHp;NPC npc_pool.atk/def/hp;探针快照)
--   · classAdd —— 职业 flat(classes.base_atk_bonus/base_def_bonus/base_hp_bonus)
--   · equipAdd —— 已装备 tier 加法(equipment_tiers.base_atk/base_def/base_hp)
--   · classMult—— 职业 perks 乘子(classes.perks.combat_dmg_mult/combat_def_mult/combat_hp_mult)
--   · equipMult—— 已装备 tier 百分比之和(equipment_tiers.atk_pct/def_pct/hp_pct  ← 本迁移新增)
--
-- 本文件【只动 schema】,是 Phase 37 唯一触碰 DB 结构者。引擎/UI 由
--   src/lib/combatStats.js、src/lib/server/gameActions.js、
--   src/lib/roomState.js、src/app/admin/_tabs/NpcsTab.jsx 实现。
--
-- ── 平衡中性铁律(红线 ②)──
--   所有新列 DEFAULT 取【中性值】(乘区 0 / accuracy=0.85 / counter_rate=0.3),
--   使现有玩家与 NPC 的战斗数值【逐值不变】:
--     · equipment_tiers.{atk,def,hp}_pct DEFAULT 0 → equipMult=0 → 乘区因子=1
--     · npc_pool.class_id 可空(NULL→classAdd/classMult=0)
--     · npc_pool.loadout_tiers DEFAULT '{}'  → equipAdd/equipMult=0
--     · npc_pool.item_slots    DEFAULT '[]'  → 掉落表空(= 现状,见下"修死掉落")
--     · npc_pool.accuracy/counter_rate DEFAULT = 旧代码回落值 → 反击概率逐值不变
--   数值真正重排(给装备/NPC 配乘区与职业)留 Phase C,由用户主导。
--
-- ── 修复:NPC 死亡掉落 bug ──
--   createNpcCorpse(gameActions.js) 现读 npc.drop_items —— 该列从不存在 →
--   永远 undefined → NPC 死亡【啥都不掉】。本迁移用 item_slots(物品) +
--   loadout_tiers(装备) 取代之,作为掉落来源(引擎侧改读 instance.inventory/loadout)。
--   平衡中性:旧 NPC item_slots=[]、loadout_tiers={} → 掉落仍空(与现状一致);
--   一旦后台 NpcsTab 填了槽位,尸体即有掉落 —— 这正是 bug 的修复。
--
-- ── 补缺列:accuracy / counter_rate ──
--   combat 现读 instance.npc.accuracy / counter_rate(gameActions.js)但两列不存在 →
--   永远回落 Number(...)||0.85 与 ||0.3。本迁移补列且 DEFAULT 正是这两个回落值,
--   故补列后既有 NPC 战斗行为逐位不变;此后这些值才真正可由后台落库生效。
--   (注:NpcsTab openAdd 已写 accuracy:0.85 / counter_rate:0.30,但此前因列缺失被
--    Supabase 静默丢弃;补列后方能持久化。)
--
-- ── 边界(本期不建,留后续 Phase)──
--   · npc_placement_rules / npc_placement_rule_rooms —— 敌人投放(Phase B)
--   · 装备/NPC 的真实乘区数值重排 —— Phase C
--   红线 ④:残片可发现性 / 六纪元 lore / 缩圈致死 / 房间投放(placement_rules/room_items)
--           本迁移一律不碰。
--
-- 幂等(红线 ⑤):全部 ADD COLUMN IF NOT EXISTS;可安全重复执行。
-- 事务包裹:沿用既有迁移惯例(见 phase-25q)BEGIN; / COMMIT;。
--
-- 调研确认(对实时库实测,2026-06-04):
--   · npc_pool 19 列 —— 无 class_id/loadout_tiers/item_slots/accuracy/counter_rate/drop_items
--   · equipment_tiers 19 列 —— 有 base_atk/base_def/base_hp(int DEFAULT 0),无 *_pct
--   · classes.id = bigint  → class_id 必须 bigint(本迁移已对齐)
--   · equipment_series.slot ∈ {probe, shield, weapon, comm} = 玩家 loadout 四槽,完美对齐
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 装备乘区:equipment_tiers 百分比列(equipMult 分量)
--    DEFAULT 0 → 现有所有 tier 的 equipMult=0 → 乘区因子=1(平衡中性)。
--    语义:0.2 = +20%。Phase C 由用户为各 tier 重排实际百分比。
-- ============================================================
ALTER TABLE equipment_tiers ADD COLUMN IF NOT EXISTS atk_pct real NOT NULL DEFAULT 0;
ALTER TABLE equipment_tiers ADD COLUMN IF NOT EXISTS def_pct real NOT NULL DEFAULT 0;
ALTER TABLE equipment_tiers ADD COLUMN IF NOT EXISTS hp_pct  real NOT NULL DEFAULT 0;

COMMENT ON COLUMN equipment_tiers.atk_pct IS
  '装备攻击乘区(equipMult 分量);0.2 = +20% atk。Phase A 默认 0 保平衡中性,Phase C 重排。';
COMMENT ON COLUMN equipment_tiers.def_pct IS
  '装备防御乘区(equipMult 分量);0.2 = +20% def。Phase A 默认 0 保平衡中性,Phase C 重排。';
COMMENT ON COLUMN equipment_tiers.hp_pct IS
  '装备生命乘区(equipMult 分量);0.2 = +20% maxHp。Phase A 默认 0 保平衡中性,Phase C 重排。';

-- ============================================================
-- 2. NPC 槽位:镜像玩家(职业 + 已装备 tier 快照 + 物品槽)
--    NPC 不铸装备实例,而以"快照"方式在 spawn 时 join equipment_tiers/classes,
--    解析出 classAdd/classMult/equipAdd/equipMult,与玩家走同一公式。
-- ============================================================
ALTER TABLE npc_pool ADD COLUMN IF NOT EXISTS class_id bigint REFERENCES classes(id);
ALTER TABLE npc_pool ADD COLUMN IF NOT EXISTS loadout_tiers jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE npc_pool ADD COLUMN IF NOT EXISTS item_slots    jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN npc_pool.class_id IS
  'NPC 职业(FK classes.id,bigint)。可空;非空时解析 base_*_bonus→classAdd、perks→classMult。
   镜像玩家 classId。NULL → classAdd/classMult 全 0(平衡中性)。';
COMMENT ON COLUMN npc_pool.loadout_tiers IS
  'NPC 已装备 tier 快照 {probe,shield,weapon,comm: equipment_tiers.id|null}。
   spawn 时 join equipment_tiers → equipAdd(base_atk/def/hp) + equipMult(*_pct)。
   镜像玩家 loadout(equipment_instances)。DEFAULT {} → equipAdd/equipMult 全 0(平衡中性)。';
COMMENT ON COLUMN npc_pool.item_slots IS
  'NPC 物品槽 [{item:物品名, qty:数量}]。镜像玩家 inventory;兼作死亡掉落表
   (createNpcCorpse 读 item_slots + loadout_tiers 生成尸体掉落,修复 drop_items 不存在 bug)。
   DEFAULT [] → 掉落空(= 现状)。';

-- ============================================================
-- 3. 补缺列:accuracy / counter_rate(combat 已读但列不存在 → 一直回落默认)
--    DEFAULT 取旧代码回落值 → 补列后既有 NPC 反击概率逐值不变(平衡中性)。
-- ============================================================
ALTER TABLE npc_pool ADD COLUMN IF NOT EXISTS accuracy     real NOT NULL DEFAULT 0.85;
ALTER TABLE npc_pool ADD COLUMN IF NOT EXISTS counter_rate real NOT NULL DEFAULT 0.3;

COMMENT ON COLUMN npc_pool.accuracy IS
  'NPC 反击命中率(0-1)。DEFAULT 0.85 = 此前 combat 代码回落值 (Number(npc.accuracy)||0.85),
   补列后行为逐值不变;此后可由后台 NpcsTab 持久化生效。';
COMMENT ON COLUMN npc_pool.counter_rate IS
  'NPC 反击触发率(0-1)。DEFAULT 0.3 = 此前 combat 代码回落值 (Number(npc.counter_rate)||0.3),
   补列后行为逐值不变;此后可由后台 NpcsTab 持久化生效。';

COMMIT;

-- ============================================================
-- 验证查询(部署后手动跑;期望结果见注释)
-- ============================================================

-- (a) 5 个新列全部就位、类型/默认/可空正确
--     期望 7 行:
--       equipment_tiers.atk_pct  | real    | NO  | 0
--       equipment_tiers.def_pct  | real    | NO  | 0
--       equipment_tiers.hp_pct   | real    | NO  | 0
--       npc_pool.class_id        | bigint  | YES | (null)
--       npc_pool.loadout_tiers   | jsonb   | NO  | '{}'::jsonb
--       npc_pool.item_slots      | jsonb   | NO  | '[]'::jsonb
--       npc_pool.accuracy        | real    | NO  | 0.85
--       npc_pool.counter_rate    | real    | NO  | 0.3
-- SELECT table_name, column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE (table_name = 'equipment_tiers' AND column_name IN ('atk_pct','def_pct','hp_pct'))
--    OR (table_name = 'npc_pool' AND column_name IN ('class_id','loadout_tiers','item_slots','accuracy','counter_rate'))
-- ORDER BY table_name, column_name;

-- (b) 平衡中性:现有 NPC 的新乘区/槽位全为中性(掉落空、accuracy/counter_rate=旧回落值)
--     期望:bad_loadout = 0, bad_items = 0, bad_acc = 0, bad_cr = 0
-- SELECT
--   count(*) FILTER (WHERE loadout_tiers <> '{}'::jsonb)        AS bad_loadout,
--   count(*) FILTER (WHERE item_slots    <> '[]'::jsonb)        AS bad_items,
--   count(*) FILTER (WHERE accuracy      IS DISTINCT FROM 0.85) AS bad_acc,
--   count(*) FILTER (WHERE counter_rate  IS DISTINCT FROM 0.3)  AS bad_cr
-- FROM npc_pool;

-- (c) 平衡中性:现有装备乘区全为 0(equipMult=0 → 因子 1)
--     期望:nonzero_pct = 0
-- SELECT count(*) AS nonzero_pct
-- FROM equipment_tiers
-- WHERE atk_pct <> 0 OR def_pct <> 0 OR hp_pct <> 0;

-- (d) FK 完整性:class_id → classes(id) 外键已建立
--     期望 1 行(constraint_name 形如 npc_pool_class_id_fkey)
-- SELECT conname AS constraint_name
-- FROM pg_constraint
-- WHERE conrelid = 'npc_pool'::regclass
--   AND contype = 'f'
--   AND conname LIKE '%class_id%';
