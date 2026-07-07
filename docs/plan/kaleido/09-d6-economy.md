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

---

## 2. ④ kaleido 道具池(战力源 · 效果值)

> 新增 item_pool 行(kaleido 尺度)。**名/描述 → 📖**;本文出 kind/效果值 + 功能标签。效果字段沿用 item_pool 现有列(atk/def/heal/effect/kind)。

### 2.1 持久强化件(run 内永久 · 支撑准备度曲线)

| 功能标签 | kind | 效果 | 设计意图 |
|---|---|---|---|
| 攻击强化件 | equip/consumable(持久) | +2 atk | 3 件 → +6 atk(达 prepared)|
| 防御强化件 | 同 | +2 def | 2 件 → +4 def |
| 容量扩展件 | 同 | +15 maxHp(并补满 15)| 2 件 → +30 hp |

- **⚠ 持久增益的落点需 🔧 确认**:kaleido 玩家 state 有 atk/def/maxHp 字段(createPlayerState)。持久件 = useItem 时永久改这些字段(非 buff 计时)。现 `calcItemEffect`(gameEngine.js:103)支持 atkDelta/defDelta/hpDelta —— 若是永久加,需确认 kaleido useItem 走持久路径(**引擎钩子·经 🧭 问 🔧**;本文先定数值,机制待接)。

### 2.2 消耗品(kaleido 尺度)

| 功能标签 | kind | 效果 | 备注 |
|---|---|---|---|
| 恢复剂(小)| consumable | heal 30 | = 玩家 1 瓶药口径(baseState heal 默认 30);replaces 多人 heal300 |
| 恢复剂(中)| consumable | heal 60 | 后段掉落 |
| 战术·过载脉冲 | consumable | effect: 一次性 +100% 本回合伤害(burst)| 合成产物(§4)·给"差一口气"玩家翻盘(08 §2.1 软化杠杆)|
| 战术·稳定护盾 | consumable | def +5 计时 3 回合(buff)| 合成产物·boss 战减伤 |

### 2.3 材料(复用现有 · kaleido 可用)

现有 `tech_fragment`(id13-16)/`platform_part`(id17-19)amount 小、无战斗数值 → **kaleido 直接复用作合成材料**(不需新增)。craft_btn 解锁判据 = inventory 含 kind∈{tech_fragment,platform_part} 道具(🔧 运行时读 item_pool.kind·已确认)。

---

## 3. ④ 掉落表(event_deck 权重 + 资源曲线)

> 目标:彻底搜刮 seq1-4 → prepared(+6atk/+4def/+30hp/+3药);赶路/跳过 → 停在 solid 以下。event_deck 用 `item_find`(guaranteed 定向 / 非 guaranteed 加权)。

| seq | 保底(guaranteed)| 加权(非保底)| 累计战力(彻底)|
|---|---|---|---|
| 1 search | 恢复剂小 + 材料×1 | 恢复剂小 | +0 战力·2 材料·药+1 |
| 2 encounter | — | 恢复剂小 · 材料×1 | 药+1·材料 |
| 3 elite | 攻击强化件×1 | 材料×1 | **+2 atk**·材料 |
| 4 resource | 攻击强化件×1 + 防御强化件×1 + 容量扩展×1 + 材料×2 | 恢复剂中 | **+2atk/+2def/+15hp**·材料 |
| 合成(⑤)| — | — | 攻击/防御/容量 各再 +1(材料换)|

- **算账(additive:搜刮基底 + 合成补足)**:atk = seq3 攻击件(+2)+ seq4 攻击件(+2)+ 合成攻击(+2)= **+6** ✓;def = seq4 防御(+2)+ 合成防御(+2)= **+4** ✓;hp = seq4 容量(+15)+ 合成容量(+15)= **+30** ✓;药 ~5(起始 2 + seq1/2 各 +1 + 恢复中)✓ → **达 prepared**。⚠ 3 次合成需 ~6 材料(guaranteed seq1(1)+seq4(2)= 3 基底 + seq2/3 weighted 2-3):**彻底搜刮者够 3 craft → prepared;casual 者 ~2 craft 停 solid+**。材料量↔合成需求闭环由 §6 harness 校验。
- **跳过搜刮者**:只吃 seq1-2 保底(2 材料·1-2 药)→ 停在 ~minimal → boss 挡下(08 §2:minimal 4-21%)。**准备成为变量** ✓。
- **guaranteed 语义(🔧 定稿 · 2026-07-08)**:每次 `search` 消费 **1 件** guaranteed(deck 顺序 **front-load**,优先于非保底 roll);`once` = 全关一次;**硬保证**(非概率)。
- **投放预算不变式**(出关卡/掉落表时自查 · 🔧 hook⑥ 入库校验按此**拒关**):`#guaranteed_item_find ≤ survive_turns − (首关 0 / 非首关 1)`(减 1 = 进关 move 占 1 回合)。**seq1-5 自查全达标**:seq1 `2≤3` ✓ / seq2 `0≤3` ✓ / seq3 `0≤4` ✓ / seq4 `3≤5` ✓ / seq5 boss(无 guaranteed·boss_kill)✓。**新增关或加保底掉落必守此上限**,否则饿死解锁链 → 被 🔧 校验钉死。
- **权重实现**:seed 关 event_deck `item_find` 的 `guaranteed:true`(保底)/ `weight`(加权池)。boss 关(seq5)无掉落。

---

## 4. ⑤ 局内合成树(item_recipes 纯数据)

> 复用 `item_recipes` + `item_recipe_ingredients` 引擎(`craftItemRecipe`·gameActions.js:2353)。材料(§2.3)→ 强化件/战术道具。**新增 recipe 行 + ingredient 行**(kaleido 专属·enabled 独立)。

| 产物 | 材料(item_id·is_consumed)| 成功率 | 意图 |
|---|---|---|---|
| 攻击强化件 | 结构碎片(13)×1 + 锚点稳定协议(14)×1 | 1.0 | 战力路径 A(搜刮不足靠合成补 atk)|
| 防御强化件 | 环段部件(17)×1 + 缓冲材料(18)×1 | 1.0 | 补 def |
| 容量扩展件 | 结构碎片(13)×1 + 环段部件(17)×1 | 1.0 | 补 hp |
| 战术·过载脉冲 | 语言压缩算法(15)×1 + 深界情报(16)×1 | 0.8 | burst 翻盘(08 §2.1)|
| 战术·稳定护盾 | 缓冲材料(18)×2 | 0.9 | boss 减伤 |

- **搜刮基底 + 合成补足**(additive·非冗余双路径):搜刮(捡强化件)给战力基底,合成(材料换强化件)补足到 prepared;彻底玩家两者兼得达 prepared,casual 者只得基底停 solid+(§3 算账)。材料掉落量校准为"彻底搜刮够 ~3 次合成"(§6 闭环校验)。
- **合成 = craft_btn 解锁的兑现**:首材料掉落(seq1)→ craft_btn 亮(05 §1.3)→ 合成成为战力补充手段。
- **纯数据**:recipe/ingredient 行经 SQL 入库(审后);产物指向 §2.1 新增强化件 id。

---

## 5. 依赖 / 交接

- **给 🔧(经 🧭)**:①持久强化件的 useItem 落点(永久改 atk/def/maxHp 字段·非 buff·§2.1)——确认 kaleido useItem 走持久路径;②seq4 guaranteed 消费速率语义(§3·已转);③craft_btn kind 判据(已确认读 item_pool.kind)。
- **给 📖**:kaleido 新道具/新敌人的**名与描述**(本文只出功能标签 + 数值);seq1-5 敌名已定(07)。
- **给 🧭/🔒(SQL·审后)**:①新增 kaleido item_pool 行(强化件/恢复剂/战术·新 id);②新增 item_recipes + ingredients 行;③**回指**:seq1-2/seq4 种子关 event_deck 从多人占位 id 改指 kaleido 新 id(一版 SQL 修订)。全部幂等·enabled 可控。
- **给 Kanata**:P1 gate 亲测掉落曲线(§3)—— sim 给锚点,实际"认真玩一遍到 prepared"要人测。
- **产出物**:本设计文档。SQL(新内容行 + recipe + 回指)随审进度出。

---

## 6. 待核(本轨后续)

- 掉落数值精算:material 掉落量 vs 合成需求(§3↔§4 闭环校验),用扩展 harness 模拟"搜刮 N 次 → 战力分布"。
- 敌人变体池(每档 2-3 个)补全,供 12-15 seed 关变体(待 🔧 钩子② seed 洗牌)。
- 战术道具(过载脉冲/护盾)对 boss 曲线的影响(08 §2.1 软化杠杆)——是否让 solid 档 boss 胜率上抬到可接受,harness 复核。

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

> 变体命名可等本轨补全变体池后批量供;seq1-5 固定关敌名已足本阶段。持久强化件的 useItem 落点待 🔧 答复(§5),不阻塞命名。
