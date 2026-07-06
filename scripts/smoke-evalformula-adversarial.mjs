/**
 * smoke-evalformula-adversarial.mjs — evalFormula / isFormulaSafe 白名单对抗用例集（KP0-X #3）。
 *
 * 目的：证明公式沙箱对【不可信输入】（未来 = LLM 产物）安全 —— 一切逃逸原语求值回 0 且被判 unsafe；
 *       同时【合法公式】数值正确、被判 safe（不误杀 · 战斗中性）。
 * 跑：node scripts/smoke-evalformula-adversarial.mjs
 */
import { evalFormula, isFormulaSafe } from '../src/lib/formulaSandbox.js'

let pass = 0, fail = 0
function eq(name, got, want) {
  if (got === want) { pass++ }
  else { fail++; console.error(`✗ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`) }
}

// 无引号即可构造特殊字符（避免源码转义歧义）
const BT = String.fromCharCode(96)  // `
const BS = String.fromCharCode(92)  // \

// ── A. 对抗用例：每条必须 evalFormula→0 且 isFormulaSafe→false ──
//    前 4 组是旧黑名单实现【放行】的真实逃逸（只用白名单字符 + 危险标识符/属性名）。
const ATTACKS = [
  ['进程退出 DoS',            'process.exit(1)'],
  ['裸 process 引用',          'process'],
  ['globalThis 逃逸',          'globalThis'],
  ['Function 构造器',          'Function(atk)'],
  ['无引号造串 fromCharCode',   'String.fromCharCode(65,66)'],
  ['造串+Function RCE 链',      'Function(String.fromCharCode(49))'],
  ['数字→构造器→Function',      '(0).constructor.constructor'],
  ['变量.constructor',         'atk.constructor'],
  ['Math.constructor',         'Math.constructor'],
  ['Math.__proto__',           'Math.__proto__'],
  ['roll.constructor',         'roll.constructor'],
  ['this.constructor',         'this.constructor'],
  ['new 关键字',               'new Function(atk)'],
  ['require',                  'require(atk)'],
  ['toString 属性',            '(atk).toString'],
  ['未知标识符',               'foobar + atk'],
  ['分号语句拼接',             'atk;1'],
  ['方括号下标',               'atk' + String.fromCharCode(91) + '0' + String.fromCharCode(93)],
  ['花括号对象',               'atk+' + String.fromCharCode(123, 125)],
  ['反引号模板',               'atk' + BT + 'x' + BT],
  ['反斜杠转义',               'atk' + BS + 'u0061'],
  ['美元符',                   '$atk'],
  ['超长公式 DoS',             ('atk+').repeat(300) + 'atk'],
]
for (const [name, f] of ATTACKS) {
  eq(`攻击→eval 0：${name}`, evalFormula(f, { atk: 5, def: 2, value: 3 }), 0)
  eq(`攻击→unsafe：${name}`, isFormulaSafe(f), false)
}

// ── B. 合法用例：evalFormula 数值正确（真实 DB 公式 + 常见形态）──
eq('伤害公式', evalFormula('atk * atkMultiplier - def * defMultiplier',
  { atk: 10, atkMultiplier: 1.2, def: 4, defMultiplier: 0.5 }), Math.floor(10 * 1.2 - 4 * 0.5))
eq('被动 floor+value', evalFormula('floor(atk * 0.3 + value)', { atk: 20, value: 5 }), Math.floor(20 * 0.3 + 5))
eq('治疗 maxHp', evalFormula('floor(maxHp * 0.1)', { maxHp: 250 }), 25)
eq('裸 value', evalFormula('value', { value: 7 }), 7)
eq('裸 heal', evalFormula('heal', { heal: 12 }), 12)
eq('Math 成员', evalFormula('Math.max(atk, def)', { atk: 3, def: 9 }), 9)
eq('三元返数', evalFormula('atk > def ? atk : def', { atk: 8, def: 3 }), 8)
eq('嵌套函数', evalFormula('max(1, floor(atk/def))', { atk: 10, def: 3 }), 3)
eq('除法 floor', evalFormula('atk/3', { atk: 10 }), 3)
eq('空公式→0', evalFormula('', { atk: 1 }), 0)
eq('非串→0', evalFormula(null), 0)

// ── C. isFormulaSafe 合法判 true（不误杀数字形态）──
eq('合法 safe', isFormulaSafe('floor(atk*0.3+value)'), true)
eq('十六进制不误杀', isFormulaSafe('0xFF + atk'), true)
eq('科学计数不误杀', isFormulaSafe('atk * 1e2'), true)
eq('比较运算 safe', isFormulaSafe('targetHp/targetMaxHp < 0.2'), true)
eq('空串 unsafe', isFormulaSafe(''), false)
eq('非串 unsafe', isFormulaSafe(42), false)

// ── D. 越界数值收敛（NaN/非数 → 0）──
eq('sqrt 负 → NaN → 0', evalFormula('sqrt(0 - 1)', {}), 0)
eq('比较返布尔 → 非数 → 0（与旧实现一致）', evalFormula('atk > def', { atk: 5, def: 1 }), 0)

if (fail > 0) {
  console.error(`\nsmoke-evalformula-adversarial FAILED: ${fail} 失败 / ${pass} 通过`)
  process.exit(1)
}
console.log(`smoke-evalformula-adversarial passed (${pass} 断言全绿)`)
