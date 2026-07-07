-- ============================================================
-- Phase 54 (52b) — 玩家数据表 RLS：owner-read（+admin 聚合）+ 写仅 service_role
-- ============================================================
-- 轨道：🔒 安全性（phase-52 广义 RLS 扫描 · 52b 剩余批 · 玩家数据分组）
--
-- ── 背景（HIGH·数据暴露）──
--   player_points / player_class_runs / raid_stats 三表当前 **RLS 全关** → anon 可读写。
--   尤其 player_points 含 user_id + balance → 匿名可读**所有玩家的点数余额**并篡改。收紧优先级最高。
--
-- ── 读策略设计（关键：按 user 隔离，不能公开读）──
--   player_points / player_class_runs（含 user_id）：**owner-read** —— 玩家只读自己的行；
--     另放行 PRIMARY_ADMIN（kanata·邮箱判定）读全表，保 PointsConfigTab / ClassesTab 的跨玩家聚合。
--     邮箱与 src/lib/auth.js PRIMARY_ADMIN_EMAIL 一致；非管理员/anon 只见自己/无。
--   raid_stats（无 user_id·纯 raid 聚合·无 PII）：public read（沿用 ChambersTab/PlaytestTab 的 anon 分析读）。
--   三表**写全部服务端**（points.js/classes.js/gameActions 经 service_role）→ 写仅 service_role。
--
-- ── 无编辑器改动 ──
--   三表客户端只读（PrepareModal 读自己 .eq(user_id)、admin 聚合读、分析读）、无 anon 写 →
--   本迁移纯 SQL，无写路径联动。owner-read 对 PrepareModal（读自己）零影响。
--
-- 幂等：ENABLE RLS 可重复；DROP POLICY IF EXISTS 后 CREATE。
--
-- ✅ 状态：**已应用**（2026-07-07 · 经 postgres MCP 执行）。
--    验证：anon 读 player_points=0 行（owner 隔离）、anon 写被拒；PrepareModal owner 读自己正常。
-- ============================================================

BEGIN;

-- 1) player_points：owner-read + admin 聚合读；写仅 service_role
ALTER TABLE player_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS player_points_owner_read    ON player_points;
DROP POLICY IF EXISTS player_points_service_write ON player_points;
CREATE POLICY player_points_owner_read ON player_points FOR SELECT
  USING (user_id = auth.uid() OR (auth.jwt() ->> 'email') = '2949215486@qq.com');
CREATE POLICY player_points_service_write ON player_points FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2) player_class_runs：owner-read + admin 聚合读；写仅 service_role
ALTER TABLE player_class_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS player_class_runs_owner_read    ON player_class_runs;
DROP POLICY IF EXISTS player_class_runs_service_write ON player_class_runs;
CREATE POLICY player_class_runs_owner_read ON player_class_runs FOR SELECT
  USING (user_id = auth.uid() OR (auth.jwt() ->> 'email') = '2949215486@qq.com');
CREATE POLICY player_class_runs_service_write ON player_class_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3) raid_stats：public read（无 user_id·聚合分析·无 PII）；写仅 service_role
ALTER TABLE raid_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS raid_stats_public_read   ON raid_stats;
DROP POLICY IF EXISTS raid_stats_service_write ON raid_stats;
CREATE POLICY raid_stats_public_read   ON raid_stats FOR SELECT USING (true);
CREATE POLICY raid_stats_service_write ON raid_stats FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

-- 验证：player_points/player_class_runs rls=true·各 2 策略；anon 读他人=0、anon 写被拒；raid_stats 公开读。
