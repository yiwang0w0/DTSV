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
    trigger: { verb: 'search', condition: 'inventory_gained', timing: 'after' },
    nar_line: '你需要地方放它。——已开放：随身储物。',
    note: '首次获得道具（🔧 06 §2：search + inventory_gained）',
  },
  [UI_KEYS.HP]: {
    ui_key: UI_KEYS.HP,
    // 🔧 06 §1.3 D3（时序法则 blocker 修正）：hp_bar 挂首次 search、非 fight_start——
    //   非战斗死亡向量（污染熔毁/Ω 超时/收缩）可先于 fight_start，故须首个动作即显、早于一切伤害。
    trigger: { verb: 'search', condition: null, timing: 'before' },
    nar_line: '前面不保证安全。——已开放：状况读数。',
    precedes: ['首次可受伤'],
    note: '时序法则锚点：先于一切伤害/死亡向量（首搜即显）',
  },
  [UI_KEYS.COMBAT]: {
    ui_key: UI_KEYS.COMBAT,
    trigger: { verb: 'fight_start', condition: null, timing: 'after' },
    nar_line: '有东西在动。它先看见了你。——已开放：自卫。',
    note: '首次遭遇（安全上演）',
  },
  [UI_KEYS.MOVE]: {
    // 🔧 06 §2/D6：走 cleared_seq_increased 内存 diff（level_clear 事件不回传路由）。
    ui_key: UI_KEYS.MOVE,
    trigger: { verb: 'state_diff', condition: 'cleared_seq_increased', timing: 'after' },
    nar_line: '这一段的事，办完了。——已开放：前进。',
    note: '首次过关（clearedSeq 增长）',
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
    // 🔧 06 §2/D5：move + entering_nonstandard_level（combat_mode≠standard）；P1 恒 DEAD（无非标准关），待 D3/LW-3。
    ui_key: UI_KEYS.RULES_CARD,
    trigger: { verb: 'move', condition: 'entering_nonstandard_level', timing: 'before' },
    nar_line: '这一段，规矩不一样。——已张贴在门口。',
    note: '时序法则：非标准关入关前（P1 DEAD·待落地）',
  },
  [UI_KEYS.STANCE]: {
    // 🔧 06 §2/D5：fight_start + combat_mode==='stance_duel'；P1 DEAD（stance_duel 遭遇待 LW-2 携 combat_mode）。
    ui_key: UI_KEYS.STANCE,
    trigger: { verb: 'fight_start', condition: 'stance_duel', timing: 'before' },
    nar_line: '这东西打起来讲究路数。——已开放：应招。',
    note: '首个 stance_duel 精英关（1b 三态出招归此·P1 DEAD·待 LW-2）',
  },
  [UI_KEYS.CRAFT]: {
    // 🔧 06 §2/D4：search + craft_material_gained（inventory_gained 子判据·读 item kind）。
    ui_key: UI_KEYS.CRAFT,
    trigger: { verb: 'search', condition: 'craft_material_gained', timing: 'after' },
    nar_line: '这两样，拼得到一起。——已开放：动手做。',
    note: '首次拾得配方材料（待 ⚙️ 投放 + kind 判据）',
  },
}

// 固定静态文本（非 ui_key 解锁物）。死亡登记行 = 📖 N3 §4 治理（登记式·不哀悼不鼓励）——走数据、组件零硬编码。
export const KALEIDO_STATIC_LINES = {
  deathRegistered: '信号中断。单位登记为：失联。',
}

// 披露栈序（初始 → 逐步）。渐次动效按此顺序错峰；亦供 dev 预览遍历。
export const REVEAL_ORDER = [
  UI_KEYS.SEARCH, UI_KEYS.LOG, UI_KEYS.INVENTORY, UI_KEYS.HP, UI_KEYS.COMBAT,
  UI_KEYS.MOVE, UI_KEYS.LEVEL_HEADER, UI_KEYS.TURN_COUNTER, UI_KEYS.RULES_CARD,
  UI_KEYS.STANCE, UI_KEYS.CRAFT,
]

// ── 读取缝：🔧 真数据源（账号级持久化解锁集，随 player 下发）──────────────────
//   🔧 06 契约 §1.1/D1 定稿：解锁集 = room.gamevars.players[uid].uiUnlocks（账号镜像，与 hp/inventory 同处）。
//   客户端在已读 me 的同一处读 me.uiUnlocks（单调只增·排序去重·种子 ['search_btn']）。
//   🔧 服务端 route 边界落地后此集自然接管；届时停用 deriveStubUnlocks 即切纯真数据。
export function readServerUnlocks(me) {
  const raw = me?.uiUnlocks
  return Array.isArray(raw) ? raw.filter((k) => typeof k === 'string') : []
}

// ── 前端 stub 派生：从可观测的对局状态推出「应已解锁」的 ui_key 集 ─────────────
//   仅在 🔧 解锁集未下发时兜底驱动渐进披露（首个 run 可演示）。规则镜像 05 §1.3 触发时机；
//   sticky（只增不减）由钩子负责。ctx 由钩子从 gamevars/me 计算，全为布尔。
//   ⚠ STUB：🔧 账号级解锁事件上线后本函数应停用（服务端解锁集权威）。
export function deriveStubUnlocks(ctx = {}) {
  const keys = new Set([UI_KEYS.SEARCH]) // 初始唯一
  if (ctx.searched) {
    keys.add(UI_KEYS.LOG)
    // 🔧 06 §1.3/D3：hp_bar 挂首次 search（非 fight_start）——先于污染/Ω/收缩/战斗一切伤害·死亡向量。
    //   与 combat_panel 解耦：hp_bar 首搜即显，早于首次遭遇。
    keys.add(UI_KEYS.HP)
  }
  if (ctx.hasItems) keys.add(UI_KEYS.INVENTORY)
  if (ctx.encounter || ctx.everFought) keys.add(UI_KEYS.COMBAT)
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
