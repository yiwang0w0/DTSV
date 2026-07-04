# 02 · 战斗效果钩子管线 (Combat Pipeline + Skill/Effect Hook Engine)

> ⚠️ **勘误（2026-07-04）：本文档的 API 细节已过时，接线一律以代码为准。**
> 实际实现（`src/lib/combatPipeline.js` + `scripts/phase-43-combat-pipeline.sql`）：
> - 阶段名用**短名** `add / mult / invincible / special / limit / insurance / seckill`（本文的 additive/multiplicative/invulnerable/clamp/lifesave/execute 长名作废）；
> - 签名为 `runCombatPipeline(ctx, evalFn)`（ctx 含 base/defenderHp/modifiers/vars；本文的 `(baseDamage, ctx, modifiers)` 作废）；
> - P4.5 新增 `OFFENSIVE_STAGES=[add,mult,seckill]` / `DEFENSIVE_STAGES=[invincible,special,limit,insurance]` 攻守方向二分（本文未涉及）。
> **进度**：P0-P4.5 已完成（schema/纯函数/全路径接线/authoring/方向性）；剩 P6 死事件派发。本文其余部分仅作设计动机/背景参考。

> 子系统：**运行地基 · 元移植**
> 依赖：`01-content-authoring-engine`（后台编辑地基 — 本子系统的 authoring UI 寄生其中）
> 是谁的地基：`04-技能树` / `06-PVPVE 战斗循环` 的**运行时**地基（authoring 由 01 提供，运行由 02 提供）
> portValue：**最高** — 一次性偿还 `gameActions` 上帝文件 + 8-perk 白名单两笔结构债
> 红线：守 Phase 37「空配置 ⇒ 数值逐值不变」中性铁律；只取 dts「意图」、落地 DTSV 原生（JS 纯函数 + JSONB + ID 引用）

---

## ① 目标与范围

### 1.1 要解决的真问题

今天 DTSV 的战斗是「一锤子买卖」：

```
calcDamage(attacker, defender, rules)  →  出一个 number  →  直接 Math.max(0, hp - dmg)
```

- `calcDamage`（`src/lib/gameEngine.js:103`）内部已含「公式 + 暴击」两步，但产出后**就是一个标量**，没有任何「阶段」可以介入。
- `triggerPassives`（`src/lib/equipmentEngine.js:552`）是**另一条流**：它在伤害扣完之后追加额外 damage/heal/buff，但**改不了在途的主伤害**——拿不到 `damage` 这个中间量，只能在旁边再造一笔。
- 后果：想做「受击时 50% 减伤」「HP 低于 30% 时无敌一回合」「秒杀线以下直接处决」这类**主流程拦截型**技能，今天的结构**做不出来**——只能造旁路伤害，永远改不了那一下主伤害本身。

### 1.2 死配置（已经存在但从未派发的事件）

后台 `EquipmentPassivesSection.jsx:10-17` 的 `TRIGGER_EVENTS` 枚举了 6 个触发时机：

| 事件 | admin 可选 | 运行时派发？ |
|---|---|---|
| `on_attack` | ✅ | ✅ 派发（`gameActions.js:1685, 1907`） |
| `on_kill` | ✅ | ✅ 派发（`gameActions.js:1716, 1992`） |
| `on_defend`（被攻击时） | ✅ | ❌ **从未派发** |
| `on_turn_start`（每回合开始） | ✅ | ❌ **从未派发** |
| `on_hp_below_30`（HP<30%） | ✅ | ❌ **从未派发** |
| `on_equip`（装备时一次性） | ✅ | ❌ **从未派发** |

用户在后台可以**填**这 4 个事件、存进 `passive_skills` 表、卡片上正常显示——但游戏里**永远不会触发**。这是「authoring 与 runtime 脱节」的典型割裂，必须收口。

### 1.3 本子系统的范围

**做：**
- 新建 `src/lib/combatPipeline.js`（纯函数·无 DB·无副作用·无 import 别名，与 `combatStats.js` 同约束 → 可被原生 Node ESM smoke test 直接导入）。
- 把 `calcDamage` 的单点扣血改为「**有序阶段管线**」：`baseDamage → 加算 → 乘算 → 无敌 → 特殊 → 限制 → 保命 → 秒杀`。空 modifier 池时**每个阶段都是恒等变换** → 输出逐值 === 今天的 `calcDamage`。
- 扩 `passive_skills`：加 `stage` / `priority` / `condition_formula` 三列，让被动能声明「在管线哪个阶段、以什么优先级、满足什么条件时」对在途 `damage` 做变换（复用既有 `effect_formula` 作该阶段的变换函数）。
- 补派发 `on_defend` / `on_hp_below_30` / `on_turn_start` / `on_equip` 四个死事件。
- `classes.perks` 加 `pipeline_modifiers` JSONB（**8-perk 白名单保留向后兼容**；新机制走 JSONB，不再扩白名单 —— 这是偿还白名单结构债的方式）。
- `attackNpc`（`resolveNpcAttackAction` `gameActions.js:1627`）/ `attackPlayer`（`resolvePlayerAttackAction` `gameActions.js:1862`）/ 探针 combat（`gameActions.js:3200`）三条战斗路径接 `collectModifiers → runCombatPipeline → 扣血`。

**不做（明确边界）：**
- 不碰 `computeCombatStats`（`combatStats.js`）—— stat 组装是 Phase 37 的事，管线只管「stat 算完之后、那一下伤害怎么走」。两者串联：`computeCombatStats` 出实体面板 → `calcDamage` 出 baseDamage → **管线**对 baseDamage 做阶段变换。
- 不做技能树 UI（那是 `04`）、不做合成链（那是 `03`/道具优先）。本子系统只交付**运行地基 + 最小 authoring 扩展**。
- 不碰残片可发现性 / 六纪元 lore / 缩圈致死 / 房间投放（红线 ④ 沿用）。
- **模式范围**：只服务 搜打撤 PVE + PVPVE。孤立的 `br_match*` 第二战斗实现**不接管线**，按项目记录单独 teardown（见 `⑥`）。

### 1.4 dts 意图模型（去 `D:\Fragments\_dts_clone` 核实后的结论）

dts 的「技能/效果钩子引擎」意图（`include/modules/skillbase.readme.txt` + `skillinfo.readme.txt`）：

- 每个技能是一个 **module**，在固定的**生命周期事件**点「接管」（takeover）系统函数：`skill_onload_event` / `skill_onsave_event` / `strike_prepare()`（战斗发动前判定+扣怒气）/ `act()`（操作界面主动技）。
- 战斗技在 `strike_prepare()` 里**判断能否发动、扣资源、改 `bskill` 域**——这正是「在伤害结算前拦截」的钩子点。
- 技能用 `MOD_SKILLnnn_INFO` 标签声明属性（`battle`/`active`/`upgrade`/`feature`…），系统据标签决定何时调用哪个 hook。

**意图提炼**：dts 有一套「命名事件 → 多个技能在该事件点排队介入 → 每个技能自己判定条件并修改战斗中间态」的钩子分发机制。

**DTSV 原生落地（绝不照搬）**：
- dts 用 **PHP namespace + 函数名串匹配 + 全局变量 `$pa`** 实现「接管」——DTSV **不做**。
- DTSV 用**声明式数据行**：`passive_skills.stage`（在哪个阶段介入）+ `priority`（排队顺序）+ `condition_formula`（条件）+ `effect_formula`（变换），由 `combatPipeline.js` 一个纯函数按 `stage→priority` 有序跑完。**无 eval-of-code**（复用 `evalFormula` 的白名单沙箱，只求值数字表达式）、**无全局变量**（管线吃 `ctx` 出 `ctx`，纯函数）、**无名串匹配**（引用一律 `id`）。
- dts「改名即断链」的坑（技能靠名字/编号串联）→ DTSV 全程 `passive_skill_id` / `class_id` 外键引用，改名不断链。

---

## ② 数据模型

### 2.0 现状盘点（核实结论）

`passive_skills` 表的 `CREATE TABLE` **不在本仓 `scripts/`**（经 Supabase UI 或仓外迁移建立）。从 `EquipmentPassivesSection.jsx` 的 `EMPTY_PASSIVE`（:26-30）+ `equipmentEngine.js:552-625` 的读取，可逆推现有列：

```
passive_skills (现有列 · 逆推):
  id              bigserial PK
  name            text
  icon            text
  description     text
  trigger_event   text     -- on_attack / on_defend / on_kill / on_turn_start / on_hp_below_30 / on_equip
  effect_type     text     -- damage / heal / buff / debuff / elemental / stat_boost
  effect_formula  text     -- evalFormula 白名单表达式（变量: atk,def,hp,maxHp,value,enemyHp）
  effect_target   text     -- self / enemy / all
  trigger_chance  real     -- 0~1
  buff_id         bigint   -- → buff_pool.id（effect_type ∈ {buff,debuff} 时）
  cooldown_turns  int
  value           numeric
  created_at      timestamptz
```

> 设计文档**不能假设**列存在 —— 本子系统的 migration 用 `ADD COLUMN IF NOT EXISTS`，部署前先跑「列盘点」校验查询（见 `⑥`）。

`evalFormula`（`gameEngine.js:16-52`）已是**安全求值器**：白名单变量 + `forbidden = /[`${}[\]\\;'"]/g` 拒绝 + `new Function` 仅注入受控 scope + `"use strict"` + 结果非数字回 0。**本子系统全程复用它**，绝不引入新的 eval 路径。

### 2.1 迁移 A — `passive_skills` 扩列（管线介入声明）

```sql
-- scripts/phase-XX-combat-pipeline.sql
BEGIN;

-- 列盘点先行（部署前手动跑·确认基线列存在·见 ⑥）

-- ── 管线阶段：被动在哪个阶段介入在途 damage ──
--   NULL = 不参与管线（纯走旧 triggerPassives 旁路·向后兼容）。
--   非 NULL ⇒ 该被动是「管线 modifier」，在指定 stage 对 damage 做 effect_formula 变换。
ALTER TABLE passive_skills ADD COLUMN IF NOT EXISTS stage text;

-- ── 优先级：同 stage 内的执行顺序（小先大后·稳定排序）。DEFAULT 100 = 中性档位 ──
ALTER TABLE passive_skills ADD COLUMN IF NOT EXISTS priority int NOT NULL DEFAULT 100;

-- ── 条件公式：该 stage 是否生效的布尔门（evalFormula 求值·>0 视作真·空=恒真） ──
--   复用 evalFormula 白名单；变量: damage, atk, def, hp, maxHp, hpPct, value, enemyHp, targetHp
ALTER TABLE passive_skills ADD COLUMN IF NOT EXISTS condition_formula text;

-- 约束：stage 非空时必须是已知阶段名（CHECK·防脏数据·与 combatPipeline.js STAGES 同源）
ALTER TABLE passive_skills DROP CONSTRAINT IF EXISTS passive_skills_stage_chk;
ALTER TABLE passive_skills ADD CONSTRAINT passive_skills_stage_chk
  CHECK (stage IS NULL OR stage IN
    ('additive','multiplicative','invulnerable','special','clamp','lifesave','execute'));

-- 索引：按 stage+priority 查活跃 modifier（运行时按阶段拉取）
CREATE INDEX IF NOT EXISTS passive_skills_stage_priority_idx
  ON passive_skills (stage, priority) WHERE stage IS NOT NULL;

COMMENT ON COLUMN passive_skills.stage IS
  '管线介入阶段(NULL=不参与管线·纯旧旁路·向后兼容)。非空⇒在该阶段以 effect_formula 变换在途 damage。';
COMMENT ON COLUMN passive_skills.priority IS
  '同 stage 内执行顺序(升序·稳定)。DEFAULT 100 中性档;留 0/50/100/150/200 给用户排序。';
COMMENT ON COLUMN passive_skills.condition_formula IS
  '该 stage 生效门(evalFormula·>0 真·空=恒真)。变量: damage/atk/def/hp/maxHp/hpPct/value/enemyHp/targetHp。';

COMMIT;
```

**中性证明**：现有所有 `passive_skills` 行 `stage IS NULL`（新列默认）→ `collectModifiers` 跳过它们 → 管线 modifier 池为空 → 每阶段恒等 → 逐值等于今天。现有 `on_attack`/`on_kill` 被动**继续**走 `triggerPassives` 旁路（不变）；只有用户**主动**给某被动填 `stage` 才进管线。

### 2.2 迁移 B — `classes.perks.pipeline_modifiers`（JSONB·不扩白名单）

`classes.perks` 已是 JSONB（`phase-24c-classes.sql:28`）。8-perk 白名单（`PERK_WHITELIST` `classes.js:15-24`）**保留不动**——它们是「stat 组装期」乘子（`combat_dmg_mult` 等，喂 `computeCombatStats`）。

新机制**不扩白名单**，改在 `perks` 里加一个**结构化数组** key `pipeline_modifiers`：

```jsonc
// classes.perks 形状（向后兼容·旧职业无此 key → 空数组 → 中性）
{
  "combat_dmg_mult": 0.15,          // ← 旧白名单 perk（stat 期·不动）
  "pipeline_modifiers": [           // ← 新增（管线期·可选·缺省=[]）
    {
      "stage": "lifesave",
      "priority": 50,
      "condition": "hpPct < 0.15",  // evalFormula 布尔门
      "transform": "max(damage, hp - 1)",  // 把伤害夹到「至多剩 1 血」(职业版不屈)
      "chance": 1.0,                // 触发概率(缺省 1.0)
      "label": "伊甸不屈"            // 日志用
    }
  ]
}
```

- **为什么不扩白名单**：白名单是「stat 乘子」的安全护栏（admin 只接受已知 key）。管线 modifier 是「结构化对象数组」，无法用 flat key 表达；强行扩白名单会让 `filterPerks`（`classes.js:34`）逻辑复杂化。改用一个**有 schema 校验的 JSONB 子结构**，护栏由 `combatPipeline.js` 的 `parseModifier()` 做（拒绝未知 stage、非法 formula、`chance` 越界）—— 护栏从「key 白名单」升级为「结构 + 阶段 + 公式三重校验」。
- **runtime 读取**：`collectModifiers` 读 `player.classPerks.pipeline_modifiers`（`applyClassToPlayer` 已把 `perks` 挂到 `classPerks`，但 `filterPerks` 当前只保白名单 key → **需放行** `pipeline_modifiers`，见 `④`）。

```sql
-- 迁移 B 无需 DDL（perks 已是 jsonb）。仅文档约定 + filterPerks 放行(代码侧)。
-- 可选：加一个 GIN 索引以便后台按 pipeline_modifiers 存在性筛选职业（非必须）
CREATE INDEX IF NOT EXISTS classes_perks_gin_idx ON classes USING gin (perks);
```

### 2.3 管线阶段定义（`combatPipeline.js` 单一真源）

```
STAGES（固定有序·阶段名是 passive_skills.stage / pipeline_modifiers.stage 的合法值）:

  顺序  阶段           语义                                   恒等(空池)行为
  ──────────────────────────────────────────────────────────────────────
  0    baseDamage     calcDamage 产出(暴击在此内·不开放)        damage = calcDamage(...)
  1    additive       加减常量 (damage + k)                    +0
  2    multiplicative 乘系数   (damage * k)                    *1
  3    invulnerable   无敌门   (满足条件 ⇒ damage = 0)          不触发 ⇒ 不变
  4    special        自定义变换(effect_formula 任意算)         formula 恒等 ⇒ 不变
  5    clamp(限制)    上下限夹取 (min/max damage)              夹到 [0, +∞) = 不变
  6    lifesave(保命) 保命门   (damage = min(damage, hp-1))     不触发 ⇒ 不变
  7    execute(秒杀)  处决门   (满足条件 ⇒ damage = targetHp)    不触发 ⇒ 不变
  ──────────────────────────────────────────────────────────────────────
  finalize: appliedDamage = clamp(round(damage), 0, targetHp)  // 与旧 Math.max(0, hp-dmg) 等价
```

> `baseDamage` 是 stage 0 但**不对外开放**（用户不能往这阶段填 modifier）——它就是调用 `calcDamage`。开放的是 1~7。`special` 阶段是「逃生舱」：任何不属于前述类别的怪招都落这里（如「按目标缺失血量百分比追伤」），用 `effect_formula` 自由表达。

---

## ③ 后台编辑（在内容引擎里 authoring）

> 寄生于 `01-content-authoring-engine`。本子系统**扩展** `EquipmentPassivesSection.jsx`（被动技能编辑器），并在 `ClassesTab` 加一个 `pipeline_modifiers` repeater。

### 3.1 `EquipmentPassivesSection.jsx` 扩展（被动 → 管线 modifier）

现有抽屉（`EquipmentPassivesSection.jsx:121-213`）已有：触发时机 / 效果类型 / 作用目标 / 触发概率 / 冷却 / 基础值 / 效果公式 + `FormulaPreview`。**新增一个折叠区**「⚙ 管线介入（高级）」：

| 字段 | 控件 | 校验 | 默认 |
|---|---|---|---|
| 启用管线介入 | toggle | — | 关（`stage=null`） |
| 介入阶段 `stage` | select（7 阶段中文标签） | 开启时必填 | `multiplicative` |
| 优先级 `priority` | number | 0~999 | 100 |
| 条件公式 `condition_formula` | textarea + `FormulaPreview` | evalFormula 能求值（错→红） | 空（恒真） |
| 变换公式 | 复用现有 `effect_formula` textarea | 同上 | `damage`（恒等） |

- **变量提示**更新：管线阶段的公式可用 `damage`（在途伤害·关键新变量）、`hpPct`（= hp/maxHp）、`atk/def/hp/maxHp/value/enemyHp/targetHp`。
- **预览**：`FormulaPreview`（`ui.js:110`）的 `testVars` 注入 `damage:200`（示例在途伤害），让用户直观看到「200 伤害经此公式 → 多少」。例如 `multiplicative` 阶段填 `damage * 0.5` → 预览 `= 100`（减伤 50% 一目了然）。
- **阶段语义气泡**：选 `invulnerable` 时提示「满足条件则本次伤害归 0（无视变换公式）」；选 `lifesave` 提示「至多打到剩 1 血」；选 `execute` 提示「满足条件直接打掉目标全部 HP」—— 让非程序用户也能填对。

> **校验**：`save()`（`EquipmentPassivesSection.jsx:54`）前置 `stage` 合法性 + 公式可求值 + priority 范围。非法→ toast 报错不落库（呼应「易写的内容编辑引擎」主轴：authoring 工具要成熟好用、填错当场拦）。

### 3.2 `ClassesTab` 扩展（职业 → `pipeline_modifiers`）

职业编辑里加一个 repeater「职业战斗钩子」，每行 = 一个 `pipeline_modifiers[]` 对象（stage/priority/condition/transform/chance/label）。同样接 `FormulaPreview`。空 repeater → `perks.pipeline_modifiers` 不写或写 `[]` → 中性。

### 3.3 派发预览（authoring 闭环·可选增强）

在被动卡片上标注「此被动会在 **〔被攻击时·乘算阶段·优先级 100〕** 触发」——把 trigger_event（什么时候算这个被动）和 stage（在伤害管线哪一步插手）两个维度都显示出来，消除「填了不知道会不会触发」的割裂（直接回应 `1.2` 死配置问题）。

---

## ④ 运行端集成（DTSV 哪个文件怎么消费）

### 4.1 新文件 `src/lib/combatPipeline.js`（纯函数核心）

```js
// 约束：无 import 别名(@/)、无 DB、无副作用 → 可被原生 Node ESM smoke test 直接导入
//       (同 combatStats.js / roomState.js 约束)。复用 evalFormula 时从 './gameEngine' 相对引入。

export const STAGES = ['additive','multiplicative','invulnerable','special','clamp','lifesave','execute']

// 解析 + 校验一个 modifier(来自 passive_skills 行 或 pipeline_modifiers 对象)。
// 非法(未知 stage / 公式带禁字符 / chance 越界) → 返回 null(丢弃·不抛)。
export function parseModifier(raw) { /* 阶段白名单 + chance clamp + 公式存在性 */ }

// 从「攻击者被动 + 攻击者职业 pipeline_modifiers + 防御者被动(on_defend 类)」收集 modifier。
// 返回按 stage→priority 稳定排序的扁平数组。空输入 → []。
export function collectModifiers({ attackerPass, attackerClassPerks, defenderPass }) { /* … */ }

// 管线主函数：纯函数·吃 ctx 出 { damage, logs }。modifiers 为空 ⇒ damage 原样返回(恒等)。
export function runCombatPipeline(baseDamage, ctx, modifiers) {
  let damage = baseDamage
  const logs = []
  for (const stage of STAGES) {
    for (const m of modifiers.filter(x => x.stage === stage)) {
      if (m.chance != null && Math.random() > m.chance) continue
      const vars = { damage, ...ctx.vars, hpPct: ctx.targetHp / Math.max(1, ctx.targetMaxHp) }
      if (m.condition_formula && evalFormula(m.condition_formula, vars) <= 0) continue
      const next = applyStage(stage, damage, m, vars, ctx)   // 见下表
      if (next !== damage && m.label) logs.push(`⚙ 【${m.label}】生效`)
      damage = next
    }
  }
  return { damage: Math.max(0, Math.min(Math.round(damage), ctx.targetHp)), logs }
}
```

`applyStage` 各阶段语义（恒等性保证）：

| stage | 行为 | 空 modifier ⇒ |
|---|---|---|
| additive | `damage + evalFormula(transform)` | 不调用 → 不变 |
| multiplicative | `damage * evalFormula(transform)`（transform 直接是系数式） | 不调用 → 不变 |
| invulnerable | 条件真 → `0`；否则 `damage` | 无 modifier → 不变 |
| special | `evalFormula(transform, {damage,...})` | 无 modifier → 不变 |
| clamp | `min(max(damage, lo), hi)`，lo/hi 来自公式 | 无 modifier → 不变 |
| lifesave | `min(damage, hp-1)` 当条件真 | 无 modifier → 不变 |
| execute | 条件真 → `targetHp`（打满）；否则 `damage` | 无 modifier → 不变 |

> **暴击位置**：暴击今天在 `calcDamage` 内（`gameEngine.js:127`）。本子系统**不动它**——暴击仍是 stage 0 的一部分。若未来想把暴击拆成管线阶段（让职业能改暴击率/暴伤），那是 `04` 技能树的增量，本期不做。

### 4.2 接入三条战斗路径（`gameActions.js`）

**今天**（以 `resolveNpcAttackAction` 为例，`gameActions.js:1679-1701`）：
```js
const damageRaw = calcDamage(me, buildCombatNpc(instance), rules, weaponSubKind)
triggerPassives('on_attack', me, ..., me._pass, buffPool)        // 旁路：改不了 damageRaw
const damageOut = applyPollutionCombatModifier(damageRaw, ...)    // 污染修正(保留)
instanceHpAfter = Math.max(0, instance.hp - damageOut)           // 单点扣血
```

**改后**：
```js
const baseDamage = calcDamage(me, target, rules, weaponSubKind)   // stage 0(不变)
const modifiers = collectModifiers({
  attackerPass: me._pass,                       // 已有：装备被动(fetchEquippedInstances join passive)
  attackerClassPerks: me.classPerks,            // 已有：含 pipeline_modifiers(放行后)
  defenderPass: targetCombat._pass,             // 防御方装备被动(on_defend 类 → invulnerable/clamp 阶段)
})
const { damage: pipedDamage, logs } = runCombatPipeline(baseDamage, {
  targetHp: target.hp, targetMaxHp: target.maxHp,
  vars: { atk: me.atk, def: target.def, hp: target.hp, maxHp: target.maxHp,
          enemyHp: target.hp, targetHp: target.hp },
}, modifiers)
appendResolutionLogs(resolution, logs, 'buff')
triggerPassives('on_attack', me, ..., me._pass, buffPool)         // 旁路被动仍跑(向后兼容)
const damageOut = applyPollutionCombatModifier(pipedDamage, ...)  // 污染修正仍在管线之后
instanceHpAfter = Math.max(0, instance.hp - damageOut)
```

三处插入点（统一改法）：
- `resolveNpcAttackAction` — 玩家打 NPC：`gameActions.js:1679`（主伤害）+ `:1813`（NPC 反击）
- `resolvePlayerAttackAction` — PvP：`gameActions.js:1906`（主伤害）+ `:1932`（反击）
- 探针 combat：`gameActions.js:3200`（我打探针）+ `:3207`（探针打我）

> **顺序铁律**：管线在 `calcDamage` 之后、`applyPollutionCombatModifier`（污染修正）之前还是之后？→ **管线在前、污染在后**。因为污染是「环境系统」修正，不属于「技能钩子」；保持污染逻辑原位不动（红线 ④ 不碰污染），管线只在「裸伤害 → 污染修正」之间插队。空管线 ⇒ `pipedDamage === baseDamage` ⇒ 污染修正输入不变 ⇒ 逐值等于今天。

### 4.3 补派发 4 个死事件

| 死事件 | 派发点 | 落地方式 |
|---|---|---|
| `on_defend` | 防御方在被扣血前 | 在 `runCombatPipeline` 的 `invulnerable`/`clamp` 阶段消费防御方被动（已含在 `collectModifiers` 的 `defenderPass`）—— `on_defend` 被动**就是**「stage 非空的防御方被动」 |
| `on_turn_start` | `runTurnStartSettlement`（`eventResolver.js:72`）循环内，`processBuffs` 之后、`tickPassiveCooldowns` 之前 | 调 `triggerPassives('on_turn_start', player, null, player._pass, buffPool)`；但 `_pass` 在 turn-start 还没组装 → 需先拉该玩家已装备被动（见开放决策） |
| `on_hp_below_30` | 任一扣血结算后，检测 `hp/maxHp < 0.3` 且本回合首次跨过阈值 | 在三条路径扣血后加门控派发 `triggerPassives('on_hp_below_30', ...)`（用 player 上一个 flag 防重复触发） |
| `on_equip` | 装备 equip 动作时（一次性） | 在 equip API（`src/app/api/game/equipment/route.js`）成功后派发；效果写入 player 的持久 buff/stat（非战斗内） |

> `on_defend` 用管线消费、`on_turn_start`/`on_hp_below_30`/`on_equip` 用 `triggerPassives` 旁路消费——**两条路并存**：管线管「在途伤害变换」，`triggerPassives` 管「追加 damage/heal/buff」。这不矛盾，是职责分层。

### 4.4 `filterPerks` 放行 `pipeline_modifiers`（`classes.js:34`）

```js
// 现状：filterPerks 只保 PERK_WHITELIST 的 8 个 flat key → pipeline_modifiers 会被吃掉。
// 改：白名单仍管 flat key；pipeline_modifiers 作为结构化子结构单独放行 + parseModifier 校验。
export function filterPerks(raw) {
  const out = {}
  const src = raw || {}
  for (const key of PERK_WHITELIST) {
    if (src[key] != null) out[key] = src[key]
  }
  if (Array.isArray(src.pipeline_modifiers)) {
    out.pipeline_modifiers = src.pipeline_modifiers
      .map(parseModifier).filter(Boolean)   // 校验 + 丢非法 → runtime 只见合法 modifier
  }
  return out
}
```

> 这一步同时让 **NPC 复用**（`resolveNpcCombatProfile` `gameActions.js:493` 也调 `filterPerks`）—— NPC 配了职业即自动获得职业战斗钩子，玩家/NPC 口径完全一致（呼应 Phase 37「同公式」精神）。

---

## ⑤ 分阶段落地步骤（每步可独立上线·标明先后）

| Phase | 标题 | 内容 | 独立上线？ | 风险 |
|---|---|---|---|---|
| **P0** | 列盘点 + migration A | 跑列盘点校验 → `passive_skills` 加 stage/priority/condition_formula + CHECK + index。**不接任何 runtime** | ✅（纯加列·中性·现有行 stage=NULL） | 低 |
| **P1** | `combatPipeline.js` 纯函数 + smoke test | 写 `runCombatPipeline`/`collectModifiers`/`parseModifier`；写 `scripts/smoke-pipeline.mjs` 断言「空池 ⇒ 输出 === calcDamage」 | ✅（纯函数·无调用方·无副作用） | 低 |
| **P2** | 接 PvE 主伤害（最小灰度） | **仅** `resolveNpcAttackAction:1679` 主伤害接管线；其余路径不动。验证空配置逐值不变 | ✅（一处·易回滚·`!modifiers.length` 短路） | 中 |
| **P3** | 接全部战斗路径 | PvP（`:1906/:1932`）+ NPC 反击（`:1813`）+ 探针（`:3200/:3207`） | ✅ | 中 |
| **P4** | authoring：`EquipmentPassivesSection` 管线折叠区 | 后台可填 stage/priority/condition + 预览。`filterPerks` 放行 | ✅（先有 runtime 再开 authoring·避免填了不生效） | 低 |
| **P5** | `classes.pipeline_modifiers` + ClassesTab repeater | migration B（GIN 索引可选）+ `filterPerks` 放行 + 职业战斗钩子编辑器 | ✅ | 低 |
| **P6** | 补派发 4 死事件 | `on_defend`（管线已覆盖·验证）+ `on_turn_start`/`on_hp_below_30`/`on_equip`（旁路派发） | 各事件可独立上线 | 中（turn_start 需组装 `_pass`） |

**`firstBuildableStep` = P0+P1 合并**：加 3 列（中性·零风险）+ 写纯函数 + smoke test。这一步**不改任何现有行为**，但建立了管线骨架和「空池恒等」的自动化证明，是后续一切的安全地基。

---

## ⑥ 安全 / 中性 / 迁移兜底

### 6.1 中性铁律（守 Phase 37「空配置 ⇒ 数值逐值不变」）

- **数据层**：新列 `stage DEFAULT NULL` → 现有被动不参与管线；`pipeline_modifiers` 缺省 `[]` → 职业无钩子。
- **代码层**：`runCombatPipeline(baseDamage, ctx, [])` 必须**逐值返回** `calcDamage` 的产出（`Math.max(0, Math.min(round(baseDamage), targetHp))` 与旧 `Math.max(0, hp - dmg)` 在 `hp - dmg` 语义上等价 —— 注意旧路径是 `hp - dmg` 后 clamp，管线是 `dmg` clamp 到 `[0,targetHp]` 后由调用方 `hp - dmg`；二者数学等价，smoke test 必须枚举边界证明）。
- **自动化证明**：`scripts/smoke-pipeline.mjs` 对 N 组随机 (atk,def,hp) **不接 modifier** 跑 `runCombatPipeline`，断言 `=== calcDamage` 的扣血结果。CI 红线。

### 6.2 安全（沿用既有沙箱·不开新口子）

- 所有公式（`condition_formula` / `transform` / `effect_formula`）走**同一个** `evalFormula`（`gameEngine.js:16`）：白名单变量 + `forbidden` 正则拒绝 `` `${}[]\;'" `` + `new Function` 受控 scope + 非数字回 0。**无 eval-of-code、无 `with`、无 require**。
- `parseModifier` 三重护栏：未知 `stage` 丢弃 / `chance ∉ [0,1]` clamp / 公式空或非法当恒等。脏数据**永不进管线**。
- 引用完整性：`buff_id → buff_pool.id`、职业 `class_id → classes.id` 全 FK；管线 modifier 全靠 `passive_skill_id` 行内自洽，**无名串匹配** → 杜绝 dts「改名断链」。

### 6.3 灰度 + 回滚

- P2 短路守卫：`if (!modifiers.length) { /* 走旧路径或直接 baseDamage */ }` —— 一行可关。
- 每 Phase 可独立 revert（加列不删数据；纯函数无副作用；接入点都是「在 calcDamage 与扣血之间插一段」，删掉即回旧行为）。
- BR 重放一致性：管线含 `Math.random()`（`chance` 判定）→ **与现有 `triggerPassives`/`calcDamage` 暴击同源**（都已用 `Math.random`），不新增重放不确定性来源。若未来 BR 要严格重放，PRNG 注入是 `04`/`06` 的统一改造，本期沿用现状。

### 6.4 `br_match*` 第二实现 teardown（模式收口）

`src/lib/server/br/*`（`match.js`/`actions.js`/`events.js`…）是孤立的第二套 BR 战斗实现，**不在搜打撤 PVE+PVPVE 范围**。本子系统的管线**不接入** `br/` 路径。按用户拍板，孤立 `br_match*` 按项目记录单独 teardown（不在本子系统做，但本文档标注：管线只服务 `gameActions.js` 主战斗循环，`br/` 实现视为待退役、不投入管线集成）。

---

## ⑦ 留给用户的开放决策

1. **`on_turn_start` 的 `_pass` 组装成本**：turn-start 派发被动需要每个玩家的已装备被动列表（`_pass`），但 `runTurnStartSettlement`（`eventResolver.js:72`）当前不查 `equipment_instances`。是 (a) 在 turn-start 额外查一次装备 join（每回合 +1 查询），还是 (b) 把 `_pass` 缓存进 `gamevars.players[id]`（equip 时写入）？后者省查询但增 gamevars 体积。

2. **管线 vs 旁路的边界**：`on_attack`/`on_kill` 现在走 `triggerPassives` 旁路（追加伤害）。是否要把它们也**可选**地迁进管线（让「攻击时」也能改主伤害而非只追加）？还是保持「旁路追加 / 管线变换」两条路永久分离？影响 authoring 心智模型复杂度。

3. **暴击是否进管线**：暴击今天锁在 `calcDamage` 内（固定 `crit_rate`/`crit_multiplier`）。是否要拆成 `multiplicative` 阶段的一个内置 modifier，让职业/装备能改暴击率暴伤？（属 `04` 技能树范畴，但接口要在这里预留。）

4. **`special` 阶段的变量面**：管线公式现规划暴露 `damage/hpPct/atk/def/hp/maxHp/enemyHp/targetHp`。是否要加 `attackerHp` / `weaponSubKind`（数值化）/ `envPollution` 等更多变量？变量越多表达力越强但 authoring 越难、`evalFormula` 白名单要同步扩。

5. **集卡/成就回归 dts 模型的耦合点**：用户倾向回归 dts「清晰的集卡/成就」模型（弃残片）。dts 里成就/卡片**也是 skill module**（`skill_table.readme.txt`：300-399 成就 / 400-599 卡片及独有技能）—— 即它们与战斗钩子**共用同一套引擎**。本管线是否要预留「卡片/成就也能挂 pipeline_modifier」的扩展位？这关系到 `04`/`06` 要不要复用本引擎承载集卡效果，是产品转向的结构决策。

6. **`on_equip` 一次性效果的落点**：装备时触发的被动（如「装备后永久 +10 atk」）效果写哪？(a) 写进 player 的持久 stat（但 equip/unequip 要对称撤销，易出 bug）；(b) 转成一个无限时长 buff 挂 `player.buffs`（复用 `processBuffs` 撤销逻辑）。倾向 (b) 但需用户确认 buff 系统能承载。
