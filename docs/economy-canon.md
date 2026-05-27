# 远星函馆 — 经济宪法（持久 vs 重置边界）

> 本文档定义 DTSV 经济系统中 **「什么跨赛季持久 / 什么可被赛季重置」** 的权威边界。
> Phase 24b（4 类点数 + 装备消耗）启动前必须先冻结本文档，否则后续任何 wipe / season / catch-up 决策都缺基线。
> 与 [narrative-vision.md](./narrative-vision.md) §6.2 互为对照：本文档讲机制，narrative-vision §6.2 讲对叙事的影响。
>
> 起草时间：2026-05-28（research-2026-05-28-B P0）
> 调研依据：[research/notes-2026-05-28-B.md](../research/notes-2026-05-28-B.md)（Arc Raiders Expedition 2025-12 / Machinations 12% 通胀红线 / Albion 弹性 sink / Hades II 反模式）

---

## 一、为什么要写这份文档

Phase 24b 后玩家会持续积累 4 类点数 + 装备实例 + stash。没有「重置边界」的话，半年后会同时出现两个问题：

1. **老玩家 runaway power** — 点数 / 装备单调累积，新玩家追不上，留存断崖。
2. **schema 锁死** — 想做赛季 wipe / catch-up 时才发现表结构里没有 `economy_version` / `season_id` / `opt_in` 字段，只能破坏性改表，老存档迁移代价巨大。

[notes-2026-05-28-B.md](../research/notes-2026-05-28-B.md) finding #2-#5 给出了 Arc Raiders Expedition 2025-12 实装的「可选 wipe」路线：bi-monthly 节奏 / 自愿 opt-in / 跨季奖励上限 5 技能点 / **任何跨季奖励都不得提供战斗优势**。本文档把这套思路落到 DTSV 的具体表 / 字段 / 函数。

---

## 二、四类点数的本质（Phase 24b 出发点）

| 点数类型 | 用途 | 来源 | 性质 |
|---------|------|------|------|
| `high_equip_pt` | 兑换 / 购买 rare+ 装备实例 | extract 时 high-tier 装备转换 | 高密度可流通 |
| `low_equip_pt` | 兑换 / 购买 common-uncommon 装备 | extract 时 low-tier 装备转换 | 低密度可流通 |
| `item_pt` | 入场购买消耗品 / 一次性道具 | extract 时消耗品转换 | 高频小额流通 |
| `class_pt` | 职业池抽取 / 软保底计数 | 击杀 boss / 完成 chamber 链 | **非交易** — 只能抽 class，不能换装备 |

`class_pt` 与前三者本质不同：**它是横向进度的代币**（解锁新职业），不是流通货币。本文档对它的处理与前三者分开。

---

## 三、持久 / 重置边界（权威表）

### 3.1 持久层（Permanent — 跨赛季不重置）

横向积累的内容默认持久。原则：**「实验 / 探索 / 知识」积累不被赛季稀释，否则伤害「玩家投入感」**。

| 资产 | 表 / 字段 | 为什么持久 |
|------|----------|-----------|
| 残片解码进度 | `fragment_pool` + decode_level / archive | 叙事主线层；F01-F15 不可撤回（[narrative-vision §6.1 additive evergreen](./narrative-vision.md#61-additive-evergreen-条款待填--research-2026-05-28-c-p0)） |
| Chamber 模板访问历史 | `unlocked_chamber_templates` | 知识图谱层；老玩家积累的「我见过 chamber X 的特殊布局」是经验，不是数值 |
| 职业池解锁状态 | 职业拥有列表（class 选项） | 横向解锁；解锁 ≠ 强度 |
| 残片合成图谱 | `fragment_combos` + 玩家已发现关系 | 知识层；图谱本身是奖励 |
| 总出勤次数 / 死亡日志 | `raid_stats` 累计 + `player_death_log` | 历史 / 复盘价值；删除等于抹掉玩家轨迹 |
| Stash 容量上限 | `profiles.stash_capacity` | 结构性奖励（Arc Raiders +12 slot 对标）；容量是「服务」不是「资产」 |
| 立绘 / 角色 cosmetic | profiles 装饰位 | 与战斗无关 |
| 探针痕迹 / Nemesis 记录 | `chamber_residue` + `probe_encounter_pairs`（28-E P0/P1 计划中） | 涌现叙事层 |

### 3.2 可重置层（Resettable — 自愿赛季 wipe 候选）

垂直数值默认可重置。原则：**点数 / 装备 / stash 内容是数值层资产，重置能让追赶机制成立**。

| 资产 | 表 / 字段 | 重置范围 |
|------|----------|---------|
| 4 类点数余额 | `player_points.balance` | 全清 OR 按 scaling_factor 缩减 |
| 装备实例 | `equipment_instances` | 全清 OR 保留 cosmetic / 保留 insurance_tier='premium' 标记 |
| Stash 内容（不含容量） | `player_stash` 行 | 全清；容量上限不动 |
| 合同进度 | `contracts` 未完成行 | 默认重置；**可选**：未完成的合同延期到下季（参考 Arc Raiders 补给车队，[notes #10](../research/notes-2026-05-28-B.md)） |
| 排行榜 | 排名表（如有） | 全清 |

### 3.3 灰色地带（必须明确决策）

下列项目本文档**暂不下结论**，待 Phase 24b 实装时按本表格式补充：

- `class_pt` 余额：偏持久（横向代币），但若做赛季可考虑保留 50%
- 已购买的 cosmetic 蓝图：偏持久
- 解锁的特殊技能 / 永久 buff（若 Phase 24c 引入）：必须持久，否则等同战斗优势重置

每次新增可累积资产时，作者必须在 PR 中明确填入 §3.1 或 §3.2，**不允许悬空**。

---

## 四、Wipe-equivalent 工具箱（已实装）

Phase 25b 已经把「软 wipe」做完了，本文档只声明其使用边界。

### 4.1 `economy_version`

`shop_exchange_rates.economy_version`（[scripts/phase-25b-economy-versioning.sql](../scripts/phase-25b-economy-versioning.sql)）标记一组汇率属于第几版经济。切版时旧版行设 `enabled=false` 但**保留作历史**，从不删除。

`get_current_economy_version()` 返回最大启用版本号。

### 4.2 `apply_economy_wipe(scaling, reason, applied_by, point_type)`

原子缩减 `player_points`。已实装约束：

- `scaling_factor` 必须在 `(0, 2.0]`（防止意外通胀 / 倒贴）
- `point_type` 必须是合法 4 类之一（或 NULL = 全部）
- FLOOR + GREATEST 0 防负值
- 单事务内 read-before / UPDATE / read-after / 写 `economy_wipe_log`
- 不缩减 stash / equipment / fragment，**只动 player_points**

### 4.3 使用准则

| 场景 | 推荐 scaling | 触发条件 |
|------|-------------|---------|
| 紧急通胀回滚 | 0.7-0.9 | healthcheck `v_weekly_stash_inflation` 连续 2 周 > 12% |
| 测试期 reset | 0.0-0.5 | 内测期重大配置变更 |
| 正式季末 wipe | 0.0（清零） | 走赛季 expedition 流程 |
| 通胀微调 | 0.85-0.95 | 单 point_type 失衡时 |

**不要**用 wipe 去「惩罚」头部玩家。Wipe 是经济卫生工具，不是平衡工具。

---

## 五、赛季远征 opt-in 模型（已预埋空表）

[scripts/phase-25f-seasonal-expeditions.sql](../scripts/phase-25f-seasonal-expeditions.sql) 已建 `seasonal_expeditions` + `player_expedition_opt_ins` 空壳。本期不启用，但本文档冻结其语义。

### 5.1 入场门槛（Arc Raiders 对照）

`seasonal_expeditions.entry_requirements` JSONB 形如：

```json
{
  "min_total_raids": 60,
  "required_points_value": 800000,
  "required_mats": [{"item_id": 42, "qty": 200}]
}
```

**门槛要高**（参考 Arc Raiders 80 万 coin 等值）—— 这是「自愿 wipe」而不是「强制 wipe」的核心。门槛低就会被卷成「不入就吃亏」。

### 5.2 跨季奖励上限

`player_expedition_opt_ins.bonus_skill_points` 已 CHECK ≤ 5。**这是硬约束**，引用 [Arc Raiders 5 点上限设计](../research/notes-2026-05-28-B.md)（finding #4）。

`seasonal_expeditions.rewards_blueprint` JSONB 允许的字段：

```json
{
  "skill_points_cap": 5,
  "stash_capacity_bonus": 12,
  "cosmetic_unlocks": [...],
  "title_unlocks": [...]
}
```

**禁止的字段**（PR 应拒绝）：

```json
{
  "starting_points": ...,        // 等同战斗优势穿越赛季
  "starting_equipment": [...],   // 等同战斗优势穿越赛季
  "damage_multiplier": ...,      // 任何永久数值 buff
  "drop_rate_multiplier": ...    // 任何永久概率 buff
}
```

这就是 [notes-2026-05-28-B.md finding #5](../research/notes-2026-05-28-B.md) 的「none of the changes will offer a combat advantage」红线。

### 5.3 `reset_scope` 字段语义

`seasonal_expeditions.reset_scope` JSONB 必须按 §3.1 / §3.2 填写，例如：

```json
{
  "reset": ["player_points", "equipment_instances", "player_stash_rows"],
  "keep": ["fragment_progress", "unlocked_chamber_templates", "class_unlocks", "stash_capacity"]
}
```

PR review 时拿这个字段对照 §3.1 / §3.2，**任何「reset」里出现 §3.1 项 = blocking issue**。

---

## 六、通胀监测红线

### 6.1 12% 周库存增长率

[notes-2026-05-28-B.md finding #6](../research/notes-2026-05-28-B.md) 引用 Machinations 实测：周库存增长 > 12% 时市场会失稳。

`v_weekly_stash_inflation` 视图（[scripts/phase-25g-raid-stats-economy.sql](../scripts/phase-25g-raid-stats-economy.sql)）按周聚合 raid_stats 的 `stash_value_before / after / credited / spent`。

健康检查阈值（healthcheck-spec.md M1.4，已实装）：

| 周增长率 | 评级 |
|---------|------|
| ≤ 5% | 🟢 健康 |
| 5-12% | 🟡 关注 |
| > 12% | 🔴 干预（考虑 `apply_economy_wipe`） |

### 6.2 Faucet 收紧优先级（出现 🔴 时的处置顺序）

按 [notes-2026-05-28-B.md finding #7-#8](../research/notes-2026-05-28-B.md)：

1. **优先收紧 faucet** —— 降低 raid 末尾 creditPoints 系数 / 降低高价物品掉率
2. **其次启用弹性 sink** —— 商店物价随近 24h 兑换量提升（参考 Albion Global Discount）
3. **再次 soft wipe** —— `apply_economy_wipe(0.85)` 缩减全服点数
4. **最后才是硬重置** —— 走赛季 expedition 流程

**不要**优先用「印新币」或「砍物价」——会触发「资产被稀释」恶感。

### 6.3 credit / spent 比率

`v_weekly_stash_inflation` 同时输出 `total_credited` / `total_spent`。

- 比率 > 1.2 持续 2 周 → faucet 过强，启动处置 #1
- 比率 < 0.8 持续 2 周 → sink 过强，玩家在亏损，反向调整

---

## 七、Catch-up 边界

新玩家追赶（horizontal）由以下机制承担，**不靠经济注水**：

- **残片掉率 boost** — 出勤 < 20 次玩家残片发现率 ×1.5（[notes-2026-05-28-B finding P1](../research/notes-2026-05-28-B.md)，待实装）
- **Chamber 多样性补正** — 新人路径偏向未访问 template（待实装）
- **F01-F03 入口残片权重 boost** — 28-C P0（待实装）

**禁止**给新玩家送 `high_equip_pt / low_equip_pt` 当作 catch-up —— 这会破坏 §3.2 的「点数是数值层」定位。

赛季机制本身就是 catch-up：旧玩家自愿入新赛季 = 自愿放弃数值优势换 5 点技能加速 = 与新玩家在数值上平起平坐。

---

## 八、反模式清单（PR 应拒绝）

1. **永久 power creep** — 任何「数值跨赛季保留 + 持续累积」的字段。例：starting_damage_bonus。
2. **FOMO 化持久层** — 残片 / chamber 解锁加「限时领取，过期失效」属性。直接违反 [narrative-vision §6.1](./narrative-vision.md)。
3. **强制 wipe** — 任何不走 opt-in 的整库重置。Phase 25b 的 `apply_economy_wipe` 是 admin 工具，**不是赛季机制**。
4. **「必输 N 次才解锁」式硬保底** — [Hades II 反感模式](../research/notes-2026-05-28-B.md)（finding #9）。class_pt 软保底必须做成指数递增 + UI 显示计数，不能做硬计数。
5. **跨赛季 starting_equipment** — Arc Raiders 红线，Phase 25f schema 已禁。
6. **悬空资产** — 新增可累积字段没在本文档 §3.1 / §3.2 / §3.3 分类。

---

## 九、变更治理

- 本文档与 [scripts/phase-25b-economy-versioning.sql](../scripts/phase-25b-economy-versioning.sql) / [phase-25f-seasonal-expeditions.sql](../scripts/phase-25f-seasonal-expeditions.sql) / [phase-25g-raid-stats-economy.sql](../scripts/phase-25g-raid-stats-economy.sql) / [scripts/healthcheck-spec.md](../scripts/healthcheck-spec.md) M1.4 互相绑定，**任一变更需同步审视**。
- 修改 §3.1 / §3.2 边界 = 重大经济决策，需 Readme_Claude 同步条目 + healthcheck spec 同期更新。
- 新增字段 / 新表前先回答：「这个属于 §3.1 还是 §3.2？」答不出 → 设计未成熟，暂缓。
- 与 [narrative-vision §6.2](./narrative-vision.md#62-经济与持久边界待填--research-2026-05-28-b-p0) 是双向引用关系，本文档更新时记得回填那一节的待填章节。

---

## 附录 A — 已实装资产索引

| 资产 | 文件 | Phase |
|------|------|-------|
| `economy_version` 列 | [phase-25b-economy-versioning.sql](../scripts/phase-25b-economy-versioning.sql) | 25b |
| `economy_wipe_log` 表 | 同上 | 25b |
| `apply_economy_wipe()` 函数 | 同上 | 25b |
| `get_current_economy_version()` 函数 | 同上 | 25b |
| `seasonal_expeditions` 空表 | [phase-25f-seasonal-expeditions.sql](../scripts/phase-25f-seasonal-expeditions.sql) | 25f |
| `player_expedition_opt_ins` 空表 | 同上 | 25f |
| `raid_stats.points_credited / points_spent / stash_value_before / stash_value_after` | [phase-25g-raid-stats-economy.sql](../scripts/phase-25g-raid-stats-economy.sql) | 25g |
| `v_weekly_stash_inflation` 视图 | 同上 | 25g |
| Healthcheck M1.4 周库存增长率 | [scripts/healthcheck-spec.md](../scripts/healthcheck-spec.md) | 26 |
