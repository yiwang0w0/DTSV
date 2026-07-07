-- ─────────────────────────────────────────────────────────────────
-- KALEIDO D6 种子关 seq1-2 初稿(⚙️ KP1-G ① · content_pool entity_type='level')
-- ─────────────────────────────────────────────────────────────────
-- 设计:docs/plan/kaleido/06-d6-seed-levels.md §2/§3。
-- ⚠ 状态:**未执行 · 待 🧭/🔒 审后经 postgres MCP 执行**(铁律:SQL 先审后跑)。
-- ⚠⚠ 对抗验证发现(06 §0.4):运行时 gameActions.js 只消费 boss 关 combatSetup.enemy(:3404);
--     event_deck 与非 boss 敌人注入**无运行时读者** ⟹ 本批种子关当前是惰性数据(命中即降级随机多人刷怪)。
--     故两行均 enabled=FALSE:即便审毕执行也不入活流。启用前置 =
--       (a) 🔧 钩子① 非 boss 内容注入消费器落地(06 §1.1);
--       (b) 确认 startKaleidoRun 的 seedLevels 查询带 .eq('enabled',true)(否则 enabled 标志不 gate);
--       (c) 启用时(UPDATE ... SET enabled=true)send 🧭 协调 kaleido-e2e.mjs 重跑。
-- 幂等:按 provenance->>'seed_key' 删旧再插(可重复执行,不产生重复行)。
-- 引用一律 ID:item_pool(27 机能恢复剂 / 13 结构碎片 / 22 结构修复包)、npc_pool(8 残响低语·数值覆盖)、
--            chamber_templates(1 外环-巡查节点 / 5 锚点-残响游走区)。
-- 文案槽(name/description/enter_text/ambient)留空 = 📖 N4 填。
-- ⚠ 依赖 🔧 钩子①:event_deck "guaranteed":true 语义(投放下限)——引擎须honor,否则解锁链退化为概率(见 06 §1.1)。
-- ─────────────────────────────────────────────────────────────────

BEGIN;

-- 幂等清理:仅删本批(seed_key 前缀 d6-),不碰其他 content_pool 行。
DELETE FROM content_pool
WHERE entity_type = 'level'
  AND provenance->>'seed_key' IN ('d6-seq1-search', 'd6-seq2-encounter');

-- ── seq1:search(纯搜索·觉醒关·pollution 0)──
-- 解锁:log_panel(首搜)/ inventory(首道具 id27)/ craft_btn(首配方材料 id13);清关→move_btn。
INSERT INTO content_pool (entity_type, enabled, payload, provenance) VALUES (
  'level', false,   -- ⚠ enabled=false:惰性入库,待 🔧 钩子① 内容注入消费器落地前不入活流(见文件头 + 06 §0.4)
  jsonb_build_object(
    'archetype', 'search',
    'exit_condition', jsonb_build_object('type','survive_turns','params', jsonb_build_object('turns', 3)),
    'combat_mode',    jsonb_build_object('template_ref','standard','params', '{}'::jsonb, 'describe',''),
    'combatSetup',    NULL,
    'event_deck', jsonb_build_array(
      jsonb_build_object('type','item_find','item', jsonb_build_object('id',27),'weight',5,'once',true, 'guaranteed',true),  -- 机能恢复剂→首道具
      jsonb_build_object('type','item_find','item', jsonb_build_object('id',13),'weight',5,'once',true, 'guaranteed',true),  -- 结构碎片→首配方材料
      jsonb_build_object('type','item_find','item', jsonb_build_object('id',22),'weight',2,'once',false)                     -- 结构修复包→随机补给
    ),
    'env_rules', '[]'::jsonb,
    'formula_overrides', '[]'::jsonb,
    'difficulty_band', jsonb_build_object('target_clear_rate', jsonb_build_array(0.9, 1.0)),
    'chamber_ref', jsonb_build_object('template_id', 1, 'template_key', 'outer_ring_scan_1'),
    'name','', 'description','', 'enter_text','', 'ambient', '[]'::jsonb
  ),
  jsonb_build_object('source','seed','seed_key','d6-seq1-search','archetype','search','seq_hint',1,'anonymized',true)
);

-- ── seq2:encounter(首次战斗·gauntlet 2 波·安全上演)──
-- 解锁:hp_bar(遭遇前)/ combat_panel(遭遇)/ rules_card(入关前);敌数值弱到必胜(06 §3.1 算术)。
INSERT INTO content_pool (entity_type, enabled, payload, provenance) VALUES (
  'level', false,   -- ⚠ enabled=false:惰性入库,待 🔧 钩子① 内容注入消费器落地前不入活流(见文件头 + 06 §0.4)
  jsonb_build_object(
    'archetype', 'encounter',
    'exit_condition', jsonb_build_object('type','survive_turns','params', jsonb_build_object('turns', 4)),
    'combat_mode',    jsonb_build_object(
      'template_ref','gauntlet',
      'params', jsonb_build_object('waves',2,'waveHeal',15,'enemyScale',1.15,'atkMul',1,'defMul',0.5),
      'describe',''
    ),
    'combatSetup', jsonb_build_object(
      'enemy', jsonb_build_object('npcId',8,'name','','hp',18,'maxHp',18,'atk',6,'def',2,'level','easy')
    ),
    'event_deck', jsonb_build_array(
      jsonb_build_object('type','npc_encounter','npc', jsonb_build_object('id',8,'hp',18,'atk',6,'def',2),'weight',3,'once',true,'guaranteed',true),  -- 首遭遇
      jsonb_build_object('type','item_find','item', jsonb_build_object('id',27),'weight',2,'once',false)                                               -- 战后补给
    ),
    'env_rules', '[]'::jsonb,
    'formula_overrides', '[]'::jsonb,
    'difficulty_band', jsonb_build_object('target_clear_rate', jsonb_build_array(0.9, 1.0)),
    'chamber_ref', jsonb_build_object('template_id', 5, 'template_key', 'anchor_combat_1'),
    'name','', 'description','', 'enter_text','', 'ambient', '[]'::jsonb
  ),
  jsonb_build_object('source','seed','seed_key','d6-seq2-encounter','archetype','encounter','seq_hint',2,'anonymized',true)
);

-- 验证(审阅时手跑):应返回 2 行,archetype=search/encounter,seq1 combatSetup NULL、seq2 非 NULL。
-- SELECT id, payload->>'archetype' arch, provenance->>'seed_key' k,
--        (payload->'combatSetup') IS NOT NULL AS has_enemy,
--        payload->'exit_condition'->>'type' exit
-- FROM content_pool WHERE provenance->>'seed_key' LIKE 'd6-%' ORDER BY provenance->>'seq_hint';

COMMIT;
