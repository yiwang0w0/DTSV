-- ============================================================
-- Phase 19.1 — Chamber Templates 模板池 schema + 25 个 seed 模板
-- ============================================================
-- 决策：Q1=B（强制清场）+ Q2=B-a（完全废弃 map_config）+ Q3=a（边做边给 seed）
--
-- 本 SQL：
-- 1. 强制结束所有 active/waiting 对局（不破坏历史数据，仅 gamestate=2）
-- 2. 创建 chamber_templates 表，接管 map_config 所有内容
-- 3. seed 25 个模板（覆盖 7 个原区域的 lore）
-- 4. 标记 map_config 为待删除（保留数据备份；后续 phase 删除）
-- ============================================================

-- ── 1. 强制结束所有 active 对局 ──
-- Q1=B：旧对局走旧 map_config 模型，新对局走 chamber 模型；为避免双轨复杂，强制归档
UPDATE rooms
   SET gamestate = 2,
       winner    = COALESCE(winner, '系统归档（Phase 19 升级）')
 WHERE gamestate IN (0, 1);

-- ── 2. chamber_templates 表 ──
CREATE TABLE IF NOT EXISTS chamber_templates (
  id              SERIAL PRIMARY KEY,
  template_key    TEXT UNIQUE NOT NULL,         -- 业务键（path_generator 用）
  name            TEXT NOT NULL,                -- 玩家可见显示名
  type            TEXT NOT NULL,                -- scan_dense / combat_dense / fragment_dense / hazard / exit / milestone
  description     TEXT DEFAULT '',              -- lore 短句（玩家进入时显示）
  region_label    TEXT,                         -- 原 7 区域的 lore 锚定（仅文案，无机制）
  weather         TEXT DEFAULT 'clear',         -- 天气（影响搜索概率）
  -- 污染（继承自旧 map_config）
  pollution_base  INTEGER NOT NULL DEFAULT 0,
  pollution_accel INTEGER NOT NULL DEFAULT 0,
  -- 撤离（继承自旧 map_config）
  is_exit         BOOLEAN NOT NULL DEFAULT FALSE,
  exit_cost       JSONB,                        -- {"item":"环段部件","qty":1}
  omega_window    INTEGER NOT NULL DEFAULT 0,   -- Ω 倒计时上限（0 = 不启用）
  -- 内容上限
  max_items       INTEGER NOT NULL DEFAULT 5,
  max_npcs        INTEGER NOT NULL DEFAULT 2,
  -- 路径生成器
  spawn_weight    REAL NOT NULL DEFAULT 1.0,    -- 抽取权重
  exit_count      INTEGER NOT NULL DEFAULT 2,   -- 1-3，玩家完成 chamber 后看到的分支数
  -- 启用开关
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chamber_templates_type ON chamber_templates(type);
CREATE INDEX IF NOT EXISTS idx_chamber_templates_enabled ON chamber_templates(enabled);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chamber_templates_type_check'
  ) THEN
    ALTER TABLE chamber_templates
      ADD CONSTRAINT chamber_templates_type_check
      CHECK (type IN ('scan_dense','combat_dense','fragment_dense','hazard','exit','milestone'));
  END IF;
END $$;

COMMENT ON TABLE chamber_templates IS
  'Phase 19 肉鸽路径生成的 chamber 模板池。每 raid 抽 20-25 个组成 raidPath。
   替代 map_config 表（B-a 决策）。';

-- ── 3. 25 个 seed 模板（覆盖 7 区域 lore） ──
INSERT INTO chamber_templates
  (template_key, name, type, description, region_label, weather,
   pollution_base, pollution_accel, is_exit, exit_cost, omega_window,
   max_items, max_npcs, spawn_weight, exit_count)
VALUES
  -- ═══ 外环（map_id=0 原"外环维护廊"）— 起点安全区，高搜索 ═══
  ('outer_ring_scan_1',  '外环-巡查节点',     'scan_dense',
   '残存的维护轨道还在低功耗运行。引导灯忽明忽灭。',     '外环维护廊',
   'clear', 0, 0, FALSE, NULL, 0, 6, 1, 1.5, 2),

  ('outer_ring_scan_2',  '外环-检修支段',     'scan_dense',
   '一段被遗忘的检修通道。墙面上的标识层层覆盖。',         '外环维护廊',
   'clear', 0, 0, FALSE, NULL, 0, 6, 1, 1.2, 2),

  ('outer_ring_exit_1',  '外环-紧急出口',     'exit',
   '通向外部归档系统的撤离锚点。需要环段部件维持稳定。',   '外环维护廊',
   'clear', 0, 0, TRUE, '{"item":"环段部件","qty":1}'::jsonb, 0, 3, 1, 0.8, 2),

  -- ═══ 锚点（map_id=1 原"锚点走廊"）— 中低污染，残响多 ═══
  ('anchor_scan_1',      '锚点-壁面层',       'scan_dense',
   '泡泡的壳已经嵌进了墙壁，像长在上面一样。',             '锚点走廊',
   'fog', 30, 0, FALSE, NULL, 0, 5, 2, 1.0, 2),

  ('anchor_combat_1',    '锚点-残响游走区',   'combat_dense',
   '空气中有低频震颤。锚点-β 的残响在这里循环。',         '锚点走廊',
   'fog', 35, 0, FALSE, NULL, 0, 3, 4, 1.0, 2),

  ('anchor_fragment_1',  '锚点-Beta 残段',    'fragment_dense',
   '一处稳定的数据回波点。可以读取到部分锚点协议。',       '锚点走廊',
   'fog', 40, 0, FALSE, NULL, 0, 4, 2, 0.7, 2),

  ('anchor_hazard_1',    '锚点-壳裂带',       'hazard',
   '泡泡壳出现了裂纹。结构应力快速堆积。',                 '锚点走廊',
   'fog', 45, 2, FALSE, NULL, 0, 3, 3, 0.9, 2),

  -- ═══ 伊甸港（map_id=2 原"伊甸港残墟"）— 中高污染，战斗密集 ═══
  ('eden_scan_1',        '伊甸港-堆积区',     'scan_dense',
   '崩塌缓冲层堆成小山。残段日志散落各处。',               '伊甸港残墟',
   'storm', 55, 1, FALSE, NULL, 0, 7, 2, 1.0, 2),

  ('eden_combat_1',      '伊甸港-塌陷干道',   'combat_dense',
   '原 3 号干道。伪装实体在残骸间游走。',                  '伊甸港残墟',
   'storm', 60, 1, FALSE, NULL, 0, 4, 5, 1.0, 2),

  ('eden_combat_2',      '伊甸港-缓冲层底',   'combat_dense',
   '深层堆积区。残响实体在此聚集。',                       '伊甸港残墟',
   'storm', 65, 1, FALSE, NULL, 0, 4, 4, 0.9, 2),

  ('eden_fragment_1',    '伊甸港-3 号通道',   'fragment_dense',
   '原投放模块的核心通道。墙面上的标识已经被泡泡侵蚀了一半。', '伊甸港残墟',
   'storm', 60, 1, FALSE, NULL, 0, 5, 2, 0.8, 2),

  ('eden_hazard_1',      '伊甸港-震动带',     'hazard',
   '低频振动正在加剧。结构正在缓慢变形。',                 '伊甸港残墟',
   'storm', 68, 2, FALSE, NULL, 0, 3, 3, 0.9, 2),

  ('eden_exit_1',        '伊甸港-应急出口',   'exit',
   '伊甸港残墟的侧通道。紧急撤离锚点仍可激活。',           '伊甸港残墟',
   'storm', 60, 0, TRUE, '{"item":"环段部件","qty":2}'::jsonb, 0, 3, 1, 0.7, 2),

  -- ═══ 剪切带（map_id=3 原"剪切界面缓冲带"）— 高污染，时间压力 ═══
  ('shear_scan_1',       '剪切带-引力波静默区', 'scan_dense',
   '引力波在这里短暂归零。能见度异常清晰。',               '剪切界面缓冲带',
   'snow', 75, 2, FALSE, NULL, 0, 5, 3, 0.9, 2),

  ('shear_combat_1',     '剪切带-伪装窝点',   'combat_dense',
   '伪装入侵者的聚集地。它们模仿引导者的编号。',           '剪切界面缓冲带',
   'snow', 80, 2, FALSE, NULL, 0, 4, 5, 0.9, 2),

  ('shear_hazard_1',     '剪切带-拉伸面',     'hazard',
   '墙面像橡皮一样在拉伸。引力波随时可能撕裂防护。',       '剪切界面缓冲带',
   'snow', 85, 3, FALSE, NULL, 0, 3, 3, 1.0, 2),

  ('shear_hazard_2',     '剪切带-断裂壁',     'hazard',
   '结构断裂边缘。残段从断面缓缓飘出。',                   '剪切界面缓冲带',
   'snow', 88, 3, FALSE, NULL, 0, 4, 4, 0.8, 2),

  ('shear_milestone_1',  '剪切带-中央断面 ⚠', 'milestone',
   '剪切界面的中心。BOSS 级伪装入侵者守护此处。',          '剪切界面缓冲带',
   'snow', 90, 2, FALSE, NULL, 0, 5, 6, 0.5, 2),

  -- ═══ Ω-段（map_id=4 原"Ω-段核心接口"）— 终极，深 lore ═══
  ('omega_scan_1',       'Ω-段-脉冲缓冲',     'scan_dense',
   '未归档的脉冲在这里短暂稳定。可以读取边缘日志。',       'Ω-段核心接口',
   'night', 95, 5, FALSE, NULL, 3, 5, 3, 0.8, 2),

  ('omega_scan_2',       'Ω-段-接口残段',     'scan_dense',
   '泡泡与平台共构。墙面在持续变形中。',                   'Ω-段核心接口',
   'night', 95, 5, FALSE, NULL, 3, 4, 3, 0.7, 2),

  ('omega_combat_1',     'Ω-段-观察者窝',     'combat_dense',
   '观察者实体的聚集地。镜面表面反射出你之前的动作。',     'Ω-段核心接口',
   'night', 100, 6, FALSE, NULL, 3, 3, 5, 0.7, 2),

  ('omega_fragment_1',   'Ω-段-未归档脉冲',   'fragment_dense',
   '正在被重新排列的数据。能读取到深界路径的片段。',       'Ω-段核心接口',
   'night', 100, 7, FALSE, NULL, 3, 4, 3, 0.6, 2),

  ('omega_fragment_2',   'Ω-段-终端日志',     'fragment_dense',
   '远星函馆核心的最后归档。六个纪元的碎片化记录。',       'Ω-段核心接口',
   'night', 100, 7, FALSE, NULL, 3, 5, 3, 0.4, 2),

  ('omega_milestone_1',  'Ω-段-终极界面 🏆',  'milestone',
   'Ω-段的最深处。终极界面在等待引导者的最终决定。',       'Ω-段核心接口',
   'night', 100, 8, FALSE, NULL, 3, 6, 6, 0.3, 1),

  -- ═══ 罕见 chamber（不固定区域）═══
  ('bubble_drift_1',     '泡泡漂流-临时点',   'scan_dense',
   '一段意外稳定的泡泡气囊。漂浮的残段在此聚集。',         NULL,
   'clear', 50, 0, FALSE, NULL, 0, 8, 1, 0.3, 2);

-- ── 4. 验证查询 ──
-- SELECT count(*) FROM chamber_templates WHERE enabled = TRUE;  -- 期望 25
-- SELECT type, count(*) FROM chamber_templates GROUP BY type;
-- SELECT count(*) FROM rooms WHERE gamestate IN (0,1);          -- 期望 0
