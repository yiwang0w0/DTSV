-- ============================================================
-- Phase 27 — 角色立绘系统
-- ============================================================
-- 玩家可在游戏左侧栏展示一张立绘图。来源:
--   - preset: admin 添加的系统预设立绘(直接 approved)
--   - user_upload: 玩家上传 → status=pending → admin 审核 → approved/rejected
--
-- 存储:Supabase Storage public bucket "portraits"
--   URL 形如 https://thlapfhxysfmjpjjpmmh.supabase.co/storage/v1/object/public/portraits/<file>
--
-- 玩家选择: profiles.selected_portrait_id → portraits.id
-- 进入 raid 时 joinRoom 把 portraits.image_url 注入 player.portraitUrl
-- ============================================================

BEGIN;

-- 1. portraits 表
CREATE TABLE IF NOT EXISTS portraits (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  image_url     TEXT NOT NULL,
  storage_path  TEXT,  -- 'portraits/<file>'; preset 可为 null(外链)
  kind          TEXT NOT NULL CHECK (kind IN ('preset', 'user_upload')),
  uploader_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  reject_reason TEXT,
  approved_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  enabled       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS portraits_status_idx ON portraits(status) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS portraits_uploader_idx ON portraits(uploader_id) WHERE uploader_id IS NOT NULL;

COMMENT ON TABLE portraits IS 'Phase 27 角色立绘库。preset = admin 添加(approved); user_upload = 玩家上传(pending → admin 审核)';
COMMENT ON COLUMN portraits.storage_path IS 'Supabase Storage 路径(用于审核拒绝时清理文件)';

-- 2. profiles 加 selected_portrait_id 字段
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS selected_portrait_id BIGINT REFERENCES portraits(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS profiles_selected_portrait_idx ON profiles(selected_portrait_id) WHERE selected_portrait_id IS NOT NULL;
COMMENT ON COLUMN profiles.selected_portrait_id IS 'Phase 27 玩家当前选中的立绘 id(必须 portraits.status=approved 才能选)';

-- 3. RLS — portraits 表
ALTER TABLE portraits ENABLE ROW LEVEL SECURITY;

-- 任何已登录用户可读 approved 立绘
DROP POLICY IF EXISTS portraits_select_approved ON portraits;
CREATE POLICY portraits_select_approved ON portraits FOR SELECT
  USING (status = 'approved' OR uploader_id = auth.uid());

-- 玩家可插入自己的 user_upload(初始 status=pending)
DROP POLICY IF EXISTS portraits_insert_own ON portraits;
CREATE POLICY portraits_insert_own ON portraits FOR INSERT
  WITH CHECK (
    auth.uid() = uploader_id
    AND kind = 'user_upload'
    AND status = 'pending'
  );

-- 玩家可删除自己的 pending(撤回);approved 后不能改
DROP POLICY IF EXISTS portraits_delete_own_pending ON portraits;
CREATE POLICY portraits_delete_own_pending ON portraits FOR DELETE
  USING (auth.uid() = uploader_id AND status = 'pending');

-- admin 全权限通过 service_role(MCP / server-side) 操作,无需额外 policy

-- 4. seed 3 个预设立绘(占位,链接为 placeholder.com 直到 admin 替换为真实图片)
INSERT INTO portraits (name, image_url, kind, status) VALUES
  ('PI-引导者 默认',  'https://placehold.co/240x420/1c2129/58a6ff/png?text=PI-Default',     'preset', 'approved'),
  ('伊甸协议 制服',   'https://placehold.co/240x420/2a1f3a/d29922/png?text=Eden-Uniform',   'preset', 'approved'),
  ('Ω-段 观测员',     'https://placehold.co/240x420/1f2d1f/bc8cff/png?text=Omega-Observer', 'preset', 'approved')
ON CONFLICT DO NOTHING;

COMMIT;

-- 验证:
-- SELECT id, name, kind, status FROM portraits ORDER BY id;
-- SELECT count(*), status FROM portraits GROUP BY status;
