# KALEIDO · 08 D6 难度平衡核算(⚙️ KP1-G ② · 数值方案 · D5=乙 定稿)

> 2026-07-07 · ⚙️ 游戏性轨 · 🧭 分配号段 08。依据:`07-d6-seed-levels.md`、`combatModes/index.js`、`gameActions.js:1817-2015`(live 战斗真源)、`gameEngine.js:65`(calcDamage)、`pollution.js:251`+`constants.js:189`(污染真源)。
> **方法**:只读双模型 harness `scripts/kaleido-d6-balance-sim.mjs`(8000 trials/格·非引擎代码);`node` 可复现。
> **🧭 裁决(`d828c92`·03「KP1-R 裁决追记」)**:D5 = **乙(遗留富路径 seed 化)**,采纳 ⚙️ 推荐的平滑曲线模型。本文按乙定稿终值。

---

## 0. 结论速览(给 🧭 · 终值)

1. **战斗模型 = 乙(富路径)**:玩家 85% 命中 + 敌反击 `0.3×0.85≈0.255/回合` + 污染修正,seed-PRNG(🔧 D5 把 `Math.random`→seed·R1 同批修)。伤害公式 = `calcDamage` = `max(1,floor(atk−def·0.5))`+crit 0.1×1.5。
2. **难度 = 平滑曲线**(乙的红利):**seq5 boss = `260/34/8`** →
   | 玩家档 | naked | minimal | solid | prepared | over |
   |---|---|---|---|---|---|
   | 无污染 | 1% | 21% | 50% | 86% | 100% |
   | severe 污染(boss 关)| 0% | 4% | 25% | **74%** | 98% |
   每档准备度对应显著不同胜率 —— 搜刮准备是通关变量,且**平滑非闸门**。
3. **污染是次要减益杠杆(方向已订正)**:`applyPollutionCombatModifier`(`pollution.js:251`)在 severe tier(有效污染 80-99)**降玩家出手伤害 15%**(仅玩家攻击·敌反击不改),meltdown(≥100)/以下无修正。**不是放大伤害**。boss 关污染基线设 severe(§3)。
4. **数据点已回溯(§7)**:"裸属性 8 拳死"= **combatModes 口径产物**,非 live 富路径。富路径下 naked 反而稳赢老 boss(98-100%)。一行结论,不再纠。
5. **seq3-5 终值**(§6):elite `85/14/4`(stance_duel·已 live)、resource `90/16/5`(消耗)、boss `260/34/8`。填 07 + SQL 草稿。

---

## 1. 战斗模型(乙 = 富路径 · 已定)

### 1.1 两模型对照(为何乙)

| | combatModes(甲·未采纳)| 富路径(乙·采纳)|
|---|---|---|
| 玩家命中 | 100% | `Math.random()<0.85`(`gameActions.js:1840`)|
| 敌出手 | 每回合 | `counter 0.3`×`acc 0.85`≈**0.255/回合** |
| 伤害公式 | `max(1,floor(atk−def·0.5))`+crit | **同式**(`calcDamage`·`gameEngine.js:66-93`)|
| 污染 | 无 | severe 降己伤 15%(`pollution.js:251`)|
| RNG | seed-PRNG | `Math.random`(**违 R1**→🔧 D5 seed 化)|
| 难度形状 | 锐利闸门(1 点 atk 翻胜负)| **平滑曲线** |

- **甲被否**:敌每回合 → attrition razor margin → boss atk 20→21 使 prepared 95%→38%,无平滑带;且甲要推翻裁决 C「standard=富路径原样」。
- **乙被选**(🧭):敌仅 25% 反击 → 准备度梯度平滑映射胜率(§0.2 表),游戏性更好;污染给 boss 战额外张力。**代价**:🔧 需把 kaleido 域富路径 `Math.random`→seed-PRNG(D5·多人不动·R1 违规同批修)。

### 1.2 stance_duel 例外

seq3 stance_duel 已 LW-2 走 combatModes(`gameActions.js:1819-1822`),**不在 D5 迁移范围**;其平衡按 combatModes(§5)。standard/gauntlet 走乙。

---

## 2. seq5 boss 终值(富路径 · 8000 trials)

准备度曲线(§4):naked `10/5/100/2药` → minimal `12/6/110/4` → solid `14/8/120/4` → prepared `16/9/130/5` → over `19/11/145/6`。

**boss = `260/34/8`**:

| 污染 | naked | minimal | solid | prepared | over |
|---|---|---|---|---|---|
| 无 | 1% | 21% | 50% | 86% | 100% |
| **severe(boss 关设此·§3)** | 0% | 4% | 25% | **74%** | 98% |

- **读表**:naked/minimal 基本无解(跳过搜刮=输)、solid 25-50%(硬仗·真风险)、prepared 74-86%(有挑战的稳赢)、over 收尾。**每档都有意义 = 平滑曲线**。
- **调节点**(留 Kanata 亲测微调):若要 prepared 更稳(85%+)→ 弱化到 `240/30/7` 或 boss 关设无污染;若要更硬 → `280/36/8` 或提污染。
- boss 必带 combatSetup.enemy(07 §6 校验)。E2E boss_kill ✅ 不受影响(`kaleido-e2e.mjs:83-88` 注入 atk500/hp8000)。

---

## 3. 污染(乙的次要减益杠杆 · 方向已订正)

- **真实语义**(`pollution.js:251` + `constants COMBAT_DAMAGE_REDUCTION_SEVERE=-0.15`):`d = floor(d×(1−0.15))=0.85d`,**只在 severe tier(有效污染 80-99)、只对玩家出手伤害**(`gameActions.js:1881`);敌反击不过此修正;meltdown(≥100)/severe 以下无修正。**污染降玩家 DPS,不放大受伤**(我上一稿写反了,已订正)。
- **有效污染** = `0.6×env + 0.4×personal`(`constants WEIGHT_ENV/PERSONAL`);tier severe=80、meltdown=100(`tierFromValue`)。search+2/combat+4 personal、env +1/回合 → 一轮 run 到 boss 时估计落 severe~meltdown。
- **boss 关污染基线决策(⚙️)**:seq5 设 **severe(有效 ~85)** —— ①omega climax 最脏合理;②severe 保持 −15% 己伤作为**有意的难度因子**(prepared 86%→74%);③避开 meltdown(≥100)的熔断死亡计时器复杂化 boss 战。boss `260/34/8` 在 severe/无污染两端都给好曲线(§2),对污染不确定性鲁棒。
- **⚠ meltdown 死亡向量**:若污染到 ≥100,富路径有 pollution_meltdown 死亡计时(🔧 契约 §1.3 列),= boss 战外的额外时间压力。**seq5 设 severe 以避开**;若 Kanata 要"熔断倒计时"式 boss 张力,另设(engine·🔧)。

---

## 4. seq1-4 战力预算(喂 ③④ · 曲线的输入)

准备度档对应 seq1-4 投放:

| 战力源 | 单位增益(kaleido 尺度)| 彻底搜刮投放量 | 合计(→prepared)|
|---|---|---|---|
| 攻击强化件(持久)| +2 atk | ~3 | +6 atk |
| 防御强化件(持久)| +2 def | ~2 | +4 def |
| 容量扩展(持久)| +15 maxHp | ~2 | +30 hp |
| 恢复品(消耗)| +1 药(heal30)| ~3 + 起始 2 | 5 药 |

- **难度旋钮 = 投放曲线**:多少玩家搜到各档(naked→over)决定通关分布。曲线模型下,准备度直接平滑映射胜率(§2)。
- **⚠ kaleido 新尺度**:现 item_pool 多人标定(结构强化液 def+50、结构修复包 heal300)对 100-hp 玩家爆表 → ③④ 建 kaleido 专属道具。主投放窗口 = seq4(itemBias 高·chamber id8 max_items 7)。
- P1 gate:Kanata 亲测校准曲线(sim 给锚点)。

---

## 5. seq3 elite(stance_duel · combatModes live · 不受 D5 影响)

真模块 8000 trials × minimal 玩家:

| elite | clearRate |
|---|---|
| 70/12/4 | 96% |
| 80/13/4 | 86% |
| 90/15/5 | 49% |

- **stance 克制 washout**:敌姿态内部 RNG 均匀出(`index.js:157`),玩家 bot 只控自己 → counterMul 1.6 抵消,**clearRate ≈ 纯属性函数**。若要 stance 成技巧杠杆,需敌方对玩家历史反应(engine·🔧)。
- **推荐 elite ≈ `85/14/4`**(minimal ~75-80%·有威胁非高频 run-ender)。exit=survive_turns=5,但 stance_duel 到死判负=实质打赢决斗。

---

## 6. seq3-5 敌人/boss 终值(填 07 结构)

> kaleido 自有敌数值(npc_pool 多人标定不可用·07 §0.4)。**D5=乙 已定,以下为终值**(seq3 除外走 combatModes)。

| seq | archetype | 战斗模型 | **终值(kaleido 尺度)** | clear 目标 |
|---|---|---|---|---|
| 3 | elite(stance_duel)| combatModes(LW-2)| **85 / 14 / 4** | minimal ~75-80% |
| 4 | resource(消耗·非 kill 门)| 富路径 | **90 / 16 / 5** | 损耗玩家·不拦路 |
| 5 | boss(boss_kill)| 富路径 | **260 / 34 / 8** | prepared 74-86%·naked 0% |

- seq2 首战(gauntlet)复核见 07 §3.1(combatModes 安全证)——⚠ **注**:gauntlet 若也走乙(富路径)而非 combatModes,安全首战需按乙口径复核(敌 25% 反击 → 更安全,不会更危险,方向无忧;LW-3 gauntlet 落地后精算)。
- E2E:启用种子关时 send 🧭 协调重跑(boss 数值改·E2E 注入高属性故断言不破)。

---

## 7. 数据点回溯 + 待办

- **数据点回溯(② 交付)**:"裸默认属性 vs seq5 boss 8 交换死"(04 §5.2)——**结论:combatModes 口径产物**。E2E 死亡链(`kaleido-e2e.mjs`)对 boss 注入 atk500/hp8000(测状态机非平衡),未观测裸玩家死;富路径下 naked vs 老 boss(102/20/3)= 98-100% 稳赢(harness §0)。该数据点是用 combatModes(敌每回合)口径算的,**不代表 D5=乙 的 live 行为**。∴ 乙模型下 boss 须显著强于老采样值(260/34/8 vs 102/20/3)才成挑战 —— 已体现在终值。
- **给 ③④(下一步本轨并行)**:按 §4 预算建 kaleido 专属道具(持久 stat 件 + 小档恢复品 + 合成产物)。
- **给 🔧(经 🧭)**:D5 富路径 seed 化落地后,seq3-5 战斗才确定性可回归;boss 走已有 `:3404` 分支,seq3/4 战斗等内容注入消费器(07 §1.1)。
- **给 Kanata**:P1 gate 亲测曲线(§4);boss 松紧微调点(§2)。
- **产出物**:本文档 + `scripts/kaleido-d6-balance-sim.mjs`(只读双模型·可复现)。**D5=乙 定稿,终值可填 07 + SQL**。
