-- ============================================================
-- Phase 57 (52b-2b) — br_rooms RLS：开 RLS + 公开读 + 写仅 service_role
-- ============================================================
-- 轨道：🔒 安全性（phase-52 广义 RLS 扫描 · 52b 剩余批 · 最后一片）
--
-- ── 背景 ──
--   br_rooms（BR 拓扑配置·100 房网格）当前 RLS 全关（anon 可读写）。编辑器 RoomsEditorTab（含对称同步循环）直写。
--   BR 处维护态，但安全洞照收。
--
-- ── 同批联动（已先 ship·零窗口）──
--   RoomsEditorTab 写路径已改走 /api/admin/table（feat(52b-2b)·主写 + 对称同步 + remove + toggle）。
--   /api/admin/table 的 br_rooms 列白名单纳入 room_id（用户指派 pk）。先 ship 路由 → 部署 → 再跑本迁移。
--
-- ── 读策略 = public（拓扑配置·RoomsEditorTab/usePlacementRules 的 anon 读 + BR 运行端 service 读）──
--
-- 幂等：ENABLE RLS 可重复；DROP POLICY IF EXISTS 后 CREATE。
--
-- ✅ 状态：**已应用**（2026-07-07 · 路由先行部署后经 postgres MCP 执行）。
-- ============================================================

BEGIN;
ALTER TABLE br_rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS br_rooms_public_read   ON br_rooms;
DROP POLICY IF EXISTS br_rooms_service_write ON br_rooms;
CREATE POLICY br_rooms_public_read   ON br_rooms FOR SELECT USING (true);
CREATE POLICY br_rooms_service_write ON br_rooms FOR ALL TO service_role USING (true) WITH CHECK (true);
COMMIT;
