-- 搜打撤系统 — 分支节点（剧情条件引擎）
-- 在 Supabase SQL Editor 中执行
--
-- 分支节点描述"满足某些条件时进入哪个分支"。
-- 由游戏行为驱动评估，可以触发事件 / 设置 flag / 直接结局。
--
-- 节点结构：
--   {
--     name, description,
--     conditions: [ {type, ...} ],  -- 条件清单
--     branches: [
--       { when: 'all',                    do: { triggerEventId: 5 } },
--       { when: { atLeast: 8 },           do: { setFlags: { branch: 'true' } } },
--       { when: { atLeast: 5 },           do: { triggerEnding: 'good' } },
--       { when: 'default',                do: { triggerEnding: 'bad' } },
--     ],
--     once: true,           -- 节点匹配后是否禁用（默认 true）
--     scope: 'room',        -- 'room' (房间级共享) | 'player' (玩家级独立)
--     active: true,
--   }
--
-- 条件类型 (condition.type)：
--   flagEquals        flags[key] === value
--   flagAtLeast       flags[key] >= value
--   anyPlayerHas      任一玩家 inventory 含 itemName
--   allPlayersHave    全员 inventory 含 itemName
--   anyPlayerKilled   eventHistory 中含某 npc 的击杀（暂用 contracts 表近似）
--   mapVisited        flags 'visited_map_<id>' 为 true
--   extractedCount    撤离人数 >= count
--   aliveCount        存活人数 op value（op: '<=' | '>=' | '=='）
--   playerCount       总参与人数 op value
--
-- 聚合器 (when):
--   'all'                所有条件都满足
--   'any'                任一条件满足
--   { atLeast: N }       至少 N 个满足
--   { atMost: N }        最多 N 个满足
--   { exactly: N }       恰好 N 个满足
--   'default'            兜底（其他都不匹配时）

CREATE TABLE IF NOT EXISTS branch_nodes (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT        NOT NULL,
  description TEXT,
  conditions  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  branches    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  once        BOOLEAN     NOT NULL DEFAULT TRUE,
  scope       TEXT        NOT NULL DEFAULT 'room' CHECK (scope IN ('room', 'player')),
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_branch_nodes_active ON branch_nodes (active);

-- 验证
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'branch_nodes' ORDER BY ordinal_position;
