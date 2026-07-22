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

// 配方材料判据（craft_btn 触发口径）——**排除式，不是白名单**。
//   2026-07-22 订正（🧭 审出的静默断链）：原实现是正向白名单 ['tech_fragment','platform_part','omega_matter']，
//   而上一版注释写的口径一直是「非 consumable 即材料」——**注释与实现相反**。⚙️ 新增 kind='material' 的 6 个
//   散件入库后，白名单不含它 ⇒ isMat 恒 false ⇒ hasCraftMat 不置位 ⇒ **craft_btn 永不解锁，且无任何报错**。
//   根因不是「少写一个字符串」，是**每加一个 kind 就静默漏一次**。故改回排除式：
//     材料 = kind ∉ NON_MATERIAL_KINDS（能直接使用/装备的那些）
//   ⇒ 新增材料类 kind 自动被认；只有新增**可用**类 kind 才需动这张表（那种改动必然伴随使用逻辑，不会被忘）。
//   ⚠ 本文件刻意保持「纯模块·无 @/ 别名」以便原生 Node smoke ⇒ 不 import constants.js 的 ITEM_KIND_META；
//     两处 kind 台账的同步由 scripts/check-item-kinds.mjs（串进 npm run gate）守。
export const NON_MATERIAL_KINDS = ['consumable', 'equipment']
export function isCraftMaterialKind(kind) {
  return !!kind && !NON_MATERIAL_KINDS.includes(kind)
}
// 快照(仅供台账/断言可读性用)。**运行时判据一律走 isCraftMaterialKind**，不要再拿它做 includes。
export const CRAFT_MATERIAL_KINDS = ['material', 'tech_fragment', 'platform_part', 'omega_matter']

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
    match: (c) => c.action === 'search' && craftMatGained(c), // LIVE(2026-07-08)：搜到 kind∈材料(hook① drain 置 hasCraftMat)即解锁
  },
  // ── B4 后段披露（doc 10 §4 · ⚙️ 设计 · 绑「准备度兑现」瞬间 · 治倒挂曲线 + 后半崩塌）──
  //   三件全在现有循环内(合成/战力/收敛),不含污染/Ω/残片/buff/立绘(守 B3)。
  //   ⚠ 三条 nar_line = 📖 N3 §1 表**现稿逐字取**(88d6694)。它们仍是「——已开放:X」宣告式,而教义 11 §2
  //     推论已**禁用**该句式 → 📖 将在「去宣告化」批次重写,🧭 转来后**只换这三个字符串**。
  //     判定逻辑**零依赖**文本(match 不读 nar_line;下发只经 buildUnlockEventsPayload 透传)⇒ 换字即完事。
  {
    ui_key: 'loadout_panel', timing: 'after',
    nar_line: '这一件算在你身上了。你比刚进来时结实了一点。——已开放：清点。',
    // 首次 craft 成功（craftItemRecipe 置 hasCrafted）**或** 首次用持久 stat 件（useItem 抬 atk/def/maxHp）
    match: (c) => (!c.beforeMe?.hasCrafted && !!c.afterMe?.hasCrafted) || (c.action === 'useItem' && statGained(c)),
  },
  {
    ui_key: 'prep_readout', timing: 'before', precedes: ['boss 对峙'],
    nar_line: '前面那个，和你之前碰见的不是一回事。——已开放：掂量。',
    // entering_boss_level：move 入 boss 关时(R6「生效前展示」)——先于 boss 对峙浮现
    match: (c) => isMove(c.action) && isBossNode(c.node),
  },
  {
    ui_key: 'convergence_preview', timing: 'before', precedes: ['收敛页'],
    nar_line: '不再往里了。这一趟的账，该合了。——已开放：合计。',
    // ⚠ 时序锚点(📖 N3 §5 blocking 警告·**勿与 hp_bar/rules_card 的 before 类推**)：
    //   本条 before 锚的是**切收敛页之前**,不是「boss 开打前」——触发事件是 boss_kill/run 终止**本身**。
    //   误接成 boss 开打前 = 剧透结局,且那时账还没得算。故 precedes 明写「收敛页」下发给 🎨。
    // ⚠ 终态分支(同上)：**仅通关授予首次解锁**;abandon 不触发;死亡不授予(仅复用已解锁面板)。
    //   判据 `clearedSeq 达末关` 天然满足三者:abandon 走 abandonKaleidoRun 不动 clearedSeq;
    //   死亡不过关故 clearedSeq 不进位;唯有清掉末关(=boss_kill 通关)这一拍命中。见 E2E §⑨ 钉死。
    match: (c) => (c.afterClearedSeq ?? 0) >= (c.levelCount ?? 5) && (c.beforeClearedSeq ?? 0) < (c.levelCount ?? 5),
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
// B4：持久 stat 件兑现 —— 本动作抬高了 atk/def/maxHp（useItem 的 atkDelta/defDelta/maxHpDelta 直改玩家属性·非计时 buff）。
function statGained(c) {
  const b = c.beforeMe || {}, a = c.afterMe || {}
  return (Number(a.atk) || 0) > (Number(b.atk) || 0)
    || (Number(a.def) || 0) > (Number(b.def) || 0)
    || (Number(a.maxHp) || 0) > (Number(b.maxHp) || 0)
}
// B4：boss 关判定（entering_boss_level）—— archetype 优先，exit=boss_kill 兜底（种子关/采样关都覆盖）。
function isBossNode(node) {
  return node?.archetype === 'boss' || node?.kaleidoExit?.type === 'boss_kill'
}
function craftMatGained(c) {
  // 配方材料 = item kind ∈ CRAFT_MATERIAL_KINDS。hook① drain 搜到材料时置 player.hasCraftMat(单调),
  //   此处检本动作「首次获得材料」的转变(after 真 ∧ before 假)→ craft_btn 仅解锁一次。
  return !!c.afterMe?.hasCraftMat && !c.beforeMe?.hasCraftMat
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
