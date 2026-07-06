# KALEIDO · 01 落地性核查(规格 ↔ 代码库逐条对码)

> 2026-07-06 · 🧭 中控 · 由 4 路只读核查(运行时核心/多人耦合/内容资产/遥测数据层·167 次工具调用)汇总。
> 结论先行:**规格 §10 资产映射基本成立,底盘复用可行**。`gameEngine.js` 真实存在(evalFormula 白名单/规则缓存/calcDamage 都在);单人房**今天就能跑**(无最少人数检查);`persistResolution` 是全动作统一收口(传感层一点接入)。
> 三个必须处理的落差:**① 体力系统是 wall-clock 的(违反 R4/R11)** ② 逐关规则覆盖层不存在(clearRulesCache 导出但零调用点) ③ 无任何 LLM 调用与后台任务基础设施(P2 需新建)。

## 1. 规格 §10 映射逐条验证

| 规格声称 | verdict | 实证(file:line) | 落差 |
|---|---|---|---|
| gameEngine.js 运行时核心 | ✅ exists | `src/lib/gameEngine.js:16-52` evalFormula 白名单沙箱;`:60-89` loadGameRules/clearRulesCache/getRule;`:103-132` calcDamage | 无 |
| evalFormula 白名单可作语义校验 | ✅ exists | 禁符号正则 + ALLOWED_VARS(atk/def/hp/…/roll) + `Math.*`,Function() 沙箱 | 变量注入不同步:`damage` 只在 combatPipeline modifier 注入(`combatPipeline.js:109/116/123`),triggerPassives(`equipmentEngine.js:568`)未注入 |
| game_rules 为 env_rules 全局默认层 + clearRulesCache 关卡注入钩子 | ⚠ partial | `_rulesCache` 单例 + joinRoom 调 loadGameRules(`gameActions.js:2550`) | **clearRulesCache 导出但全仓零调用**;无逐关/scope 覆盖梯度;formula_overrides 机制不存在 → P1 建 |
| buff_pool / passive_skills = DSL v1 原子库 | ✅ exists | `equipmentEngine.js:552-625` triggerPassives(event, attacker, defender, passiveSkills, buffPool);6 触发事件 × 6 效果类型;stage/priority/condition_formula 三列(phase-43) | 内容休眠:0/17 tier 绑定 passive → 架构在、内容空 |
| 结算管线 | ✅ exists | `combatPipeline.js:30` STAGES(add/mult/invincible/special/limit/insurance/seckill) + `:41-42` OFFENSIVE/DEFENSIVE_STAGES;`gameActions.js:1627-1657` applyCombatPipeline,8 处接线 | 无 |
| 伤害公式(机械默认层) | ✅ exists | calcDamage 规则驱动:`damage_formula='atk*atkMultiplier - def*defMultiplier'` + 暴击,max(1,dmg);combatStats.js:9 三乘区 | 无 |
| **回合制(R4 前提)** | ❌ **conflict** | `src/lib/stamina.js` 体力 = **wall-clock 毫秒行动经济**,非回合制 | **违反 R4(禁实时/计时)与 R11(离线零变化)** → kaleido 模式必须改回合计数(见 02 §2.2) |
| npc_pool / item_pool 种子池 | ✅ exists | npc_pool: hp/atk/def/exp/level/entity_type/hostile/tradeable/pollution_on_kill/spawn_weight/min_pollution/chamber_template_ids;item_pool 含 on_use_buff_ids/bundle_count | 无 |
| map_config.weather + getSearchChances = env_rules 原型 | ⚠ partial | `gameEngine.js:267-277` getSearchChances(rules) 读全局 game_rules 的 search_*_chance(调用点 `gameActions.js:1357`) | weather 存于 chamber_templates 但**代码不读取**;无按关覆盖 |
| Admin 编辑器 → content_pool 策展 | ✅ exists | `_tabs/` 37 文件;可复用:ItemsTab/NpcsTab/ChambersTab/EquipmentSeriesSection/ClassesTab/EventsTab + `_engine/` schema 驱动引擎 | KALEIDO 需新增 content_pool/levels 策展 tab(schema 注册即可) |
| 日志 UI → NAR 通道 | ✅ exists | gamevars.log 条目 `{text, type, time}`(`roomState.js:268-273` createLogEntry) | NAR 需要可归因扩展(见 02 §2.4) |
| 装备金字塔冻结 | ✅ 符合 | equipment_series/tiers/instances 在;被动内容 0 绑定 | 按规格冻结,不再投入 |
| Realtime 移出关键路径 | ✅ 可行 | 订阅点单一:`GameClientPage.jsx:256-274`;action API 同步返回全量状态(`route.js:32`) | 单人模式直接用动作返回值刷新,跳过订阅 |

## 2. 单人化壳核查(方案抉择依据)

- **无最少人数检查**:`roomState.js:406-409` validnum>0 即启动;`:424-435` validnum===1 的死亡/胜利分支**已存在**。单人房今天就能跑通。
- 多人机制在单人局的处置:PvP(attackPlayer)=自然不可达;corpses=无害;**探针(tryEncounterProbe `gameActions.js:2992-3008/3141-3167`)=会主动注入他人探针遭遇,必须显式关**;结局 endings(`gameActions.js:673`)=需关(kaleido 用自己的 exit_condition);extractPlayer=需关(run 终止语义不同)。
- raidPath 房间级共享(`gameActions.js:2654-2695`),单人即私有;BR 子系统另有 per-player 路径先例(`:2367-2531`)。
- **结论:方案一(复用 rooms+gamevars+/game/[id],新 gametype=整数 30,见 02 §2.1 勘误——gametype 为整数列,字符串不可行)**,改动面最小,P1 闸门(纯随机版可玩)最快。方案二(新 runs 表 + /run/[id] 路由)中的 runs 表**仍然要建**——作为 KALEIDO 域的真源,room 只是执行载体(见 02 §2.3)。

## 3. 传感层核查

- **统一收口存在**:`gameActions.js:615-689` persistResolution / persistResolutionWithPollution,20+ 动作全走此处 → player_events 一点发射。
- 死亡已有独立收口:`deathLog.js:36-66` logPlayerDeath(5 种 cause 枚举)。
- 动词映射:search/attack/item_use/craft 有现成 action;flee=emergencyRetreat/normalRetreat;fight_start=遭遇触发;**level_clear 无对应概念(需新建)**;ui_read_ms/idle_ms/session_end/hesitation_ms 为**客户端动词**(需 beacon 路由)。
- 事件表设计先例:`br/events.js:72-99` appendEvent —— append-only + CAS 折叠,player_events 直接镜像此设计。

## 4. 数据层与基础设施核查

- **RLS 模板可照抄**:phase-51 三层模式(RLS 开 + 公开读 + service_role 写;服务端 `adminContent.js`;`/api/admin/*` = createServerSupabase + getRequestUser + isAdmin 三段闸口)。KALEIDO 六表照此,私有表(player_events/player_profile/runs/levels/generation_jobs)再加 owner-read。
- **后台任务:missing**。无 pg_cron / Edge Functions / Vercel cron / QStash 任何痕迹 → 生成管线触发需自建(02 §4.2:行动泵 + Vercel Cron 兜底)。
- **LLM 调用:missing**。无 ANTHROPIC/OPENAI 凭证与调用 → P2 新建 `src/lib/server/generation/`。
- service_role 工厂:`serverSupabase.js:12-18` createServerSupabase;鉴权:`:38-51` requireRequestUser。

## 5. 核查修正后的 §10 映射(实现以本表为准)

| 规格词 | 真实落点 |
|---|---|
| gameEngine | `src/lib/gameEngine.js`(evalFormula/loadGameRules/calcDamage)+ `combatPipeline.js` + `gameActions.js` 分发 |
| env_rules 注入钩子 | loadGameRules **+ 新建 mergeGameRules(global, levelRules)**;clearRulesCache 在关卡切换点补调用 |
| 日志 UI | gamevars.log(createLogEntry)→ GameClientPage 日志面板 |
| 关(level) | 新 levels 表(Level Schema 实例);执行时映射为 raidPath 单节点(02 §2.5) |
| 回合 | **新建 per-level turnCount(动作计数)**;kaleido 模式停用 wall-clock 体力 |
