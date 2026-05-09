-- ═══════════════════════════════════════════════════════════════════
-- 远星函馆 Phase 8.1 — 4 结局（spec §7.1-7.2）
-- ═══════════════════════════════════════════════════════════════════

DELETE FROM endings;

INSERT INTO endings (key, name, description, banner_text, rewards, active)
VALUES
  ('collapse',
   '崩解',
   '环境污染累积至临界，多次未及时退避导致路径不可控，主控层强制熔断 17 号异常段。',
   '异常段已进入视界线……全部归档。残存数据进入静寂。',
   '[{"name":"崩解记录碎片","quantity":1}]'::jsonb,
   TRUE),

  ('purge',
   '清算',
   '全员对入侵实体高效清剿，结构碎片提取受限——主控层判定异常段无残存共存价值。',
   '所有入侵实体已从平台剥离。Ω-段被强制隔离。',
   '[{"name":"清算认证","quantity":1},{"name":"环段部件","quantity":3}]'::jsonb,
   TRUE),

  ('merge',
   '合流',
   '与非敌对实体充分接触且环境污染受控，主控层批准部分文明的结构共存。',
   '结构共存协议已建立。共生体仍在低频运行。',
   '[{"name":"共生协议书","quantity":1},{"name":"Ω物质","quantity":2}]'::jsonb,
   TRUE),

  ('explore',
   '探索',
   '某玩家多次进入 Ω-段并提取足够 Ω 物质，路径图显现新的未确定归属段。',
   '平台路径图新增未确定归属段。深界向你打开。',
   '[{"name":"深界通行证","quantity":1},{"name":"Ω物质","quantity":5}]'::jsonb,
   TRUE);

-- 验证
SELECT key, name, jsonb_array_length(rewards) AS reward_count, active
  FROM endings
 ORDER BY id;
