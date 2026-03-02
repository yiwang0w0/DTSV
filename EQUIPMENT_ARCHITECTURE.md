# DTS 装备系统架构设计文档

> 大型规模 · 30+ 系列 · 每系列 5+ 阶 · 分支路线 · 升阶合成

---

## 一、核心设计哲学

### 金字塔升阶模型

```
                    ╔═══════════╗
                    ║  神器[T5] ║   ← 系列终点（唯一）
                    ╚═════╤═════╝
              ┌───────────┴───────────┐
         ╔════╧════╗           ╔═════╧════╗
         ║ 圣器[T4]║           ║ 魔器[T4] ║  ← 分支变体（同阶）
         ╚════╤════╝           ╚═════╤════╝
              └───────────┬───────────┘
                    ╔═════╧═════╗
                    ║  精铸[T3] ║   ← 收束节点（分支前共享）
                    ╚═════╤═════╝
              ┌───────────┴───────────┐
         ╔════╧════╗           ╔═════╧════╗
         ║ 烈焰[T2]║           ║ 霜冻[T2] ║  ← 元素分支
         ╚════╤════╝           ╚═════╤════╝
              └───────────┬───────────┘
                    ╔═════╧═════╗
                    ║  铁质[T1] ║   ← 系列起点（唯一）
                    ╚═══════════╝
```

**关键规则：**
- T1（基础阶）只需泛用材料，无前置装备
- T2+ 必须消耗前一阶成品（升阶行为，原装备转化）
- 分支节点：同阶不同变体需要相同前置 + 不同特化材料
- 收束节点：多个分支可以合流，需要其中一个变体 + 收束材料

---

## 二、数据库表结构

### 2.1 核心表关系图

```
equipment_series ─┬─< equipment_tiers >─< tier_recipes
                  │                            │
                  │                     ┌──────┴───────┐
                  │                     ↓              ↓
                  │              recipe_ingredients   (引用)
                  │              ├── item_pool（泛用材料）
                  │              └── equipment_tiers（前置装备）
                  │
                  └─< equipment_instances（玩家拥有的实体）
```

### 2.2 表详细定义

#### `equipment_series` — 装备系列
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL PK | |
| name | TEXT | 系列名（如"常磐之刃"） |
| slot | TEXT | 装备槽：weapon/armor/accessory/helmet/boots |
| description | TEXT | 系列背景描述 |
| icon | TEXT | emoji 图标 |
| unlock_condition | JSONB | 解锁条件（等级/剧情标记等） |

#### `equipment_tiers` — 具体装备阶级
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL PK | |
| series_id | INT FK | 所属系列 |
| tier | INT | 阶级 1-6 |
| variant | TEXT | 变体标识（null=主线, 'fire'=火系分支等） |
| name | TEXT | 具体名称（如"烈焰常磐之刃"） |
| rarity | TEXT | common/uncommon/rare/epic/legendary/mythic |
| **base_atk** | INT | 基础攻击 |
| **base_def** | INT | 基础防御 |
| **base_hp** | INT | 装备后HP加成 |
| **element** | TEXT | 元素属性：fire/ice/thunder/wind/dark/light/none |
| **element_power** | INT | 元素强度（影响元素反应伤害） |
| **durability_max** | INT | 最大耐久度（0=无耐久限制） |
| **passive_skill_id** | INT FK | 绑定的被动技能 |
| **req_level** | INT | 装备等级要求 |
| **req_class** | TEXT[] | 职业限制（空=全职业） |
| special_note | TEXT | 特殊说明 |

#### `tier_recipes` — 合成配方
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL PK | |
| result_tier_id | INT FK | 产出的装备ID |
| recipe_name | TEXT | 配方名称 |
| **requires_prev_tier_id** | INT FK | 必需的前置装备（升阶核心） |
| gold_cost | INT | 金币消耗 |
| success_rate | FLOAT | 合成成功率（1.0=必定成功） |
| fail_behavior | TEXT | 失败行为：keep_materials/lose_materials/downgrade |
| unlock_note | TEXT | 配方解锁条件说明 |

#### `recipe_ingredients` — 配方所需材料
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL PK | |
| recipe_id | INT FK | 所属配方 |
| ingredient_type | TEXT | **'item'=泛用材料 / 'equipment'=特定装备** |
| item_id | INT FK NULL | ingredient_type='item'时有值 |
| equipment_tier_id | INT FK NULL | ingredient_type='equipment'时有值 |
| quantity | INT | 需要数量 |
| is_consumed | BOOL | 是否消耗（升阶时前置装备 is_consumed=true） |
| is_catalyst | BOOL | 是否为催化剂（不消耗但需持有） |

#### `passive_skills` — 被动技能定义
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL PK | |
| name | TEXT | 技能名 |
| icon | TEXT | emoji |
| description | TEXT | 效果描述 |
| trigger_event | TEXT | on_attack/on_defend/on_kill/on_turn_start/on_hp_below_30 |
| effect_type | TEXT | damage/heal/buff/debuff/elemental |
| effect_formula | TEXT | 公式字符串（接入gameEngine） |
| effect_target | TEXT | self/enemy/all |
| trigger_chance | FLOAT | 触发概率（0-1） |
| buff_id | INT FK NULL | 触发时施加的Buff |
| cooldown_turns | INT | 冷却回合数 |

#### `equipment_instances` — 玩家装备实例
> 玩家背包/仓库中的具体装备对象（区别于模板定义）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | |
| tier_id | INT FK | 对应的装备模板 |
| owner_id | UUID FK | 玩家ID |
| room_id | INT FK | 所在游戏房间 |
| **durability_current** | INT | 当前耐久度 |
| **bonus_atk** | INT | 额外附加攻击（锻造/强化附加） |
| **bonus_def** | INT | 额外附加防御 |
| is_equipped | BOOL | 是否已装备 |
| slot_override | TEXT | 覆盖槽位（部分特殊装备） |
| acquired_at | TIMESTAMPTZ | 获得时间 |

---

## 三、引擎层设计（equipmentEngine.js）

### 3.1 模块职责划分

```
src/lib/
├── gameEngine.js          ← 已有：战斗计算、Buff处理
├── equipmentEngine.js     ← 新增：装备系统核心逻辑
│   ├── getCraftingTree()  ← 获取某装备的完整合成树
│   ├── canCraft()         ← 检查玩家是否满足合成条件
│   ├── executeCraft()     ← 执行合成（含失败处理）
│   ├── getEquipStats()    ← 计算装备总属性（含加成）
│   └── triggerPassive()   ← 触发被动技能（接入gameEngine）
└── inventoryEngine.js     ← 新增：背包/装备槽管理
    ├── getEquippedItems()
    ├── equipItem()
    └── unequipItem()
```

### 3.2 合成树遍历算法

```javascript
// 递归获取合成树（用于前端展示金字塔视图）
async function getCraftingTree(tierId, depth = 0) {
  const tier = await getTierWithRecipe(tierId)
  
  return {
    ...tier,
    depth,
    recipe: {
      prev_tier: tier.recipe?.requires_prev_tier_id
        ? await getCraftingTree(tier.recipe.requires_prev_tier_id, depth + 1)
        : null,
      ingredients: tier.recipe?.ingredients ?? [],
    },
    // 同系列同阶的其他变体（分支展示）
    siblings: await getSiblingVariants(tier.series_id, tier.tier, tier.id),
  }
}
```

### 3.3 合成验证逻辑

```javascript
function canCraft(recipe, playerInventory, playerEquipments) {
  // 1. 检查前置装备（必须持有且未装备）
  if (recipe.requires_prev_tier_id) {
    const hasPrev = playerEquipments.some(
      e => e.tier_id === recipe.requires_prev_tier_id && !e.is_equipped
    )
    if (!hasPrev) return { ok: false, reason: '缺少前置装备' }
  }
  
  // 2. 检查材料数量
  for (const ing of recipe.ingredients) {
    if (ing.ingredient_type === 'item') {
      const count = playerInventory.filter(i => i.id === ing.item_id).length
      if (count < ing.quantity)
        return { ok: false, reason: `${ing.item_name} 不足（${count}/${ing.quantity}）` }
    }
  }
  
  // 3. 检查金币（后续实现）
  // 4. 检查职业/等级要求
  
  return { ok: true }
}
```

---

## 四、参考引擎架构（工业级对标）

### 对标：《怪物猎人》武器树

| 特性 | MH做法 | DTS建议实现 |
|------|--------|-------------|
| 武器树可视化 | 树形图，带分支箭头 | `getCraftingTree()` + React递归组件 |
| 材料追踪 | 显示"还差X个" | 实时对比inventory |
| 升阶 vs 合成 | 两种都有 | `is_upgrade`字段区分 |
| 分支预告 | 显示可能走向 | 预加载siblings |

### 对标：《原神》圣遗物/武器

| 特性 | 原神做法 | DTS建议实现 |
|------|----------|-------------|
| 被动技能 | 固定文本+数值 | `passive_skills`表 + `triggerPassive()` |
| 元素共鸣 | 装备凑齐触发 | 检查`element`字段组合 |
| 精炼/强化 | 叠加同名装备 | `bonus_atk`字段累加 |

### 对标：《暗黑破坏神》词条

| 特性 | D2做法 | DTS简化版 |
|------|--------|-----------|
| 随机词条 | 随机生成 | 暂不实现，用固定被动代替 |
| 套装效果 | 凑齐N件触发 | 后期可加`set_id`字段 |

---

## 五、数据举例：「常磐之刃」系列

```
T1: 朴素铁刃        ATK+8   无元素   配方：铁矿×3 + 皮革×2
    ↓
T2a: 烈焰铁刃       ATK+15  火元素   配方：朴素铁刃 + 火焰石×2 + 铁矿×2
T2b: 霜冻铁刃       ATK+15  冰元素   配方：朴素铁刃 + 冰晶×2 + 铁矿×2
    ↓（任选其一）
T3: 精铸之刃        ATK+25  无元素   配方：T2任意变体 + 精铸石×1 + 铁矿×5
    ↓
T4a: 圣光精铸刃     ATK+35  光元素   被动：击杀时30%概率回复10HP
T4b: 暗蚀精铸刃     ATK+35  暗元素   被动：攻击时20%概率施加中毒
    ↓（任选其一）
T5: 常磐神器        ATK+50  双元素   耐久100  被动：每回合开始+5ATK(叠加3层)
```

---

## 六、后台管理界面设计

### 需要新增的 Admin Tab

```
⚙️ 装备系列  ─ 管理系列基本信息（名称/槽位/图标）
🔬 合成配方  ─ 核心：可视化配方编辑器
               ├── 金字塔预览：实时渲染升阶树
               ├── 配方编辑：拖拽/点选材料
               └── 批量导入：JSON格式
⚡ 被动技能  ─ 管理所有passive_skills（含公式预览）
```

### 合成配方编辑器 UI 建议

```
[ 选择系列: 常磐之刃 ▼ ]

  T1 朴素铁刃 ●──────────────────────────────┐
                                            │
            ┌─── T2a 烈焰铁刃 ●             │
            │    需要: 朴素铁刃 + 火焰石×2   │
  分叉 ────┤                               ├── T3 精铸之刃
            └─── T2b 霜冻铁刃 ●             │    需要: T2任意 + 精铸石
                 需要: 朴素铁刃 + 冰晶×2    │
                                            └──────────────────
```

---

## 七、实施路线图（优先级顺序）

### Phase 1 — 数据层（本次）
- [ ] 执行 `init_equipment_db.sql`（5张新表）
- [ ] 在 `item_pool` 中补充材料类道具
- [ ] 录入首批系列数据（建议先做3-5个系列验证结构）

### Phase 2 — 引擎层
- [ ] `equipmentEngine.js`：合成树、合成验证、执行合成
- [ ] `inventoryEngine.js`：装备槽管理
- [ ] 被动技能接入 `gameEngine.js` 的战斗流程

### Phase 3 — 后台管理
- [ ] Admin 新增「装备系列」Tab
- [ ] 合成配方可视化编辑器
- [ ] 被动技能管理（复用已有公式编辑器）

### Phase 4 — 游戏前端
- [ ] 玩家背包界面升级（显示装备详情/耐久/被动）
- [ ] 合成界面（金字塔树形视图 + 一键合成）
- [ ] 装备槽 UI（玩家角色面板）

---

## 八、关键设计决策说明

### 为什么用 `equipment_instances` 而不是在 gamevars 里存？

当前代码把背包存在 `gamevars.players[uid].inventory: string[]`，这对简单道具可以，但装备有**耐久度、强化值、实例ID**等状态，必须独立实体化。

**迁移策略：**
- 普通消耗品继续留在 `inventory: string[]`
- 武器/防具升级为 `equipment_instances` 表 + `equippedItems: uuid[]` 存实例ID

### 为什么 `tier_recipes` 和 `recipe_ingredients` 分两张表？

一个配方可以有**多种材料**（1:N关系）。合并进一张表会导致材料数组用JSONB存储，失去关系查询能力（无法做"哪些配方用到了火焰石"的反查）。

### 分支变体如何判断"T3接受T2任意变体"？

在 `tier_recipes.requires_prev_tier_id` 存的是**系列+阶级**的引用，查询时用：
```sql
-- 检查玩家是否持有 T2 的任意变体
SELECT * FROM equipment_instances ei
JOIN equipment_tiers et ON ei.tier_id = et.id
WHERE et.series_id = $1 AND et.tier = 2 AND ei.owner_id = $2
```
或在配方中用 `requires_prev_series_id + requires_prev_tier` 替代精确ID，允许任意变体满足条件。
