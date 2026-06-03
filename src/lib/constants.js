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
  20: '虚拟空间·时间跳跃',   // Phase 30 — 时间跳跃BR（build-alongside，见 docs/timejump-br-design.md）
}

// Phase 30 — 虚拟空间·时间跳跃BR 模式标识（与现有 chamber-raid 并存，证明可玩后再切默认）
export const BR_GAME_TYPE = 20

// ── BR 大时钟默认配置（Phase 31 re-home 进 /game 路径 · single source of truth） ──
// 把 chamber-raid 的 Ω-段独立倒计时替换成「100 房网格 + 大时钟缩圈」时间压力。
// PHASE_SECONDS / MAX_PHASE 与 br/clock.js 默认 + phase-30 schema 对齐（900s / 4 阶段）。
// dev 短值走查：建 BR 房或首玩家 join 时可把 {phaseSeconds, maxPhase} 塞进 gamevars.br，
//   经 br/clock.js clampPhaseSeconds 钳到下限 5s（如 30s/phase 快速验证缩圈），不得低于 5s。
// WARN_* 给客户端「距下次收缩」预警黄窗用（服务端不依赖，仅 UI 着色复用 /br 页 warnWindowSeconds）。
export const BR_CONFIG = {
  PHASE_SECONDS: 900,   // 每阶段秒数（默认 15min；dev 可走短值，下限 5s）
  MAX_PHASE: 4,         // 末路阶段编号（缩圈到最内 20 房）
  WARN_RATIO: 0.25,     // 预警黄窗 = 阶段时长 × 此比例
  WARN_MAX: 180,        // 预警黄窗上限（秒）
  WARN_MIN: 5,          // 预警黄窗下限（秒）
}

// ── BR 时序跃迁配置（跳跃 / 深度 · single source of truth） ────────
// 设计宪法 docs/timejump-br-design.md §4「赌命三角」的后端旋钮集中处（前后端 import 同一份）。
//
// 跃迁 = 单向阶梯：消耗一枚跃迁道具（item_pool.jump_charge>0），player.depth += 1（封顶 MAX_DEPTH），
//   随后玩家有效阶段 effectivePhase(realPhase, depth, maxPhase) 抬高 ⇒ 读更深的禁区图 / 物资档。
//   赌命即死：跃迁后所在扇区在「新有效阶段」若为禁区，本动作内 sweepContractionDeaths 立即致死
//   （复用与缩圈 / PvP 完全相同的死亡后果路径，不另造死亡逻辑）。
//
// 三个旋钮支撑「赌命三角」：
//   COOLDOWN_SEC —— 冷却（节奏门槛，避免连跳秒到末路阶段）；wall-clock 懒判，不落库 tick。
//   ITEM         —— 道具门槛（消耗一枚 jump_charge>0 道具；NAME 主供客户端展示/兜底，CHARGE 预留「一器多跳」）。
//   LOOT_BY_DEPTH—— 深度物资代差（gear gap·对冲跳跃风险）：跳得越深，搜索产出的「档位增量」越多 ⇒ 多产几件。
//
// 调参红线（设计宪法 §4 旋钮4 / economy-canon §6.1）：
//   - LOOT_BY_DEPTH 仅在 br.enabled && seed && depth>0 时生效；depth0（书写者）产出与现状**完全一致**（零经济膨胀基线）。
//   - 件数硬封顶 EXTRA_ROLL_CAP=2、稀有概率封顶 RARE_CAP=0.18 ⇒ 回报「可感知不爆」，对冲即死/世界变窄/成猎物代价，
//     不破坏 24b 点数经济（撤离折点数路径不变）。最终数值以 playtest 为准。
//   - MAX_DEPTH 默认 4（= 默认 maxPhase；depth 抬高 effPhase 至多到 maxPhase，超出无增益 ⇒ 硬封顶拒绝跃迁）。
export const JUMP_CONFIG = {
  COOLDOWN_SEC: 60,            // 两次跃迁的最小间隔秒数（提议·可调；wall-clock 懒判，不新增服务端定时器）
  MAX_DEPTH: 4,               // 深度上限（与默认 maxPhase 对齐；depth>maxPhase 对 effectivePhase 无增益）
  ITEM: {
    NAME: '时序跃迁器',         // 与 item_pool 行 name 一致（主供客户端展示/兜底；服务端按 jump_charge>0 动态判定，不硬比 NAME）
    CHARGE: 1,                // 一枚道具的 jump_charge（预留未来「一器多跳」，本期恒 1）
  },
  // 深度物资代差旋钮（resolveSearchAction loose-item 分支读取；公式见 gameActions.js）：
  LOOT_BY_DEPTH: {
    EXTRA_ROLL_CAP: 2,        // 「跳跃档位增量」每 +1 档多产 1 件，封顶 2（书写者 depth0 → 0 额外件，零变更）
    RARE_STEP: 0.06,         // 每 +1 档对高价值条目（weapon/armor/equipment）权重提升的步长
    RARE_CAP: 0.18,          // 稀有度概率提升封顶（本期可标 deferred，只做额外件数）
  },
}

// ── 体力系统配置（BR 行动经济 · single source of truth） ──────────
// 把「瞬移刷图 / 无脑连搜连打」逼成「有节奏地行动 + 靠搜刮回血」：体力由三个主动作消耗，
// 自然回复仅作兜底，主回复源是可搜刮的体力回复道具。数值集中此处，stamina.js 不重复定义
// 任何数字（前后端 import 同一份），调参只改这一处。
//
// 体力消耗源（三动作，正交于 pollution 各动作扣污染模型，互不影响）：
//   - move：实际消耗 = ceil(MOVE_COST × 移动惩罚倍率)（唯一走惩罚倍率 + 唯一刷 lastMoveAt 的动作）。
//   - search：平消耗 SEARCH_COST（固定单价，无惩罚倍率，不刷 lastMoveAt）。
//   - attack：平消耗 ATTACK_COST（**只主动攻击耗体力**；被动反击 / 被攻击不耗）。
//   其余动作（撤离 / 交互 / 放过 / 拾取 / 用道具 / PvE 反击）不动体力。
//
// 派生公式（实现见 src/lib/stamina.js，全部纯函数、now 可注入）：
//   懒回复：effectiveStamina = clamp(stamina + REGEN_PER_SEC × max(0, now−staminaAt)/1000, 0, MAX_STAMINA)
//   移动惩罚倍率：以 PENALTY_ANCHORS 对「总消耗倍率」分段线性插值（自变量 dt = (now−lastMoveAt)/1000 秒）
//   move 实际消耗 = ceil(MOVE_COST × movePenaltyMultiplier(dt))
//   平消耗（search/attack）= 固定 cost，懒回复到 now → 判够 → 扣除（只刷 staminaAt，绝不刷 lastMoveAt，
//     否则污染下一次 move 的 dt 锚点，把「搜完就走」误判成快速移动）。
//
// 调参红线 / 设计张力（务必理解再改 · 数值标「可调」者最终以 playtest 为准）：
//   - 自然回复刻意压低（REGEN_PER_SEC=0.5）：回满 1 次 move(10)≈站 20s、search(5)≈10s、attack(8)≈16s。
//     站桩 900s 仅被动回 450，看似可观，但活跃搜刮/移动的边际消耗远超被动 → 经济实际倾向道具。
//   - 目标配比 ≈ 90% 体力靠搜刮回复道具（RECOVERY_ITEM）、~10% 靠自然回复兜底。
//     该配比仅在动作 cadence 高时成立；若 playtest 发现站桩 trivialize，可进一步降 REGEN（如 0.3）
//     或加「移动后 N 秒不回复」冷却（本期不做，预留）。
//   - 快速移动 dt<30s ⇒ 倍率 1×→6× 攀升，叠加「只回了一点体力」⇒ 强反刷瞬移。
//
// PENALTY_ANCHORS：[dtSec, 总消耗倍率] 锚点，必须按 dtSec 升序；锚点间线性插值，dt≥最后锚点 dtSec ⇒ 取末锚倍率（恒 1×）。
//   node 实算已校验 4 锚点精确命中(0s→6×/5s→5×/15s→3×/30s→1×)，中间值合理(2.5s→5.5×, 10s→4×, 22.5s→2×)。
export const STAMINA_CONFIG = {
  MAX_STAMINA:   100,   // 体力上限
  MOVE_COST:     10,    // 基础移动消耗（move 实际消耗 = MOVE_COST × 移动惩罚倍率，向上取整）
  SEARCH_COST:   5,     // 搜索平消耗（固定单价，无惩罚倍率；不足拦截，零副作用）
  ATTACK_COST:   8,     // 攻击平消耗（可调；仅主动攻击扣，被动反击/被攻击不扣）
  REGEN_PER_SEC: 0.5,   // 实时（wall-clock）每秒回复体力；懒回复，不落库 tick、不新增服务端定时器。
                        //   刻意压低（旧值 4），让回复道具成为主回复源（90/10 目标，可调）。
  // 移动惩罚倍率锚点（总消耗倍率，非「额外加成」）：(0s,6×) → (5s,5×) → (15s,3×) → (30s+,1×)
  PENALTY_ANCHORS: [
    [0,  6],
    [5,  5],
    [15, 3],
    [30, 1],
  ],
  // 体力回复道具「机能恢复剂」配置（主回复源 · 可搜刮）：
  //   - 一份 = BUNDLE_COUNT 个同名条目（搜索抽中时一次性 push 这么多进 inventory，库存无 per-instance charges 概念）。
  //   - useItem 每次消费 1 个，restoreStamina(+RESTORE) clamp 到 MAX_STAMINA。
  //   - DB 侧由 item_pool.stamina_restore 列承载实际回复量（见 scripts/phase-25r-stamina-economy.sql）。
  //   - ⚠️ Phase 34: BUNDLE 分发已广义化 → 运行时权威迁至 item_pool.bundle_count 列（搜索产出按行读 bundle_count，
  //     不再硬比此处 NAME）。此处 RESTORE/NAME/BUNDLE_COUNT 降为 client 提示 / 文档 single-source（值保留，勿删：别处仍 import）。
  RECOVERY_ITEM: {
    NAME:         '机能恢复剂',  // 与 item_pool 行 name 严格一致（客户端提示 / 文档锚点）
    RESTORE:      50,           // 每次使用恢复体力（与 item_pool.stamina_restore 对齐）
    BUNDLE_COUNT: 6,            // 一份产出的同名条目数（= 可用次数）；运行时分发已迁 item_pool.bundle_count
  },
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

// ── Streak-breaker 连败兜底（research 2026-05-28-D P0 → 2026-05-29-B P1 升级） ──
// 玩家连续撤离失败局数 ≥ THRESHOLD 时，下一局自动施加"只降难度、不加经济收益"
// 的兜底 buff。设计红线：严禁任何点数 / 掉落 / stash 净收益，防"故意送死刷 buff"套利。
//
// 05-29-B 升级：从"一次性二元触发（固定 -20%）"改为 Hades God Mode 式渐进自平衡：
//   - 减负等级 = clamp(失败局数 - THRESHOLD + 1, 0, MAX_RELIEF_LEVEL)，触发后每多连败一局 +1 级
//   - NPC 密度按等级线性递减 REDUCTION_PER_LEVEL（-10%/级），封顶 MAX_RELIEF_LEVEL 级（-40%）
//   - 成功撤离即衰减归零：消费方在玩家撤离成功后把连败计数清 0 → 下一局等级回 0、密度回满，
//     永不永久 trivialize（呼应 God Mode "够强就被请回更高难度"）。
//   - opt-in 可见：computeStreakBreaker 返回 reliefLevel + reliefLabel（"引导减负 LvN"），
//     出勤前由 PrepareModal 显式展示而非静默施加（呼应 God Mode "不锁内容 + 不剥夺成就感"）。
// 本块为阈值 + buff 配置 single source of truth；由 src/lib/server/raids.js 消费，
// Phase 24b raid 入场流程接入（预埋不启用）。
export const STREAK_BREAKER = {
  THRESHOLD: 3,                     // 连续撤离失败局数达此值触发减负 Lv1
  REDUCTION_PER_LEVEL: 0.1,         // 每级 NPC 密度递减比例（-10%/级，线性）
  MAX_RELIEF_LEVEL: 4,             // 减负等级上限（4 级 → 密度封顶 -40%，永不更低）
  LABEL_PREFIX: '引导减负',         // opt-in 可见标签前缀，渲染为"引导减负 LvN"
  FREE_INSURANCE_TIER: 'basic',     // 免费授予的保险档（对应 equipment_insurance_tier，仅返还消耗装备、非净新经济）
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

// ── 新手保护期（research 2026-05-12 主题 A） ─────────────────────────
// 前 FIRST_RAIDS 局 raid 撤离失败（阵亡 / Ω-段未撤离）返还 REFUND_RATE 比例的入场购买点数，
// 降低新玩家 gear fear、平滑前期挫败。判定依据 profiles.first_raids_count（phase-25l 预埋）。
// 只返还"可购买"点数类型（high_equip_pt / low_equip_pt / item_pt）；class_pt 是 raid 里程碑
// 奖励、非入场购买物，不在返还范畴。
// 设计红线（economy-canon §3）：返还上限 = 玩家本局入场实际花费 × REFUND_RATE，
//   绝不超过实际花费 → 补偿摩擦而非净新经济注水。可与 28-D Streak-breaker 叠加（降难度，互不冲突）。
// 本块为 single source of truth；由 src/lib/server/newbieProtection.js 消费。
// 预埋不启用（ENABLED=false），等 Phase 24b 接入入场计数自增 + 失败返还分支 + PrepareModal 新手 raid 标识后翻 true。
export const NEWBIE_PROTECTION = {
  ENABLED: false,                                                  // 预埋开关
  FIRST_RAIDS: 3,                                                  // 前 N 局算新手保护期
  REFUND_RATE: 0.5,                                                // 撤离失败返还入场购买点数的比例
  REFUNDABLE_POINT_TYPES: ['high_equip_pt', 'low_equip_pt', 'item_pt'], // class_pt 不返还
}

// ── 入场装配预设 / Loadout presets（research 2026-05-12 主题 A） ───────
// 玩家可保存最多 MAX_SLOTS 套常用装配（职业 + 装备 + 道具 + 兑换），下次入场一键复用，
// 降低 PrepareModal 重复选择摩擦。纯装配复用：保存预设不预扣任何点数，应用预设仍走正常
// onConfirm 扣点流程，商店改版后失效 id 由 applyPresetToCart 静默过滤（不报错）。
// 持久载体 = profiles.saved_loadouts JSONB（phase-25m 预埋，CHECK 限 <= MAX_SLOTS 槽）。
// 本块为 single source of truth；由 src/lib/server/loadoutPresets.js 消费。
// 预埋不启用（ENABLED=false），等 Phase 24b 接入 PrepareModal 预设下拉 + 保存入口后翻 true。
export const LOADOUT_PRESETS = {
  ENABLED: false,       // 预埋开关：true 后 PrepareModal 顶部显示「📋 预设」下拉 + 保存按钮
  MAX_SLOTS: 5,         // 单玩家可保存的预设槽位上限（与 phase-25m CHECK 约束一致）
  NAME_MAX_LEN: 24,     // 预设名最大字符数（sanitize 时截断）
}

// ── 本局目标 / Run goals（research 2026-05-29-A P1） ──────────────────
// 操作化体裁"个人化胜利"：出勤前可自选一个本局目标，结算结局横幅显示达成度 + 本局评级。
// 把"赢"从单一"成功撤离"扩展成玩家自定义的多元成就锚点（解码残片 / 凑够点数 /
// 击杀首领 / 部署探针），缓解体裁"有限目标达成即流失"，给每局一个个人化叙事收束。
// 设计红线（economy-canon §3 / narrative-vision §6.1）：目标只驱动"评级展示"叙事兑现，
//   严禁附带任何点数 / 掉落 / power 净收益 —— 评级是叙事兑现，不是经济水龙头。
// 本块为 single source of truth；由 src/lib/server/runGoals.js 消费。
// 预埋不启用（ENABLED=false），等 Phase 24b 接 join 存 per-player gamevars.runGoal +
//   extract/结局评估写 meBase.runGoalResult + 结局横幅评级渲染后翻 true。
export const RUN_GOALS = {
  ENABLED: false,          // 预埋开关：true 后 PrepareModal 顶部显示「🎯 本局目标」选择条
  DEFAULT_TYPE: 'none',    // 默认不设目标（成功撤离即胜利）
  // 可选目标类型：metric = 评估时读取的 outcome 字段名（none 无度量）；target = 达成阈值
  TYPES: [
    { type: 'none',            label: '自由探索', icon: '🧭', desc: '不设目标，成功撤离即胜利',   metric: null,               target: 0 },
    { type: 'decode_fragment', label: '解码残片', icon: '📡', desc: '本局解码任意一枚新残片',     metric: 'fragmentsDecoded', target: 1 },
    { type: 'collect_points',  label: '凑够点数', icon: '💠', desc: '本局累计赚取目标数量的点数', metric: 'pointsEarned',     target: 50, targetEditable: true },
    { type: 'kill_boss',       label: '击杀首领', icon: '⚔',  desc: '本局击杀任意 boss 级 NPC',   metric: 'bossKilled',       target: 1 },
    { type: 'leave_probe',     label: '部署探针', icon: '🛰', desc: '撤离时留下一枚异步探针',     metric: 'probeLeft',        target: 1 },
  ],
  POINTS_TARGET_MIN: 10,   // collect_points 可调目标下限
  POINTS_TARGET_MAX: 500,  // collect_points 可调目标上限
  POINTS_TARGET_STEP: 10,  // collect_points 步进
}

// ── 高危出勤 / High-risk deployment（research 2026-05-29-B P1） ────────
// 自愿"上行难度阀门"（Hades Heat / Risk of Rain / Deep Rock Hazard / Roguelike Ascension 等价），
// 与 Streak-breaker（下行减负）构成双向自适应难度：给数值饱和的老玩家一个"再挑战换奖励"出口，
// 缓解 grind-until-trivial 倦怠。出勤前自选 heatLevel（0 = 标准出勤）：等级越高，
//   - envAccelBonus：整局环境污染额外加速（pollution.js tickEnvPollution 读 gv.heatLevel）
//   - npcDensityMult：chamber NPC 密度上调（pathGenerator.js generateRaidPath 上调 maxNpcs）
//   - omegaWindowDelta：Ω-段窗口收紧（撤离窗口更短，pathGenerator 上调）
// 作为交换提升结算奖励：
//   - fragmentDropMult：撤离链残片发现概率倍率（gameActions.js extractPlayer 读）
//   - pointsMult：可购买点数（high/low/item）结算倍率（gameActions.js extractPlayer 读）
//
// 设计红线（economy-canon §6.1 12% 周库存增长红线）：奖励倍率是"承担更高死亡风险"的对价，
//   不是免费 faucet —— Phase 24b 必须把 pointsMult 调到"扣除高危死亡损失后的 EV"仍落在通胀预算内，
//   并纳入 healthcheck v_weekly_stash_inflation 监测；`class_pt`（保底里程碑·非经济）永不被倍率放大，
//   防加速 legendary 软保底跳关。LEVELS 数组下标 === level，便于 O(1) 查表。
// 本块为 single source of truth；由 src/lib/server/heat.js + pollution.js + pathGenerator.js 消费。
// 预埋不启用（ENABLED=false），等 Phase 24b 接 PrepareModal heat 选择 → join 存 gamevars.heatLevel +
//   pathGenerator/pollution 读 heat + extract 奖励倍率 + 可选倒计时 / 高危横幅 UI 后翻 true。
export const HIGH_RISK = {
  ENABLED: false,        // 预埋开关：true 后 PrepareModal 顶部显示「🔥 高危出勤」选择条
  DEFAULT_LEVEL: 0,      // 默认标准出勤（无加压）
  // 下标即等级：0 标准 / 1-3 渐进上行。density/window 是难度旋钮，frag/points 是奖励对价。
  LEVELS: [
    { level: 0, label: '标准出勤', icon: '○', desc: '常规难度，无额外压力与奖励',           envAccelBonus: 0, npcDensityMult: 1.0, omegaWindowDelta: 0,  fragmentDropMult: 1.0, pointsMult: 1.0 },
    { level: 1, label: '高危·壹', icon: '🔥', desc: '污染微升 · NPC +15% · 残片/点数 +15%',  envAccelBonus: 1, npcDensityMult: 1.15, omegaWindowDelta: 0,  fragmentDropMult: 1.1, pointsMult: 1.15 },
    { level: 2, label: '高危·贰', icon: '🔥🔥', desc: '污染加速 · NPC +30% · Ω 窗口 -1 · 残片/点数 +25~35%', envAccelBonus: 2, npcDensityMult: 1.3, omegaWindowDelta: -1, fragmentDropMult: 1.25, pointsMult: 1.35 },
    { level: 3, label: '高危·叁', icon: '🔥🔥🔥', desc: '污染剧增 · NPC +50% · Ω 窗口 -1 · 残片/点数 +50~60%', envAccelBonus: 3, npcDensityMult: 1.5, omegaWindowDelta: -1, fragmentDropMult: 1.5, pointsMult: 1.6 },
  ],
}

// ── 首次接触自我筛选框架 / First-contact self-selection framing（research 2026-05-29-C P1） ──
// Pathologic 2 范式：玩家第一局出勤前插入一段轻量 PI 引导者元叙事框架，把"你不会立刻看懂"
// 从"游戏没做完 / 缺陷"诚实重构为"设计意图"。明确告知玩家：残片只描述、不解释，
// 拼齐它们、还原这段历史是玩家自己的工作 —— 给劝退峰玩家一个诚实的自我筛选信号
// （"这不是给所有人的游戏"），同时把困惑转译成留存峰玩家的使命感（呼应 narrative-vision §6.4
// "叙事可晦涩、机制必清晰"：框架本身是清晰机制频道里对叙事晦涩的预告，不让困惑外溢成劝退）。
//
// 仅在玩家"第一局"触发（first_raids_count === 0 / 等价累计出勤计数 === 0），纯叙事，
// 严禁任何点数 / 掉落 / power / 难度收益（与 economy-canon §3 一致）。
// 复用 src/lib/server/raids.js preRaidSetup（与 28-D Streak-breaker 关怀对白同一注入管道）判定。
// 本块为文案 single source of truth；由 raids.js firstContactFraming 消费 + PrepareModal 首局 UI 卡渲染。
// 预埋不启用（ENABLED=false），等 Phase 24b 接 join 读 first_raids_count / 出勤计数 + 首局卡 UI 后翻 true。
export const FIRST_CONTACT_FRAMING = {
  ENABLED: false,                          // 预埋开关：true 后 PrepareModal 首局顶部显示元叙事框架卡
  TITLE: '⟨ 首次接触 · 主控路径留言 ⟩',
  // PI 引导者元叙事框架（自我筛选范式：诚实预告"晦涩 = 设计意图"，把困惑前置成选择）
  LINES: [
    '引导者，欢迎来到伊甸港的缝隙。在你第一次下潜之前，我必须先把话说清楚。',
    '你不会立刻看懂这里。残片只描述，不解释——它们记录世界曾经的样子，却从不告诉你该怎么做。',
    '拼齐它们、还原这段被封存的历史，是你的工作，不是我的。我只在你坠落时陪你校准下一程。',
    '若"不被立刻告知答案"让你却步，这或许不是给你的旅程；若它让你着迷，那么——开始吧。',
  ],
  SIGNATURE: '——PI 引导者',
}

// ── 断链残片"开放循环" / Fragment cold cases（research 2026-05-29-C P1） ──
// Disco Elysium Thought Cabinet + Cultist Simulator "再玩就 click" 范式：
// 把"持有某残片却缺其前置锚点"的断链态从死胡同（"……（断链中）……"）改成被追踪的
// "悬案/推测"条目 —— 显示已知碎片 + 缺失锚点提示但不剧透，补齐前置锚点时回溯点亮 +
// 小奖励。困惑→悬念→延迟奖励，匹配"渐进揭示的健康形态是系统化、不是死胡同"。
//
// 断链态来源：discoverFragment 对缺前置的残片静默过滤（fragments.js），而 combo 解锁
// （evaluateFragmentCombos）会绕过 requires 把 C 残片直接给玩家 → "持有 F13 却缺 F12"。
//
// 回溯奖励（economy-canon §3 / §6.1 12% 周通胀红线）：
//   - REWARD_KIND='decode_accel'（默认）：给"刚补齐的锚点"一次解码加速（+N decode_level，
//     钳制 ≤3）。纯叙事进度·非经济 faucet，最安全。
//   - REWARD_KIND='item_pt'：发 ITEM_PT_AMOUNT 道具点（极小额）。选它则 Phase 24b 必须
//     纳入 v_weekly_stash_inflation 监测。
//   - class_pt 永不作为本奖励（不加速 legendary 软保底跳关）。
//   - reward_granted/reward_amount（DB）防重复发放注水。
//
// 本块为 single source of truth；由 src/lib/server/coldCases.js（detect/resolve/list）消费，
// /codex 悬案区渲染。全部受 ENABLED 门控（默认 false）+ exception-safe，绝不阻塞残片发现。
// 预埋不启用，等 Phase 24b 接 discoverFragment detect/resolve 钩子 + /codex 悬案卡 + 升级
// toast，并确认回溯奖励 EV 落在通胀预算内后翻 true。
export const COLD_CASES = {
  ENABLED: false,            // 预埋开关：true 后登记/回溯断链悬案 + /codex 显示悬案区
  REWARD_KIND: 'decode_accel', // 'decode_accel'（默认·纯叙事）| 'item_pt'（经济·需监测）
  DECODE_ACCEL_LEVELS: 1,    // decode_accel 时给补齐的锚点 +N decode_level（最终钳制 ≤3）
  ITEM_PT_AMOUNT: 3,         // item_pt 时发放的道具点（极小额，仅 REWARD_KIND='item_pt' 生效）
  MAX_OPEN_PER_USER: 50,     // 单玩家 open 悬案上限（detect 超限不再新登记，防 UI 膨胀）
}
