-- ============================================================
-- Phase 56 (52b-2c) — 投放规则四表 RLS：开 RLS + 公开读 + 写仅 service_role
-- ============================================================
-- 轨道：🔒 安全性（phase-52 广义 RLS 扫描 · 52b 剩余批 · placement 组）
--
-- ── 背景 ──
--   placement_rules / placement_rule_rooms / npc_placement_rules / npc_placement_rule_rooms
--   当前 RLS 全关（anon 可读写投放规则）。编辑器 usePlacementRules（RoomItemsTab/NpcPlacementTab）动态 from 直写。
--
-- ── 同批联动（已先 ship·零窗口）──
--   usePlacementRules 写路径已改走服务端 /api/admin/placement（feat(52b-2c)）。先 ship 路由 → 验证 → 再跑本迁移。
--
-- ── 读策略 = public（投放配置·仅编辑器 anon 读；无 per-user 数据）──
--
-- 幂等：ENABLE RLS 可重复；DROP POLICY IF EXISTS 后 CREATE。
--
-- ✅ 状态：**已应用**（2026-07-07 · 路由先行部署后经 postgres MCP 执行）。
-- ============================================================

BEGIN;

ALTER TABLE placement_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS placement_rules_public_read   ON placement_rules;
DROP POLICY IF EXISTS placement_rules_service_write ON placement_rules;
CREATE POLICY placement_rules_public_read   ON placement_rules FOR SELECT USING (true);
CREATE POLICY placement_rules_service_write ON placement_rules FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE placement_rule_rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS placement_rule_rooms_public_read   ON placement_rule_rooms;
DROP POLICY IF EXISTS placement_rule_rooms_service_write ON placement_rule_rooms;
CREATE POLICY placement_rule_rooms_public_read   ON placement_rule_rooms FOR SELECT USING (true);
CREATE POLICY placement_rule_rooms_service_write ON placement_rule_rooms FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE npc_placement_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS npc_placement_rules_public_read   ON npc_placement_rules;
DROP POLICY IF EXISTS npc_placement_rules_service_write ON npc_placement_rules;
CREATE POLICY npc_placement_rules_public_read   ON npc_placement_rules FOR SELECT USING (true);
CREATE POLICY npc_placement_rules_service_write ON npc_placement_rules FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE npc_placement_rule_rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS npc_placement_rule_rooms_public_read   ON npc_placement_rule_rooms;
DROP POLICY IF EXISTS npc_placement_rule_rooms_service_write ON npc_placement_rule_rooms;
CREATE POLICY npc_placement_rule_rooms_public_read   ON npc_placement_rule_rooms FOR SELECT USING (true);
CREATE POLICY npc_placement_rule_rooms_service_write ON npc_placement_rule_rooms FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
