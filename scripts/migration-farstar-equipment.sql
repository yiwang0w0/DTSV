-- ═══════════════════════════════════════════════════════════════════
-- 远星函馆 Phase 8.1 — 装备 series + tiers（统一到 instance 系）
-- ═══════════════════════════════════════════════════════════════════
-- 设计：
--   * 远星 4 装备槽（probe/shield/weapon/comm）作为 equipment_series.slot 值
--   * 每个 series 配 2 个 tier（基础 + 高级）
--   * 沿用现有 equipment_instances 系统，新种子是 ADDITIVE（不删除既有 series）
--   * 旧 series（slot=armor/helmet/boots/accessory）不删；LoadoutModal
--     在 Phase 8.8 中按 slot ∈ {probe,shield,weapon,comm} 过滤
--
--   * 特殊属性（搜索 +15% / 污染累积 ×0.7 / 实体伤害 +25% / PvP 误判 -50%）
--     不存储在 DB，由 src/lib/pollution.js + gameActions 按 slot 直接判定。
--     equipment_tiers.base_atk / base_def 存基础数值加成。

-- 1) 4 个 series（slot 即 4 个装备槽）
INSERT INTO equipment_series (name, slot, icon)
VALUES
  ('探测设备', 'probe',  '🔍'),
  ('防护装置', 'shield', '🛡️'),
  ('武器模组', 'weapon', '⚔️'),
  ('通信组件', 'comm',   '📡')
ON CONFLICT DO NOTHING;

-- 2) 8 个 tier（每 series 两阶）
DO $$
DECLARE
  probe_id  BIGINT;
  shield_id BIGINT;
  weapon_id BIGINT;
  comm_id   BIGINT;
BEGIN
  SELECT id INTO probe_id  FROM equipment_series WHERE slot = 'probe'  AND name = '探测设备' LIMIT 1;
  SELECT id INTO shield_id FROM equipment_series WHERE slot = 'shield' AND name = '防护装置' LIMIT 1;
  SELECT id INTO weapon_id FROM equipment_series WHERE slot = 'weapon' AND name = '武器模组' LIMIT 1;
  SELECT id INTO comm_id   FROM equipment_series WHERE slot = 'comm'   AND name = '通信组件' LIMIT 1;

  -- probe: 搜索装备
  INSERT INTO equipment_tiers (series_id, tier, rarity, variant, name, base_atk, base_def, element, durability_max)
  VALUES
    (probe_id, 1, 'common',   NULL, '扫描探测器', 0, 0, NULL, 100),
    (probe_id, 2, 'rare',     NULL, '深探测器',   0, 0, NULL, 150)
  ON CONFLICT DO NOTHING;

  -- shield: 防护污染装备
  INSERT INTO equipment_tiers (series_id, tier, rarity, variant, name, base_atk, base_def, element, durability_max)
  VALUES
    (shield_id, 1, 'common',   NULL, '防护罩-轻型', 0,  5, NULL, 100),
    (shield_id, 2, 'rare',     NULL, '防护罩-重型', 0, 10, NULL, 150)
  ON CONFLICT DO NOTHING;

  -- weapon: 对实体伤害装备
  INSERT INTO equipment_tiers (series_id, tier, rarity, variant, name, base_atk, base_def, element, durability_max)
  VALUES
    (weapon_id, 1, 'common',   NULL, '武器模组-斩',  8, 0, NULL, 80),
    (weapon_id, 2, 'rare',     NULL, '武器模组-爆', 12, 0, NULL, 120)
  ON CONFLICT DO NOTHING;

  -- comm: PvP 通信装备
  INSERT INTO equipment_tiers (series_id, tier, rarity, variant, name, base_atk, base_def, element, durability_max)
  VALUES
    (comm_id, 1, 'common',   NULL, '通信组件-基础', 0, 0, NULL, 100),
    (comm_id, 2, 'rare',     NULL, '通信组件-高级', 0, 0, NULL, 150)
  ON CONFLICT DO NOTHING;
END $$;

-- 验证
SELECT s.slot, s.name AS series_name, t.tier, t.name AS tier_name,
       t.rarity, t.base_atk, t.base_def, t.durability_max
  FROM equipment_series s
  JOIN equipment_tiers t ON t.series_id = s.id
 WHERE s.slot IN ('probe', 'shield', 'weapon', 'comm')
   AND s.name IN ('探测设备', '防护装置', '武器模组', '通信组件')
 ORDER BY s.slot, t.tier;
