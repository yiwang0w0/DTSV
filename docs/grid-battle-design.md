# DTSV 增强型战斗系统 — 架构设计文档 v2

> 设计理念：保持大逃杀的快节奏遭遇战，但每回合有多个有意义的决策
> 参考来源：ACFUN 大逃杀（姿态/策略/状态异常/部位伤害）+ Wakfu（AP 资源分配/技能选择）
> 不做网格战棋，战斗在一个面板内快速完成

---

## 一、设计目标

**现状问题**：战斗只有"攻击"和"逃跑"两个按钮，没有策略深度。

**目标**：让每个回合都有 3~5 个有意义的选择，但整场战斗仍然在 30 秒~2 分钟内结束。

**不做的事**：网格移动、战棋走位、漫长的多回合拉锯。

---

## 二、核心系统概览

```
┌──────────────────────────────────────────────────┐
│                  战斗回合                          │
│                                                    │
│  你有 6 AP。怎么分配？                              │
│                                                    │
│  ├─ 「斩击」(3AP) → 单次高伤害                      │
│  ├─ 「突刺」(4AP) → 更高伤害+穿甲                   │
│  ├─ 「连击」(2AP) → 低伤害但可多次使用               │
│  ├─ 「防御」(2AP) → 本回合减伤 40%                  │
│  ├─ 「道具」(2AP) → 使用背包物品回血                 │
│  └─ 「逃跑」(全AP) → 50% 成功率                    │
│                                                    │
│  NPC 回合：根据 AI 类型自动行动                      │
│  → 检测死亡/胜负 → 下一回合                         │
└──────────────────────────────────────────────────┘
```

---

## 三、系统详设

### 3.1 AP 行动点系统

每回合开始，当前行动者获得满额 AP（默认 6），在回合内自由分配：

| 动作 | AP 消耗 | 说明 |
|------|--------|------|
| 武器技能 | 2~5 | 取决于技能类型 |
| 防御 | 2 | 本回合受到伤害 -40% |
| 使用道具 | 2 | 消耗背包物品 |
| 逃跑 | 6（全部） | 成功率由策略决定 |

**关键决策**：6AP 可以打两次 3AP 技能，或一次 4AP 技能+一个 2AP 道具。这就是 Wakfu 的 AP 精髓——资源分配。

### 3.2 武器六系技能

不同武器类型提供不同的技能组合，角色装备/使用武器后获得对应技能：

#### 空手（默认）
| 技能 | AP | 伤害系数 | 说明 |
|------|-----|---------|------|
| 拳击 | 2 | 0.5× | 轻攻击，可连打 |
| 重踢 | 4 | 1.0× | 标准伤害 |

#### 殴系（钝器：木棍、铁锤等）
| 技能 | AP | 伤害系数 | 说明 |
|------|-----|---------|------|
| 挥击 | 3 | 1.0× | 标准攻击 |
| 重砸 | 5 | 1.6× | 高伤害 |
| 震击 | 4 | 0.7× | 附带：下回合敌方 ATK-20% |

#### 斩系（锐器：刀剑等）
| 技能 | AP | 伤害系数 | 说明 |
|------|-----|---------|------|
| 斩击 | 3 | 1.0× | 标准攻击 |
| 突刺 | 4 | 1.3× | 无视 30% 防御 |
| 连斩 | 2 | 0.6× | 低消耗，适合连打 |

#### 射系（远程：弓弩、枪械等）
| 技能 | AP | 伤害系数 | 说明 |
|------|-----|---------|------|
| 射击 | 3 | 1.0× | 标准攻击 |
| 精准射击 | 5 | 1.5× | 暴击率翻倍 |
| 压制射击 | 4 | 0.5× | 附带：敌方下回合-1AP |

#### 投系（投掷武器）
| 技能 | AP | 伤害系数 | 说明 |
|------|-----|---------|------|
| 投掷 | 3 | 0.9× | 标准攻击 |
| 连投 | 2 | 0.5× | 低消耗快攻 |
| 破甲投 | 5 | 0.8× | 永久降低敌方 DEF 10% |

#### 爆系（爆炸物）
| 技能 | AP | 伤害系数 | 说明 |
|------|-----|---------|------|
| 引爆 | 4 | 1.3× | 高伤害 |
| 集束投弹 | 6 | 2.0× | 极高伤害，消耗全部AP |

#### 灵系（灵力武器）
| 技能 | AP | 伤害系数 | 说明 |
|------|-----|---------|------|
| 灵弹 | 3 | 0.9× | 标准攻击 |
| 吸魂 | 4 | 0.7× | 伤害的 50% 转化为自身 HP |
| 灵盾 | 3 | 0× | 本回合+下回合防御+30% |

#### 通用动作（所有武器都可用）
| 动作 | AP | 说明 |
|------|-----|------|
| 防御 | 2 | 本回合受到伤害 -40% |
| 使用道具 | 2 | 使用背包中的物品 |
| 逃跑 | 6 | 放弃本回合所有行动尝试逃跑 |

### 3.3 姿态系统（来自 ACFUN 大逃杀）

玩家在**大世界中**设置姿态（不是战斗中切换），影响探索和战斗的整体表现：

| 姿态 | ATK | DEF | 发现率 | 隐蔽率 | 先制率 |
|------|-----|-----|--------|--------|--------|
| 通常 | — | — | — | — | — |
| 作战 | +25% | +10% | — | -15% | — |
| 探物 | -10% | -10% | +30% | — | -5% |
| 偷袭 | +15% | -20% | -5% | +10% | +25% |
| 治疗 | -20% | -20% | -20% | -20% | -20% |

- **发现率**：搜索时找到物品的概率加成
- **隐蔽率**：被其他玩家/NPC 发现的概率（越低越不容易被发现）
- **先制率**：遭遇战时先手攻击的概率（先手方第一回合获得 +1AP 奖励）

治疗姿态虽然全面削弱，但在原版中睡眠/治疗/静养的恢复效率大幅提升。

### 3.4 策略系统（来自 ACFUN 大逃杀）

策略决定**被攻击时**的应对方式（也在大世界中设置）：

| 策略 | 被动效果 |
|------|---------|
| 通常 | 无特殊效果 |
| 重视反击 | ATK+10%，DEF-10%，每回合 25% 概率反击（额外一次免费攻击） |
| 重视防御 | DEF+20%，ATK-10% |
| 重视躲避 | 逃跑成功率 +25%，被攻击伤害 -15%，ATK-20% |

### 3.5 战斗中先手/后手机制

遭遇战发生时，根据双方先制率判定谁先手：

- **先手方**：第一回合获得 7AP（比正常多 1AP），可以选择攻击或逃跑
- **后手方**：第一回合只有 5AP（比正常少 1AP）
- 第二回合开始，双方均为正常 6AP

这还原了原版"先发现对手可以选择攻击或逃走"的机制。

### 3.6 状态异常系统（Phase 2 实现）

| 异常 | 战斗效果 | 持续 | 来源 |
|------|---------|------|------|
| 中毒 | 每回合损失 5% maxHP | 3 回合 | 带毒武器/毒药 |
| 烧伤 | ATK -20% | 2 回合 | 火焰属性武器 |
| 冻结 | ATK/DEF/先制 全 -15% | 2 回合 | 冰冻属性武器 |
| 麻痹 | 每回合 -1AP | 2 回合 | 电击属性武器 |
| 混乱 | DEF -25%，反击率归零 | 2 回合 | 音波属性武器 |

### 3.7 部位伤害系统（Phase 2 实现）

攻击有概率（约 15%）造成致伤攻击，命中随机部位：

| 部位 | 无防具时效果 | 有防具时效果 |
|------|------------|------------|
| 头部 | 暴击率 -50% | 消耗防具耐久 |
| 胸部 | 回复效果 -30% | 消耗防具耐久 |
| 腕部 | ATK -15% | 消耗防具耐久 |
| 足部 | 逃跑成功率 -20% | 消耗防具耐久 |

受伤持续到使用"包扎"道具为止。

---

## 四、数据结构

### 4.1 Battle 对象 v2（替代现有 battle）

```javascript
battle = {
  // 基础信息
  id: string,
  opponent: {                    // NPC 或玩家信息
    id: string,
    name: string,
    type: 'npc' | 'player',
    hp: number,
    maxHp: number,
    atk: number,
    def: number,
    level: string,               // 'common' | 'elite' | 'boss'
    weaponKind: string,          // 'unarmed'|'blunt'|'blade'|'ranged'|'thrown'|'explosive'|'spirit'
    skills: Skill[],             // NPC 可用技能列表
    strategy: string,            // NPC 策略
    buffs: TempBuff[],           // 临时效果
    // Phase 2:
    // injuries: string[],       // 部位伤害 ['head','chest',...]
    // statusEffects: StatusEffect[],
  },

  // 回合管理
  turn: number,                  // 当前回合数
  whoseTurn: 'player' | 'opponent',  // 当前谁的回合
  playerAp: number,              // 玩家剩余 AP
  opponentAp: number,            // 对手剩余 AP

  // 玩家战斗临时状态
  playerBuffs: TempBuff[],       // 防御增益等临时效果
  isDefending: boolean,          // 本回合是否防御中

  // 先手信息
  firstStrike: 'player' | 'opponent',

  // 日志
  log: BattleLogEntry[],

  // 玩家的武器技能（根据装备武器类型生成）
  playerSkills: Skill[],

  // PvP 用
  pvp: boolean,
  opponentUid: string | null,
}

// 技能定义
Skill = {
  id: string,          // 'slash', 'thrust', 'defend' 等
  name: string,
  apCost: number,
  damageMult: number,  // 伤害系数（0 = 非伤害技能）
  effect: string|null,  // 'armorPierce'|'defBuff'|'atkDebuff'|'lifesteal'|'apSteal'|'critBoost'
  effectValue: number, // 效果数值（如 0.3 = 30%）
  description: string,
}

// 战斗临时效果
TempBuff = {
  type: string,        // 'defUp'|'defDown'|'atkDown'|'apDown' 等
  value: number,       // 效果数值
  duration: number,    // 剩余回合
  source: string,      // 来源技能
}

// 日志条目
BattleLogEntry = {
  text: string,
  type: 'system'|'damage'|'crit'|'heal'|'buff'|'debuff'|'flee'|'death'|'skill',
  turn: number,
}
```

### 4.2 玩家对象扩展

```javascript
player = {
  ...现有字段,

  // 新增
  stance: 'normal'|'combat'|'explore'|'ambush'|'heal',   // 姿态
  strategy: 'normal'|'counter'|'defense'|'evade',         // 策略
  weaponKind: 'unarmed',        // 当前武器类型（由装备决定）
  // Phase 2:
  // injuries: [],               // 部位伤害
  // statusEffects: [],          // 持续状态异常
}
```

### 4.3 NPC 表扩展

```sql
ALTER TABLE npc_pool ADD COLUMN weapon_kind TEXT DEFAULT 'unarmed';
ALTER TABLE npc_pool ADD COLUMN strategy TEXT DEFAULT 'normal';
-- ai_type 决定 NPC 的 AP 分配倾向
ALTER TABLE npc_pool ADD COLUMN ai_type TEXT DEFAULT 'aggressive';
-- 'aggressive': 全AP攻击
-- 'balanced': 攻击+偶尔防御
-- 'defensive': 优先防御+反击
```

---

## 五、战斗流程

### 5.1 战斗初始化

```
搜索遭遇 NPC / 主动攻击
    ↓
1. 判定先手（基于双方先制率 + 偷袭姿态加成）
2. 生成 NPC 技能列表（根据 weapon_kind）
3. 生成玩家技能列表（根据装备武器的 weapon_kind）
4. 加入通用动作（防御/道具/逃跑）
5. 先手方获得 7AP，后手方 5AP
6. 构建 battle 对象
7. 如果后手方是 NPC，先执行 NPC 回合
```

### 5.2 玩家回合

```
前端显示：
  - 对手状态（HP条、ATK/DEF、临时效果）
  - 自己状态（HP条、AP条、临时效果）
  - 技能按钮组（每个标注 AP 消耗和伤害预估）
  - 通用动作（防御/道具/逃跑）
  - 剩余 AP 显示
  - 「结束回合」按钮

玩家操作（可多次，直到 AP 用完或手动结束）：
  → 点击技能 → POST /api/game/battle { action:'skill', skillId }
  → 点击防御 → POST /api/game/battle { action:'defend' }
  → 点击道具 → POST /api/game/battle { action:'useItem', itemName }
  → 点击结束回合 → POST /api/game/battle { action:'endTurn' }
  → 点击逃跑 → POST /api/game/battle { action:'flee' }

每次操作后端返回更新后的 battle 对象，前端实时刷新
```

### 5.3 NPC 回合（AI）

```javascript
function runNpcAI(battle, npc, rules) {
  let ap = battle.opponentAp

  // 根据 ai_type 决定行为
  if (npc.ai_type === 'defensive' && npc.hp < npc.maxHp * 0.3) {
    // 低血量防御型：先防御
    ap -= 2; addBuff(npc, 'defUp', 0.4, 1)
  }

  // 选技能：优先高伤害、AP 够用的
  const skills = npc.skills
    .filter(s => s.damageMult > 0)
    .sort((a, b) => b.damageMult - a.damageMult)

  for (const skill of skills) {
    while (ap >= skill.apCost && player.hp > 0) {
      // 使用技能
      executeDamage(npc, player, skill, rules)
      ap -= skill.apCost
    }
  }

  // 反击判定（如果 NPC 策略是重视反击）
  // → 在玩家攻击时自动触发，不在 NPC 回合处理
}
```

### 5.4 伤害计算（增强版）

```javascript
function calcBattleDamage(attacker, target, skill, rules) {
  // 基础伤害 = 技能系数 × 攻击者ATK × 攻击倍率 - 目标DEF × 防御倍率
  let atk = attacker.atk * getStanceMod(attacker, 'atk') * getStrategyMod(attacker, 'atk')
  let def = target.def * getStanceMod(target, 'def') * getStrategyMod(target, 'def')

  // 临时效果
  for (const buff of attacker.buffs) {
    if (buff.type === 'atkDown') atk *= (1 - buff.value)
  }
  for (const buff of target.buffs) {
    if (buff.type === 'defUp') def *= (1 + buff.value)
    if (buff.type === 'defDown') def *= (1 - buff.value)
  }

  // 技能特效：穿甲
  if (skill.effect === 'armorPierce') {
    def *= (1 - skill.effectValue)  // 如 0.3 → 无视30%防御
  }

  let damage = Math.max(1, Math.floor(
    skill.damageMult * atk * rules.atkMultiplier - def * rules.defMultiplier
  ))

  // 暴击
  let critRate = rules.critRate || 0.1
  if (skill.effect === 'critBoost') critRate *= (1 + skill.effectValue)
  const isCrit = Math.random() < critRate
  if (isCrit) damage = Math.floor(damage * (rules.critMultiplier || 1.5))

  // 防御中减伤
  if (target.isDefending) damage = Math.floor(damage * 0.6)

  // 吸血
  let healed = 0
  if (skill.effect === 'lifesteal') {
    healed = Math.floor(damage * skill.effectValue)
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + healed)
  }

  target.hp = Math.max(0, target.hp - damage)

  return { damage, isCrit, healed }
}
```

---

## 六、前端战斗界面设计

### 6.1 整体布局

```
┌─────────────────────────────────────────────────┐
│  ⚔ 战斗 · 回合 3                    回合计时 28s │  ← 顶栏
├──────────────────────┬──────────────────────────┤
│                      │                          │
│    [玩家卡片]         │     [对手卡片]             │  ← 双方状态
│    HP ████████░░     │     HP ██████░░░░        │
│    AP ●●●●○○        │     ATK 15  DEF 8         │
│    ATK 23  DEF 12    │     策略：重视反击          │
│    姿态：作战          │     [烧伤] [ATK↓]         │
│    [DEF+40%]         │                          │
│                      │                          │
├──────────────────────┴──────────────────────────┤
│                                                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │  ← 技能栏
│  │ 斩击  │ │ 突刺  │ │ 连斩  │ │ 防御  │            │
│  │ 3AP  │ │ 4AP  │ │ 2AP  │ │ 2AP  │            │
│  │ ~23伤│ │ ~30伤│ │ ~14伤│ │ +40%│            │
│  └──────┘ └──────┘ └──────┘ └──────┘            │
│                                                  │
│  [道具 2AP]  [逃跑 6AP]  [结束回合]               │  ← 通用操作
│                                                  │
├──────────────────────────────────────────────────┤
│  回合3: 你使用「斩击」，造成 23 伤害               │  ← 战斗日志
│  回合3: 你使用「防御」，防御力提升 40%              │
│  回合2: 野狗 攻击你，造成 8 伤害                   │
│  回合2: 野狗 攻击你，造成 7 伤害                   │
└──────────────────────────────────────────────────┘
```

### 6.2 AP 条可视化

```
AP: ●●●●○○  (4/6 剩余)
     蓝色=可用  灰色=已消耗
```

点击技能后 AP 条实时更新，技能按钮根据剩余 AP 自动禁用（AP 不够的灰掉）。

### 6.3 伤害预估

每个技能按钮下方显示预估伤害范围（考虑暴击）：
```
斩击 (3AP)
~23 伤害
```

帮助玩家快速做决策。

---

## 七、文件规划

### 新增文件

```
src/lib/
├── battleSkills.js          — 武器技能定义 & 查询函数
├── battleCalc.js            — 增强版伤害计算 & AP 管理
├── battleAI.js              — NPC AI（AP 分配策略）
└── server/
    └── battleActions.js     — 战斗 API 处理逻辑

src/app/
├── api/game/battle/
│   └── route.js             — POST /api/game/battle
└── game/[id]/
    └── BattleModal.jsx      — 重构战斗界面（替换现有文件）
```

### 修改文件

```
src/lib/server/gameActions.js  — 搜索遭遇时初始化新版 battle
src/app/game/[id]/GameClientPage.jsx — 对接新版 battle 数据
src/lib/roomState.js           — 战斗结算后的游戏状态更新
```

---

## 八、Phase 划分

### Phase 1（本次实现）
- [x] AP 系统（每回合 6AP，自由分配）
- [x] 武器六系技能定义
- [x] 姿态系统（5 种，影响探索+战斗）
- [x] 策略系统（4 种，影响被攻击时）
- [x] 先手/后手机制
- [x] 增强版伤害计算
- [x] NPC AI（AP 分配）
- [x] 新战斗 UI（技能栏+AP条+伤害预估）
- [x] 防御动作
- [x] 战斗中使用道具

### Phase 2（后续）
- [ ] 状态异常系统（中毒/烧伤/冻结/麻痹/混乱）
- [ ] 部位伤害（头/胸/腕/足）
- [ ] 武器属性（火焰/冰冻/电击/带毒/音波等）
- [ ] 反击机制（策略触发）
- [ ] PvP 战斗（Realtime 同步双方回合）
- [ ] 重击/怒气系统
