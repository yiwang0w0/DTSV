// ─────────────────────────────────────────────────────────────────
// 远星函馆 × DTSV 常量定义
// 17 号异常段 7 区域 + 4 类实体 + 5 物品分类 + 4 结局
// ─────────────────────────────────────────────────────────────────

export const MAP_LIST = [
  { id: 0,  name: '外环维护廊' },
  { id: 1,  name: '锚点走廊' },
  { id: 2,  name: '伊甸港残墟' },
  { id: 3,  name: '剪切界面缓冲带' },
  { id: 4,  name: 'Ω-段核心接口' },
  { id: 10, name: '废弃投放口' },
  { id: 11, name: '旧伊甸港-3通道' },
]

export const GAME_TYPES = {
  0:  '个人战',
  2:  'PVE',
  11: '2v2',
  12: '3v3',
  13: '4v4',
  14: '自由团战',
}

// ── 物品分类（远星函馆 5 kinds） ──────────────────────────
export const ITEM_KIND_META = {
  tech_fragment: { label: '结构碎片', color: '#bc8cff', icon: '🔮' },
  platform_part: { label: '环段部件', color: '#58a6ff', icon: '🔧' },
  omega_matter:  { label: 'Ω物质',    color: '#f0883e', icon: '⚛️' },
  equipment:     { label: '装备',     color: '#3fb950', icon: '🛡️' },
  consumable:    { label: '消耗品',   color: '#d29922', icon: '💊' },
}

// ── NPC 等级（保留，用于兼容） ────────────────────────────
export const NPC_LEVEL_META = {
  easy:   { label: '普通', color: '#3fb950' },
  medium: { label: '中等', color: '#d29922' },
  hard:   { label: '困难', color: '#f85149' },
  boss:   { label: 'BOSS', color: '#bc8cff' },
}

// ── 实体类型（4 类，远星函馆） ────────────────────────────
export const ENTITY_TYPE_META = {
  remnant:     { label: '残响实体',   color: '#f85149', icon: '👻' },
  infiltrator: { label: '伪装入侵者', color: '#d29922', icon: '🎭' },
  symbiote:    { label: '共生实体',   color: '#3fb950', icon: '🌿' },
  observer:    { label: '观察实体',   color: '#58a6ff', icon: '👁️' },
}

// ── 装备槽（4 槽，远星函馆） ──────────────────────────────
export const LOADOUT_SLOT_META = {
  probe:  { label: '探测设备', color: '#58a6ff', icon: '🔍',
            desc: '搜索成功率+15%，搜索失败污染惩罚-50%' },
  shield: { label: '防护装置', color: '#3fb950', icon: '🛡️',
            desc: '个人污染累积速度×0.7，Ω-段窗口+1回合' },
  weapon: { label: '武器模块', color: '#f85149', icon: '⚔️',
            desc: '对抗实体伤害+25%，环境污染增速+1/回合' },
  comm:   { label: '通信组件', color: '#d29922', icon: '📡',
            desc: '扫描敌方装备与 HP，战斗中显示对方实时状态' },
}

export const LOADOUT_SLOTS = ['probe', 'shield', 'weapon', 'comm']
export const LOADOUT_EQUIPMENT_CAP = 4
export const LOADOUT_CONSUMABLE_CAP = 4

// ── 污染系统配置（spec §12.3） ────────────────────────────
export const POLLUTION_CONFIG = {
  // Phase 19.8: 节奏校准 — 30 分钟一轮 ≈ 100-150 action turns，每 turn 0.5-1 污染
  BASE_GROWTH:        1,    // 每回合环境污染基础增长（Phase 19 前为 5，已调整为 30 分钟节奏）
  SEARCH_PERSONAL:    2,    // 搜索个人污染增加
  COMBAT_PERSONAL:    4,    // 战斗个人污染增加
  INTERACT_PERSONAL: -3,    // 与非敌对实体交互个人污染减少
  PVP_PERSONAL:       5,    // PvP 个人污染增加
  RETREAT_DECAY:     -2,    // 低污染区(≤20%)自然衰减/回合
  EMERGENCY_COST:    15,    // 缝隙维护轨道代价
  MELTDOWN_COST:     10,    // 穿越熔断区域代价
  REPAIR_MIN:         5,    // 环段部件修复最小值
  REPAIR_MAX:        15,    // 环段部件修复最大值
  EMERGENCY_UNLOCK:  75,    // 缝隙维护轨道解锁阈值（Phase 19 从 60→75，配合慢节奏）
  OMEGA_WINDOW:       3,    // Ω-段行动回合数
  // 有效污染权重 (spec §3.3)
  WEIGHT_ENV:         0.6,
  WEIGHT_PERSONAL:    0.4,
  // 污染等级阈值 (spec §3.3)
  TIER_MILD:          40,
  TIER_MODERATE:      60,
  TIER_SEVERE:        80,
  TIER_MELTDOWN:      100,
  // 污染对搜索/战斗的修正
  SEARCH_PENALTY_MILD:     -0.10,
  SEARCH_PENALTY_MODERATE: -0.20,
  SEARCH_PENALTY_SEVERE:   -0.30,
  COMBAT_DAMAGE_REDUCTION_SEVERE: -0.15,
  COMBAT_NPC_SPAWN_MULT_SEVERE:    1.5,
}

// ── 污染等级（用于 UI / 文案） ────────────────────────────
export const POLLUTION_TIER_META = {
  none:     { label: '清洁',   color: '#3fb950', icon: '✓' },
  mild:     { label: '轻度',   color: '#d29922', icon: '⚠' },
  moderate: { label: '中度',   color: '#f0883e', icon: '⚠⚠' },
  severe:   { label: '重度',   color: '#f85149', icon: '⚠⚠⚠' },
  meltdown: { label: '熔断',   color: '#bc8cff', icon: '☢' },
}

// ── 4 结局 key（spec §12.4） ──────────────────────────────
export const ENDING_KEYS = {
  COLLAPSE: 'collapse',  // 崩解
  PURGE:    'purge',     // 清算
  MERGE:    'merge',     // 合流
  EXPLORE:  'explore',   // 探索
}

// ── Streak-breaker 连败兜底（research 2026-05-28-D P0） ──────────────
// 玩家连续撤离失败局数 ≥ THRESHOLD 时，下一局自动施加"只降难度、不加经济收益"
// 的兜底 buff。设计红线：严禁任何点数 / 掉落 / stash 净收益，防"故意送死刷 buff"套利。
// 本块为阈值 + buff 配置 single source of truth；由 src/lib/server/raids.js 消费，
// Phase 24b raid 入场流程接入（预埋不启用）。
export const STREAK_BREAKER = {
  THRESHOLD: 3,                  // 连续撤离失败局数达此值触发
  NPC_DENSITY_MULTIPLIER: 0.8,  // 下一局 chamber maxNpcs ×0.8（-20% 密度）
  FREE_INSURANCE_TIER: 'basic', // 免费授予的保险档（对应 equipment_insurance_tier，仅返还消耗装备、非净新经济）
  // PI 引导者关怀对白池（触发时随机取一条；纯叙事安抚，不承诺任何机制收益）
  GUIDE_DIALOGUE: [
    '引导者，连续的失联不是你的终点。这一程，缝隙会替你多扛一些。',
    '主控路径记得每一次坠落。下潜前，我已为你校准了更柔和的回廊。',
    '别急着证明什么。这一局，让护壳替你呼吸一会儿——风险我替你压低了。',
  ],
}

// ── 撤离信号锁定窗口（research 2026-05-29-A P0） ─────────────────────
// 把撤离从"即时安全按钮"改成"N 回合承诺"：点撤离 → 发出撤离信号进入脆弱态，
// 必须再坚持 WINDOW_TURNS 个回合才真正完成结构退避。锁定期内只放大异步压力：
//   - 环境/个人污染加速 tick（pollution.js: tickEnvPollution + applySignalLockPollution）
//   - 该玩家遭遇异步探针的概率提升（signalLockProbeEncounterMult，Phase 21 tryEncounterProbe 读取）
// 设计红线（notes-2026-05-29-A 发现 7）：保留异步优势 —— 张力来自环境压力，
//   绝不召唤同屏真人对手（no synchronous camper）。
// 本块为 single source of truth；由 src/lib/server/signalLock.js + pollution.js 消费。
// 预埋不启用（ENABLED=false），等 Phase 21/24b 接 extractPlayer 控制流 + 回合 tick 循环 + 倒计时 UI 后翻 true。
export const SIGNAL_LOCK = {
  ENABLED: false,            // 预埋开关：true 后 extractPlayer 首次点撤离改为发信号
  WINDOW_TURNS: 2,           // 信号锁定持续回合数（脆弱态时长）
  ENV_ACCEL_BONUS: 3,        // 锁定期每回合额外环境污染（叠加在 tickEnvPollution 之上，每个锁定玩家计一份）
  PERSONAL_ACCEL: 4,         // 锁定期发出信号玩家每回合额外个人污染
  PROBE_ENCOUNTER_MULT: 1.5, // 锁定期该玩家遭遇异步探针的概率倍率
}
