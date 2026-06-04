-- ============================================================
-- Phase 39 — 全游戏数值重排 v2（统一战斗 Phase C·用户主导起步方案）
-- ============================================================
-- 来源: docs/unified-combat-npc-design.md §5 Phase C。用户 AskUQ 拍板：
--   ① 用起步方案（×10 基础 + 装备按稀有度乘区 + 职业用现有 perks 乘子）
--   ② 装备强度档=温和（基础为地基·满配约 +80~120%·legendary 单件 ~+42%）
--
-- 把 Phase A 的「base × (1+职业乘区) × (1+装备乘区)」从平衡中性（新列默认 0）
--   切到真正使用乘区：基础值放大到「100」量级、装备/职业表达为乘区。
--   战斗"几下打死"节奏保持（atk/def/hp/回血/buff 一律 ×10 同步缩放）。
--
-- ── 改动（已于 2026-06-04 经 postgres MCP 应用·本文件为记录）──
--   1. game_rules 玩家基础值：atk 10→100 · def 5→50 · hp 100→1000
--   2. npc_pool.atk/def/hp ×10（保留相对强弱：easy 80/40/350 … boss 300/180/2000）
--   3. item_pool.heal/atk/def ×10（stamina_restore 独立刻度·不动；effect 不动）
--   4. buff_pool.value ×10（仅 target∈{hp,atk,def}；effect_formula 里 atk*0.05 等比例自动随 ×10 缩放）
--   5. equipment_tiers：清零加法 base_atk/def/hp → 按 slot×稀有度配 *_pct（温和档）：
--        曲线 common .05/uncommon .10/rare .18/epic .28/legendary .42/mythic .60
--        weapon→atk_pct=曲线；shield→def_pct=曲线·hp_pct=曲线；probe→hp_pct=曲线×.5；comm→atk_pct=曲线×.5
--   6. classes：清零 base_atk/def/hp_bonus（新基础上可忽略的小额 flat）；perks 乘子（combat_dmg/def_mult）保留为职业乘区
--
-- ── 幂等守卫 ──
--   ×10 类 UPDATE 非幂等（重跑会 ×100）。用守卫「player_init_atk='10'（旧值）才应用」防重复：
--   应用后 player_init_atk='100'，重跑守卫不命中 → 跳过。可安全重复执行（幂等）。
--
-- ── 编辑器 ──
--   装备 *_pct 由 admin「🗡️ 装备引擎」tab（EquipmentSeriesSection）逐 tier 调；
--   职业乘子由「✦ 职业」tab（perks）；NPC 基础/职业/装备/物品槽由「👻 实体」tab。
--   ⇒ 本起步方案是基线，用户逐个微调。
--
-- ── 红线 ──
--   只动数值数据；不改 schema/引擎/公式（computeCombatStats/calcDamage 不碰）。
--   残片可发现性/lore/缩圈/房间投放/敌人投放 不碰。
-- ============================================================

DO $$
BEGIN
  -- 守卫：仅当仍是旧值（player_init_atk=10）才应用，防重复 ×10（幂等）。
  IF (SELECT value FROM game_rules WHERE key='player_init_atk') = '10' THEN
    UPDATE game_rules SET value='100'  WHERE key='player_init_atk';
    UPDATE game_rules SET value='50'   WHERE key='player_init_def';
    UPDATE game_rules SET value='1000' WHERE key='player_init_hp';

    UPDATE npc_pool SET atk=atk*10, def=def*10, hp=hp*10;

    UPDATE item_pool SET heal=heal*10 WHERE heal>0;
    UPDATE item_pool SET atk=atk*10   WHERE atk>0;
    UPDATE item_pool SET def=def*10   WHERE def>0;

    UPDATE buff_pool SET value=value*10 WHERE target IN ('hp','atk','def');

    UPDATE equipment_tiers SET base_atk=0, base_def=0, base_hp=0;
    UPDATE equipment_tiers et SET
      atk_pct = CASE WHEN es.slot='weapon' THEN rc.curve WHEN es.slot='comm' THEN rc.curve*0.5 ELSE 0 END,
      def_pct = CASE WHEN es.slot='shield' THEN rc.curve ELSE 0 END,
      hp_pct  = CASE WHEN es.slot='shield' THEN rc.curve WHEN es.slot='probe' THEN rc.curve*0.5 ELSE 0 END
    FROM equipment_series es,
      (VALUES ('common',0.05::real),('uncommon',0.10::real),('rare',0.18::real),
              ('epic',0.28::real),('legendary',0.42::real),('mythic',0.60::real)) AS rc(rarity, curve)
    WHERE et.series_id = es.id AND et.rarity = rc.rarity;

    UPDATE classes SET base_atk_bonus=0, base_def_bonus=0, base_hp_bonus=0;
  END IF;
END $$;

-- 验证（部署后）:
--   SELECT value FROM game_rules WHERE key IN ('player_init_atk','player_init_def','player_init_hp');  -- 100/50/1000
--   SELECT count(*) FROM equipment_tiers WHERE base_atk<>0 OR base_def<>0 OR base_hp<>0;               -- 0
--   SELECT count(*) FROM equipment_tiers WHERE atk_pct>0 OR def_pct>0 OR hp_pct>0;                     -- 17
--   SELECT count(*) FROM classes WHERE base_atk_bonus<>0 OR base_def_bonus<>0 OR base_hp_bonus<>0;     -- 0
