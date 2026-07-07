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
