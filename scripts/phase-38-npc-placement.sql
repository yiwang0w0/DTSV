-- ============================================================
-- Phase 38 — 敌人投放规则（NPC 为中心 · 全图分布）npc_placement_rules + npc_placement_rule_rooms
-- ============================================================
-- 来源: 【SQL】契约 — Phase B「敌人投放契约」§① SCHEMA（仿 phase-36 §1 投放规则范本，替换为 NPC 语义）。
--
-- 用途 / WHY:
--   把敌人遭遇模型从「每次搜索程序化随机 spawn」翻转为**以 NPC 为中心的全图分布**（与 Phase 36
--   道具投放严格平行）：策划/admin 声明一条规则「这个 npc_pool 敌人全图共投放 [count_min,count_max]
--   只，落在以下候选房（带权重）里，越晚越肥门控 spawn_phase_min，可选互斥组 exclusion_group」。
--   开局 initBrRoomLayer 用本两表 + per-raid seed，经 server 端 allocateRoomNpcs
--   （src/lib/server/br/npcPlacement.js）确定性地把每条规则的 count 只**加权无放回**地撒到候选房，
--   产出紧凑遭遇快照 gamevars.br.roomNpcs（每房 [[npcId,revealPhase],…] 二元组数组；npcId 为小整数
--   直存、无 ref 去重表 —— 区别于 roomItems 的三元组 + roomInvRefs）。搜索命中 npc 分支时 authored
--   优先 materialize（走 Phase A resolveNpcCombatProfile + normalizeNpcInstance）、取走即标 taken
--   持久化（一次性、不再生）。取不到则回落现有程序化 spawn（NPC 仍照常出现、零功能回归）。
--
--   两张表在本文件落地（SQL 实现者只动本文件 + DB schema）：
--     §1a npc_placement_rules      —— 规则主表（NPC 为中心 · 全图只数区间 · 门控 · 互斥组）。
--     §1b npc_placement_rule_rooms —— 规则↔候选房（带 weight）多对多桥接（软引用 br_rooms.room_id）。
--   运行时算法（allocateRoomNpcs / takeNpcFromRoom，复用 roomItems.weightedSampleNoReplace）与
--   gameActions 接线、编辑器（NpcPlacementTab）由 server / editor 实现者另写；唯一契约接口 =
--   本文件列名/类型。本表纯 schema，不含任何运行时；确定性由消费端 hashSeed(seed,'npcplace:'+rule.id)
--   保证（本表不引入随机）。
--
-- ── 与 phase-36（placement_rules）的精确差异（实现者照此偏离）──────────────────────────
--   ① 单一 NPC 引用：npc_id bigint NOT NULL REFERENCES npc_pool(id) ON DELETE CASCADE。
--      NPC 投放只有一种实体类型 —— **删 entry_kind / item_name / tier_id / kind_xor CHECK**
--      （区别于 placement_rules 的 item / equipment_tier 双形，NPC 无双形，NOT NULL FK 已足）。
--      注：npc_pool.id 为 integer PK；bigint FK 引用 integer PK，Postgres 接受（已核 DB）。
--   ② 所有约束/触发器/索引/函数名前缀 placement_* → npc_placement_*（独立对象，不耦合 phase-36）。
--   ③ room_items DEPRECATED 注释段**不复制**（那是 phase-36 专属，本 migration 完全不碰 room_items）。
--   其余（IDENTITY PK · count_min/count_max/max_per_room/spawn_phase_min/exclusion_group · 软引用
--   br_room_id · weight · UNIQUE · by_rule index · updated_at 触发器 · BEGIN/COMMIT 幂等）与 phase-36
--   字节级同构。
--
-- ── 红线对齐（与契约 §红线核验 ①…⑦ 一一对应）────────────────────────────────────
--   ① 平行房间投放范式（roomItems.js / placement_rules）：roomNpcs 输出格式由 server 端
--      allocateRoomNpcs 产出（每房 [[npcId,revealPhase],…]）；allocateRoomNpcs 复用
--      weightedSampleNoReplace + hashSeed(seed,'npcplace:'+rule.id)（唯一前缀差异 'placement:'→
--      'npcplace:'），加权无放回 · 互斥组按 id 序分散 · count=区间 · GLOBAL_NPC_CAP 跨房封顶 ——
--      算法与 allocateRoomInventory 逐行同构。**本表纯 schema，不含任何运行时判定，不引入随机**。
--   ② roomNpcs 紧凑：仅有投放房建 key · 每房 [[npcId,revealPhase],…] · npcId 小整数直存（无 ref 表）
--      · taken=push(1) · normalizeBrBlock 兜底空对象控增量。**本表只提供 count_min/count_max/
--      max_per_room/spawn_phase_min/weight/exclusion_group 参数**，运行时由消费端 materialize。
--   ③ 遭遇：authored roomNpcs 优先 materialize（相位门 revealPhase<=effPhase · 一次性 taken）；取不到
--      回落现有过程化 spawn（chamber_template_ids 池）但把原生非确定随机改为种子确定性 —— NPC 仍照常
--      出现 · 零功能回归。spawn_phase_min 即 roomNpcs 二元组的 revealPhase（越晚越肥门控）。本表只存门控值。
--   ④ materialize 走 Phase A resolveNpcCombatProfile + normalizeNpcInstance（NPC 带 class/装备/物品槽 ·
--      mapId 仍=roomTemplates[roomId] 保 combat/corpse 匹配）。Phase A 对象（resolveNpcCombatProfile /
--      buildCombatNpc / normalizeNpcInstance / createNpcCorpse / NpcsTab）只复用不改，本文件零触。
--   ⑤ 缩圈致死（sweepContractionDeaths / closePhases）/ 残片 / lore / 房间投放（placement_rules /
--      room_items / roomInv）不碰；calcDamage / computeCombatStats 不碰。本文件只加两张全新表，
--      零触 br_rooms / closePhases / roomTemplates / 致死判定 / fragment 表 / npc_pool（只读 FK 目标，
--      不改其结构/数据）/ placement_rules / placement_rule_rooms / room_items。
--   ⑥ 幂等：全文 BEGIN/COMMIT；CREATE TABLE IF NOT EXISTS；约束用 pg_constraint 检测后 ADD
--      （不存在才加）；UNIQUE 用 pg_constraint 检测后 ADD；CREATE OR REPLACE FUNCTION；
--      DROP TRIGGER IF EXISTS / CREATE TRIGGER；CREATE INDEX IF NOT EXISTS；
--      COMMENT ON 天然幂等。可安全重复执行。
--   ⑦ 不部署：本文件**只写不跑**，由主代理审后用 postgres MCP 执行（参考 phase-33/34/36 模式）。
--      不 commit / push / 起 dev server。
--
-- ── 关键设计决策（务必读注释，影响 FK 行为）──────────────────────────────────────
--   • npc_placement_rules.npc_id REFERENCES npc_pool(id) ON DELETE CASCADE：单一 NPC 引用（无 XOR），
--     删 NPC 连带清掉引用它的规则。npc_id 声明为 bigint，引用 npc_pool.id 的 integer PK —— Postgres
--     允许 bigint FK 引用 integer PK（已核 DB：npc_pool_pkey 为 integer 主键）。npc_pool 仅作 FK 目标
--     只读引用，不改其结构/数据。
--   • npc_placement_rule_rooms.br_room_id **故意不建 FK** 到 br_rooms(room_id)：沿用 phase-34/36 软引用
--     范式。房间编辑器要支持增删房（达成 30-40 房）；若建 FK，删房会 ON DELETE CASCADE 静默清掉
--     候选行或 RESTRICT 阻塞删房。改为软引用 —— allocateRoomNpcs 只对*本局实际房集*(roomIds) 内的
--     br_room_id 生效，孤儿候选自然忽略不报错。⇒ 规则↔候选 与房增删解耦。
--   • npc_placement_rule_rooms.rule_id REFERENCES npc_placement_rules(id) ON DELETE CASCADE：删规则连带
--     清其全部候选行（编辑器删规则只需 delete 主表，候选自动级联）。
--   • UNIQUE(rule_id, br_room_id)：同一规则对同一候选房只允许一行（一房一权重），编辑器候选同步
--     可安全「delete by rule_id → 批量 insert」。
--
-- ⚠ 事务: 纯 DDL（CREATE TABLE / ALTER ADD CONSTRAINT / CREATE FUNCTION / CREATE TRIGGER /
--   CREATE INDEX / COMMENT），全文 BEGIN/COMMIT 包裹原子提交。本 migration **不灌任何规则数据**。
--
-- ── 部署后验证（用 pg_execute_query 跑；同 phase-36 风格）────────────────────────────
--   -- a) 两表均已建:
--   SELECT to_regclass('public.npc_placement_rules'), to_regclass('public.npc_placement_rule_rooms');
--   --   期望: 两者都非 null。
--   -- b) npc_placement_rules 列结构（列/类型/默认/非空）:
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_name='npc_placement_rules' ORDER BY ordinal_position;
--   -- c) npc_placement_rules 全部 CHECK / FK / PK 约束在位:
--   SELECT conname FROM pg_constraint
--    WHERE conrelid='npc_placement_rules'::regclass ORDER BY conname;
--   --   期望含: npc_placement_rules_count_range / npc_placement_rules_max_per_room_pos /
--   --           npc_placement_rules_phase_nonneg + 1 个 FK(npc_id) + pkey。
--   --   （**无 kind_xor** —— 单 npc_id 引用，区别于 phase-36 的 4 命名 CHECK。）
--   -- d) npc_placement_rules updated_at 触发器存在且 BEFORE UPDATE:
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid='npc_placement_rules'::regclass AND NOT tgisinternal;
--   --   期望含 npc_placement_rules_set_updated_at。
--   -- e) npc_placement_rule_rooms 全部约束在位:
--   SELECT conname FROM pg_constraint
--    WHERE conrelid='npc_placement_rule_rooms'::regclass ORDER BY conname;
--   --   期望含: npc_placement_rule_rooms_weight_pos + npc_placement_rule_rooms_rule_room_key(UNIQUE)
--   --           + FK(rule_id) + pkey。
--   -- f) npc_placement_rule_rooms 索引在位:
--   SELECT indexname FROM pg_indexes
--    WHERE tablename='npc_placement_rule_rooms';   -- 期望含 npc_placement_rule_rooms_by_rule
--   -- g) migration 不灌数据:
--   SELECT count(*) FROM npc_placement_rules;       -- 期望 0
--   SELECT count(*) FROM npc_placement_rule_rooms;  -- 期望 0
--   -- h) phase-36 房间投放表未被触碰（红线⑤ 不碰 placement_rules / room_items）:
--   SELECT to_regclass('public.placement_rules'), to_regclass('public.placement_rule_rooms'),
--          to_regclass('public.room_items');        -- 三者均非 null
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- §1a npc_placement_rules —— 敌人投放规则主表（NPC 为中心 · 全图分布）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS npc_placement_rules (
  id              bigint      GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  -- 单一 NPC 引用（无 XOR：NPC 投放只有一种实体类型，区别于 placement_rules 的 item/equipment_tier
  -- 双形）。删 NPC 连带清引用它的规则。npc_id=bigint 引用 npc_pool.id 的 integer PK（Postgres 接受）。
  npc_id          bigint      NOT NULL REFERENCES npc_pool(id) ON DELETE CASCADE,
  -- 全图投放只数下界（**非每房** —— 整张图共投放 count 只）。
  count_min       integer     NOT NULL DEFAULT 1,
  -- 全图投放只数上界。消费端 count = U[count_min, count_max]（seed PRNG 闭区间，本表只存区间）。
  count_max       integer     NOT NULL DEFAULT 1,
  -- 单候选房最多落几只（本期固定 1；保留列以备后续 max_per_room>1）。
  max_per_room    integer     NOT NULL DEFAULT 1,
  -- 越晚越肥门控：effPhase>=此值才可遭遇（0=开局可见）。消费端 = roomNpcs 二元组的 revealPhase。
  spawn_phase_min integer     NOT NULL DEFAULT 0,
  -- 互斥组键（任意文本）：同组规则按 id 序逐个落、后者剔除前者占用房 → 同组不同房。NULL/空=不互斥。
  exclusion_group text        NULL,
  -- 软开关：仅 enabled 行参与分配（分配端二次防御 + initBrRoomLayer 查询 .eq('enabled', true)）。
  enabled         boolean     NOT NULL DEFAULT true,
  notes           text        NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- BEFORE UPDATE 触发器自动刷 now()（沿用 phase-33/34/36 *_set_updated_at 范式）。
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE npc_placement_rules IS
  'Phase 38 — 敌人投放规则主表（NPC 为中心 · 全图分布）。每行=「这个 npc_id 敌人全图共投放
   U[count_min,count_max] 只，落在 npc_placement_rule_rooms 列出的候选房（带 weight），最早 spawn_phase_min
   显形可遭遇，可选 exclusion_group 互斥」。开局 allocateRoomNpcs(seed,roomIds,rules,ruleRooms) 经
   forbidden.js 种子 PRNG（hashSeed(seed,''npcplace:''+rule.id) + mulberry32）把每条规则的 count 只加权
   无放回撒到候选房，产 gamevars.br.roomNpcs 快照（每房 [[npcId,revealPhase],…] 二元组；npcId 小整数直存，
   无 ref 去重表 —— 区别于 roomItems 三元组 + roomInvRefs）。authored 命中走 npc 门控内 authored-first
   materialize（Phase A resolveNpcCombatProfile + normalizeNpcInstance，mapId=roomTemplates[roomId] 保
   combat/corpse 匹配）；取不到回落现有程序化 spawn（NPC 仍照常出现 · 零功能回归）。与 phase-36
   placement_rules（道具中心）严格平行，唯独单一 npc_id 引用（无 entry_kind/item/tier 双形）。';

COMMENT ON COLUMN npc_placement_rules.npc_id IS
  '投放的敌人 = npc_pool.id（单一 NPC 引用，无 XOR/双形）。ON DELETE CASCADE：删 NPC 连带清引用它的
   规则。声明为 bigint，引用 npc_pool.id 的 integer PK（Postgres 允许 bigint FK 引用 integer PK）。';
COMMENT ON COLUMN npc_placement_rules.count_min IS
  '全图投放只数下界（**非每房**：整图共投 count 只）。消费端 count=U[count_min,count_max]。';
COMMENT ON COLUMN npc_placement_rules.count_max IS
  '全图投放只数上界。消费端经 seed PRNG 在闭区间 [count_min,count_max] 抽 count（本表只存区间）。';
COMMENT ON COLUMN npc_placement_rules.max_per_room IS
  '单候选房最多落几只（本期固定 1；max_per_room=1 由分配端「加权无放回 + 每房至多被一条规则一次
   push 同 npcId」自然满足）。保留列以备后续 >1。';
COMMENT ON COLUMN npc_placement_rules.spawn_phase_min IS
  '越晚越肥门控（int≥0）：搜索时 effPhase=min(maxPhase, realPhase+depth) >= 本值才可遭遇；
   0=开局即可见。即 roomNpcs 二元组的 revealPhase。';
COMMENT ON COLUMN npc_placement_rules.exclusion_group IS
  '互斥组键（任意文本，NULL/空=不互斥）。同 exclusion_group 的规则按 id 升序逐个分配，后者候选已
   剔除前者占用房 → 同组不同房且各自都铺到别房（配置需保证组内各规则候选并集房数 ≥ Σcount）。';
COMMENT ON COLUMN npc_placement_rules.enabled IS
  '软开关：仅 enabled=true 行参与分配（initBrRoomLayer 查询 .eq(''enabled'', true)；分配端再过滤兜底）。';
COMMENT ON COLUMN npc_placement_rules.updated_at IS
  'Phase 38 — 任何行 UPDATE 经触发器 npc_placement_rules_set_updated_at 自动推到 now()
   （编辑器 / 手工 SQL / admin 一律生效）。';

-- ── CHECK 约束（全部命名，便于幂等 DROP/重建；pg_constraint 检测后 ADD）──────────────
--   注：**无 kind_xor** —— 单 npc_id NOT NULL FK 引用已足（区别于 phase-36 的 entry_kind XOR）。
DO $$
BEGIN
  -- 全图只数区间合法：下界非负且 min<=max。
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='npc_placement_rules_count_range' AND conrelid='npc_placement_rules'::regclass) THEN
    ALTER TABLE npc_placement_rules ADD CONSTRAINT npc_placement_rules_count_range CHECK (
      count_min >= 0 AND count_min <= count_max
    );
  END IF;

  -- 单房上限至少 1。
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='npc_placement_rules_max_per_room_pos' AND conrelid='npc_placement_rules'::regclass) THEN
    ALTER TABLE npc_placement_rules ADD CONSTRAINT npc_placement_rules_max_per_room_pos CHECK (
      max_per_room >= 1
    );
  END IF;

  -- 显形 phase 非负。
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='npc_placement_rules_phase_nonneg' AND conrelid='npc_placement_rules'::regclass) THEN
    ALTER TABLE npc_placement_rules ADD CONSTRAINT npc_placement_rules_phase_nonneg CHECK (
      spawn_phase_min >= 0
    );
  END IF;
END $$;

-- ── updated_at 触发器（独立函数名，避免与 phase-33 br_rooms / phase-34 room_items /
--    phase-36 placement_rules 触发器耦合）──
--   CREATE OR REPLACE ⇒ 幂等；仅 BEFORE UPDATE（INSERT 走列 DEFAULT now()）。
CREATE OR REPLACE FUNCTION npc_placement_rules_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION npc_placement_rules_set_updated_at() IS
  'Phase 38 — npc_placement_rules BEFORE UPDATE 触发器函数：每次行更新把 updated_at 推到 now()
   （对编辑器 / 手工 SQL / admin 一律生效）。沿用 phase-33/34/36 范式，独立函数名避免耦合。';

DROP TRIGGER IF EXISTS npc_placement_rules_set_updated_at ON npc_placement_rules;
CREATE TRIGGER npc_placement_rules_set_updated_at
  BEFORE UPDATE ON npc_placement_rules
  FOR EACH ROW
  EXECUTE FUNCTION npc_placement_rules_set_updated_at();

-- ────────────────────────────────────────────────────────────
-- §1b npc_placement_rule_rooms —— 规则↔候选房（带 weight）多对多桥接
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS npc_placement_rule_rooms (
  id          bigint  GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  -- 所属规则；删规则连带清其全部候选行。
  rule_id     bigint  NOT NULL REFERENCES npc_placement_rules(id) ON DELETE CASCADE,
  -- 候选物理房 = br_rooms.room_id 的*值*（软引用，故意不建 FK —— 见文件头决策，解耦房增删）。
  br_room_id  integer NOT NULL,
  -- 加权无放回抽样权重（越大越易被该规则选中）。default 1。
  weight      real    NOT NULL DEFAULT 1
);

COMMENT ON TABLE npc_placement_rule_rooms IS
  'Phase 38 — 敌人投放规则↔候选房（带 weight）多对多桥接。每行=「rule_id 这条规则可把敌人投到
   br_room_id 这间房，权重 weight」。allocateRoomNpcs 按 rule_id 分组候选、过滤本局房集、按 br_room_id
   升序后用 weightedSampleNoReplace（复用 roomItems 导出）加权无放回抽 count 个不同房。br_room_id 为
   软引用（不建 FK，解耦房增删）：分配只对本局实际房集生效，孤儿候选忽略。与 phase-36
   placement_rule_rooms 字节级同构（仅 rule_id 指向 npc_placement_rules）。';

COMMENT ON COLUMN npc_placement_rule_rooms.rule_id IS
  '所属 npc_placement_rules.id；ON DELETE CASCADE：删规则连带清其全部候选行（编辑器删规则只删主表）。';
COMMENT ON COLUMN npc_placement_rule_rooms.br_room_id IS
  '候选物理房 = br_rooms.room_id 的值。**软引用，故意无 FK**（沿用 phase-34/36）：房间编辑器需增删房，
   建 FK 会 CASCADE 误删候选或 RESTRICT 阻塞删房。allocateRoomNpcs 只对本局 roomIds 内的 br_room_id
   生效，房集外（孤儿）候选自然忽略，不报错。';
COMMENT ON COLUMN npc_placement_rule_rooms.weight IS
  '加权无放回抽样权重（real>0，越大越易被选中）。default 1。消费端 weightedSampleNoReplace 据此倾斜。';

-- ── CHECK + UNIQUE 约束（命名，pg_constraint 检测后 ADD ⇒ 幂等）─────────────────────
DO $$
BEGIN
  -- 权重必为正（weightedSampleNoReplace 的剩余池总权重>0 前提；editor 存盘仅 insert weight>0 行）。
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='npc_placement_rule_rooms_weight_pos' AND conrelid='npc_placement_rule_rooms'::regclass) THEN
    ALTER TABLE npc_placement_rule_rooms ADD CONSTRAINT npc_placement_rule_rooms_weight_pos CHECK (
      weight > 0
    );
  END IF;

  -- 同一规则对同一候选房只允许一行（一房一权重）。编辑器候选同步可安全 delete-by-rule → 批量 insert。
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='npc_placement_rule_rooms_rule_room_key' AND conrelid='npc_placement_rule_rooms'::regclass) THEN
    ALTER TABLE npc_placement_rule_rooms ADD CONSTRAINT npc_placement_rule_rooms_rule_room_key UNIQUE (rule_id, br_room_id);
  END IF;
END $$;

-- ── 索引：分配按 rule_id 分组候选（热点）──────────────────────────────────────────
--   注：rule_room_key UNIQUE(rule_id, br_room_id) 已隐式建 (rule_id, br_room_id) 复合索引，
--   单列 (rule_id) 前缀查询可借用之；此处显式建单列索引以匹配契约 §1b INDEX 要求、语义清晰。
CREATE INDEX IF NOT EXISTS npc_placement_rule_rooms_by_rule ON npc_placement_rule_rooms(rule_id);

COMMIT;
