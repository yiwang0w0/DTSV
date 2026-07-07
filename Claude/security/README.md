# 🔒 安全性轨

**职能**:RLS / 鉴权 / 输入校验 / 密钥 / 越权;各轨交付的安全审(schema/路由/纯函数 R1)。
**归属**:`scripts/phase-5x-*-rls.sql`、`src/lib/auth.js`、`src/lib/serverSupabase.js`、`src/lib/server/adminContent.js`、`/api/admin/*` 鉴权段、`src/lib/formulaSandbox.js`。
**当前状态(2026-07-07)**:▶ 已复工(KP1-X·rebase=473ddb4)。基线 = phase-52 全库收官(51+52a+52b 全批·anon 可写面清零·玩家数据 owner-read)+ resolveTurn R1 审毕。**kaleido-e2e.mjs 安全复核已完成**(4 confirmed 全 low·无 high/medium·仅出意见不改脚本·详见 log)。
**队列**:~~①🔧 ui_unlocks 持久化 DDL 审 + 守卫~~ **✅ 审毕并执行**(案②·profiles 有 owner-UPDATE policy→owner 可伪造 ui_unlocks;补 BEFORE INSERT/UPDATE 列级守卫 [`scripts/kaleido-ui-unlocks-guard.sql`](../../scripts/kaleido-ui-unlocks-guard.sql)·🧭 批准·经 postgres MCP 应用·3 探针验证:客户端伪造被拒/service_role 写通/旁列不回归)。**step④**:守卫探针复跑 PASS + Commit B 继承码静态安全审 PASS（越权/伪造面已闭合签字）；**功能跨 run 继承执行验受阻**（本轨无 service JWT + 无可用测试账号·4 用户全真实·已报 🧭 协调·建议 🔧 增 E2E 继承断言）。②🔧 LW-3/D3 触发审(mergeGameRules formula_overrides 白名单 damage|defense|crit;D5=乙 kaleido 富路径 Math.random→seed PRNG·重点审 PRNG 注入不外溢多人路径)待 🧭 转。
**红线**:SQL 幂等·先写后审(🧭)再经 postgres MCP 执行;RLS 迁移不回滚;详见 docs/plan/07 §0。
**变更日志**:[log.md](log.md)(倒序置顶追加)。
