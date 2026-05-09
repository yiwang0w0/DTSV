-- ═══════════════════════════════════════════════════════════════════
-- 远星函馆 Phase 8.1 — 地图 schema 重构 + 7 区域种子数据
-- ═══════════════════════════════════════════════════════════════════
-- 变更：
--   1. ALTER map_config: drop extraction_points, add 6 new columns
--   2. DELETE FROM rooms (旧 map_id 不兼容)
--   3. DELETE FROM map_config + INSERT 7 行（spec §2.4）

-- ── 1. ALTER map_config ─────────────────────────────────────
ALTER TABLE map_config
  DROP COLUMN IF EXISTS extraction_points;

ALTER TABLE map_config
  ADD COLUMN IF NOT EXISTS pollution_base   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pollution_accel  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjacent_maps    JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_exit          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS exit_cost        JSONB,
  ADD COLUMN IF NOT EXISTS omega_window     INTEGER NOT NULL DEFAULT 0;

-- ── 2. 清空旧对局（旧 map_id 已失效） ───────────────────────
DELETE FROM rooms;

-- ── 3. 清空旧 map_config 并灌入 7 行 ─────────────────────────
DELETE FROM map_config;

INSERT INTO map_config (map_id, name, description, weather, blocked,
                        pollution_base, pollution_accel, adjacent_maps,
                        is_exit, exit_cost, omega_window, max_players, max_items, max_npcs)
VALUES
  (0, '外环维护廊', '塌陷环带最外层，残存通行轨道与维护节点',
      'clear', FALSE, 0, 0, '[1]'::jsonb,
      TRUE, NULL, 0, 10, 5, 2),

  (1, '锚点走廊', '原稳定锚点(Anchor-β)残段，泡层壳体嵌入',
      'fog', FALSE, 45, 0, '[0,2,10]'::jsonb,
      FALSE, NULL, 0, 10, 6, 3),

  (2, '伊甸港残墟', '原投放模块区3号干道，扰动缓冲层堆积',
      'storm', FALSE, 65, 0, '[1,3,11]'::jsonb,
      FALSE, NULL, 0, 10, 7, 4),

  (3, '剪切界面缓冲带', '贴近黑洞能层边缘，结构缓慢变化区',
      'snow', FALSE, 85, 3, '[2,4]'::jsonb,
      FALSE, NULL, 0, 10, 6, 4),

  (4, 'Ω-段核心接口', '未归档主控路径本体，泡层与平台共构区',
      'night', FALSE, 100, 8, '[3]'::jsonb,
      FALSE, NULL, 3, 10, 4, 5),

  (10, '废弃投放口', '锚点走廊分叉，可作紧急撤离出口',
      'rain', FALSE, 50, 0, '[1]'::jsonb,
      TRUE, '{"item":"环段部件","qty":1}'::jsonb, 0, 10, 4, 2),

  (11, '旧伊甸港-3通道', '伊甸港残墟分叉，可作紧急撤离出口',
      'fog', FALSE, 70, 0, '[2]'::jsonb,
      TRUE, '{"item":"环段部件","qty":1}'::jsonb, 0, 10, 4, 2);

-- ── 4. 验证 ──────────────────────────────────────────────────
SELECT map_id, name, pollution_base, pollution_accel, adjacent_maps,
       is_exit, exit_cost, omega_window
  FROM map_config
 ORDER BY map_id;
