// ─────────────────────────────────────────────────────────────────
// KALEIDO 渐进披露 · ui_unlocks 触发注册表 + 判定（服务端权威）
//   契约:docs/plan/kaleido/06-ui-unlocks-contract.md(§2 清单 / §3.1-3.3 判定 / §1.3 时序法则)。
// ─────────────────────────────────────────────────────────────────
// 纯模块(无 @/ 别名、无 DB 依赖):可被原生 Node ESM 直接 smoke。判定输入 = 路由边界前后态快照,
//   零新动词——复用传感层动词(events.js ACTION_VERB) + before/after diff(同 fight_start 手法)。
//
// 时序法则(06 §1.3·不可违反):hp_bar 挂**首次 search**(不挂 fight_start)——非战斗死亡向量
//   (污染熔毁/Ω 超时/收缩 alive=false)可先于 fight_start 结算;首次 search 是每 run 结构第一动作
//   (初始 UI 仅搜索按钮),解锁 hp_bar 早于一切伤害/死亡向量。求值在路由边界无条件(死亡回合亦发)。

// 初始种子集(Kanata 定向:开局只有一个搜索按钮)。startKaleidoRun 以此为底 ∪ 账号已解锁集。
export const UI_SEED = ['search_btn']

// nar_line:📖 N3 供稿(P1 方案 A 引擎内联,经 unlockEvents 流转,组件侧零硬编码——06 §5 决策 2)。
//   hp_bar 文案由「首次遭遇前」改为「首次 search」后待 📖 复核(06 §5 决策 3)。
// match(ctx):ctx = { action, beforeMe, afterMe, beforeClearedSeq, afterClearedSeq, node, fightStart }。
//   返回 true = 该 ui_key 本动作满足触发(判定「是否已解锁」由调用方以账号集为权威,此处只管触发条件)。
// 顺序 = unlockEvents 下发顺序(level_header 先于 turn_counter)。
export const KALEIDO_UI_UNLOCKS = [
  {
    ui_key: 'log_panel', timing: 'after',
    nar_line: '开始记录。——从你翻找的这一下算起。',
    match: (c) => c.action === 'search',
  },
  {
    ui_key: 'inventory', timing: 'after',
    nar_line: '你需要地方放它。——已开放：随身储物。',
    match: (c) => c.action === 'search' && invGrew(c),
  },
  {
    ui_key: 'hp_bar', timing: 'before', precedes: ['首次可受伤'],
    nar_line: '你动起来了。往后有损耗，得盯着了。——已开放：状况读数。', // 📖 定稿·全角(N3 §1 · 36a17c1 后)
    match: (c) => c.action === 'search', // 时序法则:首次 search 即解锁,先于一切伤害/死亡向量
  },
  {
    ui_key: 'combat_panel', timing: 'after',
    nar_line: '有东西在动。它先看见了你。——已开放：自卫。',
    match: (c) => !!c.fightStart, // 首次遭遇建立(boss move / search 生成遭遇均触发)
  },
  {
    ui_key: 'move_btn', timing: 'after',
    nar_line: '这一段的事，办完了。——已开放：前进。',
    match: (c) => (c.afterClearedSeq ?? 0) > (c.beforeClearedSeq ?? 0), // 过关(clearedSeq 内存 diff·level_clear 事件不回传路由)
  },
  {
    ui_key: 'level_header', timing: 'after',
    nar_line: '路是分段的。——现在你知道了。',
    match: (c) => isMove(c.action),
  },
  {
    ui_key: 'turn_counter', timing: 'after',
    nar_line: '做一件事，算一回合。——系统开始计数。',
    match: (c) => isMove(c.action), // 与 level_header 同批(注册表内排后 → unlockEvents 顺序在后)
  },
  {
    ui_key: 'rules_card', timing: 'before',
    nar_line: '这一段，规矩不一样。——已张贴在门口。',
    match: (c) => isMove(c.action) && nonstandardNode(c.node), // 时序法则:入非标准关前。P1 LIVE(采样器出非标准 combat_mode 关;D3 落 env_rules 后条件再扩)
  },
  {
    ui_key: 'stance_ui', timing: 'before',
    nar_line: '这东西打起来讲究路数。——已开放：应招。',
    match: (c) => !!c.fightStart && c.node?.kaleidoMode?.template_ref === 'stance_duel', // P1 LIVE(读关 node 的 mode·非遭遇实例 → 无需 LW-2;stance_duel 关遭遇即触发)
  },
  {
    ui_key: 'craft_btn', timing: 'after',
    nar_line: '这两样，拼得到一起。——已开放：动手做。',
    match: (c) => c.action === 'search' && craftMatGained(c), // P1 DEAD:配方材料判据待 item kind + ⚙️ 投放(06 §2.1)
  },
]

const BY_KEY = Object.fromEntries(KALEIDO_UI_UNLOCKS.map((e) => [e.ui_key, e]))

// ── 条件谓词(06 §2.1)────────────────────────────────────────────
function isMove(action) {
  return action === 'move' || action === 'advanceChamber'
}
function invGrew(c) {
  const b = Array.isArray(c.beforeMe?.inventory) ? c.beforeMe.inventory.length : 0
  const a = Array.isArray(c.afterMe?.inventory) ? c.afterMe.inventory.length : 0
  return a > b
}
function nonstandardNode(node) {
  const ref = node?.kaleidoMode?.template_ref
  return !!ref && ref !== 'standard'
}
function craftMatGained() {
  // TODO(⚙️/🔧):配方材料 = item kind ∈ 合成材料 —— 需路由边界读 item_pool.kind 判据。
  //   P1 未接 → 恒 false(craft_btn DEAD),与 06 §2 契约「LIVE when 配方材料可搜出」一致。
  return false
}

// ── 判定:返回本动作**新满足触发**且**尚未在账号集**的 ui_key(注册表顺序)────────
//   already = 当前已解锁集(账号镜像·权威);单调只增·幂等(重试/重锁重入不重复)。
export function evaluateUnlocks(ctx = {}) {
  const already = new Set(Array.isArray(ctx.already) ? ctx.already : [])
  const out = []
  for (const entry of KALEIDO_UI_UNLOCKS) {
    if (already.has(entry.ui_key)) continue
    let hit = false
    try { hit = !!entry.match(ctx) } catch { hit = false }
    if (hit) out.push(entry.ui_key)
  }
  return out
}

export function unlockTiming(uiKey) {
  return BY_KEY[uiKey]?.timing ?? 'after'
}

// 客户端 unlockEvents payload(06 §1.2):{ ui_key, nar_line, timing, precedes?, seq }。
//   nar_line 服务端权威下发 → 客户端零硬编码。
export function buildUnlockEventsPayload(newKeys, seq) {
  const s = Number.isFinite(seq) ? seq : null
  return (newKeys || []).map((k) => {
    const e = BY_KEY[k] || {}
    const ev = { ui_key: k, nar_line: e.nar_line ?? '', timing: e.timing ?? 'after', seq: s }
    if (Array.isArray(e.precedes) && e.precedes.length) ev.precedes = e.precedes
    return ev
  })
}
