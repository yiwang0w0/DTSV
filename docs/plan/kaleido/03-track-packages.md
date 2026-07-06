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
