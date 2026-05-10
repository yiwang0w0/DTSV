-- ============================================================
-- Phase 16 — 单次袭击战斗模型 schema
-- ============================================================
-- 目标：从"持续 battle 状态"改为"每次搜索遭遇是一次单次袭击机会"。
--      NPC 实例池跨袭击持久化（同一只 NPC 被反复遇到时 HP 累计）。
-- ============================================================

-- ── 1. npc_pool 加战斗参数（命中率 / 反击率） ──
ALTER TABLE npc_pool
  ADD COLUMN IF NOT EXISTS accuracy     REAL DEFAULT 0.85,
  ADD COLUMN IF NOT EXISTS counter_rate REAL DEFAULT 0.30;

COMMENT ON COLUMN npc_pool.accuracy
  IS 'NPC 反击时的命中率（0-1）。若需让 NPC 反击不可避免，设 1.0';
COMMENT ON COLUMN npc_pool.counter_rate
  IS 'NPC 被攻击时触发反击的概率（0-1）。反击与玩家是否命中无关。';

-- ── 2. 全局战斗规则常量 ──
INSERT INTO game_rules (key, value, description) VALUES
  ('player_attack_accuracy', '0.85', '玩家发起攻击时的命中率（0-1）'),
  ('player_counter_rate',    '0.40', 'PvP 时被攻击玩家的反击概率（0-1）')
ON CONFLICT (key) DO NOTHING;

-- ── 验证查询 ──
-- SELECT name, hp, atk, def, accuracy, counter_rate FROM npc_pool LIMIT 5;
-- SELECT key, value FROM game_rules WHERE key IN ('player_attack_accuracy', 'player_counter_rate');
