-- 搜打撤系统 — 合同（任务）系统
-- 在 Supabase SQL Editor 中执行
--
-- 设计：
--   contracts 表：合同模板（管理员创建）
--   player_contracts 表：玩家与合同的进度记录
--
--   合同结构：
--     name, description, objectives (jsonb 数组), rewards (jsonb 数组)
--
--   目标 (objective) 支持的类型：
--     { type: 'find_item',  itemName: '门钥匙', count: 1 }
--     { type: 'kill_npc',   npcName: '暗影领主', count: 1 }
--     { type: 'extract',    count: 1 }                       -- 任意撤离 N 次
--     { type: 'extract_at', extractionPointId: 'gate_east' } -- 指定撤离点撤离
--
--   奖励 (reward) 结构：
--     { name: '金币', quantity: 100 }      -- 道具/材料入账户库

CREATE TABLE IF NOT EXISTS contracts (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT        NOT NULL,
  description  TEXT,
  objectives   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  rewards      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 玩家合同进度
CREATE TABLE IF NOT EXISTS player_contracts (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contract_id   BIGINT      NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  status        TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed')),
  progress      JSONB       NOT NULL DEFAULT '{}'::jsonb,    -- 形如 { "0": 1, "1": 0 }，索引对应 objectives[]
  accepted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  CONSTRAINT player_contracts_unique UNIQUE (user_id, contract_id)
);

CREATE INDEX IF NOT EXISTS idx_player_contracts_user   ON player_contracts (user_id);
CREATE INDEX IF NOT EXISTS idx_player_contracts_status ON player_contracts (user_id, status);

-- 验证
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('contracts', 'player_contracts')
ORDER BY table_name, ordinal_position;
