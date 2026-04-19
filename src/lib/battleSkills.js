/**
 * battleSkills.js — 武器六系技能定义
 *
 * 每种武器类型提供 2~3 个战斗技能，角色装备武器后获得对应技能。
 * 技能的 damageMult 是伤害系数，实际伤害 = damageMult × ATK × atkMult - DEF × defMult
 */

// ── 技能效果类型说明 ──
// armorPierce  : 无视目标 effectValue% 的防御力
// critBoost    : 暴击率提升 effectValue 倍
// atkDebuff    : 降低目标 ATK effectValue%，持续 duration 回合
// defBuff      : 提升自身 DEF effectValue%，持续 duration 回合
// lifesteal    : 伤害的 effectValue% 转化为 HP
// apSteal      : 降低目标下回合 AP effectValue 点
// defShred     : 永久降低目标 DEF effectValue%

export const SKILL_DEFS = {
  // ── 空手 ──
  unarmed: [
    { id: 'punch',    name: '拳击',    apCost: 2, damageMult: 0.5,  effect: null,          effectValue: 0,   description: '轻攻击，可连打' },
    { id: 'kick',     name: '重踢',    apCost: 4, damageMult: 1.0,  effect: null,          effectValue: 0,   description: '有力的踢击' },
  ],

  // ── 殴系（钝器） ──
  blunt: [
    { id: 'swing',    name: '挥击',    apCost: 3, damageMult: 1.0,  effect: null,          effectValue: 0,   description: '标准攻击' },
    { id: 'smash',    name: '重砸',    apCost: 5, damageMult: 1.6,  effect: null,          effectValue: 0,   description: '高伤害攻击' },
    { id: 'stun',     name: '震击',    apCost: 4, damageMult: 0.7,  effect: 'atkDebuff',   effectValue: 0.2, description: '降低敌方 ATK 20%，持续 1 回合', effectDuration: 1 },
  ],

  // ── 斩系（锐器） ──
  blade: [
    { id: 'slash',    name: '斩击',    apCost: 3, damageMult: 1.0,  effect: null,          effectValue: 0,   description: '标准攻击' },
    { id: 'thrust',   name: '突刺',    apCost: 4, damageMult: 1.3,  effect: 'armorPierce', effectValue: 0.3, description: '无视 30% 防御' },
    { id: 'chain',    name: '连斩',    apCost: 2, damageMult: 0.6,  effect: null,          effectValue: 0,   description: '低消耗快攻' },
  ],

  // ── 射系（远程） ──
  ranged: [
    { id: 'shoot',    name: '射击',    apCost: 3, damageMult: 1.0,  effect: null,          effectValue: 0,   description: '标准射击' },
    { id: 'aimed',    name: '精准射击', apCost: 5, damageMult: 1.5,  effect: 'critBoost',   effectValue: 1.0, description: '暴击率翻倍' },
    { id: 'suppress', name: '压制射击', apCost: 4, damageMult: 0.5,  effect: 'apSteal',     effectValue: 1,   description: '敌方下回合 -1 AP' },
  ],

  // ── 投系 ──
  thrown: [
    { id: 'throw_w',  name: '投掷',    apCost: 3, damageMult: 0.9,  effect: null,          effectValue: 0,   description: '标准投掷' },
    { id: 'rapid',    name: '连投',    apCost: 2, damageMult: 0.5,  effect: null,          effectValue: 0,   description: '低消耗快攻' },
    { id: 'pierce_t', name: '破甲投',  apCost: 5, damageMult: 0.8,  effect: 'defShred',    effectValue: 0.1, description: '永久降低敌方 DEF 10%' },
  ],

  // ── 爆系 ──
  explosive: [
    { id: 'detonate', name: '引爆',    apCost: 4, damageMult: 1.3,  effect: null,          effectValue: 0,   description: '爆炸伤害' },
    { id: 'barrage',  name: '集束投弹', apCost: 6, damageMult: 2.0,  effect: null,          effectValue: 0,   description: '极高伤害，消耗全部 AP' },
  ],

  // ── 灵系 ──
  spirit: [
    { id: 'bolt',     name: '灵弹',    apCost: 3, damageMult: 0.9,  effect: null,          effectValue: 0,   description: '灵力攻击' },
    { id: 'drain',    name: '吸魂',    apCost: 4, damageMult: 0.7,  effect: 'lifesteal',   effectValue: 0.5, description: '伤害 50% 转化为 HP' },
    { id: 'shield',   name: '灵盾',    apCost: 3, damageMult: 0,    effect: 'defBuff',     effectValue: 0.3, description: '防御 +30%，持续 2 回合', effectDuration: 2 },
  ],
}

// ── 通用动作（所有武器都可用） ──
export const COMMON_ACTIONS = [
  { id: 'defend',   name: '防御',     apCost: 2, damageMult: 0, effect: 'defend',    effectValue: 0.4, description: '本回合受到伤害 -40%' },
  { id: 'useItem',  name: '使用道具', apCost: 2, damageMult: 0, effect: 'item',      effectValue: 0,   description: '使用背包中的物品' },
  { id: 'flee',     name: '逃跑',     apCost: 6, damageMult: 0, effect: 'flee',      effectValue: 0,   description: '消耗全部 AP 尝试逃跑' },
]

// ── 姿态定义 ──
export const STANCES = {
  normal:  { name: '通常', atkMod: 1.0,  defMod: 1.0,  discoverMod: 1.0,  stealthMod: 1.0,  initMod: 1.0  },
  combat:  { name: '作战', atkMod: 1.25, defMod: 1.10, discoverMod: 1.0,  stealthMod: 0.85, initMod: 1.0  },
  explore: { name: '探物', atkMod: 0.90, defMod: 0.90, discoverMod: 1.30, stealthMod: 1.0,  initMod: 0.95 },
  ambush:  { name: '偷袭', atkMod: 1.15, defMod: 0.80, discoverMod: 0.95, stealthMod: 1.10, initMod: 1.25 },
  heal:    { name: '治疗', atkMod: 0.80, defMod: 0.80, discoverMod: 0.80, stealthMod: 0.80, initMod: 0.80 },
}

// ── 策略定义 ──
export const STRATEGIES = {
  normal:   { name: '通常',     atkMod: 1.0,  defMod: 1.0,  fleeMod: 1.0,  counterRate: 0    },
  counter:  { name: '重视反击', atkMod: 1.10, defMod: 0.90, fleeMod: 1.0,  counterRate: 0.25 },
  defense:  { name: '重视防御', atkMod: 0.90, defMod: 1.20, fleeMod: 1.0,  counterRate: 0    },
  evade:    { name: '重视躲避', atkMod: 0.80, defMod: 1.0,  fleeMod: 1.25, counterRate: 0    },
}

/**
 * 根据武器类型获取战斗技能列表（含通用动作）
 */
export function getSkillsForWeapon(weaponKind) {
  const weaponSkills = SKILL_DEFS[weaponKind] || SKILL_DEFS.unarmed
  return [...weaponSkills, ...COMMON_ACTIONS]
}

/**
 * 根据武器类型仅获取攻击技能（不含通用动作）
 */
export function getAttackSkills(weaponKind) {
  return SKILL_DEFS[weaponKind] || SKILL_DEFS.unarmed
}

/**
 * 根据物品 kind 字段推断武器类型
 * 物品表的 kind 可能是 'weapon', 'armor', 'consumable' 等
 * 需要再根据名称或 sub_kind 判断具体武器系
 */
export function inferWeaponKind(item) {
  if (!item) return 'unarmed'
  // 优先使用 item 上标记的 weapon_kind
  if (item.weapon_kind) return item.weapon_kind
  // 根据名称模糊匹配（兼容现有数据）
  const n = item.name || ''
  if (/刀|剑|斩|刃/.test(n)) return 'blade'
  if (/弓|枪|铳|射/.test(n)) return 'ranged'
  if (/棍|锤|棒|杖/.test(n)) return 'blunt'
  if (/投|镖|石/.test(n)) return 'thrown'
  if (/炸|雷|弹/.test(n)) return 'explosive'
  if (/灵|符|咒|魔/.test(n)) return 'spirit'
  return 'unarmed'
}

// ES module — 所有导出均已在各声明处标注 export
