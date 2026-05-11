-- ============================================================
-- Phase 20.1 — fragment_pool 加 unlocks_rules JSONB
-- ============================================================
-- 目标：让残片解码到 level 3 后，能反向影响下次 raid 的 chamber 抽取
--      权重、可解锁的 lore 短句池、可生成的 NPC、物品掉落数量。
--
-- unlocks_rules JSON 结构：
-- {
--   "chamber_weight": { "<template_id>": <delta_int> },   -- 加权差量
--   "lore_chunk_pool": [ "<short_chunk_text>", ... ],     -- 可注入 chamber 描述的短句
--   "npc_unlock": [ <npc_id>, ... ],                      -- 解锁可生成的 NPC
--   "item_amount_delta": { "<item_name>": <delta_int> }   -- 物品掉落 amount 加成
-- }
--
-- 触发条件：玩家在该残片上达到 decode_level = 3 (完全解码)
-- 合并时机：joinRoom 生成 raidPath 之前，扫所有 decode_level=3 的残片
-- ============================================================

-- ── 1. 加列 ──
ALTER TABLE fragment_pool
  ADD COLUMN IF NOT EXISTS unlocks_rules JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ── 2. 注释（数据字典） ──
COMMENT ON COLUMN fragment_pool.unlocks_rules IS
  '残片完全解码（level 3）后的解锁规则。结构：
   { chamber_weight: { template_id: delta },
     lore_chunk_pool: [text],
     npc_unlock: [npc_id],
     item_amount_delta: { item_name: delta } }
   joinRoom 生成 raidPath 时合并所有 decode_level=3 残片的规则。';

-- ── 3. 示例填充：3 个种子规则（仅插入 unlocks_rules 字段，不动其他） ──
-- 解锁规则演示：选 3 个 rarity=legendary 或 omega 类的残片，赋予示例规则
-- 让管理员 / 玩家有个参考样本可看到效果

-- 示例 1：Ω-段相关残片 → 提升 Ω-段核心接口的 chamber 抽取概率
UPDATE fragment_pool
SET unlocks_rules = jsonb_build_object(
  'chamber_weight', jsonb_build_object(),
  'lore_chunk_pool', jsonb_build_array(
    '【Ω-观测残片】频率残响在结构边界震荡，似乎正在重构。',
    '【Ω-观测残片】回声内含 17.3Hz 节律，与已知协议不一致。'
  ),
  'npc_unlock', jsonb_build_array(),
  'item_amount_delta', jsonb_build_object()
)
WHERE category = 'omega' AND rarity IN ('rare', 'legendary')
  AND unlocks_rules = '{}'::jsonb;

-- 示例 2：伊甸协议残片 → 解锁 lore 短句池
UPDATE fragment_pool
SET unlocks_rules = jsonb_build_object(
  'chamber_weight', jsonb_build_object(),
  'lore_chunk_pool', jsonb_build_array(
    '【伊甸协议残片】协议 §0011 的删除条目仍残留在缓存中。',
    '【伊甸协议残片】这一段港务规章被反复改写过 7 次。'
  ),
  'npc_unlock', jsonb_build_array(),
  'item_amount_delta', jsonb_build_object()
)
WHERE category = 'eden' AND rarity IN ('rare', 'legendary')
  AND unlocks_rules = '{}'::jsonb;

-- 示例 3：气泡宇宙残片 → 物品掉落加成
UPDATE fragment_pool
SET unlocks_rules = jsonb_build_object(
  'chamber_weight', jsonb_build_object(),
  'lore_chunk_pool', jsonb_build_array(
    '【气泡宇宙残片】这一区域的因果连续性出现了 5% 偏差。'
  ),
  'npc_unlock', jsonb_build_array(),
  'item_amount_delta', jsonb_build_object(
    '结构碎片', 1,
    'Ω物质', 1
  )
)
WHERE category = 'bubble' AND rarity IN ('rare', 'legendary')
  AND unlocks_rules = '{}'::jsonb;

-- ── 4. 验证查询 ──
-- SELECT name, category, rarity, jsonb_pretty(unlocks_rules) FROM fragment_pool
-- WHERE unlocks_rules != '{}'::jsonb LIMIT 5;
--
-- SELECT count(*), count(*) FILTER (WHERE unlocks_rules != '{}'::jsonb) AS with_rules
-- FROM fragment_pool;
