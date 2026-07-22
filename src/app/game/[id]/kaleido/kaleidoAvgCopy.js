// KALEIDO · AVG 呈现层文案 / 可交互词 / 隐蔽度数据层（P2）
//   目标：组件侧**零硬编码文案** —— 舞台血肉、可交互词、提示等级全部走数据。
//
//   权威顺序（勿倒置）：
//     解锁 nar_line = ① 服务端 unlockEvents（D2 信封·唯一权威）→ ② UI_UNLOCK_ENTRIES（本地兜底）。
//     本模块**不复制** nar_line，只用 narFor() 转发注册表，避免第三份副本漂移。
//   本模块只放两类：
//     ① 非 ui_key 的呈现血肉（冷开场觉醒行 / 搜索结果变体池 / 预览假敌）——它们不是解锁物，注册表里没有位置；
//     ② 可交互词的**结构化元数据**（before/word/after + uiKey + hint）——绝不靠字符串搜索定位可点词。
//
//   分工（docs/plan/kaleido/11-diegetic-ui-doctrine.md §5）：
//     📖 文案本身 + §2 去宣告化重写；🎨 隐蔽度字段与其呈现语言（提示等级数据化·不硬编码视觉）。

import { UI_KEYS, unlockEntry } from './kaleidoUiUnlocks'

// ── ① 呈现血肉（非解锁物）────────────────────────────────────────────────
// C4 冷开局觉醒行：首次点击前先有静态文字，不是裸按钮（防 10 秒跳出）。
export const AVG_AWAKEN_LINES = [
  '很久没有回音了。',
  '……现在，有一点。',
]

// 搜索结果变体池（验证点③「文字重复烦不烦」——刻意给多样变体）。
export const AVG_SEARCH_LOGS = [
  '你翻找了一下。锈迹、灰、更多的锈。',
  '手指探进一道缝。空的。',
  '有东西硌了一下手——只是块碎壳。',
  '这里被人翻过了。很久以前。',
  '风从看不见的地方漏进来。',
  '一排编号，褪得只剩三个字符。你记下了。',
]
export const AVG_FIND_LOG = '缝里卡着个东西。你把它抠了出来：锈蚀弹匣。'

// 预览兜底模式的假敌（真数据模式用 encounterInstance，不读这里）。
export const AVG_MOCK_ENEMY = { name: '游荡的壳', hp: 34, maxHp: 60, atk: 12, def: 4 }

// ── ② 可交互词 + 隐蔽度 ──────────────────────────────────────────────────
// 教义法则二：UI 由世界内动作获得 —— 可交互词**自然嵌在叙述里**，玩家没注意就是普通叙述，注意到才发现能点。
// hint = 隐蔽度 / 提示等级（教义 §2 推论 + §5「提示等级数据化，不硬编码视觉」）：
//   'underline' 明示（下划线 + 微光）· 'subtle' 只靠措辞与位置暗示（无描边）· 'none' 完全不提示。
//   改隐蔽度 = 改这个字段，不动组件。
export const UI_ACTIONS = {
  [UI_KEYS.HP]: {
    uiKey: UI_KEYS.HP,
    before: '你动起来了。试图确认一下自己的',
    word: '状态',
    after: '。',
    hint: 'underline',
    // ⚠⚠ 【临时 · 等 📖 去宣告化稿】（🧭 裁决 3）——本条是**唯一**用本地结构化文案覆盖服务端 nar 显示的特例。
    //   为什么临时：注册表里 hp_bar 的定稿 nar 是「你动起来了。往后有损耗，得盯着了。——已开放：状况读数。」，
    //     ①没有可点词，撑不起 GPT 编舞里「文字原位变按钮」这一拍；②「——已开放」正是教义 §2 明令禁止的宣告式。
    //   撤销条件（📖 正在做 15 条去宣告化重写，会带上 hp_bar）：📖 稿一到 —— 即注册表的 hp_bar nar 自身
    //     含可交互词 —— **立刻删掉本条 before/word/after，切回服务端权威**，只保留 uiKey + hint。
  },
}

export function uiAction(uiKey) {
  return UI_ACTIONS[uiKey] || null
}

// 交互行的纯文本形态（无障碍 / 未激活态兜底）。
export function actionText(a) {
  return a ? `${a.before}${a.word}${a.after}` : ''
}

// ── 转发注册表的 nar_line（组件不另存副本）──────────────────────────────
export function narFor(uiKey) {
  return unlockEntry(uiKey)?.nar_line || ''
}

// 预览兜底模式的去宣告化覆盖表。
//   背景：GPT 样板里这些行**已经**符合教义 §2（只描述世界与动作），而注册表对应行仍是「——已开放：XXX」宣告式。
//   在 📖 按教义 §2 全批重写注册表之前，预览路径用本表保住已验证过的手感；**重写落地后本表应清空**。
//   ⚠ 只作用于预览 sim；真数据模式一律以服务端 nar_line 为准，不经过这里。
export const AVG_PREVIEW_NAR_OVERRIDES = {
  [UI_KEYS.INVENTORY]: '你把它收了起来。',
}

export function previewNarFor(uiKey) {
  return AVG_PREVIEW_NAR_OVERRIDES[uiKey] || narFor(uiKey)
}
