-- ============================================================
-- Phase 40 — 提速：装备耐久扣减改单条 RPC（每战斗 1+N 查询 → 1 次往返）
-- ============================================================
-- 背景：consumeDurabilityParallel(equipmentDurability.js) 旧实现 = 1 次 SELECT 已装备件
--   + 每件 1 次 UPDATE（best-effort·并发）。每次 attackNpc/attackPlayer 后扣耐久 = 1+N 次
--   DB 查询（N=已装备件数·典型 4）。本函数把它收敛为单条原子 UPDATE，一次往返完成。
--
-- 逻辑与旧版【逐值等价】：
--   · durability_current = GREATEST(0, durability_current - p_amount)   （按行夹 0，同旧 Math.max(0,...)）
--   · is_equipped        = (durability_current - p_amount > 0)          （归零即卸下，同旧 newDur>0）
--   · WHERE owner_id=p_owner AND room_id=p_room AND is_equipped AND durability_current>0  （同旧 SELECT 过滤）
--
-- 权限：调用方为 service-role client（绕 RLS）→ 默认 SECURITY INVOKER 即可 UPDATE，无需 DEFINER。
-- 幂等：CREATE OR REPLACE FUNCTION，可安全重复执行。
-- 已于 2026-06-04 经 postgres MCP 应用（本文件为记录）。
--
-- 列类型（实测）：owner_id uuid · room_id integer · durability_current integer · is_equipped boolean。
-- ============================================================

CREATE OR REPLACE FUNCTION consume_equipment_durability(p_owner uuid, p_room integer, p_amount integer DEFAULT 1)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE equipment_instances
  SET durability_current = GREATEST(0, durability_current - p_amount),
      is_equipped        = (durability_current - p_amount > 0)
  WHERE owner_id = p_owner
    AND room_id  = p_room
    AND is_equipped = true
    AND durability_current > 0;
$$;

-- 验证（部署后）:
--   SELECT consume_equipment_durability('00000000-0000-0000-0000-000000000000'::uuid, -1, 1);  -- 0 行·返回 void
