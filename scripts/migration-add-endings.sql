-- 搜打撤系统 — 多结局
-- 在 Supabase SQL Editor 中执行
--
-- 结局表存储所有可能的结局元数据。
-- 触发结局通过两种方式：
--   1. 分支引擎 branch_nodes 的 do.triggerEnding = 'good_ending' 设置 gamevars.endingTriggered
--   2. 管理员手动通过 DB 控制台插入 endingTriggered
--
-- 房间生命周期 (applyRoomLifecycle) 检测到 endingTriggered 时：
--   gamestate := 2, winner := 结局展示文本
--   gamevars.endingResult = { key, name, banner_text, rewardedItems }
--   奖励物品（如配置）发放到所有存活/撤离玩家的账户库

CREATE TABLE IF NOT EXISTS endings (
  id           BIGSERIAL PRIMARY KEY,
  key          TEXT        NOT NULL UNIQUE,
  name         TEXT        NOT NULL,
  description  TEXT,
  banner_text  TEXT,
  rewards      JSONB       NOT NULL DEFAULT '[]'::jsonb,    -- [{name, quantity}]
  active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_endings_key ON endings (key);

-- 验证
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'endings' ORDER BY ordinal_position;
