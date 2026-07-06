/**
 * src/lib/formulaSandbox.js — 安全公式求值沙箱（零 import · 纯函数 · 原生 Node 可导入 · 配 smoke）
 *
 * 统一执行 game_rules / passive_skills / buff_pool 的数值公式；也是 KALEIDO P2「LLM 产物语义闸」的地基
 * （LLM 生成的公式在写库前须过 isFormulaSafe 静态校验，见 docs/plan/kaleido/02 §4）。
 *
 * ── 安全模型：白名单，不是黑名单 ──
 *   1. 字符白名单：只放行 数字/字母/下划线/点 + 算术·比较·逻辑·三元运算符 + 括号逗号 + 空白。
 *      → 天然拒绝 ` $ { } [ ] \ ; ' " 等（模板串/下标/字符串字面量/语句分隔/转义）。
 *   2. 标识符白名单：剔除数字字面量后，剩余每个标识符必须 ∈ {注入变量 ∪ 安全函数 ∪ Math 成员}。
 *      → 拒绝 process / Function / constructor / String / fromCharCode / globalThis / new / require /
 *        this / __proto__ 等一切逃逸原语（属性名也被当标识符校验，故 `.constructor` 一并拦）。
 *   3. 长度上限 500，收敛 DoS/ReDoS 面。
 *   4. 执行仍走 new Function("use strict")，但此时可达标识符已被限死为算术作用域，触达不到全局/构造器。
 *
 * ── 为何弃旧黑名单 ──
 *   旧实现只禁符号（引号/括号类），但 `.` 属性访问、裸全局标识符、String.fromCharCode 无引号造串均未拦：
 *   对不可信输入可 `process.exit(1)`（DoS）/ `Function(String.fromCharCode(...))()`（RCE）。KP0-X #3 修复。
 */

// 允许变量的规范超集（isFormulaSafe 静态校验默认集 + 文档）；运行期 evalFormula 以实际注入的 scope 键为准。
export const ALLOWED_VARS = [
  'atk', 'def', 'hp', 'maxHp', 'effect', 'heal', 'level', 'value',
  'targetAtk', 'targetDef', 'targetHp', 'targetMaxHp', 'enemyHp',
  'atkMultiplier', 'defMultiplier',
  'damage', 'turnCount', 'levelSeq', // KALEIDO §3.4 统一注入集预留
  'roll',
]

// 运行期注入的安全函数（顶层，供 floor(...) 直接书写）
const SAFE_FUNCS = ['max', 'min', 'floor', 'ceil', 'round', 'abs', 'sqrt', 'pow', 'random']
// Math.<member> 放行的成员名（属性名过标识符白名单，故显式列安全成员；constructor/__proto__ 不在内）
const MATH_MEMBERS = [
  'floor', 'ceil', 'round', 'abs', 'sqrt', 'cbrt', 'pow', 'max', 'min', 'random',
  'sign', 'trunc', 'hypot', 'log', 'log2', 'log10', 'exp',
  'sin', 'cos', 'tan', 'atan', 'atan2',
  'PI', 'E', 'SQRT2', 'SQRT1_2', 'LN2', 'LN10', 'LOG2E', 'LOG10E',
]

const MAX_FORMULA_LEN = 500
// 字符白名单：数字/字母/下划线/点 + + - * / % 比较 < > = ! 逻辑 & | 三元 ? : + 括号逗号 + 空白
const FORMULA_CHARS = /^[0-9a-zA-Z_.+\-*/%(),<>=!&|?:\s]*$/
// 数字字面量（十进制/小数/科学计数/十六/二/八进制）：先剔除，避免其字母尾（1e3 的 e、0xFF 的 F）误判为标识符
const NUMBER_RE = /0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g
// 标识符（含 `.` 后的属性名）
const IDENT_RE = /[A-Za-z_$][\w$]*/g

/** 核心校验：字符白名单 + 剔数字后每个标识符 ∈ allowedIds。true=安全。 */
function scanFormula(trimmed, allowedIds) {
  if (typeof trimmed !== 'string') return false
  if (trimmed === '' || trimmed.length > MAX_FORMULA_LEN) return false
  if (!FORMULA_CHARS.test(trimmed)) return false
  const stripped = trimmed.replace(NUMBER_RE, ' ')
  const ids = stripped.match(IDENT_RE)
  if (ids) {
    for (const id of ids) {
      if (!allowedIds.has(id)) return false
    }
  }
  return true
}

/**
 * 静态安全校验（不执行）—— P2 LLM 产物语义闸的地基。
 * @param {string} formula
 * @param {string[]} [allowedVars] 允许的变量名集合（默认 ALLOWED_VARS）
 * @returns {boolean} true=可安全求值
 */
export function isFormulaSafe(formula, allowedVars = ALLOWED_VARS) {
  if (typeof formula !== 'string') return false
  const allowed = new Set([...allowedVars, ...SAFE_FUNCS, ...MATH_MEMBERS, 'Math', 'roll'])
  return scanFormula(formula.trim(), allowed)
}

/**
 * 安全求值：只允许 数字/四则/比较/逻辑/三元/Math 与注入变量。任何越界一律回 0。
 * @param {string} formula
 * @param {object} [vars] 注入变量
 * @returns {number} Math.floor 后的数值；非法/非数/异常 → 0
 */
export function evalFormula(formula, vars = {}) {
  if (!formula || typeof formula !== 'string') return 0
  try {
    const sanitized = formula.trim()

    const scope = {
      ...vars,
      roll: Math.random(),
      Math,
      max: Math.max, min: Math.min, floor: Math.floor, ceil: Math.ceil,
      round: Math.round, abs: Math.abs, sqrt: Math.sqrt, pow: Math.pow, random: Math.random,
    }

    // 标识符白名单 = 实际注入的 scope 键 ∪ Math 成员名（属性名亦在此校验，拒 process/Function/constructor…）
    const allowedIds = new Set([...Object.keys(scope), ...MATH_MEMBERS])
    if (!scanFormula(sanitized, allowedIds)) return 0

    const argNames = Object.keys(scope)
    const argValues = Object.values(scope)
    // eslint-disable-next-line no-new-func
    const fn = new Function(...argNames, `"use strict"; return (${sanitized})`)
    const result = fn(...argValues)

    if (typeof result !== 'number' || isNaN(result)) return 0
    return Math.floor(result)
  } catch {
    return 0
  }
}
