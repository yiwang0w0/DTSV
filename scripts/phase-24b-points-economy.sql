-- ============================================================
-- Phase 24b — 4 类点数经济 + 商店目录 + 兑换汇率 + 硬迁移
-- ============================================================
-- 替代直接装备/物品携带:
--   - 装备 / 物品在撤离时折算成"价值点数"
--   - 入场前用点数从 shop_catalog 购买初始 loadout
--   - 不同类型点数可在 shop_exchange_rates 互相兑换
--
-- 4 种点数:
--   high_equip_pt - rare/epic/legendary/mythic 装备折算 → 购买高级装备
--   low_equip_pt  - common/uncommon 装备折算 → 购买普通装备
--   item_pt       - consumable + 剧情物品折算 → 购买消耗品 / 互换
--   class_pt      - raid 里程碑奖励 → 入场保底刷出 legendary 职业(Phase 24c)
--
-- 硬迁移策略:
--   1) 现有 equipment_instances(stash=room_id IS NULL) 按 rarity 折算 → 写入 player_points
--   2) 现有 player_stash WHERE item kind IN (consumable, tech_fragment, platform_part, omega_matter) 折算
--   3) DELETE 已折算的源行（破坏性，硬切换）
--   4) 保留 tech_fragment / omega_matter / platform_part 计数器: gamevars.totalFragmentsExtracted /
--      player.omegaMaterials 自增逻辑不变(endings.js 触发逻辑不破)
-- ============================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- Step 1: 创建 3 张新表
-- ═══════════════════════════════════════════════════════════════

-- 1.1 player_points - 玩家 4 类点数余额
CREATE TABLE IF NOT EXISTS player_points (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  point_type TEXT NOT NULL CHECK (point_type IN ('high_equip_pt','low_equip_pt','item_pt','class_pt')),
  balance    INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, point_type)
);

CREATE INDEX IF NOT EXISTS player_points_user_idx ON player_points(user_id);

COMMENT ON TABLE player_points IS
  'Phase 24b 玩家 4 类点数余额。撤离折算 credit + 入场购买 debit + 商店兑换。';
COMMENT ON COLUMN player_points.point_type IS
  '点数类型: high_equip_pt(rare+装备) / low_equip_pt(common+uncommon 装备) / item_pt(消耗品+剧情物品) / class_pt(高级职业保底,Phase 24c)';


-- 1.2 shop_catalog - 入场购买目录
CREATE TABLE IF NOT EXISTS shop_catalog (
  id                  BIGSERIAL PRIMARY KEY,
  entry_kind          TEXT NOT NULL CHECK (entry_kind IN ('equipment','consumable','story_item')),
  tier_id             INTEGER REFERENCES equipment_tiers(id) ON DELETE CASCADE,
  item_name           TEXT,
  point_type          TEXT NOT NULL CHECK (point_type IN ('high_equip_pt','low_equip_pt','item_pt')),
  cost                INTEGER NOT NULL CHECK (cost > 0),
  required_class_ids  BIGINT[] NOT NULL DEFAULT '{}',
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  display_order       INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- equipment 必带 tier_id, consumable/story_item 必带 item_name
  CONSTRAINT shop_catalog_target_check CHECK (
    (entry_kind = 'equipment' AND tier_id IS NOT NULL AND item_name IS NULL)
    OR (entry_kind IN ('consumable','story_item') AND item_name IS NOT NULL AND tier_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS shop_catalog_enabled_idx ON shop_catalog(enabled, entry_kind, display_order);

COMMENT ON TABLE shop_catalog IS 'Phase 24b 入场购买目录。entry_kind=equipment 用 tier_id, 其他用 item_name';


-- 1.3 shop_exchange_rates - 点数互换汇率
CREATE TABLE IF NOT EXISTS shop_exchange_rates (
  id          BIGSERIAL PRIMARY KEY,
  from_type   TEXT NOT NULL CHECK (from_type IN ('high_equip_pt','low_equip_pt','item_pt','class_pt')),
  to_type     TEXT NOT NULL CHECK (to_type IN ('high_equip_pt','low_equip_pt','item_pt','class_pt')),
  from_amount INTEGER NOT NULL CHECK (from_amount > 0),
  to_amount   INTEGER NOT NULL CHECK (to_amount > 0),
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  CONSTRAINT shop_exchange_distinct CHECK (from_type != to_type),
  UNIQUE (from_type, to_type)
);

COMMENT ON TABLE shop_exchange_rates IS 'Phase 24b 点数互换汇率。from_amount 单位的 from_type → to_amount 单位的 to_type';


-- ═══════════════════════════════════════════════════════════════
-- Step 2: seed 默认兑换汇率
-- ═══════════════════════════════════════════════════════════════
-- 设计原则:
--   - 同向升级有成本 (high 比 low 稀缺,反向有微损)
--   - class_pt 只买不卖（class_pt 来自 raid 里程碑,不可逆向）
--   - item_pt ↔ low_equip_pt 双向 5:1 (流动性最高)

INSERT INTO shop_exchange_rates (from_type, to_type, from_amount, to_amount, description)
VALUES
  -- 装备点升降
  ('low_equip_pt', 'high_equip_pt', 10, 1, '10 普通装备点 → 1 高级装备点(升级,有溢价)'),
  ('high_equip_pt', 'low_equip_pt', 1, 8, '1 高级装备点 → 8 普通装备点(降级,有损耗)'),
  -- 装备点 ↔ 道具点
  ('low_equip_pt', 'item_pt', 5, 1, '5 普通装备点 → 1 道具点'),
  ('item_pt', 'low_equip_pt', 5, 1, '5 道具点 → 1 普通装备点(对称)'),
  ('high_equip_pt', 'item_pt', 1, 6, '1 高级装备点 → 6 道具点'),
  ('item_pt', 'high_equip_pt', 30, 1, '30 道具点 → 1 高级装备点(逆向,有溢价)'),
  -- class_pt 单向购买(只入不出)
  ('high_equip_pt', 'class_pt', 50, 1, '50 高级装备点 → 1 高级职业点(单向,无法逆转)')
ON CONFLICT (from_type, to_type) DO UPDATE SET
  from_amount = EXCLUDED.from_amount,
  to_amount = EXCLUDED.to_amount,
  description = EXCLUDED.description;


-- ═══════════════════════════════════════════════════════════════
-- Step 3: seed shop_catalog
-- ═══════════════════════════════════════════════════════════════

-- 3.1 装备目录 - 从 equipment_tiers 派生
-- 价格:略高于折算回收价,避免无损循环
-- common=8, uncommon=15, rare=12(high), epic=22, legendary=40, mythic=70
INSERT INTO shop_catalog (entry_kind, tier_id, item_name, point_type, cost, display_order)
SELECT
  'equipment'::TEXT,
  t.id,
  NULL::TEXT,
  CASE t.rarity
    WHEN 'common' THEN 'low_equip_pt'
    WHEN 'uncommon' THEN 'low_equip_pt'
    ELSE 'high_equip_pt'
  END,
  CASE t.rarity
    WHEN 'common' THEN 8
    WHEN 'uncommon' THEN 15
    WHEN 'rare' THEN 12
    WHEN 'epic' THEN 22
    WHEN 'legendary' THEN 40
    WHEN 'mythic' THEN 70
    ELSE 50
  END,
  (CASE t.rarity
    WHEN 'common' THEN 100 WHEN 'uncommon' THEN 200
    WHEN 'rare' THEN 300 WHEN 'epic' THEN 400
    WHEN 'legendary' THEN 500 WHEN 'mythic' THEN 600
    ELSE 999
  END) + t.id
FROM equipment_tiers t
WHERE NOT EXISTS (
  SELECT 1 FROM shop_catalog sc
  WHERE sc.entry_kind = 'equipment' AND sc.tier_id = t.id
);

-- 3.2 消耗品目录 - 从 item_pool kind='consumable'
INSERT INTO shop_catalog (entry_kind, tier_id, item_name, point_type, cost, display_order)
SELECT
  'consumable'::TEXT,
  NULL::INTEGER,
  i.name,
  'item_pt'::TEXT,
  4,  -- 统一定价: 1 单位消耗品 = 4 道具点(购买价比折算回收 3 略高)
  700 + i.id
FROM item_pool i
WHERE i.kind = 'consumable'
  AND NOT EXISTS (
    SELECT 1 FROM shop_catalog sc
    WHERE sc.entry_kind = 'consumable' AND sc.item_name = i.name
  );

-- 3.3 剧情物品目录 - tech_fragment / platform_part / omega_matter
INSERT INTO shop_catalog (entry_kind, tier_id, item_name, point_type, cost, display_order)
SELECT
  'story_item'::TEXT,
  NULL::INTEGER,
  i.name,
  'item_pt'::TEXT,
  CASE i.kind
    WHEN 'tech_fragment' THEN 12
    WHEN 'platform_part' THEN 6
    WHEN 'omega_matter' THEN 25
  END,
  800 + i.id
FROM item_pool i
WHERE i.kind IN ('tech_fragment', 'platform_part', 'omega_matter')
  AND NOT EXISTS (
    SELECT 1 FROM shop_catalog sc
    WHERE sc.entry_kind = 'story_item' AND sc.item_name = i.name
  );


-- ═══════════════════════════════════════════════════════════════
-- Step 4: 硬迁移 — 现有 stash + equipment_instances → player_points
-- ═══════════════════════════════════════════════════════════════
-- 折算表:
--   Equipment (equipment_instances JOIN equipment_tiers):
--     common    → low_equip_pt  ×5
--     uncommon  → low_equip_pt  ×12
--     rare      → high_equip_pt ×8
--     epic      → high_equip_pt ×18
--     legendary → high_equip_pt ×35
--     mythic    → high_equip_pt ×60
--     + bonus_atk × 2 → low_equip_pt
--     + bonus_def × 2 → low_equip_pt
--     × durability_current / NULLIF(durability_max,0) clamped [0.3, 1.0]
--
--   Consumable (player_stash JOIN item_pool kind='consumable'):
--     统一 → item_pt × 3 per unit
--
--   剧情物品 (player_stash JOIN item_pool kind IN ...):
--     tech_fragment → item_pt × 8  per unit
--     platform_part → item_pt × 4  per unit
--     omega_matter  → item_pt × 15 per unit
-- ═══════════════════════════════════════════════════════════════

-- 4.1 装备折算 → 写入 player_points
WITH equip_value AS (
  SELECT
    ei.owner_id AS user_id,
    CASE WHEN t.rarity IN ('common','uncommon') THEN 'low_equip_pt' ELSE 'high_equip_pt' END AS point_type,
    SUM(
      ROUND(
        (CASE t.rarity
          WHEN 'common' THEN 5
          WHEN 'uncommon' THEN 12
          WHEN 'rare' THEN 8
          WHEN 'epic' THEN 18
          WHEN 'legendary' THEN 35
          WHEN 'mythic' THEN 60
          ELSE 5
        END + ei.bonus_atk * 2 + ei.bonus_def * 2)
        *
        GREATEST(0.3, LEAST(1.0,
          CASE WHEN t.durability_max IS NULL OR t.durability_max = 0 THEN 1.0
               ELSE ei.durability_current::numeric / t.durability_max::numeric
          END
        ))
      )::INTEGER
    ) AS total
  FROM equipment_instances ei
  JOIN equipment_tiers t ON t.id = ei.tier_id
  WHERE ei.room_id IS NULL  -- 仅 stash 中的(在 raid 的不迁移)
  GROUP BY ei.owner_id, point_type
)
INSERT INTO player_points (user_id, point_type, balance)
SELECT user_id, point_type, GREATEST(total, 0)
FROM equip_value
WHERE total > 0
ON CONFLICT (user_id, point_type) DO UPDATE SET
  balance = player_points.balance + EXCLUDED.balance,
  updated_at = now();

-- 4.2 consumable 折算 → item_pt
WITH consumable_value AS (
  SELECT s.user_id, SUM(s.quantity * 3)::INTEGER AS total
  FROM player_stash s
  JOIN item_pool i ON i.name = s.item_name
  WHERE i.kind = 'consumable'
  GROUP BY s.user_id
)
INSERT INTO player_points (user_id, point_type, balance)
SELECT user_id, 'item_pt', total
FROM consumable_value
WHERE total > 0
ON CONFLICT (user_id, point_type) DO UPDATE SET
  balance = player_points.balance + EXCLUDED.balance,
  updated_at = now();

-- 4.3 剧情物品折算 → item_pt
WITH story_value AS (
  SELECT s.user_id,
    SUM(s.quantity * CASE i.kind
      WHEN 'tech_fragment' THEN 8
      WHEN 'platform_part' THEN 4
      WHEN 'omega_matter' THEN 15
      ELSE 0
    END)::INTEGER AS total
  FROM player_stash s
  JOIN item_pool i ON i.name = s.item_name
  WHERE i.kind IN ('tech_fragment','platform_part','omega_matter')
  GROUP BY s.user_id
)
INSERT INTO player_points (user_id, point_type, balance)
SELECT user_id, 'item_pt', total
FROM story_value
WHERE total > 0
ON CONFLICT (user_id, point_type) DO UPDATE SET
  balance = player_points.balance + EXCLUDED.balance,
  updated_at = now();

-- 4.4 清空已折算的源行（破坏性，与点数模型互斥）
-- 注意:这里 DELETE equipment_instances 仅删除 stash(room_id IS NULL)中的,
--      在 raid 中的(room_id IS NOT NULL)继续保留,直到本局 extract 时再 DELETE
DELETE FROM equipment_instances WHERE room_id IS NULL;

DELETE FROM player_stash s
USING item_pool i
WHERE i.name = s.item_name
  AND i.kind IN ('consumable','tech_fragment','platform_part','omega_matter');


-- ═══════════════════════════════════════════════════════════════
-- Step 5: 验证查询(commit 后可重跑)
-- ═══════════════════════════════════════════════════════════════
-- SELECT user_id, point_type, balance FROM player_points ORDER BY user_id, point_type;
-- SELECT entry_kind, point_type, count(*), min(cost), max(cost) FROM shop_catalog GROUP BY entry_kind, point_type;
-- SELECT * FROM shop_exchange_rates ORDER BY from_type, to_type;
-- SELECT count(*) AS legacy_stash_left FROM player_stash;            -- 期望 0(剧情物品都被折算)
-- SELECT count(*) AS legacy_equip_left FROM equipment_instances WHERE room_id IS NULL;  -- 期望 0

COMMIT;
