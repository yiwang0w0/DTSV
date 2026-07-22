-- ─────────────────────────────────────────────────────────────────
-- KALEIDO · kaleido_scene_state —— 场景改动的跨单位持久层（教义 11 §8 · doc 13 §3）
-- ⚠⚠ 本文件 **待 🧭 审 + 批准后由 🧭 执行**。🔧 不自跑。⚠⚠
-- ─────────────────────────────────────────────────────────────────
-- 目的（Kanata 原话）：「玩家开了灯，死了，下一次到达这个房间时灯就是开着的」
--   ⇒ **UI 退回，世界不退回**：单位失去它挣来的观测能力，但留在世界上的改动还在。
--   ⇒ 场景改动的持久层 **≠** UI 解锁的持久层（后者随存档点回滚，前者跨单位永不回滚）。
--
-- 为什么必须新建表（doc 13 §3 逐候选评估结论）：
--   现有 11 个候选**无一**同时满足「世界级 + 运行时可写 + 无 TTL + 不与多人局共用 + 不挂 run/账号
--   + 可按到期批量重置」。逐条否决理由：
--     · rooms.gamevars —— **run 级**（每 run 新建一张房，上一程对下一程结构性不可见）
--     · runs / levels  —— run 级；且教义明令场景状态不得挂 run 上
--     · profiles       —— 账号级不是世界级（别人开的灯你看不到）；且与 ui_unlocks 同表触教义红线
--     · chamber_templates / br_rooms —— **与多人局共用**；且写它们会打爆 getRaidLayout 的 memo
--     · br_zone_tables —— schema 级只读禁令
--     · chamber_residue —— 形状是 append-only 快照日志，且带 72h TTL，且全仓零调用点（死代码）
--
-- 中性：**纯新增表，不 ALTER 任何现有表** ⇒ 多人局逐字节零变化（同 kaleido-p0-schema.sql 的铁律）。
-- 幂等：可重复执行。
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kaleido_scene_state (
  -- 场景身份：跨 run 稳定的房间标识。P1 取 'chamber:<template_key>'
  --   （template_key 由 chamber_templates 提供，sampleRun→chamberToNode 逐 key 拷贝，跨 run 稳定）；
  --   step1 图结构落地后可换成 'site:<site_key>'，故留成 TEXT 而非 FK。
  scene_key   TEXT        NOT NULL,
  -- 物件与属性：'door_a' / 'light' / 'block_c' …
  prop_key    TEXT        NOT NULL,
  value       JSONB       NOT NULL DEFAULT '{}'::jsonb,

  -- ⚠ 恢复周期是**参数不是档位**（Kanata：「炸毁一个区块可能需要过几天才恢复……这个不是固定的」）。
  --   **形状 = 🧭 最终裁定的第三解**（2026-07-23）：`NOT NULL` + 用 **`'infinity'` 表示「永不恢复」**。
  --   为什么不是 `NULL = 永不`（🔧 原提案）：NULL 在「未设置」与「永不」之间有歧义，而这条读错的后果是
  --     **把存档点锚给重置了**（N8「后面来的找得到这儿」变成假陈述）。
  --   为什么不是 `reset_scope:'daily'|'permanent'` 两档枚举（🔧 更早的提案）：表达不了「几天」，
  --     且加档位要改 schema + 改重置作业 + 迁存量。
  --   ⇒ `'infinity'` 同时满足两边：无 NULL 歧义、「几天」= `now() + interval '3 days'` 零 schema 改动，
  --     且 `DELETE ... WHERE restore_at <= now()` 对 `'infinity'` **永远不成立** ——
  --     这是与枚举**同等的结构性保证**，不是靠人记得多写一个条件。
  --   ⚠ **`'infinity'` = 永不复原；当前唯一持有者 = 安全屋的门（存档点锚）。** 下一个人改这张表前先读这句。
  --   已定三例：门 = `'infinity'` / 灯 = 次日某时 / 炸毁区块 = 数天后。
  --   重置作业按到期扫描：DELETE FROM kaleido_scene_state WHERE restore_at <= now();
  restore_at  TIMESTAMPTZ NOT NULL DEFAULT 'infinity'::timestamptz,

  -- 「前一个单位的痕迹」叙事用（教义 §8：单位是消耗品、世界在累积）。可空。
  changed_by  UUID        NULL,
  unit_index  INT         NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (scene_key, prop_key)
);

-- 到期扫描用（重置作业的唯一查询形态）。partial index：`'infinity'`（永不复原）的行不进索引，
--   扫描只碰会过期的那些 —— 门这类存档点锚连索引都不占。
CREATE INDEX IF NOT EXISTS idx_kaleido_scene_state_restore_at
  ON kaleido_scene_state (restore_at) WHERE restore_at <> 'infinity'::timestamptz;

-- RLS：照 content_pool 范式 —— 公开读（客户端要能看到「灯是开的」）+ 仅 service_role 写。
ALTER TABLE kaleido_scene_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kaleido_scene_state' AND policyname = 'kaleido_scene_state_read') THEN
    CREATE POLICY kaleido_scene_state_read ON kaleido_scene_state FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kaleido_scene_state' AND policyname = 'kaleido_scene_state_write') THEN
    CREATE POLICY kaleido_scene_state_write ON kaleido_scene_state FOR ALL
      TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON COLUMN kaleido_scene_state.restore_at IS
  '该改动的复原时刻。**''infinity'' = 永不复原**（当前唯一持有者 = 安全屋的门，它是存档点锚，复原会让「后面来的找得到这儿」变成假陈述）。重置作业：DELETE WHERE restore_at <= now()。';
COMMENT ON TABLE kaleido_scene_state IS
  'KALEIDO 场景改动的跨单位持久层。UI 解锁随存档点回滚，本表**永不随单位回滚**（教义 11 §8）。';

-- 验证（执行后手跑）：
--   SELECT count(*) FROM kaleido_scene_state;                          -- 0
--   SELECT policyname, cmd, roles FROM pg_policies WHERE tablename='kaleido_scene_state';
--
-- ⚠ 尚未解决（不阻塞建表，但要在接读写前定）：
--   **重置作业的触发形态**。教义 §8 已登记：仓库有 cron 先例（dtsv-healthcheck-daily）但那是**只读报告**；
--   这是**改游戏状态**的 cron，且跑在 Vercel serverless 上。候选：Supabase pg_cron（在 DB 内，最稳）/
--   Vercel Cron Job / 惰性到期（读时判 restore_at <= now() 即视为已复原，**无需作业**）。
--   🔧 倾向**惰性到期 + 定期清理**：读侧本来就要过滤，惰性判定零新增基础设施、且天然幂等；
--   DELETE 作业只是回收行，晚跑几小时无语义影响。**请 🧭 定。**
