-- ═══════════════════════════════════════════════════════════════════
-- 远星函馆 Phase 8.1 — 物品池重新灌数据（4 kinds）
-- ═══════════════════════════════════════════════════════════════════
-- 注：装备类（equipment）走 equipment_series + equipment_tiers + equipment_instances
--      系统，不在 item_pool。见 migration-farstar-equipment.sql
-- 物品池只装：tech_fragment / platform_part / omega_matter / consumable

DELETE FROM item_pool;

-- ── tech_fragment（结构碎片：泡层文明残响） ──────────────────
INSERT INTO item_pool (name, kind, sub_kind, atk, def, heal, amount, maps, description)
VALUES
  ('结构碎片',     'tech_fragment', NULL, 0, 0, 0, 3,
    '[1,2,3,4]'::jsonb, '泡层文明残响数据，可提交主控层'),
  ('锚点稳定协议', 'tech_fragment', NULL, 0, 0, 0, 2,
    '[1,2]'::jsonb,     '锚点-β 稳定协议片段'),
  ('语言压缩算法', 'tech_fragment', NULL, 0, 0, 0, 2,
    '[2,3]'::jsonb,     '泡层文明语言模型残档'),
  ('深界情报',     'tech_fragment', NULL, 0, 0, 0, 1,
    '[3,4]'::jsonb,     '观察实体交易获得，标记深界路径');

-- ── platform_part（环段部件：17号异常段本体） ────────────────
INSERT INTO item_pool (name, kind, sub_kind, atk, def, heal, amount, maps, description)
VALUES
  ('环段部件',         'platform_part', NULL, 0, 0, 0, 4,
    '[0,1,2,10,11]'::jsonb, '可修复结构/降低污染/作为撤离消耗'),
  ('缓冲材料',         'platform_part', NULL, 0, 0, 0, 3,
    '[1,2]'::jsonb,         '伊甸港接口缓冲材料'),
  ('伊甸港接口残件',   'platform_part', NULL, 0, 0, 0, 2,
    '[2,11]'::jsonb,        '原稳定锚点接口碎件');

-- ── omega_matter（Ω物质：Ω-段核心接口） ─────────────────────
INSERT INTO item_pool (name, kind, sub_kind, atk, def, heal, amount, maps, description)
VALUES
  ('Ω物质',           'omega_matter', NULL, 0, 0, 0, 2,
    '[3,4]'::jsonb,   '动态重排数据块，归档触发结局分支'),
  ('共构扰动样本',     'omega_matter', NULL, 0, 0, 0, 1,
    '[4]'::jsonb,     'Ω-段共构扰动采样');

-- ── consumable（消耗品：搜索/交易） ──────────────────────────
INSERT INTO item_pool (name, kind, sub_kind, atk, def, heal, amount, maps, description)
VALUES
  ('结构修复包',       'consumable', NULL, 0, 0, 30, 5, '[0,1,2,10,11]'::jsonb,
    '回复 30 HP'),
  ('认知稳定剂',       'consumable', NULL, 0, 0, 0, 4, '[1,2,3]'::jsonb,
    '使用后立即降低个人污染 -10%'),
  ('结构强化液',       'consumable', NULL, 0, 5, 0, 3, '[2,3]'::jsonb,
    '使用后获得短暂 DEF+5 buff'),
  ('共生协议',         'consumable', NULL, 0, 0, 0, 0, '[]'::jsonb,
    '共生实体交易获得，可作为合同任务凭证');

-- 验证
SELECT kind, COUNT(*) AS count
  FROM item_pool
 GROUP BY kind
 ORDER BY kind;
