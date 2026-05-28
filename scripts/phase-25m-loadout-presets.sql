-- ============================================================
-- Phase 25m — profiles.saved_loadouts（入场装配预设 / Loadout presets）
-- ============================================================
-- 来源 finding: research-2026-05-12 主题 A "Loadout preset 节省入场摩擦"
-- "profiles 加 saved_loadouts JSONB(3-5 slot) + PrepareModal 顶部 '📋 预设' 下拉。"
--  → 预埋 schema + 应用层 helper + 门控 UI，与 Phase 24b 入场流程一起激活。
--
-- 现状: 每次入场都要在 PrepareModal 重新选职业 / 装备 / 道具 / 兑换，重复摩擦高。
--   缺少"保存一套常用装配、下次一键复用"的持久载体。
--
-- 设计:
--   1. ALTER TABLE 加 saved_loadouts JSONB, DEFAULT '[]'::jsonb（既有玩家全部空数组，无破坏性）
--   2. CHECK 约束：必须是 JSON array 且槽位数 <= LOADOUT_PRESETS.MAX_SLOTS(5)
--      （防客户端写入超额槽位；单个 preset 的内部结构由应用层 sanitizeLoadoutPresets 兜底）
--
-- preset 槽位结构（src/lib/server/loadoutPresets.js 的 single source of truth）:
--   {
--     "name":      "突进流",                       -- 玩家自定义名（截断 24 字）
--     "classId":   12,                             -- 职业候选 id（应用前需校验仍存在）
--     "equip":     [101, 205],                     -- shop_catalog 装备 id 列表（应用前过滤失效 id）
--     "items":     [{"id": 30, "qty": 2}],         -- 消耗/剧情道具 id + 数量
--     "exchanges": [{"rateId": 2, "times": 1}],    -- 兑换汇率 id + 次数
--     "savedAt":   "2026-05-29T06:23:00Z"          -- 保存时间戳（ISO）
--   }
--
-- 应用层语义（src/lib/server/loadoutPresets.js + src/lib/constants.js LOADOUT_PRESETS）:
--   - applyPresetToCart() 把 preset 投影回 PrepareModal cart，并按当前 catalog/rates 过滤失效 id
--     （商店改版后旧 preset 不会引用不存在的商品 → 静默丢弃失效项，不报错）
--   - upsertLoadoutPresets() 保存/覆盖同名 preset，超出 MAX_SLOTS 时拒绝新增（FIFO 提示由 UI 处理）
--   - 纯装配复用，不触碰任何点数/经济（保存预设 ≠ 预扣点数；应用时仍走正常 onConfirm 扣点）
--
-- 兼容:
--   - 既有玩家 saved_loadouts 自动取 DEFAULT '[]'，无需回填
--   - 预埋不启用（LOADOUT_PRESETS.ENABLED=false）：Phase 24b 接入 PrepareModal 预设下拉后才显示
--   - RLS: profiles 自有行更新策略已存在（玩家只能改自己的 profile），无需新策略
--
-- 验证:
--   SELECT count(*) FILTER (WHERE jsonb_array_length(saved_loadouts) = 0) AS empty_presets,
--          count(*) FILTER (WHERE jsonb_array_length(saved_loadouts) > 0) AS with_presets,
--          count(*) FILTER (WHERE saved_loadouts IS NULL) AS nulls  -- 应为 0
--     FROM profiles;
-- ============================================================

BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS saved_loadouts JSONB
  NOT NULL DEFAULT '[]'::jsonb
  CHECK (
    jsonb_typeof(saved_loadouts) = 'array'
    AND jsonb_array_length(saved_loadouts) <= 5
  );

COMMENT ON COLUMN profiles.saved_loadouts IS
  'Phase 25m 玩家保存的入场装配预设数组（最多 5 槽，CHECK 约束）。
   每槽 { name, classId, equip[], items[], exchanges[], savedAt }，由
   src/lib/server/loadoutPresets.js 读写 + PrepareModal 预设下拉消费。
   纯装配复用、不预扣点数；预埋不启用，Phase 24b 接入下拉后才显示。';

COMMIT;

-- 验证 / 演练命令:
-- SELECT count(*) FILTER (WHERE jsonb_array_length(saved_loadouts) = 0) AS empty_presets,
--        count(*) FILTER (WHERE jsonb_array_length(saved_loadouts) > 0) AS with_presets,
--        count(*) FILTER (WHERE saved_loadouts IS NULL) AS nulls  -- 应为 0
--   FROM profiles;
