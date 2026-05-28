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
- [research-2026-05-27] **P0** — Phase 24b `shop_exchange_rates` 建表加版本号，支持 wipe-equivalent（一次性按比例缩减所有玩家点数）。防止老玩家 runaway power。 → ✅ DONE 2026-05-28T00:40: phase-25b SQL 加 `shop_exchange_rates.economy_version` 列 + `economy_wipe_log` 表 + `apply_economy_wipe()` 函数（FLOOR + GREATEST 0 防负, scaling ∈ (0, 2.0],可限定 point_type）+ `get_current_economy_version()` helper;dry-run scaling=1.0 验证通过
- [research-2026-05-27] **P1** — PrepareModal 必须明确"入场装备会被消耗" + class_pt 软保底显示计数（"距离必出 legendary 还剩 N 次"）。避免 gear fear 和黑箱反感。 → ✅ DONE 2026-05-28T16:23 commit 39bc938: PrepareModal 装备购买 tab 顶部加黄色 consume 警示横幅（撤离按耐久折算返还/阵亡永久销毁/不跨局保留）；职业 tab 保底面板加软保底计数行（pityRemaining = max(0, 1 - class_pt)，=0 显"已可必出 legendary"，>0 显"还差 N 个职业点·每次成功撤离 +1"）；next lint 通过

## 2026-05-27 — research (主题 C + D)

- [research-2026-05-27-v2] **P0** — `player_death_log` 补字段（cause_category ENUM / survived_seconds INT / chamber_depth INT）。死亡因果可识别度的数据前置，同时是 A 主题"死亡黏度"埋点的依赖。 → ✅ DONE 2026-05-28T01:23: phase-25c SQL 新建 `death_cause_category` ENUM + 加 3 列（含 CHECK 约束 + 索引）+ 从 reason 回填 cause_category；deathLog.js 同步写入新字段（含 NaN/范围防御）；先补部署 base table（旧 schema 未上线）
- [research-2026-05-27-v2] **P0** — Ω-段倒计时必须有 30s/10s/5s/2s 分层预警（视觉 + 音效）。若只在 0s 硬截止，违反"多层预警"反模式，立刻修正。 → ✅ DONE 2026-05-28T02:23: 新建 `src/components/OmegaCountdown.jsx`（回合制分层：≥4 normal / 3 caution / 2 warning / 1 critical）+ globals.css 加 `omega-pulse-slow|fast` keyframes + Web Audio API 程序化 beep（caution 单音 / warning 双音 / critical 三急音）；GameClientPage.jsx 替换原 inline span（保留 `meBase?.omegaCountdown` 取值）
- [research-2026-05-27-v2] **P0** — 新建 `docs/narrative-vision.md` 独立定义六纪元情感主题，作为所有 lore 文本和系统命名的对照基准。 → ✅ DONE 2026-05-28T02:30: 起草 `docs/narrative-vision.md`（构筑纪/运维纪/伊甸纪/失衡纪/封锁纪/共构纪 + 每纪元情感主题 + 15 残片纪元对照表 + 命名速查表 + 预留 6.1/6.2 章节给 27-v2/28-B/28-C 延伸 P0）

## 2026-05-27 — research (主题 E)

- [research-2026-05-27-v3] **P0** — `cross_room_probes` 上线前先加遥测埋点（probes_left / encountered / outcome_breakdown）+ admin 视图。 → ✅ DONE 2026-05-28T04:23: phase-25d SQL 加 `spared_count` / `killed_attacker_count` / `encounter_log JSONB` 列 + `v_probe_telemetry`（per-owner: probes_left / total_encountered / outcome_breakdown JSONB / avg_lifetime_hours）+ `v_probe_telemetry_by_chamber` 视图；probes.js 新 helper `recordProbeOutcome(client, probeId, byUserId, outcome)` 自动 append `encounter_log`（cap 50 防膨胀）+ 计数自增；gameActions.js ignore→`spared` / 反杀→`killed_attacker` / tryEncounterProbe→`encountered` / defeatProbe→`defeated` 四点埋桩；admin 新标签 🛰️ ProbeTelemetryTab 读双视图。
- [research-2026-05-27-v3] **P0** — 探针被遭遇后给主人写"回信"到 `player_notifications`（被谁遇到 / 攻击 or 放过）。 → ✅ DONE 2026-05-28T05:23: phase-25e SQL 新建 `player_notifications` 通用收件箱（user_id/kind/title/body/payload/read，含 (user_id,read,created_at DESC) 主索引 + kind 索引）;probes.js 加 `notifyProbeOwner()` helper + `buildProbePseudonym()`（28-E P0 anonymization 前瞻：`观测者-XXXX` = uuid 前 4 hex,**不存 attacker user_id**）;recordProbeOutcome 在 spared/killed_attacker 时投递,defeatProbe 在击杀分支投递；encountered 中间态不发避免 spam;烟测插入一条 + 删除验证通过
- [research-2026-05-27-v3] **P1** — 探针抽取加长尾衰减权重（剩余 TTL < 24h 加权）+ chamber 级密度上限。 [doing-2026-05-28T17:23]

---

## 2026-05-28 — research (主题 B 延伸 — catch-up + 可选 wipe + 通胀控制)

- [research-2026-05-28-B] **P0** — Phase 24b SQL 同步建 `seasonal_expeditions` + `player_expedition_opt_ins` 空表（不立即启用）。Arc Raiders Expedition 模式参考，避免半年后破坏性 schema 改动。详见 [notes-2026-05-28-B.md](../research/notes-2026-05-28-B.md) → ✅ DONE 2026-05-28T06:23: phase-25f SQL 建 `seasonal_expeditions`(13 列) + `player_expedition_opt_ins`(7 列) 空表（IF NOT EXISTS + auth.users FK + status 5 态 CHECK + bonus_skill_points ≤ 5 + 5 个 JSONB 配置字段 + 全注释）；postgres MCP 部署验证；预埋不启用，等 Phase 24b 一起激活
- [research-2026-05-28-B] **P0** — `raid_stats` 加 `points_credited / points_spent / stash_value_before / stash_value_after` JSON 字段，Phase 26 healthcheck 加"周库存增长率"指标，对照 12% 通胀红线。 → ✅ DONE 2026-05-28T15:00: phase-25g SQL 加 4 个 JSONB 列 + `v_weekly_stash_inflation` 视图(过去90天周聚合 high/low/item 三类合计 + credit/spent 累计);gameActions.js writeRaidStats 改读 `gv.stashSnapshotBefore` + 查 player_points 算 stash_value_after,extractPlayer 把 creditPoints 累计到 `gv.economyAccumulator.pointsCredited`,joinRoom 入场前后双 getBalances 算 stash + spent 增量;healthcheck-spec.md 加 M1.4 周库存增长率(红线 12% / credit_to_spent_ratio 1.2)
- [research-2026-05-28-B] **P0** — 24b 启动前写 `docs/economy-canon.md` 明确"持久 vs 重置"边界（残片/chamber 历史/class 池 = 持久；点数/装备/stash = 可选赛季重置）。 → ✅ DONE 2026-05-27T23:30: 起草 `docs/economy-canon.md`(9 章 + 附录;4 类点数本质 / 持久层 7 项 vs 可重置层 5 项权威表 + 灰色地带 §3.3 / 引用 phase-25b wipe-equivalent 工具箱使用准则 / phase-25f 赛季 opt-in 模型 + 跨季奖励禁止字段 / phase-25g 12% 通胀红线 + faucet 收紧优先级 / catch-up 边界禁止经济注水 / 反模式 6 条 / 变更治理双向绑定 narrative-vision §6.2);填补 [narrative-vision.md](../docs/narrative-vision.md) §6.2 待填章节(经济边界对叙事的 4 条反向约束)

## 2026-05-28 — research (主题 C 延伸 — live-service additive + 音频日志 + 新玩家入口残片)

- [research-2026-05-28-C] **P0** — `docs/narrative-vision.md`（27-v2 已提议）首章加"additive evergreen"宪法条款：F01-F15 永久可发现，未来 Phase 25+ 仅可加不可减、不得 FOMO 化。预防 Destiny 2 vaulting 灾难。详见 [notes-2026-05-28-C.md](../research/notes-2026-05-28-C.md) → ✅ DONE 2026-05-28T01:35: narrative-vision §6.1 占位章节扩充为 7 节宪法（6.1.1 永久可发现承诺 / 6.1.2 仅可加不可减 / 6.1.3 反 FOMO 红线（禁限时残片 + 禁倒计时 UI + 赛季回归不补叙事 + 限时活动不绑解锁）/ 6.1.4 与 economy-canon §3.1 持久层联动 / 6.1.5 唯一例外：修文不删片 + 违宪 PR block / 6.1.6 healthcheck M3 监测 + F01 首达率 80% 红线 / 6.1.7 Marathon/Warframe/economy-canon 引用）
- [research-2026-05-28-C] **P0** — `src/lib/server/fragments.js` 的 `discoverFragment` 加首 3 次出勤的 F01-F03 权重 boost，确保 ≥80% 新玩家在第一周触达入口残片。配套 healthcheck spec 监测 F01 首达率。防止 Marathon "onboarding stingy + lore obscure" 双投诉。 → ✅ DONE 2026-05-28T02:30: discoverFragment 加入新手期权重 boost（`player_class_runs` 行数 < 3 触发，F01/F02/F03 名称前缀匹配 ×5 multiplier，weightedPick 重构为接受 weightFn）+ healthcheck-spec.md 新增 M3.5 F01 首达率（critical < 60% / warn < 80% / 样本不足 cohort<5 跳过）；postgres SQL 烟测通过
- [research-2026-05-28-C] **P1** — 大厅新增"档案"页面（`src/app/codex/page.js`），按六纪元分组展示玩家已解码 fragment + decode_level 摘要。Marathon Codex 等价物，casual catch-up + lore hunter 双服务。

## 2026-05-28 — research (主题 D 延伸 — 保险 / 连败兜底 / 死亡复盘)

- [research-2026-05-28-D] **P0** — 死亡复盘 UI：用 27-v2 提议的 `player_death_log.cause_category/survived_seconds/chamber_depth` 在 `src/app/game/[id]/page.js` 死亡分支弹"📜 死亡复盘"（死因/存活时间/chamber 路径/被销毁 fragment）。缺它则因果不可识别度退回 Returnal 反模式，Phase 22 数据白埋。详见 [notes-2026-05-28-D.md](../research/notes-2026-05-28-D.md) → ✅ DONE 2026-05-28T11:30: 新建 `src/components/DeathReviewModal.jsx`（死因横幅按 cause_category 着色 + 存活时长 + 探索深度/chamber 名 + 残片状态行；残片持久层默认显示"不因阵亡丢失"，context.lostFragments 命中才列损失）;GameClientPage.jsx 加 alive→false 检测 effect 拉 player_death_log 最新行组装 review（DB 缺字段用 room.started_at / chamberIndex 客户端快照兜底 + 600ms 重试一次防 realtime 早到）;gameActions.js 4 个 logPlayerDeath 调用补 survivedSeconds(raidSurvivedSeconds helper)+chamberDepth(chamberDepthOf helper)，同时供 A 主题死亡黏度埋点
- [research-2026-05-28-D] **P0** — Phase 24b 同期建表加 `equipment_instances.insurance_tier ENUM('none','basic','premium')` + `insurance_premium_pt INT`，basic 30% / premium 60% 死亡返还概率。2026 extraction genre baseline（Tarkov / EVE Vanguard / Arc Raiders 都已迭代），拖到 Phase 25+ 会被新玩家流失数据反推回来。 → ✅ DONE 2026-05-28T12:27: phase-25h SQL 新建 `equipment_insurance_tier` ENUM (none/basic/premium) + equipment_instances 加 `insurance_tier`(NOT NULL DEFAULT none + 部分索引) + `insurance_premium_pt`(NOT NULL DEFAULT 0, CHECK≥0);postgres MCP 部署+验证(既有实例自动 none)；预埋不启用，死亡返还概率(basic 30%/premium 60%)作应用层常量留 Phase 24b 接入购买入口+死亡返还分支
- [research-2026-05-28-D] **P0** — Streak-breaker：`failedRetreats >= 3` 触发下一局自动 buff（免费 basic 保险 + chamber NPC 密度 -20% + PI 引导者关怀对白）。**只降难度不加经济收益**，防 "故意送死刷 buff"。文件：`src/lib/server/raids.js` preRaidSetup + `src/lib/constants.js` 阈值常量。 → ✅ DONE 2026-05-28T13:23: 新建 `src/lib/server/raids.js`（`computeStreakBreaker`/`applyNpcDensityMultiplier`/`preRaidSetup` 三个纯函数，无 DB 副作用，Phase 24b 入场流程接入）+ constants.js 加 `STREAK_BREAKER` 配置块（THRESHOLD 3 / NPC 密度 ×0.8 即 -20% / 免费 basic 保险 / 3 条 PI 引导者关怀对白）；红线"只降难度不加经济收益"由设计保证（返回包无任何点数/掉落/stash 字段，basic 保险仅返还消耗装备）；预埋不启用，等 Phase 24b 接入；next lint 通过

## 2026-05-28 — research (主题 E 延伸 — 持续痕迹 / 匿名化 / Nemesis / 滥用分流)

- [research-2026-05-28-E] **P0** — 探针主人匿名化（Phase 21 上线前必锁）：`tryEncounterProbe` / `resolveProbeFight` / 遭遇 UI / `player_notifications` 回信文本全部禁止显示 probe-owner username/email，改为稳定 pseudonym（`观测者-<probe_id 后4位>` 或 `第N位幸存者` + 段位）。Ghost Player Effect 核心 anti-griefing 资产，事后改 = PR 灾难。详见 [notes-2026-05-28-E.md](../research/notes-2026-05-28-E.md) → ✅ DONE 2026-05-28T14:23 commit 7975241: 遭遇方 payload 不再含 probe owner_id（gameActions movePlayer），改下发 buildOwnerPseudonym(probe.id) 派生的稳定代号 `观测者-XXXX`（新 helper，从 BIGSERIAL id 末 4 位）；遭遇 UI 卡展示该代号替代 owner。actOnProbe 不读 ownerId 故移除安全；notifyProbeOwner 回信早已用 attacker pseudonym。无 resolveProbeFight 函数（实际为 actOnProbe）。next lint 通过
- [research-2026-05-28-E] **P0** — chamber 持续痕迹 v1：新建 `chamber_residue(owner_pseudonym, chamber_template_id, last_npc_killed, last_loot_taken, last_death_location, expires_at +72h)`。raid 结束 / 探针被遭遇时 snapshot，下位进场玩家 prefetch 最近 5 条作为环境信息（"💀 这里曾有人倒下"）。Hunt: Showdown 2.7 "the world remembers" 2026 extraction 标杆，DTSV chamber 失忆是异步层根性缺口。 → ✅ DONE 2026-05-28T15:30: phase-25i SQL 新建 `chamber_residue` 表（chamber_template_id + owner_pseudonym 匿名默认 / last_npc_killed / last_loot_taken / last_death_location / source CHECK(raid_end|probe_encounter) / created_at / expires_at 默认 +72h + 2 索引（chamber_template_id,created_at DESC / expires_at）+ 全注释）;postgres MCP 部署验证 9 列;新建 `src/lib/server/chamberResidue.js`（`snapshotChamberResidue`（至少一条痕迹才写,source 白名单兜底）+ `prefetchChamberResidue`（仅未过期,最近优先,limit 1-20 钳制）两个 exception-safe 纯 helper,复用 probes.js `buildOwnerPseudonym` 28-E 匿名,预埋不启用等 Phase 21/24b 接入）;next lint 通过
- [research-2026-05-28-E] **P1** — Nemesis 重复遭遇升级：新建 `probe_encounter_pairs(attacker_id, owner_id, encounter_count, last_outcome, nemesis_since)`，同对 30 日 ≥3 次遭遇 → 标记 nemesis，遭遇 UI 显示 banner + 双方"宿敌再次相遇"通知。USPTO 9539518 Nemesis 模式把重复噪声变 emergent narrative，与 v3 P1 aggression score 互补不冲突。

<!-- 下次健康检查 / 调研自动追加在这里下方 -->
