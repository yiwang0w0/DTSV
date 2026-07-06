# 07 · 并行开发轨道契约（2026-06-20 · 状态刷新 2026-07-06）

> 🚨 **主线切换（2026-07-06）**:核心主线 = **KALEIDO**(单人 run·AI 生成内容)。三轨当前任务以 [`kaleido/03-track-packages.md`](kaleido/03-track-packages.md) 派单为准(⚙️ KP0-S 服务端核心 / 🎨 KP0-C 单人壳 UI / 🔒 KP0-X 数据层安全);本文件 §2 的旧待办中——🎨 移动化+色板收敛、🔒 phase-52 RLS 扫描**继续有效**,⚙️ P5 payload 瘦身**暂停**,🧭 的 04/05/06 子系统**冻结**。§0 红线、§1 推送协议、§3 热文件矩阵、§4 号段全部照旧;KALEIDO SQL 用独立命名空间 `scripts/kaleido-*.sql`(不占号段)。gameActions.js/roomState.js/constants.js 的 KP0-S 改动已获中控预批。

> 4 个并行子对话：🔒 安全性 / 🧭 主对话（中控·仲裁） / 🎨 前端美化 / ⚙️ 游戏性优化 —— 三个子轨会话已建（worktree：dazzling-knuth / pedantic-maxwell / musing-galileo），待投递 kickoff。
> 本文件是 4 轨**共享契约**：各轨范围、文件归属、待办、完成标准，以及**避免互相踩踏**的协作与推送协议。
> **每个 fork 开工前必读**：本文件全文 + `Readme_Claude` 顶部「🧭 当前状态」+ `docs/session-checkpoint.md`。
> 2026-07-04 清理注记：远端 227 条 codex 遗产分支已删、3 个死 worktree 已移除（备份 `D:/Fragments/DTSV-cleanup-backup-20260704/`）；除 4 轨 + stupefied（小游戏会话）外不应再有其它分支。

---

## 0. 全轨共守红线（铁律 · 任何 fork 不得违反）

- **Phase 37 中性铁律**：空配置 ⇒ 数值/行为逐值不变。新系统默认中性，用户填内容才生效。新代码若改动现有行为，必须能证明空配置下逐字节等价（smoke / 闸口）。
- **只更新 `Readme_Claude`，绝不动 `Readme_GPT`**。
- **不提交** `scripts/phase-25q-nemesis-pvp-death.sql`（保持 untracked）。一律 `git add <显式路径>`，**不用 `git add -A`**。
- 提交信息中文 + 尾签：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- SQL 迁移**幂等**（`IF NOT EXISTS` / `pg_constraint` 守卫 / `DROP ... IF EXISTS`）；写好先不跑，审后经 postgres MCP 执行（或在文件头注明「已应用」）。
- **UI 改动后必须连浏览器、按手机(≈390×844)+桌面尺寸截图验证**（用户标准要求）。`/admin` 仅 PRIMARY_ADMIN(`2949215486@qq.com`·显示名 kanata) 可见——验证 admin 需登录该号；硬加载 `/admin?...` 经「进入→」式 SPA 导航避开鉴权水合竞态。
- 引用一律 **ID 不按名串匹配**（杜绝改名断链）；不碰残片可发现性 / 六纪元 lore / 缩圈致死 / 房间投放确定性（既有红线）。

## 1. Git / 分支 / 推送协议（4 轨并行最大的实操风险）

- 每轨在**自己的 worktree 分支**工作，推 `git push origin <branch>:main`（fast-forward）。
- ⚠ **4 轨都推同一个 main ⇒ 非第一个推送会被拒（non-fast-forward）。** 协议：
  1. 推之前先 `git fetch origin && git rebase origin/main`，解冲突后再推。
  2. **小步频繁提交**，缩小 rebase 冲突面。
  3. 冲突集中在「热文件」(§3)——碰热文件前先按 §3 协调。
- **主对话轨**负责仲裁热文件 + 决定集成顺序；跨轨冲突以主对话为准。

## 2. 四轨范围 + 待办（按优先级）

### 🔒 安全性
**范围**：RLS / 鉴权 / 输入校验 / 密钥 / 越权。
**拥有文件**：`scripts/phase-51..55-*-rls.sql`(见 §4)、`src/lib/auth.js`、`src/lib/serverSupabase.js`、RLS 策略、各 API 路由鉴权段。
**待办**：
- [ ] **全库 RLS 收紧**（当前 RLS 全关 · anon key 可写内容表 = 已知 4/10 漏洞）。优先 `item_recipes`/`item_recipe_ingredients`/`item_tags`/`tier_recipes`/`recipe_ingredients`：开 RLS + 公开读 + 写仅 `service_role`。范式见 `03-crafting-synthesis.md` §2.2。
- [ ] **内容写路径改走服务端 service_role**（RLS 收紧的联动·03 §3.4）：admin 编辑器现用浏览器 anon client 直写，RLS 收紧后会被挡——配方/标签保存改 `postGameApi('/api/admin/...')`。**与 RLS migration 同批上线**（否则编辑器「能读不能写」窗口期）。
- [ ] 跑 `/security-review` 过当前分支；server actions 输入校验审计（gameActions 各 action 的 payload 校验）。
- [ ] 复核 admin 鉴权（硬加载重定向竞态已修·`14c8c7c`；做广义审查：越权动作、service-role 误用、密钥泄漏面）。
**完成标准**：anon key 无法写任何内容表；admin 写路径走 service_role；security-review 无高危。

### 🧭 主对话（orchestration + 核心后端系统）
**范围**：路线图、热文件仲裁、核心玩法系统后端、`gameActions` 上帝文件治理。
**拥有文件**：`docs/plan/*`、`src/lib/server/gameActions.js`(主)、新系统 schema、`Readme_Claude` 的「当前状态」头部与集成节。
**待办**（详细设计见 `docs/plan/01..06`）：
- [x] 战斗钩子管线 **P3** ✅(`07ee62b`·6 处统一 applyCombatPipeline 中性闸口) → **P4** authoring ✅(`69c88d4`) → **P4.5** 攻守方向性 ✅(`c833f25`·OFFENSIVE/DEFENSIVE_STAGES)。
- [x] 战斗钩子管线 **P6** 四触发事件全部收口：on_hp_below_30(`26566e5`) + on_turn_start + on_equip(`d2593dc`) + on_defend(管线覆盖)·全中性。⚠ 被动系统 0/17 tier 绑定 → 全部中性但内容休眠；真正下一步 = 让 tier 绑 passive_skill_id + 录 demo。
- [ ] 合成链 **P4-P6**（gold_cost 经济决策 / catalyst 语义清洁 / 防自引用环校验；**局外回港合成用户明确不做**）。
- [ ] **04 副本/NPC** → **05 集卡/成就** → **06 技能树**（守 roadmap 顺序：道具→…→技能树）。
- [ ] `gameActions.js` 拆分减负（长期·上帝文件债）。
**完成标准**：各系统后端可用 + 中性 + smoke/build 过。

### 🎨 前端美化（移动化 + 视觉打磨）
**范围**：玩家端 UI、响应式、PWA、主题。**偏异步 ⇒ 不碰原生、不做 push/后台保活。**
**拥有文件**：`src/app/globals.css`、`src/lib/theme.js`、`src/app/layout.js`(viewport/PWA·注意 `'use client'` 不能 export viewport→需提 server 边界)、`app/manifest.ts`、玩家页组件的**布局/样式**（GameClientPage / rooms / archive / codex / contracts / profile / 各 Modal）、`gameUi.js`。
**待办**（= 移动化清单）：
- [ ] **P1 移动地基**：server 边界加 `viewport`(含 `viewport-fit=cover`) + `globals.css` 移动基线（输入框 16px 防缩放 / `touch-action` / `overscroll-behavior` / safe-area 工具类）+ `GameClientPage` 的 `height:100vh`→`100dvh`。
- [ ] **P2 对局页响应式**（最大可玩性收益）：三栏（左面板/中操作/右扇区图）窄屏改竖排 + 底部 Tab 切「扇区图/日志/背包」+ `useIsNarrow` hook（建好后 admin 窄屏抽屉 E2 可复用）。
- [ ] **P3 其余玩家页 + PrepareModal（4 栏点数+tab）窄屏堆叠**。
- [ ] **P4 PWA**：`app/manifest.ts`(Next 原生支持) + 图标 + service worker 缓存 app shell + `apple-mobile-web-app-*` meta（装到主屏全屏无浏览器边框）。
- [ ] **色板/样式全仓收敛**（2026-07-04 冗余复查移交）：38 文件硬编码 GitHub-dark 色值（最重 EquipmentSeriesSection 44 处）→ 统一 `theme.js`；RARITY_META 三处重复（真源 `equipmentEngine.js`·stash/page.js 与 EquipmentSeriesSection 精简副本缺 glow）→ 统一 import；BTN/INPUT/LABEL 多文件私抄 → 统一 `_shared/ui.js` / `gameUi.js` 出口（admin 与游戏内两套主题是刻意设计·不合并）。
**完成标准**：390×844 截图各页可用、无横向溢出；可「添加到主屏」。

### ⚙️ 游戏性优化（性能 + 平衡 + 内容）
**范围**：手感/性能/数值平衡/内容产出支持。
**拥有文件**：`scripts/phase-60..69-*`(平衡/内容/perf)、`game_rules`、`reports/*`、`research/*`、healthcheck/research spec、运行时数值参数。
**待办**：
- [ ] **P5 后端 payload 瘦身（移动可玩性真瓶颈 🔴）**：动作只回 **diff** 不回整张 gamevars(实测 39KB)、乐观 UI、realtime 只订必要字段、历史/列表分页懒加载、Vercel 冷启动。⚠ 动 `gameActions` ⇒ **先报主对话轨**。注：Phase 40 已砍一部分（getRaidLayout 缓存 / 不再每动作重拉 item_pool / 耐久 RPC），主因「每动作整张 gamevars 写库+广播」待续治。
- [ ] 平衡调优（healthcheck：经济基尼系数 / 节奏 / 多样性 Shannon → 数值）。
- [ ] 内容产出支持（配合用户用引擎录道具合成/被动/配方·联调）。
**完成标准**：手机弱网单动作目标 < 1.5s；healthcheck 指标进绿。

## 3. 热文件矩阵（多轨都想碰 · 必须协调）

| 文件 | 主归属 | 其它轨怎么办 |
|---|---|---|
| `src/lib/server/gameActions.js` | 🧭 主对话 | 游戏性(perf)/安全(校验) 改动**先报主对话**、小步、推前 rebase |
| `src/app/game/[id]/GameClientPage.jsx` | 🎨 前端(布局/样式) | 新动作/新 UI 入口走主对话；前端只动响应式布局 |
| `Readme_Claude` | 🧭 主对话(头部) | 各轨**只追加自己 track 标签的 dated 段**，不改他轨段落 |
| `src/app/globals.css` / `src/lib/theme.js` | 🎨 前端 | 其它轨不碰样式 |
| `src/lib/auth.js` / `serverSupabase.js` | 🔒 安全性 | 其它轨不碰鉴权 |
| SQL 迁移 | 按 §4 号段分块 | 各用各号段·不复用 |

## 4. SQL phase 号段分配（防撞号）

| 轨 | 号段 | 备注 |
|---|---|---|
| 主对话 | `43`(战斗·已用) / `44-48`(副本/game_modes/成就/集卡/技能·roadmap 已分) / `70-79`(其它新系统) | |
| 安全性 | `51-55`（RLS 收紧） | `42` 是 03 规划的 crafting RLS·可并入本轨 |
| 游戏性 | `60-69`（平衡/内容/perf） | |
| 前端 | 基本无 SQL（PWA/响应式纯前端） | |
| 已占用 | `49`(item_recipes) `50`(item_tags) | 勿复用 |

## 5. 跨轨依赖（开工顺序提示）

- 🔒 RLS 收紧 + 写路径服务端化 → 是 ⚙️「内容产出/配方生效」的前置（否则 authoring 写库被挡或不安全）。
- 🎨 P2 的 `useIsNarrow` hook 建好 → admin 窄屏抽屉(E2·deferred) 可直接复用。
- 🧭 P4 authoring(被动 stage 字段) → 让 ⚙️ 能真正录「减伤/保命」被动并联调战斗管线。
- ⚙️ P5 perf → 是 🎨 移动化的隐形地基（皮肤再好，6.9s 也劝退）。
- ~~战斗管线接线（🧭 P3）与 perf 改 gameActions（⚙️ P5）同文件冲突~~ → **已解除（2026-07-04）**：P3/P4/P4.5 已落 main，⚙️ 动 gameActions 前 rebase origin/main 即可（改 persistResolution 返回结构前仍先报主对话）。
- 🔒 改 `EquipmentPassivesSection.jsx` 保存路径（anon→service_role）前先 rebase：主对话 P4 已在该文件加管线三字段（stage/priority/condition_formula）。

## 6. fork 启动提示词模板（粘到每个子对话开头）

```
你是 <轨名> 轨（🔒安全性 / 🧭主对话 / 🎨前端美化 / ⚙️游戏性优化 选一）。
先读 docs/plan/07-parallel-tracks.md 全文 + Readme_Claude 顶部「当前状态」。
严守 §0 红线、§1 推送协议(推前 fetch+rebase origin/main)、§3 热文件协议。
只做本轨 §2 待办；碰热文件先按 §3 协调（找主对话轨）。
UI 改动后连浏览器按手机+桌面截图验证。每步小提交、中文信息 + Co-Authored-By 尾签。
```
