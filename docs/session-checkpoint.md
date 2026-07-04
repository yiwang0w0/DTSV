# DTSV Session Checkpoint（Handoff）— 2026-07-04

> 给未来会话用：读本文件 + `Readme_Claude` 顶部「当前状态」+ `docs/plan/07-parallel-tracks.md` 即可重建上下文，不用回放对话。
> 配合 `~/.claude/skills/dtsv-dev/SKILL.md`（架构/表结构/lore canon/SQL 模式详版）。

## 工作目录与推送

- 主仓 `D:/Fragments/DTSV/`（本地 main 仅作镜像，不在它上面开发）。
- **每轨在自己的 worktree 分支开发**，推 `git push origin <branch>:main`；推前必 `git fetch origin && git rebase origin/main`。
- 现存 worktree（2026-07-04 清理后）：🧭 `suspicious-solomon-598909`（主对话·中控）/ 🔒 `dazzling-knuth-aac2d3` / 🎨 `pedantic-maxwell-c5fe34` / ⚙️ `musing-galileo-5c4f8c` / `stupefied-varahamihira-999232`（独立会话·小游戏「参数」）。
- 死 worktree/分支与 227 条远端 codex 遗产已清（备份 `D:/Fragments/DTSV-cleanup-backup-20260704/`）。

## 四轨分工（详契约见 docs/plan/07 §2）

| 轨 | 范围 | 下一棒 |
|---|---|---|
| 🧭 主对话 | 核心后端系统 + 热文件仲裁（gameActions.js 归它） | 战斗管线 P6 死事件（P2-P4.5 已完）→ 合成 P4-P6 → 04 副本 → 05 集卡 → 06 技能树 |
| 🔒 安全性 | RLS/鉴权/写路径（SQL 51-55） | 全库 RLS 收紧 + admin 写路径 service_role 化（同批上线）；改 EquipmentPassivesSection 先 rebase |
| 🎨 前端 | 玩家端布局/响应式/PWA/主题 | P1 移动地基（viewport/100dvh/16px 输入）→ 对局页响应式 → PWA；另接色板/样式全仓收敛（38 文件硬编码·RARITY_META ×3·BTN/INPUT 私抄） |
| ⚙️ 游戏性 | 平衡/perf/内容（SQL 60-69） | P5 payload 瘦身（gameActions 已解锁·rebase 后动·先打招呼）+ healthcheck 调参 |

## Phase 完成度速览

- **0-28**：搜打撤改造 / 远星函馆世界观 / 肉鸽路径 / 残片三链+六纪元 lore / 探针 / 点数经济+商店 / 职业 / 平衡基建（大量 ENABLED=false 预埋）/ healthcheck+调研自动化 / 立绘 / profile — ✅（索引见 Readme_Claude 历史表）
- **30-33**：时间跳跃 BR 重建并入 /game + 地图编辑器地基 — ✅；**BR 后续阶段有 GATE**（reports/TODO_AUTO.md 顶部：人工走查后才启动，scheduled task 不自动推进）
- **37**：玩家/NPC 统一战斗 + **中性铁律**确立 — ✅
- **40-41**：全模块提速/冗余/割裂三波 — ✅
- **43 战斗钩子管线**：P0/P1(schema+纯函数) ✅ · P2/P3(全路径接线) ✅ · P4(authoring) ✅ · P4.5(攻守方向性) ✅ · **P6 死事件 = 下一棒**
- **49/50**：item_recipes 道具合成（仅局内·局外用户拍板不做）+ item_tags — ✅
- 后台：4 组侧栏 + hub 收编 + URL 深链 + 内容引擎 — ✅
- SQL 部署史：`scripts/phase-*.sql` 全部幂等留档，文件头标「已应用」；号段分配见 plan/07 §4（主对话 43-48/70-79 · 安全 51-55 · 游戏性 60-69 · 已占 49/50）。

## 关键运行时事实（接线前必读）

- 战斗管线真源 = `src/lib/combatPipeline.js`（短阶段名 + `runCombatPipeline(ctx, evalFn)` + OFFENSIVE/DEFENSIVE_STAGES 攻守二分）。docs/plan/02 的长名/旧签名过时（有勘误横幅）。
- `gameActions.applyCombatPipeline(damageRaw, {attacker, defender, defenderHp, resolution, label})` 是 6 处战斗路径共用的中性闸口：空 modifier 池直接短路返回原伤害。
- 中性不变量（改动后必须保持）：`passive_skills.stage` 全 NULL + `classes.perks` 无 pipeline_modifiers ⇒ 战斗数值逐字节不变。smoke：`node scripts/smoke-pipeline.mjs`(21 断言) / `smoke-itemcraft.mjs`(23)。
- 背包是 `string[]` 道具名数组；配方/引用一律 item_id ⇒ id↔name 桥接（itemCraft.js 范式）。
- 预埋未激活模块（勿当死代码删）：nemesis / chamberResidue / newbieProtection / signalLock / heat / coldCases / loadoutPresets / runGoals（各 ENABLED=false 或未接线，注释可证）。
- admin 鉴权：AuthContext `loading` 门控（硬加载竞态已修）；/admin 仅 PRIMARY_ADMIN(`2949215486@qq.com`·kanata)。
- 浏览器验证：登录该账号，经 SPA 导航（如 /rooms「进入→」）避开硬加载水合竞态；手机(≈390×844)+桌面双尺寸截图。
- postgres MCP 已配 service-role 可直接 query；RLS 目前全关 = 🔒 轨第一棒。

## 红线（违者回滚）

Phase 37 中性 / 只改 Readme_Claude 不动 Readme_GPT / `scripts/phase-25q-nemesis-pvp-death.sql` 保持 untracked / 显式路径 add 禁 `git add -A` / SQL 幂等先审后跑 / 不 DROP·TRUNCATE 现有表·不重命名路由 / ID 引用不按名串 / 中文提交 + `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` / 六纪元 lore canon（不解释只描述·机制叙事双频道隔离·F01-F15 永久可发现）/ 用户偏好：不中途请示·自主判断·完成后报告。
