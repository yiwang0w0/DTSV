-- ============================================================
-- KALEIDO P0 — 六表 DDL + RLS（KP0-S 交付物 1）
-- ============================================================
-- 轨道：⚙️ 游戏性优化（KALEIDO 主线 · KP0-S 服务端核心）
-- 依据：docs/plan/kaleido/02-detailed-design.md §2.3（DDL 草案）
--        + docs/plan/kaleido/00-spec-v0.3.md §6（数据模型 / Level Schema v0.3）
--        + scripts/phase-51-content-rls.sql（RLS 三层范式）
--
-- ── 双层真源（D2）──
--   runs / levels = KALEIDO 域真源（收敛 R8 / 图鉴 / 种子回放的依据）；
--   rooms 行只是一次性执行载体（runs.room_id 引用）。gamevars 会被生命周期清洗，不能当档案。
--
-- ── 安全模型（RLS · phase-51 范式扩展）──
--   私有五表（runs/levels/player_events/player_profile/generation_jobs）：owner SELECT + service_role 写。
--   player_events：append-only —— owner SELECT + service_role INSERT，**不给 UPDATE/DELETE 策略**。
--   content_pool：公开读 + service_role 写（种子关/晋升内容，玩家端只读）。
--   service_role 绕过 RLS，服务端写路径（src/lib/server/kaleido/*）零影响。
--
-- ── 中性铁律（Phase 37）──
--   本迁移**纯新增六表 + 各自 RLS**，不 ALTER / 不触碰任何现有表、列、策略、数据 →
--   现有多人玩法逐字节不变。
--
-- ── 状态 ──
--   ⚠ 本文件由 ⚙️ 游戏性优化轨编写，**尚未执行**。待 🔒 安全性轨审阅（RLS 正确性 / owner 判定 /
--   append-only）后，经 postgres MCP 执行，并在本行上方标注「已应用」+ 日期。
--
-- 幂等：CREATE TABLE/INDEX IF NOT EXISTS；ENABLE RLS 可重复；DROP POLICY IF EXISTS 后 CREATE。可重复执行。
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1) runs —— 一次 run = 一个版本（R8）；KALEIDO 域真源
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS runs (
  run_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    UUID NOT NULL,                       -- FK auth.users（不设硬约束，随库内既有惯例）
  room_id      BIGINT,                              -- 执行载体 rooms.id（方案一 D1）
  seed         TEXT NOT NULL,                        -- 采样器种子（种子回放 / 复现）
  spine        JSONB NOT NULL DEFAULT '{}'::jsonb,   -- run 大纲（一致性契约）
  status       TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','cleared','dead','abandoned')),
  current_seq  INT NOT NULL DEFAULT 1,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  converged_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_runs_player       ON runs (player_id, started_at DESC);
-- 单人同时至多 1 个 active run（startKaleidoRun 幂等的 DB 兜底）：仅对 active 行建唯一
CREATE UNIQUE INDEX IF NOT EXISTS uq_runs_one_active
  ON runs (player_id) WHERE status = 'active';

-- ────────────────────────────────────────────────────────────
-- 2) levels —— Level Schema v0.3 实例（per-run；种子关不在此，在 content_pool）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS levels (
  level_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id     UUID NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  seq        INT NOT NULL,
  gen_meta   JSONB NOT NULL DEFAULT '{}'::jsonb,     -- {source:'seed|sampled|generated', model, brief_hash, ...}
  payload    JSONB NOT NULL,                          -- Level Schema v0.3 全量（00-spec §6.1）
  validation JSONB NOT NULL DEFAULT '{}'::jsonb,
  status     TEXT NOT NULL DEFAULT 'ready'
               CHECK (status IN ('ready','deployed','played','skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, seq)
);

-- ────────────────────────────────────────────────────────────
-- 3) player_events —— 传感层（append-only；镜像 br_match_events append-only 设计）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS player_events (
  id        BIGSERIAL PRIMARY KEY,
  player_id UUID NOT NULL,
  run_id    UUID,                                     -- 大厅侧事件可空
  level_seq INT,
  t         TIMESTAMPTZ NOT NULL DEFAULT now(),
  verb      TEXT NOT NULL,
  payload   JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_pe_run      ON player_events (run_id, level_seq);
CREATE INDEX IF NOT EXISTS idx_pe_player_t ON player_events (player_id, t DESC);

-- ────────────────────────────────────────────────────────────
-- 4) player_profile —— 画像快照（P3 消费；P0 建表即可）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS player_profile (
  id              BIGSERIAL PRIMARY KEY,
  player_id       UUID NOT NULL,
  version         INT NOT NULL,
  traits          JSONB NOT NULL DEFAULT '{}'::jsonb, -- {risk,aggression,patience,curiosity,hoarding,thoroughness}∈[0,1]
  evidence        JSONB NOT NULL DEFAULT '[]'::jsonb,
  drift_from_prev REAL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, version)
);

-- ────────────────────────────────────────────────────────────
-- 5) generation_jobs —— 生成管线状态机（P0 建表，P2 启用）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS generation_jobs (
  job_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID NOT NULL,
  target_seq   INT NOT NULL,
  state        TEXT NOT NULL DEFAULT 'queued'
                 CHECK (state IN ('queued','generating','repair','validating','ready','deployed','rejected','invalidated')),
  attempts     INT NOT NULL DEFAULT 0,
  brief        JSONB NOT NULL DEFAULT '{}'::jsonb,
  artifact     JSONB,
  gate_results JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gj_run ON generation_jobs (run_id, target_seq);

-- ────────────────────────────────────────────────────────────
-- 6) content_pool —— 已验证共享池（种子关 provenance.source='seed'；晋升内容 'promoted'）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_pool (
  id          BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,                          -- 'level' | 'combat_mode_params' | 'npc' | 'item' ...
  payload     JSONB NOT NULL,
  provenance  JSONB NOT NULL DEFAULT '{}'::jsonb,     -- {source:'seed'|'promoted', run_id?, anonymized:true}
  live_stats  JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cp_type ON content_pool (entity_type) WHERE enabled;

-- ============================================================
-- RLS —— 私有五表 owner-read + service 写；player_events append-only；content_pool 公开读
-- （范式抄 phase-51；owner = auth.uid()；无 player_id 的表经 run_id 回联 runs 判 owner）
-- ============================================================

-- 1) runs：owner 读自己的 run；写仅 service_role
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS runs_owner_read    ON runs;
DROP POLICY IF EXISTS runs_service_write ON runs;
CREATE POLICY runs_owner_read    ON runs FOR SELECT USING (player_id = auth.uid());
CREATE POLICY runs_service_write ON runs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2) levels：owner 经 run_id 回联 runs 判定；写仅 service_role
ALTER TABLE levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS levels_owner_read    ON levels;
DROP POLICY IF EXISTS levels_service_write ON levels;
CREATE POLICY levels_owner_read ON levels FOR SELECT USING (
  EXISTS (SELECT 1 FROM runs r WHERE r.run_id = levels.run_id AND r.player_id = auth.uid())
);
CREATE POLICY levels_service_write ON levels FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3) player_events：append-only —— owner SELECT + service_role INSERT；**不建 UPDATE/DELETE 策略**
ALTER TABLE player_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS player_events_owner_read     ON player_events;
DROP POLICY IF EXISTS player_events_service_insert ON player_events;
CREATE POLICY player_events_owner_read     ON player_events FOR SELECT USING (player_id = auth.uid());
CREATE POLICY player_events_service_insert ON player_events FOR INSERT TO service_role WITH CHECK (true);

-- 4) player_profile：owner 读；写仅 service_role
ALTER TABLE player_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS player_profile_owner_read    ON player_profile;
DROP POLICY IF EXISTS player_profile_service_write ON player_profile;
CREATE POLICY player_profile_owner_read    ON player_profile FOR SELECT USING (player_id = auth.uid());
CREATE POLICY player_profile_service_write ON player_profile FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5) generation_jobs：owner 经 run_id 回联 runs 判定；写仅 service_role
ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS generation_jobs_owner_read    ON generation_jobs;
DROP POLICY IF EXISTS generation_jobs_service_write ON generation_jobs;
CREATE POLICY generation_jobs_owner_read ON generation_jobs FOR SELECT USING (
  EXISTS (SELECT 1 FROM runs r WHERE r.run_id = generation_jobs.run_id AND r.player_id = auth.uid())
);
CREATE POLICY generation_jobs_service_write ON generation_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6) content_pool：公开读（玩家端只读种子/晋升内容）+ service_role 写
ALTER TABLE content_pool ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS content_pool_public_read   ON content_pool;
DROP POLICY IF EXISTS content_pool_service_write ON content_pool;
CREATE POLICY content_pool_public_read   ON content_pool FOR SELECT USING (true);
CREATE POLICY content_pool_service_write ON content_pool FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

-- ============================================================
-- 验证（🔒 执行后跑）
-- ------------------------------------------------------------
-- 1) 六表 rls_enabled=true，策略数符合预期（多数 2；player_events 2）：
-- SELECT c.relname, c.relrowsecurity,
--        (SELECT count(*) FROM pg_policies p WHERE p.tablename=c.relname AND p.schemaname='public') AS policies
-- FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
-- WHERE n.nspname='public'
--   AND c.relname IN ('runs','levels','player_events','player_profile','generation_jobs','content_pool')
-- ORDER BY c.relname;
--
-- 2) 反向验证（🔒 审计重点）：
--    - 以 anon / 他人身份 SELECT runs/levels/player_events → 应 0 行（owner 隔离）。
--    - 以 anon / authenticated 身份 INSERT 任一私有表 → 应被拒（无写策略）。
--    - player_events 无 UPDATE/DELETE 策略 → 非 service 角色改删应被拒（append-only）。
--    - content_pool SELECT 公开可读；INSERT 非 service 被拒。
-- ============================================================
