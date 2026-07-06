# KALEIDO 设计规格 v0.3(精简定稿)

> **仓库正本注记(中控)**:本文件为 Kanata 于 2026-07-06 交付的 KALEIDO v0.3 规格正本,逐字收录,自此为项目**核心主线**的唯一权威规格。v0.1/v0.2 为背景材料(未入库)。细化设计见同目录 `02-detailed-design.md`,代码库落地性核查见 `01-groundtruth.md`,三轨工作包见 `03-track-packages.md`。以下为原文。

---

日期:2026-07-06 · 本文档取代 v0.1 / v0.2,为唯一权威规格;旧版降级为背景材料。
形态:单人 · 浏览器 · 回合制 · 关卡制 run · AI 生成内容 · 底盘 DTSV(Next.js + Supabase)
范围外:多人、realtime 同步、PvP 存档对战(另立文档)、装备金字塔(冻结)。

---

## 1. 术语对照(旧 → 新)

| 旧(v0.1/v0.2) | 新(本文档) |
|---|---|
| 宪法 / 不变核 | 固定规则集 R1–R12 |
| 织者 / 守律者 / 语者 | 生成Agent(GEN)/ 评审Agent(EVAL)/ 叙事Agent(NAR) |
| 三闸 | 三级校验(结构 / 语义 / 模拟) |
| 地板 / 天花板 | 回落层(采样器)/ 生成管线 |
| 第一法则 | 节奏约束(R10) |
| 离席法 | 离席规则(R11) |
| 哀悼图鉴 | 收敛图鉴(死亡同样触发) |
| 惰性延续 | 回归补算 |
| 晋升飞轮 | 内容晋升机制 |
| 主轴 / Spine | run 大纲(字段名保留 spine) |
| 镜像考题 | 终关个性化生成 |

保留的功能术语:DSL、原子、简报(brief)、收敛、content_pool。

---

## 2. 固定规则集(R1–R12)

R1 结算权:全部运行时结算由引擎执行,同输入同输出;LLM 不参与运行时任何数值裁决。
R2 数据封闭:一切可变内容必须表达为 Level Schema 与 DSL 范围内的数据,且通过三级校验后方可进入运行时。
R3 规则冻结:每关规则集与内容在玩家进入该关前固定;局内禁止规则变更;运行时随机仅来自数据中声明的概率字段(chance / weight / success_rate)。
R4 回合制:战斗与行动为回合制;禁止实时与计时类机制。
R5 动词固定:玩家动词限定为搜索 / 战斗 / 合成;生成内容仅可挂接既有动词,不得新增或替换。
R6 规则可见:对玩家构成约束的规则须在生效前展示,或提供一次无惩罚试探。
R7 输出通道:面向玩家的生成文本仅经 NAR 输出于日志 UI;NAR 只引用 player_events 中可验证的行为事实,禁止输出人格或心理判断。
R8 版本结构:一次 run = 一个版本 = run 大纲 + 其生成内容集;版本终止(通关或死亡)触发收敛:图鉴 + 种子回放。
R9 死亡:版本内 permadeath;死亡不减损收敛内容(含未到场生成物)。
R10 节奏约束:系统目标函数为玩家通关体验;禁止利用画像制造针对性不可解局面;挫败指标越阈时 EVAL 必须下调后续难度带;干预手段限于内容选择、难度带、掉落权重,禁止运行时改值;玩家行动前系统不推进任何进程。
R11 离席规则:离线期间零机制变化(无死亡、损耗、进度);离席时长与退出情境计入画像;实现为回归补算;禁止召回类推送。
R12 校验前置:未通过三级校验的生成物不得进入就绪队列;失败按回落序执行。

机械默认层(可被单关数据覆盖):HP/ATK/DEF 语义、伤害公式、结算管线、回合内结构。

---

## 3. 可变域(战斗可变性三级)

| 级 | 内容 | 实现基础 | 状态 |
|---|---|---|---|
| A | 逐关公式覆盖 | env_rules.formula_overrides → evalFormula(现有) | 立即可用 |
| B | 结算管线重排:类型化步骤序列;逐关属性通道声明 | DSL v2 | P2 后 |
| C | 战斗模式更换,限回合制变体族 | 模式模板库:5–8 个手工骨架,参数与内容槽位由 GEN 填充;每模板自带回合决策 bot 供模拟校验 | P1 起建 2–3 个 |

DSL 版本化扩展(v1 现有触发-效果集;v2 步骤序列;v3 受限元规则),仅在版本间扩展,禁止运行时扩展。

---

## 4. 时间参数

| 参数 | 值 |
|---|---|
| 版本时长 | 40–60 分钟 |
| 关切分 | 5 关 × 8–12 分钟(待确认,未决项 1) |
| 超前生成 | 初期 N+1,P2 达标后 N+2 |
| run 大纲生成 | 开局一次调用,约 10s,以入场叙事遮蔽 |

---

## 5. 系统组件

### 5.1 运行时核心
DTSV gameEngine 原样;数据行的确定性解释器;evalFormula 白名单为语义校验基础。

### 5.2 采样器(回落层)
seed → 从已验证池(种子关 + content_pool)装配关卡。无外部依赖,为全链路最终回落。

### 5.3 生成管线
状态机:
```
queued → generating → repair(≤3) → validating → ready → deployed
                                        │ 失败 → rejected → 回落序
ready 期间:profile drift > τ 或大纲改道 → invalidated → 重排队
```
参数:
- 修复重试上限 3
- 低置信双变体:brief_confidence < 0.6 时生成 2 变体,到场按最新画像投放(阈待标定)
- 失效阈值 τ = 0.25,drift = max per-trait |Δ|(待标定)
- 回落序:ready 生成物 → 个人缓存 → content_pool → 种子关

brief 字段:profile.traits、profile.evidence、spine 节点、difficulty_band、pacing_state、absence_context、禁用清单。

### 5.4 三级校验
1. 结构:JSON Schema 合法
2. 语义:引用存在;公式过 evalFormula 白名单;数值在声明域内
3. 模拟:对应模板 bot 试玩;输出 bot_clear_rate、avg_turns、异常 flags;通过条件:clear_rate ∈ difficulty_band 且 flags 为空

difficulty_band 默认 [0.4, 0.7](待标定)。

### 5.5 Agent 分工
| Agent | 输入 | 输出 | 禁止 |
|---|---|---|---|
| GEN | brief | Level/实体/公式 JSON(schema 封闭) | 输出 schema 外字段 |
| EVAL | GEN 产物、遥测、pacing 指标 | 评审结论、难度带调整、简报修正 | 参与运行时结算 |
| NAR | player_events 证据、gate_results、absence_context | 日志文本 | 人格判断;引用不可验证事实 |

交接为固定 schema,无自由对话。gate_results 可作为 NAR 的叙事素材(可选特性)。

### 5.6 传感层
表 player_events。动词:search / fight_start / attack / flee / craft_attempt(success_rate) / item_use / item_hoard_tick / npc_spare / npc_overkill / death / level_clear / ui_read_ms / idle_ms / session_end(context: after_death | after_clear | mid_combat | idle) / return_latency / hesitation_ms。

### 5.7 画像层
traits {risk, aggression, patience, curiosity, hoarding, thoroughness} ∈ [0,1],v1 由计数器与比率计算;evidence = top 可观察行为事实。每关末刷新;drift 超 τ 触发 invalidate。消费形态为 brief。v2 换序列模型(§7 Stage 2)。

### 5.8 节奏约束的量化(R10 执行参数,均待 P3 标定)
- 干预触发:同关死亡 ≥ 3;或"死亡后 90s 内退出"于近 3 会话发生 ≥ 2 次
- 干预动作:difficulty_band 下限 −0.1;恢复类掉落权重上调
- 加码许可:预测 clear_rate > 0.85 且连续 2 关无挫败信号

### 5.9 回归补算(R11 实现)
离线零执行;回归时以 absence_context 为输入执行一次生成调用,产物过三级校验,呈现为再入叙事。pg_cron / Edge Functions 真后台任务为后备方案,仅当补算体感不足。

### 5.10 收敛
版本终止(通关或死亡)→ 内容集冻结:
- 图鉴:全部生成物可翻阅,含未到场分支与双变体另一半;先行实现,兼任开发期 QA 与晋升策展界面
- 种子回放:内容冻结、画像与 EVAL 停用,纯执行重玩

### 5.11 内容晋升机制
条件:三级校验通过 ∧ live 指标达标(clear_rate 在带内、无异常退出峰值)→ 匿名化写入 content_pool,同时写入训练集。

---

## 6. 数据模型

### 6.1 Level Schema v0.3
```json
{
  "level_id": "uuid",
  "run_id": "uuid",
  "seq": 3,
  "spine_ref": "string",
  "gen_meta": { "source": "generated|sampled|seed", "model": "string", "brief_hash": "string", "profile_snapshot": "uuid", "created_at": "ts" },
  "combat_mode": { "template_ref": "string", "params": {} },
  "env_rules": [ { "rule_key": "string", "value": 0 } ],
  "formula_overrides": [ { "target": "damage|defense|crit|...", "formula": "string" } ],
  "event_deck": [
    { "type": "npc_encounter", "npc": {}, "weight": 3, "once": false },
    { "type": "item_find", "item": {}, "weight": 5 },
    { "type": "set_piece", "trigger": "string", "script": [], "once": true }
  ],
  "exit_condition": { "type": "boss_kill|survive_turns|collect", "params": {} },
  "difficulty_band": { "target_clear_rate": [0.4, 0.7] },
  "validation": { "schema": "pass", "semantic": "pass", "sim": { "bot_clear_rate": 0.0, "avg_turns": 0, "flags": [] } }
}
```

### 6.2 表
| 表 | 关键字段 |
|---|---|
| player_events | player_id, run_id, level_seq, t, verb, payload(jsonb) |
| player_profile | player_id, version, traits(jsonb), evidence(jsonb), drift_from_prev |
| runs | run_id, spine(jsonb), status, converged_at |
| levels | Level Schema 实例 |
| generation_jobs | job_id, run_id, target_seq, state, attempts, brief(jsonb), artifact(jsonb), gate_results(jsonb) |
| content_pool | entity_type, payload(jsonb), provenance, live_stats(jsonb) |

---

## 7. 模型路线

| 阶段 | 内容 | 前置 | 量级 |
|---|---|---|---|
| S0(现在) | 前沿模型 API + schema 约束 + 修复循环;全部 job、gate_results、遥测落库 | 无 | API 费用(已豁免近期考量) |
| S1 | LoRA 微调 7–8B 开源模型;教师 = 前沿模型,过滤 = 三级校验 | 5k–20k 条已验证 brief→level 对 | 24G 单卡或短租,天级;本地推理使边际成本趋零 |
| S2 | 难度预测器(关特征→clear_rate,GBDT 起步,归属 EVAL);画像编码器(事件序列→traits);行为克隆 bot(按战斗模板分体) | 数千条模拟结果 / 数百局遥测 | 笔记本级 |
| S3(远期) | GEN↔bot 自博弈;玩家重试/弃局/时长为偏好信号 | S1+S2 | 研究级 |

优先序:难度预测器 → GEN 蒸馏 → NAR(文本质量要求最高,最后本地化)。

---

## 8. 相位计划

| 相位 | 内容 | 闸门(不过不进) |
|---|---|---|
| P0(1–2 周) | 单人化壳(剥 realtime);传感层落库;Level Schema 冻结;"关"实体入库 | 事件在流;schema 冻结 |
| P1(2–4 周) | 回落层:10–15 个种子关,含 2–3 个战斗模板(带 bot);seed→关序列;R1–R12 定稿 | 无 AI 纯随机版可玩且成立;不过则终止项目 |
| P2(2–4 周) | 生成管线(N+1 → N+2)+ 三级校验 + 回落序 | 校验通过率 > 60%;盲测 n≥5,生成关辨识准确率 ≤ 60% |
| P3 | 画像 + EVAL 节奏 + NAR 上线;R10 参数标定 | playtest 中个性化时刻被自发提及 |
| P4 | 收敛:图鉴 + 种子回放 | 版本终止者二周目率 |
| P5 | 难度预测器上线 | 预测器与模拟器判定一致率达标 |
| P6(远期) | GEN 蒸馏;自博弈;PvP 存档导出(另立文档) | — |

---

## 9. 风险表

| 风险 | 对策 |
|---|---|
| 生成物中位质量低 | 三级校验硬拦;晋升机制抬底;退出/碾压/暴毙遥测回灌 brief |
| 画像漂移致内容失配 | 特质条件化;τ 失效重排;双变体 |
| 画像误读 | R7:仅引用可验证行为;置信门控 |
| 跨关连贯断裂 | run 大纲为一致性契约 |
| DSL 表达力不足 | 版本化扩展;禁止运行时扩展 |
| 难度调节被察觉为操纵 | 干预仅走内容选择与难度带(R10);系统于虚构层公开自适应属性 |
| 离席惩罚回潮 | R11;新离线机制过审:构成亏损即否决 |
| 单人开发范围失控 | 相位闸门硬约束 |
| 玩家对 AI 内容反感 | R2/R7:无裸输出直达;质量以校验保证 |
| 生成成本 | 近期豁免;S1 本地化为结构解 |

---

## 10. DTSV 资产映射

| DTSV 现有 | 角色 |
|---|---|
| gameEngine.js | 运行时核心(原样) |
| evalFormula 白名单 | 语义校验基础 |
| game_rules | env_rules 全局默认层 |
| buff_pool / passive_skills | DSL v1 原子库 |
| npc_pool / item_pool | 种子内容池 |
| map_config.weather + getSearchChances | env_rules 覆盖原型 |
| clearRulesCache() | 关卡注入钩子 |
| Admin 编辑器 | content_pool 策展界面 |
| 日志 UI | NAR 输出通道 |
| 装备金字塔 | 冻结;分叉-收束结构降级为原子组合参考 |
| Realtime 房间同步 | 移出关键路径 |

> 注:本表以规格原文收录;各行与真实代码的逐条核对(exists/partial/missing + file:line)见 `01-groundtruth.md`,以核查结论为实现依据。

---

## 11. 未决项与待标定参数

未决(需 Kanata 决策):
1. 关切分:5 × 8–12 分钟,确认或修改
2. NAR 声线与命名主题
3. Agent 正式命名(GEN / EVAL / NAR 为功能名,可直接沿用)
4. 代号

待标定(P2–P3 实测定值):brief_confidence 双变体阈(暂 0.6)、drift τ(暂 0.25)、difficulty_band(暂 [0.4, 0.7])、R10 干预触发值、盲测判据(暂 n≥5、≤60%)。
