-- ═══════════════════════════════════════════════════════════════════
-- DTSV 搜打撤大改造（Phase 0-7）数据库迁移合集
-- ═══════════════════════════════════════════════════════════════════
--
-- 一次性创建：
--   - 6 张新表 (player_stash, contracts, player_contracts,
--              event_pool, branch_nodes, endings)
--   - 2 个新列 (profiles.stash_capacity, map_config.extraction_points)
--   - 相关索引
--
-- 在 Supabase Dashboard → SQL Editor 整段粘贴执行。
-- 全部 IF NOT EXISTS / DEFAULT 写法，重复执行安全。
-- ═══════════════════════════════════════════════════════════════════

-- ── Phase 2：玩家账户库 ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS player_stash (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_name   TEXT        NOT NULL,
  quantity    INTEGER     NOT NULL DEFAULT 1 CHECK (quantity > 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT player_stash_user_item_unique UNIQUE (user_id, item_name)
);
CREATE INDEX IF NOT EXISTS idx_player_stash_user ON player_stash (user_id);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stash_capacity INTEGER NOT NULL DEFAULT 40;

-- ── Phase 3：撤离点 ──────────────────────────────────────────
ALTER TABLE map_config
  ADD COLUMN IF NOT EXISTS extraction_points JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ── Phase 4：合同 / 任务 ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT        NOT NULL,
  description  TEXT,
  objectives   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  rewards      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS player_contracts (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contract_id   BIGINT      NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  status        TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','failed')),
  progress      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  accepted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  CONSTRAINT player_contracts_unique UNIQUE (user_id, contract_id)
);
CREATE INDEX IF NOT EXISTS idx_player_contracts_user   ON player_contracts (user_id);
CREATE INDEX IF NOT EXISTS idx_player_contracts_status ON player_contracts (user_id, status);

-- ── Phase 5：事件库 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_pool (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT        NOT NULL,
  description  TEXT,
  trigger      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  effects      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  weight       NUMERIC     NOT NULL DEFAULT 1.0,
  once         BOOLEAN     NOT NULL DEFAULT FALSE,
  cooldown     INTEGER     NOT NULL DEFAULT 0,
  active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_pool_active ON event_pool (active);

-- ── Phase 6：分支节点 ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branch_nodes (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT        NOT NULL,
  description TEXT,
  conditions  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  branches    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  once        BOOLEAN     NOT NULL DEFAULT TRUE,
  scope       TEXT        NOT NULL DEFAULT 'room' CHECK (scope IN ('room','player')),
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_branch_nodes_active ON branch_nodes (active);

-- ── Phase 7：多结局 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS endings (
  id           BIGSERIAL PRIMARY KEY,
  key          TEXT        NOT NULL UNIQUE,
  name         TEXT        NOT NULL,
  description  TEXT,
  banner_text  TEXT,
  rewards      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_endings_key ON endings (key);

-- ═══════════════════════════════════════════════════════════════════
-- 验证（执行后查看返回结果应该看到全部新表 / 列）
-- ═══════════════════════════════════════════════════════════════════
SELECT 'player_stash'      AS tbl, COUNT(*) AS rows FROM player_stash
UNION ALL SELECT 'contracts',          COUNT(*) FROM contracts
UNION ALL SELECT 'player_contracts',   COUNT(*) FROM player_contracts
UNION ALL SELECT 'event_pool',         COUNT(*) FROM event_pool
UNION ALL SELECT 'branch_nodes',       COUNT(*) FROM branch_nodes
UNION ALL SELECT 'endings',            COUNT(*) FROM endings;

SELECT 'profiles.stash_capacity'    AS check_column, column_default
  FROM information_schema.columns
 WHERE table_name = 'profiles' AND column_name = 'stash_capacity'
UNION ALL
SELECT 'map_config.extraction_points', column_default
  FROM information_schema.columns
 WHERE table_name = 'map_config' AND column_name = 'extraction_points';
