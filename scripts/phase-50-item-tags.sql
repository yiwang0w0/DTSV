-- ============================================================
-- Phase 50 — 道具系列标签(item_tags 受管词表 + item_pool.tag_ids 多标签)
-- ============================================================
-- 需求：道具数量变多后，按「系列标签」筛出某一类道具；一个道具可有多个标签。
--
-- 设计：受管标签词表(item_tags) + item_pool.tag_ids integer[](软引用 item_tags.id·多标签)。
--   · 受管词表(而非自由 text[])：保证筛选一致性(无错别字碎片)，标签可带颜色/排序/启用。
--   · ID 软引用(沿用 chamber_template_ids / on_use_buff_ids 的 int[] 范式)：标签改名不断链。
--   · 内容引擎以 ref-multi 解析 tag_ids → item_tags.name 展示(改名无碍)。
--
-- ── 中性铁律(守 Phase 37)──
--   item_pool 现有行 tag_ids 默认 '{}'(无标签)、item_tags 空 ⇒ 筛选/展示与现状逐值一致。纯加表/加列。
--
-- 幂等：CREATE TABLE/INDEX IF NOT EXISTS + pg_constraint 守卫 + ADD COLUMN IF NOT EXISTS，可重复执行。
-- 类型对齐：item_pool.id=integer ⇒ item_tags.id 用 serial(integer)，tag_ids integer[] 同 on_use_buff_ids 范式。
-- 已于 2026-06-16 经 postgres MCP 应用(本文件为记录)。
-- ============================================================

BEGIN;

-- §1 受管标签词表
CREATE TABLE IF NOT EXISTS item_tags (
  id         serial      PRIMARY KEY,
  name       text        NOT NULL,
  color      text        NOT NULL DEFAULT '#58a6ff',   -- 标签配色(hex·后台 chip 展示)
  sort_order integer     NOT NULL DEFAULT 0,            -- 排序(小先)
  enabled    boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 标签名唯一(防重复词)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='item_tags_name_key') THEN
    ALTER TABLE item_tags ADD CONSTRAINT item_tags_name_key UNIQUE (name);
  END IF;
END $$;

-- §2 道具多标签(integer[] 软引用 item_tags.id)
ALTER TABLE item_pool ADD COLUMN IF NOT EXISTS tag_ids integer[] NOT NULL DEFAULT '{}';

-- §3 GIN 索引：加速「tag_ids 包含某标签」的筛选(item_pool WHERE tag_ids @> ARRAY[<id>])
CREATE INDEX IF NOT EXISTS item_pool_tag_ids_gin ON item_pool USING GIN (tag_ids);

COMMENT ON COLUMN item_pool.tag_ids IS
  '道具系列标签(integer[] 软引用 item_tags.id·多标签)。空 {}=无标签。筛选用 tag_ids @> ARRAY[id]。';

COMMIT;

-- 验证(部署后)：item_tags 存在·0 行；item_pool.tag_ids 列存在·现有行全 '{}'(中性)。
-- SELECT to_regclass('public.item_tags'), (SELECT count(*) FROM item_tags) AS tags;
-- SELECT count(*) FILTER (WHERE tag_ids <> '{}') AS tagged FROM item_pool;  -- 期望 0
