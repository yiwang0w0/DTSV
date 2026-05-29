# Legendary 横向化审计 — 2026-05-29 (research-2026-05-29-B P1)

> 审计对象: `equipment_tiers`（admin: `src/app/admin/_tabs/EquipmentTab.jsx` → `EquipmentSeriesSection.jsx` / `EquipmentPassivesSection.jsx`）+ `classes.perks`（`src/lib/server/classes.js` `PERK_WHITELIST`）+ `class_pt` 软保底（`points.js` `creditPoints` / `classes.js` `rollClassChoices` / `forceRollLegendary`）
> 审计问题: legendary 是否落在 **horizontal build-enabler（新机制/perk，开新玩法）** 而非 **vertical stat-stick（纯数值堆叠，"grind until strong" trivialize 技能）**；`class_pt` 是 **封顶 floor（保底地板，治坏运气）** 还是 **可囤 stockpile（跳关券，攒够就连刷）**。
> 体裁警告来源: [notes-2026-05-29-B.md](../research/notes-2026-05-29-B.md) §主题B —— 纯数值奖励链让技能让位于 grind；保底应是 bad-luck protection floor 而非可囤积的跳关资源。
> 红线对照: [economy-canon.md §3.3 / §8](./economy-canon.md)、[narrative-vision.md §6.1](./narrative-vision.md)。

---

## 结论速览

| 维度 | 判定 | 摘要 |
|------|------|------|
| Legendary **职业** perks | 🟡 多数横向、1 例偏垂直 | 3 个 legendary 职业中 2 个纯横向（解码/情报、生存/准入），1 个（伊甸协议执行者）以 `combat_dmg_mult`+`combat_def_mult` 为主属垂直，但带 `pollution_resist -0.15` 下行对价部分平衡 |
| Legendary **装备** tier | 🔴 当前纯数值堆叠 | `passive_skills` 横向机制**已建但 0% 接线**（全 17 个 tier 的 `passive_skill_id` 全为 NULL）。legendary tier 仅 base_atk/def/hp + flavor `passive_note` 文本，无任何可触发机制 |
| `class_pt` 保底性质 | 🔴 当前是无封顶 stockpile | `points.js` `creditPoints` 对 class_pt 无上限累加；`rollClassChoices` 以 `class_pt >= 1` 解锁 `forceRollLegendary`、每次扣 1 → 攒 N 个即可连刷 N 次 legendary = 跳关券囤积，而非"坏运气地板" |

> 本次为审计 + 文档冻结，**不改运行时行为**（class_pt 封顶 / 装备接线属 Phase 24b/24c 经济决策，须配套数值预算 + UI，不在 hourly auto-run 范畴）。结论落入 [economy-canon.md §3.4](./economy-canon.md) 新增条款约束后续实装。

---

## 证据链 — A. Legendary 装备 tier = 纯数值堆叠

### A.1 横向机制已建但完全未接线

- schema 已有横向载体：`equipment_tiers.passive_skill_id` FK → `passive_skills`（trigger_event / effect_type / effect_formula / trigger_chance / cooldown），这是"装备开新机制"的正确形态，admin `EquipmentPassivesSection.jsx` 可视化编辑。
- 实测全表接线率 = **0**：

```sql
SELECT rarity, count(*) AS n, count(passive_skill_id) AS with_passive,
       round(avg(base_atk),1) avg_atk, round(avg(base_def),1) avg_def, round(avg(base_hp),1) avg_hp
FROM equipment_tiers GROUP BY rarity;
-- common(4)/rare(4)/epic(3)/legendary(6) → with_passive 全部 = 0
```

- 6 个 legendary tier 全部 `passive_skill_id IS NULL`；`passive_note` 只是描述性 flavor（如「残片掉率显著提升」「穿透 Ω-段」），**不挂任何 `passive_skills` 行 → 运行时无机制效果**。
- `passive_skills` 表有 6 条已定义被动，但无任何 tier 引用 → 横向工具箱闲置。

### A.2 现存 legendary tier 清单（按 stat-stick 程度）

| tier | ATK | DEF | HP | passive 接线 | 性质 |
|------|-----|-----|----|----|------|
| 协议爆裂炮 (T4) | 30 | 0 | -5 | NULL | 🔴 纯 ATK stat-stick（HP -5 是唯一对价） |
| 执行者-爆裂 (T3) | 22 | 0 | 0 | NULL | 🔴 纯 ATK stat-stick |
| 残片解码扫描仪 (T4) | 0 | 2 | 5 | NULL | 🟡 意图横向（掉率↑）但仅 flavor 文本，机制未实现 |
| Ω-段穿透探针 (T3) | 0 | 0 | 10 | NULL | 🟡 意图横向（扫描/准入）但机制未实现 |
| Ω-频率监听器 (T3) | 0 | 0 | 5 | NULL | 🟡 意图横向（情报）但机制未实现 |
| PI-1 探针-高频 (T3) | 0 | 0 | 0 | NULL | 🟡 意图横向（解码/情报）但机制未实现 |

**判定**：体裁反模式命中——两把武器是纯 ATK 堆叠；四个探针类意图横向却只有文字、机制未落地。Phase 24c legendary 装备须把 `passive_skill_id` 接上才算 build-enabler。

---

## 证据链 — B. Legendary 职业 perks 复核

### B.1 `PERK_WHITELIST` 7 项按横向/垂直分类（`classes.js:15-23`）

| perk | 含义 | 性质 |
|------|------|------|
| `search_bonus` | 搜索成功率 + | 🟢 横向（开探索/解码 build） |
| `pollution_resist` | 个人污染累积 ×(1-x)，负值加速 | 🟢 横向（生存 build / 可作下行对价） |
| `omega_window_bonus` | Ω-段倒计时 +N 回合 | 🟢 横向（撤离窗口 build） |
| `fragment_drop_bonus` | 残片掉率 +N 绝对加值 | 🟢 横向（叙事/收集 build） |
| `catalog_unlock_tag` | 解锁专属商店条目 | 🟢 横向（开 build 入口，最纯粹的 enabler） |
| `combat_def_mult` | 玩家防御 ×(1+x) | 🟠 垂直（纯数值乘子） |
| `combat_dmg_mult` | 玩家伤害 ×(1+x) | 🟠 垂直（纯数值乘子，最易撞 grind-until-strong） |

7 项中 5 项横向、2 项（`combat_dmg_mult`/`combat_def_mult`）为纯数值乘子。白名单本身**保留这两项可接受**（normal 职业也需要战斗向选项），但 legendary 职业不应**以**它们为主卖点。

### B.2 实测 3 个 legendary 职业

| 职业 | base ATK/DEF/HP | perks | 判定 |
|------|------|-------|------|
| PI-1 引导者 | 2/1/5 | search_bonus 0.2 · fragment_drop_bonus 0.25 · catalog_unlock_tag pi_intel | 🟢 纯横向（情报/解码 build），stat 低 |
| Ω-段研究员 | 1/2/10 | pollution_resist 0.35 · omega_window_bonus 2 · catalog_unlock_tag omega_gear | 🟢 纯横向（生存/准入 build），stat 低 |
| 伊甸协议执行者 | 3/3/20 | combat_dmg_mult 0.25 · combat_def_mult 0.2 · pollution_resist **-0.15** · catalog_unlock_tag eden_arsenal | 🟠 以双 combat 乘子为主属垂直；但 `pollution_resist -0.15`（污染加快）是真实下行对价 + 最高 stat → 高风险 power-fantasy build，非无脑变强 |

**判定**：2/3 legendary 职业是合格的横向 build-enabler；执行者偏垂直但靠下行对价（污染加速）维持了"高风险换高伤"的 build 身份，未塌成纯 stat-stick。可接受，但作为唯一垂直 legendary，须在 24c 守住"乘子有上限 + 必带下行对价"。

---

## 证据链 — C. `class_pt` = 无封顶 stockpile（当前形态）

- `points.js` `creditPoints`：`newBalance = (existing?.balance || 0) + amount`，**对 class_pt 无任何上限**。来源：成功撤离 +1 / 残片解码 lv3 +2 / Ω-结局 +5（无限累加）。
- `classes.js` `rollClassChoices`：`canForceHigh = (class_pt >= 1) && legendaries.length > 0`；`forceRollLegendary` 每次 `debitPoints class_pt 1`。
- 组合效果：攒 20 class_pt → 可连续 force 20 次 legendary roll = **跳关券囤积**，而非"连续没 roll 到才用得上的坏运气地板"。
- 这恰是 [economy-canon §8 反模式 #4](./economy-canon.md)（硬保底/可囤保底）与 notes-2026-05-29-B 警告的命中点。

**正确形态（留 Phase 24c 实装）**：class_pt 余额封顶（如 cap = N），到顶不再累积；自然 roll 出 legendary 时清零/扣减计数 → 它只在"运气不好时托底"，攒不出连刷能力。本次不改 `creditPoints` 行为（涉经济数值预算 + 需配套 UI 显示距上限），仅由 §3.4 条款约束。

---

## 给 Phase 24c 的可执行清单（按 economy-canon §3.4 落实）

1. **Legendary 装备**：每件至少接 1 个 `passive_skill_id`（开新机制），纯 ATK/DEF/HP 数值不得是 legendary 的唯一区分点；现存"协议爆裂炮/执行者-爆裂"补横向被动或降级为 epic。
2. **Legendary 职业**：新增 legendary 须 ≥2 横向 perk 主导；用 `combat_dmg_mult`/`combat_def_mult` 时必须带下行对价（如 pollution_resist 负值 / omega_window 负值），并设乘子硬上限。
3. **`class_pt` 封顶**：`creditPoints`（或 player_points CHECK / 触发器）对 class_pt 加 cap；`rollClassChoices` 自然出 legendary 时衰减计数；PrepareModal 显示"距保底上限 N"而非裸余额。
4. **白名单守门**：保留 7 项 perk，但 admin 校验时给 `combat_*_mult` 加数值上限校验，防 legendary 职业靠拉高乘子变 stat-stick。
