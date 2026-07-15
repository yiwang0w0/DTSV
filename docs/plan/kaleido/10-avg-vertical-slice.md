# KALEIDO · 10 AVG 垂直切片计划(2026-07-15 · Kanata 拍板)

> 方向:登录 → 转场 → 文字 AVG 空间,初始**只有一个搜索按钮**,整套系统随点击搜索**渐进浮现**(「UI 即进度」)。四轨可行性研究(🎨 前端 / 🔧 引擎 / ⚙️ 游戏性 / 📖 剧情)结论 = **可行、值得做**。研究出处:🎨🔧 各自 log.md;⚙️ `docs/plan/kaleido/research-avg-disclosure-integrity.md`;📖 `docs/narrative/kaleido-n6-avg-narrative-study.md`。

## 0. Kanata 决策(拍板 · 2026-07-15)

- **B1 · 「UI 即进度」定位 = 一次性惊艳开场**(非长期引擎)。它是账号级、约 10 分钟的首 run onboarding;veteran 一进局满 UI。撑重复游玩的引擎是底层「准备度 vs 贪婪」搜刮循环(09 §6.2)。→ 不为「让渐进披露可重玩」额外投入。
- **B2 · 「搜打撤」的「撤」= 收敛**(5 关推进到通关/死亡即离开这轮)。**不做**中途主动撤离带货(roguelite 式)——现引擎 extractPlayer 对 kaleido throw 保持,convergence 页已覆盖,零新增。
- **B3 · 「整套系统」边界 = 仅现有循环**(搜 / 打 / 移动 / 合成 / 背包 / 日志)。**暂不含**污染 / Ω 倒计时 / 残片图鉴 / buff / 立绘(各需 +1 ui_key,按需后加)。
- **B4 · 披露节奏 = 采纳「后移 + 绑准备度兑现」**(⚙️ 最高杠杆修法):后段披露绑到准备度兑现(seq4 整备面板 / seq5 boss 准备度读数 / 收敛预览),一改同治「倒挂曲线 + 后半崩塌」。
- **叙事血肉(>2500 行动态对白)= Kanata 亲自推进的独立线**(在剧情对话驱动 📖),**不进技术接通的阻塞路径**。垂直切片壳先用现有 nar_line(N3 12 条)+ 占位血肉。

## 1. 认清的成本真相(设计约束,非 bug)

- **C1** 渐进披露 = 一次性首 run 教程(veteran 满 UI,run2 起零贡献)。
- **C2** AVG 主体化 = 叙事量暴涨(一局 80% 屏幕时间是重复动作;高频文案桶 ≥15-20 句;总量 >2500 行 + Valve 式动态对白系统)= Kanata 自驱线。
- **C3** 倒挂曲线(前期机制薄却最新鲜 / 后期机制厚却无新意)→ B4 治。
- **C4** 冷开局无钩子(首次点击前裸按钮,10 秒跳出风险)→ 开局种一行静态觉醒文字(低成本)。

## 2. 落地 = 垂直切片(seq1-2)先行,不全量

### 2.1 不可谈判前置(A1 · 现在的唯一阻塞)
今日 build ADR 开局**惰性**(event_deck 零读者、seq1-2 `enabled=false`)→ 拿它评 P1 = 验错工件。前置:
1. **🔧 hook① 内容注入消费器落地**(event_deck item_find 消费 / 非 boss combatSetup.enemy 注入 / seq1 零战斗保障 / guaranteed 预算校验 / seedLevels `.eq('enabled',true)`)。
2. **seq1-2 种子关 `enabled=true`**(🧭 经 postgres MCP UPDATE,在 🔧 hook① 落地后)+ `scripts/kaleido-e2e.mjs` 重跑。

### 2.2 垂直切片范围(只做 seq1-2)
- **🎨** 独立取景框(`dev/kaleido-preview`,已能脱离 GameClientPage 单挂)原型 **AVG 壳**:转场(黑幕冷开场打底 + 能力设备 pollution_field 坍缩增强)+ 文字舞台(逐段淡入·贴底自动滚)+ **因果两拍**(nar_line 落舞台 → 对应 UI 件延迟「材质化」析出 → 件边框闪 nar 同色)+ **冷开局觉醒行**(C4)+ hp_bar「gauge-first」时序 + rules_card「门口告示」。先用现有 nar_line + 占位血肉。
- **⚙️** seq1-2 cadence 修(id27 列材料前 / seq1 `max_npcs=0` / 材料改指新散件 / 修 07 §1 陈旧 hp_bar=seq2 表述)保证 live 浮现序 = 首搜→[log,inventory,hp_bar]、首物(seq1)先于首遇(seq2);+ B4 披露后移设计稿。
- **验证点**:①冷开局有没有钩子(会不会 10 秒跳出)②「因果两拍」手感对不对 ③文字重复烦不烦(占位血肉先测节奏)。

### 2.3 垂直切片验证通过 → 才决定是否全量
(全量 = C2 的 2500 行叙事 + 全 AVG 呈现 + 登录直进 + 剩余 seq3-5)。**先用最小成本看「感觉对不对」,再签大单。**

## 3. 登录直进 run(次要 · 垂直切片之后)

- `/play` 中转页(useAuth 守卫 → /api/kaleido/run → router.replace)+ login/register 跳转改(1 行)。
- **风险**(🔧 标):①**勿挂 RootShell onAuthStateChange**(token 刷新/切 tab 都 fire → 会从 admin/stash/多人页强拽进 run·砸全站)——redirect 须登录成功一次性 or /play 专页;②Supabase session 客户端态无 middleware;③留多人/admin 逃生入口。
- **多人 BR 去留** = 待 Kanata(登录直进 KALEIDO 后,多人还留不留入口)。
