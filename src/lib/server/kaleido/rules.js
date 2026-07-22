// ─────────────────────────────────────────────────────────────────
// KALEIDO D3 · 逐关规则覆盖（mergeGameRules）
// ─────────────────────────────────────────────────────────────────
// 纯模块(无 @/ 别名、无 DB 依赖):可被原生 Node ESM 直接 smoke / E2E 单元断言。
//
// ⚠ 架构前提(2026-07-22 实测·决定本实现形态):
//   `loadGameRules`(gameEngine.js:19)是**进程级全局 memo 单例** `_rulesCache` —— 无 TTL、
//   kaleido/多人/admin **共享同一对象身份**,`client` 参数首次之后被忽略。
//   ⟹ ①逐关覆盖**绝不能写回** `_rulesCache`(会污染所有房/所有请求);
//      ②`clearRulesCache()`(gameEngine.js:40·仓库零调用点)**不是**本特性的正确工具:
//        它清的是「全局规则表缓存」,而逐关覆盖来自 **node(内存)** 不来自 DB —— 清了也不会带来
//        逐关值,反而是**跨房全局副作用**(所有房下次 loadGameRules 重查库)。故 D3 **不加入关 clearRulesCache**,
//        改为「每次消费时合出新对象」。原派单里的「入关 clearRulesCache 调用点」按此实测更正(已报 🧭)。
//
// 语义:无覆盖 → **原样返回 globalRules(同一身份)** → 零拷贝、逐字节零行为变化(未覆盖的关/多人局路径无感)。
//      有覆盖 → 返回**新对象**(浅拷贝 + 覆盖),调用方本次消费用它,不落任何缓存。

// formula_overrides 白名单(派单:damage|defense|crit)→ 实际可覆盖的 game_rules 键。
//   注:crit 非公式(calcDamage 内 dmg*critMultiplier 硬编码),defense 亦无独立公式
//   (def 经 def_base_multiplier 折进 damage_formula)——故三类映射到下列键集。
export const FORMULA_OVERRIDE_KEYS = {
  damage: ['damage_formula', 'atk_base_multiplier'],
  defense: ['def_base_multiplier'],
  crit: ['crit_rate', 'crit_multiplier'],
}
export const FORMULA_OVERRIDE_ALLOWED = new Set(
  Object.values(FORMULA_OVERRIDE_KEYS).flat(),
)

// 条目形状(两者同构·数组):[{ key, value }, ...]
//   env_rules        —— 逐关环境规则:按 key 覆盖任意 game_rules 键(作者内容·经 🧭/🔒 审入库)。
//   formula_overrides —— 逐关公式覆盖:**仅** FORMULA_OVERRIDE_ALLOWED 内的键生效,白名单外静默忽略(记 warn)。
export function mergeGameRules(globalRules, envRules, formulaOverrides) {
  const env = Array.isArray(envRules) ? envRules : []
  const fo = Array.isArray(formulaOverrides) ? formulaOverrides : []
  if (env.length === 0 && fo.length === 0) return globalRules // 零覆盖 → 同一身份返回(零行为变化)

  const merged = { ...(globalRules || {}) } // 新对象:绝不写回全局 _rulesCache
  for (const r of env) {
    if (r && typeof r.key === 'string' && r.key) merged[r.key] = r.value
  }
  for (const f of fo) {
    if (!f || typeof f.key !== 'string' || !f.key) continue
    if (FORMULA_OVERRIDE_ALLOWED.has(f.key)) {
      merged[f.key] = f.value
    } else {
      console.warn(`[kaleido/D3] formula_override 键不在白名单(damage|defense|crit),已忽略: ${f.key}`)
    }
  }
  return merged
}
