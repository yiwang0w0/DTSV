-- 搜打撤系统 — 事件系统
-- 在 Supabase SQL Editor 中执行
--
-- 事件 = 一段游戏内可触发的内容片段。可以挂载在地图上、撤离点上、
-- 或由分支系统直接触发。事件本身只描述「触发条件」与「效果」，
-- 不区分剧情/陷阱/奖励 — 一切都通过 effects 数组的多个 effect 组合。
--
-- 事件结构：
--   {
--     id, name, description,
--     trigger: { type, ... },         // 触发条件
--     effects: [ { type, ... } ],     // 效果序列
--     weight: 1.0,                    // 多事件竞争时的权重
--     once: false,                    // 是否每个玩家只触发一次
--     cooldown: 0,                    // 同一玩家两次触发的最少回合数
--   }
--
-- 触发器 (trigger.type)：
--   on_search       玩家在指定地图搜索时（map: id 或 -1 任意）
--   on_enter_map    玩家移动到指定地图
--   on_kill_npc     玩家击杀指定 NPC
--   on_pickup       玩家获得指定物品
--
-- 效果 (effect.type)：
--   give_item       给玩家物品（写入 inventory）
--   take_item       扣除玩家物品
--   damage          直接对玩家扣 HP
--   heal            回复 HP
--   spawn_npc       在玩家所在地图生成一个 NPC（强制战斗）
--   log_only        仅添加日志条目
--   set_flag        在 gamevars.flags[name]=value（供分支引擎读取）
--   inc_flag        gamevars.flags[name] += value
--   trigger_battle  立即进入与某 NPC 的战斗
--
-- map_config 增加 events 列：jsonb 数组，存事件 ID 列表（可选——用于按地图绑定）

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

-- 验证
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'event_pool'
ORDER BY ordinal_position;
