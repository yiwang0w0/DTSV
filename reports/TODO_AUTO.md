# 自动发现的 TODO

> 每次健康检查 / 外部调研产出的 critical 异常 + 高优 finding 都追加到本文件末尾。
> 下个 phase 启动前先 grep 这个文件,优先级 > Readme 路线图。
> 处理完的 item 划线但不删除（保留历史）。

---

## 2026-05-12 baseline + 首次调研

### 🟡 经济（来自 healthcheck baseline）

- [ ] **兑换汇率调整 round_trip 0.80 → ~0.70**
  - 现状：`high_equip_pt → low_equip_pt` 是 1:8，round_trip = 0.80（接近 0.85 警戒）
  - 建议：改为 1:7，让 round-trip 损耗 30%
  - 改动：admin → 💱 点数 / 兑换 → 编辑这一条
  - 优先级：🟡 中（数据增长后再观察是否套利）

### 🔥 高优 Retention（来自 research 主题 A）

- [ ] **新手保护期机制**
  - 痛点：玩家前几局必死 + 全失，挫败感导致弃坑（extraction 通病）
  - 设计：前 3 局 raid 撤离失败返还 50% 入场购买点数
  - 涉及：profiles.first_raids_count 新字段 / extractPlayer 失败分支 / PrepareModal 标"新手 raid"
  - 预估工作量：M

- [ ] **Loadout preset 节省入场摩擦**
  - 痛点：老玩家每次都重复点装备/道具/兑换组合
  - 设计：profiles 加 `saved_loadouts JSONB` (3-5 个 slot) + PrepareModal 顶部加"📋 预设"下拉
  - 预估工作量：S

### ⚡ 中优 Narrative（来自 research 主题 C）

- [ ] **Archive codex 主线/支线分类**
  - 现状：合成图谱有，但没区分"叙事主线 F01→...→F15"和"支线" combo
  - 设计：fragment_pool 加 `is_main_story BOOLEAN`；archive 加"📜 主线"折叠卡按顺序展示
  - 预估工作量：S

- [ ] **残片 lv 升级 toast 动画**
  - 痛点：升级反馈藏在日志里不够突出
  - 设计：discoverFragment 返回 newLevel > oldLevel 时，客户端弹一个 200ms 闪光 toast
  - 预估工作量：S

### 💡 低优

- [ ] **死亡保险**：extract 时多花 5 item_pt 买保险 → 死亡返还 30% 点数
- [ ] **Starter contract 链**：4 个新手 quest（首撤离/首击杀/首购买/首探针）

---

## 2026-05-27 — research (主题 A + B)

- [research-2026-05-27] **P0** — raid_stats 接 healthcheck，校准撤离成功率到 50% ±10%。Phase 24b 经济调参前置依赖。详见 [notes-2026-05-27.md](../research/notes-2026-05-27.md#主题-a--extraction-shooter-设计) → ✅ DONE 2026-05-28T00:25: healthcheck-spec.md M2.2 阈值收紧到 [40,60]，新增 extract_deviation_from_target 字段 + critical 边界 [<20, >80]
- [research-2026-05-27] **P0** — Phase 24b `shop_exchange_rates` 建表加版本号，支持 wipe-equivalent（一次性按比例缩减所有玩家点数）。防止老玩家 runaway power。
- [research-2026-05-27] **P1** — PrepareModal 必须明确"入场装备会被消耗" + class_pt 软保底显示计数（"距离必出 legendary 还剩 N 次"）。避免 gear fear 和黑箱反感。

## 2026-05-27 — research (主题 C + D)

- [research-2026-05-27-v2] **P0** — `player_death_log` 补字段（cause_category ENUM / survived_seconds INT / chamber_depth INT）。死亡因果可识别度的数据前置，同时是 A 主题"死亡黏度"埋点的依赖。
- [research-2026-05-27-v2] **P0** — Ω-段倒计时必须有 30s/10s/5s/2s 分层预警（视觉 + 音效）。若只在 0s 硬截止，违反"多层预警"反模式，立刻修正。
- [research-2026-05-27-v2] **P0** — 新建 `docs/narrative-vision.md` 独立定义六纪元情感主题，作为所有 lore 文本和系统命名的对照基准。

## 2026-05-27 — research (主题 E)

- [research-2026-05-27-v3] **P0** — `cross_room_probes` 上线前先加遥测埋点（probes_left / encountered / outcome_breakdown）+ admin 视图。
- [research-2026-05-27-v3] **P0** — 探针被遭遇后给主人写"回信"到 `player_notifications`（被谁遇到 / 攻击 or 放过）。
- [research-2026-05-27-v3] **P1** — 探针抽取加长尾衰减权重（剩余 TTL < 24h 加权）+ chamber 级密度上限。

---

<!-- 下次健康检查 / 调研自动追加在这里下方 -->
