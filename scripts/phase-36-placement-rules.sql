-- ============================================================
-- Phase 36 — 投放规则（道具为中心 · 全图分布）placement_rules + placement_rule_rooms
-- ============================================================
-- 来源: 【SQL】契约 — Phase 36「投放规则契约 — 道具为中心 · 全图分布」§1 SCHEMA。
--
-- 用途 / WHY:
--   把投放模型从 Phase 34 的「每房独立概率」翻转为**以道具/装备阶为中心的全图分布**：
--   策划/admin 声明一条规则「这件 item（或这个 equipment_tier）全图共投放 [count_min,count_max]
--   件，落在以下候选房（带权重）里，越晚越肥门控 spawn_phase_min，可选互斥组 exclusion_group」。
--   开局 initBrRoomLayer 用本两表 + per-raid seed，经 server 端 allocateRoomInventory
--   （src/lib/server/br/roomItems.js）确定性地把每条规则的 count 件**加权无放回**地撒到候选房，
--   产出与 Phase 34 字节级同构的紧凑库存快照 gamevars.br.roomInv（[refIdx,kind,revealPhase] 三元组
--   + 数组化去重 ref 索引 roomInvRefs.{items,tiers}）。搜索命中 loose-item 分支时 authored 优先
--   发放、取走即标 taken 持久化（一次性、不再生）。取不到则回落现有程序化 amount 权重抽取
--   （经济基线零破坏）。
--
--   两张表在本文件落地（SQL 实现者只动本文件 + DB schema）：
--     §1a placement_rules      —— 规则主表（道具/装备阶为中心 · 全图件数区间 · 门控 · 互斥组）。
--     §1b placement_rule_rooms —— 规则↔候选房（带 weight）多对多桥接（软引用 br_rooms.room_id）。
--   运行时算法（allocateRoomInventory / weightedSampleNoReplace）与 gameActions 接线、编辑器
--   由 server / editor 实现者另写；唯一契约接口 = 本文件列名/类型。
--
--   §1c room_items（Phase 34）**保留不 DROP** —— 仅打 DEPRECATED COMMENT（红线禁删现有表）。
--   item_pool.bundle_count（Phase 34）保留不碰；equipment_tiers 只读。
--
-- ── 红线对齐（与契约 §红线核验 ①…⑧ 一一对应）────────────────────────────────────
--   ① roomInv 输出格式不变：本表只「声明全图投放规则」。运行期 allocateRoomInventory 产出的
--      roomInv 件三元组 [refIdx,kind,revealPhase] + roomInvRefs.{items,tiers} 与 Phase 34
--      placeRoomInventory 字节级同构 → takeFromRoom / resolveSearchAction / 越晚越肥
--      (revealPhase<=effPhase) / 一次性 push(1) / procedural 回落 **全不动**。本文件纯 schema，
--      不含任何运行时判定。
--   ② 种子 PRNG 确定性：铺货随机由 server 端 forbidden.js 的 xmur3/mulberry32/hashSeed 按
--      per-raid seed + 'placement:'+rule.id 每规则独立派生（同 seed+rules+ruleRooms → 同 roomInv，
--      所有实例一致），禁非确定随机。本两表只提供 count_min/count_max/max_per_room/spawn_phase_min/
--      weight/exclusion_group 参数，**不引入任何随机**（确定性由消费端保证）。
--   ③ 语义保证：候选足够时 allocateRoomInventory 取 take=count（必铺够 count，非每房掷币）；
--      同一 exclusion_group 的规则按 id 序逐个落，后者候选已剔除前者占用房 → 同组不同房、各自
--      都铺到别房（配置需保证互斥组各规则候选并集房数 ≥ Σcount，编辑器侧提示）。本表只存
--      count_min/count_max（全图件数区间）+ exclusion_group（互斥组键）+ weight（候选权重）。
--   ④ 不 DROP room_items（Phase 34 空表，红线禁删现有表）：本文件仅加 DEPRECATED COMMENT，
--      运行期不再读；item_pool.bundle_count 保留不碰。
--   ⑤ CHECK 合规：editor 存盘强制 entry_kind XOR / count_min<=count_max / max_per_room>=1 /
--      weight>0 / spawn_phase_min>=0；本表用命名 CHECK 在 DB 级兜底。
--   ⑥ 残片可发现性 / 六纪元 lore / 缩圈致死（Phase1 快照）/ 装备系统完全不碰：本文件只加两张
--      新表 + room_items 一条 COMMENT，零触 br_rooms / closePhases / roomTemplates / 致死判定 /
--      fragment 表 / equipment_tiers（只读引用，不改其结构/数据）。
--   ⑦ 幂等：全文 BEGIN/COMMIT；CREATE TABLE IF NOT EXISTS；约束用 pg_constraint 检测后 ADD
--      （不存在才加）；UNIQUE 用 pg_constraint 检测后 ADD；CREATE OR REPLACE FUNCTION；
--      DROP TRIGGER IF EXISTS / CREATE TRIGGER；CREATE INDEX IF NOT EXISTS；
--      COMMENT ON 天然幂等。可安全重复执行。
--   ⑧ 不部署：本文件**只写不跑**，由主代理审后用 postgres MCP 执行（参考 phase-33/34 模式）。
--
-- ── 关键设计决策（务必读注释，影响 FK 行为）──────────────────────────────────────
--   • placement_rules.item_name REFERENCES item_pool(name)：item_pool_name_key UNIQUE(name)
--     已由 Phase 34 §0 建立（已核 DB），可直接引用。ON UPDATE CASCADE：admin 改道具名时规则
--     自动跟随；ON DELETE CASCADE：删道具连带清掉引用它的规则。
--   • placement_rules.tier_id REFERENCES equipment_tiers(id)（已是 PK，可直接建）；ON DELETE
--     CASCADE：删 tier 连带清引用它的规则。equipment_tiers 仅作 FK 目标只读引用，不改其结构/数据。
--   • placement_rule_rooms.br_room_id **故意不建 FK** 到 br_rooms(room_id)：沿用 Phase 34 软引用
--     范式。房间编辑器要支持增删房（达成 30-40 房）；若建 FK，删房会 ON DELETE CASCADE 静默清掉
--     候选行或 RESTRICT 阻塞删房。改为软引用 —— allocateRoomInventory 只对*本局实际房集*(roomIds)
--     内的 br_room_id 生效，孤儿候选自然忽略不报错。⇒ 规则↔候选 与房增删解耦。
--   • placement_rule_rooms.rule_id REFERENCES placement_rules(id) ON DELETE CASCADE：删规则连带
--     清其全部候选行（编辑器删规则只需 delete 主表，候选自动级联）。
--   • UNIQUE(rule_id, br_room_id)：同一规则对同一候选房只允许一行（一房一权重），编辑器候选同步
--     可安全「delete by rule_id → 批量 insert」。
--
-- ⚠ 事务: 纯 DDL（CREATE TABLE / ALTER ADD CONSTRAINT / CREATE FUNCTION / CREATE TRIGGER /
--   CREATE INDEX / COMMENT），全文 BEGIN/COMMIT 包裹原子提交。本 migration **不灌任何规则数据**。
--
-- ── 部署后验证（用 pg_execute_query 跑）─────────────────────────────────────────
--   -- a) 两表均已建:
--   SELECT to_regclass('public.placement_rules'), to_regclass('public.placement_rule_rooms');
--   --   期望: 两者都非 null。
--   -- b) placement_rules 列结构（列/类型/默认/非空）:
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_name='placement_rules' ORDER BY ordinal_position;
--   -- c) placement_rules 全部 CHECK / FK / PK 约束在位:
--   SELECT conname FROM pg_constraint
--    WHERE conrelid='placement_rules'::regclass ORDER BY conname;
--   --   期望含: placement_rules_kind_xor / placement_rules_count_range /
--   --           placement_rules_max_per_room_pos / placement_rules_phase_nonneg
--   --           + 2 个 FK(item_name, tier_id) + pkey。
--   -- d) placement_rules updated_at 触发器存在且 BEFORE UPDATE:
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid='placement_rules'::regclass AND NOT tgisinternal;
--   --   期望含 placement_rules_set_updated_at。
--   -- e) placement_rule_rooms 全部约束在位:
--   SELECT conname FROM pg_constraint
--    WHERE conrelid='placement_rule_rooms'::regclass ORDER BY conname;
--   --   期望含: placement_rule_rooms_weight_pos + placement_rule_rooms_rule_room_key(UNIQUE)
--   --           + FK(rule_id) + pkey。
--   -- f) placement_rule_rooms 索引在位:
--   SELECT indexname FROM pg_indexes
--    WHERE tablename='placement_rule_rooms';   -- 期望含 placement_rule_rooms_by_rule
--   -- g) migration 不灌数据:
--   SELECT count(*) FROM placement_rules;       -- 期望 0
--   SELECT count(*) FROM placement_rule_rooms;  -- 期望 0
--   -- h) room_items 仍存在（红线禁删现有表）:
--   SELECT to_regclass('public.room_items');    -- 非 null
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- §1a placement_rules —— 投放规则主表（道具/装备阶为中心 · 全图分布）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_rules (
  id              bigint      GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  -- 'item'（道具）| 'equipment_tier'（装备阶）。kind_xor 约束保证只填对应一侧引用。
  entry_kind      text        NOT NULL DEFAULT 'item',
  -- item 规则：引用 item_pool.name（改名跟随 / 删道具连带清规则）。
  item_name       text        NULL  REFERENCES item_pool(name) ON UPDATE CASCADE ON DELETE CASCADE,
  -- equipment_tier 规则：引用 equipment_tiers.id（删 tier 连带清规则）。
  tier_id         integer     NULL  REFERENCES equipment_tiers(id) ON DELETE CASCADE,
  -- 全图投放件数下界（**非每房** —— 整张图共投放 count 件）。
  count_min       integer     NOT NULL DEFAULT 1,
  -- 全图投放件数上界。消费端 count = U[count_min, count_max]（seed PRNG 闭区间，本表只存区间）。
  count_max       integer     NOT NULL DEFAULT 1,
  -- 单候选房最多落几件（本期固定 1；保留列以备后续 max_per_room>1）。
  max_per_room    integer     NOT NULL DEFAULT 1,
  -- 越晚越肥门控：effPhase>=此值才显形（0=开局可见）。消费端 = roomInv 件的 revealPhase。
  spawn_phase_min integer     NOT NULL DEFAULT 0,
  -- 互斥组键（任意文本）：同组规则按 id 序逐个落、后者剔除前者占用房 → 同组不同房。NULL=不互斥。
  exclusion_group text        NULL,
  -- 软开关：仅 enabled 行参与分配（分配端二次防御 + initBrRoomLayer 查询 .eq('enabled', true)）。
  enabled         boolean     NOT NULL DEFAULT true,
  notes           text        NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- BEFORE UPDATE 触发器自动刷 now()（沿用 phase-33/34 *_set_updated_at 范式）。
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE placement_rules IS
  'Phase 36 — 投放规则主表（道具为中心 · 全图分布）。每行=「entry_kind 这件 item/装备阶全图共投放
   U[count_min,count_max] 件，落在 placement_rule_rooms 列出的候选房（带 weight），最早 spawn_phase_min
   显形，可选 exclusion_group 互斥」。开局 allocateRoomInventory(seed,roomIds,rules,ruleRooms) 经
   forbidden.js 种子 PRNG 把每条规则的 count 件加权无放回撒到候选房，产 gamevars.br.roomInv 快照
   （与 Phase 34 placeRoomInventory 字节级同构）。authored 命中走 loose-item 门控内 authored-first
   发放；取不到回落现有程序化 amount 抽取（经济基线零破坏）。取代 Phase 34 room_items 的每房独立
   概率模型（room_items 保留空表不 DROP，已 DEPRECATED）。';

COMMENT ON COLUMN placement_rules.entry_kind IS
  '''item'' | ''equipment_tier''。kind_xor 约束强制：item→item_name 非空且 tier_id 空；
   equipment_tier→tier_id 非空且 item_name 空。';
COMMENT ON COLUMN placement_rules.count_min IS
  '全图投放件数下界（**非每房**：整图共投 count 件）。消费端 count=U[count_min,count_max]。';
COMMENT ON COLUMN placement_rules.count_max IS
  '全图投放件数上界。消费端经 seed PRNG 在闭区间 [count_min,count_max] 抽 count（本表只存区间）。';
COMMENT ON COLUMN placement_rules.max_per_room IS
  '单候选房最多落几件（本期固定 1；max_per_room=1 由分配端「加权无放回 + 每房至多被一条规则一次
   push 同 refIdx」自然满足）。保留列以备后续 >1。';
COMMENT ON COLUMN placement_rules.spawn_phase_min IS
  '越晚越肥门控（int≥0）：搜索时 effPhase=min(maxPhase, realPhase+depth) >= 本值才可取；
   0=开局即可见。即 roomInv 件三元组的 revealPhase。';
COMMENT ON COLUMN placement_rules.exclusion_group IS
  '互斥组键（任意文本，NULL/空=不互斥）。同 exclusion_group 的规则按 id 升序逐个分配，后者候选已
   剔除前者占用房 → 同组不同房且各自都铺到别房（配置需保证组内各规则候选并集房数 ≥ Σcount）。';
COMMENT ON COLUMN placement_rules.enabled IS
  '软开关：仅 enabled=true 行参与分配（initBrRoomLayer 查询 .eq(''enabled'', true)；分配端再过滤兜底）。';
COMMENT ON COLUMN placement_rules.updated_at IS
  'Phase 36 — 任何行 UPDATE 经触发器 placement_rules_set_updated_at 自动推到 now()
   （编辑器 / 手工 SQL / admin 一律生效）。';

-- ── CHECK 约束（全部命名，便于幂等 DROP/重建；pg_constraint 检测后 ADD）──────────────
DO $$
BEGIN
  -- entry_kind 与引用列 XOR：item 仅 item_name；equipment_tier 仅 tier_id。
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='placement_rules_kind_xor' AND conrelid='placement_rules'::regclass) THEN
    ALTER TABLE placement_rules ADD CONSTRAINT placement_rules_kind_xor CHECK (
      (entry_kind = 'item'           AND item_name IS NOT NULL AND tier_id IS NULL)
      OR
      (entry_kind = 'equipment_tier' AND tier_id  IS NOT NULL AND item_name IS NULL)
    );
  END IF;

  -- 全图件数区间合法：下界非负且 min<=max。
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='placement_rules_count_range' AND conrelid='placement_rules'::regclass) THEN
    ALTER TABLE placement_rules ADD CONSTRAINT placement_rules_count_range CHECK (
      count_min >= 0 AND count_min <= count_max
    );
  END IF;

  -- 单房上限至少 1。
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='placement_rules_max_per_room_pos' AND conrelid='placement_rules'::regclass) THEN
    ALTER TABLE placement_rules ADD CONSTRAINT placement_rules_max_per_room_pos CHECK (
      max_per_room >= 1
    );
  END IF;

  -- 显形 phase 非负。
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='placement_rules_phase_nonneg' AND conrelid='placement_rules'::regclass) THEN
    ALTER TABLE placement_rules ADD CONSTRAINT placement_rules_phase_nonneg CHECK (
      spawn_phase_min >= 0
    );
  END IF;
END $$;

-- ── updated_at 触发器（独立函数名，避免与 phase-33 br_rooms / phase-34 room_items 触发器耦合）──
--   CREATE OR REPLACE ⇒ 幂等；仅 BEFORE UPDATE（INSERT 走列 DEFAULT now()）。
CREATE OR REPLACE FUNCTION placement_rules_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION placement_rules_set_updated_at() IS
  'Phase 36 — placement_rules BEFORE UPDATE 触发器函数：每次行更新把 updated_at 推到 now()
   （对编辑器 / 手工 SQL / admin 一律生效）。沿用 phase-33/34 范式，独立函数名避免耦合。';

DROP TRIGGER IF EXISTS placement_rules_set_updated_at ON placement_rules;
CREATE TRIGGER placement_rules_set_updated_at
  BEFORE UPDATE ON placement_rules
  FOR EACH ROW
  EXECUTE FUNCTION placement_rules_set_updated_at();

-- ────────────────────────────────────────────────────────────
-- §1b placement_rule_rooms —— 规则↔候选房（带 weight）多对多桥接
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_rule_rooms (
  id          bigint  GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  -- 所属规则；删规则连带清其全部候选行。
  rule_id     bigint  NOT NULL REFERENCES placement_rules(id) ON DELETE CASCADE,
  -- 候选物理房 = br_rooms.room_id 的*值*（软引用，故意不建 FK —— 见文件头决策，解耦房增删）。
  br_room_id  integer NOT NULL,
  -- 加权无放回抽样权重（越大越易被该规则选中）。default 1。
  weight      real    NOT NULL DEFAULT 1
);

COMMENT ON TABLE placement_rule_rooms IS
  'Phase 36 — 投放规则↔候选房（带 weight）多对多桥接。每行=「rule_id 这条规则可把件投到 br_room_id
   这间房，权重 weight」。allocateRoomInventory 按 rule_id 分组候选、过滤本局房集、按 br_room_id 升序
   后用 weightedSampleNoReplace 加权无放回抽 count 个不同房。br_room_id 为软引用（不建 FK，解耦房
   增删）：分配只对本局实际房集生效，孤儿候选忽略。';

COMMENT ON COLUMN placement_rule_rooms.rule_id IS
  '所属 placement_rules.id；ON DELETE CASCADE：删规则连带清其全部候选行（编辑器删规则只删主表）。';
COMMENT ON COLUMN placement_rule_rooms.br_room_id IS
  '候选物理房 = br_rooms.room_id 的值。**软引用，故意无 FK**（沿用 phase-34）：房间编辑器需增删房，
   建 FK 会 CASCADE 误删候选或 RESTRICT 阻塞删房。allocateRoomInventory 只对本局 roomIds 内的
   br_room_id 生效，房集外（孤儿）候选自然忽略，不报错。';
COMMENT ON COLUMN placement_rule_rooms.weight IS
  '加权无放回抽样权重（real>0，越大越易被选中）。default 1。消费端 weightedSampleNoReplace 据此倾斜。';

-- ── CHECK + UNIQUE 约束（命名，pg_constraint 检测后 ADD ⇒ 幂等）─────────────────────
DO $$
BEGIN
  -- 权重必为正（weightedSampleNoReplace 的剩余池总权重>0 前提；editor 存盘仅 insert weight>0 行）。
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='placement_rule_rooms_weight_pos' AND conrelid='placement_rule_rooms'::regclass) THEN
    ALTER TABLE placement_rule_rooms ADD CONSTRAINT placement_rule_rooms_weight_pos CHECK (
      weight > 0
    );
  END IF;

  -- 同一规则对同一候选房只允许一行（一房一权重）。编辑器候选同步可安全 delete-by-rule → 批量 insert。
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='placement_rule_rooms_rule_room_key' AND conrelid='placement_rule_rooms'::regclass) THEN
    ALTER TABLE placement_rule_rooms ADD CONSTRAINT placement_rule_rooms_rule_room_key UNIQUE (rule_id, br_room_id);
  END IF;
END $$;

-- ── 索引：分配按 rule_id 分组候选（热点）──────────────────────────────────────────
--   注：rule_room_key UNIQUE(rule_id, br_room_id) 已隐式建 (rule_id, br_room_id) 复合索引，
--   单列 (rule_id) 前缀查询可借用之；此处显式建单列索引以匹配契约 §1b INDEX 要求、语义清晰。
CREATE INDEX IF NOT EXISTS placement_rule_rooms_by_rule ON placement_rule_rooms(rule_id);

-- ────────────────────────────────────────────────────────────
-- §1c room_items（Phase 34）—— 保留不 DROP，仅打 DEPRECATED 标记（红线④⑧）
--   红线禁删现有表。本表 0 行，运行期不再读；保留以备回退 / 历史追溯。
--   item_pool.bundle_count（Phase 34）保留不碰；equipment_tiers 只读不改。
-- ────────────────────────────────────────────────────────────
COMMENT ON TABLE room_items IS
  'DEPRECATED Phase 36 — 被 placement_rules（道具中心全图分布）取代；每房独立概率模型已退役。
   保留空表/不 DROP（红线禁删现有表），运行期不再读。';

COMMIT;
