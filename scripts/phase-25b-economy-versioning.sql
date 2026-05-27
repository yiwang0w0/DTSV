-- ============================================================
-- Phase 25b — 经济版本号 + wipe-equivalent
-- ============================================================
-- 来源 finding: research-2026-05-27 主题 B (元进度甜区)
-- "防止老玩家 runaway power": Phase 24b shop_exchange_rates 加版本号,
-- 支持一次性按比例缩减所有玩家点数(wipe-equivalent),无需整库重置。
--
-- 设计:
--   1. shop_exchange_rates.economy_version 标记汇率属于第几版经济
--   2. economy_wipe_log 表记录每次 wipe 操作(谁/何时/比例/影响人数)
--   3. apply_economy_wipe(scaling_factor, reason, applied_by) SQL 函数
--      原子地 UPDATE player_points 按比例缩减 + 写日志
--
-- 使用场景:
--   - 测试期发现点数通胀 → 一键 0.5 缩减
--   - 上线后 season 重置 → 0.3 大缩减 + 切新 economy_version
--   - 紧急回滚错误投放 → 0.8 微缩减
-- ============================================================

BEGIN;

-- 1. shop_exchange_rates 加版本号
ALTER TABLE shop_exchange_rates
  ADD COLUMN IF NOT EXISTS economy_version INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS shop_exchange_rates_version_idx ON shop_exchange_rates(economy_version);
COMMENT ON COLUMN shop_exchange_rates.economy_version IS
  'Phase 25b 经济版本号; 默认 1; 切版后旧汇率行 enabled=false 但保留作历史';

-- 2. economy_wipe_log: 记录每次 wipe-equivalent
CREATE TABLE IF NOT EXISTS economy_wipe_log (
  id              BIGSERIAL PRIMARY KEY,
  applied_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  scaling_factor  NUMERIC(4, 3) NOT NULL CHECK (scaling_factor > 0 AND scaling_factor <= 2.0),
  reason          TEXT,
  affected_users  INTEGER NOT NULL DEFAULT 0,
  total_before    BIGINT NOT NULL DEFAULT 0,
  total_after     BIGINT NOT NULL DEFAULT 0,
  point_type      TEXT,  -- NULL = 所有类型；指定则只 wipe 该类型
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS economy_wipe_log_applied_idx ON economy_wipe_log(applied_at DESC);

COMMENT ON TABLE economy_wipe_log IS
  'Phase 25b 经济缩减操作日志。每次 apply_economy_wipe() 调用追加一行。';
COMMENT ON COLUMN economy_wipe_log.scaling_factor IS
  '缩放系数: 0.5 = 缩减一半; 0.3 = 大缩减; 1.5 = 通胀(允许但慎用)';

-- 3. apply_economy_wipe 函数:原子缩减所有 player_points + 写日志
CREATE OR REPLACE FUNCTION apply_economy_wipe(
  _scaling_factor NUMERIC,
  _reason         TEXT DEFAULT NULL,
  _applied_by     UUID DEFAULT NULL,
  _point_type     TEXT DEFAULT NULL  -- NULL = 所有 point_type
) RETURNS TABLE(
  log_id          BIGINT,
  affected_users  INTEGER,
  total_before    BIGINT,
  total_after     BIGINT
) AS $$
DECLARE
  v_before BIGINT := 0;
  v_after  BIGINT := 0;
  v_users  INTEGER := 0;
  v_log_id BIGINT;
BEGIN
  -- safety: 缩放系数必须 (0, 2.0]
  IF _scaling_factor IS NULL OR _scaling_factor <= 0 OR _scaling_factor > 2.0 THEN
    RAISE EXCEPTION 'scaling_factor must be in (0, 2.0], got %', _scaling_factor;
  END IF;

  -- safety: 限定的 point_type 必须合法
  IF _point_type IS NOT NULL
     AND _point_type NOT IN ('high_equip_pt','low_equip_pt','item_pt','class_pt') THEN
    RAISE EXCEPTION 'invalid point_type: %', _point_type;
  END IF;

  -- 计算 before
  IF _point_type IS NULL THEN
    SELECT count(DISTINCT user_id), COALESCE(sum(balance), 0)
      INTO v_users, v_before FROM player_points;
  ELSE
    SELECT count(DISTINCT user_id), COALESCE(sum(balance), 0)
      INTO v_users, v_before FROM player_points WHERE point_type = _point_type;
  END IF;

  -- 应用缩减(FLOOR + GREATEST 0 防负值)
  IF _point_type IS NULL THEN
    UPDATE player_points
      SET balance = GREATEST(0, FLOOR(balance * _scaling_factor)::int),
          updated_at = now();
  ELSE
    UPDATE player_points
      SET balance = GREATEST(0, FLOOR(balance * _scaling_factor)::int),
          updated_at = now()
      WHERE point_type = _point_type;
  END IF;

  -- 计算 after
  IF _point_type IS NULL THEN
    SELECT COALESCE(sum(balance), 0) INTO v_after FROM player_points;
  ELSE
    SELECT COALESCE(sum(balance), 0) INTO v_after FROM player_points WHERE point_type = _point_type;
  END IF;

  -- 写日志
  INSERT INTO economy_wipe_log(
    applied_by, scaling_factor, reason, affected_users,
    total_before, total_after, point_type
  )
  VALUES (
    _applied_by, _scaling_factor, _reason, v_users,
    v_before, v_after, _point_type
  )
  RETURNING id INTO v_log_id;

  RETURN QUERY SELECT v_log_id, v_users, v_before, v_after;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION apply_economy_wipe(NUMERIC, TEXT, UUID, TEXT) IS
  'Phase 25b wipe-equivalent: 按 _scaling_factor 缩减 player_points。
   _point_type NULL = 缩减所有类型; 否则限定某一类。
   原子: 单事务内 read-before + UPDATE + read-after + log。
   返回 (log_id, affected_users, total_before, total_after)。

   示例: SELECT * FROM apply_economy_wipe(0.5, ''Pre-launch reset'', auth.uid());';

-- 4. 一个小工具: get_current_economy_version() 拿"当前激活的经济版本"
CREATE OR REPLACE FUNCTION get_current_economy_version() RETURNS INTEGER AS $$
  SELECT COALESCE(MAX(economy_version), 1)
  FROM shop_exchange_rates
  WHERE enabled = true;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION get_current_economy_version() IS
  'Phase 25b: 返回当前启用汇率的最大 economy_version (默认 1)';

COMMIT;

-- 验证 / 演练命令:
-- SELECT economy_version, count(*) FROM shop_exchange_rates GROUP BY economy_version;
-- SELECT get_current_economy_version();
-- 演练(不真跑): SELECT * FROM apply_economy_wipe(1.0, 'dry run', NULL);  -- 比例 1.0 = no-op,验证函数
-- 真实缩减半数: SELECT * FROM apply_economy_wipe(0.5, 'Test wipe', NULL);
-- 只缩减 item_pt: SELECT * FROM apply_economy_wipe(0.7, 'Item economy adjust', NULL, 'item_pt');
