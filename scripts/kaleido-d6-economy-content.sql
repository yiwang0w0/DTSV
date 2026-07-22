-- ─────────────────────────────────────────────────────────────────
-- KALEIDO D6 经济内容(⚙️ KP1-G ③④⑤ · 全量第 1 棒 · doc 10 §6.1)
-- ─────────────────────────────────────────────────────────────────
-- 设计:09-d6-economy.md §2/§4;命名:📖 `docs/narrative/kaleido-n5-economy-naming.md`。
-- ⚠ 状态:**定稿待审 · 未执行**(铁律:SQL 先审后跑)。执行链(doc 10 §6.1):**本批 → cadence SQL → seq3-5 SQL**。
--
-- 本批内容(kaleido 专属新行·多人行原样不动·id13-18 不复用):
--   ① 6 散件材料:碎块/卡扣/线圈/垫片/管段/芯子(kind='material')
--   ② 持久强化件:加力件(+2atk)/加防件(+2def) —— useItem 永久改属性(gameActions.js:2321/2326 核实)
--   ③ 消耗剂:修补剂(heal30)/大补剂(heal60)/顶力剂(burst)/撑住剂(def+5·3T)
--   ④ kaleido 尺度 buff 行 2 条(顶力/撑住)—— 经 item_pool.on_use_buff_ids → calcItemEffect(:139)→ applyBuff(:2331)
--   ⑤ 合成配方 4 条(📖 co-align 语义对齐,见下)
--
-- 📖 co-align(材料气质 ↔ 产物语义·N5 §3):
--   碎块(硬/结构)→ 加力件 · 卡扣(连接/扣紧)→ 加防件 · **线圈(蓄劲/绷着)→ 顶力剂(burst)** · **垫片(软/缓冲)→ 撑住剂(减伤)**
--   ——不让软垫拼出爆发一击。管段(通道)/芯子(核心)预留给扩容件(见下 held)。
--
-- ⏸ **held(依赖未落·不在本批)**:**扩容件(+15 maxHp)+ 其配方(管段+芯子)**。
--   核实(2026-07-22 grep):`maxHpDelta` 全仓**仍无实现**(resolveUseItemAction 只改 atk/def/hp)。
--   ⚠ 连带影响:08 §4 战力预算的 **+30hp 分量当前拿不到** → prepared 档实为 atk16/def9/**hp100**(非 hp130)
--   → boss 260/34/8 会比 08 §2 曲线更硬。**待 🧭 定**:(a) 🔧 补 maxHpDelta 后我补这两行,或 (b) 我按无 hp 路径重调 boss/经济。
--
-- ⚠ 材料 kind='material'(kaleido 新 kind):craft_btn 判据(🔧)+ admin/ITEM_KIND_META(🎨)须认此 kind。
-- 幂等:按 name 删旧再插(kaleido 新名不与多人行撞)。引用一律同事务内 name 子查询解析(重跑 id 变但内部引用一致)。
-- ─────────────────────────────────────────────────────────────────

BEGIN;

-- ── 幂等清理(ingredient → recipe → item → buff;均按 kaleido 新 name)──
DELETE FROM item_recipe_ingredients WHERE recipe_id IN (
  SELECT id FROM item_recipes WHERE name IN ('合成·加力件', '合成·加防件', '合成·顶力剂', '合成·撑住剂')
);
DELETE FROM item_recipes WHERE name IN ('合成·加力件', '合成·加防件', '合成·顶力剂', '合成·撑住剂');
DELETE FROM item_pool WHERE name IN (
  '加力件', '加防件', '修补剂', '大补剂', '顶力剂', '撑住剂',
  '碎块', '卡扣', '线圈', '垫片', '管段', '芯子'
);
DELETE FROM buff_pool WHERE name IN ('顶力', '撑住');

-- ── ④ kaleido 尺度 buff(2 条·供战术剂;多人 buff 行原样不动)──
--   顶力:atk +10 · 1 回合(对基线 atk10 玩家 ≈ 本回合出力翻倍 = "顶到头");撑住:def +5 · 3 回合。
INSERT INTO buff_pool (name, icon, description, type, target, effect_formula, value, duration, max_stack, is_debuff) VALUES
  ('顶力', '💥', '这一下,出力顶到头。',       'stat', 'atk', 'value', 10, 1, 1, false),
  ('撑住', '🛡️', '撑住几下,之后自己散。',     'stat', 'def', 'value',  5, 3, 1, false);

-- ── ② 持久强化件 + ③ 消耗剂(kind=consumable·use_mode=consume)──
--   加力/加防:atk/def 字段 → useItem **永久**加(:2321/2326)。修补/大补:heal → hpDelta。
INSERT INTO item_pool (name, kind, use_mode, atk, def, heal, description, chamber_template_ids) VALUES
  ('加力件', 'consumable', 'consume', 2, 0, 0,  '装上，出手更重一点。',   '{}'),
  ('加防件', 'consumable', 'consume', 0, 2, 0,  '装上，挨打时少疼一点。', '{}'),
  ('修补剂', 'consumable', 'consume', 0, 0, 30, '糊上，缝就合一阵。',     '{}'),
  ('大补剂', 'consumable', 'consume', 0, 0, 60, '一大管。糊得更实。',     '{}');

-- 战术剂:效果走 on_use_buff_ids → newBuffIds → applyBuff(非 atk/def 永久字段)
INSERT INTO item_pool (name, kind, use_mode, description, chamber_template_ids, on_use_buff_ids) VALUES
  ('顶力剂', 'consumable', 'consume', '把出力顶到头。这一下重，完了就泄。', '{}',
    ARRAY[(SELECT id FROM buff_pool WHERE name='顶力')]),
  ('撑住剂', 'consumable', 'consume', '撑住几下。之后自己散。',             '{}',
    ARRAY[(SELECT id FROM buff_pool WHERE name='撑住')]);

-- ── ① 材料 6 散件(kind='material'·全新 kaleido 名·不复用多人 id13-18)──
INSERT INTO item_pool (name, kind, use_mode, description, chamber_template_ids) VALUES
  ('碎块', 'material', 'consume', '从散架的地方掉下来的。硬。',   '{}'),
  ('卡扣', 'material', 'consume', '能扣住两样东西。',             '{}'),
  ('线圈', 'material', 'consume', '缠了一圈的。',                 '{}'),
  ('垫片', 'material', 'consume', '软的一片，夹在中间垫。',       '{}'),
  ('管段', 'material', 'consume', '一截空心的。接得上。',         '{}'),
  ('芯子', 'material', 'consume', '最中间那颗。别的都绕着它。',   '{}');

-- ── ⑤ 合成配方 4 条(enabled=false 惰性·随种子关点亮;📖 co-align 语义对齐)──
INSERT INTO item_recipes (name, result_item_id, result_qty, success_rate, fail_behavior, enabled, description) VALUES
  ('合成·加力件', (SELECT id FROM item_pool WHERE name='加力件'), 1, 1.0, 'lose_materials', false, '碎块拼一拼，出手更重。'),
  ('合成·加防件', (SELECT id FROM item_pool WHERE name='加防件'), 1, 1.0, 'lose_materials', false, '卡扣扣一圈，挨打少疼。'),
  ('合成·顶力剂', (SELECT id FROM item_pool WHERE name='顶力剂'), 1, 0.8, 'lose_materials', false, '线圈绷紧，攒一下劲。'),
  ('合成·撑住剂', (SELECT id FROM item_pool WHERE name='撑住剂'), 1, 0.9, 'lose_materials', false, '垫片叠起来，垫着挨。');

INSERT INTO item_recipe_ingredients (recipe_id, item_id, quantity, is_consumed) VALUES
  ((SELECT id FROM item_recipes WHERE name='合成·加力件'), (SELECT id FROM item_pool WHERE name='碎块'), 2, true),
  ((SELECT id FROM item_recipes WHERE name='合成·加防件'), (SELECT id FROM item_pool WHERE name='卡扣'), 2, true),
  ((SELECT id FROM item_recipes WHERE name='合成·顶力剂'), (SELECT id FROM item_pool WHERE name='线圈'), 2, true),  -- 蓄劲→爆发 ✓
  ((SELECT id FROM item_recipes WHERE name='合成·撑住剂'), (SELECT id FROM item_pool WHERE name='垫片'), 2, true);  -- 软→减伤 ✓

-- 验证(审阅时手跑):
-- SELECT id,name,kind,atk,def,heal,on_use_buff_ids FROM item_pool
--   WHERE name IN ('加力件','加防件','修补剂','大补剂','顶力剂','撑住剂','碎块','卡扣','线圈','垫片','管段','芯子') ORDER BY id;
-- SELECT r.name, i.name AS material, ri.quantity FROM item_recipes r
--   JOIN item_recipe_ingredients ri ON ri.recipe_id=r.id JOIN item_pool i ON i.id=ri.item_id
--   WHERE r.name LIKE '合成·%' ORDER BY r.name;
-- SELECT id,name,type,target,value,duration FROM buff_pool WHERE name IN ('顶力','撑住');

COMMIT;
