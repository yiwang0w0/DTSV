-- ═══════════════════════════════════════════════════════════════════════
-- Phase 31b — 同心圆缩圈（修正 phase-30 的「顺序分桶」走查反馈）
--
-- 问题：phase-30 按 room_id 顺序分桶（1-20→phase1, 21-40→phase2 …），缩圈表现为
--       逐行扫描而非"圆在收缩"。本补丁改为按「离网格中心的距离」分桶：
--       最外圈先收缩、中心最后存活 → 真正的 shrinking circle。
--
-- 不变量保持：每阶段恰好 20 房进入禁区 → 开放房数仍 100/80/60/40/20。
-- 幂等：纯 UPDATE，按确定性 ROW_NUMBER 重算，可重跑。
-- ═══════════════════════════════════════════════════════════════════════

-- 1) 按离中心(4.5,4.5)的欧氏距离平方降序排名 → 最远 20 个 close_phase=1，最近 20 个=5（不收缩）。
WITH ranked AS (
  SELECT
    room_id,
    ROW_NUMBER() OVER (
      ORDER BY ((grid_x - 4.5) * (grid_x - 4.5) + (grid_y - 4.5) * (grid_y - 4.5)) DESC, room_id
    ) AS rnk
  FROM br_rooms
)
UPDATE br_rooms r
SET close_phase = CASE
  WHEN ranked.rnk <= 20 THEN 1   -- 最外圈：阶段 1 收缩
  WHEN ranked.rnk <= 40 THEN 2
  WHEN ranked.rnk <= 60 THEN 3
  WHEN ranked.rnk <= 80 THEN 4
  ELSE 5                          -- 最内 20 房：末路也不收缩
END
FROM ranked
WHERE r.room_id = ranked.room_id;

-- 2) 重建禁区表权威列：is_forbidden = (phase >= close_phase)。
UPDATE br_zone_tables z
SET is_forbidden = (z.phase >= r.close_phase)
FROM br_rooms r
WHERE z.room_id = r.room_id;

-- ── 验证（部署后 pg_execute_query）──────────────────────────────────────
-- SELECT phase, count(*) FILTER (WHERE NOT is_forbidden) AS open
--   FROM br_zone_tables GROUP BY phase ORDER BY phase;             -- 期望 100/80/60/40/20
-- SELECT close_phase, count(*) FROM br_rooms GROUP BY close_phase ORDER BY close_phase; -- 每档 20
-- SELECT room_id, grid_x, grid_y, close_phase FROM br_rooms
--   WHERE room_id IN (1, 45, 46, 55, 56, 100) ORDER BY room_id;    -- 中心(45/46/55/56)=5，角(1/100)=1
