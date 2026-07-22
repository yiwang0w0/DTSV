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

### 2.4 ✅ 闸门结论(2026-07-22 · Kanata 实测)

**垂直切片手感验收 = 通过**(Kanata 原话:「AVG 编舞的手感没问题」)。冷开局钩子(C4)/ 因果两拍 / 文字节奏 / GPT 编舞层(1000ms 填充 · 900ms 迁移 · 「状态」原位变按钮 · 640ms 体力展开)**全部成立** ⇒ 按 §2.3 **进入全量,见 §6**。

### 2.3 垂直切片验证通过 → 才决定是否全量
(全量 = C2 的 2500 行叙事 + 全 AVG 呈现 + 登录直进 + 剩余 seq3-5)。**先用最小成本看「感觉对不对」,再签大单。**

## 3. 登录直进 run(次要 · 垂直切片之后)

- `/play` 中转页(useAuth 守卫 → /api/kaleido/run → router.replace)+ login/register 跳转改(1 行)。
- **风险**(🔧 标):①**勿挂 RootShell onAuthStateChange**(token 刷新/切 tab 都 fire → 会从 admin/stash/多人页强拽进 run·砸全站)——redirect 须登录成功一次性 or /play 专页;②Supabase session 客户端态无 middleware;③留多人/admin 逃生入口。
- **多人 BR 去留** = 待 Kanata(登录直进 KALEIDO 后,多人还留不留入口)。

---

## 4. B4 披露后移设计(⚙️ · 治倒挂曲线 + 后半崩塌)

> 依据 `research-avg-disclosure-integrity.md` §4 最高杠杆修法(Kanata 采纳·B4)。**设计文档·不入库**。
> **核心原则**:把披露预算从前段挪一部分到**后段(seq4-5)**,且**每个后段披露绑到一个准备度兑现瞬间**——让"UI 长出来"的新鲜感与机制深度**重合**(治倒挂曲线),同时后半不再零新 UI(治崩塌)。
> **适用范围**:**全量 run(seq4-5)**,非 seq1-2 垂直切片(切片到不了 seq4)。切片先验"感觉对不对";此 3 件随全量实现。

### 4.1 三个后段披露(新增 ui_key · 绑准备度兑现)

| ui_key | 触发(动词/信号)| timing | 兑现瞬间(绑什么)| 呈现(玩家看到)|
|---|---|---|---|---|
| **`loadout_panel`** 整备面板 | 首次 craft 成功 **或** 首次用持久 stat 件(seq4)| after | **搜刮/合成变实力**的那一刻 | 累积战力(atk/def/maxHp 增量·药量)+ 合成产出 —— 让 seq4 备战窗口**看得见进度**(现 seq4 零新 UI)|
| **`prep_readout`** 准备度读数 | move 入 seq5 boss 关(`entering_boss_level`)| **before** | **boss 对峙**(R6 生效前展示)| 玩家战力 **vs** boss 需求的可读对比(能扛几拳/能打几拳·或就绪度 gauge)—— 让准备度闸门**可读**:玩家看得出自己够不够 |
| **`convergence_preview`** 收敛预览 | `boss_kill`(或 run 收敛前)| before | **run 高潮/收束** | 切收敛页前,本 run 收束的**预览成形**(战绩/图鉴)—— 给末关一个披露拍,而非硬切结算 |

- **绑兑现 = 反倒挂**:三件各落在**机制最厚处**(seq4 合成兑现 / seq5 boss 准备度 / 收束)——新鲜感不再在 seq1 最薄处独现、seq3 后干涸。
- **不占 guaranteed 投放预算**:这 3 件是 **UI 披露(ui_unlocks)**,非 event_deck `item_find`,不受 07 §... 的 `#guaranteed ≤ survive_turns−1` 约束(那条只管掉落)。

### 4.2 披露 timeline · 前后对比

- **现状**(research §2):~10/12 ui_key 在 seq1-2 触发;末机制披露 = stance_ui(seq3);**seq4-5(40% 行程)零新 UI** → 后半崩塌 + 倒挂。
- **B4 后**:seq3 stance_ui + **seq4 loadout_panel** + **seq5 prep_readout + convergence_preview** → 后半每关都有新披露拍,且绑机制兑现。**"UI 即进度"支柱撑过 60%**,不在 seq3 死。

### 4.3 边界与交接

- **守 B3**(doc 10 §0.B3):三件**全在现有循环内**(合成/战力/收敛)——**不含污染/Ω 倒计时/残片图鉴/buff/立绘上屏**(那些各需 +1 ui_key·按需后加)。
- **实现分工**(全量阶段):🔧 = 3 ui_key 触发判定 + 持久化(并入 06 注册表·05 §1.3 清单扩到 15 项);🎨 = 条件渲染 + 因果两拍动效;📖 = 3 条 nar_line + 面板文案(描述制)。⚙️(本轨)= 本设计 + `prep_readout` 的"准备度对比"用什么数值口径(可复用 08 §2 的 atk/def/hp vs boss 曲线)。
- **P1 闸门增益**:`prep_readout` 让准备度闸门**对玩家可读** → 直接支撑"可玩且成立"(玩家理解为何输/赢·不闷亏);后半披露拍支撑"到第二/第 N 个 UI 元素的时间"指标延伸到后段。

### 4.4 `prep_readout` 数值口径(⚙️ 供 🔧 实现 · 复用 08 §2 富路径模型)

> 目的:把"你够不够打"算成**玩家一眼能读**的对比。纯函数(玩家属性 + boss 属性 + 污染档),服务端可算、随解锁事件下发。
> 战斗模型 = D5=乙 富路径(08 §1):玩家命中 0.85 · 敌反击 `counter 0.3 × acc 0.85 ≈ 0.255/回合` · severe 污染时**玩家己伤 ×0.85** · 伤害 `max(1, floor(atk − def×0.5))`。

**四个量(全部整数·可直接上屏)**:

| 量 | 公式 | 含义(玩家读到的)|
|---|---|---|
| `N_hit` 需拳数 | `ceil(bossHp / max(1, floor(playerAtk − bossDef×0.5) × pollutionMult))` | **打倒它要几下** |
| `D_in` 它每下 | `max(1, floor(bossAtk − playerDef×0.5))` | **它一下打你多少** |
| `N_endure` 你能扛 | `floor((playerHp + potions×healPerPotion) / D_in)` | **你还能挨几下**(含药)|
| `N_taken` 预计挨 | `round((N_hit + potions) × 0.255)` | **这一路大约要挨几下**(0.255 = 富路径反击率)|

**就绪度** `R = N_endure / N_taken` → 三档上屏(避免裸数字压迫):
- `R ≥ 1.3` **稳**(有余量) · `1.0 ≤ R < 1.3` **勉强**(拼手气) · `R < 1.0` **不够**(大概率倒在这)

**基线对照**(boss 260/34/8·severe 污染·08 §2 曲线交叉验证):
- prepared(atk16/def9/hp130/5药):`N_hit≈26` / `D_in=29` / `N_endure≈9` / `N_taken≈8` → `R≈1.1` **勉强** ↔ 08 实测 74-86% 通关 ✓
- naked(atk10/def5/hp100/2药):`N_hit≈43` / `D_in=31` / `N_endure≈5` / `N_taken≈11` → `R≈0.45` **不够** ↔ 08 实测 0-1% ✓

**给 🔧 的落地注记**:①`pollutionMult` = severe(有效污染 80-99)取 0.85,其余 1.0(`pollution.js:251` 口径);②`healPerPotion` 取玩家当前恢复品档(修补剂 30 / 大补剂 60)加总,非固定 30;③三档阈值(1.3/1.0)是**设计旋钮**,可随平衡调;④只读不改状态,纯展示。**守 B3**:不上屏污染/Ω 数字,污染只作为 `pollutionMult` 隐式影响 `N_hit`。

---

## 5. 方向调整(2026-07-22 · Kanata 拍板:**复刻 GPT 呈现,主线仍在我方**)

**背景**:GPT 侧在 main 上推了 **19 条**(`3387077..b78ec93`,fast-forward 叠在我方工作之上·我方提交零丢失),已实现:
> ⚠ 归因订正(🔧 查证·2026-07-22):原文写「20 条 / `97e95bd..b78ec93`」有误——该区间**含我方自有提交** `3387077`(🔧 待命锚点,GPT 推送前已进 main)。凡按该区间得出的「GPT 改了 X」结论均须以 `3387077..b78ec93` 复核。
- **登录直进 run**(`src/app/play/page.js` + login/register 跳转改)、**解码入场转场**(`src/components/EntryTransition.jsx`)、**首页纯入口**
- **渐进 UI**:状态/体力**从对话浮现** → 对话停驻后**文字原位变按钮** → 体力在状况面板内展开(commit `f151924`/`76ca496`/`7a84fdf`)
- **项目改名「远星」**(`8a38df7`)、frontend-only 预览模式(`src/lib/runtimeMode.js`)
- **构建栈更换**:`next dev/build` → **`vinext`**;Next 14.2.21 → **16.2.6**;新增 **Vite 8 + @cloudflare/vite-plugin + worker/** + `.openai/hosting.json`(OpenAI Sites 托管)
- **改写 `KaleidoAvgView.jsx`(408 行)**(取代 🎨 原型)、新增 skill `.agents/skills/build-progressive-game-ui/`(含 `references/farstar-opening-spec.md` 精确到毫秒的交互不变量)

### 5.1 定位(Kanata 拍板 · 生效)

- **主线 = 我方六轨,部署继续走 Vercel**。
- **GPT = 分支同步开发** —— 其实现是**参考样板**,不是主线所有权;不把任何域交给它。
- **呈现层仍归 🎨**,但**以 GPT 的操作流程与呈现效果为复刻目标**(照着它的操作/呈现做,在我方主线上实现)。

| 域 | 归属 | 说明 |
|---|---|---|
| **呈现层**(AVG UI / 转场 / 渐进浮现) | **🎨(复刻 GPT 样板)** | 以 GPT 实现的操作流与呈现效果为标准,由 🎨 在我方主线实现;接我方 ui_unlocks 真数据 |
| 引擎(ui_unlocks / 种子关消费器 / 战斗 / seed) | 🔧 | GPT 未碰,继续供给 |
| 内容数值(种子关 / 经济 / 平衡) | ⚙️ | 同上 |
| 叙事(nar_line / 血肉) | 📖 + Kanata 自驱专线 | 同上 |
| 安全(RLS / 越权) | 🔒 | 同上 |
| 部署 | **Vercel(主线)** | GPT 的 Vite/Cloudflare/Sites 路径属分支线,不作主线构建 |

- 🎨 首个动作 = 读 GPT 实现 + skill → 产出**复刻方案**(哪些操作/呈现照搬、哪些需适配我方 ui_unlocks 真数据与 12 项 ui_key)→ 在我方主线实现。
- 原 §2.2 的取景框原型:**其呈现骨架成果保留**(转场/文字舞台/因果两拍/冷开局钩子已验),按 GPT 样板校准后并入主线实现。

### 5.2 待处理(Kanata)

1. **构建栈/部署走向未定**:线上 `dtsv.vercel.app` 仍是旧版(顶栏仍「远星函馆」),GPT 新构建未上线——`vinext build` 与 Vercel 的兼容性存疑。走 Vercel(Next)还是 Cloudflare/Sites 待定。
2. **skill 冲突条**:`.agents/skills/build-progressive-game-ui/SKILL.md` 要求「更新 `Readme_GPT`」——**与我方铁律冲突**(Readme_GPT 只读不改)。我方一律**跳过该条**,长期交互原则写入 `Claude/frontend/`。
3. ~~GPT 修改了 `Claude/engine/log.md`~~ —— **该条撤销**(🔧 查证:`3387077..b78ec93` 区间内 GPT **未碰**任何 Claude 侧文档;原命中的 log.md 改动是 🔧 自己的待命锚点提交 `3387077`,被我方区间口径误归因)。**不存在对称铁律事件。**

---

## 6. 全量推进(2026-07-22 · 闸门通过后解冻)

> 触发:§2.4 手感闸门通过。此前所有「缓到 Kanata 手感拍板」的项**全部解冻**。
> **叙事血肉(>2500 行)仍是 Kanata 自驱专线**,不进技术阻塞路径。

### 6.1 排序与分工

| # | 轨 | 内容 | 依赖 |
|---|---|---|---|
| 1 | ⚙️ | **SQL 链定稿**:kaleido 经济内容行(新道具/材料 6 散件)→ cadence 修(seq1-2 改指新散件)→ seq3-5 SQL(按 🔧 payload 批复:敌人单一来源 · boss 乙值 260/34/8) | 交 🧭 审 → 🧭 经 postgres MCP 执行 → seq3-5 点亮 |
| 2 | 🔧 | **D3 mergeGameRules**(seq3-5 规则关 · formula_overrides 白名单 damage/defense/crit + 入关 clearRulesCache)+ **B4 三 ui_key**(`loadout_panel`/`prep_readout`/`convergence_preview` 触发判定 + 持久化 · 06 注册表扩至 15 项) | D3 独立;B4 需 ⚙️ 的 prep_readout 数值口径 |
| 3 | 🎨 | **P2→P5**(nar_line 回数据层 / 12 ui_key 补齐(背包按 A 跳过) / 窄屏+移动化 / 收敛页+关间横幅)+ **真实模式登录直进**(转场 → `/api/kaleido/run` → AVG 真数据)+ **B4 三件渲染**(因果两拍) | B4 渲染依赖 🔧 触发 |
| 4 | 📖 | **B4 三条 nar_line** + 面板文案(描述制);叙事血肉 = Kanata 自驱专线 | — |
| 5 | 🔒 | 触发审:D3 白名单面 / B4 新 ui_key 持久化(RLS 沿用 profiles.ui_unlocks 守卫)/ ⚙️ 新 SQL 内容行 | 各项落地后 |

### 6.2 P1 闸门(全量后的下一道)

原 6 条不变(R1-R12 复核 / 同 seed 回放一致 / 3 模板 bot clear_rate / Kanata 亲测可玩且成立 / 「不哑」/ 「到第二个 UI 元素的时间」)。**seq3-5 点亮 + B4 落地后**具备完整实测条件。
