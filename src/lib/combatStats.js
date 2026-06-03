// ════════════════════════════════════════════════════════════════════════
//  Phase 37 — 统一战斗 stat 组装（玩家 = NPC = 探针 同一公式）
// ════════════════════════════════════════════════════════════════════════
//
// 纯函数 · 无 DB · 无副作用 · 无 import —— 故意不引 @/ 别名，使其能被
//   scripts/smoke-check.mjs 之类原生 Node ESM 直接导入（与 roomState.js 同约束）。
//
// 统一公式（每属性独立）：
//   stat = round( (base + classAdd + equipAdd) × (1 + classMult) × (1 + equipMult) )
//     base     —— 实体自身基础值（玩家 player.atk/def/maxHp；NPC npc_pool.atk/def/hp；探针快照）
//     classAdd —— 职业 flat（classes.base_*_bonus）。玩家已 baked → 传 0 避免双计。
//     equipAdd —— 已装备 tier 加法（equipment_tiers.base_atk/def/hp + instance.bonus）
//     classMult—— 职业 perks 乘子（combat_dmg_mult/combat_def_mult/combat_hp_mult）
//     equipMult—— 已装备 tier 百分比之和（equipment_tiers.atk_pct/def_pct/hp_pct）
//
// 平衡中性（红线 ②）：所有分量缺省（undefined）→ 视作中性（加法 0 / 乘区因子 1）。
//   - 玩家：_classAdd={0,0,0}（applyClassToPlayer 已把职业 flat baked 进 base，再加会双计）；
//           新装备列默认 *_pct=0 → equipMult 因子=1 → 输出逐值 == 旧 buildCombatPlayer。
//   - NPC ：class_id=null + loadout 空 → 全分量 0、perks={} → 输出 base == 旧裸 npc.atk/def/hp。
//   - 探针：快照 atk/def/maxHp 当 base，其余分量缺省 → 输出逐值 == 快照值。
//
// 调用方按实体类型负责把这 5 组分量解析好挂到 entity 上（见 gameActions.js
//   buildCombatPlayer / buildCombatNpc / 探针包装），computeCombatStats 不查库不解析。

/** 安全数值化：null/undefined/NaN → 0。 */
function n(v) {
  return Number(v) || 0
}

/**
 * 统一战斗 stat 组装。读 entity 上已解析的 base + 5 组分量，按统一公式产出
 *   { atk, def, maxHp, hp(clamp≤maxHp), _pass } 并透传 entity 其余字段。
 *
 * @param {object} entity 形状见文件头注释；至少含 base 的 atk/def/maxHp/hp。
 *   可选分量字段（全部缺省→中性）：
 *     entity._classAdd  : { atk, def, hp }   职业 flat 加成
 *     entity._equipAdd  : { atk, def, hp }   已装备 tier 加法
 *     entity._equipMult : { atk, def, hp }   已装备 tier 百分比之和（0.2=+20%）
 *     entity.classPerks : { combat_dmg_mult, combat_def_mult, combat_hp_mult, ... }
 *     entity._pass      : 被动 tier.passive 列表（原样透传给 triggerPassives）
 * @returns {object|null} 组装后的战斗实体（atk/def/maxHp 重算，hp clamp，其余透传）。
 */
export function computeCombatStats(entity) {
  if (!entity) return null

  const classAdd = entity._classAdd || {}
  const equipAdd = entity._equipAdd || {}
  const equipMult = entity._equipMult || {}
  const perks = entity.classPerks || {}

  // 乘区因子（1 + 分量）。旧数据无 combat_hp_mult key → classMultHp=1（无影响）。
  const classMultAtk = 1 + n(perks.combat_dmg_mult)
  const classMultDef = 1 + n(perks.combat_def_mult)
  const classMultHp = 1 + n(perks.combat_hp_mult)
  const equipMultAtk = 1 + n(equipMult.atk)
  const equipMultDef = 1 + n(equipMult.def)
  const equipMultHp = 1 + n(equipMult.hp)

  const atk = Math.round((n(entity.atk) + n(classAdd.atk) + n(equipAdd.atk)) * classMultAtk * equipMultAtk)
  const def = Math.round((n(entity.def) + n(classAdd.def) + n(equipAdd.def)) * classMultDef * equipMultDef)
  const maxHp = Math.round((n(entity.maxHp) + n(classAdd.hp) + n(equipAdd.hp)) * classMultHp * equipMultHp)

  return {
    ...entity,
    atk,
    def,
    maxHp,
    hp: Math.min(n(entity.hp), maxHp), // clamp，等同旧 buildCombatPlayer 的 Math.min(hp, maxHp)
    _pass: entity._pass || [],
  }
}
