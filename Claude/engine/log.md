# 🔧 引擎轨 · 变更日志(倒序置顶)

> 以下历史段由 ⚙️ 游戏性轨(时任引擎职责)交付,2026-07-07 归属移交 🔧。

## 最近变更（2026-07-07 / 🔧 · step 0 里程碑通过 → KP1-E 增补工单(推进层 payload 消费统一化)）

- **✅ step 0 里程碑通过**（🧭 裁决）：06 契约(ef726b7)+§8(a06b468)+Commit A(ec38ed6) 收讫;🎨 已集成(50a9ec2)+ D2 unlockEvents 消费 landed(cdcb107)。我的方案 supersede ⚙️ 提案。nar_line 存储裁定=**方案 A(引擎内联)**(uiUnlocks.js 📖 供稿逐字·P2 迁 content_pool);hp_bar 首搜批准;命名坑广播(node.**kaleidoMode** 非 combatMode·我已用对)。
- **⚠ 范围变更（🧭 裁决）**：LW-3 并入 **KP1-E 增补工单 = 推进层 payload 消费统一化**(⚙️ 抓到阻塞缺口:event_deck 零运行时读者·非 boss 敌人注入缺失 → 种子关 inert·inventory/craft_btn 解锁链断)。工作包 = ① event_deck 掉落消费 + 非 boss combatSetup.enemy 注入(镜像 boss 3404)② craft_btn 状态检查(已在契约)③ gauntlet 波次编排(LW-3 本体·推进层·D5=乙 富路径 live-wire)④ seq1 零战斗(安全首战法则)⑤ boss 缺 combatSetup.enemy 校验挡板 ⑥ enabled 过滤(已满足·runs.js:2615)。E2E 增「保底掉落 + 首战安全 + seq1 零战斗 + raid_stats 清理」断言。
- **✅ 前置动作:07 §0.3 payload 形状批复=通过 + 1 结构修订**(已 send 🧭 转 ⚙️)。核实可消费(runs.js:178-189 落 node.kaleidoEnemy/kaleidoEventDeck)。**修订**:combatSetup.enemy = 权威战斗敌(入关注入·镜像 boss·gauntlet 用作 wave-1 base + params.waves);event_deck 只消费 item_find;请 ⚙️ 移除 seq2/3/5 的 npc_encounter 冗余(否则双刷)。⚙️ 可出 seq3-5 SQL(enabled=false·boss 用乙值)。
- **LW-3 gauntlet 理解(wk93hy7qx·4 map)**：gauntlet 模板 resolveTurn **自带波次逻辑**(combatModes/index.js:116·敌死∧有余波→scale^(w-1) 造下波+waveHeal 续) = **离线 bot sim 路径**;裁决 C 的 LIVE 路径 = 推进层编排富战斗(D5=乙),**不走** resolveTurn。软锁点:advance 重入需先 reset wave/enemy/outcome 才推进,否则 resolveTurn 早返回不变态。gauntlet 未接 live(attackNpc 只有 stance_duel 分支 1822·零 gauntlet 分支)。
- **🔒 DDL(31f5265)**：列级守卫方案已接受(BEFORE 触发器令 ui_unlocks 客户端不可变·kaleido-ui-unlocks-guard.sql);createServerSupabase()=service_role 确认过守卫;06 §4 已更正(public-read 非 owner-read·案②)。执行顺序 🧭 定(🔒 exec DDL+守卫 → 我 Commit B → 🔒 复验),待 🧭 令。
- **下一步**：实现增补工作包(hook ①③④ + gauntlet LW-3 + seq1 零战斗 + boss 校验)——软锁风险类(遭遇/体力/lifecycle 逐条推演),机制对 sampled 关即可 E2E 测(不必等种子关 enable);改状态机必跑 kaleido-e2e。D3/D5 顺延。Commit B(账号持久)待 🧭 DDL 执行令。

## 最近变更（2026-07-07 / 🔧 ▶ 恢复令开工 · KP1-E step 0 ui_unlocks 接口形状定稿）

- **恢复令收讫**：🧭 KP1-R 解禁,rebase 到 `473ddb4`。队列重排:ui_unlocks 提最优先(接口形状=首里程碑,🎨 结构级改造等它),其后 LW-3/D3/D5。
- **✅ 首里程碑达成（已上 main `a06b468`·已 send 🧭 广播 🎨）**：`docs/plan/kaleido/06-ui-unlocks-contract.md` 接口契约定稿。
  - **契约**：持久解锁集 = `room.gamevars.players[uid].uiUnlocks:string[]`(渲染=∈集合即渲染·种子 ["search_btn"]·veteran 继承);瞬态解锁事件 = 信封顶层 `unlockEvents:[{ui_key,nar_line,timing,precedes,seq}]`(否决 gamevars 内嵌=陈旧回放·幂等每键至多一次·多人局仍 {room});账号持久 = `profiles.ui_unlocks` jsonb(否决 player_profile/新表·DDL 待 🔒 审)。
  - **方法**：2 个理解 workflow(5 子系统 map + 5 视角对抗验证)。**确认 blocker(已改契约)**:时序法则——非战斗死亡向量(污染/Ω/收缩)先于 fight_start → **hp_bar 由 fight_start 改挂首次 search/before** + 路由边界无条件求值(死亡回合亦发)。
  - **🎨 stub(5ee35b7)对齐**:stub 与契约高度一致(已预期服务端解锁集+含 nar_line 事件),6 处小校订见 06 §8(最实质=D3 hp_bar 提前到首搜)。
- **待决策(已报 🧭)**：nar_line 存储(A 引擎内联/B content_pool);condition 判据交 ⚙️ 对齐 seq1-2 投放;rules_card/stance_ui P1 DEAD(待 D3/LW-2)。
- **DDL 待审**：`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ui_unlocks JSONB NOT NULL DEFAULT '[]'::jsonb`(🔒 审 owner 不可自改)。
- **✅ Commit A 落地（`ec38ed6` 上 main·运行时机制·无 profiles 依赖）**：
  - `src/lib/server/kaleido/uiUnlocks.js`（12 项触发注册表 + evaluateUnlocks 纯判定 + unlockEvents payload）；`applyKaleidoPostAction`（gameActions.js·route 边界 + E2E act() 单一共享入口·消除分叉）；route.js 信封扩 unlockEvents；createPlayerState 条件展开 uiUnlocks（多人局无字段=严格中性）；startKaleidoRun 种子 `['search_btn']`；E2E +7 断言。
  - **验证：E2E 30/30**（真库·解锁序 + hp_bar 首搜解锁·id 严格先于首 attack·幂等·镜像）+ **build 绿**（next build 全路由·先修 worktree 缺 locatorjs-nextjs-experimental 声明依赖，--no-save 装入 shared node_modules，无 tracked 改动）。
  - **实测修正**：rules_card/stance_ui P1 **即 LIVE**（采样器出非标准 combat_mode·判定读关 node.kaleidoMode）；craft_btn 唯一 P1-DEAD（item kind 判据待接）。契约 06 §2/§7.1/§8 已更。
  - **retry/原子性**：route 的 kaleido 块在 withRetry **之外**（恰一次）+ persist gates emit → L4 double-emit 结构排除。
- **待办**：① **Commit B（账号持久化）阻塞于 🔒 审 `scripts/kaleido-ui-unlocks.sql`**（profiles.ui_unlocks + RLS owner 不可自改）——已报 🧭 路由；② L2/L4 补跑（确认性·非阻塞）；③ 队列续 LW-3 gauntlet / D3 mergeGameRules / D5 R3 seed。
- **环境备忘**：本 worktree 已放 `.env.local`（从 suspicious-solomon 取·gitignored·跑 E2E 用）；E2E 跑法 = 建临时 tsconfig.json(paths @/*→src/*) + `npx --yes tsx scripts/kaleido-e2e.mjs`，跑后删 tsconfig。

## 最近变更（2026-07-07 / 🔧 ⏸ 全局同步点简报锚点 —— 仍停机待命·非恢复令）

- 🧭 简报要点(`e92d0b0` 全局同步点):①KP1-E(LW-3 波次/D3 mergeGameRules/D5 R3 seed)仍有效,恢复后**可能扩编 ui_unlocks**(UI 渐进披露归 🔧:触发判定复用传感层动词·账号级持久化·解锁事件下发·E2E 增解锁序断言,接口形状+12 项 ui_key 见 05 §1);②新增必读:docs/plan/kaleido/05 全文 + 04 §5 软锁教训(自测第一项);③本轨家=Claude/engine/(README+log);④恢复后开工先读 Claude/engine/GPT.md(只读协作接口);⑤若 /compact,以 hub + Claude/engine/ + 03 KP1-E 段 + 05 + 04 重建上下文。本轨状态:干净停点(HEAD=main),继续待命。

> Kanata 暂停令：全轨收敛到安全停止位待命。本轨停点 = `ae5a813`（LW-2 已完整推送·工作区干净·无半成品）。

- **已完成（全部上 main·smoke+build 绿·多人局中性）**：D4 evalFormula 变量注入（`b7d7e2a`）→ D2 combatModes 3 模板×bot（`90e8cf3`·🔒 R1 审通过·两 finding 已修 `207e4e9`）→ D1 采样器正式化（`4422cee`·E2E 20/20）→ LW-1 seq5 boss 投放+BOSS_KILL_LIVE=true（`97f3e32`·软锁修复 `6e129c2`·E2E 23/23）→ **LW-2 stance_duel 接 attackNpc（`ae5a813`·待 🧭 E2E 断言联验）**。
- **下一步（恢复令后）**：LW-3 gauntlet 波次推进层（live-wiring 最后一块）→ D3 mergeGameRules 逐关覆盖 → D5 R3 seed 化 → D6 种子关 12-15 个 + 难度平衡核算（含 🧭 数据点：裸属性玩家 8 拳死于 seq5 boss → 需核 seq1-4 搜刮期望增益 vs boss 强度）。
- **在途等待**：🧭 E2E 加 stance_duel 断言联验 LW-2；🎨 接 stance UI 协议（已发定稿：`{action:'attackNpc', stance:'atk'|'def'|'skill'}`）。

## 最近变更（2026-07-06 / ⚙️ KP0-S 服务端核心全六件：六表+守卫+传感层+run 生命周期+beacon）

> KALEIDO P0 服务端核心（02 §2）交付完毕，全程 `isKaleidoRoom()` 守卫、多人局零行为变化（smoke-check + build 33/33 自证）。六表已由 🔒 审毕应用（`dd17323`）。

- **🎨 接线契约（单人出勤入口卡用）**：`POST /api/kaleido/run`（Bearer 鉴权、无 body）→ `{ roomId, runId }` → 跳 `/game/[roomId]`。幂等：已有 active run 直接返回同一 `{roomId, runId}`。失败 `{ error }` 400。局内放弃 = 走既有 `/api/game/actions` 发 `{ roomId, action: 'abandonRun' }`。kaleido 局判定：`import { isKaleidoRoom } from '@/lib/roomState'`（`room.gametype === KALEIDO_GAME_TYPE = 30`）。
- **run 生命周期**（[gameActions.js](src/lib/server/gameActions.js) 新增）：`startKaleidoRun`（幂等·runs 行 → 采样 5 关落 levels → 建房 gametype=30 + 落座 + startGame → 回填 room_id·失败补偿弃置 run）；`advanceKaleidoProgress`（路由边界每消耗性动作后：turnCount+1 → exit_condition 三型判定 boss_kill/survive_turns/collect → 过关推进/收敛·通关写 `endingResult` 走通用收房·死亡标 runs.status='dead'·域真源 runs/levels 同步 + level_clear/death 事件）；`abandonRun`（分发器动作·显式放弃·关页≠放弃 R11）。
- **P0 极简采样**（[kaleido/runs.js](src/lib/server/kaleido/runs.js) 纯函数·smoke 29/29）：chamber_templates(enabled) 加权 `spawn_weight` 无放回抽 5，**确定性**（mulberry32(hashStr(seed))·同 seed 同序·禁 Math.random）；节点契约逐 key 对齐 pathGenerator（下游搜索/战斗/污染零改动可用）+ 增量 `kaleidoExit`/`levelId`。P0 exit_condition 全部 `survive_turns(2+seq)`（极简采样无法保证 boss 投放；判定器支持三型，P1 战斗模板保证 boss 后 seq=5 换 boss_kill）。
- **传感层**（[kaleido/events.js](src/lib/server/kaleido/events.js) smoke 21/21）：`emitPlayerEvents` 批量 insert + payload 消毒（键≤24/串≤200/剔对象数组）；发射点=**路由边界**（`/api/game/actions` 动作成功后·仅 kaleido 局·仅已映射动词）——sweep/branches 借道属服务端内部绝不经路由，天然满足「只真实动作」（获批语义的实现下移，deathLog.js 零改动：kaleido 死亡全部经动作产生，路由边界必经，death 事件在 advance 收敛点发）。
- **beacon**（[/api/kaleido/beacon](src/app/api/kaleido/beacon/route.js)·待🔒 KP0-X #2 审）：客户端动词白名单（session_end/ui_read_ms/idle_ms/return_latency/hesitation_ms）+ body≤8KB/≤10 事件/ms≤24h 钳制/run_id UUID 形状校验/身份只信 token。
- **守卫补两处**（超出派单 5 处·均中性）：`applyRoomLifecycle` bossDefeated 判胜分支加 `!isKaleidoRoom` 豁免（否则 kaleido 中途击杀 boss 被抢先收房）；`joinRoom` kaleido 局拒他人加入（owner 重进走既有幂等返回）。
- 尚未做（后续）：P0 验收跑通 5 关 run（待 🎨 UI 或中控闸门验收）；KP1-S（正式采样器/3 战斗模板×bot/mergeGameRules 逐关覆盖）。
