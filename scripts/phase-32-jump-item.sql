-- ============================================================
-- Phase 32 — 时序跃迁BR「跳跃 / 深度」：item_pool.jump_charge 列 + 跃迁道具「时序跃迁器」
-- ============================================================
-- 来源: BR【跳跃/深度·后端】契约（docs/timejump-br-design.md §4 赌命三角）。
--   跃迁 = 单向阶梯：消耗一枚 jump_charge>0 道具 ⇒ player.depth += 1（封顶 JUMP_CONFIG.MAX_DEPTH）⇒
--   玩家有效阶段 effectivePhase(realPhase, depth, maxPhase) 抬高 ⇒ 读更深的禁区图 / 物资档。
--   赌命即死：跃迁后所在扇区在「新有效阶段」若为禁区，gameActions.brJump 经 persistResolutionWithPollution
--   内已调的 sweepContractionDeaths 立即致死（复用缩圈/PvP 同一死亡后果路径，不另造死亡逻辑）。
--
-- 本脚本只做 DB 侧两件事（应用层逻辑已在 constants.js / gameActions.js / roomState.js 落地）：
--   1. item_pool 加 jump_charge 列（=1 即时序跃迁器；默认 0 ⇒ 现有道具非跳跃道具，零破坏）。
--   2. 幂等插入跃迁道具「时序跃迁器」（kind=consumable, jump_charge=1, amount=1, use_mode=consume）。
--
-- 应用层契约对齐（服务端按 jump_charge>0 动态判定，不硬比 NAME）：
--   - gameActions.brJump（动作 'br_jump'）：getJumpItemNames 查 item_pool WHERE jump_charge>0 → 在背包找一件 →
--     removeInventoryItem 消耗一枚 + depth+=1 + 刷 lastJumpAt。NAME/CHARGE 的 single source of truth 在
--     constants.js JUMP_CONFIG.ITEM（NAME='时序跃迁器'·CHARGE=1，主供客户端展示/兜底；CHARGE 预留「一器多跳」）。
--   - use_mode='consume'：跃迁器**不经 useItem**（br_jump 直接消耗）；背包不给「使用」按钮，改给「跃迁」入口。
--     此处 consume 仅满足 item_pool_use_mode_check 约束（值域 consume/inspect_keep/inspect_consume），无实际 effect 链路。
--   - kind='consumable'：仅供客户端 ITEM_KIND_META 展示走「消耗品」档（💊）；生死/经济判定不依赖 kind。
--
-- 掉率范式（与体力恢复剂 BUNDLE 区别）：
--   - 跃迁器一份 = 1 个（无 BUNDLE_COUNT，一搜一个用一次）；搜索产出走默认 push 1 件，无需特判。
--   - amount=1（比恢复剂 amount=3 低 ⇒ 搜索权重更低）+ 较窄 chamber_template_ids（13 个，比恢复剂 21 个稀）
--     ⇒ 自然 moderate 偏稀：搜到跃迁器是「有张力的运气事件」，匹配赌命设计。
--   - 继承闭环：杀跃迁者 → 尸体含其携带的跃迁器（在 inventory）→ 现有 corpse-loot（buildCorpseLootOptions
--     把 owner.inventory 列为可拾）即继承，无新代码。
--
-- 幂等 / 向后兼容:
--   - ADD COLUMN IF NOT EXISTS + DEFAULT 0 ⇒ 现有所有道具 jump_charge=0 ⇒ 非跳跃道具，零破坏。
--   - INSERT ... WHERE NOT EXISTS(by name) ⇒ 重复执行不重复插入。
--   - chamber_template_ids 选 13 个可搜模板（避开 exit 3/13、milestone 18/24），跨区域分布偏稀。
--   - 不部署：本文件只写不跑，由主代理审后部署（参考既有 scripts/phase-25r-stamina-economy.sql 模式）。
--
-- 验证（部署后）:
--   SELECT name, kind, jump_charge, use_mode, amount, array_length(chamber_template_ids,1) AS n_templates
--     FROM item_pool WHERE name = '时序跃迁器';
--   -- 期望: consumable / 1 / consume / 1 / 13
--   SELECT count(*) AS items_with_jump FROM item_pool WHERE jump_charge > 0;  -- 期望 >= 1
-- ============================================================

BEGIN;

-- 1. 新列：跃迁道具的跃迁充能（默认 0 ⇒ 现有道具零影响）
ALTER TABLE item_pool
  ADD COLUMN IF NOT EXISTS jump_charge INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN item_pool.jump_charge IS
  'Phase 32 — 时序跃迁充能（=1 即时序跃迁器；默认 0=非跳跃道具）。gameActions.brJump 消耗一个 jump_charge>0 道具使 player.depth += 1（不经 useItem，直接消耗）。';

-- 2. 跃迁道具「时序跃迁器」（幂等 by name；kind=consumable；不回 HP/体力，只承载 jump_charge=1）
--    amount=1（偏稀）+ use_mode=consume（满足 CHECK 约束；实际由 br_jump 直接消耗，不走 useItem effect 链）。
INSERT INTO item_pool (
  name, kind, sub_kind,
  atk, def, heal, effect, amount,
  stamina_restore, jump_charge, use_mode,
  description, chamber_template_ids
)
SELECT
  '时序跃迁器', 'consumable', NULL,
  0, 0, 0, 0, 1,
  0, 1, 'consume',
  '一枚不稳定的时序锚点。激活可使你的认知向更深的时间层跃迁一阶——更深处往往埋着更好的余烬，但也更可能正在坍缩。不可逆。',
  ARRAY[1,2,5,6,7,9,11,12,15,17,20,22,23]::int[]
WHERE NOT EXISTS (
  SELECT 1 FROM item_pool WHERE name = '时序跃迁器'
);

COMMIT;
