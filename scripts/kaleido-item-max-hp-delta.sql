-- ─────────────────────────────────────────────────────────────────
-- KALEIDO · item_pool.max_hp_delta 承载列（🧭 裁决 a · 2026-07-22 · 🔧）
-- ─────────────────────────────────────────────────────────────────
-- 背景：⚙️ 的「扩容件」(+15 maxHp) 因引擎无 maxHpDelta 钩子被 held，导致 08 §4 战力预算少 +30hp
--   → prepared 档实际 hp100(非 130) → seq5 boss 偏硬、通关率掉出 08 §2 定稿曲线。
--   Kanata 裁 (a)：补钩子。本迁移 = 钩子的**承载列**。
--
-- 列名裁定（🔧·⚙️ 在 scripts/kaleido-d6-economy-content.sql:20 等此确认）：**`max_hp_delta`**
--   理由：本值是**扁平增量、不走公式**（同 `stamina_restore` 家族），与 `heal`/`atk`/`def`
--   （各自驱动一条 *_formula）不同族；且 item 行上的裸 `max_hp` 会被误读成「道具自身的 hp」。
--   引擎侧字段名 `maxHpDelta` 与之 1:1（gameEngine.js calcItemEffect）。
--
-- 安全性：纯加列 + NOT NULL DEFAULT 0 ⇒ 存量行全部取 0 ⇒ `calcItemEffect` 的
--   `Number(item.max_hp_delta) || 0` 恒 0 ⇒ **多人局与存量道具逐字节零行为变化**。
--   引擎读法是防御式的（列不存在也回落 0），故本迁移与引擎上线**无先后依赖**。
-- 幂等：可重复执行。
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE item_pool ADD COLUMN IF NOT EXISTS max_hp_delta INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN item_pool.max_hp_delta IS
  '使用该道具永久抬高的 HP 上限（同量补 hp）。0=无此效果。引擎：calcItemEffect → resolveUseItemAction。';

-- 验证：
--   SELECT column_name, data_type, column_default, is_nullable
--     FROM information_schema.columns WHERE table_name='item_pool' AND column_name='max_hp_delta';
--   SELECT count(*) FROM item_pool WHERE max_hp_delta <> 0;  -- 迁移后应为 0（⚙️ 补丁前）
--
-- ⚙️ 后续（本文件不含·归 ⚙️ 的经济批）：
--   UPDATE item_pool SET max_hp_delta = 15 WHERE name = '扩容件';
