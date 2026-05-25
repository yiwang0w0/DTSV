-- ============================================================
-- Phase 24c — 职业系统：classes + player_class_runs + 11 个 seed 职业
-- ============================================================
-- 入场时 roll 3 个 normal class 候选；10% 概率多 roll 1 个 legendary。
-- 玩家可选择消耗 1 class_pt 强制刷出 legendary 候选（保底机制）。
--
-- perks JSONB 白名单（5-8 个 well-known key，admin 编辑时不接受 unknown key）:
--   search_bonus       — 搜索成功率加成（0.10 = +10%）
--   pollution_resist   — 个人污染累积 ×(1-x)
--   combat_dmg_mult    — 玩家伤害 ×(1+x)
--   combat_def_mult    — 玩家防御 ×(1+x)
--   omega_window_bonus — Ω-段倒计时 +N 回合
--   fragment_drop_bonus— 残片掉率 +N（绝对加值，0.10 = +10pp）
--   catalog_unlock_tag — 解锁 shop_catalog 的 required_class_ids 含 self 的条目
-- ============================================================

BEGIN;

-- 1. classes 表（职业模板）
CREATE TABLE IF NOT EXISTS classes (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  description     TEXT NOT NULL DEFAULT '',
  rarity          TEXT NOT NULL CHECK (rarity IN ('normal','legendary')),
  base_atk_bonus  INTEGER NOT NULL DEFAULT 0,
  base_def_bonus  INTEGER NOT NULL DEFAULT 0,
  base_hp_bonus   INTEGER NOT NULL DEFAULT 0,
  perks           JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS classes_rarity_enabled_idx ON classes(rarity, enabled);
COMMENT ON TABLE classes IS 'Phase 24c 职业模板。入场时按 rarity 抽 3 normal + 10% legendary,玩家选 1。';
COMMENT ON COLUMN classes.perks IS '5-8 个 well-known key 白名单: search_bonus / pollution_resist / combat_dmg_mult / combat_def_mult / omega_window_bonus / fragment_drop_bonus / catalog_unlock_tag';


-- 2. player_class_runs 表（每 raid 选职业历史）
CREATE TABLE IF NOT EXISTS player_class_runs (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id       INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
  class_id      INTEGER NOT NULL REFERENCES classes(id),
  used_class_pt INTEGER NOT NULL DEFAULT 0,
  acquired_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, room_id)
);

CREATE INDEX IF NOT EXISTS player_class_runs_user_idx ON player_class_runs(user_id, acquired_at DESC);
COMMENT ON TABLE player_class_runs IS 'Phase 24c 每 raid 选职业历史。used_class_pt = 1 表示保底刷高级时消耗;= 0 表示自然 roll';


-- 3. profiles 加 pending_class_roll JSONB（跨页面刷新保留候选）
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pending_class_roll JSONB;
COMMENT ON COLUMN profiles.pending_class_roll IS 'Phase 24c 玩家入场前 roll 出的候选 class_id 数组,JSON 形如 {candidates:[1,2,3], legendary:[]} 或 null';


-- ═══════════════════════════════════════════════════════════════
-- 4. seed: 8 normal + 3 legendary
-- ═══════════════════════════════════════════════════════════════

-- 8 个 normal 职业（覆盖搜索/战斗/撤离/污染 4 个维度,每维度 2 个）
INSERT INTO classes (name, description, rarity, base_atk_bonus, base_def_bonus, base_hp_bonus, perks) VALUES
  ('巡检员', '熟悉外环结构,擅长低风险搜索。', 'normal',
   0, 2, 10, jsonb_build_object('search_bonus', 0.10)),

  ('应急工程师', '战时仍能修补结构,搜索与回血兼顾。', 'normal',
   1, 3, 15, jsonb_build_object('search_bonus', 0.05, 'combat_def_mult', 0.05)),

  ('信号兵', '通信组件常驻;敌情先于他人察觉。', 'normal',
   2, 0, 0, jsonb_build_object('combat_dmg_mult', 0.10)),

  ('武装协调员', '战斗倾向,装备使用更高效。', 'normal',
   4, 1, 5, jsonb_build_object('combat_dmg_mult', 0.15)),

  ('清算员', '专司路径污染处理,污染累积变慢。', 'normal',
   0, 1, 0, jsonb_build_object('pollution_resist', 0.20)),

  ('归档员', '热衷捡碎片;残片掉率提升。', 'normal',
   0, 0, 5, jsonb_build_object('fragment_drop_bonus', 0.15)),

  ('维护员', '环带结构修复出身,防御稍强。', 'normal',
   1, 4, 10, jsonb_build_object('combat_def_mult', 0.10)),

  ('斥候', '搜索 + 战斗均衡型新手友好。', 'normal',
   2, 2, 0, jsonb_build_object('search_bonus', 0.05, 'combat_dmg_mult', 0.05))
ON CONFLICT (name) DO NOTHING;


-- 3 个 legendary 职业（强力但有取舍 / 解锁专属 shop 行）
INSERT INTO classes (name, description, rarity, base_atk_bonus, base_def_bonus, base_hp_bonus, perks) VALUES
  ('Ω-段研究员',
   '曾在 Ω-段边界长期工作,Ω 窗口 +2 回合,污染抵抗显著提升;解锁 Ω-段专属装备目录。',
   'legendary',
   1, 2, 10, jsonb_build_object(
     'omega_window_bonus', 2,
     'pollution_resist', 0.35,
     'catalog_unlock_tag', 'omega_gear'
   )),

  ('PI-1 引导者',
   '专精搜索与情报。残片掉率 +25%,搜索成功率 +20%。',
   'legendary',
   2, 1, 5, jsonb_build_object(
     'search_bonus', 0.20,
     'fragment_drop_bonus', 0.25,
     'catalog_unlock_tag', 'pi_intel'
   )),

  ('伊甸协议执行者',
   '战时优势显著,伤害 +25%,防御 +20%,但污染累积加快;解锁伊甸协议装备目录。',
   'legendary',
   3, 3, 20, jsonb_build_object(
     'combat_dmg_mult', 0.25,
     'combat_def_mult', 0.20,
     'pollution_resist', -0.15,
     'catalog_unlock_tag', 'eden_arsenal'
   ))
ON CONFLICT (name) DO NOTHING;

COMMIT;

-- 验证：
-- SELECT count(*), rarity FROM classes WHERE enabled=true GROUP BY rarity;
--   期望: normal=8 / legendary=3
-- SELECT name, rarity, base_atk_bonus, base_def_bonus, base_hp_bonus, jsonb_pretty(perks) FROM classes ORDER BY rarity DESC, name;
