-- ============================================================
-- Phase 25d — cross_room_probes 遥测埋点 + admin 视图
-- ============================================================
-- 来源 finding: research-2026-05-27-v3 主题 E
-- "cross_room_probes 上线前先加遥测埋点（probes_left / encountered /
--  outcome_breakdown）+ admin 视图。"
--
-- 现状: cross_room_probes 只有 found_count / defeated_count 两个粗粒度
-- 计数，无法分辨 "被遭遇但放过 (ignore)" vs "击杀玩家 (probe 反杀)" vs
-- "玩家逃离 (战斗中跑掉)" 这些差异。Phase 21 上线后无法回答：
--   - "玩家整体倾向放过还是击杀探针？" (社交向 / 掠夺向 设计验证)
--   - "探针对新玩家是 net helper 还是 net griefer？" (玩家死亡因果归因)
--   - "一个 owner 留的探针长期回报曲线？" (probe TTL / fragments_carry 调参)
--
-- 设计:
--   1. ALTER 加 spared_count INT  — 玩家选 ignore 时 +1
--   2. ALTER 加 killed_attacker_count INT — 探针反杀玩家时 +1
--   3. ALTER 加 encounter_log JSONB — 追加 {ts, by, outcome} 事件流
--      outcome ENUM: 'spared' | 'defeated' | 'killed_attacker' | 'escaped'
--   4. CREATE VIEW v_probe_telemetry —
--      per-owner aggregate: probes_left（active 计数）/ total_encountered
--      / outcome_breakdown JSONB / avg_lifetime_hours
--   5. admin 端读 view，无需重算
--
-- 兼容:
--   - 已有 found_count / defeated_count 保留不动（写入路径继续维护）
--   - 新字段 NULL/默认安全：未升级的代码路径仍可工作
--   - encounter_log append-only,不读旧值，单字段更新足够（无并发风险）
--
-- 验证:
--   SELECT * FROM v_probe_telemetry LIMIT 5;
--   SELECT outcome_breakdown FROM v_probe_telemetry
--     WHERE total_encountered > 0 ORDER BY total_encountered DESC LIMIT 10;
-- ============================================================

BEGIN;

-- 1. spared_count
ALTER TABLE cross_room_probes
  ADD COLUMN IF NOT EXISTS spared_count INTEGER NOT NULL DEFAULT 0
  CHECK (spared_count >= 0);

COMMENT ON COLUMN cross_room_probes.spared_count IS
  'Phase 25d 玩家遭遇后选择 ignore（放过）的次数';

-- 2. killed_attacker_count
ALTER TABLE cross_room_probes
  ADD COLUMN IF NOT EXISTS killed_attacker_count INTEGER NOT NULL DEFAULT 0
  CHECK (killed_attacker_count >= 0);

COMMENT ON COLUMN cross_room_probes.killed_attacker_count IS
  'Phase 25d 探针反杀玩家次数（玩家选 attack 但在交手中倒下）';

-- 3. encounter_log — append-only 事件流
ALTER TABLE cross_room_probes
  ADD COLUMN IF NOT EXISTS encounter_log JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN cross_room_probes.encounter_log IS
  'Phase 25d append-only 事件流：[{ts, by, outcome}]
   outcome ∈ encountered | spared | defeated | killed_attacker | escaped。
   仅作分析用，不参与战斗逻辑。';

-- 4. admin 视图：per-owner aggregate
CREATE OR REPLACE VIEW v_probe_telemetry AS
SELECT
  p.owner_id,
  COUNT(*) FILTER (WHERE p.status = 'active' AND p.expires_at > now())
    AS probes_left,
  COUNT(*) FILTER (WHERE p.status = 'defeated')
    AS probes_defeated_total,
  COUNT(*) FILTER (WHERE p.status = 'expired'
                   OR (p.status = 'active' AND p.expires_at <= now()))
    AS probes_expired_total,
  COUNT(*) AS probes_ever,
  COALESCE(SUM(p.found_count), 0)            AS total_encountered,
  COALESCE(SUM(p.defeated_count), 0)         AS total_defeated,
  COALESCE(SUM(p.spared_count), 0)           AS total_spared,
  COALESCE(SUM(p.killed_attacker_count), 0)  AS total_killed_attacker,
  jsonb_build_object(
    'defeated',        COALESCE(SUM(p.defeated_count), 0),
    'spared',          COALESCE(SUM(p.spared_count), 0),
    'killed_attacker', COALESCE(SUM(p.killed_attacker_count), 0)
  ) AS outcome_breakdown,
  -- 平均寿命（小时） — 已结束的探针：(end - start)；active 探针：(now - start)
  COALESCE(AVG(
    EXTRACT(EPOCH FROM (
      COALESCE(p.defeated_at, LEAST(p.expires_at, now())) - p.created_at
    )) / 3600.0
  ), 0)::numeric(10, 2) AS avg_lifetime_hours,
  MAX(p.created_at) AS most_recent_probe_at
FROM cross_room_probes p
GROUP BY p.owner_id;

COMMENT ON VIEW v_probe_telemetry IS
  'Phase 25d 探针遥测视图（per-owner aggregate）。
   admin 视图直接读，无需重算。probes_left / total_encountered /
   outcome_breakdown 三个核心指标对应 research-2026-05-27-v3 finding。';

-- 5. （可选）chamber 维度的 outcome 分布（用于 admin "热门 chamber" 排序）
CREATE OR REPLACE VIEW v_probe_telemetry_by_chamber AS
SELECT
  p.chamber_template_id,
  COUNT(*) FILTER (WHERE p.status = 'active' AND p.expires_at > now())
    AS probes_active,
  COUNT(*) AS probes_ever,
  COALESCE(SUM(p.found_count), 0)            AS total_encountered,
  COALESCE(SUM(p.defeated_count), 0)         AS total_defeated,
  COALESCE(SUM(p.spared_count), 0)           AS total_spared,
  COALESCE(SUM(p.killed_attacker_count), 0)  AS total_killed_attacker
FROM cross_room_probes p
GROUP BY p.chamber_template_id;

COMMENT ON VIEW v_probe_telemetry_by_chamber IS
  'Phase 25d 探针遥测视图（per-chamber aggregate）。';

COMMIT;

-- 验证 / 演练命令:
-- SELECT * FROM v_probe_telemetry ORDER BY total_encountered DESC LIMIT 20;
-- SELECT * FROM v_probe_telemetry_by_chamber ORDER BY probes_active DESC LIMIT 20;
-- SELECT spared_count, killed_attacker_count, jsonb_array_length(encounter_log)
--   FROM cross_room_probes ORDER BY id DESC LIMIT 10;
