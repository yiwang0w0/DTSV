-- ═══════════════════════════════════════════════════════════════════
-- 远星函馆 Phase 8.1 — 一键迁移合集
-- ═══════════════════════════════════════════════════════════════════
-- 一次性应用全部 farstar 改造：
--   1. map_config schema 重构 + 7 张地图
--   2. 4 装备 series + 8 tiers
--   3. npc_pool schema + 4 类实体（10 种 NPC）
--   4. item_pool 重新灌数据（4 kinds，13 种物品）
--   5. event_pool 8 个预置事件
--   6. contracts 6 个预置合同
--   7. endings 4 个结局
--   8. branch_nodes 4 个判定节点
--
-- ⚠️ 破坏性操作：
--   - DELETE FROM rooms（旧对局清零）
--   - DELETE FROM map_config（旧 35 张地图清零）
--   - DELETE FROM item_pool / event_pool / contracts / endings / branch_nodes
--   - 装备 series + tiers 是 ADDITIVE，不删旧数据
--   - npc_pool 全部重置为新 4 类实体
--
-- 在 Supabase Dashboard → SQL Editor 整段粘贴执行。
-- 重复执行需要先 DROP 之前的 INSERT 后重跑（DELETE 覆盖部分场景）。
-- ═══════════════════════════════════════════════════════════════════

-- ╔════════════════════════════════════════════════════════════════╗
-- ║ Part 1 / 8 — map_config schema + 7 地图                        ║
-- ╚════════════════════════════════════════════════════════════════╝
ALTER TABLE map_config DROP COLUMN IF EXISTS extraction_points;
ALTER TABLE map_config
  ADD COLUMN IF NOT EXISTS description      TEXT,
  ADD COLUMN IF NOT EXISTS max_players      INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS pollution_base   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pollution_accel  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjacent_maps    JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_exit          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS exit_cost        JSONB,
  ADD COLUMN IF NOT EXISTS omega_window     INTEGER NOT NULL DEFAULT 0;

DELETE FROM rooms;
DELETE FROM map_config;

INSERT INTO map_config (map_id, name, description, weather, blocked,
                        pollution_base, pollution_accel, adjacent_maps,
                        is_exit, exit_cost, omega_window, max_players, max_items, max_npcs)
VALUES
  (0, '外环维护廊', '塌陷环带最外层，残存通行轨道与维护节点', 'clear', FALSE,
      0, 0, '[1]'::jsonb, TRUE, NULL, 0, 10, 5, 2),
  (1, '锚点走廊', '原稳定锚点(Anchor-β)残段，泡层壳体嵌入', 'fog', FALSE,
      45, 0, '[0,2,10]'::jsonb, FALSE, NULL, 0, 10, 6, 3),
  (2, '伊甸港残墟', '原投放模块区3号干道，扰动缓冲层堆积', 'storm', FALSE,
      65, 0, '[1,3,11]'::jsonb, FALSE, NULL, 0, 10, 7, 4),
  (3, '剪切界面缓冲带', '贴近黑洞能层边缘，结构缓慢变化区', 'snow', FALSE,
      85, 3, '[2,4]'::jsonb, FALSE, NULL, 0, 10, 6, 4),
  (4, 'Ω-段核心接口', '未归档主控路径本体，泡层与平台共构区', 'night', FALSE,
      100, 8, '[3]'::jsonb, FALSE, NULL, 3, 10, 4, 5),
  (10, '废弃投放口', '锚点走廊分叉，可作紧急撤离出口', 'rain', FALSE,
      50, 0, '[1]'::jsonb, TRUE, '{"item":"环段部件","qty":1}'::jsonb, 0, 10, 4, 2),
  (11, '旧伊甸港-3通道', '伊甸港残墟分叉，可作紧急撤离出口', 'fog', FALSE,
      70, 0, '[2]'::jsonb, TRUE, '{"item":"环段部件","qty":1}'::jsonb, 0, 10, 4, 2);

-- ╔════════════════════════════════════════════════════════════════╗
-- ║ Part 2 / 8 — equipment_series + equipment_tiers (ADDITIVE)     ║
-- ╚════════════════════════════════════════════════════════════════╝
INSERT INTO equipment_series (name, slot, icon)
VALUES
  ('探测设备', 'probe',  '🔍'),
  ('防护装置', 'shield', '🛡️'),
  ('武器模组', 'weapon', '⚔️'),
  ('通信组件', 'comm',   '📡')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  probe_id  BIGINT;
  shield_id BIGINT;
  weapon_id BIGINT;
  comm_id   BIGINT;
BEGIN
  SELECT id INTO probe_id  FROM equipment_series WHERE slot = 'probe'  AND name = '探测设备' LIMIT 1;
  SELECT id INTO shield_id FROM equipment_series WHERE slot = 'shield' AND name = '防护装置' LIMIT 1;
  SELECT id INTO weapon_id FROM equipment_series WHERE slot = 'weapon' AND name = '武器模组' LIMIT 1;
  SELECT id INTO comm_id   FROM equipment_series WHERE slot = 'comm'   AND name = '通信组件' LIMIT 1;

  INSERT INTO equipment_tiers (series_id, tier, rarity, variant, name, base_atk, base_def, durability_max)
  VALUES
    (probe_id,  1, 'common', NULL, '扫描探测器',   0,  0, 100),
    (probe_id,  2, 'rare',   NULL, '深探测器',     0,  0, 150),
    (shield_id, 1, 'common', NULL, '防护罩-轻型',  0,  5, 100),
    (shield_id, 2, 'rare',   NULL, '防护罩-重型',  0, 10, 150),
    (weapon_id, 1, 'common', NULL, '武器模组-斩',  8,  0,  80),
    (weapon_id, 2, 'rare',   NULL, '武器模组-爆', 12,  0, 120),
    (comm_id,   1, 'common', NULL, '通信组件-基础', 0,  0, 100),
    (comm_id,   2, 'rare',   NULL, '通信组件-高级', 0,  0, 150)
  ON CONFLICT DO NOTHING;
END $$;

-- ╔════════════════════════════════════════════════════════════════╗
-- ║ Part 3 / 8 — npc_pool schema + 10 entities                     ║
-- ╚════════════════════════════════════════════════════════════════╝
ALTER TABLE npc_pool
  ADD COLUMN IF NOT EXISTS entity_type        TEXT,
  ADD COLUMN IF NOT EXISTS hostile            BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS tradeable          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS trade_wants        JSONB,
  ADD COLUMN IF NOT EXISTS trade_offers       JSONB,
  ADD COLUMN IF NOT EXISTS pollution_on_kill  INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS spawn_weight       NUMERIC NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS min_pollution      INTEGER NOT NULL DEFAULT 0;

DELETE FROM npc_pool;

INSERT INTO npc_pool (name, hp, atk, def, exp, level, maps,
                      entity_type, hostile, pollution_on_kill, spawn_weight, min_pollution)
VALUES
  ('残响低语',      35,  8,  4, 12, 'easy',   '[1,2]'::jsonb,    'remnant', TRUE,  4, 1.0,  0),
  ('裂解残影',      60, 14,  6, 20, 'medium', '[2,3]'::jsonb,    'remnant', TRUE,  5, 0.9, 30),
  ('泡层主权',     120, 22, 12, 50, 'hard',   '[3,4]'::jsonb,    'remnant', TRUE,  8, 0.7, 60),
  ('Ω-段守望者',   200, 30, 18,100, 'boss',   '[4]'::jsonb,      'remnant', TRUE, 12, 0.4, 80),
  ('伪装信号',      50, 18,  5, 25, 'medium', '[2,3]'::jsonb,    'infiltrator', TRUE, 6, 0.6, 40),
  ('伪造编号-7',    90, 25, 10, 45, 'hard',   '[3,4]'::jsonb,    'infiltrator', TRUE, 8, 0.4, 65);

INSERT INTO npc_pool (name, hp, atk, def, exp, level, maps,
                      entity_type, hostile, tradeable, trade_wants, trade_offers,
                      pollution_on_kill, spawn_weight, min_pollution)
VALUES
  ('共生节点-α',    80,  5,  8, 0, 'medium', '[2,3]'::jsonb,
   'symbiote', FALSE, TRUE,
   '{"item":"环段部件","qty":1}'::jsonb,
   '{"item":"Ω物质","qty":1}'::jsonb,
   2, 0.5, 50),
  ('共生节点-β',   100,  6, 10, 0, 'hard',   '[3,4]'::jsonb,
   'symbiote', FALSE, TRUE,
   '{"item":"环段部件","qty":2}'::jsonb,
   '{"item":"Ω物质","qty":3}'::jsonb,
   2, 0.4, 70),
  ('观察者-Ι',      60,  4,  6, 0, 'medium', '[3,4]'::jsonb,
   'observer', FALSE, TRUE,
   '{"item":"结构碎片","qty":1}'::jsonb,
   '{"item":"深界情报","qty":1}'::jsonb,
   1, 0.4, 60),
  ('观察者-Ω',      80,  5,  8, 0, 'hard',   '[4]'::jsonb,
   'observer', FALSE, TRUE,
   '{"item":"结构碎片","qty":2}'::jsonb,
   '{"item":"深界情报","qty":2}'::jsonb,
   1, 0.3, 80);

-- ╔════════════════════════════════════════════════════════════════╗
-- ║ Part 4 / 8 — item_pool 13 items                                ║
-- ╚════════════════════════════════════════════════════════════════╝
DELETE FROM item_pool;

-- tech_fragment
INSERT INTO item_pool (name, kind, sub_kind, atk, def, heal, amount, maps, description) VALUES
  ('结构碎片',     'tech_fragment', NULL, 0, 0, 0, 3, '[1,2,3,4]'::jsonb, '泡层文明残响数据，可提交主控层'),
  ('锚点稳定协议', 'tech_fragment', NULL, 0, 0, 0, 2, '[1,2]'::jsonb,     '锚点-β 稳定协议片段'),
  ('语言压缩算法', 'tech_fragment', NULL, 0, 0, 0, 2, '[2,3]'::jsonb,     '泡层文明语言模型残档'),
  ('深界情报',     'tech_fragment', NULL, 0, 0, 0, 1, '[3,4]'::jsonb,     '观察实体交易获得，标记深界路径');

-- platform_part
INSERT INTO item_pool (name, kind, sub_kind, atk, def, heal, amount, maps, description) VALUES
  ('环段部件',         'platform_part', NULL, 0, 0, 0, 4, '[0,1,2,10,11]'::jsonb, '可修复结构/降低污染/作为撤离消耗'),
  ('缓冲材料',         'platform_part', NULL, 0, 0, 0, 3, '[1,2]'::jsonb,         '伊甸港接口缓冲材料'),
  ('伊甸港接口残件',   'platform_part', NULL, 0, 0, 0, 2, '[2,11]'::jsonb,        '原稳定锚点接口碎件');

-- omega_matter
INSERT INTO item_pool (name, kind, sub_kind, atk, def, heal, amount, maps, description) VALUES
  ('Ω物质',         'omega_matter', NULL, 0, 0, 0, 2, '[3,4]'::jsonb, '动态重排数据块，归档触发结局分支'),
  ('共构扰动样本', 'omega_matter', NULL, 0, 0, 0, 1, '[4]'::jsonb,   'Ω-段共构扰动采样');

-- consumable
INSERT INTO item_pool (name, kind, sub_kind, atk, def, heal, amount, maps, description) VALUES
  ('结构修复包',   'consumable', NULL, 0, 0, 30, 5, '[0,1,2,10,11]'::jsonb, '回复 30 HP'),
  ('认知稳定剂',   'consumable', NULL, 0, 0,  0, 4, '[1,2,3]'::jsonb,       '使用后立即降低个人污染 -10%'),
  ('结构强化液',   'consumable', NULL, 0, 5,  0, 3, '[2,3]'::jsonb,         '使用后获得短暂 DEF+5 buff'),
  ('共生协议',     'consumable', NULL, 0, 0,  0, 0, '[]'::jsonb,            '共生实体交易获得，可作为合同任务凭证');

-- ╔════════════════════════════════════════════════════════════════╗
-- ║ Part 5 / 8 — event_pool 8 events                               ║
-- ╚════════════════════════════════════════════════════════════════╝
DELETE FROM event_pool;

INSERT INTO event_pool (name, description, trigger, effects, weight, once, cooldown, active) VALUES
('锚点残响', '锚点-β 残段在搜索中泛起回响，掉落一片结构碎片。',
 '{"type":"on_search","mapId":1}'::jsonb,
 '[{"type":"give_item","itemName":"结构碎片","count":1},
   {"type":"log_only","text":"残存的锚点稳定协议在你指尖静电中显形。"}]'::jsonb,
 1.0, FALSE, 2, TRUE),

('泡层壳体裂解', '伊甸港残墟的泡层壳体出现裂缝，残响实体倾泻而出。',
 '{"type":"on_search","mapId":2}'::jsonb,
 '[{"type":"spawn_npc","entity_type":"remnant"},
   {"type":"set_flag","key":"shellBreach","value":true,"silent":true}]'::jsonb,
 0.8, FALSE, 3, TRUE),

('Ω-段脉冲', 'Ω-段核心接口爆发未归档脉冲，神经协议过载。',
 '{"type":"on_enter_map","mapId":4}'::jsonb,
 '[{"type":"damage","amount":10},
   {"type":"inc_flag","key":"omegaPulse","value":1,"silent":true},
   {"type":"log_only","text":"接口共振使你的认知短暂坍缩。"}]'::jsonb,
 1.0, FALSE, 0, TRUE),

('伪装识别失败', '你检索到的编号其实是伪造的——对方先动了手。',
 '{"type":"on_search","mapId":2}'::jsonb,
 '[{"type":"spawn_npc","entity_type":"infiltrator"},
   {"type":"log_only","text":"你身后的引导者编号正在快速重组——不是同伴。"}]'::jsonb,
 0.6, FALSE, 4, TRUE),

('伪装识别失败-3区', '剪切界面缓冲带的电磁噪声让你错过了关键 ID 校验。',
 '{"type":"on_search","mapId":3}'::jsonb,
 '[{"type":"spawn_npc","entity_type":"infiltrator"},
   {"type":"log_only","text":"伪造编号在你信任校验位之后启动了攻击协议。"}]'::jsonb,
 0.6, FALSE, 4, TRUE),

('共生体信号', '剪切缓冲带泛起非敌对脉冲——共生节点请求接触。',
 '{"type":"on_enter_map","mapId":3}'::jsonb,
 '[{"type":"spawn_npc","entity_type":"symbiote"},
   {"type":"log_only","text":"一个温热的脉冲穿过你的传感器；请求建立非战斗连接。"}]'::jsonb,
 0.5, FALSE, 0, TRUE),

('结构修复窗口', '锚点走廊的接口节点暴露出可拆卸的环段部件。',
 '{"type":"on_search","mapId":1}'::jsonb,
 '[{"type":"give_item","itemName":"环段部件","count":1},
   {"type":"log_only","text":"接口已松动——你成功摘下一块完好的环段部件。"}]'::jsonb,
 0.7, FALSE, 3, TRUE),

('结构修复窗口-10区', '废弃投放口的备用接口仍在低功耗运行。',
 '{"type":"on_search","mapId":10}'::jsonb,
 '[{"type":"give_item","itemName":"环段部件","count":1},
   {"type":"log_only","text":"备用接口的固件还在工作——你拆下了一块部件。"}]'::jsonb,
 0.7, FALSE, 3, TRUE),

('观察者接触', '一个不发出敌意的视线锁定了你——观察实体在记录。',
 '{"type":"on_enter_map","mapId":3}'::jsonb,
 '[{"type":"spawn_npc","entity_type":"observer"},
   {"type":"log_only","text":"观察者的镜面表面闪烁着你过去几个回合的回放。"}]'::jsonb,
 0.4, FALSE, 0, TRUE),

('观察者接触-Ω段', 'Ω-段的观察者比缓冲带的更冷漠——也愿出更高价。',
 '{"type":"on_enter_map","mapId":4}'::jsonb,
 '[{"type":"spawn_npc","entity_type":"observer"},
   {"type":"log_only","text":"它在等你提交结构碎片。"}]'::jsonb,
 0.4, FALSE, 0, TRUE),

('引力剪切波', '剪切界面突然加速，引力扭曲撕过你身上的防护层。',
 '{"type":"on_search","mapId":3}'::jsonb,
 '[{"type":"damage","amount":15},
   {"type":"inc_flag","key":"shearWave","value":1,"silent":true},
   {"type":"log_only","text":"剪切波使你的防护罩爆裂出一片光晕。"}]'::jsonb,
 0.5, FALSE, 0, TRUE);

-- ╔════════════════════════════════════════════════════════════════╗
-- ║ Part 6 / 8 — contracts 6 contracts                             ║
-- ╚════════════════════════════════════════════════════════════════╝
DELETE FROM contracts;

INSERT INTO contracts (name, description, objectives, rewards, active) VALUES
('修复锚点中继',
 '主控层下达：从锚点走廊或废弃投放口取得 3 件环段部件，提交主控层用于稳定锚点-β。',
 '[{"type":"find_item","itemName":"环段部件","count":3}]'::jsonb,
 '[{"name":"结构碎片","quantity":2}]'::jsonb, TRUE),

('清除残响实体',
 '伊甸港残墟的残响实体浓度过高。击杀残响实体以恢复区域稳定。',
 '[{"type":"kill_npc","npcName":"残响低语","count":3},
   {"type":"kill_npc","npcName":"裂解残影","count":2}]'::jsonb,
 '[{"name":"环段部件","quantity":2}]'::jsonb, TRUE),

('提取Ω-段数据',
 '主控层亟需 Ω-段共构扰动样本——前往剪切缓冲带或 Ω-段核心接口寻找。',
 '[{"type":"find_item","itemName":"Ω物质","count":2}]'::jsonb,
 '[{"name":"深界情报","quantity":1}]'::jsonb, TRUE),

('侦查Ω-段边界',
 '至少一次成功从 Ω-段核心接口（map_id=4）撤离，并且必须从主出口或紧急出口完成结构退避。',
 '[{"type":"extract","count":1}]'::jsonb,
 '[{"name":"结构碎片","quantity":3}]'::jsonb, TRUE),

('安全撤离',
 '从任意撤离点安全退避一次。最基础的引导者认证任务。',
 '[{"type":"extract","count":1}]'::jsonb,
 '[{"name":"环段部件","quantity":1}]'::jsonb, TRUE),

('建立共生通信',
 '与共生实体交易，获得共生协议作为通信凭证。',
 '[{"type":"find_item","itemName":"共生协议","count":1}]'::jsonb,
 '[{"name":"通信组件升级","quantity":1}]'::jsonb, TRUE);

-- ╔════════════════════════════════════════════════════════════════╗
-- ║ Part 7 / 8 — endings 4 endings                                 ║
-- ╚════════════════════════════════════════════════════════════════╝
DELETE FROM endings;

INSERT INTO endings (key, name, description, banner_text, rewards, active) VALUES
('collapse', '崩解',
 '环境污染累积至临界，多次未及时退避导致路径不可控，主控层强制熔断 17 号异常段。',
 '异常段已进入视界线……全部归档。残存数据进入静寂。',
 '[{"name":"崩解记录碎片","quantity":1}]'::jsonb, TRUE),

('purge', '清算',
 '全员对入侵实体高效清剿，结构碎片提取受限——主控层判定异常段无残存共存价值。',
 '所有入侵实体已从平台剥离。Ω-段被强制隔离。',
 '[{"name":"清算认证","quantity":1},{"name":"环段部件","quantity":3}]'::jsonb, TRUE),

('merge', '合流',
 '与非敌对实体充分接触且环境污染受控，主控层批准部分文明的结构共存。',
 '结构共存协议已建立。共生体仍在低频运行。',
 '[{"name":"共生协议书","quantity":1},{"name":"Ω物质","quantity":2}]'::jsonb, TRUE),

('explore', '探索',
 '某玩家多次进入 Ω-段并提取足够 Ω 物质，路径图显现新的未确定归属段。',
 '平台路径图新增未确定归属段。深界向你打开。',
 '[{"name":"深界通行证","quantity":1},{"name":"Ω物质","quantity":5}]'::jsonb, TRUE);

-- ╔════════════════════════════════════════════════════════════════╗
-- ║ Part 8 / 8 — branch_nodes 4 endings judgment                   ║
-- ╚════════════════════════════════════════════════════════════════╝
DELETE FROM branch_nodes;

INSERT INTO branch_nodes (name, description, conditions, branches, scope, once, active) VALUES
('崩解判定',
 '环境污染达 100% 且失败撤离 ≥3 次时强制熔断。',
 '[{"type":"flagAtLeast","key":"failedRetreats","value":3},
   {"type":"flagEquals","key":"envPollutionMax","value":true}]'::jsonb,
 '[{"when":"all","do":{"triggerEnding":"collapse","log":"主控层判定：异常段已进入视界线，强制熔断已启动。"}}]'::jsonb,
 'room', TRUE, TRUE),

('清算判定',
 '全员入侵实体击杀率 ≥70% 且结构碎片提取 ≤5 时优先级最高，触发清算。',
 '[{"type":"flagAtLeast","key":"totalEntityKillRate","value":70},
   {"type":"flagEquals","key":"lowFragments","value":true}]'::jsonb,
 '[{"when":"all","do":{"triggerEnding":"purge","log":"主控层判定：高效隔离异常段，清算协议执行。"}}]'::jsonb,
 'room', TRUE, TRUE),

('合流判定',
 '全员与非敌对实体交互 ≥4 次且环境污染 ≤60%，开放共生协议。',
 '[{"type":"flagAtLeast","key":"totalEntityInteractions","value":4},
   {"type":"flagEquals","key":"envPollutionBelow60","value":true}]'::jsonb,
 '[{"when":"all","do":{"triggerEnding":"merge","log":"主控层判定：发现可共存的非敌对结构。合流协议已签署。"}}]'::jsonb,
 'room', TRUE, TRUE),

('探索判定',
 '任一玩家进入 Ω-段 ≥2 次且提取 Ω 物质 ≥3 件，解锁深界路径。',
 '[{"type":"anyPlayerHas","key":"omegaVisits","minValue":2},
   {"type":"anyPlayerHas","key":"omegaMaterials","minValue":3}]'::jsonb,
 '[{"when":"all","do":{"triggerEnding":"explore","log":"主控层判定：未归档路径成立——深界已向你打开。"}}]'::jsonb,
 'room', TRUE, TRUE);

-- ═══════════════════════════════════════════════════════════════════
-- 验证查询（应返回上述 8 个 part 的统计）
-- ═══════════════════════════════════════════════════════════════════
SELECT '1. map_config' AS part, COUNT(*) AS count FROM map_config
UNION ALL SELECT '2. equipment_series (4 farstar)', COUNT(*) FROM equipment_series WHERE slot IN ('probe','shield','weapon','comm') AND name IN ('探测设备','防护装置','武器模组','通信组件')
UNION ALL SELECT '2. equipment_tiers (8 farstar)', COUNT(*) FROM equipment_tiers t JOIN equipment_series s ON t.series_id = s.id WHERE s.slot IN ('probe','shield','weapon','comm') AND s.name IN ('探测设备','防护装置','武器模组','通信组件')
UNION ALL SELECT '3. npc_pool', COUNT(*) FROM npc_pool
UNION ALL SELECT '4. item_pool', COUNT(*) FROM item_pool
UNION ALL SELECT '5. event_pool', COUNT(*) FROM event_pool
UNION ALL SELECT '6. contracts', COUNT(*) FROM contracts
UNION ALL SELECT '7. endings', COUNT(*) FROM endings
UNION ALL SELECT '8. branch_nodes', COUNT(*) FROM branch_nodes;
