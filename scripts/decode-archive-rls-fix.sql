-- ============================================================
-- Phase 14.1 — fragment_pool RLS 修补
-- ============================================================
-- 问题：decode-archive-schema.sql 给 fragment_pool 启了 RLS 但只配了
--      SELECT 策略，缺 INSERT/UPDATE/DELETE。后台 FragmentsTab 用
--      client-side anon supabase 直连写入会被静默拒绝。
--
-- 解决：与项目其它表（item_pool / npc_pool / map_config / ...）保持
--      一致 — 关闭 fragment_pool 的 RLS。
--      player_fragments 保留 RLS（含玩家私人解码进度，需要按 user 隔离）。
-- ============================================================

ALTER TABLE fragment_pool DISABLE ROW LEVEL SECURITY;

-- 顺手清理已废弃的只读策略（避免后续重启 RLS 时残留）
DROP POLICY IF EXISTS "fragment_pool_read" ON fragment_pool;

-- 验证：以下查询应返回 rls_enabled = false
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'fragment_pool';
