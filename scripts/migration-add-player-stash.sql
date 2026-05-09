-- 搜打撤系统 — 玩家账户库（stash）
-- 在 Supabase SQL Editor 中执行
--
-- 设计：
--   * 普通道具（消耗品/材料）按 item_name 堆叠在 player_stash 表
--   * 装备（equipment_instances）已有 room_id 字段，约定 room_id IS NULL 时为"在库中"
--   * 占用格子数 = (player_stash 中独立 item_name 数) + (equipment_instances 中 owner_id=user 且 room_id IS NULL 的数量)
--   * 上限由 profiles.stash_capacity 控制（默认 40）

-- 1. 玩家账户库（消耗品/材料堆叠）
CREATE TABLE IF NOT EXISTS player_stash (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_name   TEXT        NOT NULL,
  quantity    INTEGER     NOT NULL DEFAULT 1 CHECK (quantity > 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT player_stash_user_item_unique UNIQUE (user_id, item_name)
);

CREATE INDEX IF NOT EXISTS idx_player_stash_user ON player_stash (user_id);

-- 2. 玩家档案：账户库容量（格子数）
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stash_capacity INTEGER NOT NULL DEFAULT 40;

-- 3. 验证
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'player_stash';

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'stash_capacity';
