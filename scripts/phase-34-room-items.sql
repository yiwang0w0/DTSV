-- ============================================================
-- Phase 34 — 房间物品投放 room_items + item_pool.bundle_count（广义化 BUNDLE）
-- ============================================================
-- 来源: 【SQL】契约 — Phase 2「房间物品投放 + 库存状态（room_items / roomInv）」。
--
-- 用途 / WHY:
--   给 BR 物理房（br_rooms）一张 *authored 投放* 表：策划/admin 按房声明「这间房应当
--   出现哪些 item / equipment_tier、多少件、多大概率、最早第几 phase 显形」。开局时
--   initBrRoomLayer 用本表 + per-raid seed 确定性铺出一份紧凑库存快照
--   gamevars.br.roomInv，搜索命中 loose-item 分支时 authored 优先发放、取走即标 taken
--   持久化（一次性、不再生）。取不到则回落现有程序化 amount 权重抽取（经济基线零破坏）。
--
--   两件事在本文件落地（SQL 实现者只动本文件 + DB schema）：
--     §1 room_items 表（投放声明）+ CHECK + 索引 + updated_at 触发器；前置 item_pool name UNIQUE。
--     §2 item_pool.bundle_count（广义化恢复剂「一份=6 个条目」hack）+ 恢复剂数据迁移。
--   运行时算法（placeRoomInventory/takeFromRoom）与 gameActions 接线由 server 实现者另写
--   （src/lib/server/br/roomItems.js 等），唯一契约接口 = 本文件列名/类型。
--
-- ── 红线对齐（与契约 §红线核验 一一对应）──────────────────────────────────────────
--   ① procedural 经济基线不破：本表只「声明哪儿有货」。运行时 authored-first 命中仍在
--      现有 loose-item 门控内（itemChance / 污染调权 / 体力门 / roll 门全部不旁路）；
--      roomInv 取不到（无投放 / 未显形 / 已取完 / 装备 INSERT 失败）一律回落现有 amount
--      权重 + lootByDepth 程序化抽取。本文件**不含**任何运行时判定，纯 schema。
--   ② 种子 PRNG 确定性：铺货随机由 server 端 forbidden.js 的 xmur3/mulberry32 按 per-raid
--      seed 派生（同 seed+roomIds+rows → 同 roomInv，所有实例一致），禁非确定随机。本表
--      只提供 fixed_count / random_min / random_max / random_chance / spawn_phase_min 参数，
--      **不引入任何随机**（确定性由消费端保证）。
--   ③ 一次性库存 + 越晚越肥：取走标 taken 持久化在 gamevars.br.roomInv（不再生）；
--      spawn_phase_min 即「越晚越肥」门控 —— item 仅在 effPhase>=spawn_phase_min 显形。
--      本表只存 spawn_phase_min（int≥0，0=开局可见）。
--   ④ gamevars.br.roomInv 紧凑（≤~3KB）：仅「有投放生效」房建 entry + 数组化去重 ref 索引，
--      由消费端 ROOM_INV_CAP=24/房 硬封顶。本表行数无限制（admin authored），但消费端只对
--      *本局实际房集* 内的 br_room_id 铺货 → 孤儿/超量被自然忽略 / 截断。
--   ⑤ 装备件取货走现有 createLootSideEffect 的 equipment_instances INSERT（不另造），
--      耐久 = tier.durability_max。本表 entry_kind='equipment_tier' 行的 tier_id 即喂给该路径。
--   ⑥ 残片可发现性 / 六纪元 lore / 缩圈致死（Phase1 快照）完全不碰：本文件只加 room_items
--      表 + item_pool 一列 + 前置 item_pool name UNIQUE，零触 br_rooms / closePhases /
--      roomTemplates / 致死判定 / fragment 表。
--   ⑦ 幂等：全文 BEGIN/COMMIT；CREATE TABLE IF NOT EXISTS；约束用 pg_constraint 检测后
--      ADD（不存在才加）；ADD COLUMN IF NOT EXISTS；CREATE OR REPLACE FUNCTION；
--      DROP TRIGGER IF EXISTS / CREATE TRIGGER；CREATE INDEX IF NOT EXISTS。可安全重复执行。
--   ⑧ 不部署：本文件**只写不跑**，由主代理审后用 postgres MCP 执行（参考 phase-33 模式）。
--
-- ── 关键设计决策（务必读注释，影响 FK 行为）──────────────────────────────────────
--   • item_pool.name 当前**无 UNIQUE 约束**（仅 PK=id）但**零重复**。PG 的 FK 目标列必须
--     有 UNIQUE/PK，故 room_items.item_name REFERENCES item_pool(name) **必须先**建
--     item_pool_name_key UNIQUE(name)（见 §0 前置）。否则报
--     「there is no unique constraint matching given keys」。
--     item_name 用 ON UPDATE CASCADE：admin 改道具名时投放表自动跟随；ON DELETE CASCADE：
--     删道具连带清掉引用它的投放行（避免悬空 item_name）。
--   • br_room_id **故意不建 FK** 到 br_rooms(room_id)：设计 §4 房间编辑器要支持增删房达成
--     30-40 房。若建 FK，删房会 ON DELETE CASCADE 静默清掉该房 authored 投放（危险）或
--     RESTRICT 阻塞删房。改为**软引用** —— 铺货时 placeRoomInventory 只对*本局实际房集*
--     (roomIds) 内的 br_room_id 生效，孤儿行自然忽略不报错。⇒ 投放表与房增删解耦。
--   • tier_id REFERENCES equipment_tiers(id)（已是 PK，可直接建）；ON DELETE CASCADE：
--     删 tier 连带清引用它的投放行。
--
-- ⚠ 事务: 纯 DDL + 一条数据迁移 UPDATE，全文 BEGIN/COMMIT 包裹原子提交。
--
-- ── 部署后验证（用 pg_execute_query 跑）─────────────────────────────────────────
--   -- a) item_pool name UNIQUE 已建（FK 前置）:
--   SELECT conname FROM pg_constraint
--    WHERE conrelid='item_pool'::regclass AND conname='item_pool_name_key';   -- 期望 1 行
--   -- b) room_items 表结构（列/类型/默认/非空）:
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns WHERE table_name='room_items' ORDER BY ordinal_position;
--   -- c) room_items 全部 CHECK / FK 约束在位:
--   SELECT conname, contype, pg_get_constraintdef(oid) AS def
--     FROM pg_constraint WHERE conrelid='room_items'::regclass ORDER BY contype, conname;
--   --   期望: kind_xor / counts_nonneg / chance_unit / phase_nonneg(c) + item_name/tier_id 两个 FK(f) + pkey(p)
--   -- d) updated_at 触发器存在且 BEFORE UPDATE:
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid='room_items'::regclass AND NOT tgisinternal;   -- 期望含 room_items_set_updated_at
--   -- e) 索引在位:
--   SELECT indexname FROM pg_indexes
--    WHERE tablename='room_items';   -- 期望含 room_items_by_room（部分索引 WHERE enabled）
--   -- f) bundle_count 列 + CHECK + 恢复剂迁移:
--   SELECT name, bundle_count FROM item_pool WHERE name='机能恢复剂';        -- 期望 bundle_count=6
--   SELECT min(bundle_count) AS min_bc, count(*) FILTER (WHERE bundle_count<>1) AS non_default
--     FROM item_pool;   -- 期望 min_bc>=1；non_default=1（仅恢复剂）
--   -- g) authored 投放行（初期应为 0；admin 后续在编辑器写入）:
--   SELECT count(*) FROM room_items;   -- 期望 0（本 migration 不灌投放数据）
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- §0 前置：item_pool.name UNIQUE（room_items.item_name FK 目标，必须先建）
--   当前 name 无任何 UNIQUE/PK 但零重复（已核 DB），可安全加。
--   幂等：pg_constraint 检测，不存在才 ADD。
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'item_pool_name_key'
      AND conrelid = 'item_pool'::regclass
  ) THEN
    ALTER TABLE item_pool
      ADD CONSTRAINT item_pool_name_key UNIQUE (name);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- §1 room_items —— BR 房 authored 投放声明表
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS room_items (
  id              bigint      GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  -- 投放到哪个物理房：br_rooms.room_id 的*值*（软引用，故意不建 FK —— 见文件头决策）。
  br_room_id      integer     NOT NULL,
  -- 'item'（道具）| 'equipment_tier'（装备阶）。XOR 约束保证只填对应一侧引用。
  entry_kind      text        NOT NULL DEFAULT 'item',
  -- item 件：引用 item_pool.name（改名跟随 / 删道具连带清行）。
  item_name       text        NULL  REFERENCES item_pool(name) ON UPDATE CASCADE ON DELETE CASCADE,
  -- equipment_tier 件：引用 equipment_tiers.id（删 tier 连带清行）。
  tier_id         integer     NULL  REFERENCES equipment_tiers(id) ON DELETE CASCADE,
  -- 生效后必出件数（保底）。
  fixed_count     integer     NOT NULL DEFAULT 0,
  -- 生效后额外随机件数区间 U[random_min, random_max]（消费端用 seed PRNG 抽，本表只存区间）。
  random_min      integer     NOT NULL DEFAULT 0,
  random_max      integer     NOT NULL DEFAULT 0,
  -- 整条「是否生效」概率（消费端第一抽：rng()>=random_chance 则整条跳过）。1.0=必然生效。
  random_chance   real        NOT NULL DEFAULT 1.0,
  -- 越晚越肥门控：effPhase>=此值才显形（0=开局可见）。消费端 = roomInv 件的 revealPhase。
  spawn_phase_min integer     NOT NULL DEFAULT 0,
  -- 软开关：仅 enabled 行参与铺货（铺货端二次防御 + 部分索引 WHERE enabled）。
  enabled         boolean     NOT NULL DEFAULT true,
  notes           text        NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- BEFORE UPDATE 触发器自动刷 now()（沿用 phase-33 br_rooms_set_updated_at 范式）。
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE room_items IS
  'Phase 34 — BR 房 authored 投放声明表。每行=「br_room_id 这间房应出现 entry_kind 件，
   生效概率 random_chance，生效后 fixed_count+U[random_min,random_max] 件，
   最早 spawn_phase_min 显形」。开局 placeRoomInventory(seed,roomIds,rows) 确定性铺成
   gamevars.br.roomInv 快照。br_room_id 为软引用（不建 FK，解耦房增删）：铺货只对本局实际
   房集生效，孤儿行忽略。authored 命中走 loose-item 门控内 authored-first 发放；取不到回落
   现有程序化 amount 抽取（经济基线零破坏）。';

COMMENT ON COLUMN room_items.br_room_id IS
  '目标物理房 = br_rooms.room_id 的值。**软引用，故意无 FK**：房间编辑器需增删房达成 30-40，
   建 FK 会 CASCADE 误删投放或 RESTRICT 阻塞删房。铺货端 placeRoomInventory 只对本局 roomIds
   内的 br_room_id 生效，房集外（孤儿）行自然忽略，不报错。';
COMMENT ON COLUMN room_items.entry_kind IS
  '''item'' | ''equipment_tier''。kind_xor 约束强制：item→item_name 非空且 tier_id 空；
   equipment_tier→tier_id 非空且 item_name 空。';
COMMENT ON COLUMN room_items.spawn_phase_min IS
  '越晚越肥门控（int≥0）：搜索时 effPhase=min(maxPhase, realPhase+depth) >= 本值才可取；
   0=开局即可见。即 roomInv 件三元组的 revealPhase。';
COMMENT ON COLUMN room_items.random_chance IS
  '整条生效概率 [0,1]（消费端第一抽 rng()>=此值则整条跳过，1.0=必然生效）。';
COMMENT ON COLUMN room_items.updated_at IS
  'Phase 34 — 任何行 UPDATE 经触发器 room_items_set_updated_at 自动推到 now()（编辑器/手工 SQL 一律生效）。';

-- ── CHECK 约束（全部命名，便于幂等 DROP/重建；pg_constraint 检测后 ADD）──────────────
DO $$
BEGIN
  -- entry_kind 与引用列 XOR：item 仅 item_name；equipment_tier 仅 tier_id。
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='room_items_kind_xor' AND conrelid='room_items'::regclass) THEN
    ALTER TABLE room_items ADD CONSTRAINT room_items_kind_xor CHECK (
      (entry_kind = 'item'           AND item_name IS NOT NULL AND tier_id IS NULL)
      OR
      (entry_kind = 'equipment_tier' AND tier_id  IS NOT NULL AND item_name IS NULL)
    );
  END IF;

  -- 件数非负 + 区间合法（min<=max）。
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='room_items_counts_nonneg' AND conrelid='room_items'::regclass) THEN
    ALTER TABLE room_items ADD CONSTRAINT room_items_counts_nonneg CHECK (
      fixed_count >= 0 AND random_min >= 0 AND random_max >= 0 AND random_min <= random_max
    );
  END IF;

  -- 概率单位区间 [0,1]。
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='room_items_chance_unit' AND conrelid='room_items'::regclass) THEN
    ALTER TABLE room_items ADD CONSTRAINT room_items_chance_unit CHECK (
      random_chance >= 0 AND random_chance <= 1
    );
  END IF;

  -- 显形 phase 非负。
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='room_items_phase_nonneg' AND conrelid='room_items'::regclass) THEN
    ALTER TABLE room_items ADD CONSTRAINT room_items_phase_nonneg CHECK (
      spawn_phase_min >= 0
    );
  END IF;
END $$;

-- ── 索引：铺货按房查 + 仅取 enabled（部分索引）──────────────────────────────────
CREATE INDEX IF NOT EXISTS room_items_by_room ON room_items(br_room_id) WHERE enabled;
-- 可选（本期非必需）：铺货是全房集一次性 IN(...) 拉取，单房 phase 维度查询暂无热点。
-- 若后续编辑器需「按 phase 预览」可启用：
-- CREATE INDEX IF NOT EXISTS room_items_by_room_phase ON room_items(br_room_id, spawn_phase_min) WHERE enabled;

-- ── updated_at 触发器（独立函数名，避免与 phase-33 br_rooms 触发器耦合）─────────────
--   CREATE OR REPLACE ⇒ 幂等；仅 BEFORE UPDATE（INSERT 走列 DEFAULT now()）。
CREATE OR REPLACE FUNCTION room_items_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION room_items_set_updated_at() IS
  'Phase 34 — room_items BEFORE UPDATE 触发器函数：每次行更新把 updated_at 推到 now()
   （对编辑器 / 手工 SQL / admin 一律生效）。沿用 phase-33 范式，独立函数名避免耦合。';

DROP TRIGGER IF EXISTS room_items_set_updated_at ON room_items;
CREATE TRIGGER room_items_set_updated_at
  BEFORE UPDATE ON room_items
  FOR EACH ROW
  EXECUTE FUNCTION room_items_set_updated_at();

-- ────────────────────────────────────────────────────────────
-- §2 item_pool.bundle_count —— 广义化「一份=N 个条目」(原恢复剂 BUNDLE hack)
--   语义: 搜到这件 item，一次性 push 进 inventory 的同名条目数（= 可用次数）。
--   default 1 → 现有所有其它道具行为不变；server 端 entriesForItem 读本列做分发
--   （DB bundle_count 为运行时权威，constants 的 RECOVERY_ITEM.BUNDLE_COUNT 退为文档 single-source）。
-- ────────────────────────────────────────────────────────────
ALTER TABLE item_pool
  ADD COLUMN IF NOT EXISTS bundle_count integer NOT NULL DEFAULT 1;

-- bundle_count >= 1（幂等包裹：pg_constraint 检测后 ADD）。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'item_pool_bundle_count_pos'
      AND conrelid = 'item_pool'::regclass
  ) THEN
    ALTER TABLE item_pool
      ADD CONSTRAINT item_pool_bundle_count_pos CHECK (bundle_count >= 1);
  END IF;
END $$;

COMMENT ON COLUMN item_pool.bundle_count IS
  'Phase 34 — 搜到此 item 一次性 push 进 inventory 的同名条目数（=可用次数）。default 1。
   广义化原恢复剂硬编码 BUNDLE_COUNT；server entriesForItem 读本列（运行时权威）。';

-- 数据迁移：恢复剂一份=6 个条目（原 STAMINA_CONFIG.RECOVERY_ITEM.BUNDLE_COUNT 硬编码值）。
--   幂等：再次执行只是把已是 6 的值再设为 6（无副作用）。按 name 命中（id=27，已核 DB）。
UPDATE item_pool SET bundle_count = 6 WHERE name = '机能恢复剂';

COMMIT;
