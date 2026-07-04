-- ============================================================
-- Phase 51 — 内容表 RLS 收紧 P1：优先内容表 开 RLS + 公开读 + 写仅 service_role
-- ============================================================
-- 轨道：🔒 安全性（docs/plan/07-parallel-tracks.md §2 · SQL 号段 51-55）
-- 来源范式：docs/plan/03-crafting-synthesis.md §2.2（tier_recipes/recipe_ingredients 的 RLS 修复），
--           本迁移把同一范式推广到本批「优先内容表」。
--
-- ── 背景（2026-07-04 postgres MCP 实测审计）──
--   全库 RLS 混合态。本批 7 张表当前对 **anon key / 任意登录用户可写**：
--     item_recipes / item_recipe_ingredients / item_tags  … rls_enabled=false, 0 policy → anon 直接可写
--     tier_recipes / recipe_ingredients / game_rules       … rls_enabled=false, 有 inert policy → anon 直接可写
--     passive_skills                                       … rls_enabled=true, 但 admin_write_passive =
--                                                              auth.role()='authenticated' → 任意登录用户可写
--   公钥 anon key 内嵌在前端 JS 里（可轻易提取），等于「任何人可改配方/标签/被动/战斗规则」。已知 4/10 漏洞的一部分。
--
-- ── 目标安全模型（同 player_death_log：service_role 写、其它角色只读）──
--   开 RLS；读公开（USING true，玩家/编辑器仍能查）；写仅 service_role。
--   与 RLS 收紧 **同批必须上线**的联动：现编辑器用浏览器 anon client 直写这些表，收紧后会被挡 →
--   写路径改走服务端 /api/admin/*（service_role + isAdmin 闸口）。详见文件尾「联动清单」。
--
-- ── 中性铁律（守 Phase 37）──
--   本迁移只改「谁能写」，不改任何行数据、不改任何列、不改读结果 → 对局数值/行为逐值不变。
--   服务端 service_role 绕过 RLS，既有服务端读写（gameActions/equipmentEngine/gameEngine）零影响。
--
-- 幂等：ENABLE RLS 可重复；DROP POLICY IF EXISTS（含旧名 + 新名）后 CREATE，可重复执行。
--
-- ✅ 状态：**已应用**（2026-07-05 经 postgres MCP 执行）。写路径服务端化(feat(51)·4 条 /api/admin 路由)
--          已先行部署上线，故无「能读不能写」窗口。实测验证：7 表 rls_enabled=true·各 2 策略；
--          anon 写被拒(new row violates row-level security policy)、anon 读正常、service_role 写正常。
-- ============================================================

BEGIN;

-- ── 标准化策略命名：<table>_public_read（公开只读）/ <table>_service_write（仅 service_role 全权写）──
-- 每张表：①开 RLS ②清掉旧的过宽写策略 + 旧读策略（避免重复/漂移）③重建 公开读 + service 写。

-- 1) item_recipes ──────────────────────────────────────────
ALTER TABLE item_recipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS item_recipes_public_read  ON item_recipes;
DROP POLICY IF EXISTS item_recipes_service_write ON item_recipes;
CREATE POLICY item_recipes_public_read  ON item_recipes FOR SELECT USING (true);
CREATE POLICY item_recipes_service_write ON item_recipes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2) item_recipe_ingredients（item_recipes 的桥接子表 · ItemCraftModal 嵌套读）──
ALTER TABLE item_recipe_ingredients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS item_recipe_ingredients_public_read  ON item_recipe_ingredients;
DROP POLICY IF EXISTS item_recipe_ingredients_service_write ON item_recipe_ingredients;
CREATE POLICY item_recipe_ingredients_public_read  ON item_recipe_ingredients FOR SELECT USING (true);
CREATE POLICY item_recipe_ingredients_service_write ON item_recipe_ingredients FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3) item_tags ─────────────────────────────────────────────
ALTER TABLE item_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS item_tags_public_read  ON item_tags;
DROP POLICY IF EXISTS item_tags_service_write ON item_tags;
CREATE POLICY item_tags_public_read  ON item_tags FOR SELECT USING (true);
CREATE POLICY item_tags_service_write ON item_tags FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4) tier_recipes（清掉 inert 的 admin_write_recipes/read_tier_recipes）──
ALTER TABLE tier_recipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_write_recipes       ON tier_recipes;  -- 旧：auth.role()='authenticated'（过宽）
DROP POLICY IF EXISTS read_tier_recipes         ON tier_recipes;  -- 旧：公开读（并入标准命名）
DROP POLICY IF EXISTS tier_recipes_public_read  ON tier_recipes;
DROP POLICY IF EXISTS tier_recipes_service_write ON tier_recipes;
CREATE POLICY tier_recipes_public_read  ON tier_recipes FOR SELECT USING (true);
CREATE POLICY tier_recipes_service_write ON tier_recipes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5) recipe_ingredients（清掉 inert 的 admin_write_ingredients/read_recipe_ingredients）──
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_write_ingredients        ON recipe_ingredients;  -- 旧：过宽
DROP POLICY IF EXISTS read_recipe_ingredients        ON recipe_ingredients;
DROP POLICY IF EXISTS recipe_ingredients_public_read  ON recipe_ingredients;
DROP POLICY IF EXISTS recipe_ingredients_service_write ON recipe_ingredients;
CREATE POLICY recipe_ingredients_public_read  ON recipe_ingredients FOR SELECT USING (true);
CREATE POLICY recipe_ingredients_service_write ON recipe_ingredients FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6) passive_skills（RLS 已开 · 清掉 4 条旧策略含过宽写 admin_write_passive）──
--    ⚠ 主对话 P4/P6 authoring 直写此表（stage/priority/condition_formula）→ 保存必须改 service_role。
ALTER TABLE passive_skills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_write_passive              ON passive_skills;  -- 旧：ALL auth.role()='authenticated'（过宽）
DROP POLICY IF EXISTS passive_skills_read_authenticated ON passive_skills;
DROP POLICY IF EXISTS passive_skills_read_public        ON passive_skills;
DROP POLICY IF EXISTS read_passive_skills               ON passive_skills;
DROP POLICY IF EXISTS passive_skills_public_read        ON passive_skills;
DROP POLICY IF EXISTS passive_skills_service_write      ON passive_skills;
CREATE POLICY passive_skills_public_read  ON passive_skills FOR SELECT USING (true);
CREATE POLICY passive_skills_service_write ON passive_skills FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7) game_rules ────────────────────────────────────────────
--    ⚠ 超出「命名优先集」一张，但同属 CRITICAL：anon 可改战斗规则。写路径 = RulesRuleRow.jsx:14。
--    若想让 phase-51 严格等于命名集，删掉本块即可（其余 6 表自洽）。
ALTER TABLE game_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_write_game_rules      ON game_rules;  -- 旧：过宽
DROP POLICY IF EXISTS anyone_read_game_rules      ON game_rules;
DROP POLICY IF EXISTS game_rules_public_read      ON game_rules;
DROP POLICY IF EXISTS game_rules_service_write    ON game_rules;
CREATE POLICY game_rules_public_read  ON game_rules FOR SELECT USING (true);
CREATE POLICY game_rules_service_write ON game_rules FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

-- ============================================================
-- 验证（应用后跑）：期望 7 表全部 rls_enabled=true，且每表恰 2 策略（public_read + service_write）。
-- ------------------------------------------------------------
-- SELECT c.relname, c.relrowsecurity,
--        (SELECT count(*) FROM pg_policies p WHERE p.tablename=c.relname AND p.schemaname='public') AS policies
-- FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
-- WHERE n.nspname='public' AND c.relname IN
--   ('item_recipes','item_recipe_ingredients','item_tags','tier_recipes','recipe_ingredients','passive_skills','game_rules')
-- ORDER BY c.relname;
-- 反向验证：以 anon 身份 INSERT 任一表应被拒（new row violates row-level security policy）。
--
-- ============================================================
-- 联动清单（必须同批上线的写路径服务端化 —— 否则编辑器「能读不能写」）
-- ------------------------------------------------------------
--  写站点（当前用浏览器 anon client 直写）                         →  改走服务端
--  1. useContentCrud.js:101/105/111/127/139  item_recipes         →  新建 /api/admin/content（schema 驱动通用写：
--       + item_recipe_ingredients(桥接) + item_tags                   主表 upsert + 桥接 delete-by-parent→批量 insert，
--                                                                     service_role + isAdmin，镜像 hook 现逻辑）
--  2. EquipmentSeriesSection.jsx:237/239/243/256  tier_recipes     →  /api/admin/tier-recipes（save/delete）
--       + recipe_ingredients
--  3. EquipmentPassivesSection.jsx:77/81/89  passive_skills        →  /api/admin/passive-skills（save/delete）
--  4. RulesRuleRow.jsx:14  game_rules(update value)                →  /api/admin/game-rules（update）
--  范式：镜像 src/app/api/endings/route.js（createServerSupabase + getRequestUser + isAdmin 三段闸口）。
--  读路径无需改：公开读策略保留，ItemCraftModal / ContentEngine load / RulesTab / 编辑器下拉 均照常。
-- ============================================================
