-- ============================================================
-- Phase 55 (52b-2a) — 5 内容表 RLS：开 RLS + 公开读 + 写仅 service_role
-- ============================================================
-- 轨道：🔒 安全性（phase-52 广义 RLS 扫描 · 52b 剩余批 · 内容表组第一片）
--
-- ── 背景 ──
--   chamber_templates / classes / fragment_pool / shop_catalog / shop_exchange_rates
--   当前 RLS 全关（anon 可读写内容表）。均有 anon 编辑器；shop_catalog/shop_exchange_rates 另有玩家读（PrepareModal）。
--
-- ── 同批联动（已先 ship·零窗口）──
--   5 编辑器写路径已改走服务端 service_role（feat(52b-2a)·/api/admin/table 通用扁平表路由）：
--     ChambersTab/ClassesTab/FragmentsTab/ShopTab/PointsConfigTab。先 ship 路由 → 部署验证 → 再跑本迁移。
--
-- ── 读策略 = public（内容/目录，玩家端 + 编辑器 anon 均需读）──
--   与 player_points(phase-54 owner-read) 区别：这 5 表无 per-user 数据，公开读安全。
--
-- 幂等：ENABLE RLS 可重复；DROP POLICY IF EXISTS 后 CREATE。
--
-- ✅ 状态：**已应用**（2026-07-07 · 路由先行部署后经 postgres MCP 执行）。
--    验证：5 表 rls_enabled=true·各 2 策略；anon 读正常、anon 写被拒。
-- ============================================================

BEGIN;

ALTER TABLE chamber_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chamber_templates_public_read   ON chamber_templates;
DROP POLICY IF EXISTS chamber_templates_service_write ON chamber_templates;
CREATE POLICY chamber_templates_public_read   ON chamber_templates FOR SELECT USING (true);
CREATE POLICY chamber_templates_service_write ON chamber_templates FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS classes_public_read   ON classes;
DROP POLICY IF EXISTS classes_service_write ON classes;
CREATE POLICY classes_public_read   ON classes FOR SELECT USING (true);
CREATE POLICY classes_service_write ON classes FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE fragment_pool ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fragment_pool_public_read   ON fragment_pool;
DROP POLICY IF EXISTS fragment_pool_service_write ON fragment_pool;
CREATE POLICY fragment_pool_public_read   ON fragment_pool FOR SELECT USING (true);
CREATE POLICY fragment_pool_service_write ON fragment_pool FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE shop_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shop_catalog_public_read   ON shop_catalog;
DROP POLICY IF EXISTS shop_catalog_service_write ON shop_catalog;
CREATE POLICY shop_catalog_public_read   ON shop_catalog FOR SELECT USING (true);
CREATE POLICY shop_catalog_service_write ON shop_catalog FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE shop_exchange_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shop_exchange_rates_public_read   ON shop_exchange_rates;
DROP POLICY IF EXISTS shop_exchange_rates_service_write ON shop_exchange_rates;
CREATE POLICY shop_exchange_rates_public_read   ON shop_exchange_rates FOR SELECT USING (true);
CREATE POLICY shop_exchange_rates_service_write ON shop_exchange_rates FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
