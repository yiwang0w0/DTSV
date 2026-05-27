-- ============================================================
-- Phase 25e — player_notifications 表 + 探针主人"回信"通道
-- ============================================================
-- 来源 finding: research-2026-05-27-v3 主题 E
-- "探针被遭遇后给主人写回信到 `player_notifications`
--  （被谁遇到 / 攻击 or 放过）。"
--
-- 现状: Phase 25d 已埋 encounter_log（per-probe 事件流）+ v_probe_telemetry
-- （admin 全局视图），但 probe 主人本人对自家探针发生了什么完全无感。异步层
-- 缺少"反向交互信号" — 玩家留下探针后没有任何反馈循环，等同于把内容沉到黑洞。
--
-- 设计:
--   1. CREATE TABLE player_notifications — 通用玩家收件箱
--      (kind / title / body / payload / read / created_at)
--      预留 kind 名空间给将来 nemesis / streak-breaker / weekly summary 等
--   2. 索引: 按 (user_id, read, created_at DESC) 取未读
--   3. probes.js / gameActions.js 在 spared / defeated / killed_attacker 三个
--      最终 outcome 时给 probe.owner_id 写一条记录
--      (encountered 中间态不发 — 避免 spam，且必然有后续 outcome 跟进)
--
-- 反 spam / anti-PII:
--   - 28-E P0 (anonymization) 要求 owner 永远看不到 attacker 真实身份；本表
--     存储字段中 by_pseudonym 已是稳定假名（`观测者-XXXX` = uuid 前 4 hex），
--     不存 attacker user_id，杜绝事后泄漏
--   - body 文本只描述行为 + chamber 编号，不含 PII
--
-- 兼容:
--   - 表为新建，无既有数据
--   - 任何写入失败仅 console.error，不阻塞 raid 战斗结算（exception-safe）
--
-- 验证:
--   SELECT kind, COUNT(*) FROM player_notifications GROUP BY kind;
--   SELECT * FROM player_notifications WHERE user_id = '<owner-uuid>' AND read = false ORDER BY created_at DESC LIMIT 10;
-- ============================================================

BEGIN;

-- 1. 通用玩家收件箱
CREATE TABLE IF NOT EXISTS player_notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT player_notifications_kind_nonempty CHECK (length(kind) > 0)
);

-- 2. 未读取件箱主索引（user_id + read + created_at desc）
CREATE INDEX IF NOT EXISTS idx_player_notifications_user_unread
  ON player_notifications(user_id, read, created_at DESC);

-- 3. 按 kind 聚合（admin / debug 用）
CREATE INDEX IF NOT EXISTS idx_player_notifications_kind
  ON player_notifications(kind);

-- 4. 注释
COMMENT ON TABLE player_notifications IS
  'Phase 25e — 通用玩家收件箱。kind 命名约定: probe_spared / probe_defeated / probe_killed_attacker / nemesis_engaged / streak_breaker / weekly_summary 等';
COMMENT ON COLUMN player_notifications.payload IS
  '结构化附加数据（JSONB）。probe 系: {probe_id, chamber_template_id, by_pseudonym, outcome}';
COMMENT ON COLUMN player_notifications.kind IS
  '事件类型枚举（应用层维护）。读取端按 kind 分类渲染';

COMMIT;
