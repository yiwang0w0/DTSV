-- ============================================================
-- profiles.ui_unlocks 列级防伪守卫（🔒 KP1-X item 2 · 审 06-ui-unlocks-contract §4 DDL）
-- ============================================================
-- 轨道：🔒 安全性（越权 / 输入校验）
--
-- ── 背景（🔒 实测 pg_policies · 2026-07-07）──
--   profiles 现行 RLS（rls_enabled=true·未 forced）三策略，均 roles={public}（含 anon/authenticated）：
--     profiles_select  SELECT USING(true)                     ← 公开读（非 owner-read！）
--     profiles_insert  INSERT WITH CHECK(auth.uid() = id)     ← owner 可建本行
--     profiles_update  UPDATE USING(auth.uid() = id)·with_check=NULL  ← owner 可改本行任意列
--   且 anon/authenticated 均持表级 UPDATE/INSERT grant。
--
-- ── 问题（案 ②：owner 可自改 → 06 §4「owner 不能自改 ui_unlocks」不成立）──
--   ui_unlocks 若仅作 profiles 普通列：任意登录 owner 可
--       UPDATE profiles SET ui_unlocks = '["<全部12键>"]' WHERE id = auth.uid();
--   该写通过 profiles_update（USING 命中 + with_check=NULL 无出参约束）→ 伪造整套解锁集。
--   **行级 RLS 无法约束列**。且 startKaleidoRun（gameActions.js ~:2642，06 §3.5）run 起始
--   读 profiles.ui_unlocks 当权威种子 → 伪造值被服务端信任、播入 player.uiUnlocks 持久生效。
--
-- ── 为何不能改策略而须列级守卫 ──
--   profiles_update 是在用的合法路径：PrepareModal.jsx（'use client'·anon 客户端）:222/:238
--   `from('profiles').update({ saved_loadouts })` 依赖 owner-UPDATE。DROP/收窄策略 = 砸载具保存。
--   RLS with_check 无法引用 OLD（只见 NEW）→ 无法表达「ui_unlocks 不变」。列级 GRANT 白名单
--   需枚举全部客户端可写列且随 schema 漂移，脆。→ 唯 BEFORE 触发器可对单列做「客户端角色不可变」。
--
-- ── 本守卫 ──
--   default-deny 白名单：仅 {service_role, postgres, supabase_admin} 可改 ui_unlocks；
--   客户端角色（authenticated/anon 及任何 PostgREST SET ROLE 的非可信角色）：
--     · UPDATE 改动该列 → RAISE（fail-loud·浮现伪造企图）
--     · INSERT 非空该列 → 静默强制 '[]'（不破坏建行流·中和创建期伪造）
--   不触碰 profiles 其它列写路径（saved_loadouts/roomid/... 照旧）。
--   SECURITY INVOKER（必须）→ current_user 反映真实调用角色（PostgREST SET ROLE 后 = 该角色）。
--
-- ── 实现耦合约束（交 🔧）──
--   06 §3.2 的 profiles.ui_unlocks 写入**必须用 service_role 客户端**（非用户 JWT 的 authenticated
--   客户端）；否则合法解锁写 current_user='authenticated' 会被本守卫拒。契约 §4「写仅 service_role」
--   即此意，落地务必用 service-role 连接写该列。
--
-- 幂等：CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS + CREATE TRIGGER（可重跑）。
-- 执行顺序：① 06 §4 DDL 建列 → ② 本守卫 → ③ 🔧 服务端 service_role 写路径 → ④ 🔒 复验。
--
-- ✅ 状态：**已应用**（2026-07-07 · 🧭 执行令批准 · 🔒 经 postgres MCP 执行·紧随 §4 DDL）。
--   落地复验（三探针·RAISE 回滚·零持久改动）：
--     · authenticated(匹配 JWT sub)改 ui_unlocks → REJECTED_OK(insufficient_privilege)
--     · service_role 改 ui_unlocks → ALLOWED_OK
--     · authenticated 改 saved_loadouts(旁列) → OTHERCOL_ALLOWED_OK(PrepareModal 不受影响)
--   触发器实测：BEFORE INSERT/UPDATE·enabled·SECURITY INVOKER。端到端 step④(🔧 Commit B 服务端写路径 + 真会话)待 🔧 落地后补。
-- ============================================================

-- 前置（与 06 §4 DDL 同批·此处复列保幂等自足；单跑本文件亦不缺列）
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ui_unlocks JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.guard_profiles_ui_unlocks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- 可信角色（服务端解锁路径 + 迁移基础设施）无条件放行
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- 客户端建行：ui_unlocks 强制种子空集，中和创建期伪造（正常建行不指定该列 = 已是 '[]'，无感）
    IF NEW.ui_unlocks IS DISTINCT FROM '[]'::jsonb THEN
      NEW.ui_unlocks := '[]'::jsonb;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- 客户端改动该列 = 越权伪造 → 拒（未改动则 NEW=OLD·IS DISTINCT 为假·放行其它列写）
    IF NEW.ui_unlocks IS DISTINCT FROM OLD.ui_unlocks THEN
      RAISE EXCEPTION 'ui_unlocks 只能由服务端解锁路径写入（当前角色 %）', current_user
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profiles_ui_unlocks ON profiles;
CREATE TRIGGER trg_guard_profiles_ui_unlocks
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profiles_ui_unlocks();

-- ── 执行后复验探针（🔒 · 批准执行后单独跑；此处注释保留口径）──
--   以 anon/authenticated 角色试改必败、service_role 试改必成：
--   DO $$ BEGIN
--     SET LOCAL ROLE authenticated;
--     -- 伪造改动应抛 insufficient_privilege：
--     UPDATE profiles SET ui_unlocks = '["hp_bar"]' WHERE id = (SELECT id FROM profiles LIMIT 1);
--   END $$;   -- 期望：ERROR ui_unlocks 只能由服务端解锁路径写入（当前角色 authenticated）
