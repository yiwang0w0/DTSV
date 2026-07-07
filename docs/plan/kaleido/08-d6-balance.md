# KALEIDO · 08 D6 难度平衡核算(⚙️ KP1-G ② · 数值方案)

> 2026-07-07 · ⚙️ 游戏性轨 · 🧭 分配号段 08。依据:`07-d6-seed-levels.md`、`combatModes/index.js`、`gameActions.js:1817-2015`(live 战斗真源)、`gameEngine.js:65`(calcDamage)。
> **方法**:只读分析 harness `scripts/kaleido-d6-balance-sim.mjs`(8000 trials/格·非引擎代码)。所有数字 `node scripts/kaleido-d6-balance-sim.mjs` 可复现。
> **⚠ 本核算经对抗验证订正一次**:发现 kaleido 现有 standard/boss 战斗**不走 combatModes**,走遗留富路径 —— 两模型的 boss 数值差 ~4×、难度形状(闸门 vs 曲线)根本不同。**故本文出双模型数值 + 一个待 🧭/🔧 裁决的模型选型**。

---

## 0. 结论速览(给 🧭 · 含一个阻塞决策)

1. **🔴 核心发现 —— kaleido 有两套战斗模型,现 live 与设计目标不一致**(§1):
   - **combatModes**(`combatModes/index.js`):玩家 100% 命中 + 敌每回合出手 + seed-PRNG(R1 合规)。**只有 stance_duel 现走它**(LW-2)。
   - **遗留富路径**(`resolveNpcAttackAction`,`gameActions.js:1839+`):玩家 85% 命中 + 敌反击仅 `counter_rate 0.3 × acc 0.85 ≈ 0.255/回合` + 污染放大 + **`Math.random`(违反 R1!)**。**standard/gauntlet/boss 现走它**(D5/LW-3 迁移未做)。
   - 伤害公式两者**相同**(`calcDamage` = `combatModes.hit` = `max(1,floor(atk−def·0.5))`+crit 0.1×1.5);差异全在**命中率/反击频率/污染**。
2. **难度形状随模型根本不同**(§2):
   - combatModes → **锐利闸门**:boss atk 20→21 使 prepared 95%→38%,无平滑带。
   - 富路径 → **平滑曲线**:boss `260/34/8` 给 naked 1% / minimal 21% / solid 50% / prepared 86% / over 100%(每档准备度都有意义)。**之前"attrition 必是断崖"的结论是错模型的产物。**
3. **污染是富路径的主平衡杠杆**(§3):数据点"裸属性 8 交换死"在**无污染富路径下不成立**(naked 稳赢 100%);只在 combatModes 或 **高污染(×3)富路径**下成立。boss 关 chamber(omega_milestone pollution 100)天然高污染 → 富路径 boss 战被污染主导。
4. **∴ 阻塞决策(🧭/🔧)= D5 怎么实现**:kaleido standard/gauntlet 战斗**迁 combatModes**(R1 净·闸门·无污染战斗)**还是把富路径 seed 化**(保命中/反击/污染·平滑曲线)?**这决定全部 boss/敌人数值与难度手感。** ⚙️ 强推荐**富路径曲线模型**(游戏性更好·见 §2.3),但需 🔧 seed 化 + 污染入平衡。
5. **数值待模型定**:见 §6 双模型建议表。seq3 elite(stance_duel)已 live-faithful(LW-2·combatModes),其数值不受此决策影响。

---

## 1. 战斗模型分歧(核心发现 · 读真码确认)

### 1.1 现状(`gameActions.js:1817-2015` + `gameEngine.js:65`)

| | combatModes(`combatModes/index.js`)| 遗留富路径(`resolveNpcAttackAction`)|
|---|---|---|
| 玩家命中 | 100%(`hit()` 必中)| `Math.random()<0.85`(`:1840`)|
| 敌出手 | 每回合(`enemyStrikeAndSettle`)| `counter_rate 0.3`(`:1989`)× `acc 0.85`(`:1992`)≈ **0.255/回合** |
| 伤害公式 | `max(1,floor(atk−def·0.5))`+crit | **同式**(`calcDamage`+`evalFormula`·`gameEngine.js:66-93`)|
| 污染 | 无 | `applyPollutionCombatModifier`(`:1880`)放大 |
| RNG | seed-PRNG(R1 合规)| `Math.random`(**违反 R1**)|
| **谁现走它** | **仅 stance_duel**(`:1819-1822` LW-2)| **standard/gauntlet/boss**(fall through)|

- `combatModes.standard.resolveTurn` **零 live 调用**(grep 证);它是 P2 bot 模拟资产 + 迁移目标。
- kaleido 用 `Math.random` 违反 R1/R3(同 seed 不同输出)。**02 §3.5 D5「kaleido 战斗走 run seed 派生 PRNG」是 🔧 KP1-E 待办** —— 迁移未做。

### 1.2 D5 的两种实现(=模型选型)

- **实现甲:迁 combatModes**。kaleido standard/gauntlet 复制 stance_duel 的 LW-2 做法(走 `combatModes.resolveTurn`)。得:100% 命中 + 敌每回合 + 无命中/反击/污染 + R1 净。**难度 = 锐利闸门**。
- **实现乙:富路径 seed 化**。保留命中 0.85 / 反击 0.255 / 污染,只把 `Math.random` 换 seed-PRNG。得:R1 合规 + 保留现有战斗手感。**难度 = 平滑曲线**。
- **两者伤害公式相同,差异全在命中/反击/污染** → boss 数值差 ~4×(§2)。**这不是 ⚙️ 能定的,是引擎架构选型(🔧+🧭)。**

### 1.3 数据点判读(naked 8 交换死)

`node` 复现(harness §0):naked vs 旧 boss(102/20/3):

| 模型 | clearRate | avgTurns |
|---|---|---|
| combatModes | **0%** | 9.4 | ← 复现"死"
| 富路径 污染×1 | **100%** | 15.4 | ← 无污染:naked 稳赢
| 富路径 污染×2 | 35% | 11.2 |
| 富路径 污染×3 | 12% | 7.8 | ← 高污染才逼近"死"

**判读**:"裸属性 8 交换死"这个数据点,**要么来自 combatModes 口径,要么来自高污染富路径**。若它是 live 实测(富路径),则**污染当时很高** —— 印证 §3「污染是主杀伤源」。⚙️ 无法确定数据点原口径,建议 🧭 回溯它怎么测的。

---

## 2. seq5 boss 反解 · 双模型对照(8000 trials)

准备度曲线(seq1-4 搜刮/合成积累·§4):naked `10/5/100/2药` → minimal `12/6/110/4` → solid `14/8/120/4` → prepared `16/9/130/5` → over `19/11/145/6`。

### 2.1 模型甲(combatModes)—— 锐利闸门

| boss | naked | minimal | solid | prepared | over |
|---|---|---|---|---|---|
| 160/20/5 | 0 | 0 | 0 | 98% | 100% |
| **168/20/5** | 0 | 0 | 0 | **94%** | 100% |
| 200/26/6 | 0 | 0 | 0 | 0 | 2% |

- atk 越界即全灭(敌每回合 → 攻坚窗口极窄)。**推荐(若选甲)= 168/20/5**:prepared 稳赢·不足全输 = 准备度闸门。**无平滑带**(§0.2)。

### 2.2 模型乙(富路径)—— 平滑曲线

**污染×1(无污染):**

| boss | naked | minimal | solid | prepared | over |
|---|---|---|---|---|---|
| 168/20/5 | 81% | 100 | 100 | 100 | 100 | ← 太弱
| 200/26/6 | 24% | 91% | 99% | 100 | 100 |
| **260/34/8** | 1% | 21% | **50%** | **86%** | 100% | ← **漂亮曲线**
| 320/44/10 | 0 | 0 | 0 | 28% | 71% |

**污染×2(boss 关高污染更接近这档):**

| boss | naked | minimal | solid | prepared | over |
|---|---|---|---|---|---|
| **200/26/6** | 1% | 16% | 41% | **70%** | 93% | ← 含污染的好曲线
| 260/34/8 | 0 | 0 | 0 | 3% | 54% |

- **推荐(若选乙)**:无污染战斗 → boss `260/34/8`;boss 关计污染(omega chamber pollution 100 ≈ ×2)→ boss `200/26/6`。**两者都给 naked→over 平滑梯度**,每档准备度决定胜率。

### 2.3 ⚙️ 推荐:选乙(富路径曲线)

- **游戏性**:平滑曲线让"搜刮多一件/少一件"真实影响胜率(准备度梯度),比闸门的"够/不够"二元更有深度;污染给 boss 战额外张力(既有系统复用)。
- **代价**:需 🔧 把富路径 seed 化(实现乙)+ 污染纳入平衡口径。R1 靠 seed-PRNG 满足(非迁 combatModes)。
- **风险**:富路径 seed 化的确定性需 🔧 验证(命中/反击/污染 roll 全走 seed);污染累积模型需 ⚙️ 补核(本 harness 用 pollutionMult 粗估,非精确 `applyPollutionCombatModifier`)。

---

## 3. 污染:富路径的主平衡杠杆(仅模型乙)

- 富路径 `applyPollutionCombatModifier` 按环境+个人污染放大战斗伤害。boss 关 chamber(omega_milestone `pollution_base=100`)天然高污染 → boss 战被污染主导(§1.3:naked 无污染稳赢,×3 才死)。
- **∴ 若选乙**:污染是 boss 难度的主旋钮之一,boss 数值须与"到 boss 时的污染水平"联合调(污染越高 boss 基础值越低)。本 harness 的 `pollutionMult` 是粗略 sensitivity(1/2/3×),**精确曲线待 ⚙️ 补核 `applyPollutionCombatModifier` 真式 + 到 boss 的污染累积**(③④ 之后)。
- **若选甲**:combatModes 无污染战斗,此节不适用,boss 纯靠 atk/hp。

---

## 4. seq1-4 战力预算(喂 ③④ · 两模型共用)

准备度档(§2)对应 seq1-4 需投放约:

| 战力源 | 单位增益(kaleido 尺度)| 彻底搜刮投放量 | 合计(→prepared)|
|---|---|---|---|
| 攻击强化件(持久)| +2 atk | ~3 | +6 atk |
| 防御强化件(持久)| +2 def | ~2 | +4 def |
| 容量扩展(持久)| +15 maxHp | ~2 | +30 hp |
| 恢复品(消耗)| +1 药(heal30)| ~3 + 起始 2 | 5 药 |

- **⚠ 全 kaleido 新尺度**:现 item_pool 多人标定(结构强化液 def+50、结构修复包 heal300)对 100-hp 玩家爆表。**③④ 须建 kaleido 专属道具**或 kaleido 覆盖值。
- 主投放窗口 = seq4(resource·itemBias 高·chamber id8 max_items 7);seq1-2 保底 + seq3 少量。
- **难度旋钮 = 投放曲线**:多少玩家搜到 prepared → 决定通关分布(两模型皆然;曲线模型下更平滑)。P1 gate Kanata 亲测校准。

---

## 5. seq3 elite(stance_duel · 唯一 live-faithful 档)

stance_duel 已 LW-2 走 combatModes(`gameActions.js:1819-1822`),**不受模型选型影响**。真模块 8000 trials × minimal 玩家:

| elite 敌 | clearRate |
|---|---|
| 70/12/4 | 96% |
| 80/13/4 | 86% |
| 90/15/5 | 49% |

- **stance 克制 washout**(对抗验证 + 复核):敌姿态由内部 RNG 均匀出(`index.js:157`),玩家 bot 只控自己 → counterMul 1.6 在均匀敌上抵消,**clearRate ≈ 纯属性函数**,stance 选择几乎不动胜率。若要 stance 成技巧杠杆,需敌方对玩家历史反应(engine·🔧)。
- **推荐 seq3 elite ≈ `85/14/4`**(minimal ~75-80%·有威胁非高频 run-ender)。exit=survive_turns=5 但 stance_duel 到死判负 = 实质打赢决斗。

---

## 6. seq3-5 敌人/boss 数值建议(双模型 · 交 07 结构)

> kaleido 需自有敌人数值(npc_pool 多人标定不可用·07 §0.4)。**boss/seq4 敌数值随模型选型待定**;seq3 elite 已定(§5)。

| seq | archetype | 模型甲(combatModes)| 模型乙(富路径·含污染×2)| clear 目标 |
|---|---|---|---|---|
| 3 | elite(stance_duel·live)| **85/14/4**(不受选型影响)| 同 | ~75-80% |
| 4 | resource(消耗型)| 60/12/4 | 90/18/5 | 非 kill 门·损耗 |
| 5 | boss | **168/20/5** | **200/26/6**(含污染)/ 260/34/8(无)| 曲线/闸门 |

- seq5 boss 必带 combatSetup.enemy(07 §6 校验)。
- **07 §4 现填的是模型甲值(168/20/5)** —— 若 🧭 选乙,07 boss 行改 §6 乙列值。已在 07 标注模型待定。
- E2E:boss 战前注入 atk500/hp8000(`kaleido-e2e.mjs:83-88`),任意 boss hp 秒杀 → boss_kill 断言不受影响 ✅。

---

## 7. 待决 / 交接

- **🔴 给 🧭/🔧(阻塞)**:D5 实现选型 —— 迁 combatModes(甲·闸门)vs 富路径 seed 化(乙·曲线)。⚙️ 推荐乙(§2.3)。**此决策定全部 boss/敌人数值**;定后 ⚙️ 出终值填 07 + 种子关 SQL。
- **给 🧭/Kanata**:数据点"8 交换死"原口径回溯(§1.3);P1 gate 亲测经济曲线(§4)。
- **给 ③④(下一步本轨)**:按 §4 战力预算建 kaleido 专属道具;若选乙,补核 `applyPollutionCombatModifier` 真式做污染平衡。
- **产出物**:本文档 + `scripts/kaleido-d6-balance-sim.mjs`(只读双模型 harness·可复现)。**数值 model-contingent,待选型定稿**;seq3 elite 已 live-faithful 可定。
