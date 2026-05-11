-- ============================================================
-- Phase 18.3 — 玩家死亡日志（跨周目持久，Archive 可追溯）
-- ============================================================
-- 10 维评估"系统透明度（6）"的实现 — 让玩家在 Archive 看到自己的死亡
-- 历史，能基于已解码知识规避同类失败。
-- ============================================================

CREATE TABLE IF NOT EXISTS player_death_log (
  id           SERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id      INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  gamenum      INTEGER,                       -- 周目编号（rooms.gamenum 快照）
  map_id       INTEGER,                       -- 死亡时所在地图
  reason       TEXT NOT NULL,                 -- pvp / npc_counter / omega_timeout / pollution_meltdown / other
  reason_text  TEXT NOT NULL DEFAULT '',      -- 详细文案（"被 X 反击击杀"等）
  context      JSONB DEFAULT '{}'::jsonb,     -- 上下文：{ attacker, npcName, envPollution, personalPollution, ... }
  died_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_death_log_user ON player_death_log(user_id);
CREATE INDEX IF NOT EXISTS idx_player_death_log_died ON player_death_log(died_at DESC);

-- RLS — 玩家只读自己的；service_role 写入（与 player_fragments 同模式）
ALTER TABLE player_death_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player_death_log_read" ON player_death_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "player_death_log_insert" ON player_death_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 验证：
-- SELECT reason, count(*) FROM player_death_log GROUP BY reason;
