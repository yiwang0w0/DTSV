# KALEIDO · 03 三轨工作包(P0/P1 派单)

> 2026-07-06 · 🧭 中控 · 依据 `02-detailed-design.md`。各轨开工前先读:`00-spec-v0.3.md` + `01-groundtruth.md` + `02-detailed-design.md` + `07-parallel-tracks.md` §0/§1/§3(红线/推送/热文件协议不变)。
> **旧 backlog 处置**:⚙️P5 payload 瘦身**暂停**(单人模式无广播压力,P2 后再评估);🎨移动化 P1-P4 与色板收敛**继续**(kaleido 也是移动优先的浏览器游戏);🔒 phase-52 广义 RLS 扫描**继续**(底盘共用);旧 roadmap 04/05/06 冻结。

---

## ⚙️ 游戏性 —— KP0-S「服务端核心」(第一棒 · 最大件)

**目标**:kaleido 单人 run 端到端可跑(采样关卡→逐关推进→通关/死亡收敛),事件在流。
**交付物**(顺序即建议提交序):
1. `scripts/kaleido-p0-schema.sql` —— 六表 DDL+RLS(02 §2.3 照抄起步)。**写好先不跑**,发🔒审;审毕由🔒经 postgres MCP 执行。
2. `src/lib/constants.js` GAME_TYPES+KALEIDO 块;`roomState.js` isKaleidoRoom + turnCount 默认值。
3. gametype 守卫 5 处(02 §2.1 表;全走 isKaleidoRoom)+ 体力豁免(02 §2.2)。
4. `src/lib/server/kaleido/events.js` + persistResolution/logPlayerDeath 发射点 + 动词映射(02 §2.4;只对 kaleido 局发射)。
5. `startKaleidoRun` / level_clear 判定 / `abandonRun`(02 §2.6;P0 极简采样 5 关)。
6. `POST /api/kaleido/beacon`(白名单动词+尺寸上限;鉴权 requireRequestUser)。
**热文件授权**:gameActions.js/roomState.js/constants.js 改动**本次已预批**(中控拍板);推前 rebase,小步提交。
**完成标准**:02 §2.7 四条全过;smoke+build ✓;多人局零行为变化自证。
**接着做 KP1-S**:sampler.js(seed 确定性)+ 3 战斗模板×bot + mergeGameRules 逐关覆盖 + evalFormula 变量注入补齐(02 §3;变量注入单独小提交)。

## 🎨 前端 —— KP0-C「单人壳 UI」(可与 KP0-S 并行起步,联调靠后)

**目标**:玩家从大厅一键进单人 run,对局页 kaleido 模式干净可用(手机优先)。
**交付物**:
1. `/rooms` 加「单人出勤」入口卡(调 startKaleidoRun → 跳 /game/[id];在 KP0-S 落地前可先做 UI + mock)。
2. GameClientPage kaleido 分支:隐藏 玩家列表/PvP/探针卡/撤离入口;顶部关卡头(第 N/5 关 · turnCount · exit_condition 中文描述);不建 realtime 订阅,动作返回值刷新(01 §2)。
3. 关间横幅(level_clear)+ 收敛页(通关/死亡:本 run 摘要,图鉴占位)。
4. **R6 规则可见**:入关「本关规则」卡(env_rules/formula_overrides/combat_mode.describe() 摘要)。
5. admin:`_engine/` 注册 content_pool schema(种子关策展用,复用内容引擎)。
**红线**:UI 改动连浏览器 390×844+桌面截图验证;kaleido 分支不改多人局渲染路径。移动化 P1-P4/色板收敛照旧推进。
**完成标准**:手机上完整打完一次 run 截图链;多人对局页回归无变化。

## 🔒 安全性 —— KP0-X「数据层安全 + 校验地基」(与 KP0-S 交错)

**目标**:六表安全落库;传感层与未来生成管线的信任边界立起来。
**交付物**:
1. 审 `kaleido-p0-schema.sql`(RLS:私有五表 owner-read+service-write、player_events 无 UPDATE/DELETE 策略、content_pool 公开读);审毕经 postgres MCP 执行并在文件头标「已应用」。
2. 审 `/api/kaleido/beacon`(不可信输入:动词白名单/payload 尺寸/频率限制)+ startKaleidoRun 防刷(active run 幂等 + 建 run 频率)。
3. **evalFormula 白名单对抗审计**(P2 语义闸的地基):构造注入用例集(原型链/构造器逃逸/Function 逃逸/超长公式)落 `scripts/smoke-evalformula-adversarial.mjs`,现在修得掉的现在修。
4. ANTHROPIC_API_KEY 处理规范预研(.env.example 占位 + 仅服务端使用约定,P2 用)。
5. phase-52 广义 RLS 扫描照旧(顺带把 contracts/player_contracts 孤表收掉)。
**完成标准**:六表 RLS 实测(anon 读他人数据拒/写全拒);对抗用例全绿;beacon 压不垮。

---

## 集成顺序与依赖

```
🔒审 schema ─► 🔒执行 schema ─► ⚙️ 4/5/6 联调 ─► 🎨 联调(去 mock)─► P0 验收(中控)─► KP1
⚙️ 1(写SQL) ┘        ⚙️ 2/3(守卫,不依赖表)可先行     🎨 1/2/3/4(UI+mock)全程并行
```
- 冲突面:⚙️ 与 🎨 都碰 GameClientPage —— **🎨 只动渲染分支,⚙️ 不碰 UI**(新动作的客户端调用由 🎨 接);碰前互报。
- 全轨完成后由中控做 P0 验收(02 §2.7),过闸才开 KP1。

---

# KP1 派单(2026-07-07 · P0 已过闸,E2E 20/20)

> P1 = 回落层,规格硬闸:**无 AI 纯随机版可玩且成立,不过则终止项目**。细化设计 = 02 §3。共守:kaleido 状态机改动后必跑 `npx tsx scripts/kaleido-e2e.mjs`(临时 tsconfig paths + .env.local 凭证,脚本头注有跑法)。

## ⚙️ KP1-S「回落层核心」(第一棒)
1. **采样器正式化**(02 §3.1):5 关型 archetype(遭遇/搜索/精英/资源/首领)+ 难度曲线;优先消费 content_pool(entity_type='level') 种子关,不足才现场装配;seq=5 强制 boss_kill。难度口径按 04 语义注记(进关 move 占 1 回合)。
2. **3 战斗模板×bot**(02 §3.3):combatModes 注册表 {paramsSchema, resolveTurn(纯函数·seed PRNG), bot, describe};standard/gauntlet/stance_duel;bot 离线跑 clear_rate 基线。
3. **逐关规则覆盖**(02 §3.4):mergeGameRules(global, levelEnvRules, formulaOverrides) + 入关 clearRulesCache 调用点;formula_overrides 白名单 damage|defense|crit。
4. **evalFormula 变量注入补齐**(01 §1 缺 damage;全局 bugfix,单独小提交单独验证)。
5. **R3 收尾**:kaleido 局战斗随机改走 run seed 派生 PRNG(多人局不动)。
6. **种子关起草 12-15 个**(entity_type='level', provenance.source='seed';ID 引用现有 npc/item/chamber;六纪元文案红线)→ Kanata 在 admin 审改定稿。

## 🎨 KP1-C「模板交互 + 打磨」
1. stance_duel 三态出招 UI(R6:入关展示克制表)+ gauntlet 波次界面(consume ⚙️ describe())。
2. R6 规则卡接真数据(env_rules/formula_overrides/combat_mode 摘要)。
3. 收敛页打磨(为 P4 图鉴预留结构)。
4. 移动化 P2(对局页响应式)照旧并行。

## 🔒 KP1-X「纯函数审 + 52b 铺开」
1. resolveTurn 纯函数审(R1:同输入同输出;随机仅声明字段+seed PRNG)。
2. **52b 剩余批铺开**(Kanata 已在主对话批准「按推荐」):placement 四表 + 客户端读写 6 表 + 仅读 3 表,照 phase-51 范式分批。
3. kaleido-e2e.mjs 回归脚本安全复核(凭证读取面/清理完备性)。

**P1 闸门**(不过不进 P2):Kanata 亲测「可玩且成立」/ 同 seed 回放 levels 逐字节一致 / 3 模板 bot clear_rate 基线产出 / R1-R12 逐条复核定稿。

---

# KP1-N 剧情轨派单 + 结构调整(2026-07-07 · Kanata 拍板:剧情 = 第二主轴)

> 背景:P0/P1 交付为纯机制循环(搜索/战斗/推进),叙事层为空 —— 跑偏纠正。规格里叙事本是一等公民(§5.5 NAR/R7 输出通道/§5.10 收敛/run 大纲),中控原拆解把它整体推迟到 P3,错误。**静态叙事层提前进 P1**:纯随机版的「可玩且成立」,"成立"包含"不哑"。
> **P1 闸门增补第 5 条**:静态叙事层就位 —— 开场/关间/收敛/种子关文案 lore 对齐,日志有声线,纯随机版不"哑"。

## 📖 剧情 —— KP1-N「叙事地基」(第二主轴 · 立即启动)

**定位**:KALEIDO 叙事域 owner + 全项目 lore canon 守护(六纪元红线)。初期纯文档+数据文案,不动代码;需要接口/挂载点找 🧭 仲裁。
**归属**:`docs/narrative/**`(新家)、种子关/敌人/道具/关卡的文案字段(经 content_pool·admin 或 SQL 审后入库)、NAR 声线与 prompt 设计(P2/P3 实现的全部前期准备)。
**交付物**:
1. **N1 世界观定位提案**:KALEIDO run 与六纪元宇宙(泡泡/Ω-段/PI 引导者)的关系 —— 2-3 案(同宇宙新切面 / 松耦合引用 / 独立世界观)+ 推荐 + 各案对现有种子内容(npc/item/chamber 文案)的复用度评估 → **Kanata 拍板**(即规格未决项 2/4 的地基)。
2. **N2 NAR 声线提案**:2-3 种声线,各配 6-8 条日志文本小样(开场/搜索/战斗/受伤/过关/死亡/收敛各一)→ Kanata 选型。守 R7 精神:只叙述可验证行为事实,不评判人格。
3. **N3 P1 静态叙事层设计**:文本挂载点清单(run 开场叙事 / 关间横幅 / 收敛页 / R6 规则卡叙事框 / 日志行)+ 每类写作规范(短句·不解释只描述·机制/叙事双频道隔离)→ 与 🎨 对齐挂载点、与 🧭 定数据形状。
4. **N4 种子关文案**(与 ⚙️ D6 分工):⚙️ 出结构 payload(exit/combat_mode/event_deck/难度)+ 校验;📖 填 name/description/入关文本/敌人命名/氛围行;合并后 Kanata admin 审改定稿。12-15 关全量。
**红线**:不动 Readme_GPT;N1 若定同宇宙则六纪元 canon 全束缚(泡泡用语/F01-F15 不可减);文案一律走数据不硬编码进组件;提交协议同全轨(中文信息+尾签+显式路径+推前 rebase)。

## 结构调整(其余三轨,随恢复令生效)

- **⚙️ D6 改分工**:只做结构 + 校验(含「种子 boss 关缺 combatSetup.enemy 即挡」),文案字段留槽;LW-3/D3/D5 照旧队列。
- **🎨 增一项**:与 📖 对齐 N3 挂载点(开场叙事位/收敛页叙事位/横幅文案位),接口数据化(props/字段),不接受硬编码文案;1b 三态交互/移动化 P2 照旧。
- **🔒 无变化**:待触发审 + E2E 脚本复核(低优)。

---

# KP1 派单重切(2026-07-07 · 六会话结构 · Kanata 拍板)

> 职责正本清源(07 顶部横幅 ②③):**🔧 引擎轨**(新)承接全部服务端/状态机/管线代码;**⚙️ 游戏性轨 = 内容与数值设计**(道具/敌人/数值/合成树/物品池,产出以数据为主)。本段取代上文 KP1-S 段的剩余项分配;已完成项(D4/D2/D1/LW-1/LW-2)归档不变。

## 🔧 引擎 —— KP1-E「回落层引擎收尾」(接手原 KP1-S 剩余)
1. **LW-3 gauntlet 波次推进层**(裁决 C:波次编排在 kaleido 推进层,复用富战斗;live-wiring 最后一块)。
2. **D3 mergeGameRules 逐关规则覆盖** + 入关 clearRulesCache 调用点(formula_overrides 白名单 damage|defense|crit)。
3. **D5 R3 收尾**:kaleido 局战斗随机走 run seed 派生 PRNG(多人局不动)。
4. **E2E 状态机资产共管**:改状态机必跑 `scripts/kaleido-e2e.mjs`(无 service key 则 send 🧭 代跑);LW-2 的 stance_duel 断言由 🧭 补。
5. 承接 ⚙️/📖 的引擎钩子需求(经 🧭 仲裁)。
**归属**:`src/lib/server/kaleido/**`、`gameActions.js`(主归属)、combatModes、未来 P2 生成管线。红线:isKaleidoRoom 守卫纪律、多人局零行为变化自证、软锁教训(遭遇/体力/lifecycle 交界逐条推演)。

## ⚙️ 游戏性 —— KP1-G「内容与数值」(新职责首单)
1. **D6 种子关(结构+数值部分)**:12-15 关的 archetype/exit_condition/event_deck/敌人数值配置(文案槽留给 📖 N4;「boss 关缺 combatSetup.enemy 即挡」的校验需求提给 🔧)。
2. **难度与平衡核算**:seq1-4 搜刮期望战力增益 vs seq5 boss 强度(实测数据点:裸默认属性 8 次交换死于 boss);产出 = 数值调整方案(npc 数值/掉落权重/难度曲线参数),经 🧭 审后入库。
3. **kaleido 敌人池与道具池**:npc_pool/item_pool 面向 5 archetype 的内容盘点与补录(敌人梯度/道具功能覆盖:回复/增益/战术)。
4. **掉落表/物品池设计**:event_deck 权重方案 + 关内搜索掉落经济(玩家资源曲线支撑 boss 战)。
5. **合成树(kaleido 局内)**:基于现有 item_recipes 引擎设计局内合成链(材料→战术道具),纯数据。
**产出形态**:一律数据(admin 编辑器或幂等 SQL 经 🧭/🔒 审后入库)+ 数值设计文档(docs/plan/kaleido/ 下);**不动引擎代码**,要钩子找 🔧。

## 其余两轨(恢复令随发)
- **🎨**:1b 三态出招交互(协议已定 `{action:'attackNpc', stance}`)→ N3 挂载点对齐(📖)→ 移动化 P2。
- **🔒**:待触发审(🔧 LW-3/D3 落地后)+ E2E 脚本安全复核(低优)。
