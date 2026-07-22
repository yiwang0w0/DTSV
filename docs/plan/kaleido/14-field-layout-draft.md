# KALEIDO · 14 字段落点草案（P1 投影重构 + 存档点提交 + step 注册表）—— 待 🧭 审

> 出处：🧭「出草案，我审。重点审三处：offered 落在 run 层的哪里 / 存档点提交那一拍的原子性 / 信封 `kind` 的取值域」+ 增补两处（step 落点 / 四者提交清单与顺序）。
> 状态：**草案，零实现**。审批前不动 P1 代码。
> 基准：HEAD `969f633f`。

## 0. 一页纸

| 层 | 字段 | 语义 | 单调性 | 回滚 |
|---|---|---|---|---|
| 账号 | `profiles.ui_unlocks` | **上次存档点已提交的发现集** | 单调只增 | — |
| 账号 | `profiles.kaleido_step`（新列） | 故事走到哪儿了 | 单调只增 | **永不回滚** |
| run | `players[uid].uiCommitted` | **写 profiles 的唯一源**（= 上次提交集 ∪ 本程已提交） | 单调 | — |
| run | `players[uid].uiKnown` | 本 run 曾发现（discovered） | 单调 | **随存档点回滚** |
| run | `players[uid].uiOffered` | 要约已发出、玩家尚未点 | 单调 | **随存档点回滚** |
| run | `players[uid].uiHidden` | `{ [ui_key]: 'suppressed' \| 'lost' }` | 可增可减 | run 结束即消 |
| run | `players[uid].uiUnlocks` | **此刻可见**（纯函数投影，形状不变） | 非单调 | 派生，不持久推理 |

**投影**：`uiUnlocks = project(uiKnown, uiHidden, world) = uiKnown ∖ { k : uiHidden[k] }`

---

## 1. 🔑 硬护栏（🧭 定，本草案的第一约束）

> **profiles 的写入必须读 `uiCommitted`，严禁读 `uiUnlocks`（渲染集）或 `uiKnown`。**

实现形态：
- `uiCommitted` 这个名字**本身就是护栏** —— 它不像渲染集，手滑写错的概率远低于「`uiUnlocks` 有两种语义」。
- 写入点**只有一处**（存档点提交），就地注释「此处严禁改读渲染集」。
- **gate 加一条静态断言**：`grep` 出 `from('profiles').update(` 的所有出现，其入参表达式必须含 `uiCommitted`；出现 `uiUnlocks`/`uiKnown` 即判红。这条能真正执行（不像 §3.3-2/-3 要等字段），建议同批落。

**为什么这条必须存在**：危险的从来不是「哪个字段负责渲染」，是**那次整列覆盖写读了什么**。BUG-1（读抖动裁小账号列）与「run 级减法流向账号列」是同一处伤口的两个入口。

---

## 2. 三处重点审

### 2.1 `offered` 落在 run 层的哪里 → `players[uid].uiOffered: string[]`

**不是**独立表、**不是** `gamevars.kaleido`：
- 它与 `uiKnown`/`uiHidden` 是**同一实体（玩家）的同族状态**，放一起才能一次投影算完；
- `players[uid]` 天然随 room 下发给客户端（`route.js` 信封零改动）；
- **`normalizeGamevars` 对 `players` 是原样透传**（`roomState.js:139`），新字段零归一器改动；
- `createPlayerState` 用**条件展开**（同现有 `uiUnlocks` 的写法）⇒ 多人局 player 对象**连键都不出现**。

**`offeredAt` 怎么存**：诱饵要「未发现时长」⇒ 需要每个 offered 键的起始拍。
形状取 `uiOffered: { [ui_key]: <beat:int> }`（对象而非数组），`beat` = run 级合格动作计数（复用周期保底那个计数器的同源口径，见 §5）。
⚠ 代价：形状与 `uiKnown`（数组）不同族，写断言时容易混。**建议 gate 加形状断言**（`uiOffered` 必为对象、`uiKnown`/`uiCommitted` 必为数组）。

### 2.2 存档点提交那一拍的原子性 → **两段式，且顺序不可换**

**四者的持久介质不同，不可能有单一事务**：

| # | 对象 | 介质 | 写口 |
|---|---|---|---|
| A | 场景状态 | `kaleido_scene_state`（新表·待批） | 独立 upsert |
| B | `step` | `profiles.kaleido_step` | 独立 update |
| C | `uiCommitted` → `profiles.ui_unlocks` | profiles | 独立 update |
| D | run 态（`uiKnown`/`uiOffered`/`uiHidden`/存档点锚） | `rooms.gamevars` | `persistRoom`（乐观锁 CAS） |

**提交顺序（定序理由 = 失败时哪一侧的重放是安全的）**：

```
① A 场景状态   （幂等 upsert，跨单位持久，与 UI 无关，先落最不怕重放）
② B step       （单调只增，重放幂等；永不回滚 ⇒ 早落无害）
③ C uiCommitted（单调只增，全列覆盖，重放幂等）
④ D run 态     （最后落：它是「我已经提交过了」的账本；只有它落了，下次才不会重复提交）
```

**失败语义（逐段）**：
- **①/②/③ 任一失败 → 中止，不写 ④**。⇒ 下次到达存档点重放整条链；①②③ 都幂等 ⇒ 重放安全。玩家代价 = 这一程的发现要再走一次存档点才提交（可接受，且有世界内解释：「这一趟没记上」）。
- **④ 失败（CAS 冲突）→ ①②③ 已落，run 账本没落** ⇒ 下次存档点会**重复提交**。因三者皆幂等，重复提交是 no-op。⇒ **这是刻意选的失败方向**（宁可重复，不可丢）。
- **⚠ 「step 推进成功但 UI 提交失败」怎么办**（🧭 点名要答）：**接受这个错位，不补偿。** 理由：§4 已定 step 与 UI 的作用域**本来就该错位**（故事在前进、人换了一茬）。玩家出现「step2 顶着 step1 的 UI 集」= 教义预期内的合法状态，不是不一致。补偿反而会制造「step 回滚」——而 step 的定义是永不回滚。

**⚠ 一处我要 🧭 拍的**：存档点提交要不要走 `withRetry`？
- 现状：路由只对 `executeGameAction` 包 `withRetry`（`route.js:30`），路由边界后的 persist 都没有。
- 建议：**④ 单独包一层 retry（≤2 次）**。理由：它是「本程进度是否算数」的唯一凭据，且 H3 刚证明这一带的 CAS 会因乐观 version 失败。
- 但这会让存档点那一拍最坏多两次往返 —— **要不要为此付延迟，请你定。**

### 2.3 信封 `kind` 的取值域

```
kind ∈ { 'unlock', 'offer', 'threshold_clue', 'lure', 'hide', 'restore' }
```

| kind | 何时发 | 是否带顶层 `ui_key` | 客户端效果 |
|---|---|---|---|
| `unlock` | 键进 `uiKnown`（玩家点了 / `gate:'auto'` 自置） | **是** | 进渲染集 + 播浮现 + 落 narLog |
| `offer` | 键进 `uiOffered`（世界打印了那一行） | **否**（藏 `action.uiKey`） | 只落叙事行；**不进渲染集** |
| `threshold_clue` | 阈值线索（doc 15） | **否** | 只落叙事行 |
| `lure` | 发现诱饵（doc 15） | **否** | 只落叙事行（可带可点词） |
| `hide` | 键进 `uiHidden` | **是** | **移出**渲染集 + 播失去 |
| `restore` | 键离开 `uiHidden` | **是** | 重回渲染集 |

**不变式（由形状保证，非纪律保证）**：**只有 `unlock`/`hide`/`restore` 带顶层 `ui_key`；其余一律不带。**
⇒ 今天客户端 `if (!e || typeof e.ui_key !== 'string') continue`（`useKaleidoUiUnlocks.js:101`）**已经**把叙事类挡在渲染集之外，**零改动**（doc 15 §1 的论证）。
⚠ 但 `hide`/`restore` 带顶层 `ui_key` 且今天的消费端是**无条件 `keys.add`** ⇒ **旧客户端会把「失去」渲染成「获得」**。
⟹ **`hide`/`restore` 必须与 🎨 的 kind 分流同批上线，不得先行下发。** 这是本草案里唯一的跨轨同批约束，请 🧭 排。

---

## 3. `step` 的字段落点 → `profiles.kaleido_step INT NOT NULL DEFAULT 0`（新列·DDL 待审）

**不并进 `profiles.ui_unlocks` 那个 jsonb**，理由是 🧭 自己给的教训：**回滚语义相反的东西不要共用字段**。
- `ui_unlocks` 随存档点回滚（run 级发现的提交）；
- `kaleido_step` **永不回滚**。
共用一个 jsonb ⇒ 任何一次「回滚 UI」的写都可能顺手把 step 带回去，而那是不可逆的进度损失。

**独立列的额外好处**：`INT` 可直接做 `WHERE kaleido_step >= 1` 的查询/统计（🧭/⚙️ 要看漏斗时不用解 jsonb）。

**推进判据**：第二张注册表 `KALEIDO_STEPS`，条目形状与 ui_unlocks 同构：
```js
{ step: 1, key: 'shut_the_door', match: (c) => …, once: true }
```
⇒ 内容（哪个敌人/哪个物品/哪个操作）归 📖+⚙️，我只出机制与形状（🧭 已明确）。

---

## 4. 两张注册表共用一个 evaluator？→ **共用「求值内核」，不共用「注册表语义」**

🧭 倾向共用，我实测后的结论是**部分共用**：

- ✅ **共用**：`evaluateUnlocks` 的内核就三件事 —— 遍历条目、`already` 早退去重、`try/catch` 包 `match`。抽成 `evaluateRegistry(entries, ctx, alreadySet)` 是**纯机械提取，零风险**。
- ❌ **不共用**：`already` 的**来源**、持久化目标、事件 verb、幂等边界三者全不同（ui 用 `uiKnown` 且随存档点回滚；step 用 `profiles.kaleido_step` 且永不回滚）。硬塞进一个函数会把「回滚语义相反」这条最重要的区别藏进参数里。

⟹ **`evaluateRegistry` 一个纯函数 + 两个薄适配器**。这满足 🧭 的「共用」意图，又不触碰它自己定的「回滚语义相反的东西不要合并」。
⚠ 若审下来觉得连内核都不该共用（怕把已稳住的 ui_unlocks 搅浑），**分开写也只多约 15 行重复**，我不坚持。

---

## 5. 附：`beat`（run 级合格动作计数）的来源

诱饵要「未发现时长」、⚙️ 的仪表要「有效剩余拍数」，两者都要一个 run 级拍数。
**我已经建了一个**：周期保底的 `gamevars.kaleido.cycleGuarantee.count`（每次合格搜索 +1、跨关不重置）。
⟹ 建议**提升为独立字段** `gamevars.kaleido.beat`，周期保底改读它 —— 一个 run 只有一个拍数口径，避免将来两个计数器各走各的。
（口径 = `TURN_ACTIONS`，`events.js:28`；`releaseEncounter`/`emergencyRetreat` 不在其中 ⇒ 不计拍。）

---

## 6. 待 🧭 拍的四件

1. **存档点提交的 ④ 要不要单独 retry**（§2.2 末）——延迟 vs 进度可靠性。
2. **`hide`/`restore` 与 🎨 kind 分流的同批约束**（§2.3 末）——需要你排跨轨窗口。
3. **`profiles.kaleido_step` 新列的 DDL**——我写好待审，不自跑。
4. **evaluator 共用程度**（§4）——共用内核 / 完全分开，你定。

## 7. 明确不在本草案内

- `discoverUi` 轻动词的实现细节（🧭 已批准我直接实现，但它依赖本草案的 `uiOffered` 形状 ⇒ 草案批复后落）。
- 场景状态表 `kaleido_scene_state`（见 doc 13，独立 DDL）。
- `d`（每搜掉血）—— **全仓不存在且从未派单**（doc 15 §4.1）。它不属本草案，但 H1 与 step1 都卡在它上面。
