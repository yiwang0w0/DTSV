-- ============================================================
-- Phase 49 — 道具合成配方表(item_recipes + item_recipe_ingredients)·内容引擎首个可写内容类型
-- ============================================================
-- 来源 docs/plan/01-admin-content-engine.md §2.3。道具消耗品合成(dts itemmix 意图:A+B+…→C)，
--   与已存在的「装备升阶链」(tier_recipes/recipe_ingredients) 区分：这是更轻的横向配方表。
--
-- ── 红线 / 设计铁律 ──
--   · 引用一律 ID(integer FK→item_pool.id)，无名串匹配(杜绝 dts「改名即断链」)。
--   · 材料 ON DELETE RESTRICT(防悬空)、产出 ON DELETE CASCADE(防死配方)、UNIQUE(recipe_id,item_id)(防重)。
--   · 中性铁律(守 Phase 37)：0 行配方 ⇒ 合成 UI 空 ⇒ 与现状(无道具合成)逐值一致。本迁移只建表、不灌数据、不接运行端。
--   · RLS：本期随大流(RLS 关·前端 isAdmin 闸口·同其它 admin 表)，不单独立 RLS 以免与全库策略割裂(留作收紧 RLS 的开放决策)。
--
-- 幂等：CREATE TABLE/INDEX IF NOT EXISTS + pg_constraint 检测后 ADD + CREATE OR REPLACE + DROP TRIGGER IF EXISTS，可重复执行。
-- 列类型实测对齐：item_pool.id = integer ⇒ result_item_id / item_id 均 integer。
-- 已于 2026-06-16 经 postgres MCP 应用(本文件为记录)。
-- ============================================================

BEGIN;

-- §1 配方主表：N 个输入材料 → 1 个输出道具(均 ID 引用 item_pool)
CREATE TABLE IF NOT EXISTS item_recipes (
  id             bigserial   PRIMARY KEY,
  name           text        NOT NULL,                                   -- 管理员可读配方名(不进运行逻辑·运行只认 ID)
  result_item_id integer     NOT NULL REFERENCES item_pool(id) ON DELETE CASCADE,
  result_qty     integer     NOT NULL DEFAULT 1,                          -- 一次合成产出几个
  success_rate   real        NOT NULL DEFAULT 1.0,                        -- [0,1]
  fail_behavior  text        NOT NULL DEFAULT 'lose_materials',           -- 'lose_materials'|'keep_materials'
  req_level      integer     NULL,                                        -- 等级门槛(空=无门槛·运行端回落不限制)
  description    text        NULL,                                        -- 合成叙事
  enabled        boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- §2 材料桥接(同形于 recipe_ingredients·只认 item_id·无 name 回落)
CREATE TABLE IF NOT EXISTS item_recipe_ingredients (
  id          bigserial PRIMARY KEY,
  recipe_id   bigint    NOT NULL REFERENCES item_recipes(id) ON DELETE CASCADE,
  item_id     integer   NOT NULL REFERENCES item_pool(id) ON DELETE RESTRICT,  -- 删被引用材料 → 阻塞(防断链)
  quantity    integer   NOT NULL DEFAULT 1,
  is_consumed boolean   NOT NULL DEFAULT true                              -- false=催化剂(检查但不扣)
);

-- §3 命名 CHECK(pg_constraint 检测后 ADD ⇒ 幂等)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='item_recipes_success_rate_range') THEN
    ALTER TABLE item_recipes ADD CONSTRAINT item_recipes_success_rate_range
      CHECK (success_rate >= 0 AND success_rate <= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='item_recipes_result_qty_pos') THEN
    ALTER TABLE item_recipes ADD CONSTRAINT item_recipes_result_qty_pos CHECK (result_qty >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='item_recipes_fail_behavior_enum') THEN
    ALTER TABLE item_recipes ADD CONSTRAINT item_recipes_fail_behavior_enum
      CHECK (fail_behavior IN ('lose_materials','keep_materials'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='item_recipe_ing_qty_pos') THEN
    ALTER TABLE item_recipe_ingredients ADD CONSTRAINT item_recipe_ing_qty_pos CHECK (quantity >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='item_recipe_ing_recipe_item_key') THEN
    ALTER TABLE item_recipe_ingredients ADD CONSTRAINT item_recipe_ing_recipe_item_key
      UNIQUE (recipe_id, item_id);
  END IF;
END $$;

-- §4 updated_at 触发器(独立函数名·沿用 phase-36 范式)
CREATE OR REPLACE FUNCTION item_recipes_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS item_recipes_set_updated_at ON item_recipes;
CREATE TRIGGER item_recipes_set_updated_at BEFORE UPDATE ON item_recipes
  FOR EACH ROW EXECUTE FUNCTION item_recipes_set_updated_at();

-- §5 索引：按产出 / 按配方 / 按材料反查
CREATE INDEX IF NOT EXISTS item_recipes_by_result    ON item_recipes(result_item_id);
CREATE INDEX IF NOT EXISTS item_recipe_ing_by_recipe ON item_recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS item_recipe_ing_by_item   ON item_recipe_ingredients(item_id);

COMMIT;

-- 验证(部署后)：期望两表存在·0 行(中性)。
-- SELECT to_regclass('public.item_recipes'), to_regclass('public.item_recipe_ingredients');
-- SELECT (SELECT count(*) FROM item_recipes) AS recipes, (SELECT count(*) FROM item_recipe_ingredients) AS ings;
