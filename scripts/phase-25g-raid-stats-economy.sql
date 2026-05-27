-- Phase 25g: raid_stats 经济埋点字段 (28-B P0)
-- 目标:Phase 26 healthcheck 加"周库存增长率"指标,对照 12% 通胀红线
-- 4 字段:本局点数信贷 / 点数支出 / 库存价值 before / after
-- 全部 JSONB,key = point_type ('high_equip_pt' / 'low_equip_pt' / 'item_pt' / 'class_pt'),value = 整数累计
-- 参考: notes-2026-05-28-B.md finding #6-#8(catch-up + 通胀控制章节)

ALTER TABLE raid_stats
  ADD COLUMN IF NOT EXISTS points_credited     JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE raid_stats
  ADD COLUMN IF NOT EXISTS points_spent        JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE raid_stats
  ADD COLUMN IF NOT EXISTS stash_value_before  JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE raid_stats
  ADD COLUMN IF NOT EXISTS stash_value_after   JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN raid_stats.points_credited IS
  'JSONB { point_type: total_credited }。本局所有玩家撤离 creditPoints 累计(per-type 汇总)。Phase 25g 加,28-B P0 通胀埋点。';

COMMENT ON COLUMN raid_stats.points_spent IS
  'JSONB { point_type: total_spent }。本局所有玩家 debitPoints 累计(joinRoom 入场购买 + shop 兑换)。Phase 25g 加,28-B P0 通胀埋点。';

COMMENT ON COLUMN raid_stats.stash_value_before IS
  'JSONB { point_type: balance }。本局开局(gamestate 0→1 时)所有参与玩家 player_points 余额合计。Phase 26 healthcheck "周库存增长率" 基线。';

COMMENT ON COLUMN raid_stats.stash_value_after IS
  'JSONB { point_type: balance }。本局结束时(gamestate →2)所有参与玩家 player_points 余额合计。Phase 26 healthcheck "周库存增长率" 终点。';

-- 索引:支持 healthcheck 按 ended_at 时间窗口聚合(已有 PK 顺序扫即可,小表暂不加额外索引)

-- 视图:周库存增长率(per-week,可作为 healthcheck spec 引用)
-- 周内 sum(stash_value_after 累计) vs 同周 sum(stash_value_before 累计)
-- 注意:JSONB 各 type 单独聚合,只在 high_equip_pt + low_equip_pt + item_pt 三类上计算(class_pt 是非交易点数,exclude)
CREATE OR REPLACE VIEW v_weekly_stash_inflation AS
SELECT
  date_trunc('week', ended_at)                                                     AS week_start,
  COUNT(*)                                                                          AS raids_count,
  COALESCE(SUM((stash_value_before->>'high_equip_pt')::numeric), 0)::numeric        AS high_before,
  COALESCE(SUM((stash_value_after ->>'high_equip_pt')::numeric), 0)::numeric        AS high_after,
  COALESCE(SUM((stash_value_before->>'low_equip_pt')::numeric), 0)::numeric         AS low_before,
  COALESCE(SUM((stash_value_after ->>'low_equip_pt')::numeric), 0)::numeric         AS low_after,
  COALESCE(SUM((stash_value_before->>'item_pt')::numeric), 0)::numeric              AS item_before,
  COALESCE(SUM((stash_value_after ->>'item_pt')::numeric), 0)::numeric              AS item_after,
  -- 总库存价值(3 类合计),用于"周库存增长率"
  COALESCE(SUM(
    COALESCE((stash_value_before->>'high_equip_pt')::numeric, 0) +
    COALESCE((stash_value_before->>'low_equip_pt')::numeric, 0) +
    COALESCE((stash_value_before->>'item_pt')::numeric, 0)
  ), 0)::numeric                                                                    AS total_value_before,
  COALESCE(SUM(
    COALESCE((stash_value_after->>'high_equip_pt')::numeric, 0) +
    COALESCE((stash_value_after->>'low_equip_pt')::numeric, 0) +
    COALESCE((stash_value_after->>'item_pt')::numeric, 0)
  ), 0)::numeric                                                                    AS total_value_after,
  -- 同期 credit / spent 累计(net delta cross-check)
  COALESCE(SUM(
    COALESCE((points_credited->>'high_equip_pt')::numeric, 0) +
    COALESCE((points_credited->>'low_equip_pt')::numeric, 0) +
    COALESCE((points_credited->>'item_pt')::numeric, 0)
  ), 0)::numeric                                                                    AS total_credited,
  COALESCE(SUM(
    COALESCE((points_spent->>'high_equip_pt')::numeric, 0) +
    COALESCE((points_spent->>'low_equip_pt')::numeric, 0) +
    COALESCE((points_spent->>'item_pt')::numeric, 0)
  ), 0)::numeric                                                                    AS total_spent
FROM raid_stats
WHERE ended_at >= NOW() - INTERVAL '90 days'
GROUP BY date_trunc('week', ended_at)
ORDER BY week_start DESC;

COMMENT ON VIEW v_weekly_stash_inflation IS
  '周库存增长率视图(过去 90 天)。Phase 26 healthcheck 引用:增长率 = (total_value_after - total_value_before) / NULLIF(total_value_before, 0)。12% 周增长红线参考 notes-2026-05-28-B.md。';
