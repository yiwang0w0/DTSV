-- ============================================================
-- Phase 25i — chamber_residue 持续痕迹 v1（"the world remembers"）
-- ============================================================
-- 来源 finding: research-2026-05-28-E 主题 E
-- "新建 chamber_residue(owner_pseudonym, chamber_template_id, last_npc_killed,
--  last_loot_taken, last_death_location, expires_at +72h)。raid 结束 /
--  探针被遭遇时 snapshot，下位进场玩家 prefetch 最近 5 条作为环境信息
--  （'💀 这里曾有人倒下'）。"
--
-- 现状: DTSV 异步层（Phase 21 探针 + Phase 25d/e 遥测/回信）已让"玩家留下的
-- 主动威胁"可被遭遇，但 chamber 本身是失忆的 — 上一位幸存者在这里击杀了什么、
-- 拿走了什么、死在哪里，下一位进场者完全无感。Hunt: Showdown 2.7 "the world
-- remembers" 把这种被动环境痕迹做成了 2026 extraction 标杆；DTSV 缺它是异步层
-- 根性缺口。
--
-- 设计:
--   1. CREATE TABLE chamber_residue — 按 chamber_template 累积的环境痕迹快照
--      (owner_pseudonym / last_npc_killed / last_loot_taken / last_death_location)
--   2. expires_at 默认 +72h（与探针 7 天不同 — 痕迹更短暂，避免 chamber 被旧
--      残渣淹没）
--   3. source 区分两个 snapshot 触发点：raid_end / probe_encounter
--   4. 索引: (chamber_template_id, created_at DESC) 支撑"prefetch 最近 5 条"
--
-- 反 PII / anti-griefing（28-E P0 anonymization 一致性）:
--   - 只存 owner_pseudonym（`观测者-XXXX`，由 buildOwnerPseudonym 派生），
--     绝不存 owner 真实 user_id / username / email
--   - last_* 字段只描述行为对象（NPC 名 / 道具名 / 地点名），不含 PII
--
-- 兼容:
--   - 表为新建，无既有数据
--   - 预埋不立即启用：snapshot 写入 + prefetch 读取由
--     src/lib/server/chamberResidue.js 提供纯 helper，等 Phase 21/24b 入场流程接入
--   - 任何写入失败仅 console.error，不阻塞 raid 结算（exception-safe，应用层保证）
--
-- 验证:
--   SELECT source, COUNT(*) FROM chamber_residue GROUP BY source;
--   SELECT * FROM chamber_residue WHERE chamber_template_id = <id>
--     AND expires_at > now() ORDER BY created_at DESC LIMIT 5;
-- ============================================================

BEGIN;

-- 1. chamber 环境痕迹快照表
CREATE TABLE IF NOT EXISTS chamber_residue (
  id BIGSERIAL PRIMARY KEY,
  chamber_template_id INTEGER NOT NULL,
  owner_pseudonym TEXT NOT NULL DEFAULT '匿名观测者',
  last_npc_killed TEXT,
  last_loot_taken TEXT,
  last_death_location TEXT,
  source TEXT NOT NULL DEFAULT 'raid_end',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '72 hours'),
  CONSTRAINT chamber_residue_owner_nonempty CHECK (length(owner_pseudonym) > 0),
  CONSTRAINT chamber_residue_source_valid CHECK (source IN ('raid_end', 'probe_encounter'))
);

-- 2. prefetch 主索引（按 chamber + 最新优先取最近 N 条）
CREATE INDEX IF NOT EXISTS idx_chamber_residue_chamber_recent
  ON chamber_residue(chamber_template_id, created_at DESC);

-- 3. 过期清理用索引（cron / 后续 GC 按 expires_at 扫）
CREATE INDEX IF NOT EXISTS idx_chamber_residue_expires
  ON chamber_residue(expires_at);

-- 4. 注释
COMMENT ON TABLE chamber_residue IS
  'Phase 25i — chamber 被动环境痕迹快照（"the world remembers"）。raid 结束 / 探针被遭遇时写入，下位进场玩家 prefetch 最近 5 条。72h 过期。';
COMMENT ON COLUMN chamber_residue.owner_pseudonym IS
  '匿名代号（观测者-XXXX，buildOwnerPseudonym 派生）。28-E anti-PII：绝不存真实身份。';
COMMENT ON COLUMN chamber_residue.last_death_location IS
  '上一位幸存者倒下/离场的地点描述（chamber 名 / 深度），用于"💀 这里曾有人倒下"环境提示。';
COMMENT ON COLUMN chamber_residue.source IS
  'snapshot 触发点：raid_end（撤离/阵亡结算）/ probe_encounter（探针被遭遇时）。';

COMMIT;
