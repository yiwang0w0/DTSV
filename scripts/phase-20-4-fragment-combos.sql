-- ============================================================
-- Phase 20.4 — fragment_combos：A + B → C 残片合成解锁
-- ============================================================
-- 规则：玩家完全解码（decode_level=3）A 和 B 残片 → 自动解锁残片 C
--      （在玩家档案里以 decode_level=0 出现，需要继续 raid 来推进解码）
--
-- 表结构：
--   fragment_id_a    int — 输入残片 A
--   fragment_id_b    int — 输入残片 B（与 A 可同一个 ID，表示自合成场景）
--   unlocks_fragment int — 输出解锁的残片 C
--   description     text — 合成叙事文案
--   enabled         bool — 启用开关
--
-- 触发时机：玩家 decode 残片到 level 3 完成时，扫所有 combos 检查是否满足
-- ============================================================

CREATE TABLE IF NOT EXISTS fragment_combos (
  id                 BIGSERIAL PRIMARY KEY,
  fragment_id_a      INTEGER NOT NULL,
  fragment_id_b      INTEGER NOT NULL,
  unlocks_fragment   INTEGER NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  enabled            BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fragment_combos_unique UNIQUE (fragment_id_a, fragment_id_b, unlocks_fragment),
  CONSTRAINT fragment_combos_ne CHECK (fragment_id_a != unlocks_fragment AND fragment_id_b != unlocks_fragment)
);

CREATE INDEX IF NOT EXISTS fragment_combos_lookup_idx
  ON fragment_combos(fragment_id_a, fragment_id_b)
  WHERE enabled = true;

-- 反向索引：根据 unlocks_fragment 查所有解锁路径（知识图谱用）
CREATE INDEX IF NOT EXISTS fragment_combos_target_idx
  ON fragment_combos(unlocks_fragment)
  WHERE enabled = true;

COMMENT ON TABLE fragment_combos IS
  '残片合成解锁配方表。玩家 decode_level=3 A 和 B → 自动 unlock C（C 以 decode_level=0 出现在 player_fragments）。';

COMMENT ON COLUMN fragment_combos.fragment_id_a IS '输入残片 A（已完全解码）';
COMMENT ON COLUMN fragment_combos.fragment_id_b IS '输入残片 B（已完全解码，可与 A 不同）';
COMMENT ON COLUMN fragment_combos.unlocks_fragment IS '输出残片 C（自动解锁，初始 decode_level=0）';
COMMENT ON COLUMN fragment_combos.description IS '合成叙事文案（在 Archive 知识图谱里展示）';

-- RLS：暂不启用（与 fragment_pool 一致）

-- 验证：
-- SELECT count(*) FROM fragment_combos;
-- SELECT c.*, fa.name AS a_name, fb.name AS b_name, fc.name AS c_name
-- FROM fragment_combos c
-- JOIN fragment_pool fa ON fa.id = c.fragment_id_a
-- JOIN fragment_pool fb ON fb.id = c.fragment_id_b
-- JOIN fragment_pool fc ON fc.id = c.unlocks_fragment
-- WHERE c.enabled = true;
