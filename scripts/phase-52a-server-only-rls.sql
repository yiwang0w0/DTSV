-- ============================================================
-- Phase 52a — 服务端专属表 RLS 锁死（开 RLS·无策略 = deny anon 读写；service_role 绕过）
-- ============================================================
-- 轨道：🔒 安全性（phase-52 广义 RLS 扫描 · 52a = 零写路径风险的即时收口）
--
-- ── 背景 ──
--   phase-51 收了 7 张【有 anon 编辑器/客户端读】的内容表。本批收另一类：**仅服务端(service_role)触达**、
--   浏览器 anon 客户端从不读/写/订阅的表。这类表开 RLS 即可锁死 anon，无需任何写路径改造（服务端
--   service_role 绕过 RLS，行为零变化）。
--
-- ── 入选判据（逐表实证，2026-07-06）──
--   1. 全 src 无 `from('<表>')` 字符串字面量出现在客户端文件（PrepareModal + admin/_tabs/*）；
--   2. 无动态 `from(变量)` 客户端访问（useContentCrud=内容引擎已 phase-51 收；usePlacementRules=placement
--      四表 → 属 52b，已排除）；
--   3. 无 realtime 订阅（全仓仅 GameClientPage 订 rooms）；
--   4. 仅出现在 src/lib/server/** 或 /api/**（service_role）。
--
-- ── 排除（留 52b：有 anon 编辑器或客户端读，需配读策略/写路由）──
--   br_rooms / chamber_templates / classes / fragment_pool / player_class_runs / player_points /
--   raid_stats / shop_catalog / shop_exchange_rates（客户端读/写）；
--   placement_rules / placement_rule_rooms / npc_placement_rules / npc_placement_rule_rooms
--   （usePlacementRules 动态 from · anon 读写）；
--   buff_pool / equipment_series / equipment_tiers / item_pool / map_config / npc_pool（RLS 已开但
--   admin_write_*=authenticated 过宽 + 有 anon 编辑器）。
--   注：contracts / player_contracts（合同已下线·孤表）**已是 RLS-on·0 策略**（已锁），本批不需处理。
--
-- ── 私有表读策略说明 ──
--   本批部分表含 user_id（player_notifications / player_expedition_opt_ins 等）。当前无任何客户端直读，
--   故用最紧的「开 RLS·无策略=全拒 anon」。日后若某功能需客户端读，再按 player_death_log 范式补
--   owner-read（USING auth.uid()=user_id）—— 那是独立变更，不在本批。
--
-- 幂等：ENABLE ROW LEVEL SECURITY 可重复执行。
--
-- ✅ 状态：**已应用**（2026-07-06 经 postgres MCP 执行）。验证：14 表全部 rls_enabled=true·policies=0
--    （deny-all anon·service_role 绕过，与已锁的 contracts/player_contracts 同姿态；enforcement 机制
--    已在 phase-51 于本库实测 anon 写被拒）。服务端 gameActions/probes/br/** 经 service_role 读写零影响。
-- ============================================================

BEGIN;

-- ── 时间跳跃 BR 匹配态（第二实现·teardown 记录在案；客户端经 /api/br 服务端读，不直连）──
ALTER TABLE br_match_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE br_match_players      ENABLE ROW LEVEL SECURITY;
ALTER TABLE br_match_room_state   ENABLE ROW LEVEL SECURITY;
ALTER TABLE br_matches            ENABLE ROW LEVEL SECURITY;
ALTER TABLE br_zone_tables        ENABLE ROW LEVEL SECURITY;

-- ── 对局/系统运行态（gameActions/probes/chamberResidue/coldCases 服务端管理）──
ALTER TABLE chamber_residue       ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_room_probes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE economy_wipe_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE fragment_cold_cases   ENABLE ROW LEVEL SECURITY;
ALTER TABLE probe_encounter_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_items            ENABLE ROW LEVEL SECURITY;

-- ── 玩家私有/系统表（当前无客户端直读；日后需读再补 owner-read）──
ALTER TABLE player_expedition_opt_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasonal_expeditions      ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ============================================================
-- 验证（应用后）：期望 14 表 rls_enabled=true 且 policies=0（全拒 anon·service_role 绕过）。
-- SELECT c.relname, c.relrowsecurity,
--        (SELECT count(*) FROM pg_policies p WHERE p.tablename=c.relname AND p.schemaname='public') AS policies
-- FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
-- WHERE n.nspname='public' AND c.relname IN
--  ('br_match_events','br_match_players','br_match_room_state','br_matches','br_zone_tables',
--   'chamber_residue','cross_room_probes','economy_wipe_log','fragment_cold_cases','probe_encounter_pairs',
--   'room_items','player_expedition_opt_ins','player_notifications','seasonal_expeditions')
-- ORDER BY c.relname;
-- 反向验证：SET LOCAL ROLE anon; SELECT/INSERT 任一表应返回 0 行 / 被拒。
-- ============================================================
