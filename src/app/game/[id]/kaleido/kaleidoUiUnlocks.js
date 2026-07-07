// KALEIDO · 渐进披露 ui_unlocks 数据层（05 §1「UI 即进度」）
//   纯数据 + 纯函数、零 React、零副作用 —— 供 useKaleidoUiUnlocks 钩子与 KaleidoRunView 消费。
//
//   ⚠ 本模块是【前端 stub】：解锁条目形状照 05 §1.1，nar_line 全量取自 📖 N3（docs/narrative/
//     kaleido-n3-static-layer.md §1）——文案走数据、组件侧零硬编码。真数据源（🔧 的账号级持久化解锁集
//     + action 响应下发的解锁事件，含 nar_line）接口形状广播后，deriveStubUnlocks 由服务端解锁集替换、
//     UI_UNLOCK_ENTRIES 由入库文案覆盖；readServerUnlocks 已预留读取缝。
//
//   硬时序法则（05 §1.2，不可违反）：任何能伤害玩家的机制，其读数 UI 必须先于首次伤害解锁 ——
//     hp_bar(timing=before) 与首次遭遇同刻浮现、必先于任何掉血；rules_card(timing=before) 先于规则生效。

// ── 12 项 ui_key（05 §1.3 清单 · 顺序即披露栈序）──────────────────────────
export const UI_KEYS = {
  SEARCH: 'search_btn',
  LOG: 'log_panel',
  INVENTORY: 'inventory',
  HP: 'hp_bar',
  COMBAT: 'combat_panel',
  MOVE: 'move_btn',
  LEVEL_HEADER: 'level_header',
  TURN_COUNTER: 'turn_counter',
  RULES_CARD: 'rules_card',
  STANCE: 'stance_ui',
  CRAFT: 'craft_btn',
}

// 初始态唯一 UI（Kanata 定向：开局只有一个搜索按钮）。
export const INITIAL_UNLOCKED = [UI_KEYS.SEARCH]

// 解锁条目（05 §1.1 形状）。trigger.verb 复用传感层动词（🔧 权威，命名以其广播为准）；
//   timing=before 表在事件结算「前」浮现（时序法则）。nar_line = 📖 N3 §1 全量供稿，勿在组件里另写。
export const UI_UNLOCK_ENTRIES = {
  [UI_KEYS.SEARCH]: {
    ui_key: UI_KEYS.SEARCH,
    trigger: { verb: null, condition: null, timing: 'initial' },
    nar_line: '供电恢复。可用功能：一项。',
    note: '初始唯一 UI',
  },
  [UI_KEYS.LOG]: {
    ui_key: UI_KEYS.LOG,
    trigger: { verb: 'search', condition: null, timing: 'after' },
    nar_line: '开始记录。——从你翻找的这一下算起。',
    note: 'NAR 通道随第一次搜索醒来',
  },
  [UI_KEYS.INVENTORY]: {
    ui_key: UI_KEYS.INVENTORY,
    trigger: { verb: 'item_gain', condition: null, timing: 'after' },
    nar_line: '你需要地方放它。——已开放：随身储物。',
    note: '首次获得道具',
  },
  [UI_KEYS.HP]: {
    ui_key: UI_KEYS.HP,
    trigger: { verb: 'fight_start', condition: null, timing: 'before' },
    nar_line: '前面不保证安全。——已开放：状况读数。',
    precedes: ['首次可受伤'],
    note: '时序法则锚点：先于首次伤害',
  },
  [UI_KEYS.COMBAT]: {
    ui_key: UI_KEYS.COMBAT,
    trigger: { verb: 'fight_start', condition: null, timing: 'after' },
    nar_line: '有东西在动。它先看见了你。——已开放：自卫。',
    note: '首次遭遇（安全上演）',
  },
  [UI_KEYS.MOVE]: {
    ui_key: UI_KEYS.MOVE,
    trigger: { verb: 'level_clear', condition: null, timing: 'after' },
    nar_line: '这一段的事，办完了。——已开放：前进。',
    note: '首次 level_clear',
  },
  [UI_KEYS.LEVEL_HEADER]: {
    ui_key: UI_KEYS.LEVEL_HEADER,
    trigger: { verb: 'move', condition: null, timing: 'after' },
    nar_line: '路是分段的。——现在你知道了。',
    note: '首次 move 后',
  },
  [UI_KEYS.TURN_COUNTER]: {
    ui_key: UI_KEYS.TURN_COUNTER,
    trigger: { verb: 'move', condition: null, timing: 'after' },
    nar_line: '做一件事，算一回合。——系统开始计数。',
    note: '与 level_header 同批',
  },
  [UI_KEYS.RULES_CARD]: {
    ui_key: UI_KEYS.RULES_CARD,
    trigger: { verb: 'level_enter', condition: 'has_rule_override', timing: 'before' },
    nar_line: '这一段，规矩不一样。——已张贴在门口。',
    note: '时序法则：规则关入关前',
  },
  [UI_KEYS.STANCE]: {
    ui_key: UI_KEYS.STANCE,
    trigger: { verb: 'level_enter', condition: 'stance_duel', timing: 'before' },
    nar_line: '这东西打起来讲究路数。——已开放：应招。',
    note: '首个 stance_duel 精英关（1b 三态出招归此）',
  },
  [UI_KEYS.CRAFT]: {
    ui_key: UI_KEYS.CRAFT,
    trigger: { verb: 'item_gain', condition: 'recipe_material', timing: 'after' },
    nar_line: '这两样，拼得到一起。——已开放：动手做。',
    note: '首次拾得配方材料',
  },
}

// 披露栈序（初始 → 逐步）。渐次动效按此顺序错峰；亦供 dev 预览遍历。
export const REVEAL_ORDER = [
  UI_KEYS.SEARCH, UI_KEYS.LOG, UI_KEYS.INVENTORY, UI_KEYS.HP, UI_KEYS.COMBAT,
  UI_KEYS.MOVE, UI_KEYS.LEVEL_HEADER, UI_KEYS.TURN_COUNTER, UI_KEYS.RULES_CARD,
  UI_KEYS.STANCE, UI_KEYS.CRAFT,
]

// ── 读取缝：🔧 真数据源（账号级持久化解锁集，随 gamevars 下发）──────────────
//   接口形状定稿前的占位约定：读 gamevars.kaleido.uiUnlocks:string[]。字段名/形状以 🔧 广播为准，
//   届时仅改此一处 + 停用 deriveStubUnlocks 即可切真数据。
export function readServerUnlocks(gamevars) {
  const raw = gamevars?.kaleido?.uiUnlocks
  return Array.isArray(raw) ? raw.filter((k) => typeof k === 'string') : []
}

// ── 前端 stub 派生：从可观测的对局状态推出「应已解锁」的 ui_key 集 ─────────────
//   仅在 🔧 解锁集未下发时兜底驱动渐进披露（首个 run 可演示）。规则镜像 05 §1.3 触发时机；
//   sticky（只增不减）由钩子负责。ctx 由钩子从 gamevars/me 计算，全为布尔。
//   ⚠ STUB：🔧 账号级解锁事件上线后本函数应停用（服务端解锁集权威）。
export function deriveStubUnlocks(ctx = {}) {
  const keys = new Set([UI_KEYS.SEARCH]) // 初始唯一
  if (ctx.searched) keys.add(UI_KEYS.LOG)
  if (ctx.hasItems) keys.add(UI_KEYS.INVENTORY)
  // hp_bar timing=before：与遭遇建立同刻浮现（遭遇成立在首次伤害之前 ⇒ 满足时序法则）。
  if (ctx.encounter || ctx.everFought) {
    keys.add(UI_KEYS.HP)
    keys.add(UI_KEYS.COMBAT)
  }
  if (ctx.clearedAny) keys.add(UI_KEYS.MOVE)
  if (ctx.movedAny) {
    keys.add(UI_KEYS.LEVEL_HEADER)
    keys.add(UI_KEYS.TURN_COUNTER)
  }
  if (ctx.ruleLevel) keys.add(UI_KEYS.RULES_CARD)
  if (ctx.stanceLevel) keys.add(UI_KEYS.STANCE)
  if (ctx.hasCraftMat) keys.add(UI_KEYS.CRAFT)
  return keys
}

// 便捷取条目（含 nar_line）。未知 key 返回 null（防御）。
export function unlockEntry(uiKey) {
  return UI_UNLOCK_ENTRIES[uiKey] || null
}
