-- ============================================================
-- Decode Archive（解码档案库）— Phase 14
-- 远星函馆知识循环系统：跨周目持久化的残片发现与解码
-- ============================================================

-- ── 1. fragment_pool: 管理员配置的残片模板池 ──
-- 类似 item_pool / npc_pool，由管理员在后台创建
CREATE TABLE IF NOT EXISTS fragment_pool (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,                    -- 残片标识名（管理用）
  -- 内容分层（decode_level 0→3 逐步展示）
  raw_text     TEXT NOT NULL DEFAULT '',         -- level 0: 完全乱码时的占位符（粒子文字）
  partial_1    TEXT NOT NULL DEFAULT '',         -- level 1: 第一次解码，显示约 30% 内容
  partial_2    TEXT NOT NULL DEFAULT '',         -- level 2: 第二次解码，显示约 70% 内容
  full_text    TEXT NOT NULL DEFAULT '',         -- level 3: 完整可读文本
  -- 分类与发现
  category     TEXT NOT NULL DEFAULT 'general',  -- 分类: general / omega / eden / bubble / structure
  rarity       TEXT NOT NULL DEFAULT 'common',   -- 稀有度: common / uncommon / rare / legendary
  discover_mode TEXT NOT NULL DEFAULT 'search',  -- 发现方式: search（搜索随机）/ fixed（固定交互点）/ both
  maps         INTEGER[] DEFAULT '{}',           -- 可出现的地图 ID 列表（空=所有地图）
  min_pollution INTEGER DEFAULT 0,               -- 最低污染度要求（0=无要求）
  -- 前置条件（可选）
  requires_fragment_id INTEGER DEFAULT NULL,      -- 前置残片 ID（需要先发现某残片才能出现）
  -- 元数据
  weight       REAL DEFAULT 1.0,                 -- 搜索池权重
  enabled      BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ── 2. player_fragments: 玩家跨周目持久化的发现记录 ──
-- 不绑定 room，跨周目持久存在
CREATE TABLE IF NOT EXISTS player_fragments (
  id             SERIAL PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fragment_id    INTEGER NOT NULL REFERENCES fragment_pool(id) ON DELETE CASCADE,
  decode_level   INTEGER NOT NULL DEFAULT 0 CHECK (decode_level BETWEEN 0 AND 3),
  discovered_at  TIMESTAMPTZ DEFAULT now(),       -- 首次发现时间
  last_decoded   TIMESTAMPTZ DEFAULT now(),       -- 最近一次解码时间
  discover_cycle INTEGER DEFAULT NULL,            -- 发现时的周目编号（gamenum）
  -- 唯一约束：每个玩家每个残片只有一条记录
  UNIQUE (user_id, fragment_id)
);

-- ── 3. 索引 ──
CREATE INDEX IF NOT EXISTS idx_player_fragments_user ON player_fragments(user_id);
CREATE INDEX IF NOT EXISTS idx_player_fragments_fragment ON player_fragments(fragment_id);
CREATE INDEX IF NOT EXISTS idx_fragment_pool_category ON fragment_pool(category);
CREATE INDEX IF NOT EXISTS idx_fragment_pool_discover ON fragment_pool(discover_mode);

-- ── 4. RLS 策略 ──
ALTER TABLE fragment_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_fragments ENABLE ROW LEVEL SECURITY;

-- fragment_pool: 所有人可读，仅管理员可写
CREATE POLICY "fragment_pool_read" ON fragment_pool
  FOR SELECT USING (true);

-- player_fragments: 玩家只能读自己的记录
CREATE POLICY "player_fragments_read" ON player_fragments
  FOR SELECT USING (auth.uid() = user_id);

-- player_fragments: 服务端（service_role）可插入/更新
CREATE POLICY "player_fragments_insert" ON player_fragments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "player_fragments_update" ON player_fragments
  FOR UPDATE USING (auth.uid() = user_id);

-- ── 5. 搜索概率规则（插入 game_rules） ──
INSERT INTO game_rules (key, value, description)
VALUES ('search_fragment_chance', '0.12', '搜索时发现残片的基础概率（12%）')
ON CONFLICT (key) DO NOTHING;
