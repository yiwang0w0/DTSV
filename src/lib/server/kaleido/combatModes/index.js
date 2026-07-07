// ─────────────────────────────────────────────────────────────────
// KALEIDO 战斗模板注册表（KP1-S D2 · 02 §3.3 · R1/R3/R4/R6）
// ─────────────────────────────────────────────────────────────────
// 每模板：{ paramsSchema, initState, actions, resolveTurn, bot, describe }。
// · resolveTurn(state, action, params) → state' —— **纯函数（R1：同输入同输出）**；随机只走 state 内嵌
//     rngState 派生的确定性 PRNG（R3：run seed 派生），不用 Math.random、不读 DB。
// · bot(state, params) → action —— 离线模拟出招（P2 模拟校验前置资产；P1 用于自测 clear_rate 基线）。
// · describe(params) → 中文规则说明 —— R6「生效前展示」素材（🎨 R6 卡消费）。
// 自包含（零 @/ 别名、零 DB）：可被原生 Node ESM 直接 smoke（scripts/smoke-kaleido-combat.mjs）。
// 回合制（R4）：无实时/计时；一次 resolveTurn = 一个离散回合（玩家行动 → 敌方响应 → 判胜负）。

// ── 内嵌确定性 PRNG（mulberry32；rngState 存进 state → resolveTurn 纯函数） ──
export function hashStr(str) {
  let h = 2166136261 >>> 0
  const s = String(str)
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return h >>> 0
}
function stepRng(rngState) {
  let a = (rngState + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return { val: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: a >>> 0 }
}

// 自包含伤害（不依赖 game_rules；params 覆盖乘区/暴击）。返回 {dmg, state}（推进 rng）。
function hit(atk, def, params, rngState) {
  const atkMul = num(params.atkMul, 1)
  const defMul = num(params.defMul, 0.5)
  let dmg = Math.max(1, Math.floor(atk * atkMul - def * defMul))
  const r = stepRng(rngState)
  // 暴击后重钳 dmg≥1（🔒 finding 2：防 critMul<1 归 0 / critMul<0 敌人回血）
  if (r.val < num(params.critRate, 0.1)) dmg = Math.max(1, Math.floor(dmg * num(params.critMul, 1.5)))
  return { dmg, state: r.state }
}
function num(v, d) { return Number.isFinite(v) ? v : d }
function clampHp(v) { return Math.max(0, Math.floor(v)) }

// 初始 combat state（player/enemy + rngState 由 seed 派生）。所有模板共用。
function baseState(setup, seedKey) {
  const p = setup.player || {}
  const e = setup.enemy || {}
  return {
    player: { hp: num(p.hp, 100), maxHp: num(p.maxHp, p.hp ?? 100), atk: num(p.atk, 10), def: num(p.def, 5), potions: num(p.potions, 2), heal: num(p.heal, 30) },
    enemy: { hp: num(e.hp, 40), maxHp: num(e.maxHp, e.hp ?? 40), atk: num(e.atk, 8), def: num(e.def, 3) },
    turn: 0,
    rngState: hashStr(`${setup.seed ?? 'kaleido'}:${seedKey || 'combat'}`),
    over: false,
    outcome: null,
  }
}

// 敌方普攻 + 判负（player.hp<=0）。共用尾段。
function enemyStrikeAndSettle(s, params) {
  const player = { ...s.player }
  const enemy = { ...s.enemy }
  let rngState = s.rngState
  if (enemy.hp > 0) {
    const h = hit(enemy.atk, player.def, params, rngState); rngState = h.state
    player.hp = clampHp(player.hp - h.dmg)
  }
  const over = player.hp <= 0 || enemy.hp <= 0
  const outcome = over ? (enemy.hp <= 0 ? 'win' : 'lose') : null
  return { ...s, player, enemy, rngState, turn: s.turn + 1, over, outcome }
}

// 玩家行动分派（attack/item）。返回中间态（未含敌方响应）。
function applyPlayerAction(s, action, params) {
  const player = { ...s.player }
  const enemy = { ...s.enemy }
  let rngState = s.rngState
  const kind = action?.type || 'attack'
  if (kind === 'item' && player.potions > 0 && player.hp < player.maxHp) {
    player.potions -= 1
    player.hp = Math.min(player.maxHp, player.hp + player.heal)
  } else { // attack（默认）
    const h = hit(player.atk, enemy.def, params, rngState); rngState = h.state
    enemy.hp = clampHp(enemy.hp - h.dmg)
  }
  return { ...s, player, enemy, rngState }
}

// 贪心 bot：HP<阈用药否则攻击（standard/gauntlet 共用；阈可调）。
function greedyBot(hpFrac) {
  return (s) => (s.player.hp / (s.player.maxHp || 1) < hpFrac && s.player.potions > 0
    ? { type: 'item' } : { type: 'attack' })
}

// ══════════════ 模板 1：standard（现行流程的回合制包装） ══════════════
const standard = {
  key: 'standard',
  paramsSchema: { atkMul: 'number?', defMul: 'number?', critRate: 'number?', critMul: 'number?' },
  actions: () => ['attack', 'item'],
  initState: (setup) => baseState(setup, 'standard'),
  resolveTurn(state, action, params = {}) {
    if (state.over) return state
    return enemyStrikeAndSettle(applyPlayerAction(state, action, params), params)
  },
  bot: greedyBot(0.3),
  describe: () => '标准对决：与单个敌人轮流出手，攻击或用药，先将对方 HP 清零者胜。',
}

// ══════════════ 模板 2：gauntlet（波次战） ══════════════
const gauntlet = {
  key: 'gauntlet',
  paramsSchema: { waves: 'number', waveHeal: 'number?', enemyScale: 'number?', atkMul: 'number?', defMul: 'number?' },
  actions: () => ['attack', 'item'],
  initState(setup, params = {}) {
    const s = baseState(setup, 'gauntlet')
    s.wave = 1
    s.wavesTotal = Math.max(1, Math.floor(num(params.waves, 3)))
    // 原始波1敌快照 —— 波进阶从它算 scale^(wave-1)（🔒 finding 1：防用当前已缩放敌为基→复利超指数）
    s.baseEnemy = { maxHp: s.enemy.maxHp, atk: s.enemy.atk, def: s.enemy.def }
    return s
  },
  resolveTurn(state, action, params = {}) {
    if (state.over) return state
    const s = enemyStrikeAndSettle(applyPlayerAction(state, action, params), params)
    // 本波敌人被清（enemyStrikeAndSettle 判 win）→ 若还有波次：整备（小恢复）+ 下一波（enemyScale 递增），未判胜
    if (s.outcome === 'win' && s.wave < s.wavesTotal) {
      const scale = num(params.enemyScale, 1.15)
      const nextWave = s.wave + 1
      const player = { ...s.player, hp: Math.min(s.player.maxHp, s.player.hp + num(params.waveHeal, 15)) }
      const base = state.baseEnemy || state.enemy // 原始波1敌为基（非当前已缩放敌·防超指数复利·🔒 finding 1）
      const enemy = {
        maxHp: Math.floor(num(base.maxHp, 40) * Math.pow(scale, nextWave - 1)),
        atk: Math.floor(num(base.atk, 8) * Math.pow(scale, nextWave - 1)),
        def: num(base.def, 3),
      }
      enemy.hp = enemy.maxHp
      return { ...s, player, enemy, wave: nextWave, over: false, outcome: null }
    }
    return s
  },
  bot: greedyBot(0.4), // 资源节奏型：更早用药以跨波续航
  describe: (params = {}) => `波次战：连续 ${Math.max(1, Math.floor(num(params.waves, 3)))} 波敌人，逐波增强；波间小幅恢复。击破全部波次即胜，中途倒下即败。`,
}

// ══════════════ 模板 3：stance_duel（三态克制·猜拳） ══════════════
// 攻(atk) 克 技(skill)、技 克 守(def)、守 克 攻 —— 克制方伤害 × params.counterMul。
const STANCES = ['atk', 'def', 'skill']
const BEATS = { atk: 'skill', skill: 'def', def: 'atk' } // key 克 value
const stance_duel = {
  key: 'stance_duel',
  paramsSchema: { counterMul: 'number?', atkMul: 'number?', defMul: 'number?' },
  actions: () => STANCES.map((st) => `stance:${st}`),
  initState(setup) {
    const s = baseState(setup, 'stance_duel')
    s.playerStanceCounts = { atk: 0, def: 0, skill: 0 }
    return s
  },
  resolveTurn(state, action, params = {}) {
    if (state.over) return state
    const pStance = parseStance(action) || 'atk'
    let rngState = state.rngState
    // 敌方出招：确定性 rng 选姿态
    const r = stepRng(rngState); rngState = r.state
    const eStance = STANCES[Math.floor(r.val * 3) % 3]
    const counterMul = num(params.counterMul, 1.6)
    const player = { ...state.player }
    const enemy = { ...state.enemy }

    // 玩家伤害（若玩家姿态克制敌方，×counterMul；被克则 ÷counterMul）
    let pMul = 1
    if (BEATS[pStance] === eStance) pMul = counterMul
    else if (BEATS[eStance] === pStance) pMul = 1 / counterMul
    const ph = hit(player.atk, enemy.def, { ...params, atkMul: num(params.atkMul, 1) * pMul }, rngState); rngState = ph.state
    enemy.hp = clampHp(enemy.hp - ph.dmg)

    // 敌方反击（存活时）：对称克制
    let over = enemy.hp <= 0
    let outcome = over ? 'win' : null
    if (!over) {
      let eMul = 1
      if (BEATS[eStance] === pStance) eMul = counterMul
      else if (BEATS[pStance] === eStance) eMul = 1 / counterMul
      const eh = hit(enemy.atk, player.def, { ...params, atkMul: num(params.atkMul, 1) * eMul }, rngState); rngState = eh.state
      player.hp = clampHp(player.hp - eh.dmg)
      over = player.hp <= 0
      outcome = over ? 'lose' : null
    }
    const counts = { ...state.playerStanceCounts, [pStance]: (state.playerStanceCounts?.[pStance] || 0) + 1 }
    return { ...state, player, enemy, rngState, turn: state.turn + 1, over, outcome, playerStanceCounts: counts, lastEnemyStance: eStance }
  },
  // 频率对策型：数敌方无法预测，改为反制「玩家最常出的姿态的克制姿态」——用出被玩家高频姿态所克的姿态？
  //   简化：bot 出「能克制玩家最常姿态」的姿态（预判玩家惯性）。
  bot(state) {
    const counts = state.playerStanceCounts || { atk: 0, def: 0, skill: 0 }
    let top = 'atk', max = -1
    for (const st of STANCES) if ((counts[st] || 0) > max) { max = counts[st] || 0; top = st }
    // 出「克制 top」的姿态：找 key 使 BEATS[key]===top
    const counter = STANCES.find((st) => BEATS[st] === top) || 'atk'
    return { type: `stance:${counter}` }
  },
  describe: (params = {}) => `三态克制（猜拳）：攻 克 技、技 克 守、守 克 攻；克制方伤害 ×${num(params.counterMul, 1.6)}、被克方 ÷。每回合双方各出一态，先清零对方 HP 者胜。`,
}
function parseStance(action) {
  const t = action?.type || ''
  const m = /^stance:(atk|def|skill)$/.exec(t)
  return m ? m[1] : null
}

export const COMBAT_MODES = { standard, gauntlet, stance_duel }
export function getCombatMode(ref) { return COMBAT_MODES[ref] || COMBAT_MODES.standard }

// 离线模拟一场战斗（bot 出招驱动 resolveTurn 到分出胜负）；纯确定性（同 setup+params 同结果）。
// 返回 { outcome, turns }。maxTurns 兜底防死循环（异常参数）。
export function simulateBattle(mode, setup, params = {}, maxTurns = 200) {
  let s = mode.initState(setup, params)
  let n = 0
  while (!s.over && n < maxTurns) {
    s = mode.resolveTurn(s, mode.bot(s, params), params)
    n++
  }
  return { outcome: s.outcome || (s.over ? (s.player.hp > 0 ? 'win' : 'lose') : 'timeout'), turns: n }
}

// 一组 seed 上跑 bot，产出 clear_rate 基线（P2 difficulty_band 校验前置资产）。
export function botClearRate(mode, setupFn, params = {}, seeds = 200) {
  let win = 0, totalTurns = 0
  for (let i = 0; i < seeds; i++) {
    const { outcome, turns } = simulateBattle(mode, setupFn(i), params)
    if (outcome === 'win') win++
    totalTurns += turns
  }
  return { clearRate: win / seeds, avgTurns: totalTurns / seeds, seeds }
}
