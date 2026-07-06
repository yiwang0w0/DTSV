# KALEIDO · 02 细化设计(P0/P1 施工级 + P2 概设)

> 2026-07-06 · 🧭 中控 · 依据:`00-spec-v0.3.md`(权威规格)+ `01-groundtruth.md`(代码核查)。
> 本文把规格 P0/P1 细化到「可直接派单」粒度;P2 只做概设(P1 闸门是硬闸:纯随机版不成立则终止项目,P2 细化推迟到闸门通过后)。
> 全文遵守规格 R1–R12;对现有多人玩法遵守 **Phase 37 中性铁律:kaleido gametype 之外零行为变化**。

---

## 0. 总决策(中控拍板,依据 01 核查)

| # | 决策 | 内容 | 理由 |
|---|---|---|---|
| D1 | **执行底盘 = 方案一** | 复用 rooms+gamevars+`/game/[id]`,新 gametype = **整数 30**(`KALEIDO_GAME_TYPE`,照 BR=20 范式;§2.1 勘误),validnum=1 | 单人生命周期分支已存在(roomState.js:424-435),改动面最小,最快到 P1 闸门 |
| D2 | **双层真源** | `runs`/`levels` 表 = KALEIDO 域真源(收敛/图鉴/回放的依据);rooms 行 = 一次性执行载体(runs.room_id 引用) | 规格 R8 要求版本收敛与种子回放,gamevars 会被生命周期清洗,不能当档案 |
| D3 | **回合模型换轨** | kaleido 局停用 wall-clock 体力,改 per-level `turnCount`(每动作 +1) | 01 §1:stamina 违反 R4/R11;污染 tick 本就按动作驱动,合规保留 |
| D4 | **种子关存 content_pool** | 种子关= content_pool 行(entity_type='level', provenance.source='seed');levels 表只存 per-run 实例 | 回落序(ready→缓存→content_pool→种子关)天然统一成一张表的查询 |
| D5 | **SQL 命名新开命名空间** | `scripts/kaleido-p0-schema.sql` 起,`kaleido-<相位><序>-<主题>.sql` | 不占三轨 phase 号段,主线独立可追溯 |
| D6 | **P0/P1 全程零 LLM** | 采样器纯确定性;generation_jobs 表 P0 建好但不启用 | 规格 P1 闸门就是「无 AI 纯随机版可玩」;LLM 层是 P2 的事 |

新目录约定:服务端 `src/lib/server/kaleido/`(runs.js / sampler.js / events.js / combatModes/);P2 起 `src/lib/server/generation/`。

---

## 1. 架构总览(P0–P2 全景,粗箭头为 P0/P1 范围)

```
玩家 ⇒ /rooms「单人出勤」⇒ startKaleidoRun ─┬─ runs 行(spine, status='active')
                                            ├─ levels×5(P0/P1: 采样器装配,source='sampled|seed')
                                            └─ rooms 行(gametype=KALEIDO_GAME_TYPE(30), validnum=1, raidPath←levels)
        ⇓
/game/[id](kaleido 模式:无 realtime 订阅·动作返回值刷新)
        ⇓ 每动作
executeGameAction ⇒ persistResolution ══► player_events 发射(传感层)
        ⇓ exit_condition 达成
level_clear ⇒ 推进 seq / 第 5 关 ⇒ run 收敛(status='cleared'|'dead')
                                            [P2] generation_jobs: queued→…→ready(N+1 超前)
                                            [P2] 三级校验:结构(JSON Schema)/语义(evalFormula)/模拟(模板 bot)
```

---

## 2. P0 细化(单人化壳 + 传感层 + Level Schema 冻结 + 关实体入库)

### 2.1 单人化壳(kaleido gametype)

- ⚠ **勘误(2026-07-06 · ⚙️侦察 + Kanata 拍板)**:`rooms.gametype` 是**整数列**(createRoom 写 `Number(payload.gametype ?? 0)` gameActions.js:2358;GAME_TYPES 全整数键,BR=20)。初稿的字符串 `'kaleido'` 经 Number() 变 NaN,不可行。**定案 = 整数常量 30,照 BR=20 范式**;本节以下按定案改写。
- `src/lib/constants.js`:`export const KALEIDO_GAME_TYPE = 30` + `GAME_TYPES[30] = '万华镜·单人 run'`(admin 房列表零改自动显示中文名;代号待 Kanata 定);`KALEIDO = { ENABLED: true, LEVEL_COUNT: 5 }` 配置块。
- 判定 helper(roomState.js):`isKaleidoRoom(room) ⇒ Number(room?.gametype) === KALEIDO_GAME_TYPE`。**所有豁免一律走这一个谓词**,禁止散落数字比较。
- gametype 守卫清单(kaleido 局跳过,均为一行早退):
  | 位置 | 处置 |
  |---|---|
  | `tryEncounterProbe` / `leaveProbe`(gameActions.js:2992-3008/3141-3167) | 跳过 —— 异步 PvPVE 属范围外 |
  | `applyEndingIfTriggered`(gameActions.js:673) | 跳过 —— kaleido 用 exit_condition/收敛 |
  | `extractPlayer` 入口 | kaleido 局 throw(UI 不展示撤离入口) |
  | `attackPlayer` 入口 | kaleido 局 throw(防御性;单人本不可达) |
  | 体力扣减/回复(stamina) | kaleido 局 0 消耗 0 回复(见 §2.2) |
- realtime:GameClientPage kaleido 模式不建 `supabase.channel` 订阅(GameClientPage.jsx:256-274 处按 gametype 分支),动作后用 API 返回的全量状态刷新。**这即是「剥 realtime」的 P0 形态**——多人局订阅原样保留。

### 2.2 回合模型(R4/R11 合规)

- player state 增 `turnCount:number`(createPlayerState 默认 0;**勘误**:normalizeGamevars 对 players 原样透传、不逐玩家改写,旧局兼容改在**递增处 `?? 0` 兜底**——⚙️实施决定,中控已批)。
- kaleido 局每个「消耗性动词」(search/attack/craft/item_use/move)在 persistResolution 前 `turnCount+1`;纯 UI 读不计。
- `exit_condition.survive_turns` 读 turnCount;`fight` 内回合数复用现有交换结构(一次 attack = 攻+反击,已是离散回合)。
- 污染:保留按动作 tick(本就非计时);Ω 倒计时(omegaCountdown 按动作递减)语义合规,P1 由关数据决定是否启用。
- **离线零变化(R11)自动成立**:无 wall-clock 消耗后,唯一时间痕迹是 player_events 的时间戳(用于画像,不驱动机制)。

### 2.3 六表 DDL(草案 —— ⚙️游戏性落 `scripts/kaleido-p0-schema.sql`,🔒安全性审后经 postgres MCP 执行)

全部幂等;RLS 一律开;**私有五表 = owner SELECT + service_role ALL,content_pool = 公开读 + service_role 写**(phase-51 范式)。要点:

```sql
-- runs:一次 run = 一个版本(R8)
CREATE TABLE IF NOT EXISTS runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL,                -- FK auth.users
  room_id BIGINT,                         -- 执行载体 rooms.id(方案一)
  seed TEXT NOT NULL,                     -- 采样器种子(回放/复现)
  spine JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','cleared','dead','abandoned')),
  current_seq INT NOT NULL DEFAULT 1,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  converged_at TIMESTAMPTZ
);

-- levels:Level Schema v0.3 实例(per-run;种子关不在此,在 content_pool)
CREATE TABLE IF NOT EXISTS levels (
  level_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  seq INT NOT NULL,
  gen_meta JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {source:'seed|sampled|generated', model, brief_hash, ...}
  payload JSONB NOT NULL,                        -- Level Schema v0.3 全量(00-spec §6.1)
  validation JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready','deployed','played','skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, seq)
);

-- player_events:传感层(append-only,镜像 br_match_events 设计)
CREATE TABLE IF NOT EXISTS player_events (
  id BIGSERIAL PRIMARY KEY,
  player_id UUID NOT NULL,
  run_id UUID,                                   -- 大厅侧事件可空
  level_seq INT,
  t TIMESTAMPTZ NOT NULL DEFAULT now(),
  verb TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_pe_run ON player_events(run_id, level_seq);
CREATE INDEX IF NOT EXISTS idx_pe_player_t ON player_events(player_id, t DESC);
-- RLS:owner SELECT;写仅 service_role;不给任何 UPDATE/DELETE 策略(append-only)

-- player_profile:画像快照(P3 消费,P0 建表即可)
CREATE TABLE IF NOT EXISTS player_profile (
  id BIGSERIAL PRIMARY KEY,
  player_id UUID NOT NULL,
  version INT NOT NULL,
  traits JSONB NOT NULL DEFAULT '{}'::jsonb,     -- {risk,aggression,patience,curiosity,hoarding,thoroughness}∈[0,1]
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  drift_from_prev REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, version)
);

-- generation_jobs:生成管线状态机(P0 建表,P2 启用)
CREATE TABLE IF NOT EXISTS generation_jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  target_seq INT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued','generating','repair','validating','ready','deployed','rejected','invalidated')),
  attempts INT NOT NULL DEFAULT 0,
  brief JSONB NOT NULL DEFAULT '{}'::jsonb,
  artifact JSONB,
  gate_results JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- content_pool:已验证共享池(种子关在此,provenance.source='seed')
CREATE TABLE IF NOT EXISTS content_pool (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,                     -- 'level' | 'combat_mode_params' | 'npc' | 'item' ...
  payload JSONB NOT NULL,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb, -- {source:'seed'|'promoted', run_id?, anonymized:true}
  live_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.4 传感层(player_events)

- 新文件 `src/lib/server/kaleido/events.js`:`emitPlayerEvents(client, rows[])` —— service client 批量 insert,**fire-and-forget + try/catch 吞错**(遥测失败绝不阻断玩家动作)。
- **发射点 1(主)**:persistResolution / persistResolutionWithPollution(gameActions.js:615-689)内,`isKaleidoRoom(room)` 时由 action 名 + resolution 推导动词批。P0 范围:**只对 kaleido 局发射**(多人局零改动,中性铁律)。
- **发射点 2**:logPlayerDeath(deathLog.js:36-66)追加 `verb='death'`。
- **发射点 3(客户端动词)**:新路由 `POST /api/kaleido/beacon`(requireRequestUser;白名单动词 + payload 尺寸上限),客户端 `navigator.sendBeacon` 上报 session_end(context: after_death/after_clear/mid_combat/idle)、ui_read_ms、hesitation_ms。**服务端只信 verb 枚举与数值范围,内容按不可信输入处理**(🔒审)。
- 动词映射表(冻结进 Level Schema 附录):
  | 规格动词 | 来源 |
  |---|---|
  | search | resolveSearchAction |
  | fight_start | 遭遇建立(encounter 赋值处) |
  | attack | resolveNpcAttackAction |
  | flee | emergencyRetreat / normalRetreat(payload.kind 区分) |
  | craft_attempt | resolveCraftAction(payload.success_rate + 结果) |
  | item_use | resolveUseItemAction |
  | item_hoard_tick | level_clear 时按背包快照结算(P0 可延后) |
  | npc_spare / npc_overkill | 遭遇结束判定(放走 / 溢出伤害阈) |
  | death | logPlayerDeath |
  | level_clear | 新增(§2.6) |
  | session_end / ui_read_ms / idle_ms / return_latency / hesitation_ms | 客户端 beacon |

### 2.5 Level Schema 冻结 + 关实体入库

- Schema 冻结即规格 §6.1 原文,加两条 DTSV 绑定注记:
  1. `event_deck[].npc` / `.item` **只准 ID 引用**(npc_pool.id / item_pool.id)+ 可选逐字段覆盖(hp/atk/def…),运行时以覆盖后的实体进结算——不复制整行(引用一律 ID 铁律)。
  2. `combat_mode.template_ref` 引用 `src/lib/server/kaleido/combatModes/` 注册表 key;P0 只有 `standard`(现行 calcDamage+combatPipeline 流程)。
- **执行映射**:startKaleidoRun 把 5 个 level 翻译成 raidPath 5 节点(level_seq ↔ chamberIndex),每节点携带 level_id;movePlayer/advanceChamber 复用现有推进,前进即入下一关。level payload 的 env_rules/formula_overrides 在**入关时**注入(P1 §3.4;P0 先不启用覆盖,值为空 = 中性)。

### 2.6 新动作(gameActions 分发器注册,🧭主对话热文件 —— 由 ⚙️游戏性实施,改前打招呼即可,本次中控已预批)

- `startKaleidoRun()`:活跃 run 幂等返回(单人同时至多 1 个 active run);建 runs 行(seed=uuid)→ 采样 5 关(P0 极简采样:chamber_templates 加权抽 5 + npc/item 按池;P1 换正式采样器)→ 建 rooms 行(gametype=KALEIDO_GAME_TYPE)→ 返回 roomId/runId。
- `level_clear` 判定:persistResolution 后检查当前 level 的 exit_condition(P0 支持 `boss_kill` / `survive_turns` / `collect` 三型);达成 → levels.status='played'、runs.current_seq+1、发 level_clear 事件、日志横幅;seq>5 → 收敛:runs.status='cleared'、converged_at、rooms 收尾(gamestate=2)。死亡 → status='dead' 同样收敛(R9:内容不减损)。
- `abandonRun()`:显式放弃(status='abandoned')。注意:**关闭页面 ≠ 放弃**(R11,回来接着打)。

### 2.7 P0 验收(闸门:事件在流 + schema 冻结)

1. 完整跑通一次 5 关 run(通关与死亡各一次),`player_events` 全动词有行、run/levels 状态机流转正确。
2. Level Schema v0.3 + 动词映射表冻结入库(本文件 + levels 表)。
3. 多人局回归:非 kaleido 局零行为变化(smoke + build,守卫全走 isKaleidoRoom)。
4. RLS 实测:anon 读不到他人 events/runs;anon/authenticated 写全拒。

---

## 3. P1 细化(回落层:种子关 + 采样器 + 战斗模板×bot)

> P1 闸门 = **无 AI 纯随机版可玩且成立;不过则终止项目**。一切服务于这一条。

### 3.1 采样器 `src/lib/server/kaleido/sampler.js`

- 纯函数:`sampleRun(seed, {levelCount=5, pools}) → levels[5]`;同 seed 同输出(种子回放的基石)。**禁 Math.random,用 seed 驱动 PRNG(mulberry32 级即可)**。
- 装配逻辑:content_pool(entity_type='level', enabled)按 provenance 分层抽样 → 不足则从 chamber_templates+npc_pool+item_pool 现场装配(套 5 个 archetype:遭遇关/搜索关/精英关/资源关/首领关);seq=5 强制 exit_condition='boss_kill'。
- 难度曲线:seq 单调抬 npc 档位与 event_deck 权重(参数表冻结在 sampler,P1 手调)。

### 3.2 种子关(10–15 个,手工策展)

- 由 Kanata + 中控在 admin 录入 content_pool(entity_type='level');内容原料 = 现有 npc_pool/item_pool/chamber_templates(ID 引用)。
- admin 侧:`_engine/` 注册 content_pool schema(🎨前端,复用内容引擎,预计一个 schema 文件 + 注册行)。
- 六纪元 lore 红线在 kaleido 内同样生效(文案短句、不解释只描述)。

### 3.3 战斗模板 × bot(P1 建 2–3 个)

- 注册表 `src/lib/server/kaleido/combatModes/index.js`:`{ key: { paramsSchema, resolveTurn(state, action, params) → state', bot(state, params) → action, describe(params) → 中文规则说明 } }`。
- P1 三模板:
  1. `standard` —— 现行流程原样包装(calcDamage + combatPipeline),bot=贪心(HP<30% 用药否则攻击)。
  2. `gauntlet` —— 波次战:N 波敌人(params.waves),波间可整备;bot=资源节奏型。
  3. `stance_duel` —— 三态克制(攻/守/技 猜拳加成,params 定克制倍率);**R6:入关展示克制表**;bot=频率对策型。
- `describe()` 输出即 R6 的「生效前展示」素材;bot 是 P2 模拟校验的前置资产,**P1 先用于自测平衡**(离线跑 clear_rate)。
- resolveTurn 全部纯函数(R1:同输入同输出;随机只走声明的 chance 字段 + run seed 派生的 PRNG)。

### 3.4 逐关规则覆盖(可变域 A 级)

- `gameEngine.js`:新增 `mergeGameRules(globalRules, levelEnvRules, formulaOverrides)`(纯函数);入关时(advanceChamber 到新 level)`clearRulesCache()` + merge 注入 —— **clearRulesCache 首批真实调用点**。
- evalFormula 变量注入补齐:统一注入集(atk/def/hp/maxHp/damage/turnCount/levelSeq/roll),修 01 §1 发现的 triggerPassives 缺 damage 问题(对现有多人局同样中性受益,单独小提交)。
- formula_overrides 白名单 target:`damage|defense|crit`(P1 只开这三,扩展走 DSL 版本化)。

### 3.5 P1 验收(硬闸)

1. 纯随机(采样器)5 关 run:Kanata 亲测「可玩且成立」;3 模板均出现且规则可读(R6)。
2. 种子回放:同 seed 两次 run,levels 逐字节一致。
3. bot 离线自测:三模板 clear_rate 可产出(为 P2 difficulty_band 校验积累基线)。
4. R1–R12 逐条复核定稿(对照实现打勾,偏差回改)。

---

## 4. P2 概设(生成管线 —— P1 闸门通过后细化)

- **LLM 层**:`src/lib/server/generation/llm.js`(Anthropic SDK,`ANTHROPIC_API_KEY` 仅服务端;GEN/EVAL/NAR 三个固定 schema 的调用封装,tool-use 强制 JSON)。模型:GEN/EVAL 用 claude-sonnet-5,NAR 文本质量优先可上 claude-opus-4-8(成本近期豁免,S1 蒸馏是结构解)。
- **触发(仓库无后台设施,01 §4)**:主泵 = **行动泵**——玩家进入第 N 关的动作 handler 内检查 N+1 job 状态,queued 则派发(serverless 内异步 fetch 自身 `/api/kaleido/generation/step`);兜底 = **Vercel Cron**(vercel.json,每分钟扫 stuck jobs)。回落序保证泵挂了也可玩(直接采样器)。
- **三级校验落点**:结构=AJV(Level Schema);语义=引用存在性(ID 查表)+ evalFormula 白名单静态检查 + 数值域;模拟=对应模板 bot 跑 M 次 → bot_clear_rate ∈ difficulty_band 且 flags 空。gate_results 全落 generation_jobs。
- **安全边界(🔒轨 P2 主题)**:LLM 产物 = 不可信输入;只有过三闸的 artifact 才可写 levels;NAR 输出过长度/字符白名单再入日志;prompt 注入面(玩家可控字段进 brief)需清单化审计。

---

## 5. 与现有系统的关系(冻结与共存)

- **多人搜打撤/BR/探针/结局/点数商店/职业**:全部原样保留、可玩,但**停止新内容投入**(维护态)。KALEIDO 是唯一新内容主线。
- **装备金字塔**:冻结(规格);kaleido 局不接装备实例,passive_skills/buff_pool 作为 DSL v1 原子库按需引用。
- **残片/悬案/宿敌等休眠预埋**:维持休眠,与 kaleido 无耦合。
- 旧 roadmap(00-roadmap.md)04/05/06 子系统:**冻结**,让位主线。
- 中性铁律边界声明:凡 `isKaleidoRoom()` 为假的路径,P0/P1 全部改动可证零行为变化(唯一例外:§3.4 evalFormula 变量注入补齐是全局 bugfix,单独提交单独验证)。

## 6. 未决项(需 Kanata,不阻塞 P0 开工)

1. 关切分 5×8–12min —— P0/P1 按 5 关实现,只影响采样参数,可后调。
2. NAR 声线/命名主题 —— P3 才消费。
3. GEN/EVAL/NAR 命名 —— 代码即用功能名。
4. 代号 —— 暂用 KALEIDO,UI 露出前定。
