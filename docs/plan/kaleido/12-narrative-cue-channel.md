# KALEIDO · 12 持续叙事线索通道（H1）—— 设计稿（待 📖/⚙️ 会签）

> 出处：教义 11 §2「叙事兜底」+ 🧭 派单「H1 是整个 Diegetic 教义的关键路径」。
> 状态：**设计稿，未实现**。🔧 出稿 → 🧭 拉 📖/⚙️ 会签 → 定稿后再排实现期。
> 基准：HEAD `bdfd334`，行号本轮实测。

## 0. 问题

教义要两件事，两件都是**每动作按当前状态求值的持续输出**：
1. **阈值线索**（体力/血量低 → 追加一行）= 替代仪表盘的**功能性信息通道**（没 UI 的玩家靠它活着）
2. **发现诱饵** = 持续暗示「你有个东西可以看」，防止「太隐蔽 ⇒ 永远发现不了 ⇒ 功能白做」

而现有三条 nar 通道**全是「状态转移一次性」的**，实测三条全堵：

| 通道 | 堵点 | 锚点 |
|---|---|---|
| `unlockEvents` | 消费端**无条件把收到的 key 当新解锁提交** ⇒ 会把玩家还没发现的件点亮 | `useKaleidoUiUnlocks.js:100-102` |
| `gamevars.log` | `normalizeLogEntry` 返回**三字段字面量**（非 spread）⇒ 任何元数据蒸发；读侧再裁一遍 | `roomState.js:34-44` / `:143-145` |
| `narLog` | `if (added.length === 0) return`，且 `added` 经 `REVEAL_ORDER` 白名单过滤 ⇒ **行数恒 ≤ 新解锁键数**，结构上产不出「无解锁的叙事行」 | `useKaleidoUiUnlocks.js:82-83` |

## 1. 推荐方案：同数组 + 必填 `kind` + **线索行不带顶层 `ui_key`**

线索与解锁走**同一个 `unlockEvents` 数组**（遵 🧭 教义 §7.2-4 已裁的「信封保名 + 必填 kind + 消费端按 kind 分流」），但**线索行把 ui_key 藏进 `action.uiKey`、顶层不带 `ui_key`**。

**为什么这样就够**：今天唯一能改渲染集的消费点是
```js
// useKaleidoUiUnlocks.js:100-105
for (const e of events) {
  if (!e || typeof e.ui_key !== 'string') continue   // ← 线索行在这里被跳过
  keys.add(e.ui_key)                                  // ← 无条件加集（危险的那行）
}
if (keys.size === 0) return                           // ← 纯线索批在这里早退
```
线索行无顶层 `ui_key` ⇒ `continue` 恒成立 ⇒ 渲染集/`prevRef`/`justUnlocked` 全不动。

> **⟹ 约束①（不能把没发现的件点亮）由「字段形状」保证，不由「消费端记得写 if」保证。** 即便日后有人删掉 kind 分流的 `if`，它仍成立。

**代价必须登记**：`ui_key`（顶层·snake·仅解锁行）与 `action.uiKey`（嵌套·camel·仅线索行）的**命名不对称就是安全机制本身**。有人手滑写成顶层 `ui_key`，fail-closed 立刻塌成 fail-open ⇒ §5 的两条断言**不是可选项**。

### 1.1 两个多人共享文件改动 = 0 行

- `route.js` **零改动**：`:38 let unlockEvents = []` 只在 `:39 if (isKaleidoRoom(room))` 内被赋值，`:48` 是 `unlockEvents.length ? {room, unlockEvents} : {room}` ⇒ 多人恒 `[]` ⇒ **响应 JSON 逐字符不变**。线索只是让这个数组在 kaleido 局里多几行。
- `roomState.js` **零改动**：`normalizeGamevars:137` 首行 `...gamevars` 全透传，且逐键归一列表**不含 `kaleido` 键**、`:139 players` 原样透传 ⇒ 新账本字段天然持久。

## 2. 信封形状

```jsonc
unlockEvents: [
  // ① 解锁行 —— 唯一带顶层 ui_key、唯一改渲染集
  { "kind":"unlock", "ui_key":"hp_bar", "nar_line":"…", "timing":"after", "precedes":["…"], "seq":1 },

  // ② 阈值线索 —— 无顶层 ui_key
  { "kind":"threshold_clue", "id":"<runId>:41:0", "cueSeq":41, "beat":23, "seq":2, "ordinal":0,
    "state":"hp", "tier":1, "obs":"normal"|"undiscovered"|"lost"|"suppressed",
    "beats":7.5,                    // 诊断用·**不上屏**（措辞四法「给感受不给数字」）
    "text":"…",                     // 服务端权威
    "action": null | { "uiKey":"hp_bar","before":"…","word":"状况","after":"。",
                       "hint":"underline"|"subtle"|"none","actionKind":"notice"|"operate" } },

  // ③ 发现诱饵 —— 无顶层 ui_key
  { "kind":"discovery_lure", "id":"<runId>:42:0", "cueSeq":42, "tier":2,
    "driver":"exposure"|"margin", "forced":true, "text":"…", "action":{…} }
]
```

- `action` 字段名**逐字段对齐 🎨 现成的 `UI_ACTIONS`**（`kaleidoAvgCopy.js:49-54` = `{uiKey, before, word, after, hint}`）⇒ 组件取值表达式一字不改，只换取值来源。
- `text` 与 `action` **不重复真源**：`action` 存在时服务端保证 `text === before+word+after`（同 `actionText()` `kaleidoAvgCopy.js:68-70`）⇒ 有/无 action 两条渲染路等价，无障碍兜底天然成立，组件永不字符串搜索。
- **`id` 第二段用 `cueSeq` 不用 `beat`**：`beat` 只在 `gameActions.js:2883` 递增，而那里被 `:2880 if (!KALEIDO_TURN_ACTIONS.has(action)) return` 挡着；线索却对**每个**动作求值（`releaseEncounter`/`emergencyRetreat` 经路由但不计拍）⇒ 用 beat 做 id 会在时钟停滞时**撞 id → 客户端去重静默吞掉一条真线索**。

## 3. 服务端新增（全部条件展开，多人局连字段都不出现）

```
gamevars.kaleido.survival = { drain, jitter, potionUnit, potionNames:[…],
                              tierBeats:[20,10,4], lureM:{…} }
```
- `startKaleidoRun` 播种，挂点与 `cycleGuarantee`（`gameActions.js:2818`）**并列同构**；源 = `game_rules`（理由同 `:2813-2814`：`loadGameRules` 是**进程级全局 memo 无 TTL**，run 中途改规则读不到 ⇒ 必须开局播种）。
- ⟹ 药瓶数 = `inventory.filter(n => potionNames.includes(n)).length` —— **零 DB 查**（`inventory` 是名字符串数组 `roomState.js:331`，无 heal 值）。
- 未配置 ⇒ 整个 `survival` 键不出现 ⇒ 求值返回空 ⇒ 存量 run 与多人局逐字节不变。

**求值挂点** = `applyKaleidoPostAction`（`gameActions.js:2987`），它已握有全部前后态（`beforeMe`/`afterMe`/`beforeClearedSeq`/`node`/`fightStart`/`already`）。
**合格动作口径零新定义**：复用 `TURN_ACTIONS`（`kaleido/events.js:28`）。⚠ 契约写死：`emergencyRetreat`/`releaseEncounter` 在 `ACTION_VERB` 但**不在** `TURN_ACTIONS` ⇒ 不计拍。

## 4. ⚠ 会签前必须解决的两个缺口（不是设计问题，是缺料）

### 4.1 🔴 `d`（每搜掉血）**全仓不存在，且从未派单**
`grep hpDrain|searchDrain|search_hp|kaleido_search` 在 `src/` 零命中；唯一命中是 ⚙️ 自己的模拟器 `scripts/kaleido-step1-survival-sim.mjs:58`（harness，不是引擎）。

⟹ **step1 的核心机制「每次搜索同步掉 HP」在引擎里没有实现**。这直接影响两件事：
- 「有效剩余拍数 = (hp + 药瓶×30) ÷ **每搜掉血**」的**分母缺一半** ⇒ H1 的求值输入不完整；
- 🔧 已交付的**周期保底是这个掉血的配重**（护住最坏运气）—— 配重先到了，被配重的东西还没到。

**⟹ 请 🧭 确认 `d` 归谁、何时派单。** 它是 H1 与 ⚙️ 曲线共同的前置。

### 4.2 `offeredAge`（未发现时长）依赖 offered 中间态
`evaluateUnlocks`（`uiUnlocks.js:151-161`）命中即直接进 `uiUnlocks`（= discovered），**没有 offered 中间态** ⇒ 诱饵的第二个输入在 `uiKnown`/`uiOffered` 拆分（P1 投影重构）落地前**恒为 0**。⟹ H1 的诱饵支**排在 P1 之后**，阈值线索支可先行。

## 5. 分期与验收

| 期 | 内容 | 独立可上线 |
|---|---|---|
| **P1** | 阈值线索（`action: null` 纯叙事行）+ `survival` 播种 + 纯模块 `cues.js` + 客户端第二消费者 `useKaleidoCues` | ✅（不依赖 offered，不依赖可点词） |
| **P2** | `action` 的**渲染**（三段式，复用 `UI_ACTIONS` 形状） | 依赖 📖 供词 |
| **P3** | `action` 的**可点**（`discoverUi` 轻动词回程 + 逐行可点门解耦） | 依赖教义 §3.4 与 P1 投影重构 |

**P1 一律下发 `action: null`**——这不是妥协，是依赖顺序：`discoverUi` 全仓零实现，而教义 `:150` 明令「渲染成可点却零反应 ≡ 点不动，**此条写进验收**」。

**两条必须进 gate 的断言**（守 §1 那个命名不对称）：
1. 运行时：`buildCueEventsPayload` 产出的每一行**不得含顶层 `ui_key`**；
2. 离线：若日后给 `normalizeLogEntry` 加条件展开，须断言 `Object.keys(normalizeLogEntry({text,type,time,foo:1}))` 深等于 `['text','type','time']`（有人改成 `...entry` 透传立刻变红）。

## 6. 🔧 已复核并**否决**的三条（供 🎨 免于白跑）

评估过程中产出过三条针对呈现层的指控，🔧 逐条查证：

1. ❌ **「线索行会让 `KaleidoAvgView` 白屏（`uiAction(undefined)` → TypeError）」= 不成立。** 整个可交互子树被外层三元 `{uiAction(l.interaction) ? (…) : l.text}` 守着（`KaleidoAvgView.jsx:423`），而 `uiAction` 是 `UI_ACTIONS[uiKey] || null`（`kaleidoAvgCopy.js:63-65`）⇒ 传 undefined 返 null ⇒ 走 `l.text` 分支。**无崩溃路径。**
2. ⚠ **「resuming 时 `setStaminaRevealed(true)` 是缺陷」= 定性不当。** 它是 🎨 的**刻意取舍且已写注释**（`KaleidoAvgView.jsx:156-158`：再进不会重推 hp_bar 那行，不摊开则体力读数永久不可达）。**但它对 H1 是真约束**：全局单例 `staminaRevealed` + `disabled`（`:432`）**不能充当通用可点词机制** ⇒ P3 必须给每行独立的可点态，不能复用它。
3. ⚠ **`.hint-underline` 在 CSS 里确实不存在**（`globals.css` 只有 `:131 .hint-subtle` / `:135 .hint-none`），但 `underline` 是 `.kaleido-inline-action` 的本体样式 ⇒ **行为正确，仅命名易误导**。不必改。
