# 🔧 引擎轨 · 变更日志(倒序置顶)

> 以下历史段由 ⚙️ 游戏性轨(时任引擎职责)交付,2026-07-07 归属移交 🔧。

## 最近变更（2026-07-07 / ⚙️ ⏸ 全轨暂停令停点 —— KP1-S 进度快照）

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
