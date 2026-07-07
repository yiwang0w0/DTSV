-- ─────────────────────────────────────────────────────────────────
-- KALEIDO 渐进披露 · ui_unlocks 账号级持久化(06 契约 §4 · KP1-E step 0 ② · ✅ 已应用 2026-07-07 by 🔒)
-- ✅ 已应用(2026-07-07·🧭 批准·🔒 经 postgres MCP 执行)。列级防伪守卫见 scripts/kaleido-ui-unlocks-guard.sql(同批已应用)。
-- ─────────────────────────────────────────────────────────────────
-- 幂等·可重跑。写好**先不跑** → 交 🧭/🔒 审 → 批准后经 postgres MCP 执行,执行后本文件头标「已应用」。
-- 依赖:profiles 表(Supabase auth 扩展表,已含 stash_capacity/pending_class_roll/selected_portrait_id)。

-- profiles.ui_unlocks:账号级已解锁 ui_key 集(单调 JSON 数组),兼容 R8/R9(元进度·permadeath/收敛不回收)。
--   与 pending_class_roll(JSONB)/stash_capacity 同范式:账号级设置随 profiles 一行持久。
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ui_unlocks JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ── RLS 审点(🔒)────────────────────────────────────────────────
--   profiles 既有 RLS = owner-read(id = auth.uid()) + service-write。ui_unlocks 继承之,无需新策略。
--   ⚠ 关键约束:owner **不可自改** ui_unlocks(防客户端伪造解锁绕过渐进披露)。
--     写路径唯一 = 服务端路由边界 applyKaleidoPostAction(service_role,绕过 RLS)。
--   请 🔒 核 profiles 现有 owner UPDATE 策略:
--     · 若无 owner UPDATE 策略(owner 只能 SELECT)→ 天然满足,owner 无法写任何列。
--     · 若有 owner UPDATE 策略允许自改列 → 需确保其 WITH CHECK 不放行 ui_unlocks 篡改
--       (或应用层从不经 anon/authenticated 客户端写 profiles.ui_unlocks —— 现状即如此,解锁只经服务端)。
--
-- 接入方(Commit B·本 DDL 应用后):src/lib/server/gameActions.js
--   · startKaleidoRun run 起始:读 profiles.ui_unlocks → 并 ['search_btn'] 种子 player.uiUnlocks(跨 run 继承);
--   · applyKaleidoPostAction 解锁时:追加新键到 profiles.ui_unlocks(账号持久)。
--   Commit A(已上 main)仅运行时机制(每 run 种子 ['search_btn']),无本列依赖 → 本列应用后账号继承自然点亮。
