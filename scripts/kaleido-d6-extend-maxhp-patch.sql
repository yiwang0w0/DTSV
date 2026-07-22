-- ─────────────────────────────────────────────────────────────────
-- KALEIDO D6 扩容件效果值补丁(⚙️ · 解 held · 一行)
-- ─────────────────────────────────────────────────────────────────
-- 背景:`kaleido-d6-economy-content.sql` 已执行(13 道具行 + 5 配方/6 ingredient 行 + 2 buff 入库),
--   其中「扩容件」行与配方(管段×1+芯子×1)已在,**唯效果值当时无承载列**。
-- 🔧 已裁定并建列:**`item_pool.max_hp_delta`**(NOT NULL DEFAULT 0·幂等·`scripts/kaleido-item-max-hp-delta.sql`);
--   引擎钩子已落地:`calcItemEffect` 产 maxHpDelta → `resolveUseItemAction` **maxHp 与 hp 同量抬**
--   (守卫:抬升排在治疗**之后**、`alive` 门)—— 与 09 §2.1「+15 maxHp(并补满 15)」逐字一致 ✓
-- 本补丁 = 剩余唯一动作。**独立文件**(不改已执行的 content SQL,避免为一行 UPDATE 重跑整批而churn 道具 id)。
-- ⚠ 状态:**未执行 · 待 🧭 审后执行**。幂等:按 name 的 UPDATE,可重复跑。
-- 效果:08 §4 的 **+30hp 分量到位**(2 件 × +15)→ prepared 回 atk16/def9/**hp130**
--   → **seq5 boss 260/34/8 维持 08 §2 原曲线(prepared 74-86%)**,平衡定稿一个数不动。
-- ─────────────────────────────────────────────────────────────────

BEGIN;

UPDATE item_pool SET max_hp_delta = 15 WHERE name = '扩容件';

-- 验证(执行后手跑):
-- ① 目标行生效:期望 1 行 · max_hp_delta=15
--    SELECT id, name, max_hp_delta FROM item_pool WHERE name = '扩容件';
-- ② 多人中性自证:全表非零行**应恰为 1**(仅扩容件)——存量多人行全 0,不进该引擎分支
--    SELECT count(*) AS nonzero_rows FROM item_pool WHERE max_hp_delta <> 0;   -- 期望 1

COMMIT;
