# 结局语义审计 — 2026-05-29 (research-2026-05-29-A P0)

> 审计对象: `src/lib/server/endings.js` + 触发链 + 结局横幅 UI
> 审计问题: DTSV 的 4 结局（崩解 / 清算 / 合流 / 探索）是**单局/房间级叙事兑现**（结束本房间 + 把结果写入 meta-progress 反哺下一局），还是**账号级一次性"通关墙"**（达成即流失）？
> 体裁警告来源: [notes-2026-05-29-A.md](../research/notes-2026-05-29-A.md) §主题A 发现 2 —— *"If you have a finite goal, that at least some of the players will achieve it and stop playing."*

---

## 结论: ✅ PASS —— 结局为房间级兑现，非账号级通关墙

4 结局是房间生命周期的叙事终局 + 账户库奖励反哺，**没有任何账号级"已通关"锁**。4 结局天然构成"收集所有结局"的 replay 钩子，符合体裁对"有限目标即流失"的规避要求。

---

## 证据链

### 1. 结局状态只活在 room 作用域内

- `endings.js:78` 把结局写入 `resolution.gamevars.endingResult`，这是 **rooms 表的 jsonb 字段**，作用域 = 单个房间/单次结算。
- `roomState.js:295` 检测到 `endingResult` → 仅把**该房间** `gamestate` 置 2、`winner` 置 `结局：<name>`。不触及任何玩家账号状态。
- `applyEndingIfTriggered` 的重复保护是 `if (gv.endingResult) return null`（`endings.js:42`）—— 检查的是**本房间** gamevars，新房间 gamevars 为空 → 同一结局可在新局再次触发。

### 2. `endings` 表是纯元数据，无 per-player 完成列

- `migration-add-endings.sql:14-23`: `endings(id, key, name, description, banner_text, rewards, active, created_at)` —— 全局结局定义表，**无任何 user_id / 完成标记**。
- 全仓 grep `endings_unlocked|ending_log|collected_endings|endings_seen` = **0 命中**。不存在账号级结局收集表或 `profiles` 结局列。

### 3. 奖励走账户库 = 正确的"反哺下一局"形态

- `endings.js:67-72` 用 `addItemsToStash(client, uid, validRewards, { allowOverflow: true })` 把结局奖励发到**存活/已撤离玩家的账户库**（持久层），供下一局使用。这正是体裁要求的"结局兑现 meta-progress"而非"终止符"。
- 受奖对象 = `players.filter(p => p?.alive)`（`endings.js:60-61`），与撤离闸门对齐（DMZ/Hunt "必须撤离才算数"）。

### 4. `ending_key` 进 raid_stats 是遥测，不是锁

- `gameActions.js:478` 把 `gv.endingResult?.key` 写入 `raid_stats.ending_key` —— per-raid 统计埋点，用于 healthcheck，**不构成任何再入场限制**。

### 5. 结局后可立即再出勤（账号侧无锁）

- 结局结束的是**房间**（`gamestate=2`），玩家账号无 cooldown / 无"已通关"门禁，可立即在 `/rooms`（[rooms/page.js](../src/app/rooms/page.js)）创建/加入新房间再出勤，并走向另一个结局。

---

## 发现的唯一缺口（已随本次最小修复关闭）

结局横幅（`GameClientPage.jsx:713-788`）原本只有一个指向 `/archive` 的链接，**缺少"返回大厅再出勤"的显式 CTA**。语义上玩家本就能再出勤（无账号锁），但 UI 没有把"4 结局 = 收集所有结局 replay 钩子"这一动机外显出来 —— 与本审计的修复方向（*"保留再开一局走另一个结局的明确动机"*）相符。

**本次最小修复**: 在结局横幅的链接区追加一个指向 `/rooms` 的 `🔁 返回大厅 · 收集其它结局 →` CTA（additive，无 schema 改动，不删/不改既有 /archive 链接）。

---

## 仍开放（非本条范围，留给 research-2026-05-29-A 其余 finding）

- **P0** ExtractionModal "撤离信号锁定窗口"（撤离承诺 + 脆弱窗口）—— 见 TODO_AUTO 同批 P0。
- **P1** PrepareModal "本局目标 + 结算评级"（个人化胜利操作化）—— 见 TODO_AUTO 同批 P1。
- 主线残片链（F01→F15）显式框成"优先契约" —— 与 codex 主线分类互补，未做。
