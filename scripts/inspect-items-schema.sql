-- ============================================================
-- Phase 17 — 物品使用模式扩展（consume / inspect_keep / inspect_consume）
-- ============================================================
-- 用户反馈：当前 useItem 都会消耗物品，对情报类道具不合适。
-- 需要三种模式：
--   consume         — 使用：应用 effect + 消耗（默认，向后兼容）
--   inspect_keep    — 查看：写日志显示 inspect_text + 不消耗（可反复查阅）
--   inspect_consume — 查看一次性：写日志显示 inspect_text + 消耗
-- ============================================================

-- 新列：use_mode 行为模式 + inspect_text 查看时的叙事文本
ALTER TABLE item_pool
  ADD COLUMN IF NOT EXISTS use_mode     TEXT NOT NULL DEFAULT 'consume',
  ADD COLUMN IF NOT EXISTS inspect_text TEXT;

-- 用 CHECK 约束限定值域（如已存在则跳过）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_pool_use_mode_check'
  ) THEN
    ALTER TABLE item_pool
      ADD CONSTRAINT item_pool_use_mode_check
      CHECK (use_mode IN ('consume', 'inspect_keep', 'inspect_consume'));
  END IF;
END $$;

COMMENT ON COLUMN item_pool.use_mode IS
  'consume(默认/有 effect 的消耗品) / inspect_keep(情报，看不消耗) / inspect_consume(情报，查看即消耗)';
COMMENT ON COLUMN item_pool.inspect_text IS
  '当 use_mode IN (inspect_keep, inspect_consume) 时，查看动作会把此文本写入对局日志';

-- 验证查询
-- SELECT name, kind, use_mode, length(inspect_text) FROM item_pool LIMIT 10;
