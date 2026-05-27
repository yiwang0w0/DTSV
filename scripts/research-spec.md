# DTSV 外部调研规范

> 这份文档是给"自我驱动调研 agent"读的规范。每次定时任务触发时，agent 按本文档检索类似游戏的玩家反馈与设计讨论，对照 DTSV 当前状态产出可执行的 findings，写到 `research/notes-YYYY-MM-DD.md`。

工具：**WebSearch** + **WebFetch**。

---

## DTSV 当前类型定位

- **Extraction roguelike** + 强叙事 + 异步 PvPVE 元素
- 类型亲缘：Escape from Tarkov（搜打撤）· Hades（roguelike + 元进度）· Cultist Simulator/Disco Elysium（叙事密度）· Darkest Dungeon（死亡惩罚 / 元 grind）· Inscryption（lore 解谜 + roguelike）· Returnal（roguelike + 叙事）· The Long Dark（探索撤离）

调研目标：从这些游戏的玩家社区（Steam reviews / Reddit / GameDev 论坛）找出 **"玩家抱怨什么"** 和 **"什么留住玩家"**，对照 DTSV 现状决定下一步加什么减什么。

---

## 5 个调研主题（每次轮替挑 1-2 个深挖，避免一次跑太久）

### 主题 A — Extraction shooter 玩家挫败感

**关键词搜索（WebSearch）**：
- "extraction shooter design flaws"
- "Tarkov player complaints"
- "extraction game retention loss"
- "PvPvE balance frustration"

**问题**：
1. 玩家最常抱怨什么？（装备 wipe / 时间投入 vs 失败惩罚 / PvP 不平衡 / 学习曲线）
2. 有哪些"减负"机制被普遍称赞？（安全保险 / 撤离失败补偿 / 入门保护期）
3. 对比 DTSV：我们的 4 类点数 + 入场购买是否解决了"装备 wipe 挫败"？

### 主题 B — 肉鸽元进度（meta-progression）的甜区

**关键词**：
- "roguelike meta progression done right"
- "Hades meta progression"
- "Slay the Spire unlock pacing"
- "permanent upgrades roguelike too easy"

**问题**：
1. 元进度速率：解锁过快 → 失去探索感；过慢 → 玩家流失。Hades / Returnal / Spire 的公认甜区是什么？
2. DTSV 的 class_pt 保底（50 high_equip_pt → 1 class_pt → 强刷 legendary）是否够慢够刺激？

### 主题 C — Lore-heavy 游戏的叙事密度与玩家容忍度

**关键词**：
- "Disco Elysium narrative pacing"
- "Cultist Simulator confusing lore"
- "Pathologic 2 onboarding"
- "lore dump player frustration"

**问题**：
1. 玩家对"不解释只描述"风格的容忍上限？（六纪元 lore 风格规则）
2. 渐进式 lore 揭示的常见模式（早期日常 / 中期暗示 / 后期真相）— DTSV F01-F15 分层是否符合？
3. 有哪些"lore wiki 外置"的可读性优化（in-game codex 设计）值得借鉴？

### 主题 D — 死亡惩罚与情感曲线

**关键词**：
- "Darkest Dungeon stress system"
- "permadeath player engagement"
- "Returnal death penalty design"
- "roguelike death feel rewarding"

**问题**：
1. 玩家在多少次死亡后会"放弃"？什么样的反馈让死亡"值得"？
2. DTSV 当前死亡惩罚：丢失本局 inventory + class_pt 不获奖；点数余额保留。这个力度合适吗？
3. 死亡日志（player_death_log）有没有更深度的 "post-mortem" 玩法值得加？

### 主题 E — 异步 PvP 设计教训

**关键词**：
- "asynchronous PvP design"
- "ghost / probe leave-behind mechanic"
- "From Software bloodstain message"
- "Dark Souls invasion frustration"

**问题**：
1. 异步 PvP 最常见的失败模式？（毒包构造 / 经验差碾压 / 报复链）
2. DTSV 探针机制（撤离留 platform_part / 8% 遭遇 / 抢 1 残片）是否有类似坑？
3. 留言/留物机制（Dark Souls 血迹）能否被 DTSV 借鉴增加叙事密度？

---

## 输出 markdown 模板

```markdown
# 调研笔记 — YYYY-MM-DD

> 本次主题：A (Extraction frustration) + C (Lore pacing)
> 检索深度：5 个 WebSearch query + 3 个 WebFetch 深读

## 主题 A — Extraction shooter 玩家挫败感

### 搜索结果摘要

来源 1：[Steam Review - Escape from Tarkov](URL) ... 摘要 ...
来源 2：[Reddit r/EscapeFromTarkov "装备 wipe 后弃坑"](URL) ... 摘要 ...

### 玩家抱怨 Top-3

1. **装备 wipe 太频繁**（每季强制 reset）— X% 玩家提及
2. **死亡惩罚过重**（丢全部本局物资）— Y%
3. **新手墙过陡**（不会读地图 → 死 50 次才学会）— Z%

### DTSV 对照

| 玩家抱怨 | DTSV 现状 | 是否已解决 |
|---|---|---|
| 装备 wipe | 4 类点数储备跨 raid | 🟢 部分解决（高级装备靠 catalog 重买,不再 wipe）|
| 死亡丢物资 | inventory 全失但 player_points 保留 | 🟡 部分（class_pt 不奖死亡） |
| 新手墙 | 没有教程系统 | 🔴 未解决 |

### Actionable findings（建议改进）

- 💡 加入 **死亡保险**：扣 10% 点数余额代替全失（可选机制）
- 💡 加入 **新手保护 raid**：前 3 局 PvE only，撤离失败仍返还 50% 点数
- 💡 加入 **Loadout preset**：让老玩家保存常用购买组合，降低入场摩擦

## 主题 C — Lore pacing
...

## 综合 actionable findings

按优先级排序的 5 个最值得做的改进：
1. ...（高优 / 改动小 / 玩家最痛）
2. ...
```

---

## 执行流程（agent 视角）

1. 选 1-2 个主题（从 A-E 中轮换，记住上次跑过的主题，下次跳过）
2. 每个主题跑 3-5 个 WebSearch query
3. 选其中 1-3 个最相关结果用 WebFetch 深读
4. 对照 DTSV 现状产出 5-10 条 actionable findings
5. Write 到 `research/notes-YYYY-MM-DD.md`（一天一个文件，多次跑就追加）
6. 重点 finding 复制到 `reports/TODO_AUTO.md` 末尾（作为下次 phase 候选）

**避免**：纯学术讨论 / 重复抱怨 / DTSV 已经覆盖的设计。专注 "新角度" 和 "玩家原话"。

---

## 主题轮换记录（agent 每次跑前 grep 这里）

| 日期 | 主题 |
|------|------|
| 2026-05-12 | A + C（首次） |

每次跑完追加一行，确保 5 个主题在 5-10 次跑里都被覆盖到。
