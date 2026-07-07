# 🔒 安全性轨

**职能**:RLS / 鉴权 / 输入校验 / 密钥 / 越权;各轨交付的安全审(schema/路由/纯函数 R1)。
**归属**:`scripts/phase-5x-*-rls.sql`、`src/lib/auth.js`、`src/lib/serverSupabase.js`、`src/lib/server/adminContent.js`、`/api/admin/*` 鉴权段、`src/lib/formulaSandbox.js`。
**当前状态(2026-07-07)**:⏸ 停机待命。停点 = phase-52 全库收官(51+52a+52b 全批·anon 可写面清零·玩家数据 owner-read)+ resolveTurn R1 审毕。
**恢复后队列**:①🔧 新交付触发审(LW-3/D3) ②kaleido-e2e.mjs 脚本安全复核(低优)。
**红线**:SQL 幂等·先写后审(🧭)再经 postgres MCP 执行;RLS 迁移不回滚;详见 docs/plan/07 §0。
**变更日志**:[log.md](log.md)(倒序置顶追加)。
