-- ============================================================
-- Phase 25h — equipment_instances 保险字段（insurance_tier / insurance_premium_pt）
-- ============================================================
-- 来源 finding: research-2026-05-28-D 主题 D 延伸
-- "2026 extraction genre baseline（Tarkov / EVE Vanguard / Arc Raiders 都已迭代），
--  拖到 Phase 25+ 会被新玩家流失数据反推回来。" → 预埋 schema，与 Phase 24b 一起激活。
--
-- 现状: equipment_instances 无保险概念，死亡即永久销毁装备实例（gear fear 来源）。
--
-- 设计:
--   1. 新建 ENUM equipment_insurance_tier: none / basic / premium
--   2. ALTER TABLE 加 insurance_tier 列, DEFAULT 'none'（既有实例全部 none，无破坏性）
--   3. ALTER TABLE 加 insurance_premium_pt INT, DEFAULT 0（购买保险时支付的点数快照）
--   4. 加 insurance_tier 部分索引，支持"已投保实例"快速过滤
--
-- 死亡返还概率（Phase 24b 应用层实现，本脚本仅预埋 schema）:
--   none     → 0%   死亡即销毁
--   basic    → 30%  死亡时 30% 概率保留实例（或返还折算点数）
--   premium  → 60%  死亡时 60% 概率保留实例
--   注: 概率值是应用层常量（参考 src/lib/constants.js），不入 DB，避免 schema 锁死调参。
--       insurance_premium_pt 记录玩家实际支付，便于经济审计 + healthcheck 通胀监测。
--
-- 兼容:
--   - 既有实例 insurance_tier 自动取 DEFAULT 'none'，无需回填
--   - 预埋不启用：Phase 24b 接入购买入口 + extract/death 返还分支后才生效
--
-- 验证:
--   SELECT insurance_tier, count(*) FROM equipment_instances GROUP BY insurance_tier;
--   SELECT SUM(insurance_premium_pt) FROM equipment_instances WHERE insurance_tier <> 'none';
-- ============================================================

BEGIN;

-- 1. ENUM type (IF NOT EXISTS via DO block, 因 CREATE TYPE 无 IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'equipment_insurance_tier') THEN
    CREATE TYPE equipment_insurance_tier AS ENUM (
      'none',
      'basic',
      'premium'
    );
  END IF;
END$$;

-- 2. insurance_tier 列 (DEFAULT 'none'，既有实例无破坏性)
ALTER TABLE equipment_instances
  ADD COLUMN IF NOT EXISTS insurance_tier equipment_insurance_tier
  NOT NULL DEFAULT 'none';

COMMENT ON COLUMN equipment_instances.insurance_tier IS
  'Phase 25h 装备保险档位 ENUM (none/basic/premium)。
   死亡返还概率为应用层常量 (basic 30% / premium 60%)，不入 DB 以便调参。
   预埋不启用，Phase 24b 接入购买入口 + 死亡返还分支后才生效。';

CREATE INDEX IF NOT EXISTS idx_equipment_instances_insurance
  ON equipment_instances(insurance_tier) WHERE insurance_tier <> 'none';

-- 3. insurance_premium_pt 列 (购买保险时支付的点数快照，便于经济审计)
ALTER TABLE equipment_instances
  ADD COLUMN IF NOT EXISTS insurance_premium_pt INTEGER
  NOT NULL DEFAULT 0
  CHECK (insurance_premium_pt >= 0);

COMMENT ON COLUMN equipment_instances.insurance_premium_pt IS
  'Phase 25h 该实例购买保险时实际支付的点数 (none = 0)。
   用于经济审计 + healthcheck 通胀监测 (对照 phase-25g 库存增长率)。';

COMMIT;

-- 验证 / 演练命令:
-- SELECT insurance_tier, count(*), SUM(insurance_premium_pt)
--   FROM equipment_instances GROUP BY insurance_tier ORDER BY 2 DESC;
-- 既有实例默认 none 一致性: SELECT count(*) FROM equipment_instances WHERE insurance_tier IS NULL;  -- 应为 0
