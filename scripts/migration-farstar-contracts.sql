-- ═══════════════════════════════════════════════════════════════════
-- 远星函馆 Phase 8.1 — 合同（spec §11.1，6 个预置合同）
-- ═══════════════════════════════════════════════════════════════════

DELETE FROM contracts;
-- 注：player_contracts 通过 ON DELETE CASCADE 自动清理

INSERT INTO contracts (name, description, objectives, rewards, active)
VALUES
  ('修复锚点中继',
   '主控层下达：从锚点走廊或废弃投放口取得 3 件环段部件，提交主控层用于稳定锚点-β。',
   '[{"type":"find_item","itemName":"环段部件","count":3}]'::jsonb,
   '[{"name":"结构碎片","quantity":2}]'::jsonb,
   TRUE),

  ('清除残响实体',
   '伊甸港残墟的残响实体浓度过高。击杀 5 个残响实体以恢复区域稳定。',
   '[{"type":"kill_npc","npcName":"残响低语","count":3},
     {"type":"kill_npc","npcName":"裂解残影","count":2}]'::jsonb,
   '[{"name":"环段部件","quantity":2}]'::jsonb,
   TRUE),

  ('提取Ω-段数据',
   '主控层亟需 Ω-段共构扰动样本——前往剪切缓冲带或 Ω-段核心接口寻找。',
   '[{"type":"find_item","itemName":"Ω物质","count":2}]'::jsonb,
   '[{"name":"深界情报","quantity":1}]'::jsonb,
   TRUE),

  ('侦查Ω-段边界',
   '至少一次成功从 Ω-段核心接口（map_id=4）撤离，并且必须从主出口或紧急出口完成结构退避。',
   '[{"type":"extract","count":1}]'::jsonb,
   '[{"name":"结构碎片","quantity":3}]'::jsonb,
   TRUE),

  ('安全撤离',
   '从任意撤离点安全退避一次。最基础的引导者认证任务。',
   '[{"type":"extract","count":1}]'::jsonb,
   '[{"name":"环段部件","quantity":1}]'::jsonb,
   TRUE),

  ('建立共生通信',
   '与共生实体交易，获得共生协议作为通信凭证。',
   '[{"type":"find_item","itemName":"共生协议","count":1}]'::jsonb,
   '[{"name":"通信组件升级","quantity":1}]'::jsonb,
   TRUE);

-- 验证
SELECT name, jsonb_array_length(objectives) AS obj_count,
       jsonb_array_length(rewards) AS reward_count, active
  FROM contracts
 ORDER BY id;
