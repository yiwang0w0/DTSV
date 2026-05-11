-- ============================================================
-- Phase 18.1 — 残片三链分类（search / combat / extract）
-- ============================================================
-- 目标：把残片按"搜打撤"三个 raid 阶段分链，三个动作分别按 chain 加权
--      抽取。已有的 5 category（general/omega/eden/bubble/structure）保留
--      不动 — phase_chain 是正交的"被发现的时机"维度。
-- ============================================================

ALTER TABLE fragment_pool
  ADD COLUMN IF NOT EXISTS phase_chain TEXT NOT NULL DEFAULT 'search';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fragment_pool_phase_chain_check'
  ) THEN
    ALTER TABLE fragment_pool
      ADD CONSTRAINT fragment_pool_phase_chain_check
      CHECK (phase_chain IN ('search', 'combat', 'extract'));
  END IF;
END $$;

COMMENT ON COLUMN fragment_pool.phase_chain IS
  '残片发现时机：search(搜索 roll) / combat(击杀 NPC 后) / extract(撤离后)。
   配合用户的"搜打撤三链"叙事 — 不同阶段拾到的碎片类型不同，玩家自己拼出完整历史。';

-- 现有残片全部默认是 search 链（向后兼容）— 管理员后续按需调整
-- 验证：
-- SELECT phase_chain, count(*) FROM fragment_pool GROUP BY phase_chain;
