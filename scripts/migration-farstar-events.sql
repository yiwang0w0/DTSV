-- ═══════════════════════════════════════════════════════════════════
-- 远星函馆 Phase 8.1 — 事件库（spec §10.1，8 个预置事件）
-- ═══════════════════════════════════════════════════════════════════

DELETE FROM event_pool;

-- 1) 锚点残响 — map_id=1 搜索时给结构碎片
INSERT INTO event_pool (name, description, trigger, effects, weight, once, cooldown, active)
VALUES (
  '锚点残响',
  '锚点-β 残段在搜索中泛起回响，掉落一片结构碎片。',
  '{"type":"on_search","mapId":1}'::jsonb,
  '[
    {"type":"give_item","itemName":"结构碎片","count":1},
    {"type":"log_only","text":"残存的锚点稳定协议在你指尖静电中显形。"}
  ]'::jsonb,
  1.0, FALSE, 2, TRUE
);

-- 2) 泡层壳体裂解 — map_id=2 搜索时召唤残响实体 + 标记
INSERT INTO event_pool (name, description, trigger, effects, weight, once, cooldown, active)
VALUES (
  '泡层壳体裂解',
  '伊甸港残墟的泡层壳体出现裂缝，残响实体倾泻而出。',
  '{"type":"on_search","mapId":2}'::jsonb,
  '[
    {"type":"spawn_npc","entity_type":"remnant"},
    {"type":"set_flag","key":"shellBreach","value":true,"silent":true}
  ]'::jsonb,
  0.8, FALSE, 3, TRUE
);

-- 3) Ω-段脉冲 — 进入 map_id=4 时直接受伤 + 累计 Ω 脉冲计数
INSERT INTO event_pool (name, description, trigger, effects, weight, once, cooldown, active)
VALUES (
  'Ω-段脉冲',
  'Ω-段核心接口爆发未归档脉冲，神经协议过载。',
  '{"type":"on_enter_map","mapId":4}'::jsonb,
  '[
    {"type":"damage","amount":10},
    {"type":"inc_flag","key":"omegaPulse","value":1,"silent":true},
    {"type":"log_only","text":"接口共振使你的认知短暂坍缩。"}
  ]'::jsonb,
  1.0, FALSE, 0, TRUE
);

-- 4) 伪装识别失败 — map_id=2 或 3 搜索时，伪装入侵者袭击
INSERT INTO event_pool (name, description, trigger, effects, weight, once, cooldown, active)
VALUES (
  '伪装识别失败',
  '你检索到的编号其实是伪造的——对方先动了手。',
  '{"type":"on_search","mapId":2}'::jsonb,
  '[
    {"type":"spawn_npc","entity_type":"infiltrator"},
    {"type":"log_only","text":"你身后的引导者编号正在快速重组——不是同伴。"}
  ]'::jsonb,
  0.6, FALSE, 4, TRUE
);

INSERT INTO event_pool (name, description, trigger, effects, weight, once, cooldown, active)
VALUES (
  '伪装识别失败-3区',
  '剪切界面缓冲带的电磁噪声让你错过了关键 ID 校验。',
  '{"type":"on_search","mapId":3}'::jsonb,
  '[
    {"type":"spawn_npc","entity_type":"infiltrator"},
    {"type":"log_only","text":"伪造编号在你信任校验位之后启动了攻击协议。"}
  ]'::jsonb,
  0.6, FALSE, 4, TRUE
);

-- 5) 共生体信号 — 进入 map_id=3 时，遇到共生节点
INSERT INTO event_pool (name, description, trigger, effects, weight, once, cooldown, active)
VALUES (
  '共生体信号',
  '剪切缓冲带泛起非敌对脉冲——共生节点请求接触。',
  '{"type":"on_enter_map","mapId":3}'::jsonb,
  '[
    {"type":"spawn_npc","entity_type":"symbiote"},
    {"type":"log_only","text":"一个温热的脉冲穿过你的传感器；请求建立非战斗连接。"}
  ]'::jsonb,
  0.5, FALSE, 0, TRUE
);

-- 6) 结构修复窗口 — map_id=1 或 10 搜索时，给环段部件
INSERT INTO event_pool (name, description, trigger, effects, weight, once, cooldown, active)
VALUES (
  '结构修复窗口',
  '锚点走廊的接口节点暴露出可拆卸的环段部件。',
  '{"type":"on_search","mapId":1}'::jsonb,
  '[
    {"type":"give_item","itemName":"环段部件","count":1},
    {"type":"log_only","text":"接口已松动——你成功摘下一块完好的环段部件。"}
  ]'::jsonb,
  0.7, FALSE, 3, TRUE
);

INSERT INTO event_pool (name, description, trigger, effects, weight, once, cooldown, active)
VALUES (
  '结构修复窗口-10区',
  '废弃投放口的备用接口仍在低功耗运行。',
  '{"type":"on_search","mapId":10}'::jsonb,
  '[
    {"type":"give_item","itemName":"环段部件","count":1},
    {"type":"log_only","text":"备用接口的固件还在工作——你拆下了一块部件。"}
  ]'::jsonb,
  0.7, FALSE, 3, TRUE
);

-- 7) 观察者接触 — 进入 map_id=3 或 4 时，遇到观察实体
INSERT INTO event_pool (name, description, trigger, effects, weight, once, cooldown, active)
VALUES (
  '观察者接触',
  '一个不发出敌意的视线锁定了你——观察实体在记录。',
  '{"type":"on_enter_map","mapId":3}'::jsonb,
  '[
    {"type":"spawn_npc","entity_type":"observer"},
    {"type":"log_only","text":"观察者的镜面表面闪烁着你过去几个回合的回放。"}
  ]'::jsonb,
  0.4, FALSE, 0, TRUE
);

INSERT INTO event_pool (name, description, trigger, effects, weight, once, cooldown, active)
VALUES (
  '观察者接触-Ω段',
  'Ω-段的观察者比缓冲带的更冷漠——也愿出更高价。',
  '{"type":"on_enter_map","mapId":4}'::jsonb,
  '[
    {"type":"spawn_npc","entity_type":"observer"},
    {"type":"log_only","text":"它在等你提交结构碎片。"}
  ]'::jsonb,
  0.4, FALSE, 0, TRUE
);

-- 8) 引力剪切波 — map_id=3 搜索时，直接受重伤 + 标记
INSERT INTO event_pool (name, description, trigger, effects, weight, once, cooldown, active)
VALUES (
  '引力剪切波',
  '剪切界面突然加速，引力扭曲撕过你身上的防护层。',
  '{"type":"on_search","mapId":3}'::jsonb,
  '[
    {"type":"damage","amount":15},
    {"type":"inc_flag","key":"shearWave","value":1,"silent":true},
    {"type":"log_only","text":"剪切波使你的防护罩爆裂出一片光晕。"}
  ]'::jsonb,
  0.5, FALSE, 0, TRUE
);

-- 验证
SELECT name, trigger->>'type' AS trigger_type, trigger->>'mapId' AS map_id, weight, active
  FROM event_pool
 ORDER BY (trigger->>'mapId')::INT NULLS LAST, name;
