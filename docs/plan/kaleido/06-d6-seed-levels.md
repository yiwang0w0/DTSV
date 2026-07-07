# KALEIDO · 06 D6 种子关设计(⚙️ KP1-G ① · 结构+数值)

> 2026-07-07 · ⚙️ 游戏性轨(内容/数值)· 恢复令 KP1-G 首单。
> 依据:`02-detailed-design.md` §2.5/§3.1/§3.2、`03-track-packages.md`「KP1-G」+「KP1-R 重排」、`05-progressive-disclosure.md` §1.3/§2、`src/lib/server/kaleido/runs.js`(sampler 真源)、`combatModes/index.js`(战斗公式真源)。
> **本轨只出结构 + 数值 + 校验需求;文案槽(name/description/入关文本/敌人命名/氛围行)全部留空给 📖 N4。** 要引擎钩子经 🧭 转 🔧。
> **状态**:seq1-2 结构初稿(第一里程碑)· seq3-5 骨架 · 数值为"结构可跑"档,精调见 §7(KP1-G ② 平衡核算)。

---

## 0. 关键契约(从代码抽的硬事实,设计据此)

### 0.1 采样序列(不可变,来自 `runs.js:archetypeSequence(5)`)

```
seq1 = search    (mode=standard,    exit=survive_turns)   ← 外环维护廊(pollution 0)
seq2 = encounter (mode=gauntlet,    exit=survive_turns)   ← 首次战斗
seq3 = elite     (mode=stance_duel, exit=survive_turns)   ← 三态克制
seq4 = resource  (mode=standard,    exit=survive_turns)   ← 备战搜刮
seq5 = boss      (mode=standard,    exit=boss_kill)       ← 收敛
```

- 种子关经 `content_pool(entity_type='level')` 消费;sampler 按 `payload.archetype === archKey` 匹配填槽(`runs.js:176`)。**一个 5 关 run 每 archetype 消费一关**。
- 种子关 payload 命中时 **完全绕过 `scaleEnemy`**,直接用 `payload.combatSetup.enemy`(手写数值)+ `payload.exit_condition` + `payload.combat_mode`(`runs.js:180-188`)。⟹ **种子关 = 我全权掌控数值,不受多人池巨兽污染**。

### 0.2 战斗公式(真源 `combatModes/index.js:hit()`)

```
单次伤害 = max(1, floor(atk × atkMul − def × defMul))     // atkMul 默认 1,defMul 默认 0.5
暴击(概率 critRate 默认 0.1):dmg = max(1, floor(dmg × critMul 默认 1.5))
玩家裸属性:hp 100 · atk 10 · def 5 · potions 2(每瓶 heal 30)  // roomState.js:305-308 + baseState 默认
```

### 0.3 种子关 payload 形状(sampler 逐字段消费,必须精确对齐)

```jsonc
// content_pool 行:{ entity_type:'level', enabled:true, payload:{…}, provenance:{…} }
payload = {
  "archetype": "search",                          // ← sampler 匹配键(必填)
  "exit_condition": { "type":"survive_turns", "params":{ "turns":3 } },
  "combat_mode":    { "template_ref":"standard", "params":{}, "describe":"" },  // describe 空 = 运行时回落 getCombatMode().describe()
  "combatSetup":    null,                          // 无战斗关 = null;boss/encounter 关 = { "enemy":{…} }
  "event_deck":     [ … ],                         // 见 §2/§3
  "env_rules":        [],                          // D3 逐关覆盖(🔧);种子关默认中性
  "formula_overrides":[],                          // 同上
  "difficulty_band": { "target_clear_rate":[0.55,0.85] },  // 引导关偏易
  // ── 文案槽(📖 N4 填,本轨留空)──
  "name": "", "description": "", "enter_text": "", "ambient": []
}
provenance = { "source":"seed", "archetype":"search", "seq_hint":1, "anonymized":true }
```

### 0.4 ⚠ 引擎现状(对抗验证发现 · 2026-07-07):非 boss 内容注入**未接线**

5-lens 对抗验证确认:**payload 字段命名/类型/嵌套全部正确**(sampler 精确消费 archetype/exit_condition/combat_mode/combatSetup.enemy;SQL 幂等+语法无误;安全首战算术**结论**成立)。但发现**一处阻塞级引擎缺口**——运行时 `gameActions.js` 当前**只**消费 boss 关的 combatSetup.enemy(`gameActions.js:3404` `archetype==='boss' && kaleidoEnemy`);**event_deck 与非 boss 的 combatSetup.enemy 无任何运行时读者**:

| 我以为 payload 驱动的 | 实际运行时 | 后果 |
|---|---|---|
| seq1 event_deck 保底掉道具/材料 | `event_deck` 被 gameActions.js **零引用**;搜索走多人 `spawnNpcInstanceFromRow`/`max_npcs`/随机 item 路径 | 首道具/首配方材料**不投放** → inventory/craft_btn 解锁链断 |
| seq2 手写弱敌(18/6/2)进首战 | 非 boss 无 `kaleidoEnemy` 注入分支;seq2 敌来自多人 npc_pool 随机 scale | 首战敌 = 多人巨兽,**安全首战不成立** |
| `guaranteed:true` 强制投放 | 全 src **零读者**(grep 无匹配) | 纯 spec 键,不生效 |

⟹ **seq1-2 种子关在当前引擎下是 inert(惰性数据)**:即便入库,采样器命中后运行时也降级为"随机多人刷怪",既非"投放下限"也非概率——**onboarding 不可用,直到 🔧 补齐"非 boss 内容注入"**(§1.1 扩容后的 🔧 钩子 ①)。**故本单交付 = 结构 + 数值 + 精确到 file:line 的引擎依赖清单**;SQL 标 `enabled=false` 不入活流,待 🔧 接线后启用。

---

## 1. 解锁触发链 × 投放下限(05 §2 硬约束 —— 本单核心)

**约束(KP1-R)**:解锁触发链须在 **seq1-2 自然发生**;首道具 / 首遭遇 / 首配方材料的**投放下限**要在关卡排布里自查。

> **状态(验证后)**:下表是**内容前置 spec**,前提是 🔧 补齐 §1.1 内容注入 + ui_unlocks 引擎。**当前引擎下,六项里只有 `log_panel` / `move_btn` 会真触发**(search/level_clear 是已在的传感动词);`inventory`/`craft_btn`/`hp_bar`/`combat_panel` 各有断链或时序问题(§0.4 + 下方验证修正),须按 §1.1/§8 修复。

映射 05 §1.3 十二项 ui_key → 谁在哪关点亮(⚙️ 负责"能点亮"的**内容前置**,🔧 负责触发判定,📖 负责 nar_line):

| ui_key | 解锁触发(动词) | ⚙️ 内容前置(投放下限)| 关 |
|---|---|---|---|
| `search_btn` | 初始唯一 UI | 无(常驻) | — |
| `log_panel` | 首次 `search` 后 | seq1 可搜(chamber 有 max_items>0) | seq1 |
| `inventory` | 首次获得道具 | **seq1 event_deck 保底掉 1 件消耗品**(首道具) | **seq1** |
| `craft_btn` | 首次拾得配方材料 | **seq1 event_deck 保底掉 1 件配方材料**(首配方材料) | **seq1** |
| `move_btn` | 首次 `level_clear` | seq1 exit=survive_turns=3 可达成 | seq1→seq2 |
| `level_header` | 首次 `move` 后 | seq2 存在 | seq2 |
| `turn_counter` | 与 level_header 同批 | 同上 | seq2 |
| `hp_bar` | 首次遭遇建立**前**(timing=before)| **seq2 event_deck 保底 npc_encounter**(首遭遇)| **seq2** |
| `combat_panel` | 首次遭遇(安全上演)| 同上 + **敌人弱到必胜**(§0.2 算术保证)| **seq2** |
| `rules_card`(R6) | 首个带战斗模板关**入关前** | seq2 combat_mode=gauntlet(describe 非空)| seq2 |
| `stance_ui` | 首个 stance_duel 精英关 | seq3 combat_mode=stance_duel | seq3 |
| `convergence` | 版本终止常驻 | seq5 收敛 | seq5 |

**⟹ 结构结论:seq1 须保底掉「1 消耗品 + 1 配方材料」,seq2 须保底建立「1 场安全遭遇」。** 全落 seq1-2 内,约束满足。`stance_ui` 顺延 seq3。

**⚠ 验证修正(4 项解锁的触发定义须改 · 提给 🔧/📖 经 🧭)**:
- **inventory**:不能只靠概率掉落(survive_turns 可零掉落清关 → 空背包过 seq1-2)。要么 🔧 让 event_deck `guaranteed` 生效(**定向**投放 id27,非加权随机),要么改触发为确定性状态(如 run 开局赠 2 药 → inventory 非空 → 开局即解锁,视觉上仍可渐进 gate)。
- **craft_btn**:①现无"拾取材料"传感动词(只有 `craft_attempt`,且它需 craft UI 已开 = **循环依赖**);触发须改为**状态检查**「inventory 首次含 recipe-material 类道具」。②仍依赖 id13 保底投放(同 inventory)。
- **hp_bar(timing=before)**:`fight_start` 在遭遇**建立后**才发射(`route.js:47-55` diff encounter 态)⟹ 与 combat_panel **同批触发,无法严格 before**。修:hp_bar gate 前移到 **seq2 入关时**(movePlayer 入 combat_mode≠standard / combatSetup≠null 的关即解锁,先于首次 attack),combat_panel 仍在遭遇时 → 得真严格序。
- **combat_panel(安全首战)**:seq1 的 `combatSetup:null` **不阻止**运行时刷怪(chamber id1 `max_npcs=1`,searchArea 可从 live npcPool 建遭遇)⟹ 首遭遇可能误落 seq1、且先于 hp_bar。修:seq1 须**运行时零战斗**(§8 要求:强制 seq1 chamber `max_npcs=0` 且 combatSetup=null 时 searchArea 跳过 npc 分支)。

### 1.1 🔧 钩子 ①(#1 阻塞)—— 非 boss 内容注入运行时消费器

验证澄清:这不是"加个 flag",而是**运行时消费 event_deck + 非 boss combatSetup.enemy 的整条通路目前不存在**(§0.4)。`event_deck`/`kaleidoEventDeck` 在 `runs.js` 只被**写入**(`:136`/`:226`),gameActions.js 零读取;非 boss 敌人注入无分支(仅 boss `:3404`)。需要 🔧 建:

> **🔧 钩子 ①(内容注入消费器)**:kaleido 局进关/搜索解算时,**排空当前关 `level.payload.event_deck`**:
> 1. `item_find` + `guaranteed:true` → **定向**投放该 `item.id`(非加权随机;绕过 roll/出现率门),`once` 用尽即止;
> 2. `npc_encounter` + `guaranteed:true` → 用条目内嵌 `npc.{id,hp,atk,def}` **强制建立遭遇**(非从多人 npc_pool 随机),供首战用手写弱敌;
> 3. 非 boss 战斗关的 `combatSetup.enemy` 注入 —— 镜像 boss 分支 `gameActions.js:3404` 到 encounter/elite;
> 4. `guaranteed` 排空后,剩余非保底条目 + 空位再回落现有随机 spawn。
>
> **这是 05 §1.3 渐进披露 + 06 seq1-2 onboarding 的硬前置**;无它,种子关 = 惰性数据,首个 run 降级随机多人刷怪(既非投放下限也非安全首战)。属 🔧 KP1-E,建议排在 ui_unlocks 引擎**同批或之前**(ui_unlocks 的解锁事件依赖这些内容真发生)。

---

## 2. seq1 种子关(search · 结构初稿)

**定位**:A Dark Room 式"觉醒"关。纯搜索,零战斗。玩家学到:search 能出东西。解锁 log_panel / inventory / craft_btn,清关后 move_btn 亮起。
**chamber_ref**:`chamber_templates` id **1**(`outer_ring_scan_1` 外环-巡查节点,type=scan_dense,pollution_base=0,max_items=6)。理由:pollution 0 = 首关零环境压力;scan_dense 匹配 search archetype;max_items 6 留足随机搜刮空间。

```jsonc
{
  "entity_type": "level",
  "enabled": true,
  "payload": {
    "archetype": "search",
    "exit_condition": { "type": "survive_turns", "params": { "turns": 3 } },   // = 2+seq1;E2E「每关 2+seq」对齐
    "combat_mode": { "template_ref": "standard", "params": {}, "describe": "" },
    "combatSetup": null,                                                        // 无战斗
    "event_deck": [
      { "type": "item_find", "item": { "id": 27 }, "weight": 5, "once": true, "guaranteed": true },  // 机能恢复剂 → 首道具/inventory
      { "type": "item_find", "item": { "id": 13 }, "weight": 5, "once": true, "guaranteed": true },  // 结构碎片(tech_fragment)→ 首配方材料/craft_btn
      { "type": "item_find", "item": { "id": 22 }, "weight": 2, "once": false }                       // 结构修复包 → 随机补给(非保底)
    ],
    "env_rules": [], "formula_overrides": [],
    "difficulty_band": { "target_clear_rate": [0.9, 1.0] },                     // 引导关近必过
    "chamber_ref": { "template_id": 1, "template_key": "outer_ring_scan_1" },
    "name": "", "description": "", "enter_text": "", "ambient": []             // 📖 N4
  },
  "provenance": { "source": "seed", "archetype": "search", "seq_hint": 1, "anonymized": true }
}
```

**投放下限自查**:`item_find(id27)` + `item_find(id13)` 均 `guaranteed:true` ⟹ 首道具 + 首配方材料在 seq1 必然投放 ⟹ inventory + craft_btn 必点亮。survive_turns=3 = 三次搜索即清 ⟹ 3 次搜索足以吃到 2 件保底掉落(每次搜索至多消耗 1 个 guaranteed 条目;3 次 ≥ 2 件)。✅

**⚠ 数值待定(依赖 ③④)**:id27/id13/id22 是**多人池现存道具**,效果值(如 id22 heal 300)是多人标定,对 kaleido 100-hp 玩家偏大。seq1-2 **结构**(掉什么、保底几件)已锁定;**道具效果数值**待 KP1-G ③④(kaleido 道具经济)专门校准。此不阻塞 📖 N4(📖 只需知道"掉一件恢复品 + 一件材料",不需精确 heal 值)。

---

## 3. seq2 种子关(encounter · 首次战斗 · 安全上演)

**定位**:首次战斗。gauntlet 波次(满足 P1 闸门"3 模板均出现")但**数值弱到零风险**(时序法则:首战必安全)。hp_bar 先于遭遇亮起(🔧 timing=before),combat_panel 遭遇时亮起,rules_card 入关前展示波次规则。
**chamber_ref**:`chamber_templates` id **5**(`anchor_combat_1` 锚点-残响游走区,type=combat_dense,pollution_base=35,max_npcs=4)。理由:combat_dense 匹配 encounter archetype;进入锚点走廊(区域推进第二段)。

```jsonc
{
  "entity_type": "level",
  "enabled": true,
  "payload": {
    "archetype": "encounter",
    "exit_condition": { "type": "survive_turns", "params": { "turns": 4 } },   // = 2+seq2;E2E 对齐
    "combat_mode": {
      "template_ref": "gauntlet",
      "params": { "waves": 2, "waveHeal": 15, "enemyScale": 1.15, "atkMul": 1, "defMul": 0.5 },
      "describe": ""                                                            // 空 = 运行时回落 gauntlet.describe(params)(R6 卡料)
    },
    "combatSetup": {
      "enemy": { "npcId": 8, "name": "", "hp": 18, "maxHp": 18, "atk": 6, "def": 2, "level": "easy" }
      // ↑ npcId=8 仅供身份/名称回落(残响低语);hp/atk/def 为 kaleido 手写弱化值(name 留空 → 📖 N4 或引擎回落 npc_pool.name)
    },
    "event_deck": [
      { "type": "npc_encounter", "npc": { "id": 8, "hp": 18, "atk": 6, "def": 2 }, "weight": 3, "once": true, "guaranteed": true },  // 首遭遇 → hp_bar/combat_panel
      { "type": "item_find", "item": { "id": 27 }, "weight": 2, "once": false }  // 战后补给(非保底)
    ],
    "env_rules": [], "formula_overrides": [],
    "difficulty_band": { "target_clear_rate": [0.9, 1.0] },
    "chamber_ref": { "template_id": 5, "template_key": "anchor_combat_1" },
    "name": "", "description": "", "enter_text": "", "ambient": []             // 📖 N4
  },
  "provenance": { "source": "seed", "archetype": "encounter", "seq_hint": 2, "anonymized": true }
}
```

### 3.1 安全首战算术证明(时序法则:首战必不可死)

gauntlet waves=2 · enemyScale=1.15 · waveHeal=15 · 玩家 hp100/atk10/def5:

| | 敌 hp | 敌 atk | 敌 def | 玩家每击伤敌 | 杀敌所需击数 | 敌每击伤玩家 |
|---|---|---|---|---|---|---|
| 波1 | 18 | 6 | 2 | `floor(10−1)=9` | ⌈18/9⌉=**2** | `floor(6−2.5)=3`(暴击 `floor(3·1.5)=4`)|
| 波2 | `floor(18·1.15)=20` | `floor(6·1.15)=6` | 2 | 9 | ⌈20/9⌉=**3** | 3(暴击 4)|

- **载重事实**(`combatModes/index.js:118` 玩家先手 + `:58` `if(enemy.hp>0)` → 杀敌那回合敌**不反击**):敌方实际出手数 = 杀敌所需击数 − 1。波1 玩家 2 击杀敌 ⟹ 敌出手 **1** 次;波2 3 击 ⟹ 敌出手 **2** 次。
- **最坏情形**(玩家纯攻击不吃药、敌每击暴击 dmg=4):波1 承伤 1×4=4 → hp96;波间 waveHeal +15 补满(min(100,111)=100,补掉波1 的 4);波2 承伤 2×4=8 → **hp92**。
- **独立验证**:仓库真代码 attack-only bot 跑 **20000 seed → 最差终局 hp=92,0 场非胜**。首战不可能死 = 结构级不变式(死亡下界 92)。✅
- ⚠ **此结论仅当 §0.4 的手写弱敌真被注入**(🔧 钩子 ①);否则敌 = 多人巨兽,安全性作废。
- (订正:原稿"≤20 承伤 / hp≥80"多算了杀敌回合的反击 + 忽略 waveHeal 补偿,结论偏保守但推理错。**载重事实 = 杀敌回合敌不反击,后续平衡改动须保留**。)

---

## 4. seq3-5 骨架(结构占位 · 数值待 §7 精调)

> 骨架目的:①给 📖 看到完整弧线(区域推进 + 模板节奏);②排好 stance_ui(seq3)与 boss 收敛(seq5)在解锁链的位置;③明确 seq4 的"备战搜刮"是关闭 boss 战力差的窗口。**seq3-5 payload 待 seq1-2 定稿 + ② 平衡核算后补全**,此处只列结构决策。

| seq | archetype | mode | exit | chamber_ref(建议) | 结构要点 | 解锁链 |
|---|---|---|---|---|---|---|
| 3 | elite | stance_duel | survive_turns=5 | id7 锚点-壳裂带(hazard)或 id9 伊甸港-塌陷干道 | 首个三态克制;counterMul 1.6;敌中档;rules_card 展示克制表 | **stance_ui** 点亮 |
| 4 | resource | standard | survive_turns=6 | id8 伊甸港-堆积区(scan_dense, max_items 7)| **备战窗口**:高 itemBias,保底掉「战力增益道具 + 合成材料×2」;玩家在此攒够打 boss 的资源 | craft 链成型 |
| 5 | boss | standard | **boss_kill** | id24 Ω-段-终极界面(milestone)| **必带 combatSetup.enemy**(见 §6 校验);boss 数值 = §7 平衡产物;可选 env_rules(污染压) | **convergence** |

> **⚠ chamber_ref 名仅为 DB legacy 多人标签**(如 id24「Ω-段-终极界面」),我只按 **type + pollution 结构**选 ID;kaleido 面向的命名/lore(π-段锚点,**非** Ω-段;§8)**是 📖 的决定,不可当 canon 读**。seq5 milestone 关按 type=milestone 选,以 ID/key 引用为准。

**seq4 是平衡枢纽**:数据点显示裸属性玩家 8 交换死于旧 boss。seq4 必须投放足量战力增益(道具/合成产物),使"走完 seq1-4 的玩家" vs boss 有胜算,而"跳过搜刮的裸玩家"会输 —— 让**准备**成为通关变量(§7 展开)。

---

## 5. 关于运行间变体与"12-15 关"

- 恢复令"12-15 关" = **种子关池总量**(每 archetype 多关,供 run 间变体),非单 run 12-15 关(LEVEL_COUNT=5 固定)。
- **但 seq1-2 应为固定权威关**:05 §0.1 要求"首个 run 体验完整渐进" ⟹ 引导关(seq1-2)是**被作者编排的固定 onboarding**,不随机。变体从 seq3+ 或后续 run 引入。
- **🔧 钩子 ②(变体选择)**:现 `runs.js:176` seedMatch 用 `.find`(首个未用匹配),**非 seed 洗牌** ⟹ 同 archetype 多关时永远选插入序第一关,无 run 间变体。要真变体需 seed 驱动的种子关抽样(mulberry32 已在)。**seq1-2 固定关不受影响**(每 archetype 就一关即确定);seq3+ 多变体时需此钩子。登记,不阻塞本单。

---

## 6. 校验需求(提给 🔧 · 经 🧭)—— 🔧 钩子 ③

**"boss 关缺 combatSetup.enemy 即挡"**(KP1-G ① 明确要求):

> **🔧 钩子 ③**:种子关入库校验(admin 保存 / SQL 审 / sampler 消费任一处)须挡下:
> `payload.exit_condition.type === 'boss_kill'` **且** (`payload.combatSetup?.enemy` 缺失 **或** `enemy.hp/atk/def` 任一非正) ⟹ **拒绝该关**(boss_kill 无 boss 实体 = 不可满足的过关条件 = 死关)。
> 建议校验点:content_pool 写入侧(admin schema 校验 + SQL 审 checklist)+ sampler 消费侧兜底(命中 boss_kill 种子关但无 enemy → 回落 `combatModeFor`/`scaleEnemy` 而非放行空 boss)。
> 附带建议校验:`event_deck[].item.id` / `.npc.id` 引用存在性(查 item_pool/npc_pool),`combat_mode.template_ref ∈ {standard,gauntlet,stance_duel}`,`archetype ∈ 5 类`。

---

## 7. 平衡核算大纲(KP1-G ② · 本单出框架,数值精调随后)

**问题**:裸属性玩家(atk10/def5/hp100 + 2 药)vs 旧 seq5 boss(hp102/atk20/def3)→ 玩家每击 8、需 13 击;boss 每击 17、6 击杀玩家 ⟹ **8 交换内死**(数据点复现,§0.2 算术吻合)。

**设计目标**:让**搜刮准备**成为通关变量 —— 走完 seq1-4 攒够增益的玩家能赢,跳过的裸玩家会输。

**待核算(② 输出 = 数值调整方案)**:
1. **玩家战力增益曲线**:seq1-4 通过道具/合成/(可选)属性成长能拿到多少 atk/def/有效 hp。需先定 kaleido 道具经济(③④):战力道具的 atk/def 加成档、合成产物强度、heal 道具有效性。
2. **boss 强度反解**:给定"备战玩家"战力,反推 boss 的 hp/atk/def 使 target_clear_rate 落在 difficulty_band(建议 boss 关 [0.35, 0.6])。用 `combatModes.simulateBattle` + `botClearRate`(离线 bot)验证。
3. **难度曲线参数**:seq3(elite)、seq5(boss)的敌人档位;是否给 boss 关加 env_rules(污染/公式覆盖)作为额外压强。
4. **回归**:boss 数值须保证 `kaleido-e2e.mjs` 的 boss_kill 断言仍过(E2E bot 能杀 boss);改动前后 send 🧭 协调 E2E 重跑。

---

## 8. 交接与风险(给 🧭)

**给 📖(N4 立即可启动)**:seq1-2 结构已定 —— seq1 掉「1 恢复品 + 1 材料 + 随机补给」纯搜索关;seq2「首次波次战·安全」。📖 填 name/description/enter_text/敌人命名/ambient(氛围行)。**世界观**:05 §0.2 = 第三纪元失衡时代 · 函馆内部构造 · **π-段**(非 Ω-段);玩家 = 结构工程体(非 PI/引导者)。⚠ chamber_templates 现有名/描述含旧多人 lore(Ω-段/伊甸港/PI),我只按 type+pollution 选 ID,**chamber 文案是否需 kaleido 覆盖由 📖 定**(我不动 chamber 行文案)。

**给 🔧(经 🧭 排期 · 已按 file:line 定位)**:
- **①(#1 阻塞)非 boss 内容注入消费器**(§1.1):运行时排空 event_deck 定向投放 guaranteed item/npc + 非 boss combatSetup.enemy 注入(镜像 boss `gameActions.js:3404`)。无它 seq1-2 惰性。
- **② craft_btn 触发改状态检查**(inventory 首含 recipe-material 类道具),废除"拾取动词"依赖 + 循环(craft_attempt 需 UI 已开)。
- **③ hp_bar gate 前移到 seq2 入关**(combat_mode≠standard / combatSetup≠null 的关 movePlayer 时),而非 fight_start(它在遭遇建立后才发,`route.js:47`)——保 timing=before 硬法则。
- **④ seq1 运行时零战斗**:强制 seq1 chamber `max_npcs=0` 且 combatSetup=null 时 searchArea 跳过 npc 分支(防首遭遇误落 seq1、破 hp_bar 序)。
- **⑤ 种子关 seed 洗牌选择**(§5,run 间变体,seq3+;seq1-2 固定关不受影响)。**另**:startKaleidoRun 的 seedLevels 查询须 `.eq('enabled',true)`,否则本 SQL 的 `enabled=false` 不 gate。
- **⑥ boss_kill 缺 enemy 校验 + 引用存在性校验**(§6)。
- **E2E(上线后)**:加「解锁序 + hp_bar 先于首害 + seq1 无 fight_start/attack」断言。

**风险**:
- **R1(阻塞)非 boss 内容注入未接线**:seq1-2 种子关当前 inert(§0.4)。SQL 已标 `enabled=false` 不入活流;待 🔧 钩子 ① + 验证 startKaleidoRun 过滤 enabled=true 后再启用。**最高优先,重塑 KP1-E↔KP1-G 依赖**。
- **R2 解锁引擎/持久化未建**:ui_key/player_ui_state/条件渲染全 src 零匹配(预期,🔧 KP1-E item0)。六项解锁当前无一真触发,端到端验证待其落地。
- **R3 E2E 交互**:种子关入库会被 sampler 消费改 exit/enemy;已对齐 survive_turns=2+seq 护 turn 断言。因 `enabled=false` 现不影响 E2E;启用时 send 🧭 协调重跑。
- **R4 道具/敌人多人标定**:引用现有 id 是结构占位,效果数值待 ③④ 校准。

**产出物**:本文档 + `scripts/kaleido-d6-seed-levels-seq1-2.sql`(幂等 · `enabled=false` · **未执行 · 待 🧭/🔒 审 + 🔧 钩子 ①**)。经 5-lens 对抗验证:payload shape / SQL 幂等 / combat-math 结论均 PASS;阻塞项 = 引擎内容注入缺口(已精确定位交 🔧)。
