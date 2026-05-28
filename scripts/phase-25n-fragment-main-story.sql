-- Phase 25n — fragment_pool 主线 / 支线分类
-- 来源：research-2026-05-12 P1（Archive codex 主线/支线分类）
--
-- 主线故事链（六纪元主时间轴，docs/narrative-vision.md 第四章对照表）：
--   F01/F05 → F02 → F06 → F07 → F08 → F09 → F10 → F11 → F12 → F13 → F14 → F15
-- 支线（背景补充文档，不在主链上）：
--   F03 结构修复包使用规程 / F04 人员调度令-PI 序列启用
--
-- 幂等可重跑：ADD COLUMN IF NOT EXISTS + 按编码 UPDATE。

ALTER TABLE fragment_pool ADD COLUMN IF NOT EXISTS is_main_story BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN fragment_pool.is_main_story IS
  '是否属于主线故事链（六纪元主时间轴）。true=主线（F01/F02/F05-F15），false=支线背景残片（F03/F04）。/codex 与 /archive 据此分主线折叠卡。';

-- 主线：名称以这些编码开头的残片
UPDATE fragment_pool
SET is_main_story = true
WHERE substring(name FROM '^F\d{2}') IN
  ('F01', 'F02', 'F05', 'F06', 'F07', 'F08', 'F09', 'F10', 'F11', 'F12', 'F13', 'F14', 'F15')
  AND is_main_story IS DISTINCT FROM true;

-- 支线：显式回落 false（防历史误标）
UPDATE fragment_pool
SET is_main_story = false
WHERE substring(name FROM '^F\d{2}') IN ('F03', 'F04')
  AND is_main_story IS DISTINCT FROM false;
