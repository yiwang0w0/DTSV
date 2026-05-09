-- ═══════════════════════════════════════════════════════════════════
-- 远星函馆 Phase 8.1 — 4 结局判定分支节点（spec §7.3）
-- ═══════════════════════════════════════════════════════════════════
-- 每节点 once + room scope，由 evaluateBranchNodes 在每次 persist
-- 调用时评估。条件 flagAtLeast/flagEquals 由 pollution.js#recomputeFlags
-- 在 tick 时刷新；anyPlayerHas {key,minValue} 由 Phase 8.5 扩展支持。

DELETE FROM branch_nodes;

-- 崩解：环境污染达 100 + 累计 ≥3 次未及时退避
INSERT INTO branch_nodes (name, description, conditions, branches, scope, once, active)
VALUES (
  '崩解判定',
  '环境污染达 100% 且失败撤离 ≥3 次时强制熔断。',
  '[
    {"type":"flagAtLeast","key":"failedRetreats","value":3},
    {"type":"flagEquals","key":"envPollutionMax","value":true}
  ]'::jsonb,
  '[
    {"when":"all","do":{"triggerEnding":"collapse","log":"主控层判定：异常段已进入视界线，强制熔断已启动。"}}
  ]'::jsonb,
  'room', TRUE, TRUE
);

-- 清算：全员击杀率 ≥70% 且提取碎片极少
-- 用 atLeast(2) 容忍其中一项稍欠（保留弹性）
INSERT INTO branch_nodes (name, description, conditions, branches, scope, once, active)
VALUES (
  '清算判定',
  '全员入侵实体击杀率 ≥70% 且结构碎片提取 ≤5 时优先级最高，触发清算。',
  '[
    {"type":"flagAtLeast","key":"totalEntityKillRate","value":70},
    {"type":"flagEquals","key":"lowFragments","value":true}
  ]'::jsonb,
  '[
    {"when":"all","do":{"triggerEnding":"purge","log":"主控层判定：高效隔离异常段，清算协议执行。"}}
  ]'::jsonb,
  'room', TRUE, TRUE
);

-- 合流：全员非敌对交互 ≥4 且环境污染 ≤60%
INSERT INTO branch_nodes (name, description, conditions, branches, scope, once, active)
VALUES (
  '合流判定',
  '全员与非敌对实体交互 ≥4 次且环境污染 ≤60%，开放共生协议。',
  '[
    {"type":"flagAtLeast","key":"totalEntityInteractions","value":4},
    {"type":"flagEquals","key":"envPollutionBelow60","value":true}
  ]'::jsonb,
  '[
    {"when":"all","do":{"triggerEnding":"merge","log":"主控层判定：发现可共存的非敌对结构。合流协议已签署。"}}
  ]'::jsonb,
  'room', TRUE, TRUE
);

-- 探索：任一玩家 omegaVisits ≥2 且 omegaMaterials ≥3
-- 使用 Phase 8.5 扩展的 anyPlayerHas {key,minValue} 检查玩家数值字段
INSERT INTO branch_nodes (name, description, conditions, branches, scope, once, active)
VALUES (
  '探索判定',
  '任一玩家进入 Ω-段 ≥2 次且提取 Ω 物质 ≥3 件，解锁深界路径。',
  '[
    {"type":"anyPlayerHas","key":"omegaVisits","minValue":2},
    {"type":"anyPlayerHas","key":"omegaMaterials","minValue":3}
  ]'::jsonb,
  '[
    {"when":"all","do":{"triggerEnding":"explore","log":"主控层判定：未归档路径成立——深界已向你打开。"}}
  ]'::jsonb,
  'room', TRUE, TRUE
);

-- 验证
SELECT name, jsonb_array_length(conditions) AS cond_count,
       jsonb_array_length(branches) AS branch_count, scope, active
  FROM branch_nodes
 ORDER BY id;
