-- ─────────────────────────────────────────────────────────────────
-- KALEIDO D6 种子关 seq3-5(⚙️ KP1-G ①/② · content_pool entity_type='level')
-- ─────────────────────────────────────────────────────────────────
-- 设计:docs/plan/kaleido/07-d6-seed-levels.md §4 + 08-d6-balance.md(D5=乙 富路径终值)。
-- ⚠ 状态:**未执行 · 待 🧭/🔒 审后经 postgres MCP 执行**(铁律:SQL 先审后跑)。enabled=false 惰性入库(同 seq1-2)。
-- 🔧 形状批复(36a17c1)已并入:
--   · combatSetup.enemy = 权威 per-chamber 战斗敌(入关注入·镜像 boss :3404);event_deck 只放 item_find(不放 npc_encounter·防双刷)。
--   · 敌数值 = 富路径终值(08 §6):elite 85/14/4(stance_duel·combatModes-live)/ resource 90/16/5 / boss 260/34/8。
--   · name 留空由 📖 N4 填(🔧 证:空名不回落 npc_pool.name;boss 空名→硬编码'首领')。
--   · craft 材料判据运行时读 item_pool.kind,payload 不加字段;enabled 过滤已在 runs.js:2615。
-- 引用 ID:npc_pool(9/8/10·数值覆盖)、item_pool(24/13/14/27)、chamber_templates(7/8/24)。
-- 幂等:按 provenance->>'seed_key' 删旧再插。
-- ─────────────────────────────────────────────────────────────────

BEGIN;

DELETE FROM content_pool
WHERE entity_type = 'level'
  AND provenance->>'seed_key' IN ('d6-seq3-elite', 'd6-seq4-resource', 'd6-seq5-boss');

-- ── seq3:elite(stance_duel·首个三态克制·combatModes live via LW-2)──
-- 解锁:stance_ui(首个 stance_duel 关)。敌 85/14/4(minimal ~75-80%·08 §5)。
INSERT INTO content_pool (entity_type, enabled, payload, provenance) VALUES (
  'level', false,
  jsonb_build_object(
    'archetype', 'elite',
    'exit_condition', jsonb_build_object('type','survive_turns','params', jsonb_build_object('turns', 5)),
    'combat_mode',    jsonb_build_object('template_ref','stance_duel','params', jsonb_build_object('counterMul',1.6,'atkMul',1,'defMul',0.5),'describe',''),
    'combatSetup',    jsonb_build_object('enemy', jsonb_build_object('npcId',9,'name','那家伙','hp',85,'maxHp',85,'atk',14,'def',4,'level','medium')),
    'event_deck', jsonb_build_array(
      jsonb_build_object('type','item_find','item', jsonb_build_object('id',24),'weight',2,'once',false)  -- 少量补给(kaleido 值待 ③④)
    ),
    'env_rules', '[]'::jsonb,
    'formula_overrides', '[]'::jsonb,
    'difficulty_band', jsonb_build_object('target_clear_rate', jsonb_build_array(0.7, 0.85)),
    'chamber_ref', jsonb_build_object('template_id', 7, 'template_key', 'anchor_hazard_1'),
    'name','', 'description','', 'enter_text','', 'ambient', '[]'::jsonb
  ),
  jsonb_build_object('source','seed','seed_key','d6-seq3-elite','archetype','elite','seq_hint',3,'anonymized',true)
);

-- ── seq4:resource(备战枢纽·高投放·standard)──
-- 保底掉「战力增益件 + 合成材料×2 + 恢复品」;敌 90/16/5 消耗型非墙(exit=survive_turns 非 kill 门)。
INSERT INTO content_pool (entity_type, enabled, payload, provenance) VALUES (
  'level', false,
  jsonb_build_object(
    'archetype', 'resource',
    'exit_condition', jsonb_build_object('type','survive_turns','params', jsonb_build_object('turns', 6)),
    'combat_mode',    jsonb_build_object('template_ref','standard','params', '{}'::jsonb, 'describe',''),
    'combatSetup',    jsonb_build_object('enemy', jsonb_build_object('npcId',8,'name','那东西','hp',90,'maxHp',90,'atk',16,'def',5,'level','medium')),
    'event_deck', jsonb_build_array(
      jsonb_build_object('type','item_find','item', jsonb_build_object('id',24),'weight',5,'once',true, 'guaranteed',true),  -- 战力增益件(占位·kaleido stat 件待 ③④)
      jsonb_build_object('type','item_find','item', jsonb_build_object('id',13),'weight',4,'once',true, 'guaranteed',true),  -- 合成材料 结构碎片
      jsonb_build_object('type','item_find','item', jsonb_build_object('id',14),'weight',4,'once',true, 'guaranteed',true),  -- 合成材料 锚点稳定协议
      jsonb_build_object('type','item_find','item', jsonb_build_object('id',27),'weight',3,'once',false)                      -- 恢复品补给
    ),
    'env_rules', '[]'::jsonb,
    'formula_overrides', '[]'::jsonb,
    'difficulty_band', jsonb_build_object('target_clear_rate', jsonb_build_array(0.85, 1.0)),
    'chamber_ref', jsonb_build_object('template_id', 8, 'template_key', 'eden_scan_1'),
    'name','', 'description','', 'enter_text','', 'ambient', '[]'::jsonb
  ),
  jsonb_build_object('source','seed','seed_key','d6-seq4-resource','archetype','resource','seq_hint',4,'anonymized',true)
);

-- ── seq5:boss(boss_kill·准备度闸门·富路径 260/34/8·现引擎 live 可跑 :3404)──
-- prepared 74-86% / solid 25-50% / naked 0-1%(08 §2)。event_deck 空:boss 走 combatSetup.enemy 注入,boss 关不掉道具。
INSERT INTO content_pool (entity_type, enabled, payload, provenance) VALUES (
  'level', false,
  jsonb_build_object(
    'archetype', 'boss',
    'exit_condition', jsonb_build_object('type','boss_kill','params', '{}'::jsonb),
    'combat_mode',    jsonb_build_object('template_ref','standard','params', '{}'::jsonb, 'describe',''),
    'combatSetup',    jsonb_build_object('enemy', jsonb_build_object('npcId',10,'name','黑里的那个','hp',260,'maxHp',260,'atk',34,'def',8,'level','boss')),
    'event_deck', jsonb_build_array(),   -- 空:boss 由 combatSetup.enemy 走 :3404 注入;boss 关不掉道具
    'env_rules', '[]'::jsonb,
    'formula_overrides', '[]'::jsonb,
    'difficulty_band', jsonb_build_object('target_clear_rate', jsonb_build_array(0.7, 0.85)),
    'chamber_ref', jsonb_build_object('template_id', 24, 'template_key', 'omega_milestone_1'),
    'name','', 'description','', 'enter_text','', 'ambient', '[]'::jsonb
  ),
  jsonb_build_object('source','seed','seed_key','d6-seq5-boss','archetype','boss','seq_hint',5,'anonymized',true)
);

-- 验证(审阅时手跑):应返回 3 行,archetype=elite/resource/boss,均 combatSetup 非空,seq5 exit=boss_kill 且 event_deck=[]。
-- SELECT provenance->>'seq_hint' seq, payload->>'archetype' arch,
--        payload->'exit_condition'->>'type' exit,
--        (payload->'combatSetup'->'enemy'->>'hp') enemy_hp,
--        jsonb_array_length(payload->'event_deck') deck_len, enabled
-- FROM content_pool WHERE provenance->>'seed_key' IN ('d6-seq3-elite','d6-seq4-resource','d6-seq5-boss')
-- ORDER BY provenance->>'seq_hint';

COMMIT;
