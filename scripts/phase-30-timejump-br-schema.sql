-- ═══════════════════════════════════════════════════════════════════════
-- Phase 30 — 虚拟空间 · 时间跳跃BR 基础 schema（加性·幂等·不动现有 live game）
-- 设计宪法：docs/timejump-br-design.md
--
-- 双属性消解悖论（验毒针矩阵 §3）：
--   ① 可写·全局   → br_match_events + br_match_room_state（物理/物资/尸体）
--   ② 只读·按深度 → br_zone_tables（禁区表 + 物资档位）
--   静态·只读     → br_rooms（100 房拓扑）
--   🚫 可写·按深度 = 结构性不存在（悖论温床，永不建表）
--
-- 全部 br_* 新表，CREATE IF NOT EXISTS + ON CONFLICT DO NOTHING，可重跑。
-- ═══════════════════════════════════════════════════════════════════════

-- ── 静态拓扑（只读·全局）──────────────────────────────────────────────
-- 100 房 + 邻接图。虚拟空间中性命名（扇区/区段），不用伊甸港/Ω-段（弱化远星表层 §6）。
CREATE TABLE IF NOT EXISTS br_rooms (
  room_id      INTEGER PRIMARY KEY,                   -- 1..100
  label        TEXT     NOT NULL DEFAULT '',          -- 前台房名（中性术语）
  region       TEXT     NOT NULL DEFAULT '',          -- 分区
  neighbor_ids INTEGER[] NOT NULL DEFAULT '{}',       -- 邻接房间（移动图）
  grid_x       INTEGER,                               -- 布局坐标（admin 可视化用）
  grid_y       INTEGER,
  close_phase  INTEGER  NOT NULL DEFAULT 5,           -- 该房在哪个阶段进入禁区（5=末路也不关，最终 20 房）
  enabled      BOOLEAN  NOT NULL DEFAULT true
);

-- ── 禁区表 + 物资档位（属性②：只读·按深度·分版本）─────────────────────
-- 预设菜单。深度只是"读哪一行"的镜片。缩圈 = forbidden 集合随 phase 单调增长。
-- 任何代码路径都不得 UPDATE 本表的对局态（它是预设，不是事件）。
CREATE TABLE IF NOT EXISTS br_zone_tables (
  phase        INTEGER NOT NULL,                      -- 有效阶段 0..max_phase
  room_id      INTEGER NOT NULL,
  is_forbidden BOOLEAN NOT NULL DEFAULT false,        -- 该有效阶段下此房是否禁区（踏入即死）
  loot_tier    INTEGER NOT NULL DEFAULT 1,            -- 该阶段此房物资档位 T1..T5
  PRIMARY KEY (phase, room_id)
);

-- ── 对局实例（大时钟锚点）─────────────────────────────────────────────
-- 当前真实阶段 = min(max_phase, floor((now - started_at)/phase_seconds))，不落库（崩溃安全）。
CREATE TABLE IF NOT EXISTS br_matches (
  id            BIGSERIAL PRIMARY KEY,
  status        TEXT NOT NULL DEFAULT 'lobby',        -- lobby / active / ended
  started_at    TIMESTAMPTZ,                          -- 大时钟锚点（active 时设）
  ended_at      TIMESTAMPTZ,
  phase_seconds INTEGER NOT NULL DEFAULT 900,         -- 每阶段秒数（默认 900=15min；测试可短）
  max_phase     INTEGER NOT NULL DEFAULT 4,           -- 末路阶段编号
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 事件日志（属性①：可写·全局·唯一可改写世界的层）───────────────────
-- id BIGSERIAL = 全局唯一定序（§11 事件定序，消除 race condition）。
-- 物理状态由本表按 (clock_phase 升序, id 升序) 折叠 → 后写覆盖前写。
CREATE TABLE IF NOT EXISTS br_match_events (
  id          BIGSERIAL PRIMARY KEY,
  match_id    BIGINT NOT NULL REFERENCES br_matches(id) ON DELETE CASCADE,
  seq         BIGINT NOT NULL DEFAULT 0,              -- match 内序号（冗余，便于分片/回放）
  clock_phase INTEGER NOT NULL,                       -- 事件时钟戳（发生时真实阶段）
  event_type  TEXT NOT NULL,                          -- bomb/repair/loot/death/extract/move/jump/...
  room_id     INTEGER,                                -- 关联房间
  actor_id    UUID,                                   -- 发起玩家
  target_id   UUID,                                   -- 目标玩家（PvP/收尸）
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_br_events_match_clock ON br_match_events (match_id, clock_phase, id);
CREATE INDEX IF NOT EXISTS idx_br_events_match_room  ON br_match_events (match_id, room_id);

-- ── 玩家对局态 ────────────────────────────────────────────────────────
-- 有效阶段 = min(max_phase, 真实阶段 + depth)。is_jumper = depth>0（冗余便于查询）。
CREATE TABLE IF NOT EXISTS br_match_players (
  match_id     BIGINT NOT NULL REFERENCES br_matches(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL,
  room_id      INTEGER,                               -- 当前所在房间
  depth        INTEGER NOT NULL DEFAULT 0,            -- 跳跃深度（单向递增）
  hp           INTEGER NOT NULL DEFAULT 100,
  max_hp       INTEGER NOT NULL DEFAULT 100,
  alive        BOOLEAN NOT NULL DEFAULT true,
  is_jumper    BOOLEAN NOT NULL DEFAULT false,        -- depth>0 派生
  gear         JSONB NOT NULL DEFAULT '{}'::jsonb,    -- 入场装配快照（复用 24b 经济）
  inventory    JSONB NOT NULL DEFAULT '[]'::jsonb,    -- 携带物资（撤离折算点数）
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  died_at      TIMESTAMPTZ,
  extracted_at TIMESTAMPTZ,
  PRIMARY KEY (match_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_br_players_match_alive ON br_match_players (match_id, alive);

-- ── 派生房间现状缓存（属性① 折叠，读快用；真相仍是事件日志）─────────────
CREATE TABLE IF NOT EXISTS br_match_room_state (
  match_id       BIGINT NOT NULL REFERENCES br_matches(id) ON DELETE CASCADE,
  room_id        INTEGER NOT NULL,
  physical_state TEXT NOT NULL DEFAULT 'intact',      -- intact / bombed / repaired
  state_clock    INTEGER NOT NULL DEFAULT 0,          -- 最近物理状态变更的时钟戳（后写覆盖）
  loot_remaining JSONB NOT NULL DEFAULT '{}'::jsonb,  -- 物资守恒（只减不增）
  last_event_seq BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, room_id)
);

-- ═══════════════════════════════════════════════════════════════════════
-- 种子数据（占位拓扑：10×10 网格，邻接 4 向。admin 后续可手工调）
-- ═══════════════════════════════════════════════════════════════════════

-- 100 房：label 形如「扇区 A-01」，region「区段 A」，邻接为正交格点。
-- close_phase 按 20 房/阶段分桶（1-20→1, 21-40→2, 41-60→3, 61-80→4, 81-100→不关）。
INSERT INTO br_rooms (room_id, label, region, neighbor_ids, grid_x, grid_y, close_phase)
SELECT
  g,
  '扇区 ' || chr(65 + ((g - 1) / 10)) || '-' || lpad(((((g - 1) % 10)) + 1)::text, 2, '0'),
  '区段 ' || chr(65 + ((g - 1) / 10)),
  array_remove(ARRAY[
    CASE WHEN ((g - 1) % 10) > 0 THEN g - 1  END,
    CASE WHEN ((g - 1) % 10) < 9 THEN g + 1  END,
    CASE WHEN ((g - 1) / 10) > 0 THEN g - 10 END,
    CASE WHEN ((g - 1) / 10) < 9 THEN g + 10 END
  ], NULL),
  ((g - 1) % 10),
  ((g - 1) / 10),
  CASE WHEN g <= 20 THEN 1 WHEN g <= 40 THEN 2 WHEN g <= 60 THEN 3 WHEN g <= 80 THEN 4 ELSE 5 END
FROM generate_series(1, 100) AS g
ON CONFLICT (room_id) DO NOTHING;

-- 禁区表：phase 0..4 × room 1..100。is_forbidden = (phase >= 该房 close_phase)；loot_tier = phase+1。
-- 开放房数：phase0=100 / phase1=80 / phase2=60 / phase3=40 / phase4=20。
INSERT INTO br_zone_tables (phase, room_id, is_forbidden, loot_tier)
SELECT
  p,
  r.room_id,
  (p >= r.close_phase),
  (p + 1)
FROM generate_series(0, 4) AS p
CROSS JOIN br_rooms AS r
ON CONFLICT (phase, room_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 验证（部署后 pg_execute_query 跑）
-- ═══════════════════════════════════════════════════════════════════════
-- SELECT count(*) AS rooms FROM br_rooms;                         -- 期望 100
-- SELECT phase, count(*) FILTER (WHERE NOT is_forbidden) AS open  -- 期望 100/80/60/40/20
--   FROM br_zone_tables GROUP BY phase ORDER BY phase;
-- SELECT room_id, label, neighbor_ids, close_phase FROM br_rooms ORDER BY room_id LIMIT 5;
