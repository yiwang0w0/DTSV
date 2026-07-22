# KALEIDO · 09 D6 经济线(⚙️ KP1-G ③④⑤ · 敌人池/道具池/掉落表/合成树)

> 2026-07-08 · ⚙️ 游戏性轨 · 🧭 分配号段 09。依据:`08-d6-balance.md`(D5=乙 战力预算 §4)、`07-d6-seed-levels.md`(seq 结构)、现有 `item_pool`/`npc_pool`/`item_recipes` 引擎。
> **目标**:把 08 §4 的"准备度曲线"落成具体内容 —— kaleido 专属敌人梯度 + 道具经济 + 掉落表 + 局内合成树,使**彻底搜刮 seq1-4 → prepared 战力**(atk16/def9/hp130/5药)成立。
> **产出形态**:纯数据 + 设计文档;**不写引擎代码**。道具/敌人**新增行**(不改多人现有行),经幂等 SQL 审后入库。**文案(名/描述)归 📖**,本文只出功能标签 + 数值。
> **状态**:首稿。数值经 🧭/🔒 审 + Kanata 亲测(P1 gate 曲线校准)后入库。

---

## 0. 框架(为何要新增 kaleido 专属内容)

- **现 item_pool/npc_pool 是多人标定,kaleido 公式下不可用**(07 §0.4):多人最弱敌 350/80/40、恢复品 heal300、防御液 def+50 —— 对 kaleido 玩家(10/5/100·`dmg=max(1,floor(atk−def·0.5))`)全爆表。
- **∴ kaleido 需自有内容行**:新增 npc_pool/item_pool 行(新 id·additive·多人零影响),seq 种子关 event_deck/combatSetup 引用这些新 id。现 07 种子关暂引用多人 id 作占位(效果偏大),本文出终值后**回指新 id**(seq1-2/seq4 event_deck 的 SQL 随之改一版·审后)。
- **战力预算(08 §4)** = 本文设计目标:seq1-4 彻底搜刮 → `+6 atk / +4 def / +30 hp / +3 药`。

---

## 1. ③ kaleido 敌人池(梯度 · 富路径口径)

> 富路径:玩家 85% 命中、敌反击 0.255/回合、severe 污染降玩家己伤 15%。敌"威胁"= 反击期望伤害。梯度按 seq 抬。**名 → 📖**(本文用功能标签;seq1-5 已定敌名见 07)。

| 档 | 用途(seq/archetype)| hp | atk | def | 玩家每击伤敌 | 反击期望伤玩(vs def5)| 已定敌(07)|
|---|---|---|---|---|---|---|---|
| T0 微弱 | seq2 首战 gauntlet wave-1 | 15-20 | 5-7 | 1-2 | ~9 | ~1/回合(0.255×~4)| 那东西 18/6/2 |
| T1 轻 | seq2-3 encounter/杂兵 | 35-55 | 9-12 | 3-4 | ~7-8 | ~2.5/回合 | — |
| T2 中 | seq3-4 elite/resource | 80-100 | 14-17 | 4-6 | ~5-7 | ~3.5/回合 | 那家伙 85/14/4 · 那东西 90/16/5 |
| T3 重 | seq4 硬杂兵/精英变体 | 110-140 | 18-22 | 6-8 | ~4-6 | ~4.5/回合 | — |
| **Tboss** | seq5 boss | 240-280 | 32-36 | 7-9 | ~3-5 | ~8/回合(vs prepared def9)| 黑里的那个 260/34/8 |

- **变体(run 间多样性·待 🔧 钩子② seed 洗牌)**:每档 2-3 个数值近邻敌(±10% hp/atk),供种子关池扩到 12-15 关时轮换。seq1-5 固定关先各用 1 个(已定)。
- **archetype 战斗模型绑定**:elite=stance_duel(combatModes·LW-2)、encounter=gauntlet(LW-3 待)、其余=standard(富路径)。敌数值同档跨模型可复用(伤害公式一致)。
- **def 上限守则**:敌 def 勿超玩家 atk×2(否则玩家每击回落 min dmg=1,战斗拖沓)。T2 def≤6(玩家 atk≥12 时每击≥9);boss def8(prepared atk16 每击≥12)。

### 1.1 变体池(每档 2-3 个 · 供 12-15 seed 关 run 间变体 · 待 🔧 钩子② seed 洗牌)

> 数值变体(±10% 邻域);**名 → 📖**(§7.2)。seq1-5 固定关各用已定敌;变体供 seq3+/后续 run 轮换。

| 档 | 变体(hp / atk / def)| 已定+命名(seq)|
|---|---|---|
| T0 微弱 | 16/5/1 · **18/6/2** · 20/7/2 | 那东西(seq2)|
| T1 轻 | 40/9/3 · 48/11/3 · 55/12/4 | —(全待命名)|
| T2 中 | **85/14/4** · **90/16/5** · 98/17/6 | 那家伙(seq3)· 那东西(seq4)|
| T3 重 | 115/18/6 · 128/20/7 · 140/22/8 | —(全待命名)|
| Tboss 首领 | 245/32/7 · **260/34/8** · 275/36/9 | 黑里的那个(seq5)|

- 加粗 = seq1-5 已用+已命名;其余待 📖 命名 + 🔧 seed 洗牌接入后进种子关池。
- 变体守 §1 def 上限守则;跨模型(standard/gauntlet/stance_duel)数值可复用(伤害公式一致)。T3 140/22/8:玩家需 atk≥16 才每击≥12(seq4 solid+ 达标)。

---

## 2. ④ kaleido 道具池(战力源 · 效果值)

> 新增 item_pool 行(kaleido 尺度)。**名/描述 → 📖**;本文出 kind/效果值 + 功能标签。效果字段沿用 item_pool 现有列(atk/def/heal/effect/kind)。

### 2.1 持久强化件(run 内永久 · 支撑准备度曲线)

| 功能标签 | kind | 效果 | 设计意图 |
|---|---|---|---|
| 攻击强化件 | equip/consumable(持久) | +2 atk | 3 件 → +6 atk(达 prepared)|
| 防御强化件 | 同 | +2 def | 2 件 → +4 def |
| 容量扩展件 | 同 | +15 maxHp(并补满 15)| 2 件 → +30 hp |

- **持久增益机制(🔧 答复定稿·2026-07-08)**:**atk/def 永久强化现成** —— item_pool 的 atk/def 字段经 `resolveUseItemAction`(gameActions.js:2321/2326)直改玩家属性(非计时 buff);攻击/防御强化件即用此,**可定稿**。**maxHp 需新字段 `maxHpDelta` + 引擎钩子**(🔧 已接入工作包)→ 容量扩展件待此落地。**恢复件走 `hpDelta`**(非 staminaDelta —— kaleido 已排除体力)。

### 2.2 消耗品(kaleido 尺度)

| 功能标签 | kind | 效果 | 备注 |
|---|---|---|---|
| 恢复剂(小)| consumable | heal 30 | = 玩家 1 瓶药口径(baseState heal 默认 30);replaces 多人 heal300 |
| 恢复剂(中)| consumable | heal 60 | 后段掉落 |
| 战术·过载脉冲 | consumable | effect: 一次性 +100% 本回合伤害(burst)| 合成产物(§4)·给"差一口气"玩家翻盘(08 §2.1 软化杠杆)|
| 战术·稳定护盾 | consumable | def +5 计时 3 回合(buff)| 合成产物·boss 战减伤 |

### 2.3 材料(🧭 裁决:新增 kaleido 专属行 · 不复用多人)

**⚠ 📖 抓到 canon 泄漏**:多人材料 `深界情报`(id16)是**第六纪元概念,绝不得现于失衡时代(kaleido·第三纪元)玩家面**;`语言压缩算法/锚点稳定协议` 亦过技术、violate 背包日常词原则(05 §0.4)。**裁决:kaleido 合成材料新增专属行**(全新 📖 命名·失衡时代口吻),多人 id13-18 原样不动。📖 N5 出 **6 散件**(名 + 气质),配方语义(谁配谁)由 ⚙️ 按气质定:

| 散件(📖 N5)| 气质 | kind | 配方去向(§4·📖 co-align)|
|---|---|---|---|
| 碎块 | 硬/结构 | material | 强化件(加力)|
| 卡扣 | 连接/扣紧 | material | 强化件(加防)|
| 线圈 | 蓄劲/绷着 | material | 顶力剂(burst)|
| 垫片 | 软/缓冲 | material | 撑住剂(减伤)|
| 管段 | 通道/接续 | material | 扩容件 |
| 芯子 | 核心/被围 | material | 扩容件 |

- **co-align 铁律(📖)**:软/缓冲(垫片)喂减伤,蓄劲(线圈)喂 burst,硬/连接(碎块/卡扣)喂强化 —— **不让软垫拼出爆发一击**。
- craft_btn 解锁判据 = inventory 含 `kind='material'` 道具(🔧 运行时读 item_pool.kind·已确认;⚠ 🔧/🎨 须认此新 kind 或审时改复用现有材料 kind)。

---

## 3. ④ 掉落表(event_deck 权重 + 资源曲线)

> 目标:彻底搜刮 seq1-4 → prepared(+6atk/+4def/+30hp/+3药);赶路/跳过 → 停在 solid 以下。event_deck 用 `item_find`(guaranteed 定向 / weighted 加权)。
> **🧭 裁决(§6.0 背书)**:guaranteed **只放解锁链必需**(seq1 首道具+首材料);**stat 件全 weighted**(否则 guaranteed×survive_turns 压平准备度)。变量 = 玩家回合分配。

| seq | guaranteed(仅解锁链)| weighted(准备度:stat/材料/恢复)| 备注 |
|---|---|---|---|
| 1 search | 恢复剂小 + 材料(散件)×1(首道具+首材料→inventory/craft_btn)| 恢复剂小 · 材料(散件) | 解锁链兜底 |
| 2 encounter | —(战斗关)| 恢复剂小 · 材料(散件) · 攻击件(低权)| |
| 3 elite | — | 攻击件 · 材料(散件) · 恢复 | |
| 4 resource | — | 攻击件 · 防御件 · 容量件 · 材料(散件) · 恢复中(高权·备战窗口)| itemBias 高·主准备度来源 |
| 合成(⑤)| — | 材料换强化件/战术(§4)| 第二战力路径 |

- **准备度 = 玩家回合分配**(🧭 裁决):guaranteed 只兜解锁链;**stat 件全 weighted 且集中 seq4**(备战窗口高权重)。搜刮多(省下回合多搜/战斗赢得快)→ 更多 weighted stat → prepared;casual/赶路 → 少 → solid−;跳过战斗关搜刮 → naked−。**变量真实存在**(不再被 guaranteed 压平)。
- **达 prepared 路径**(additive:搜刮 weighted + 合成补足):seq3-4 攻击件 + seq4 防御/容量 + 合成(§4)→ +6atk/+4def/+30hp;药 seq1-2 + 恢复中 → ~5。**weighted 概率已解**(§6.2 harness·🔧 3 机制核实后):`pStat=0.30`/pMat=0.30/pHeal=0.20 → balanced→prepared(boss 83%)、rush→5%、hoarder→100%(污染前)。event_deck weight 由 🔧 反算达 per-seq 有效掉率。
- **投放预算不变式**:guaranteed 大减后天然满足(seq1 `2≤3`·seq2-5 `0`)。
- **guaranteed 语义(🔧 定稿 · 2026-07-08)**:每次 `search` 消费 **1 件** guaranteed(deck 顺序 **front-load**,优先于非保底 roll);`once` = 全关一次;**硬保证**(非概率)。
- **投放预算不变式**(出关卡/掉落表时自查 · 🔧 hook⑥ 入库校验按此**拒关**):`#guaranteed_item_find ≤ survive_turns − (首关 0 / 非首关 1)`(减 1 = 进关 move 占 1 回合)。**seq1-5 自查全达标**(§6.0 后 stat 件转 weighted·seq2-5 guaranteed=0):seq1 `2≤3` ✓ / seq2 `0≤3` ✓ / seq3 `0≤4` ✓ / seq4 `0≤5` ✓ / seq5 boss(无 guaranteed·boss_kill)✓。**新增关或加保底掉落必守此上限**,否则饿死解锁链 → 被 🔧 校验钉死。
- **权重实现**:seed 关 event_deck `item_find` 的 `guaranteed:true`(保底)/ `weight`(加权池)。boss 关(seq5)无掉落。

---

## 4. ⑤ 局内合成树(item_recipes 纯数据)

> 复用 `item_recipes` + `item_recipe_ingredients` 引擎(`craftItemRecipe`·gameActions.js:2353)。材料(§2.3)→ 强化件/战术道具。**新增 recipe 行 + ingredient 行**(kaleido 专属·enabled 独立)。

| 产物(📖 名)| 材料(📖 散件·is_consumed)| 成功率 | 状态 |
|---|---|---|---|
| 加力件(+2atk)| 碎块×2 | 1.0 | ✅ 已建(content SQL)|
| 加防件(+2def)| 卡扣×2 | 1.0 | ✅ 已建 |
| 顶力剂(burst)| 线圈×2 | 0.8 | ✅ 已建(kaleido buff「顶力」atk+10·1T)|
| 撑住剂(def+5×3T)| 垫片×2 | 0.9 | ✅ 已建(kaleido buff「撑住」def+5·3T)|
| 扩容件(+15hp)| 管段×1 + 芯子×1 | 1.0 | ✅ 行+配方已建;**效果值待 🔧 `maxHpDelta` 列**(一行 UPDATE 补丁)|

> **战术剂通路**:`item_pool.on_use_buff_ids` → `calcItemEffect`(gameEngine.js:139)→ `newBuffIds` → `applyBuff`(gameActions.js:2331)。已建 2 条 kaleido 尺度 buff 行(多人 buff 行原样不动)。
> **✅ 扩容件已恢复**(🧭 裁 (a)·2026-07-22:🔧 补 `maxHpDelta` 钩子已派):行与配方入经济 SQL,**效果值待该列落地后一行 UPDATE 补**(SQL 末附补丁)。→ 08 §4 的 **+30hp 分量回来** → prepared 回 atk16/def9/**hp130** → **seq5 boss 260/34/8 维持 08 §2 原曲线**(prepared 74-86%),**平衡定稿不动**。

- **co-align 守则(📖)**:碎块/卡扣(硬/连接)→ 强化;线圈(蓄劲)→ 顶力;垫片(软)→ 撑住 —— 语义相符,不软垫拼爆发。
- **搜刮基底 + 合成补足**(additive):搜刮(捡强化件)给基底,合成(散件换强化件)补足到 prepared;彻底者两者兼得,casual 者只基底停 solid+(§3/§6.2)。
- **纯数据**:`scripts/kaleido-d6-economy-content.sql` 已建**加力/加防 + 2 配方**(enabled=false·验证 READY-FOR-AUDIT);扩容/顶力/撑住配方待引擎钩子后补(§5)。

---

## 5. 依赖 / 交接

- **给 🔧(经 🧭)**:①持久强化件的 useItem 落点(永久改 atk/def/maxHp 字段·非 buff·§2.1)——确认 kaleido useItem 走持久路径;②seq4 guaranteed 消费速率语义(§3·已转);③craft_btn kind 判据(已确认读 item_pool.kind)。
- **给 📖**:kaleido 新道具/新敌人的**名与描述**(本文只出功能标签 + 数值);seq1-5 敌名已定(07)。
- **给 🧭/🔒(SQL)· 🧭 裁「四件合一批」进度**:
  - ✅ **已建**(`scripts/kaleido-d6-economy-content.sql`·enabled=false·验证 READY-FOR-AUDIT·待审执行):①6 散件材料行 ②加力/加防/修补/大补 道具行 ③加力/加防 2 配方。
  - ⏸ **待引擎钩子**:扩容件(🔧 maxHpDelta)/顶力剂·撑住剂(buff_pool + 战斗集成)+ 各自配方。
  - ⏸ **第 4 件 event_deck 回指**:seq1/2/4 deck 改指新 id + weight —— 待 🔧 内容注入消费器的 **weighted-pick 口径**(weight→掉率映射)定,方能把 §6.2 目标掉率反算成 weight。消费器落地后一版修订。
- **给 Kanata**:P1 gate 亲测掉落曲线(§3)—— sim 给锚点,实际"认真玩一遍到 prepared"要人测。
- **产出物**:本设计文档。SQL(新内容行 + recipe + 回指)随审进度出。

---

## 6. 待核(本轨后续)

### 6.0 准备度变量性风险(§6 harness 前置发现 · 🧭 裁决背书)

> **🧭 裁决(2026-07-08)**:本发现成立且重要,采纳修正 —— guaranteed 只放解锁链、**stat 件全 weighted**(§3 已改);准备度变量 = 玩家回合分配。3 机制问题已转 🔧(答复到再建 harness 定 weighted 概率)。

**推 §6 harness 时发现一个设计矛盾**:08 §3 假设"准备度随搜刮投入而变"(彻底→prepared / 跳过→naked)。但 guaranteed 语义(🔧:每次 search 消费 1 件·硬保证)× survive_turns(强制 N 个消耗动作)会**压平这个变量**:

- 纯搜索关(seq1)清关**只能靠 search** → 必然搜 survive_turns 次 → **必然吃到 guaranteed 掉落**。若把 stat 件(攻击/防御/容量)放 guaranteed,**人人清关即拿满 stat → 准备度不再是变量,boss 不再是准备度闸门**(与 08 §3 矛盾)。
- **∴ 掉落设计修正**:guaranteed **只放解锁链必需**(seq1 首道具 + 首材料·为 inventory/craft_btn);**stat 件走 weighted**(概率掉·搜得多/战斗赢得快→省下回合多搜→更多 stat)。变量来自"搜刮 vs 战斗 vs 赶路"的回合分配,不是 guaranteed。
- **§3 已改**:seq3/seq4 的 stat 件 guaranteed→weighted;**seq4 保底=0**(解锁链已在 seq1 满足·首道具+首材料;材料/stat 全 weighted)。守投放预算不变式(seq2-5 guaranteed=0)。**weighted 概率待 harness**(依赖 🔧 3 机制答复)。

**给 🔧 的机制澄清(harness 保真度依赖·经 🧭)**:
1. 战斗关有 active encounter 时**能否 search**(还是必须先杀敌/逃)?决定"边打边搜"是否可行。
2. 玩家能否在 survive_turns **达成前多搜**(超额囤货),还是达标即自动清关?决定搜刮量上限。
3. 清关是 survive_turns 自动触发还是玩家选择推进?

**harness 计划**(机制澄清后):模型"每关回合分配(search/fight)→ 掉落(guaranteed 固定 + weighted 概率)→ 合成 → 战力分布 → boss clear 分布",验证准备度曲线(naked→prepared 对应 boss 0→86%)。现 seed 关 SQL 用占位 id·enabled=false,不受此设计迭代影响(回指新 id 时一并调 guaranteed/weighted 划分)。

### 6.1 其余待核

- 掉落数值精算:material 掉落量 vs 合成需求(§3↔§4 闭环校验)——并入 6.0 harness。
- 敌人变体池(每档 2-3 个)补全,供 12-15 seed 关变体(待 🔧 钩子② seed 洗牌)。
- 战术道具(过载脉冲/护盾)对 boss 曲线的影响(08 §2.1 软化杠杆)——是否让 solid 档 boss 胜率上抬到可接受,harness 复核。

### 6.2 harness 结果:weighted 概率解(`scripts/kaleido-d6-economy-sim.mjs` · 🔧 机制核实后)

3 画像(每关 search 次数·下限=survive_turns·上限开放·🔧 核):rush `[3,1,1,2]` / balanced `[3,4,5,6]` / hoarder `[5,6,8,14]`。boss 260/34/8·severe:

| pStat | rush | balanced | hoarder | balanced avgStatEquiv(prepared=7)|
|---|---|---|---|---|
| 0.20 | 4% | 66% | 99% | 5.8 |
| **0.30** | **5%** | **83%** | 100% | **7.4** |
| 0.40 | 6% | 88% | 100% | 9.0 |
| 0.50 | 9% | 92% | 100% | 10.3 |

- **推荐 `pStat=0.30`**(`pMat=0.30`·`pHeal=0.20`·per-seq `statW=[0,0.3,1.0,1.6]`):balanced avgStatEquiv 7.4 ≈ prepared(7)→ boss **83%**(落 08 prepared 带 74-86%);rush 5%(欠准备必输);curve 平滑单调。**准备度=玩家变量成立** ✓。
- **per-seq 有效掉率**(pStat×statW):seq2 `0.09` / seq3 `0.30` / seq4 `0.48`;pMat `0.30`·pHeal `0.20`。→ event_deck `weight` 由 🔧 按引擎 weighted-pick 口径反算达此有效掉率(harness 给**目标概率**,weight 数值 🔧 校)。
- **⚠ hoarder 100% 是"污染前"值**:over-search 每次 +2 personal 污染(`SEARCH_PERSONAL`)→ 到 boss 时 hoarder 污染显著高于 rush/balanced → 触 severe(−15% 己伤)甚至 meltdown(≥100 死亡计时)→ **真实 hoarder 胜率被污染拉低**。这是**过量囤货的自限机制**(好设计:囤货有污染代价,防无脑刷)。精确曲线 = 下一迭代(需 env 污染@boss 累积模型:`effective=0.6·env+0.4·personal`·omega chamber base 100)。

---

## 7. 给 📖 的命名清单(🧭 派单 · 名/描述回流后本轨合稿)

> 本文只出**功能标签 + 数值档**;📖 出名与描述(守 05 §0.4 写作铁律:描述制命名·少专有名词)。seq1-5 敌名已定(那东西 / 那家伙 / 黑里的那个),此处 = 新道具 + 敌人变体档。

### 7.1 新道具(kaleido 尺度 · 待命名)

| 功能标签 | kind | 数值 | 用途 |
|---|---|---|---|
| 攻击强化件 | 持久(useItem 永久 +atk)| +2 atk | 战力路径·搜刮/合成 |
| 防御强化件 | 持久 | +2 def | 同 |
| 容量扩展件 | 持久 | +15 maxHp(并补满)| 同 |
| 恢复剂·小 | consumable | heal 30 | 常规补给 |
| 恢复剂·中 | consumable | heal 60 | 后段补给 |
| 战术·过载脉冲 | consumable | 一次性 +100% 本回合伤害 | 合成·burst 翻盘(08 §2.1)|
| 战术·稳定护盾 | consumable | def +5 计时 3 回合 | 合成·boss 减伤 |

### 7.2 敌人变体档(功能定位 · 待命名 · §1 梯度)

| 档 | 功能定位 | 数值范围(hp/atk/def)| 已定敌(seq)|
|---|---|---|---|
| T0 微弱 | 首战杂兵·教学·零威胁 | 15-20 / 5-7 / 1-2 | 那东西(seq2)|
| T1 轻 | 早段杂兵 | 35-55 / 9-12 / 3-4 | 变体待补 |
| T2 中 | 中段精英/资源关敌 | 80-100 / 14-17 / 4-6 | 那家伙(seq3)· 那东西(seq4)|
| T3 重 | 后段硬杂兵 | 110-140 / 18-22 / 6-8 | 变体待补 |
| Tboss 首领 | 收敛 boss·准备度闸门 | 240-280 / 32-36 / 7-9 | 黑里的那个(seq5)|

> **变体池已列 §1.1**(每档 2-3·加粗=已命名)。待 📖 命名:T1/T3 全档 + T0/T2/Tboss 各余 1-2 变体。持久件 useItem 落点 🔧 已答(§2.1),不阻塞命名。
