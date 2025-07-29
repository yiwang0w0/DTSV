# 战斗逻辑说明

本文档基于 `feat: enhance combat logic` (#184) 合并后的代码，总结后端战斗流程与各参数含义。所有逻辑均遵循原版 DTS-SAMPLE 的规则，并区分全局登录用户与单局玩家对象。

## 1. 调用入口

前端在玩家主动攻击时调用 `POST /player/attack` 接口，后台对应 `backend/src/services/player/fight.js` 中的 `attack` 方法。接口使用当前登录用户的 `uid` 查找指定 `pid` 的玩家对象，确保不会混淆用户和玩家。

## 2. 攻击流程概览

1. **校验阶段**
   - 检查游戏是否已开始（`GameInfo.gamestate` ≥ `START_THRESHOLD`）。
   - 根据 `pid` 与 `uid` 获取攻击方玩家对象，若不存在或已死亡则返回错误。
   - 根据 `eid` 获取目标玩家对象，若不存在或已死亡也会返回错误。
   - 检查 `enemymemory`，确认双方正处于遭遇状态。
2. **准备阶段**
   - 调用 `restoreMemoryItem` 处理回忆道具。
   - 调用 `applyRest` 结算休息效果。
   - 判断体力是否足够消耗 `ATTACK_SP_COST`，不足则拒绝攻击。
3. **执行攻击**
   - 调用 `calcDamage(attacker, defender)` 计算伤害，返回 `{ damage, critical, dodged }`：
     - 若 `dodged` 为 `true`，记录闪避日志并结束本次攻击流程。
     - 否则扣除目标 HP，消耗武器耐久并提升熟练度。
   - 若目标 HP ≤ 0，则将其 `state` 设为尸体 (21)，收集掉落并记录战斗日志。
4. **反击阶段**
   - 如果目标仍存活，调用同样的 `calcDamage` 计算其对攻击方的反击。
   - 处理闪避、暴击与伤害结算，若攻击方 HP ≤ 0，则 `state` 置为倒地 (27)。
5. **日志与保存**
   - 在 `Log` 集合中写入战斗记录，更新双方玩家对象数据。
   - 返回战斗日志、玩家自身信息以及敌方的部分状态（HP、武器等）。

## 3. 伤害计算 `calcDamage`
文件位置：`backend/src/services/player/fight.js`

1. **闪避判定**
   - 调用 `combat.checkDodge(attacker, defender)`。
   - 底率来源于 `constants.get('DODGE_BASE_RATE')`（默认 0.05）。
   - 若防御方胸甲 (`arfsk`) 含有 `D`，额外提升闪避率 10%。
2. **基础伤害**
   - 进攻方攻击力 = `att + wepe×2`，防御力 = `def` + 所有防具 `...e` 之和。
   - 根据武器系别映射 (`SKILL_FIELDS`) 取得对应熟练度值，特定社团 (club 18) 会把其他系熟练度折算加入。
   - 按武器系别从 `SKILL_DMG` 取得系数，再依 `DMG_FLUC` 计算伤害浮动。
   - 特殊武器如投掷 (`J`) 和爆炸 (`F`) 会有固定附加伤害。
3. **姿态与状态修正**
   - `poseMod`：防御姿势 0.9、攻击姿势 1.2，其余 1。
   - `tacticMod`：主动进攻 1.1、谨慎防御 0.8，其余 1。
   - `infMod`：负面状态 `h` 降 10%，`b`/`f` 降 5%。
   - `rage`：每点增加 1% 伤害，最多加成 100%。
4. **暴击判定**
   - 调用 `combat.checkCritical(attacker, defender)`，基础率 `CRIT_BASE_RATE`（默认 0.05）。
   - 武器技能包含 `c` 时额外 +10%。
   - 暴击时伤害乘以 `CRIT_MULTIPLIER`（默认 1.5）。
5. **结果返回**
   - 伤害最低为 1，最终返回 `{ damage: 整数, critical: 是否暴击, dodged: false }`。

## 4. 支持常量
新逻辑依赖以下常量（`backend/src/services/constantsService.js`）：

- `CRIT_BASE_RATE`：基础暴击概率，默认 `0.05`。
- `DODGE_BASE_RATE`：基础闪避概率，默认 `0.05`。
- `CRIT_MULTIPLIER`：暴击伤害乘区，默认 `1.5`。

这些数值可在 MongoDB 的 `constants` 集合中调整。

---

以上即为当前战斗流程及各参数调用的概览。逻辑保持与原作一致，不涉及额外移动或自定义规则。
