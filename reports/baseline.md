# 健康检查基线报告 — 2026-05-12

> Phase 26 健康检查框架首次手动跑出的基线。后续每日 03:17 自动跑覆盖在 `reports/healthcheck-YYYY-MM-DD.md`。

## 健康度总览

🟢 **healthy** — 系统架构层面无异常；样本量不足以评估玩家行为维度（节奏/多样性/完成度）

| 维度 | 状态 | 关键指标 |
|------|------|---------|
| 经济 | 🟢 healthy | 商店 spread 全正 (3-5)，无套利；点数余额单玩家但数据不足判断分布 |
| 节奏 | n/a | raid_stats 0 行（尚未跑过完整 raid） |
| 多样性 | n/a | metadata 无数据 |
| 完成度 | 🟢 healthy | 1 用户有 2 条 lv3 残片（测试数据） |
| 异常 | 🟢 healthy | 无数据触发异常 |

## 1. 经济（Economy）

### M1.1 点数余额分布

| point_type | holders | total | avg | max | p50 | p90 |
|---|---:|---:|---:|---:|---:|---:|
| item_pt | 1 | 65 | 65.0 | 65 | 65 | 65 |

只有 1 个用户被 Phase 24b 硬迁移；其他点数类型未持有任何余额。

### M1.2 商店 cost vs 折算回收 spread

| rarity | avg_buy_cost | avg_recycle_value | spread |
|---|---:|---:|---:|
| common | 8.0 | 5.0 | **3.0** ✅ |
| rare | 12.0 | 8.0 | **4.0** ✅ |
| epic | 22.0 | 18.0 | **4.0** ✅ |
| legendary | 40.0 | 35.0 | **5.0** ✅ |

全部 `spread > 2`，无套利。

### M1.3 兑换汇率 round-trip 损耗

| from | to | round_trip_ratio |
|---|---|---:|
| low_equip_pt | high_equip_pt | 0.800 |
| high_equip_pt | low_equip_pt | 0.800 |
| low_equip_pt | item_pt | 0.040 |
| item_pt | low_equip_pt | 0.040 |
| high_equip_pt | item_pt | 0.200 |
| item_pt | high_equip_pt | 0.200 |

🟡 **warn**：low↔high round_trip = 0.80，接近 0.85 警戒阈值。建议把 high→low (1:8) 改为 (1:7)，让损耗 ≥ 15%，避免高频套利。其他对 ratio < 0.5 健康。

## 2. 节奏（Pacing）

**n/a — raid_stats 0 局**。需要至少 5 局真实数据才能评估。

## 3. 多样性（趣味值代理）

**n/a — raid_stats.metadata 空**。需要至少 5 局才能计算 Shannon entropy。

## 4. 完成度

### M4.1 残片解码进度

- 残片池总数: 15 (F01-F15)
- 完全解码 (lv3) 记录: **2**
- 涉及用户: **1**
- per-user lv3 数: 2.0（仅基于测试数据）

### M4.2 Combo 触发活跃度

- 通过 combo 解锁的残片（discover_cycle=0）: **0**

预期当玩家解码到 F01+F05 / F02+F06 等组合时，会有 8 条 combo 链触发。

### M4.3 探针生态

- 活跃探针: **0**
- 总探针: 0

🟡 **warn**：探针生态完全空，无任何玩家留过探针。这是 Phase 21 设计的"异步 PvPVE"核心机制，需要真实玩家撤离时勾选才能启动。冷启动阶段需要 admin 用一两个测试账号留几个种子探针。

## 5. 异常

### M5.1 从未出现的 chamber

raid_stats 数据不足（< 10 局），跳过此检查。但当前数据库有 25 个 enabled chamber，全部就绪。

### M5.2 从未被选的职业

player_class_runs 数据不足（< 20 行），跳过此检查。当前 11 个 enabled class 全部就绪。

## 基线参考（用于后续对比）

```
chamber_templates  enabled = 25
classes            enabled = 11 (8 normal + 3 legendary)
fragment_pool      enabled = 15 (F01-F15)
shop_catalog       enabled = 30 (21 公开 + 9 class-locked)
shop_exchange_rates enabled = 7
player_points     rows    = 1 (item_pt=65)
player_fragments  rows    = 2 (lv3)
raid_stats        rows    = 0
player_class_runs rows    = 0
cross_room_probes rows    = 0 (active=0)
```

## 建议（基于本次基线）

1. **🟡 兑换汇率调整**：把 `high_equip_pt → low_equip_pt` 从 1:8 改为 1:7，让 round-trip 损耗从 20% 提升到 ~30%，更稳
2. **🟡 探针冷启动**：用 admin 账号撤离 2-3 次主动留探针，让其他玩家有遭遇可能
3. **📥 收集真实样本**：促成 5+ 局完整 raid，让节奏/多样性/异常指标有数据

下次跑（每日 03:17）应该会观察到这些指标从 n/a 变成具体数值。
