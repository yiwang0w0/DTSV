-- ============================================================
-- Phase 19.2 — item_pool / npc_pool / fragment_pool 的 maps 迁移为
--              chamber_template_ids INTEGER[]
-- ============================================================
-- 字段类型实测（v2 修正）：
--   item_pool.maps     = jsonb            （存储 JSON 数组：[0,1,2]）
--   npc_pool.maps      = jsonb            （同上）
--   fragment_pool.maps = INTEGER[] / _int4（PostgreSQL 原生数组）
--
-- 因此 jsonb 表用 jsonb_array_elements_text；int[] 表用 unnest。
--
-- 映射规则（map_id → region_label）：
--   0  外环维护廊 | 1 锚点走廊 | 2 伊甸港残墟 | 3 剪切界面缓冲带 | 4 Ω-段核心接口
--   10 → 外环维护廊（紧急投放口）| 11 → 伊甸港残墟（应急通道）
--
-- 迁移策略：保留 maps 字段重命名为 _legacy_maps 作备份
-- ============================================================

-- ── 1. 三表加 chamber_template_ids 列 ──
ALTER TABLE item_pool
  ADD COLUMN IF NOT EXISTS chamber_template_ids INTEGER[] NOT NULL DEFAULT '{}';
ALTER TABLE npc_pool
  ADD COLUMN IF NOT EXISTS chamber_template_ids INTEGER[] NOT NULL DEFAULT '{}';
ALTER TABLE fragment_pool
  ADD COLUMN IF NOT EXISTS chamber_template_ids INTEGER[] NOT NULL DEFAULT '{}';

-- ── 2. 迁移 item_pool（maps = jsonb）──
UPDATE item_pool t SET chamber_template_ids = COALESCE((
  SELECT array_agg(DISTINCT ct.id)
  FROM jsonb_array_elements_text(t.maps) AS j(old_map)
  JOIN chamber_templates ct ON ct.region_label = CASE j.old_map::int
    WHEN 0  THEN '外环维护廊'
    WHEN 1  THEN '锚点走廊'
    WHEN 2  THEN '伊甸港残墟'
    WHEN 3  THEN '剪切界面缓冲带'
    WHEN 4  THEN 'Ω-段核心接口'
    WHEN 10 THEN '外环维护廊'
    WHEN 11 THEN '伊甸港残墟'
    ELSE NULL
  END
), '{}')
WHERE t.maps IS NOT NULL AND jsonb_array_length(t.maps) > 0;

-- ── 3. 迁移 npc_pool（maps = jsonb）──
UPDATE npc_pool t SET chamber_template_ids = COALESCE((
  SELECT array_agg(DISTINCT ct.id)
  FROM jsonb_array_elements_text(t.maps) AS j(old_map)
  JOIN chamber_templates ct ON ct.region_label = CASE j.old_map::int
    WHEN 0  THEN '外环维护廊'
    WHEN 1  THEN '锚点走廊'
    WHEN 2  THEN '伊甸港残墟'
    WHEN 3  THEN '剪切界面缓冲带'
    WHEN 4  THEN 'Ω-段核心接口'
    WHEN 10 THEN '外环维护廊'
    WHEN 11 THEN '伊甸港残墟'
    ELSE NULL
  END
), '{}')
WHERE t.maps IS NOT NULL AND jsonb_array_length(t.maps) > 0;

-- ── 4. 迁移 fragment_pool（maps = INTEGER[]）──
UPDATE fragment_pool t SET chamber_template_ids = COALESCE((
  SELECT array_agg(DISTINCT ct.id)
  FROM unnest(t.maps) AS m(old_map_id)
  JOIN chamber_templates ct ON ct.region_label = CASE m.old_map_id
    WHEN 0  THEN '外环维护廊'
    WHEN 1  THEN '锚点走廊'
    WHEN 2  THEN '伊甸港残墟'
    WHEN 3  THEN '剪切界面缓冲带'
    WHEN 4  THEN 'Ω-段核心接口'
    WHEN 10 THEN '外环维护廊'
    WHEN 11 THEN '伊甸港残墟'
    ELSE NULL
  END
), '{}')
WHERE t.maps IS NOT NULL AND array_length(t.maps, 1) > 0;

-- ── 5. 重命名旧字段为 _legacy_maps（保留备份） ──
ALTER TABLE item_pool     RENAME COLUMN maps TO _legacy_maps;
ALTER TABLE npc_pool      RENAME COLUMN maps TO _legacy_maps;
ALTER TABLE fragment_pool RENAME COLUMN maps TO _legacy_maps;

-- ── 6. 验证查询 ──
-- SELECT name, _legacy_maps, chamber_template_ids FROM item_pool WHERE jsonb_array_length(_legacy_maps) > 0 LIMIT 3;
-- SELECT count(*), avg(array_length(chamber_template_ids, 1)) AS avg_chamber_count FROM item_pool;
-- SELECT count(*), avg(array_length(chamber_template_ids, 1)) FROM npc_pool;
-- SELECT count(*), avg(array_length(chamber_template_ids, 1)) FROM fragment_pool;
