-- ============================================================
-- Phase 25r — 体力经济：回复道具 + item_pool.stamina_restore 列
-- ============================================================
-- 来源: BR【体力经济后端】契约 — 把体力消耗从「只由移动」扩展为
--   move(惩罚倍率) + search/attack(平消耗) 三动作，自然回复大降
--   (REGEN_PER_SEC 4→0.5)，主回复源改为「可搜刮的体力回复道具」。
--   目标配比 ≈ 90% 靠回复道具 / ~10% 靠自然回复（可调，最终 playtest）。
--
-- 本脚本只做 DB 侧两件事（应用层逻辑已在 stamina.js / gameActions.js / gameEngine.js 落地）：
--   1. item_pool 加 stamina_restore 列（承载每次使用恢复的体力量）。
--   2. 插入体力回复道具「机能恢复剂」(consumable, stamina_restore=50)。
--
-- 应用层契约对齐（不依赖本列以外的新 schema）：
--   - calcItemEffect(gameEngine.js) 防御式读 item.stamina_restore → result.staminaDelta，
--     resolveUseItemAction(gameActions.js) consume 分支 restoreStamina(+staminaDelta) clamp 到上限。
--   - 「一份可用 6 次」= 搜索抽中时一次性 push BUNDLE_COUNT(=6) 个同名条目进 inventory
--     （库存是名字符串数组，无 per-instance charges 概念；useItem 每次消费 1 个）。
--     BUNDLE_COUNT / NAME / RESTORE 的 single source of truth 在 constants.js STAMINA_CONFIG.RECOVERY_ITEM；
--     本行 name 与 stamina_restore 必须与之严格一致（name='机能恢复剂'、stamina_restore=50）。
--
-- 幂等 / 向后兼容:
--   - ADD COLUMN IF NOT EXISTS + DEFAULT 0 ⇒ 现有所有道具 stamina_restore=0 ⇒ staminaDelta=0，零破坏。
--   - INSERT ... WHERE NOT EXISTS(by name) ⇒ 重复执行不重复插入。
--   - chamber_template_ids 覆盖 21 个可搜模板（type ∉ {exit, milestone}，即 ID 1-25 去掉 3/13/18/24），
--     使多数房可搜到回复道具（与现有 consumable 同档「moderate 掉率」amount=3）。
--   - 不部署：本文件只写不跑，由主代理审后部署（参考既有 scripts/phase-25*.sql 模式）。
--
-- 验证（部署后）:
--   SELECT name, kind, stamina_restore, use_mode, amount, array_length(chamber_template_ids,1) AS n_templates
--     FROM item_pool WHERE name = '机能恢复剂';
--   -- 期望: consumable / 50 / consume / 3 / 21
--   SELECT count(*) AS items_with_stamina FROM item_pool WHERE stamina_restore > 0;  -- 期望 >= 1
-- ============================================================

BEGIN;

-- 1. 新列：每次使用恢复的体力量（默认 0 ⇒ 现有道具零影响）
ALTER TABLE item_pool
  ADD COLUMN IF NOT EXISTS stamina_restore INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN item_pool.stamina_restore IS
  'Phase 25r — 体力回复道具每次使用恢复的体力量（默认 0=非回复道具）。calcItemEffect 读为 staminaDelta，useItem restoreStamina(+此值) clamp 到 maxStamina。';

-- 2. 体力回复道具「机能恢复剂」（幂等 by name；kind=consumable；不回 HP，只回体力）
INSERT INTO item_pool (
  name, kind, sub_kind,
  atk, def, heal, effect, amount,
  stamina_restore, use_mode,
  description, chamber_template_ids
)
SELECT
  '机能恢复剂', 'consumable', NULL,
  0, 0, 0, 0, 3,
  50, 'consume',
  '注入一剂战术机能恢复剂，瞬间恢复 50 点体力。',
  ARRAY[1,2,4,5,6,7,8,9,10,11,12,14,15,16,17,19,20,21,22,23,25]::int[]
WHERE NOT EXISTS (
  SELECT 1 FROM item_pool WHERE name = '机能恢复剂'
);

COMMIT;
