-- ============================================================
-- Phase 53 (52b) — 6 内容表写权收紧：DROP 过宽 authenticated 写 + 标准化 公开读 + 写仅 service_role
-- ============================================================
-- 轨道：🔒 安全性（phase-52 广义 RLS 扫描 · 52b）
--
-- ── 背景 ──
--   这 6 表 RLS 已开，但写策略过宽（HIGH：任意登录用户可增删改内容表）：
--     buff_pool / equipment_series / equipment_tiers：admin_write_* = auth.role()='authenticated'
--     item_pool / map_config / npc_pool：*_all = auth.uid() IS NOT NULL
--   且都有 anon 编辑器（除 map_config 仅 AdminPageInner 读，无编辑器）。
--
-- ── 同批联动（已先 ship·零窗口）──
--   编辑器写路径已改走服务端 service_role（feat(52b)）：
--     buff_pool → /api/admin/buff-pool（RulesBuffModal/RulesTab）
--     equipment_series+tiers → /api/admin/equipment（EquipmentSeriesSection）
--     item_pool → /api/admin/item-pool（ItemsTab）；npc_pool → /api/admin/npc-pool（NpcsTab）
--     map_config：无写路径（仅读），本迁移只收紧其写权。
--   先 ship 路由（表未收紧时 service_role 照写）→ 部署验证 → 再跑本迁移，无「能读不能写」窗口。
--
-- ── 中性铁律 ──
--   只改「谁能写」，不改行/列/读结果 → 对局数值逐值不变。service_role 绕过 RLS，服务端读写零影响。
--   读保留公开（玩家端 + 编辑器 anon 查这些表照常）。
--
-- 幂等：ENABLE RLS 可重复；DROP POLICY IF EXISTS（旧名 + 新名）后 CREATE，可重复执行。
--
-- ✅ 状态：**已应用**（2026-07-06 · 编辑器写路由先行部署后经 postgres MCP 执行）。
--    验证：6 表 rls_enabled=true·各 2 策略（public_read + service_write）；anon 写被拒·读正常·service_role 写正常。
-- ============================================================

BEGIN;

-- 1) buff_pool ─────────────────────────────────────────────
ALTER TABLE buff_pool ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_write_buff_pool          ON buff_pool;  -- 旧：ALL authenticated（过宽）
DROP POLICY IF EXISTS anyone_read_buff_pool          ON buff_pool;
DROP POLICY IF EXISTS buff_pool_read_authenticated   ON buff_pool;
DROP POLICY IF EXISTS buff_pool_read_public          ON buff_pool;
DROP POLICY IF EXISTS buff_pool_public_read          ON buff_pool;
DROP POLICY IF EXISTS buff_pool_service_write        ON buff_pool;
CREATE POLICY buff_pool_public_read   ON buff_pool FOR SELECT USING (true);
CREATE POLICY buff_pool_service_write ON buff_pool FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2) equipment_series ──────────────────────────────────────
ALTER TABLE equipment_series ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_write_series                   ON equipment_series;  -- 旧：ALL authenticated
DROP POLICY IF EXISTS equipment_series_read_authenticated  ON equipment_series;
DROP POLICY IF EXISTS equipment_series_read_public         ON equipment_series;
DROP POLICY IF EXISTS read_equipment_series                ON equipment_series;
DROP POLICY IF EXISTS equipment_series_public_read         ON equipment_series;
DROP POLICY IF EXISTS equipment_series_service_write       ON equipment_series;
CREATE POLICY equipment_series_public_read   ON equipment_series FOR SELECT USING (true);
CREATE POLICY equipment_series_service_write ON equipment_series FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3) equipment_tiers ───────────────────────────────────────
ALTER TABLE equipment_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_write_tiers                    ON equipment_tiers;  -- 旧：ALL authenticated
DROP POLICY IF EXISTS equipment_tiers_read_authenticated   ON equipment_tiers;
DROP POLICY IF EXISTS equipment_tiers_read_public          ON equipment_tiers;
DROP POLICY IF EXISTS read_equipment_tiers                 ON equipment_tiers;
DROP POLICY IF EXISTS equipment_tiers_public_read          ON equipment_tiers;
DROP POLICY IF EXISTS equipment_tiers_service_write        ON equipment_tiers;
CREATE POLICY equipment_tiers_public_read   ON equipment_tiers FOR SELECT USING (true);
CREATE POLICY equipment_tiers_service_write ON equipment_tiers FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4) item_pool ─────────────────────────────────────────────
ALTER TABLE item_pool ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS item_pool_all                 ON item_pool;  -- 旧：ALL auth.uid() IS NOT NULL（过宽）
DROP POLICY IF EXISTS item_pool_read_authenticated  ON item_pool;
DROP POLICY IF EXISTS item_pool_read_public         ON item_pool;
DROP POLICY IF EXISTS item_pool_select              ON item_pool;
DROP POLICY IF EXISTS item_pool_public_read         ON item_pool;
DROP POLICY IF EXISTS item_pool_service_write       ON item_pool;
CREATE POLICY item_pool_public_read   ON item_pool FOR SELECT USING (true);
CREATE POLICY item_pool_service_write ON item_pool FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5) map_config（无编辑器·仅收紧写权）────────────────────────
ALTER TABLE map_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS map_config_all                 ON map_config;  -- 旧：ALL auth.uid() IS NOT NULL
DROP POLICY IF EXISTS map_config_read_authenticated  ON map_config;
DROP POLICY IF EXISTS map_config_read_public         ON map_config;
DROP POLICY IF EXISTS map_config_select              ON map_config;
DROP POLICY IF EXISTS map_config_public_read         ON map_config;
DROP POLICY IF EXISTS map_config_service_write       ON map_config;
CREATE POLICY map_config_public_read   ON map_config FOR SELECT USING (true);
CREATE POLICY map_config_service_write ON map_config FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6) npc_pool ──────────────────────────────────────────────
ALTER TABLE npc_pool ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS npc_pool_all                 ON npc_pool;  -- 旧：ALL auth.uid() IS NOT NULL
DROP POLICY IF EXISTS npc_pool_read_public         ON npc_pool;
DROP POLICY IF EXISTS npc_pool_select              ON npc_pool;
DROP POLICY IF EXISTS npc_pool_read_authenticated  ON npc_pool;
DROP POLICY IF EXISTS npc_pool_public_read         ON npc_pool;
DROP POLICY IF EXISTS npc_pool_service_write       ON npc_pool;
CREATE POLICY npc_pool_public_read   ON npc_pool FOR SELECT USING (true);
CREATE POLICY npc_pool_service_write ON npc_pool FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

-- 验证：期望 6 表 rls_enabled=true·各 2 策略；anon INSERT 被拒（new row violates RLS）；anon SELECT 正常。
