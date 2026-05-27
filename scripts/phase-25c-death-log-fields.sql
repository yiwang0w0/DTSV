-- ============================================================
-- Phase 25c — player_death_log 补字段（cause_category / survived_seconds / chamber_depth）
-- ============================================================
-- 来源 finding: research-2026-05-27-v2 主题 C
-- "死亡因果可识别度" 的数据前置，同时是 A 主题"死亡黏度"埋点的依赖。
--
-- 现状: player_death_log.reason TEXT 自由文本，5 个值散落在 deathLog.js / archive page.js,
-- 没有 DB 层约束。无法做"死亡因果分类聚合 / 留存关联"等分析。
--
-- 设计:
--   1. 新建 ENUM death_cause_category, 5 个值 + 'other' 兜底
--      值: pvp / npc_counter / omega_timeout / pollution_meltdown / other
--   2. ALTER TABLE 加 cause_category death_cause_category 列, 从已有 reason 回填
--   3. ALTER TABLE 加 survived_seconds INT (从进入 raid 到死亡的秒数)
--   4. ALTER TABLE 加 chamber_depth INT (死亡时所处 chamber 深度，cold→volatile = 1→5)
--   5. 加 cause_category 的索引, 支持 archive 分类过滤 + healthcheck 聚合
--
-- 兼容:
--   - reason TEXT 保留不动 (旧 inserter 仍能写)
--   - cause_category 允许 NULL, 老数据回填一次, 新数据由 deathLog.js 同时写 reason + cause_category
--
-- 验证:
--   SELECT cause_category, count(*) FROM player_death_log GROUP BY cause_category;
--   SELECT AVG(survived_seconds) FILTER (WHERE survived_seconds IS NOT NULL) FROM player_death_log;
-- ============================================================

BEGIN;

-- 1. ENUM type (IF NOT EXISTS via DO block, 因 CREATE TYPE 无 IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'death_cause_category') THEN
    CREATE TYPE death_cause_category AS ENUM (
      'pvp',
      'npc_counter',
      'omega_timeout',
      'pollution_meltdown',
      'other'
    );
  END IF;
END$$;

-- 2. cause_category 列
ALTER TABLE player_death_log
  ADD COLUMN IF NOT EXISTS cause_category death_cause_category;

-- 回填: 把已有 reason TEXT 映射成 enum，未知值兜底 'other'
UPDATE player_death_log
   SET cause_category = CASE
     WHEN reason = 'pvp'                 THEN 'pvp'::death_cause_category
     WHEN reason = 'npc_counter'         THEN 'npc_counter'::death_cause_category
     WHEN reason = 'omega_timeout'       THEN 'omega_timeout'::death_cause_category
     WHEN reason = 'pollution_meltdown'  THEN 'pollution_meltdown'::death_cause_category
     ELSE 'other'::death_cause_category
   END
 WHERE cause_category IS NULL;

CREATE INDEX IF NOT EXISTS idx_player_death_log_cause
  ON player_death_log(cause_category);

COMMENT ON COLUMN player_death_log.cause_category IS
  'Phase 25c 死亡因果分类 ENUM (pvp/npc_counter/omega_timeout/pollution_meltdown/other)。
   reason TEXT 保留作历史/详细分支文案兼容；分析查询用本列。';

-- 3. survived_seconds 列 (从进入 raid 到死亡的秒数)
ALTER TABLE player_death_log
  ADD COLUMN IF NOT EXISTS survived_seconds INTEGER
  CHECK (survived_seconds IS NULL OR survived_seconds >= 0);

COMMENT ON COLUMN player_death_log.survived_seconds IS
  'Phase 25c 该次 raid 存活秒数 (raid 开始 → 死亡)。
   NULL = 旧数据 / 调用方未提供; 0 = 进场即死。';

-- 4. chamber_depth 列 (死亡时所处 chamber 深度)
-- 设计参考: Phase 19 cold→volatile chamber 五层结构 (depth 1-5)
ALTER TABLE player_death_log
  ADD COLUMN IF NOT EXISTS chamber_depth INTEGER
  CHECK (chamber_depth IS NULL OR (chamber_depth >= 0 AND chamber_depth <= 10));

CREATE INDEX IF NOT EXISTS idx_player_death_log_depth
  ON player_death_log(chamber_depth) WHERE chamber_depth IS NOT NULL;

COMMENT ON COLUMN player_death_log.chamber_depth IS
  'Phase 25c 死亡时所处 chamber 深度 (Phase 19 五层结构: 1=cold→5=volatile)。
   NULL = 不在 chamber 中 (e.g. 地表地图死亡)；上限 10 留给未来扩展。';

COMMIT;

-- 验证 / 演练命令:
-- SELECT cause_category, count(*) FROM player_death_log GROUP BY cause_category ORDER BY 2 DESC;
-- SELECT chamber_depth, AVG(survived_seconds) FROM player_death_log
--   WHERE survived_seconds IS NOT NULL GROUP BY chamber_depth ORDER BY chamber_depth;
-- 回填一致性: SELECT count(*) FROM player_death_log WHERE cause_category IS NULL;  -- 应为 0
