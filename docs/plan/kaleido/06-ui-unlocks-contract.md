# KALEIDO · 06 ui_unlocks 接口契约(🔧 引擎轨 · 恢复令 KP1-E step 0)

> 2026-07-07 · 🔧 引擎轨作者。依据 `05-progressive-disclosure.md` §1 + `03-track-packages.md`「KP1-R 恢复令重排」§🔧 step 0。
> **本文件 = 跨轨契约**:🎨 结构级改造按 §1「客户端契约」建骨架;🔧 按 §3「引擎实现」落地;🔒 审 §4「持久化 + RLS」;📖 供 §2 的 `nar_line`。
> **状态**:接口形状**定稿**(经 5 视角对抗验证,3 视角回执 + 时序法则 blocker 已改;见 §7)。客户端契约(§1)冻结→报 🧭 广播 🎨。实现细节(触发器落地/DDL 执行/E2E 断言)在此后,不改 §1。

---

## 0. 一句话

kaleido 局的**每个 UI 件都是解锁物**;服务端在路由边界按传感层动词 + 前后态 diff 判定解锁,把「当前已解锁集」随 `room` 常驻下发、把「本次动作新解锁」随响应瞬态下发;解锁集**账号级持久化**(跨 run/跨 permadeath,元进度,兼容 R8/R9)。

---

## 1. 客户端契约(🎨 依此建骨架 —— 本节冻结,可去 stub 接真数据)

### 1.1 持久解锁集字段(每个动作响应常驻)

客户端已收 `{ room }`,玩家态 = `room.gamevars.players[<uid>]`。新增**一个字段**:

```
room.gamevars.players[<uid>].uiUnlocks : string[]
```

- 值 = 已解锁 `ui_key` 的**排序去重数组**(单调只增)。
- **渲染法则(🎨)**:UI 件当且仅当其 `ui_key ∈ uiUnlocks` 时渲染。**无例外**——`search_btn` 也在集合里(新账号首个 run 种子集 = `["search_btn"]`),🎨 只有一条统一规则,无需硬编码「搜索按钮总是显示」。
- 新账号首个 run 种子 `["search_btn"]`,随游戏渐进丰富。**返回玩家**继承账号已积累集(veteran 一进局即见完整 UI —— Kanata 定向:首个 run 渐进,后续 run 继承)。
- 字段在 `gamevars` 内,天然随每个动作响应回流;🎨 在已读 hp/inventory 的同一处读它,**响应解析结构不变**。

### 1.2 瞬态解锁事件 payload(仅「本次动作新解锁 ≥1 键」时出现)

kaleido 局动作响应信封**扩一个顶层兄弟键**:

```jsonc
{
  "room": { /* 原样 */ },
  "unlockEvents": [
    {
      "ui_key":   "hp_bar",          // 要浮现的 UI 件
      "nar_line": "……",             // 该件浮现时落进日志的那一行(走数据,📖 供稿)
      "timing":   "before",          // before|after —— 见 §1.3
      "precedes": ["首次可受伤"],     // 可选·人读注记
      "seq":      1                   // 物理关序(chamberIndex+1),给 🎨 上下文
    }
  ]
}
```

- `unlockEvents`:数组。**只在本次动作真的新解锁 ≥1 键时出现且非空**;否则**该键省略**(信封回落为 `{ room }`)。顺序 = 注册表顺序(确定性)。
- 🎨 消费:见到非空 `unlockEvents` → 逐条播浮现动效 + 把 `nar_line` 追加进日志。**一次性动效信号,客户端无状态**(不需 diff `uiUnlocks` 找新增)。
- **幂等保证(引擎)**:每个 `ui_key` 在账号生命周期内**至多在 `unlockEvents` 中出现一次**(判定以账号级已解锁集为准,§3.4);∴ 🎨 无需去重、无需担心重放/重试导致的重复动效。
- **信封选型(已定 · 否决 gamevars 内嵌)**:选顶层 `unlockEvents` 而非塞进 `gamevars.players[uid].unlockedThisAction`——后者是瞬态数据混入持久态,页面 refetch room 时会**重放上一次动作的解锁动效**(陈旧回放 bug)。顶层键请求作用域,天然无此问题。
- **多人局零改动**:`unlockEvents` 仅对 kaleido 局出现;多人局响应仍是 `{ room }`。这是唯一信封结构变化,且完全向后兼容(现有客户端读 `data.room`,新键**加读**即可,不破坏旧解析)。

### 1.3 硬时序法则(`timing` 字段的用途)—— ⚠ 已按对抗验证修正

铁律(05 §1.2):**任何能伤害玩家或使其死亡的机制,其读数 UI 必须先于该机制的首次生效;首次战斗必须安全上演。**

对抗验证(§7 · L1 blocker)证明:玩家 hp 变化 / 死亡**不止**来自战斗反击——还来自**污染熔毁(pollution_meltdown)/Ω 倒计时超时(omega_timeout)/收缩死亡(contraction, alive=false 不经 hp)**,这些经 `persistResolutionWithPollution` 在**任意动作**(含首次 search)结算,**不经 `fight_start`**。∴ 「hp_bar 挂 fight_start」会漏保护非战斗死亡向量,违反铁律。

**修正后的两个 `before` 键:**

- **`hp_bar` → 挂首次 `search`**(不再挂 fight_start):`search` 是每个 run 结构上的**第一个动作**(初始 UI 只有搜索按钮,move_btn 要过关才解锁 → 搜索先行不可绕过)。首次 search 解锁 hp_bar → 早于其后**一切**伤害/死亡向量(战斗、污染、Ω、收缩)。
  - **引擎保证**:解锁判定在路由边界**无条件**求值(即便本动作导致死亡也求值,§3.3)→ 极端「首搜当回合污染致死」也会连 hp_bar 解锁一起下发(玩家看到归零的血条 + 死亡),不空过。
  - **内容不变量(交 ⚙️)**:seq1 首关污染基线非即死、无 turn-1 强制伤害(否则玩家没机会「安全上演」)。这是内容约束,引擎侧已用「首搜解锁 + 死亡回合仍求值」兜底。
- **`rules_card` → 挂 move / before**,先于进入的关的非标准规则/战斗模板首次生效(与 R6「生效前展示」同源)。P1 状态见 §2。

`timing: "before"` 对 🎨 = 浮现动效必须**先于**对应机制的任何渲染完成(`before` → 先播完 hp_bar 再渲染任何 hp 变化动画;`after` → 可与机制同时)。

---

## 2. ui_key 清单(12 项)→ 触发映射 + P1 状态

> 触发器 = 引擎持有的规则注册表(§3.1)。🎨 不消费触发细节,只消费 §1 两个出口。本表给 📖 写 `nar_line`、给 ⚙️ 排「seq1-2 投放下限」对齐。**P1 状态**列标明哪些触发在当前代码即可点亮、哪些待后续件落地。

| ui_key | 触发动词/信号 | timing | 条件(condition) | P1 状态 |
|---|---|---|---|---|
| `search_btn` | —(种子) | — | — | 种子集,非触发物 |
| `log_panel` | `search` | after | 首次 search | **LIVE** |
| `inventory` | `search` | after | `inventory_gained` | **LIVE**(需 ⚙️ seq1-2 有道具可搜出) |
| `hp_bar` | `search` | **before** | 首次 search | **LIVE**(改:先于一切伤害/死亡向量) |
| `combat_panel` | `fight_start` | after | 首次遭遇 | **LIVE**(boss move + search 生成遭遇均触发) |
| `move_btn` | 状态 diff | after | `cleared_seq_increased` | **LIVE**(过关动作即点亮,§2.1) |
| `level_header` | `move` | after | 首次 move | **LIVE** |
| `turn_counter` | `move` | after | 首次 move(与 level_header 同批·注册表内排后) | **LIVE** |
| `rules_card` | `move` | **before** | `entering_nonstandard_level` | **待 LW-2/LW-3/D3**(P1 无非标准关 → 暂不点亮) |
| `stance_ui` | `fight_start` | before | `combat_mode==='stance_duel'` | **待 LW-2**(stance_duel 遭遇需携带 combat_mode) |
| `craft_btn` | `search` | after | `craft_material_gained` | **LIVE when** 配方材料可搜出(⚙️ 投放 + item kind 判据) |
| `convergence` | —(终止常驻) | — | — | 非解锁物;通关/死亡常驻(endingResult) |

> **DEAD→LIVE 无声降级铁律**:`rules_card`/`stance_ui` 在 P1 条件恒 false → 不解锁、不报错、不占位;各自触发件(D3 规则覆盖 / LW-2 stance_duel)落地后自然点亮。契约不变,故 🎨 骨架可含这两件的条件渲染分支(先不会触发)。

### 2.1 条件谓词(condition)—— 路由边界前后态 diff 求值

`inventory`/`craft_btn`/`move_btn` 触发于**状态变化**而非独立动词——用路由边界的 `beforeMe`/`afterMe` 玩家态快照 + `kaleido.clearedSeq` 前后值求值(与现有 `fight_start` 用 `!before.encounter && after.encounter` 同一手法,零新动词)。引擎侧条件词汇表(初版,精确判据落地时定):

- `inventory_gained` = `afterMe.inventory.length > beforeMe.inventory.length`(验证:`searchArea` 经 `setResolutionPlayer` 增 `player.inventory` 数组 —— L5 确认;retry 时 `beforeMe` 可能偏旧,遥测级精度可接受)。
- `craft_material_gained` = after 新持有 item kind ∈ 配方材料的道具(需读 item_pool kind;`inventory_gained` 的子判据)。
- `cleared_seq_increased` = 路由边界在调 `advanceKaleidoProgress` **前**记 `beforeClearedSeq`,调后比 `room.gamevars.kaleido.clearedSeq` —— 增长即本动作过关(**内存 diff,不依赖 level_clear 的异步 emit** —— L5 确认 level_clear 事件不回传路由,必须走 clearedSeq 内存 diff)。
- `entering_nonstandard_level` = 本次 move 进入的关 node 的 `combat_mode !== 'standard'`(P1 raidPath node 的 `env_rules`/`formula_overrides` 恒空 —— L5 确认;∴ 改用 combat_mode 作「非标准」信号,D3 落地后可扩)。
- `combat_mode==='stance_duel'` = 本次 fight_start 所在关 node 的 combat_mode(待 LW-2 让 stance_duel 遭遇携带 combat_mode)。

> **给 ⚙️ 的耦合点(05 §2)**:要让 `inventory`/`craft_btn` 在 seq1-2 自然解锁,seq1-2 搜索须**能**产出道具/配方材料(投放下限)。引擎只在条件满足时解锁,不制造内容。

---

## 3. 引擎实现(🔧 自持,契约冻结后落地;供 🔒 审 + 交叉轨理解)

### 3.1 触发规则注册表(引擎持有)

`src/lib/server/kaleido/uiUnlocks.js`(新文件)导出 `KALEIDO_UI_UNLOCKS`:有序 12 条 `{ ui_key, verb|signal, timing, condition, precedes, nar_line }`。
- `verb`/`timing`/`condition`/`precedes` = 引擎机制,随代码版本化(与时序法则强耦合,不可外置到可被内容误改处)。注册表**顺序 = unlockEvents 顺序**(level_header 排 turn_counter 之前)。
- `nar_line` = 📖 供稿。**存储位置 = 待 🧭/📖 决策**(§5 决策 2),两方案客户端契约一致,不阻塞 §1:
  - 方案 A(P1 推荐):内联进 `KALEIDO_UI_UNLOCKS`(📖 供字符串,引擎作数据模块;**不硬编码进组件**——经 `unlockEvents` 流转,满足 KP1-N 红线),零 per-action DB 读。
  - 方案 B:`content_pool`/轻表,支持 admin 实时改文案,代价 = 每 run 起始读一次缓存。

### 3.2 判定挂点 = 路由边界(复用 before/after 快照)

`route.js` 现有 `if (isKaleidoRoom(room))` 块内、`advanceKaleidoProgress` 之后:
- 调 advance **前**记 `beforeMe`(现已有,line 41)与 `beforeClearedSeq = room.gamevars.kaleido.clearedSeq`。
- 调 advance **后**取 `afterMe`、`afterClearedSeq`、当前关 node、本动作是否 fight_start(现有 diff)。
- 对每条注册表规则:`ui_key ∉ 账号已解锁集` ∧ 动词/信号匹配 ∧ 条件满足 → 新解锁。对新解锁键:①加入 `afterMe.uiUnlocks`(→ 随 room 回流);②`profiles.ui_unlocks` 追加(账号持久);③发 `ui_unlock` player_event(§3.4);④收进 `unlockEvents` 返回。
- **无条件求值**:即便本动作 `afterMe.alive===false`(死亡回合)也求值 → hp_bar 死亡回合仍下发(§1.3 兜底)。

### 3.3 时序法则的结构保证

- `hp_bar`(search/before):首次 search 即解锁 → 早于其后一切动作的伤害/死亡向量(战斗反击 / 污染熔毁 / Ω 超时 / 收缩)。求值无条件(死亡回合亦发)→ 首搜当回合污染致死这一极端也连 hp_bar 一起下发。
- **LW-1 教训落实**:遭遇是瞬态(每次 attackNpc 后清空、boss 关由 advance 重锁)。解锁标记**存 `player.uiUnlocks`,绝不存 `encounter`**;`combat_panel` 用「首次 null→present」判定,boss 重锁的后续 null→present 不再触发(attackNpc 起始 `beforeMe.encounter` 已 truthy)。
- `rules_card`(move/before):进非标准关的 move 上解锁,该关战斗/规则生效在其后动作 → 先于生效(P1 无非标准关,恒不触发,见 §2)。

### 3.4 服务端事件(遥测 + E2E + P1 指标)+ 账号级去重权威

- 新动词 `ui_unlock` 入 `player_events`:一键一行,`payload = { ui_key, timing }`,`level_seq = kaleidoLevelSeq`。
- **「已解锁」判定权威 = 账号级集合**(`profiles.ui_unlocks` 的 run 起始镜像 `player.uiUnlocks`),非某次事件——保证 withRetry 重放 / boss 重锁重入下**集合加幂等**、`ui_unlock` 事件与 `unlockEvents` 每键至多一次(§1.2 幂等保证的落点)。
- 用途:E2E 解锁序 + 时序法则断言;P1 闸门第 6 条「到第二个 UI 元素的时间」= 首个非 search_btn 的 `ui_unlock.t` − run 起始。

### 3.5 运行时镜像的注入 / 复位 / 兜底

- run 起始(`startKaleidoRun`,gameActions.js ~:2642):读 `profiles.ui_unlocks`(空则 `[]`)→ 并 `['search_btn']` 去重 → 经 `createPlayerState(user, { ...stats, uiUnlocks: seed })` 种子(与 portraitUrl 注入同范式 —— L3 给出精确挂点)。`createPlayerState` 增默认 `uiUnlocks: stats.uiUnlocks ?? []`。
- **兜底**:`normalizeGamevars` 对每个 player 补 `if (!Array.isArray(p.uiUnlocks)) p.uiUnlocks = []`(老存量 player 对象加载不崩,与 stamina/depth 回填同范式 —— L3)。多人局 player 因此得空数组,渲染侧读到空集 → 零 UI 解锁物,不影响多人渲染路径。
- **R8/R9**:permadeath/收敛**不回收** `profiles.ui_unlocks`(元进度)。新 run 继承账号集;`player.uiUnlocks` 是账号集的 run 内镜像,不泄漏 run 态。

### 3.6 E2E 路径统一(对抗验证 L3/L5 抓到的分叉)

`scripts/kaleido-e2e.mjs` 的 `act()` 是路由边界的**另一份实现**,当前连 fight_start 都没复刻。落地时把「动作后 kaleido 处理」(advance + 建 action/fight_start/unlock 事件 + emit + 返回 `{ room, unlockEvents }`)抽成**单一共享函数**(拟 `src/lib/server/kaleido/applyKaleidoPostAction.js`),route 边界与 E2E `act()` 同调,否则时序法则断言测不到真路径。

---

## 4. 持久化 DDL(step ② · 写好先审,勿跑)

```sql
-- profiles.ui_unlocks:账号级已解锁 ui_key 集(单调数组),兼容 R8/R9 元进度
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ui_unlocks JSONB NOT NULL DEFAULT '[]'::jsonb;
```

- **选型**(Map C):`profiles` jsonb 列——账号级天然(1 账号 1 行)、复用 profiles 既有 RLS(owner-read + service-write)、与 `pending_class_roll`/`stash_capacity` 同范式、最少活动件。**否决** `player_profile`(版本化 ML 表 `unique(player_id,version)`,语义错,代码零读写);**否决**新 `player_ui_state` 轻表(多一表 + 一套 RLS,无收益)。
- **RLS(🔒 审点)**:owner 只读自己(`id = auth.uid()`,profiles 既有);写仅 `service_role`(解锁只经服务端路由边界)。无需新策略(继承 profiles),但请 🔒 确认 profiles 现有 RLS 覆盖新列写路径、且 owner 不能自改 `ui_unlocks`(防客户端伪造解锁)。
- 幂等(`ADD COLUMN IF NOT EXISTS`);写好**先交 🧭/🔒 审**,批准后经 postgres MCP 执行,文件头标「已应用」。

---

## 5. 待决策(报 🧭 时同报)

1. ~~信封 vs gamevars~~ **已定**:顶层 `unlockEvents`(§1.2 已含否决 gamevars 内嵌的理由:陈旧回放)。请 🧭 知会即可,如否决则回退 gamevars 内嵌。
2. **`nar_line` 存储**(§3.1):方案 A 引擎内联(P1 推荐)vs 方案 B content_pool 可 admin 改。触碰 📖 turf,**请 🧭/📖 定**。不阻塞 §1。
3. **hp_bar 挂点改动的叙事影响**(§1.3):hp_bar 由「首次遭遇前」改为「首次 search」(时序法则 blocker 修正)。📖 为 hp_bar 写的 `nar_line` 若假设「战斗前浮现」,需改为「首次行动时身体的受伤感上线」的措辞。**请 📖 复核 hp_bar 文案**。
4. **`condition` 谓词判据**(§2.1):`inventory_gained`/`craft_material_gained`/`cleared_seq_increased`/`entering_nonstandard_level` 由 🔧 落地时定;请 ⚙️ 确认 seq1-2 投放下限能点燃 inventory/craft_btn。

---

## 6. 多人局零行为变化自证

- `uiUnlocks` 字段仅 kaleido run 起始注入(多人局经 normalizeGamevars 得空数组,不改渲染);`unlockEvents` 仅 kaleido 响应出现;判定全在 route 边界既有 `if (isKaleidoRoom(room))` 块内;`profiles.ui_unlocks` 仅 kaleido 路径读写。
- 多人局:信封仍 `{ room }`,gamevars 无新解锁字段(空数组不触发任何解锁物),profiles 无读写。→ smoke + build 自证,断言不变。

---

## 7. 对抗验证记录(2026-07-07 · 5 视角)

- **方法**:契约草案 → 5 视角对抗验证(时序法则 / 持久化生命周期 / 多人中性 / 幂等重试 / 触发覆盖),各读真码猎错。3 视角回执、2 视角(持久化/幂等)结构化输出超限**待补跑**(属实现层 §3,非 §1 契约,不阻塞广播)。
- **确认 blocker(已改契约)**:①L1 时序法则——非战斗死亡向量(污染/Ω/收缩)可先于 fight_start → hp_bar 改挂首次 search + 无条件求值(§1.3/§3.3)。
- **确认改进(已并入实现节)**:②L3 注入挂点(startKaleidoRun 读 profiles + createPlayerState stats)③L3 normalizeGamevars 兜底 ④L5 move_btn 走 clearedSeq 内存 diff(level_clear 事件不回传)⑤L5 rules_card/stance_ui P1 恒不触发(改条件 + 标 DEAD→LIVE)⑥信封选型定顶层 + 幂等保证(§1.2)。
- **确认设计正确**:search 可生成遭遇(combat 非 boss 独有,利 ⚙️ seq1-2 combat 约束);inventory 经 player.inventory 数组增长可判;convergence/search_btn 非解锁物设计正确。
- **待补硬化(实现期,不阻塞 §1)**:重跑 L2(持久化原子性:profiles 写 vs gamevars 写 desync)+ L4(withRetry 重入 double-emit);契约级幂等保证已在 §1.2/§3.4 声明(判定权威 = 账号集)。
