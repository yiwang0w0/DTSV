-- ─────────────────────────────────────────────────────────────────
-- KALEIDO D6 经济内容(⚙️ KP1-G ③④⑤ · kaleido 专属 item_pool 行 + 合成配方)
-- ─────────────────────────────────────────────────────────────────
-- 设计:09-d6-economy.md §2/§4;命名:📖 docs/narrative/kaleido-n5-economy-naming.md。
-- ⚠ 状态:**未执行 · 待 🧭/🔒 审后经 postgres MCP 执行**(铁律:SQL 先审后跑)。
-- 🧭「四件合一批」中的**可建三件**(本批):①kaleido 道具行 ②材料 6 散件 ③合成配方。
--   ④event_deck 回指(seq1/2/4 deck 改指新 id + weight)→ **单拎**:依赖 🔧 内容注入消费器的 weighted-pick 口径
--     (weight→掉率映射未定),消费器落地后一版修订。目标掉率见 09 §6.2(seq2 0.09/seq3 0.30/seq4 0.48/材料 0.30/恢复 0.20)。
-- 🧭 拎出(依赖未落·不入本批):
--   · 扩容件(+15maxHp):需 🔧 maxHpDelta 新字段 + 引擎钩子(resolveUseItemAction 现只改 atk/def/hp)。
--   · 顶力剂(burst)/撑住剂(def+5×3T):需 buff_pool 行 + kaleido 战斗 buff 集成(on_use_buff_ids 通路)。
-- 机制核实(gameActions.js:2321/2326):consumable 的 atk/def 字段 useItem 时**永久**改玩家属性(非计时 buff);
--   heal→hpDelta;staminaDelta 在 kaleido 被跳过(:2308)。∴ 加力/加防/修补/大补 现成可用。
-- ⚠ 材料 kind='material'(kaleido 新 kind):craft_btn 判据(🔧)+ admin/ITEM_KIND_META(🎨)须认此 kind;
--   若 🧭/🔧 偏好复用现有材料 kind(tech_fragment 等)审时改一处即可。
-- 幂等:按 name 删旧再插(kaleido 新名不与多人行撞;多人 id13-18 原样不动)。
-- 引用一律 ID:配方 result_item_id / ingredient item_id 均**同事务内按 name 子查询解析**(重跑 id 变但内部引用一致)。
-- ─────────────────────────────────────────────────────────────────

BEGIN;

-- ── 幂等清理(先删配方 ingredient → 配方 → 道具/材料;均按 kaleido 新 name)──
DELETE FROM item_recipe_ingredients WHERE recipe_id IN (
  SELECT id FROM item_recipes WHERE name IN ('合成·加力件', '合成·加防件')
);
DELETE FROM item_recipes WHERE name IN ('合成·加力件', '合成·加防件');
DELETE FROM item_pool WHERE name IN (
  '加力件', '加防件', '修补剂', '大补剂',
  '碎块', '卡扣', '线圈', '垫片', '管段', '芯子'
);

-- ── ① kaleido 道具行(持久强化件 + 消耗剂;kind=consumable·use_mode=consume)──
--   持久件:atk/def 字段 → useItem 永久加(:2321/2326)。恢复剂:heal 字段 → hpDelta。
INSERT INTO item_pool (name, kind, use_mode, atk, def, heal, description, chamber_template_ids) VALUES
  ('加力件', 'consumable', 'consume', 2, 0, 0,  '装上，出手更重一点。',       '{}'),
  ('加防件', 'consumable', 'consume', 0, 2, 0,  '装上，挨打时少疼一点。',     '{}'),
  ('修补剂', 'consumable', 'consume', 0, 0, 30, '糊上，缝就合一阵。',         '{}'),
  ('大补剂', 'consumable', 'consume', 0, 0, 60, '一大管。糊得更实。',         '{}');

-- ── ② 材料 6 散件(kind='material'·全新 kaleido 名·不复用多人 id13-18)──
INSERT INTO item_pool (name, kind, use_mode, description, chamber_template_ids) VALUES
  ('碎块', 'material', 'consume', '从散架的地方掉下来的。硬。',       '{}'),
  ('卡扣', 'material', 'consume', '能扣住两样东西。',                 '{}'),
  ('线圈', 'material', 'consume', '缠了一圈的。',                     '{}'),
  ('垫片', 'material', 'consume', '软的一片，夹在中间垫。',           '{}'),
  ('管段', 'material', 'consume', '一截空心的。接得上。',             '{}'),
  ('芯子', 'material', 'consume', '最中间那颗。别的都绕着它。',       '{}');

-- ── ③ 合成配方(可建两条·📖 co-align:硬/连接 碎块/卡扣 → 强化件)──
--   enabled=false 惰性(与种子关同步·点亮待 🔧 消费器 + 🧭 终审);待钩子的扩容/顶力/撑住配方不入本批。
INSERT INTO item_recipes (name, result_item_id, result_qty, success_rate, fail_behavior, enabled, description) VALUES
  ('合成·加力件', (SELECT id FROM item_pool WHERE name='加力件'), 1, 1.0, 'lose_materials', false, '碎块拼一拼，出手更重。'),
  ('合成·加防件', (SELECT id FROM item_pool WHERE name='加防件'), 1, 1.0, 'lose_materials', false, '卡扣扣一圈，挨打少疼。');

INSERT INTO item_recipe_ingredients (recipe_id, item_id, quantity, is_consumed) VALUES
  ((SELECT id FROM item_recipes WHERE name='合成·加力件'), (SELECT id FROM item_pool WHERE name='碎块'), 2, true),
  ((SELECT id FROM item_recipes WHERE name='合成·加防件'), (SELECT id FROM item_pool WHERE name='卡扣'), 2, true);

-- 验证(审阅时手跑):
-- SELECT id,name,kind,atk,def,heal FROM item_pool WHERE name IN ('加力件','加防件','修补剂','大补剂','碎块','卡扣','线圈','垫片','管段','芯子') ORDER BY id;
-- SELECT r.name, ri.item_id, ri.quantity FROM item_recipes r JOIN item_recipe_ingredients ri ON ri.recipe_id=r.id WHERE r.name LIKE '合成·%';

COMMIT;
