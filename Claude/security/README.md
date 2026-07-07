# 🔒 安全性轨

**职能**:RLS / 鉴权 / 输入校验 / 密钥 / 越权;各轨交付的安全审(schema/路由/纯函数 R1)。
**归属**:`scripts/phase-5x-*-rls.sql`、`src/lib/auth.js`、`src/lib/serverSupabase.js`、`src/lib/server/adminContent.js`、`/api/admin/*` 鉴权段、`src/lib/formulaSandbox.js`。
**当前状态(2026-07-08)**:▶ 触发审待命(KP1-X)。基线 = phase-52 全库收官(51+52a+52b 全批·anon 可写面清零·玩家数据 owner-read)+ resolveTurn R1 审毕。**KP1-X item1(kaleido-e2e 复核)+ item2(ui_unlocks DDL+列级守卫·已应用)均结**;**ui_unlocks 越权/伪造面 🧭 正式签字关闭**(守卫 3 探针 + Commit B 继承码静态审)。
**队列(待触发)**:
- **① 复核 🔧 E2E 跨 run 继承断言**(方案 A·🔧 建专用种子测试 auth 用户·E2E-* 标记·每跑重置 ui_unlocks='[]'·不碰 kanata 与 3 真账号)→ 断言落地后我复核逻辑 = 继承功能验最终签字。
- **② 🔧 工作包触发审**(hook① 消费器 / LW-3 gauntlet / D5 富路径 seed 化)。**重点面**:(a) seed PRNG 注入不外溢多人路径(isKaleidoRoom 域守卫·多人局 Math.random 不动) (b) hook① 的 event_deck 消费不引入客户端可控输入(payload 全部服务端产) (c) E2E 临时 `UPDATE enabled=true` 的 `finally` 恢复完备性。
- **③ ⚙️ item_pool/item_recipes 新行 SQL**(内容行·🧭 主审·🔒 抽查 RLS 面即可)。
**红线**:SQL 幂等·先写后审(🧭)再经 postgres MCP 执行;RLS 迁移不回滚;详见 docs/plan/07 §0。
**变更日志**:[log.md](log.md)(倒序置顶追加)。
