# Parameters — 原版真实数值（ABC 字节码反汇编 + 多智能体对抗验证）

> 来源:`数字房间大冒险 Parameters.swf` → `DoABC` tag → 自建 AVM2 反汇编器解出 243 个方法体 →
> 16 个类逐条指令 grounding,再由独立验证 agent 对抗复核每个数字(附字节码偏移量)。
> SWF 帧率 **30fps**;逐帧公式 ×30 = 每秒。全部数值均有 `@offset opcode` 佐证。

## 核心设计公理:一切来自"条的像素尺寸"

```
m = mc.width × mc.height          // 目标"质量" → 决定锁/掉落/价格
敌人 HP    = mc.width             // 血量 = 条的宽度
任务进度上限 = mc.width
```
条越大越难越贵。**参数条的物理尺寸就是它的难度与价值** —— 这是本作灵魂。

---

## 全局常量（Main 的 slot 默认值，非代码赋值）

| 常量 | 值 | 说明 |
|---|---|---|
| COMBO_MAX | 120 | 连击达此值且断连时解锁 secret(4) |
| COMBO_W_TIME | 45 | 连击窗口(帧)= 1.5 秒 |
| WIDTH_MAX (Meter) | 200 | 普通条满宽;COMBO 条满宽 752 |
| bonus | 100 | — |

## 玩家 (Main) 初始值

`life=100  act=50  atk=10  def=10  rpe=10  gold=0  key=0  key2=0  lv=1  exp=0`
各 `_max` 初始 = 各自当前值。`exp_max = 100 + (lv−1)²`（**注意是 (lv−1)²**,字节码里 multiply 前有 decrement）。

## 逐帧再生（run，@30fps，各自封顶 _max）

```
life += 0.004 + rpe×0.002     // @rpe10 ≈ +0.72/秒（慢，体力珍贵）
act  += 0.06  + rpe×0.01      // @rpe10 ≈ +4.8/秒
atk  += 0.03  + rpe×0.01      // 买武器后 atk 向 atk_max 缓升（热身感）
def  += 0.03  + rpe×0.01
```

## 升级 (addParam 内，得 EXP 时)

```
while (exp >= exp_max) {
  lv++; exp -= exp_max;
  exp_max = 100 + (lv−1)²;
  exp_total_max += exp_max;
  addAddP(3);                 // 升级送 3 个属性点
  life = life_max; act = act_max;   // 回满体力与行动
  reLife.resetPrice();
  if (lv == 40) n7.entry();   // 40 级解锁隐藏
}
```

## 连击 (combo)

```
每次 addParam: 若 combo_time>0 → combo++ ,否则 combo=0;然后 combo_time = 45
每帧: combo_time>0 → combo_time--; ==0 时若 combo≥120 → setSecret(4),再 combo=0
```

## 属性点系统 add_p（本作的"RPG 加点"）

- **赚点**:升级 +3、任务完成 +1、买"点数"按钮 +1。
- **花点**:点 `+LIFE/+ACT/+RPE/+ATK/+DEF` 按钮(BtnAddP),每次 `addAddP(-1)` 消耗 1 点:
  - +LIFE:`life+1, life_max+1`  · +ACT:`act+1, act_max+1`  · +RPE:`rpe+1`
  - +ATK:`n=int(rand×3+1)∈{1,2,3}; atk+=n, atk_max+=n`  · +DEF:同 ATK 公式
- add_p>0 时按钮激活,≤0 时禁用。

---

## 受击 setDamage(dmg)（玩家掉血）

```
def_eff = min(def, 300)
d = int( dmg × 0.5 × (1 − def_eff/300) )
if (d < 5) d = int(5 + rand×10)         // 最低伤害随机 5..14
life -= d
if (life < 0) { life=0; atk=0; def=0 }   // 死亡:归零攻防（惩罚）
```

## 敌人 (Enemy)

```
life_max = mc.width;  life = life_max
m = w×h;  m>1500 → 生成钥匙锁(lock_flg, lock1_cnt++)
key_cnt = int(m/1000)%4 + 1                       // 掉钥匙数
逐帧回血: life += (y−70)×0.0001×(life_max/100) + rpe×0.01
每 15 帧接触伤害: setDamage( 20 + (w+h)/2 )
血条: target=200×(life/life_max); nw += (target−nw)/2
玩家点击伤害（仅 main._state=="standby"）:
  L4 = (h/10)² + (y−70)
  宽条: dmg = int( atk × (1 − L4/2600) × 0.5 )
  高条: dmg = int( atk×0.25 + rand×10 − 5 )
  dmg = max(1, dmg);  life -= dmg
击杀: 按 m/10、m/15 的位数拆成 GOLD/EXP 掉落;NEKO 掉率 25%(int(rand×100)<25,子类 rand×8);e_comp_cnt++
全灭(e_comp_cnt==total_e_num) → setSecret(2)
```

## Boss / EnemyLast（终盘墙）

```
Boss:  life_max = 240
       玩家点击伤害 = int(atk − 200) × 0.2, 最低 1     ← 需 atk>200 才破防
       逐帧回血 += (life_max−life)×0.002 + 0.001
       接触伤害(cnt==15) setDamage(100 − life/4)
       奖励 GOLD 10000 / EXP 9999(按面额拆);NEKO×8;setSecret(6);记 clear_time
EnemyLast: life_max = 9999(满宽 752)
       逐帧回血 += rpe×0.03
       接触伤害(cnt==15) setDamage( 5 + (life_max−life)/200 + rand×20 )
       点击伤害同 Enemy 面积公式,最低 1
```

## 任务 (Mission)

```
life_max = mc.width;  m = w×h;  m>1000 → 钥匙锁
cost = m × 0.01                                   // 每次点击的行动点消耗
gold = int( m×0.03 × (1+rand) × 2 )
exp  = int( m×0.1  × (1+rand) × 2 )
点击(需 act≥cost,否则 M_NG): act -= cost; life += 10 + rand×3
完成(life>life_max): gold×=1.5; exp×=1.5; addAddP(1); complete_flg; m_comp_cnt++
  → 奖励按面额拆成 GOLD/EXP 掉落;NEKO 掉率 3%
全完成(m_comp_cnt==total_m_num) → setSecret(1)
重复点已完成(M_OK2): gold = int( m/10 + rand×m/100 )
```

## 道具:武器 / 防具（价格恒定,不随购买涨）

```
武器 ItemAtk: price = int(m/10) + (h−30)² + (h−30)×45 ;  addP = int(m/100)×0.45
防具 ItemDef: price = int(m/10) + (h−30)² − (h−30)×10 ;  addP = int(m/100)×0.5
每次购买: gain = int( addP × (1 − cnt×0.05) ), 最低 1
          atk(或def) += gain; 对应 _max += gain; gold -= price; cnt++
上限 cnt=9(第 9 次后 "LIMIT");m>1000 → 钥匙锁;首购 i_comp_cnt++;满 9 类→setSecret(3)
```

## 商店 / 修复按钮

| 按钮(类) | 基础价 | 递增 | 效果 |
|---|---|---|---|
| 修复体力 BtnRepaierLife | `100 + lv×20` | `×1.5`(封顶 3600) | `life += 100`(封顶 life_max);解锁需 key2 |
| 加上限 BtnRepaierAct (ACT/LIFE) | `100` | `×1.05` | ACT:`act_max+1`(≤200)/ LIFE:`life_max+1`(≤200);由挂载名区分;解锁需 key2 |
| 购买钥匙 BtnRepaierKey | `400` | 恒定 | `key += 1` |
| 购买点数 BtnRepaierPoint | `200` | 恒定 | `addAddP(1)`(得 1 属性点);解锁需 key2 |
| 老虎机 BtnSlot | `10`/次 | — | 见下 |

## 老虎机 (BtnSlot)

```
花 10 gold 转 3 轮,每轮 idx=int(rand×8):
  轮0 = [$,$,$,@,@,7,*,*]   轮1 = [$,$,$,@,@,7,*,$]   轮2 = [$,@,7,*,$,@,7,*]
三格相同即中:
  $$$ → GOLD 200 ×8  = 1600
  @@@ → EXP  20 ×10 =  200
  777 → GOLD 777 ×20 = 15540   ← 头奖 ≈0.39%
  *** → GOLD 800 ×12 =  9600
```

## 里程碑奖励 (BtnBonus n1–n5,一次性)

```
n1: life_max += 20    n2: rpe ×= 2    n3: act_max += 20
n4: 给 GOLD 200 × (lv−1)               n5: atk_max ×= 2
```

## 通关 / 成就 / 隐藏

- 通关文案 `Parameters Cleared! TIME hh:mm:ss`(时间 `getTimerStr`:`floor(t/1000)` 秒,含百分秒,>99 分显示 `99:99:99`)
- secret 触发:1=全任务 2=全敌人 3=全道具 4=满连击断连 5=集齐 NEKO(t_list 9) 6=Boss
- 40 级 `n7.entry()`、`NEKOGAMES` 集字
- 分享 `http://twitter.com/home?status=…` / 官方页 `http://nekogames.jp/g.html?gid=PRM`

---
*所有数值取自反汇编 + 对抗验证(32 agents),偏移量佐证见工作流记录。*
