-- 并发安全：为 rooms 表添加乐观锁版本号
-- 在 Supabase SQL Editor 中执行此脚本

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;

-- 可选：添加索引以加速版本检查（rooms 表不大可以不加）
-- CREATE INDEX IF NOT EXISTS idx_rooms_version ON rooms (id, version);

-- 验证
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'rooms' AND column_name = 'version';
