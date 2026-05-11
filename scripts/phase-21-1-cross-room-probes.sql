-- ============================================================
-- Phase 21.1 — cross_room_probes：异步 PvPVE 跨 raid 探针
-- ============================================================
-- 玩家撤离时可选"留下探针"（消耗 1 件 platform_part 物品）。探针在某
-- chamber_template_id 上持久化，其他玩家进入同 template 时 5-10% 概率
-- 遭遇。击败探针 → 抢主人 1 条残片 decode +1。
--
-- 字段：
--   owner_id          uuid — 留下探针的玩家
--   chamber_template_id int — 留在哪个 chamber 模板（任何玩家路过都可能遇到）
--   hp                int  — 探针 HP（被击败后状态=defeated 移除）
--   max_hp            int  — 初始 HP
--   atk               int  — 攻击力（按主人当时装备推算）
--   def               int  — 防御力
--   equipment_snapshot jsonb — 4 槽装备名称快照（不实际占用 equipment_instances）
--   fragments_carry   int[] — 主人留在身上的可被夺残片 ID 列表
--   created_at        timestamptz
--   expires_at        timestamptz — 7 天后自动过期（C1 决策）
--   found_count       int  — 被其他玩家遭遇次数
--   defeated_count    int  — 被击败次数
--   status            text — 'active' | 'defeated' | 'expired'
--   defeated_at       timestamptz NULL
--   defeated_by       uuid     NULL — 击败者 ID
-- ============================================================

CREATE TABLE IF NOT EXISTS cross_room_probes (
  id                  BIGSERIAL PRIMARY KEY,
  owner_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chamber_template_id INTEGER NOT NULL,
  hp                  INTEGER NOT NULL DEFAULT 60,
  max_hp              INTEGER NOT NULL DEFAULT 60,
  atk                 INTEGER NOT NULL DEFAULT 12,
  def                 INTEGER NOT NULL DEFAULT 8,
  equipment_snapshot  JSONB NOT NULL DEFAULT '{}'::jsonb,
  fragments_carry     INTEGER[] NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  found_count         INTEGER NOT NULL DEFAULT 0,
  defeated_count      INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'active',
  defeated_at         TIMESTAMPTZ,
  defeated_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT cross_room_probes_status_check CHECK (status IN ('active', 'defeated', 'expired'))
);

-- 加速查询：按 chamber_template_id + status + expires_at（用于遭遇抽取）
CREATE INDEX IF NOT EXISTS cross_room_probes_active_idx
  ON cross_room_probes(chamber_template_id, expires_at)
  WHERE status = 'active';

-- 加速查询：按 owner_id（用于"我的探针"列表）
CREATE INDEX IF NOT EXISTS cross_room_probes_owner_idx
  ON cross_room_probes(owner_id, created_at DESC);

COMMENT ON TABLE cross_room_probes IS
  'Phase 21 异步 PvPVE 探针。玩家撤离时消耗 platform_part 留下探针，其他玩家进入同 chamber_template 时遭遇。';

COMMENT ON COLUMN cross_room_probes.equipment_snapshot IS
  '4 槽装备名称快照: { probe, shield, weapon, comm } — 仅展示用,不实际占用 equipment_instances';

COMMENT ON COLUMN cross_room_probes.fragments_carry IS
  '主人留下的可被夺残片 ID; 击败探针时随机抽 1 条让击败者 decode +1';

-- 自动过期清理（可选 — 通过 cron 跑或 admin 手动）
-- UPDATE cross_room_probes SET status = 'expired'
-- WHERE status = 'active' AND expires_at < now();

-- 验证
-- SELECT count(*) FROM cross_room_probes WHERE status = 'active';
