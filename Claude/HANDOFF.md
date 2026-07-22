# 🧭 停工交接 · 2026-07-23

> **本文件 = 恢复时的第一个入口。** 每次停工由 🧭 覆写。读完这一份 + `Readme_Claude` 就能接着走。
> main 停在 **`ad77007f`**。工作区唯一 untracked = `scripts/phase-25q-nemesis-pvp-death.sql`(**故意保持**,勿提交)。

---

## 0. 一句话

**KALEIDO(远星)主线在「step0/step1 阶段制 + Diegetic UI 教义」这套新结构上重建;设计层已定案并落档,实现层刚补完地基的一半。**
本轮把「触发到底产出什么」这个病根解了(要约/发现),把三条持久线分清了(UI 解锁 / 场景状态 / step 标记),并发现了一个地基级缺口(`d` 掉血机制引擎侧不存在)。

---

## 1. 各轨状态

| 轨 | session | 停工时手上 | 恢复第一步 |
|---|---|---|---|
| 🔧 引擎 | `local_4c83114c-4531-47a5-b4a2-3260d384c2ef` | 已交:周期保底 / 道具链三处 / P0 gate 9 步 / H3 修复 / 教义不变式门 / 12·13 两份报告。**未开工**:`d` 掉血机制、字段落点草案 | **`d` 掉血机制**(见 §3 第 1 条)—— 这是唯一缺的地基 |
| ⚙️ 内容数值 | `local_02f00369-c121-4e5e-bb48-ad34dae8bb5a` | 曲线定稿(d=4·方差±1·G=16·档2 阈 ≤12 拍)+ L 敏感度表 + 诱饵规则终版。**未做**:按新动作面重推曲线 | **重推曲线**(掉血口径已改,见 §3 第 1 条)+ 用药策略敏感度 |
| 📖 剧情 | `local_6f8937f6-e881-4f0e-9a6d-66815241ac60` | N1-N9 全交付,四项裁决已收口。**刚要开工**:step1 全量文案 | step1 全量文案(**已无阻塞**,同率旋钮已裁) |
| 🎨 前端 | `local_1d2b3cbf-ee47-4d66-841e-f0c74e92e5a3` | BUG-A/B 已推(`969f633f`)+ `smoke-immersive-route.mjs` 带 3 格负对照。**待命** | 等 P1-c(**必须与 🔧 同 PR 合**) |
| 🔒 安全 | `local_35e56c6e-13e0-493c-85da-d843d671eaba` | **无在飞任务**。ui_unlocks 列级守卫已上线且形状无关 | 无。新 DDL 出现时再拉 |

⚠ `send_message` **必须传完整 UUID**,短前缀报 `not found`。

---

## 2. 挂在 Kanata 身上的(唯一阻塞源)

**线上验收四条** —— 各轨本地占位 env 验不了真实账号态:

1. 转场只播一次(不再反复播图1画面)
2. 对局页无顶栏 —— ⚠ **重点看 `/login` 那一格**:🎨 判断 Kanata 看到的主要是登录卡片页上的顶栏,它在时间轴上比首页更早
3. 第二次进入不重播觉醒行 + 状况面板不再飞一遍
4. **新号首搜后 `log_panel` / `hp_bar` 是否照常浮现** —— 🎨 关停 stub-derive 后,服务端是否真在发这些键,只有线上能验。**不浮现 = 服务端没发,要 🔧 补**

**设计层没有卡在 Kanata 身上的东西。**

---

## 3. 已定但未落地(实现队列 · 按优先级)

### 1. 🔴 `d` 掉血机制 —— 唯一缺的地基
- **现状**:全仓只在 ⚙️ 的 harness 里有,**引擎侧零实现**。Kanata 定的 step1 核心机制不存在。
- **⚠ 口径已改**:不是「每次搜索扣 HP」,是「**负伤在持续流血,每个消耗性动作都在流**」(`TURN_ACTIONS` 那一族)。
- **连带**:`releaseEncounter` 必须纳入 kaleido 的消耗性动作(**kaleido-scoped**,多人守 Phase 37)—— 它现在是零回合成本,等于在计时器上开洞,理性玩家永不战斗。
- **费率全程同率**(`12 §1.3`):N7 的余量锚点公式假设单一费率,分段会让阈值在段边界错档。
- 数值从 `game_rules` 播种进 `gamevars.kaleido`,**与周期保底同范式**(路已铺好)。
- 分工:机制=🔧 / 数值=⚙️(重推中)/ 叙事框架=📖(⚙️ 去会签,已批)。

### 2. 🔧 字段落点草案(出给 🧭 审 → 审完才开 P1)
含 `offered` 落点、**step 标记落点**、存档点提交那一拍的**四者原子性**(`offered`/`discovered`/`step`/场景状态)、信封 `kind` 取值域。

### 3. P1 引擎内投影重构(按**存档点提交**语义)
账号列写入触发点 = **到达存档点写一次**,不是每动作。写源必须读独立命名的 `uiCommitted`,**严禁读渲染集**。

### 4. `kaleido_scene_state` 新表(DDL 待审)
⚠ **形状**:用 `restore_at`(NULL=永不),**不要** `reset_scope:'daily'|'permanent'` 两档枚举 —— 恢复周期是参数不是档位。
已定取值:**门=永不** / 灯=当天 / 炸毁区块=数天。

### 5. P1-c 行为变更批(🎨 + 🔧 **必须同 PR**)
渲染判据可收缩 / 冷开场后全集重同步 / 移除·被夺的呈现语言 / `statusActionReady` 解耦成逐行门 / 未 discovered 要约的常驻载体。**半批上线 = 引擎与画面互相打脸。**

### 6. 其余队列
- 🔧:E2E 碰 profiles 的做法(账号层至今零自动化覆盖)/ `ITEM_COLS` 补三个 delta 列 + admin 内容引擎 kind 选项已坏(`itemPoolPreview.js:20,34`)
- ⚙️:`atk_delta`/`def_delta` 补值(**列已建,28 行全 0**)—— 条件:加力件/加防件旧 `atk`/`def` 归零;**id24 一律不动**
- 📖:N3 §6 三项 → 死区告知设计(**放在基地的剧情里**,不做元层弹窗)
- 🎨:SSR 直链顶栏闪(建议的 CSS 路子,🎨 判断值不值)

### 7. 冻结(勿动)
`seq3-5 SQL` / `boss 曲线 260-34-8` / `cadence SQL` / `prep_readout` / `convergence_preview`。
**已救回**:`loadout_panel` 重锚到 step1 首次合成扩容件。

---

## 4. 已知风险 / 未验证

- **账号级持久化至今零 E2E 覆盖** —— E2E 用纯内存 uid,`profiles.id` FK 到 `auth.users`,那句 update 恒 0 行 no-op。而我们正要往账号层加存档点提交语义。
- **N7 兜底通道 `src/` 零实现** —— 法则一的公平性目前没有任何实现支撑。H1 通道设计稿已出(🔧,`12`),未落地。
- **教义三条硬约束只有一条真在守** —— `check-doctrine-invariants.mjs` 在字段缺席时 PASS 并打印「⏳ 待字段」,**不假装在守**。字段一落地自动强制。
- ⚠ **📖 的对抗核验 workflow 因月度额度上限全部失败**,本轮起改纯自查。**它后续的交付按"未经独立核验"看待。**(🧭 的 workflow 可能同样受限,恢复时先探一次。)
- `?kaleido=1` 直链硬加载仍有一次 SSR→hydration 顶栏闪 —— SSR 固有,已知未治。

---

## 5. 恢复时不用翻的铁律

- 只更新 `Readme_Claude`,**绝不动 `Readme_GPT` / `GPT.md`**;GPT 六件未碰
- `git add` **一律显式路径,严禁 `-A`**;`scripts/phase-25q-nemesis-pvp-death.sql` 保持 untracked
- 提交中文 + 尾签 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- 推 `git push origin claude/suspicious-solomon-598909:main`;推前 `git fetch origin && git rebase origin/main`
- **SQL 先审后经 postgres MCP 执行;DDL 必须先审**
- UI 改动**须 Kanata 线上实机验收**(各轨本地占位 env 验不了真实态)
- 📖 推送被 GPT 脏树挡 → 其提交由 🧭 cherry-pick 代传
- **多人局零行为变化**是红线;引用一律用 ID 不按名串
- 🧭 = 只拆解/派单/仲裁/验收,**不做具体开发**

### 两条本轮学到的方法论
- **转述另一轨的自述前,先核实产物真在仓库里。**(已犯两次:区间算错归属 / 把"跑过的检查"当成"提交了的脚本")
- **凡「修了 bug 顺手加断言」,都要跑一次负对照。** 本轮救了三次(ui_key 对拍 / H3 / 🔧 自曝的假断言)。

---

## 6. 核心文档

| 文档 | 内容 |
|---|---|
| `docs/plan/kaleido/11-diegetic-ui-doctrine.md` | **长期铁律**。三法则 / 要约·发现四态两层 / 门类判据 / 存档点提交 / 结构重置+死区(§8) / 决策记录(§7) |
| `docs/plan/kaleido/12-step-progression.md` | step 推进结构。step=具名事件推进的账号标记 / 三条独立作用域 / 里程碑「关上门」/ 掉血起点与同率 |
| `docs/plan/kaleido/13-position-system.md` | 🔧 位置系统与场景持久层勘察 |
| `docs/narrative/kaleido-n1~n9` | 叙事资产(n8=多单位框架,n9=step 载体对齐) |
| `Claude/gameplay/step1-survival-curves.md` | ⚙️ 掉血/投药/L 敏感度 |
