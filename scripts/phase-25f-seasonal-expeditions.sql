-- Phase 25f: 季节远征空表预埋 (28-B P0)
-- 仅冷藏 schema,本期不启用,避免半年后破坏性改表
-- 参考: Arc Raiders Expedition Project (2025-12 实装), notes-2026-05-28-B.md finding #2-#5
-- 配套文档预留: docs/economy-canon.md (28-B P0 之三) 定义 reset_scope 边界

-- 1) 远征定义表 (空)
CREATE TABLE IF NOT EXISTS seasonal_expeditions (
  season_id          TEXT PRIMARY KEY,
  display_name       TEXT NOT NULL,
  opened_at          TIMESTAMPTZ,
  opt_in_closes_at   TIMESTAMPTZ,
  departure_at       TIMESTAMPTZ,
  closed_at          TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','opt_in_open','departed','closed','archived')),
  entry_requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
  rewards_blueprint  JSONB NOT NULL DEFAULT '{}'::jsonb,
  reset_scope        JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) 玩家 opt-in 表 (空)
CREATE TABLE IF NOT EXISTS player_expedition_opt_ins (
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season_id            TEXT NOT NULL REFERENCES seasonal_expeditions(season_id) ON DELETE CASCADE,
  opted_in_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bonus_skill_points   INTEGER NOT NULL DEFAULT 0
                         CHECK (bonus_skill_points >= 0 AND bonus_skill_points <= 5),
  persisted_items      JSONB NOT NULL DEFAULT '{}'::jsonb,
  pre_wipe_snapshot    JSONB NOT NULL DEFAULT '{}'::jsonb,
  departure_confirmed  BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, season_id)
);

CREATE INDEX IF NOT EXISTS idx_seasonal_expeditions_status
  ON seasonal_expeditions(status);
CREATE INDEX IF NOT EXISTS idx_player_expedition_opt_ins_season
  ON player_expedition_opt_ins(season_id);

COMMENT ON TABLE seasonal_expeditions IS
  'Phase 25f: 季节远征 (可选 wipe) 空壳定义。Arc Raiders Expedition 参考,28-B P0 预埋,本期不启用。';
COMMENT ON TABLE player_expedition_opt_ins IS
  'Phase 25f: 玩家自愿参与季节远征记录,跨季保留项与 wipe 前快照。';

COMMENT ON COLUMN seasonal_expeditions.status IS
  '生命周期: draft → opt_in_open → departed → closed → archived';
COMMENT ON COLUMN seasonal_expeditions.entry_requirements IS
  'JSON: 入场门槛 (例 {min_level:20, mats:[...], coin_value:800000}),引用 Arc Raiders 高 gate 设计';
COMMENT ON COLUMN seasonal_expeditions.rewards_blueprint IS
  'JSON: 跨季奖励 (例 {skill_points_cap:5, stash_capacity_bonus:12}),"无战斗优势" 原则';
COMMENT ON COLUMN seasonal_expeditions.reset_scope IS
  'JSON: 哪些字段重置/保留 (例 {reset:[...],keep:[...]}),与 docs/economy-canon.md 同步';
COMMENT ON COLUMN player_expedition_opt_ins.bonus_skill_points IS
  '0-5 上限,跨季 "开局加速" 奖励,封顶防资产滚雪球穿越赛季';
COMMENT ON COLUMN player_expedition_opt_ins.persisted_items IS
  'JSON: 跨季保留的 cosmetic / 蓝图 / token 等结构性资源';
COMMENT ON COLUMN player_expedition_opt_ins.pre_wipe_snapshot IS
  'JSON: 入选确认前的 stash/equipment 快照,用于回滚或赛季后审计';
