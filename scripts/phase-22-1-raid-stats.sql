-- ============================================================
-- Phase 22.1 — raid_stats：单局结束时的回顾数据
-- ============================================================
-- 每个 raid 结束（gamestate = 2）时写入 1 条记录。供 admin "playtest 总览" 折线图
-- 与未来的自动平衡使用。
--
-- 字段：
--   room_id            int — 关联 rooms.id
--   gamenum            int — rooms.gamenum 周目编号
--   ended_at           timestamptz
--   duration_seconds   int  — started_at → ended_at 的秒数
--   chamber_count_avg  numeric — 全玩家平均 chamberIndex
--   chamber_count_max  int     — 全玩家最大 chamberIndex（最深玩家）
--   player_count       int  — validnum
--   alive_count        int  — alivenum（结局触发瞬间）
--   death_count        int  — deathnum
--   extract_count      int  — 撤离玩家数（player.extracted = true）
--   fragments_extracted int — gamevars.totalFragmentsExtracted
--   ending_key         text — gamevars.endingResult.key 或 NULL
--   env_pollution_final int — gamevars.envPollution 终值
-- ============================================================

CREATE TABLE IF NOT EXISTS raid_stats (
  id                   BIGSERIAL PRIMARY KEY,
  room_id              BIGINT,
  gamenum              INTEGER,
  ended_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_seconds     INTEGER NOT NULL DEFAULT 0,
  chamber_count_avg    NUMERIC(6, 2) DEFAULT 0,
  chamber_count_max    INTEGER DEFAULT 0,
  player_count         INTEGER DEFAULT 0,
  alive_count          INTEGER DEFAULT 0,
  death_count          INTEGER DEFAULT 0,
  extract_count        INTEGER DEFAULT 0,
  fragments_extracted  INTEGER DEFAULT 0,
  ending_key           TEXT,
  env_pollution_final  INTEGER DEFAULT 0,
  raid_path_length     INTEGER DEFAULT 0,
  metadata             JSONB DEFAULT '{}'::jsonb
);

-- 按 ended_at 索引（总览页查最近 N 局）
CREATE INDEX IF NOT EXISTS raid_stats_ended_idx ON raid_stats(ended_at DESC);
CREATE INDEX IF NOT EXISTS raid_stats_ending_idx ON raid_stats(ending_key) WHERE ending_key IS NOT NULL;

COMMENT ON TABLE raid_stats IS 'Phase 22 playtest 数据：单局结束时的回顾数据';
COMMENT ON COLUMN raid_stats.duration_seconds IS 'rooms.started_at → ended_at 的秒数';
COMMENT ON COLUMN raid_stats.chamber_count_avg IS '全玩家平均最深 chamberIndex（衡量探索深度）';
COMMENT ON COLUMN raid_stats.metadata IS '附加 JSON（玩家级摘要、自定义指标等）';

-- 验证
-- SELECT count(*), avg(duration_seconds)/60 AS avg_minutes, avg(chamber_count_avg) AS avg_depth
-- FROM raid_stats;
