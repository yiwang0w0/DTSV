-- ─────────────────────────────────────────────────────────────────
-- KALEIDO D6 seq1-2 cadence 回指(⚙️ · AVG 垂直切片 · doc 10 §2.2)
-- ─────────────────────────────────────────────────────────────────
-- 目的:配合 🔧 hook① 点亮,把 seq1-2 种子关 event_deck 从多人占位 id 改指 kaleido 新道具行,
--   并锁 live 浮现序:首搜 → [log_panel, inventory, hp_bar]、首物(seq1)先于首遇(seq2)。
--   研究依据:research-avg-disclosure-integrity.md §3(纸面对/live 断·inventory 现落第 8 位·根因 hook① 未接)。
-- ⚠ 状态:**未执行 · 待 🧭/🔒 审**。执行顺序:**必在 `kaleido-d6-economy-content.sql` 之后**
--   (本脚本按 name 子查询解析新道具 id;道具行须先存在)。种子关仍 enabled=false,点亮随 hook① + 🧭 终审。
-- 只改 seq1-2(垂直切片范围·doc 10 §2.2);seq3-5 顺延。
--
-- 改动(doc 10 §2.2 逐条):
--   ① id27(多人恢复占位)→ 修补剂(kaleido heal30);**列在材料前**(保 inventory 先于 craft_btn)。
--   ② 材料 id13(多人·canon 泄漏)→ 碎块(kaleido 散件·喂加力件·§4 co-align)。
--   ③ seq1 随机补给 id22 → 修补剂。 seq2 战后补给 id27 → 修补剂。
--   ④ seq1 零战斗:**由 🔧 hook①/hook④ 保障**(doc 10 §2.1「seq1 零战斗保障」·基于本关 combatSetup 缺键 +
--      searchArea 跳过 npc 分支)。🧭 已决(2026-07-15):**靠引擎交付·不动共享 chamber max_npcs·不另起 chamber**
--      (零副作用)。故本脚本**不含任何 chamber 改动**,只回指 event_deck 道具 id。
-- 幂等:纯 UPDATE(jsonb_set 覆写 event_deck),可重复执行。
-- ─────────────────────────────────────────────────────────────────

BEGIN;

-- ── seq1(search):恢复 → 材料 → 随机恢复;恢复列首 → inventory 先于 craft_btn ──
UPDATE content_pool SET payload = jsonb_set(payload, '{event_deck}', jsonb_build_array(
  jsonb_build_object('type','item_find','item',
    jsonb_build_object('id', (SELECT id FROM item_pool WHERE name='修补剂')), 'weight',5,'once',true, 'guaranteed',true),   -- 首道具→inventory
  jsonb_build_object('type','item_find','item',
    jsonb_build_object('id', (SELECT id FROM item_pool WHERE name='碎块')),   'weight',5,'once',true, 'guaranteed',true),   -- 首材料→craft_btn
  jsonb_build_object('type','item_find','item',
    jsonb_build_object('id', (SELECT id FROM item_pool WHERE name='修补剂')), 'weight',2,'once',false)                      -- 随机补给
))
WHERE entity_type='level' AND provenance->>'seed_key'='d6-seq1-search';

-- ── seq2(encounter):战后补给(首遇由 combatSetup.enemy「那东西」入关注入·deck 不放 npc_encounter)──
UPDATE content_pool SET payload = jsonb_set(payload, '{event_deck}', jsonb_build_array(
  jsonb_build_object('type','item_find','item',
    jsonb_build_object('id', (SELECT id FROM item_pool WHERE name='修补剂')), 'weight',2,'once',false)                      -- 战后补给
))
WHERE entity_type='level' AND provenance->>'seed_key'='d6-seq2-encounter';

-- 验证(审阅时手跑·须先跑 content SQL):event_deck 首条 item.id = 修补剂 id、次条 = 碎块 id;seq2 单条 = 修补剂。
-- SELECT provenance->>'seed_key' k, jsonb_array_length(payload->'event_deck') n,
--        payload->'event_deck'->0->'item'->>'id' first_item,
--        payload->'event_deck'->1->'item'->>'id' second_item
-- FROM content_pool WHERE provenance->>'seed_key' IN ('d6-seq1-search','d6-seq2-encounter') ORDER BY provenance->>'seq_hint';

COMMIT;
