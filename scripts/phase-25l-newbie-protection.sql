-- ============================================================
-- Phase 25l — profiles.first_raids_count（新手保护期计数）
-- ============================================================
-- 来源 finding: research-2026-05-12 主题 A "新手保护期机制"
-- "前 3 局 raid 撤离失败返还 50% 入场购买点数。" → 预埋 schema + 应用层 helper，
--  与 Phase 24b 入场/失败流程一起激活。
--
-- 现状: profiles 无"已完成 raid 局数"概念，无法判定玩家是否处于新手保护期。
--
-- 设计:
--   1. ALTER TABLE 加 first_raids_count INT, DEFAULT 0（既有玩家全部 0 = 视为新手，
--      首次 raid 完成后才自增；保守地让老玩家也享受前 3 局保护，无破坏性）
--   2. CHECK (first_raids_count >= 0) 防负
--
-- 应用层语义（src/lib/server/newbieProtection.js + src/lib/constants.js NEWBIE_PROTECTION）:
--   - first_raids_count < NEWBIE_PROTECTION.FIRST_RAIDS(3) → 该局算"新手 raid"
--   - 撤离失败（阵亡 / Ω-段未撤离）时返还入场购买点数的 REFUND_RATE(50%)
--     仅返还可购买点数类型（high_equip_pt / low_equip_pt / item_pt），class_pt 不在购买范畴不返还
--   - 每完成一局 raid（成功或失败）first_raids_count += 1（封顶意义不大，自然增长）
--   - 红线: 返还只补偿"入场已花费"，绝不超过实际花费 → 非净新经济注水（对照 economy-canon §3）
--
-- 兼容:
--   - 既有玩家 first_raids_count 自动取 DEFAULT 0，无需回填
--   - 预埋不启用（NEWBIE_PROTECTION.ENABLED=false）：Phase 24b 接入入场计数 + 失败返还分支后才生效
--   - 可与 28-D Streak-breaker 叠加（前者返还点数，后者降难度，互不冲突）
--
-- 验证:
--   SELECT count(*) FILTER (WHERE first_raids_count < 3) AS in_protection,
--          count(*) FILTER (WHERE first_raids_count >= 3) AS veterans
--   FROM profiles;
-- ============================================================

BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS first_raids_count INTEGER
  NOT NULL DEFAULT 0
  CHECK (first_raids_count >= 0);

COMMENT ON COLUMN profiles.first_raids_count IS
  'Phase 25l 玩家已完成 raid 局数（成功+失败）。
   < NEWBIE_PROTECTION.FIRST_RAIDS(3) 时该局算新手 raid，撤离失败返还 50% 入场购买点数。
   预埋不启用，Phase 24b 接入入场计数 + 失败返还分支后才生效。';

COMMIT;

-- 验证 / 演练命令:
-- SELECT count(*) FILTER (WHERE first_raids_count < 3) AS in_protection,
--        count(*) FILTER (WHERE first_raids_count >= 3) AS veterans,
--        count(*) FILTER (WHERE first_raids_count IS NULL) AS nulls  -- 应为 0
--   FROM profiles;
