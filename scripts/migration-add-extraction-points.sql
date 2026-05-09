-- 搜打撤系统 — 撤离点配置
-- 在 Supabase SQL Editor 中执行
--
-- 设计：
--   每张地图可配置多个撤离点（jsonb 数组）。
--   撤离点结构：
--     {
--       id: 'gate_east',          // 撤离点 ID（地图内唯一）
--       name: '东门',
--       description: '...',
--       openAt: 300,              // raid 开始多少秒后开放（默认 0 = 立即可用）
--       closeAt: null | 600,      // 撤离点关闭时间（null = 永不关闭）
--       requiredItem: null | '门钥匙',  // 需要持有的物品（null = 无要求）
--       consumeItem: false        // 是否消耗该物品
--     }
--
--   玩家撤离条件：
--     1. 还活着 + 不在战斗中
--     2. 当前 map_id 匹配
--     3. 当前时间在 openAt 与 closeAt 之间
--     4. 若 requiredItem 不为空，背包中持有该物品
--
--   撤离效果：
--     1. 背包道具与装备实例转入账户库
--     2. 玩家标记为 extracted = true
--     3. 移除 profiles.roomid（玩家离开房间）

ALTER TABLE map_config
  ADD COLUMN IF NOT EXISTS extraction_points JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 验证
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'map_config' AND column_name = 'extraction_points';
