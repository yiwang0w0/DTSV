-- ============================================================
-- KALEIDO D6 · 加力件/加防件 复活补丁(atk_delta / def_delta 补值)
-- ⚙️ 游戏性轨 · 2026-07-22 · 幂等(可重复执行)
-- ============================================================
--
-- 【问题】id32 加力件 / id33 加防件 写在 atk/def 列上,但 calcItemEffect
--   对这两列做 kind 闸门:atkDelta 仅当 kind='weapon'(gameEngine.js:125)、
--   defDelta 仅当 kind='armor'(:134)。两者 kind='consumable' ⟹ 恒返回 0,
--   被静默消耗。(同一类 bug 的 maxHp 版本已由扩容件补丁修掉。)
--
-- 【修法】改写到 kind 无关的新列 atk_delta / def_delta:
--   gameEngine.js:149-150  result.atkDelta += Number(item.atk_delta) || 0   ← 产出端
--                          result.defDelta += Number(item.def_delta) || 0
--   gameActions.js:2461-2468  nextPlayer.atk/def += result.atkDelta/defDelta ← 应用端
--   ✅ 产出端与应用端都已核实(上次只核实了一端,正是那次的教训)。
--
-- 【🧭 附的两个条件】
--   ① 写新列的同时把旧 atk/def 归零 —— 否则同一效果值挂两处,日后 kind
--      一改(比如 加力件 改成 weapon)就会双倍生效。
--   ② id24 结构强化液(consumable · def=50)一律不动 —— 它是遗留行、
--      当前同样惰性;是否复活/归零由 🧭 另行裁定,本补丁不碰。
--
-- 【效果值】沿用 09-d6-economy.md 已标定值:加力件 ATK+2 / 加防件 DEF+2(永久)
-- ============================================================

BEGIN;

-- 前置:列存在性(🔧 已于 ff81a26 建列,此处仅作防御)
ALTER TABLE item_pool ADD COLUMN IF NOT EXISTS atk_delta INTEGER NOT NULL DEFAULT 0;
ALTER TABLE item_pool ADD COLUMN IF NOT EXISTS def_delta INTEGER NOT NULL DEFAULT 0;

-- id32 加力件:ATK +2 永久
UPDATE item_pool
SET atk_delta = 2,
    atk       = 0   -- 条件①:旧列归零,避免 kind 变更后双倍生效
WHERE id = 32 AND name = '加力件';

-- id33 加防件:DEF +2 永久
UPDATE item_pool
SET def_delta = 2,
    def       = 0   -- 条件①
WHERE id = 33 AND name = '加防件';

-- 条件②:id24 结构强化液 不在本补丁范围内,刻意不写 UPDATE。

COMMIT;

-- ============================================================
-- 验证(应得:32 → atk=0/atk_delta=2;33 → def=0/def_delta=2;24 原样 def=50)
-- ============================================================
-- SELECT id, name, kind, atk, def, atk_delta, def_delta
-- FROM item_pool WHERE id IN (24, 32, 33) ORDER BY id;
--
-- 全库复查:除 id24 外不应再有任何行把效果值挂在裸 atk/def 上
-- SELECT id, name, kind, atk, def FROM item_pool
-- WHERE (atk <> 0 OR def <> 0) AND kind NOT IN ('weapon', 'armor');
