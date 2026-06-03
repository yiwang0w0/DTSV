-- ═══════════════════════════════════════════════════════════════════
-- phase-25o — Starter contract 链（research-2026-05-12 P1）
--   4 个新手 quest，复用现有 contracts 系统：
--     首撤离  → objective extract
--     首击杀  → objective kill_any（任意击杀，新增类型）
--     首购买  → objective purchase（新增类型，joinRoom 购买后触发 'purchased' 事件）
--     首探针  → objective leave_probe（新增类型，extractPlayer 留探针后触发 'probe_left' 事件）
--
--   幂等：按 name WHERE NOT EXISTS 插入，已存在则跳过。
--   非破坏：不 DELETE / TRUNCATE 现有 contracts（与 Phase 8.1 seed 的 DELETE 重置不同）。
--   奖励：使用 item_pool 现存基础材料（环段部件 / 结构碎片），小额，不超出既有 onboarding 量级。
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO contracts (name, description, objectives, rewards, active)
SELECT v.name, v.description, v.objectives::jsonb, v.rewards::jsonb, TRUE
FROM (VALUES
  ('新手契约·首次撤离',
   '引导者认证第一步：从任意撤离点成功退避一次。',
   '[{"type":"extract","count":1}]',
   '[{"name":"环段部件","quantity":1}]'),

  ('新手契约·首次交锋',
   '击败任意一个实体，证明你能在异常环境中自卫。',
   '[{"type":"kill_any","count":1}]',
   '[{"name":"结构碎片","quantity":1}]'),

  ('新手契约·首次装载',
   '在准备界面用点数购买至少一件装备或物资，完成首次装载。',
   '[{"type":"purchase","count":1}]',
   '[{"name":"环段部件","quantity":1}]'),

  ('新手契约·首座探针',
   '撤离时留下一道残影，让你的痕迹延续到其他幸存者的旅程。',
   '[{"type":"leave_probe","count":1}]',
   '[{"name":"结构碎片","quantity":1}]')
) AS v(name, description, objectives, rewards)
WHERE NOT EXISTS (
  SELECT 1 FROM contracts c WHERE c.name = v.name
);

-- 验证
SELECT id, name, jsonb_array_length(objectives) AS obj_count,
       jsonb_array_length(rewards) AS reward_count, active
  FROM contracts
 WHERE name LIKE '新手契约%'
 ORDER BY id;
