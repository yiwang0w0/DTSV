-- ═══════════════════════════════════════════════════════════════════
-- 远星函馆 Phase 8.1 — NPC schema 重构 + 实体种子数据
-- ═══════════════════════════════════════════════════════════════════
-- 变更：
--   1. ALTER npc_pool: 添加 7 个新字段（spec §5.2）
--   2. DELETE FROM npc_pool（旧 NPC 与世界观不符）
--   3. INSERT 4 类实体的种子 NPC

ALTER TABLE npc_pool
  ADD COLUMN IF NOT EXISTS entity_type        TEXT,
  ADD COLUMN IF NOT EXISTS hostile            BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS tradeable          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS trade_wants        JSONB,
  ADD COLUMN IF NOT EXISTS trade_offers       JSONB,
  ADD COLUMN IF NOT EXISTS pollution_on_kill  INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS spawn_weight       NUMERIC NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS min_pollution      INTEGER NOT NULL DEFAULT 0;

DELETE FROM npc_pool;

-- ── remnant（残响实体，敌对，主动搜查） ─────────────────────
INSERT INTO npc_pool (name, hp, atk, def, exp, level, maps,
                      entity_type, hostile, pollution_on_kill, spawn_weight, min_pollution)
VALUES
  ('残响低语', 35, 8, 4, 12, 'easy',   '[1,2]'::jsonb,        'remnant', TRUE, 4, 1.0, 0),
  ('裂解残影', 60, 14, 6, 20, 'medium', '[2,3]'::jsonb,       'remnant', TRUE, 5, 0.9, 30),
  ('泡层主权', 120, 22, 12, 50, 'hard', '[3,4]'::jsonb,       'remnant', TRUE, 8, 0.7, 60),
  ('Ω-段守望者', 200, 30, 18, 100, 'boss', '[4]'::jsonb,      'remnant', TRUE, 12, 0.4, 80);

-- ── infiltrator（伪装入侵者，敌对，隐蔽攻击） ───────────────
INSERT INTO npc_pool (name, hp, atk, def, exp, level, maps,
                      entity_type, hostile, pollution_on_kill, spawn_weight, min_pollution)
VALUES
  ('伪装信号', 50, 18, 5, 25, 'medium', '[2,3]'::jsonb,        'infiltrator', TRUE, 6, 0.6, 40),
  ('伪造编号-7', 90, 25, 10, 45, 'hard', '[3,4]'::jsonb,       'infiltrator', TRUE, 8, 0.4, 65);

-- ── symbiote（共生实体，非敌对，可交易） ────────────────────
INSERT INTO npc_pool (name, hp, atk, def, exp, level, maps,
                      entity_type, hostile, tradeable, trade_wants, trade_offers,
                      pollution_on_kill, spawn_weight, min_pollution)
VALUES
  ('共生节点-α', 80, 5, 8, 0, 'medium', '[2,3]'::jsonb,
   'symbiote', FALSE, TRUE,
   '{"item":"环段部件","qty":1}'::jsonb,
   '{"item":"Ω物质","qty":1}'::jsonb,
   2, 0.5, 50),
  ('共生节点-β', 100, 6, 10, 0, 'hard', '[3,4]'::jsonb,
   'symbiote', FALSE, TRUE,
   '{"item":"环段部件","qty":2}'::jsonb,
   '{"item":"Ω物质","qty":3}'::jsonb,
   2, 0.4, 70);

-- ── observer（观察实体，非敌对，交易技术碎片） ──────────────
INSERT INTO npc_pool (name, hp, atk, def, exp, level, maps,
                      entity_type, hostile, tradeable, trade_wants, trade_offers,
                      pollution_on_kill, spawn_weight, min_pollution)
VALUES
  ('观察者-Ι', 60, 4, 6, 0, 'medium', '[3,4]'::jsonb,
   'observer', FALSE, TRUE,
   '{"item":"结构碎片","qty":1}'::jsonb,
   '{"item":"深界情报","qty":1}'::jsonb,
   1, 0.4, 60),
  ('观察者-Ω', 80, 5, 8, 0, 'hard', '[4]'::jsonb,
   'observer', FALSE, TRUE,
   '{"item":"结构碎片","qty":2}'::jsonb,
   '{"item":"深界情报","qty":2}'::jsonb,
   1, 0.3, 80);

-- 验证
SELECT entity_type, COUNT(*) AS count, AVG(hp)::INT AS avg_hp
  FROM npc_pool
 GROUP BY entity_type
 ORDER BY entity_type;
