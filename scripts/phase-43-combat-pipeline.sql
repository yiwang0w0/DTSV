-- ============================================================
-- Phase 43 — 战斗效果钩子管线 P0：passive_skills 加阶段列(中性·不接 runtime)
-- ============================================================
-- 来源 docs/plan/02-combat-hook-pipeline.md。把「被动/技能」升级为可挂到 combatPipeline.js
--   某个伤害阶段的 modifier：新增 stage(挂哪个阶段)/priority(阶段内排序)/condition_formula(生效条件)。
--
-- ── 中性铁律(守 Phase 37)──
--   三列全可空 / 带中性默认：现有所有 passive 行 stage=NULL ⇒ parseModifier 返回 null ⇒
--   不参与管线、继续走旧 triggerPassives 旁路 ⇒ 战斗数值逐值不变。本迁移【纯加列】，
--   不接任何 runtime(运行端接线在后续 P2/P3)，应用后游戏行为零变化。
--
-- 幂等：ADD COLUMN IF NOT EXISTS + pg_constraint 守卫 + CREATE INDEX IF NOT EXISTS，可重复执行。
-- 已于 2026-06-15 经 postgres MCP 应用(本文件为记录)。
-- ============================================================

BEGIN;

ALTER TABLE passive_skills ADD COLUMN IF NOT EXISTS stage            text;
ALTER TABLE passive_skills ADD COLUMN IF NOT EXISTS priority         int  NOT NULL DEFAULT 100;
ALTER TABLE passive_skills ADD COLUMN IF NOT EXISTS condition_formula text;

-- stage 合法值：NULL=不参与管线(走旧旁路)；'sidecar'=显式旁路；其余为 combatPipeline.STAGES。
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'passive_skills_stage_check') THEN
    ALTER TABLE passive_skills ADD CONSTRAINT passive_skills_stage_check
      CHECK (stage IS NULL OR stage IN
        ('add','mult','invincible','special','limit','insurance','seckill','sidecar'));
  END IF;
END $$;

-- 仅索引「参与管线」的行(stage 非空)，收集 modifier 时按 (stage,priority) 取用。
CREATE INDEX IF NOT EXISTS idx_passive_skills_stage
  ON passive_skills (stage, priority) WHERE stage IS NOT NULL;

COMMENT ON COLUMN passive_skills.stage IS
  '挂到 combatPipeline 的哪个伤害阶段(add/mult/invincible/special/limit/insurance/seckill)；NULL=不参与管线·走旧 triggerPassives 旁路；sidecar=显式旁路。';
COMMENT ON COLUMN passive_skills.priority IS '阶段内升序(小先)，默认 100。';
COMMENT ON COLUMN passive_skills.condition_formula IS
  '生效条件式(evalFormula 求值非 0 才生效；空=恒生效)，如 ''targetHp/targetMaxHp < 0.2''。';

COMMIT;

-- 验证(部署后)：期望 3 行(stage|priority|condition_formula)，且现有行 stage 全 NULL(中性)。
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='passive_skills' AND column_name IN ('stage','priority','condition_formula');
-- SELECT count(*) AS in_pipeline FROM passive_skills WHERE stage IS NOT NULL;  -- 期望 0
