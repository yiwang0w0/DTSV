# DTSV 自动化健康检查规范

> 这份文档是给"自我驱动测试 agent"读的规范。每次定时任务触发时，agent 按本文档跑所有 SQL，计算所有指标，输出一份 markdown 报告到 `reports/healthcheck-YYYY-MM-DD.md`，并在发现 critical 异常时在 `reports/TODO_AUTO.md` 追加 issue。

工具：**postgres MCP** (`mcp__postgres__pg_execute_query`)。所有 SQL 通过 `operation:'select'` 执行。

---

## 输出文件结构

```
reports/
  baseline.md              — 第一次手动跑出的基线
  healthcheck-2026-05-12.md
  healthcheck-2026-05-13.md
  ...
  TODO_AUTO.md             — critical 异常追加在末尾
```

报告 markdown 顶部必须有 `## 健康度总览` 着色徽章：
- 🟢 `healthy` 全部指标在正常区间
- 🟡 `warn` 任一指标偏离但未触发 critical
- 🔴 `critical` 任一关键指标触发硬阈值

---

## 五维健康度

每维各包含若干 metric 和对应的 critical/warn 阈值。

### 维度 1 — 经济（Economy）

#### M1.1 点数余额分布

```sql
SELECT point_type,
       count(*)                                     AS holders,
       coalesce(sum(balance), 0)                    AS total,
       coalesce(round(avg(balance)::numeric, 1), 0) AS avg,
       coalesce(max(balance), 0)                    AS max,
       coalesce(percentile_cont(0.5)  WITHIN GROUP (ORDER BY balance), 0) AS p50,
       coalesce(percentile_cont(0.9)  WITHIN GROUP (ORDER BY balance), 0) AS p90
FROM player_points
GROUP BY point_type
ORDER BY point_type;
```

阈值：
- 🔴 critical：`max / total > 0.7`（单玩家垄断 70%+）
- 🟡 warn：`max / total > 0.4` 或 `p90 / p50 > 8`（分布过度倾斜）

#### M1.2 商店 cost vs 折算回收 ratio

```sql
-- 装备 catalog cost vs 回收价的差值（应该 >0 避免无损循环）
SELECT t.rarity,
       round(avg(sc.cost)::numeric, 1) AS avg_buy_cost,
       avg(CASE t.rarity
         WHEN 'common' THEN 5 WHEN 'uncommon' THEN 12 WHEN 'rare' THEN 8
         WHEN 'epic' THEN 18  WHEN 'legendary' THEN 35 WHEN 'mythic' THEN 60
       END) AS avg_recycle_value,
       round(avg(sc.cost - (CASE t.rarity
         WHEN 'common' THEN 5 WHEN 'uncommon' THEN 12 WHEN 'rare' THEN 8
         WHEN 'epic' THEN 18  WHEN 'legendary' THEN 35 WHEN 'mythic' THEN 60
       END))::numeric, 1) AS spread
FROM shop_catalog sc
JOIN equipment_tiers t ON t.id = sc.tier_id
WHERE sc.entry_kind = 'equipment' AND sc.enabled = true
GROUP BY t.rarity;
```

阈值：
- 🔴 critical：任一 rarity 的 `spread < 0`（买回来比卖出去还便宜，循环 farming）
- 🟡 warn：`spread < 2`（差值太小，套利风险）

#### M1.3 兑换汇率 round-trip 损耗

```sql
-- 双向汇率应该有损耗（防止无损套利）
WITH pairs AS (
  SELECT a.from_type AS t1, a.to_type AS t2,
         a.to_amount::numeric / a.from_amount AS a_to_b,
         b.to_amount::numeric / b.from_amount AS b_to_a
  FROM shop_exchange_rates a
  JOIN shop_exchange_rates b ON b.from_type = a.to_type AND b.to_type = a.from_type
  WHERE a.enabled = true AND b.enabled = true
)
SELECT t1, t2, round(a_to_b * b_to_a, 3) AS round_trip_ratio
FROM pairs;
```

阈值：
- 🔴 critical：`round_trip_ratio >= 1.0`（套利！）
- 🟡 warn：`round_trip_ratio > 0.85`（损耗不足 15%）

#### M1.4 周库存增长率（通胀监控）

```sql
-- Phase 25g (28-B P0): 用 v_weekly_stash_inflation 视图 + raid_stats 新四字段
-- 取最近完整周(排除当周不完整数据)
SELECT week_start,
       raids_count,
       total_value_before,
       total_value_after,
       total_credited,
       total_spent,
       CASE WHEN total_value_before > 0
            THEN round((total_value_after - total_value_before)::numeric / total_value_before * 100, 2)
            ELSE NULL END AS weekly_growth_pct,
       CASE WHEN total_spent > 0
            THEN round(total_credited::numeric / total_spent, 2)
            ELSE NULL END AS credit_to_spent_ratio
FROM v_weekly_stash_inflation
WHERE week_start < date_trunc('week', NOW())
ORDER BY week_start DESC
LIMIT 4;
```

校准目标（来自 research-2026-05-28 主题 B 延伸）：**周库存增长率 ≤ 12%**。Arc Raiders / Tarkov economy modeling 普遍以 10-15% 周通胀作为经济失衡红线。`credit_to_spent_ratio > 1.0` 意味着 raid 内创造价值 > 入场消耗，长期会导致 stash bloat 与新人贬值压力。

阈值：
- 🔴 critical：`weekly_growth_pct > 25` 或 `credit_to_spent_ratio > 1.6`（通胀失控,考虑触发 economy wipe 经过 Phase 25b `apply_economy_wipe()`)
- 🟡 warn：`weekly_growth_pct > 12` 或 `credit_to_spent_ratio > 1.2`（接近警戒,审查 catalog 折算系数 + 兑换汇率）
- 🟢 healthy：`weekly_growth_pct ∈ [-5, 12]`

注:窗口要求至少 2 周历史数据;首周 / 数据不足时报 `n/a`,不视为异常。

---

### 维度 2 — 节奏（Pacing）

#### M2.1 平均 raid 时长

```sql
SELECT count(*) AS n,
       round(avg(duration_seconds) / 60.0, 1) AS avg_minutes,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_seconds) / 60.0, 1) AS p50_minutes
FROM raid_stats
WHERE ended_at > now() - INTERVAL '14 days';
```

阈值（目标 30 min）：
- 🔴 critical：`avg_minutes < 15` 或 `> 50`
- 🟡 warn：`avg_minutes < 22` 或 `> 38`

#### M2.2 撤离率 / 死亡率

```sql
SELECT count(*) AS n,
       round(sum(extract_count)::numeric / NULLIF(sum(player_count), 0) * 100, 1) AS extract_rate_pct,
       round(sum(death_count)::numeric / NULLIF(sum(player_count), 0) * 100, 1) AS death_rate_pct,
       round(abs(sum(extract_count)::numeric / NULLIF(sum(player_count), 0) * 100 - 50), 1) AS extract_deviation_from_target
FROM raid_stats
WHERE ended_at > now() - INTERVAL '14 days';
```

校准目标（来自 research-2026-05-27 主题 A）：**撤离成功率 = 50% ±10%**。50% 是 extraction shooter 行业默认基线（Tarkov / Arc Raiders 经济建模通用变量），偏离 ±10% 以上视为节奏失衡，是 Phase 24b 经济调参前置门槛。`extract_deviation_from_target` 给出与目标的绝对偏差(pp)，便于趋势观察。

阈值（撤离率目标 50%，死亡率目标 30%）：
- 🔴 critical：`extract_rate_pct < 20` 或 `extract_rate_pct > 80` 或 `death_rate_pct > 70`（节奏严重失衡）
- 🟡 warn：`extract_rate_pct` 超出 [40, 60]（偏离目标 >10pp）或 死亡率超出 [15, 50]
- 🟢 healthy：撤离率 ∈ [40, 60] 且 死亡率 ∈ [15, 50]

#### M2.3 平均探索深度

```sql
SELECT round(avg(chamber_count_avg)::numeric, 1)  AS avg_depth,
       round(avg(chamber_count_max)::numeric, 1)  AS avg_max_depth,
       round(avg(raid_path_length)::numeric, 1)   AS avg_path_len
FROM raid_stats
WHERE ended_at > now() - INTERVAL '14 days';
```

阈值：
- 🟡 warn：`avg_depth / avg_path_len < 0.4`（玩家普遍只走 < 40% 路径）

---

### 维度 3 — 多样性（Diversity）— **趣味值代理**

Shannon entropy `H = -Σ p_i * log2(p_i)`：值越高越多样，0 = 单一选择。

#### M3.1 Chamber 类型分布熵

```sql
-- 拉最近 30 局 metadata.type_counts JSONB 聚合
WITH recent AS (
  SELECT metadata FROM raid_stats
  WHERE ended_at > now() - INTERVAL '14 days'
  ORDER BY ended_at DESC LIMIT 30
),
exploded AS (
  SELECT kv.key AS chamber_type, sum((kv.value)::int) AS n
  FROM recent r, jsonb_each(r.metadata->'type_counts') kv
  GROUP BY kv.key
),
totals AS (SELECT sum(n)::numeric AS total FROM exploded)
SELECT chamber_type, n,
       round(n / totals.total, 3) AS p,
       round(-n / totals.total * log(2.0, GREATEST(n / totals.total, 0.00001)), 3) AS shannon_term
FROM exploded, totals
ORDER BY n DESC;
```

合计 entropy = `SUM(shannon_term)`。理想 H(6 chamber types) 上限 ≈ 2.58 bits。

阈值：
- 🟡 warn：`H < 1.5`（部分 type 几乎不出现）
- 🟢 healthy：`H >= 2.0`

#### M3.2 职业选择熵

```sql
WITH recent AS (
  SELECT class_id FROM player_class_runs
  ORDER BY acquired_at DESC LIMIT 200
),
counts AS (
  SELECT class_id, count(*)::numeric AS n FROM recent GROUP BY class_id
),
totals AS (SELECT sum(n) AS total FROM counts)
SELECT counts.class_id, c.name, n,
       round(n / totals.total, 3) AS p,
       round(-n / totals.total * log(2.0, GREATEST(n / totals.total, 0.00001)), 3) AS shannon_term
FROM counts JOIN classes c ON c.id = counts.class_id, totals
ORDER BY n DESC;
```

合计 H 理想上限：11 个 class 全均匀 → log2(11) ≈ 3.46 bits。

阈值：
- 🔴 critical：`H < 1.0`（几乎所有人选同一个）
- 🟡 warn：`H < 2.0`
- 🟢 healthy：`H >= 2.5`

#### M3.3 残片三链分布熵

```sql
WITH recent AS (
  SELECT phase_chain FROM player_fragments pf
  JOIN fragment_pool fp ON fp.id = pf.fragment_id
  WHERE pf.last_decoded > now() - INTERVAL '14 days'
),
counts AS (SELECT phase_chain, count(*)::numeric AS n FROM recent GROUP BY phase_chain),
totals AS (SELECT sum(n) AS total FROM counts)
SELECT counts.phase_chain, n,
       round(n / totals.total, 3) AS p,
       round(-n / totals.total * log(2.0, GREATEST(n / totals.total, 0.00001)), 3) AS shannon_term
FROM counts, totals;
```

理想 H(3) 上限 = log2(3) ≈ 1.58 bits。

阈值：
- 🟡 warn：`H < 1.0`（某链显著被忽略）

#### M3.4 结局分布熵

```sql
WITH recent AS (
  SELECT ending_key FROM raid_stats
  WHERE ended_at > now() - INTERVAL '30 days' AND ending_key IS NOT NULL
),
counts AS (SELECT ending_key, count(*)::numeric AS n FROM recent GROUP BY ending_key),
totals AS (SELECT sum(n) AS total FROM counts)
SELECT counts.ending_key, n,
       round(n / totals.total, 3) AS p,
       round(-n / totals.total * log(2.0, GREATEST(n / totals.total, 0.00001)), 3) AS shannon_term
FROM counts, totals;
```

理想 H(4 endings) 上限 = 2 bits。

---

### 维度 4 — 完成度（Completion）

#### M4.1 残片解码进度

```sql
SELECT
  count(DISTINCT user_id) AS active_users,
  round(avg(decode_level)::numeric, 2) AS avg_lvl,
  count(*) FILTER (WHERE decode_level = 3) AS fully_decoded_total,
  round(count(*) FILTER (WHERE decode_level = 3)::numeric / NULLIF(count(DISTINCT user_id), 0), 1) AS lv3_per_user
FROM player_fragments;
```

阈值：
- 🟡 warn：`lv3_per_user < 1`（多数用户没拿过满级残片）

#### M4.2 Combo 触发活跃度

```sql
-- 通过 player_fragments.discover_cycle = 0 推断 combo 解锁的残片
SELECT count(*) AS combo_unlocked_count,
       count(DISTINCT user_id) AS users_with_combos
FROM player_fragments
WHERE discover_cycle = 0;
```

#### M4.3 探针生态

```sql
SELECT status, count(*) AS n,
       round(avg(found_count)::numeric, 1) AS avg_found,
       round(avg(defeated_count)::numeric, 1) AS avg_defeated
FROM cross_room_probes
GROUP BY status;
```

阈值：
- 🟡 warn：`active 探针 < 5`（生态冷清）

---

### 维度 5 — 异常（Anomalies）— 立刻 critical

#### M5.1 从未出现的 chamber

```sql
WITH appearance AS (
  SELECT (kv.key)::int AS template_id, sum((kv.value)::int) AS n
  FROM raid_stats rs, jsonb_each(rs.metadata->'chamber_counts') kv
  WHERE rs.ended_at > now() - INTERVAL '14 days'
  GROUP BY kv.key
)
SELECT ct.id, ct.name, ct.type, ct.spawn_weight,
       coalesce(a.n, 0) AS appearances_14d
FROM chamber_templates ct
LEFT JOIN appearance a ON a.template_id = ct.id
WHERE ct.enabled = true AND coalesce(a.n, 0) = 0
ORDER BY ct.type, ct.name;
```

阈值（仅 raid 数 ≥ 10 时启用）：
- 🟡 warn：列出每个 0 出现的 chamber，建议提升 spawn_weight

#### M5.2 从未被选的职业

```sql
SELECT c.id, c.name, c.rarity,
       (SELECT count(*) FROM player_class_runs WHERE class_id = c.id) AS picks
FROM classes c
WHERE c.enabled = true
HAVING (SELECT count(*) FROM player_class_runs WHERE class_id = c.id) = 0;
```

阈值（仅 player_class_runs ≥ 20 时启用）：
- 🟡 warn：列出每个 0 选择的 class

#### M5.3 RLS 错误日志（异常表）

跳过（生产 logs 通过 Supabase Dashboard 看）。

---

## 报告 markdown 模板

```markdown
# 健康检查报告 — YYYY-MM-DD HH:mm 本地时间

## 健康度总览

🟢 healthy / 🟡 warn / 🔴 critical

| 维度 | 状态 | 关键指标 |
|------|------|---------|
| 经济 | 🟢 | balance 分布健康,无套利 |
| 节奏 | 🟡 | avg 25.2 min(目标 30) |
| 多样性 | 🟢 | chamber H=2.31 / class H=2.84 |
| 完成度 | 🟢 | lv3/user 2.1 |
| 异常 | 🟢 | 无 |

## 1. 经济（Economy）

### M1.1 点数余额分布
... 表格 ...

### M1.2 商店 cost vs 折算回收
...

### M1.4 周库存增长率（通胀）
- 最近完整周 `weekly_growth_pct = +x.x%`(红线 12%)
- `credit_to_spent_ratio = x.xx`(红线 1.2)
- 状态 🟢/🟡/🔴

## 2. 节奏（Pacing）
...

## 3. 多样性（Diversity）— 趣味值代理

### M3.1 Chamber 类型熵
**H = 2.31 bits** (上限 2.58, 健康度 89%)

### M3.2 职业选择熵
**H = 2.84 bits** (上限 3.46, 健康度 82%)

## 4. 完成度
## 5. 异常

## 调整建议

如果触发 warn/critical，列出 3-5 个具体可执行的 admin 操作。例如：
- ❗ critical: 套利存在 (round_trip_ratio = 1.02 for low→item→low)
  → admin → 💱 点数 / 兑换 → 修改 "5 道具点 → 1 普通装备点" 改为 6:1
- ⚠ warn: 信号兵 0 picks
  → admin → ✦ 职业 → 提升 base_atk_bonus 或加强 perks
```

---

## 执行流程（agent 视角）

1. 用 `pg_execute_query` 跑所有 M1-M5 SQL
2. 计算 Shannon entropy（M3.1-M3.4 的 `shannon_term` SUM）
3. 评估阈值，标 🟢/🟡/🔴
4. 用 Write 工具写 `reports/healthcheck-YYYY-MM-DD.md`
5. 如果有 🔴 critical，把简短 issue 追加到 `reports/TODO_AUTO.md`
6. 输出一行总结到 stdout

样本数不足时（如 raid_stats 总数 < 5），所有节奏/多样性指标标 `n/a (insufficient data)` 不触发警告。
