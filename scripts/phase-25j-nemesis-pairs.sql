-- ============================================================
-- Phase 25j — Nemesis 重复遭遇升级（probe_encounter_pairs）
-- ============================================================
-- 来源 finding: research-2026-05-28-E P1
-- "同对 30 日 ≥3 次遭遇 → 标记 nemesis，遭遇 UI 显示 banner + 双方'宿敌再次相遇'通知。"
-- USPTO 9539518 Nemesis 模式：把重复遭遇的噪声变成 emergent narrative。
-- 与 v3 P1 aggression score 互补不冲突（那个按行为打分，这个按"同一对反复相遇"成对升级）。
--
-- 设计:
--   1. 新建 probe_encounter_pairs(attacker_id, owner_id, encounter_count,
--      last_outcome, nemesis_since, ...) 记录"探针遭遇方 × 探针主人"成对历史。
--   2. UNIQUE(attacker_id, owner_id) → 一对玩家一行,helper 走 upsert + 计数自增。
--   3. window_started_at 锚定 30 天滚动窗口；窗口内 encounter_count >= 3 → 写 nemesis_since。
--      nemesis_since 一旦写入不再清空（宿敌关系是一个已建立的叙事里程碑）。
--   4. CHECK attacker_id <> owner_id（不能成为自己的宿敌；遭遇逻辑本就排除自己的探针）。
--
-- 匿名一致性（28-E P0）:
--   本表是服务端撮合用,存真实 user_id（与 cross_room_probes.owner_id / defeated_by 同口径）。
--   面向玩家的 UI / 通知文本必须改用 probes.js buildOwnerPseudonym 派生的稳定代号,
--   绝不直接渲染本表的 attacker_id / owner_id。
--
-- 预埋不启用:
--   仅建表 + 索引。遭遇埋点 / banner / "宿敌再次相遇" 通知由 Phase 21/24b 接入
--   （配套 src/lib/server/nemesis.js helper）。
--
-- 验证:
--   SELECT count(*) FROM probe_encounter_pairs;                          -- 0
--   SELECT count(*) FROM probe_encounter_pairs WHERE nemesis_since IS NOT NULL; -- 0
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS probe_encounter_pairs (
  id                 BIGSERIAL PRIMARY KEY,
  attacker_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encounter_count    INTEGER NOT NULL DEFAULT 0 CHECK (encounter_count >= 0),
  last_outcome       TEXT
    CHECK (last_outcome IS NULL OR last_outcome IN
      ('encountered', 'spared', 'defeated', 'killed_attacker', 'escaped')),
  last_encounter_at  TIMESTAMPTZ,
  first_encounter_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  window_started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  nemesis_since      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT probe_encounter_pairs_not_self CHECK (attacker_id <> owner_id),
  CONSTRAINT probe_encounter_pairs_unique_pair UNIQUE (attacker_id, owner_id)
);

-- 主人视角:"谁反复遇到我的探针"
CREATE INDEX IF NOT EXISTS idx_probe_pairs_owner
  ON probe_encounter_pairs(owner_id);

-- 遭遇方视角:"我反复遇到谁的探针"
CREATE INDEX IF NOT EXISTS idx_probe_pairs_attacker
  ON probe_encounter_pairs(attacker_id);

-- 活跃宿敌（banner / 通知聚合用），只索引已成宿敌的行
CREATE INDEX IF NOT EXISTS idx_probe_pairs_nemesis
  ON probe_encounter_pairs(nemesis_since)
  WHERE nemesis_since IS NOT NULL;

COMMENT ON TABLE probe_encounter_pairs IS
  'Phase 25j Nemesis 成对遭遇历史 (research-2026-05-28-E P1)。
   一对 (attacker, owner) 一行；30 天窗口内 encounter_count>=3 → nemesis_since 标记。
   服务端撮合用真实 user_id；面向玩家的 UI/通知必须改用 pseudonym。预埋不启用。';
COMMENT ON COLUMN probe_encounter_pairs.attacker_id IS '探针遭遇方（进入 chamber 遇到对方探针的玩家）';
COMMENT ON COLUMN probe_encounter_pairs.owner_id IS '探针主人';
COMMENT ON COLUMN probe_encounter_pairs.encounter_count IS '当前 30 天窗口内累计遭遇次数';
COMMENT ON COLUMN probe_encounter_pairs.last_outcome IS '最近一次遭遇结局（probes.js outcome 同词表）';
COMMENT ON COLUMN probe_encounter_pairs.window_started_at IS '30 天滚动窗口锚点；超窗则重置并把 encounter_count 归 1';
COMMENT ON COLUMN probe_encounter_pairs.nemesis_since IS '首次跨过宿敌阈值的时刻；一旦写入不清空（关系里程碑）';

COMMIT;
