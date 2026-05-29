-- ============================================================
-- Phase 25p — fragment_cold_cases 断链残片"开放循环"（悬案 / 推测）
-- ============================================================
-- 来源 finding: research-2026-05-29-C P1（主题 C 延伸）
-- "把'……（断链中）……'死胡同改成被追踪的'悬案/推测'条目：拿到 F12 却缺前置
--  F11 时，登记一条 player 可见的'待解悬案'（显示已知碎片 + 缺失锚点提示但不剧透），
--  后续发现前置残片时回溯点亮 + 给小奖励（item_pt 或一次 decode 加速）。
--  困惑→悬念→延迟奖励，匹配 Cultist'再玩一会就 click' + Disco Elysium Thought Cabinet。"
--
-- 现状: fragment_pool.requires_fragment_id 已建链（F07→7 / F12→7 / F13→F12 / F15→12）。
-- discoverFragment 对缺前置的残片"静默过滤"（fragments.js line 136），combo 解锁
-- （evaluateFragmentCombos）则会绕过 requires 把 C 残片直接 upsert 给玩家 —— 于是
-- "持有 F13 却缺前置 F12"的断链态真实存在，但当前完全不可见、不被追踪：玩家读到
-- 断链处只看到死胡同，丢了 Cultist/DE 的"悬念牵引"。本表把断链态登记成被追踪的悬案，
-- 补齐前置锚点时回溯点亮 + 小奖励，把困惑转译成开放循环 + 延迟奖励。
--
-- 设计:
--   1. CREATE TABLE fragment_cold_cases — 每条 = 一个玩家的一个断链态
--      (fragment_id = 已持有的"已知碎片"，missing_anchor_id = 缺失的前置锚点残片)
--   2. status: open（待解悬案）/ resolved（前置已补齐、已回溯点亮）
--   3. reward_kind / reward_amount: 回溯点亮时实际发放奖励的快照（防重复发放 +
--      审计）。奖励类型 / 量值由 src/lib/constants.js COLD_CASES single source of truth
--      决定（decode_accel = 给已补齐的锚点一次解码加速；item_pt = 小额道具点）
--   4. UNIQUE(user_id, fragment_id, missing_anchor_id) 让 detect 可幂等 upsert，
--      不会因反复出勤重复登记同一断链
--
-- 反 PII: 本表只关联玩家自己的残片进度（user_id 自指），无跨玩家 / owner 身份字段，
--   不涉及 28-E 匿名口径。
--
-- 经济红线（economy-canon §3 / §6.1 12% 周通胀）:
--   回溯奖励默认走 decode_accel（纯叙事进度·非经济 faucet）；若 Phase 24b 选 item_pt
--   则量值极小（默认 3）且必须纳入 v_weekly_stash_inflation 监测。class_pt 永不作为
--   本奖励（不加速 legendary 软保底）。reward_granted/reward_amount 防重复注水。
--
-- 兼容:
--   - 表为新建，无既有数据
--   - 预埋不立即启用：detect / resolve / list 由 src/lib/server/coldCases.js 提供，
--     全部受 COLD_CASES.ENABLED 门控（默认 false）+ exception-safe，绝不阻塞残片发现
--   - /codex 悬案区同样受 COLD_CASES.ENABLED 门控，关闭时 0 查询 0 渲染
--
-- 验证:
--   SELECT status, COUNT(*) FROM fragment_cold_cases GROUP BY status;
--   SELECT * FROM fragment_cold_cases WHERE user_id = '<uuid>' AND status = 'open';
-- ============================================================

BEGIN;

-- 1. 断链残片悬案表（每条 = 一个玩家的一个待解 / 已解断链态）
CREATE TABLE IF NOT EXISTS fragment_cold_cases (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fragment_id INTEGER NOT NULL,        -- 玩家已持有、但前置缺失的残片（已知碎片，如 F13）
  missing_anchor_id INTEGER NOT NULL,  -- 缺失的前置锚点残片 id（fragment_pool.id，如 F12）
  status TEXT NOT NULL DEFAULT 'open',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  reward_granted BOOLEAN NOT NULL DEFAULT false,
  reward_kind TEXT,                    -- 回溯发放的奖励类型快照：decode_accel / item_pt
  reward_amount INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT fragment_cold_cases_status_valid CHECK (status IN ('open', 'resolved')),
  CONSTRAINT fragment_cold_cases_no_self CHECK (fragment_id <> missing_anchor_id),
  CONSTRAINT fragment_cold_cases_reward_amount_nonneg CHECK (reward_amount >= 0),
  CONSTRAINT fragment_cold_cases_uniq UNIQUE (user_id, fragment_id, missing_anchor_id)
);

-- 2. /codex 悬案列表查询索引（玩家的全部 open 悬案）
CREATE INDEX IF NOT EXISTS idx_fragment_cold_cases_user_status
  ON fragment_cold_cases(user_id, status);

-- 3. resolve 查询索引（发现某残片时，反查"以它为缺失锚点"的 open 悬案）
CREATE INDEX IF NOT EXISTS idx_fragment_cold_cases_resolve_lookup
  ON fragment_cold_cases(user_id, missing_anchor_id) WHERE status = 'open';

-- 4. 注释
COMMENT ON TABLE fragment_cold_cases IS
  'Phase 25p — 断链残片"开放循环"（悬案/推测）。玩家持有某残片却缺其前置锚点时登记一条 open 悬案，补齐锚点后 resolve + 回溯点亮 + 小奖励（Disco Elysium Thought Cabinet 范式）。预埋不启用，受 COLD_CASES.ENABLED 门控。';
COMMENT ON COLUMN fragment_cold_cases.fragment_id IS
  '玩家已持有的"已知碎片"残片 id（断链的下游端，如 F13）。';
COMMENT ON COLUMN fragment_cold_cases.missing_anchor_id IS
  '缺失的前置锚点残片 id（fragment_pool.id，如 F12）。补齐它即触发 resolve。';
COMMENT ON COLUMN fragment_cold_cases.reward_kind IS
  '回溯点亮时实际发放的奖励类型快照（decode_accel / item_pt），配合 reward_granted 防重复发放。';

COMMIT;
