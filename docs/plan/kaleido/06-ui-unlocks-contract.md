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
| `rules_card` | `move` | **before** | `entering_nonstandard_level` | **LIVE**(E2E 实测:采样器出非标准 combat_mode 关即触发;D3 落 env_rules 后条件再扩) |
| `stance_ui` | `fight_start` | before | `combat_mode==='stance_duel'` | **LIVE**(E2E 实测:读关 node 的 kaleidoMode,非遭遇实例 → 无需 LW-2 前置) |
| `craft_btn` | `search` | after | `craft_material_gained` | **P1 DEAD·LIVE when** 配方材料可搜出(⚙️ 投放 + item kind 判据) |
| `convergence` | —(终止常驻) | — | — | 非解锁物;通关/死亡常驻(endingResult) |

> **E2E 实测修正(30/30·2026-07-07)**:`rules_card`/`stance_ui` 在 P1 **即 LIVE**——采样器(`runs.js combatModeFor`)按 archetype 产出非标准 combat_mode(stance_duel 等);判定读**关 node** 的 `kaleidoMode.template_ref`(非遭遇实例),故无需 LW-2/D3 前置(实测解锁序含此二键)。唯一 P1-DEAD = `craft_btn`(配方材料判据待 item kind + ⚙️ 投放)——无声降级:条件恒 false,不解锁、不报错、不占位,⚙️ 投放到位即点亮。故 🎨 骨架须含全 11 件条件渲染(除 craft_btn 外 P1 均可能触发)。

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

- **选型**(Map C):`profiles` jsonb 列——账号级天然(1 账号 1 行)、与 `pending_class_roll`/`stash_capacity` 同范式、最少活动件。**否决** `player_profile`(版本化 ML 表 `unique(player_id,version)`,语义错,代码零读写);**否决**新 `player_ui_state` 轻表(多一表 + 一套 RLS,无收益)。
- **RLS 实情(🔒 KP1-X item 2 实测·`31f5265`·⚠ 修正我此前两处错判)**:
  - profiles 实为 **public-read**(`profiles_select USING(true)`),**非** owner-read → ui_unlocks 随 profiles 全列 anon 可读(无 PII/凭证 → info/low·可接受)。
  - profiles 有 **owner-UPDATE**(`profiles_update USING(auth.uid()=id)`·`with_check=NULL`)→ owner **可自改任意列含 ui_unlocks**(行级 RLS 不能约束列)→ 我「owner 不能自改」主张**不成立**(案②·medium:owner 可 `UPDATE profiles SET ui_unlocks='[全键]'` 伪造整套解锁,而 `startKaleidoRun` 读它当权威种子被服务端信任)。
- **必须列级守卫(🔒 定·不能改策略)**:`profiles_update` 是 `PrepareModal` 存载具的合法路径,不能 DROP/收窄;RLS `with_check` 见不到 OLD,列 GRANT 白名单随 schema 漂移 → 唯 **`BEFORE INSERT OR UPDATE` 触发器**可令单列对客户端不可变。守卫已由 🔒 起草:[`scripts/kaleido-ui-unlocks-guard.sql`](../../../scripts/kaleido-ui-unlocks-guard.sql)(default-deny 白名单 `{service_role,postgres,supabase_admin}`;客户端 UPDATE 改该列→RAISE、INSERT 非空→强制 `'[]'`;不碰其它列)。
- **实现耦合(🔧·Commit B)**:ui_unlocks 写入**必须用 service_role 客户端**——已确认路由的 `createServerSupabase()` 用 `SUPABASE_SERVICE_ROLE_KEY`(service_role),`applyKaleidoPostAction`/`startKaleidoRun` 经此 client 读写 → `current_user='service_role'` 过守卫。合法解锁写不被拒 ✓。
- **执行顺序(🔒 定·待 🧭 批)**:① §4 DDL 建列 → ② 守卫触发器 → ③ 🔧 service_role 写路径落地(Commit B)→ ④ 🔒 复验(anon 伪造被拒/service_role 写通/PrepareModal 不受影响)。幂等·均未执行。
- **Commit A 不受影响**:Commit A 全程不碰 profiles(每 run 种子 `['search_btn']`),守卫/DDL 落地前后 Commit A 行为不变;账号继承(Commit B)在 ②守卫+①DDL 应用后接入。

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

### 7.1 Commit A 落地验证(2026-07-07 · 运行时机制·无 profiles 依赖)
- **实现**:`uiUnlocks.js` 注册表/判定 + `applyKaleidoPostAction` 共享入口(route/E2E 同调)+ createPlayerState 条件字段 + startKaleidoRun 种子 `['search_btn']` + route 信封扩 unlockEvents + E2E 7 断言。account 持久化(profiles)= Commit B(待 🔒 审 DDL `scripts/kaleido-ui-unlocks.sql`)。
- **E2E 30/30**(kaleido-e2e.mjs·真库):解锁序 `[log_panel,hp_bar,combat_panel,move_btn,level_header,turn_counter,rules_card,inventory,stance_ui]`;**时序法则实证**:hp_bar 于 level_seq=1(首搜)解锁,id 严格 < 首个 attack(seq5);每键至多一次(幂等);镜像 `players[uid].uiUnlocks` 含种子 + 全解锁。
- **build 绿**(next build 全路由编译含 /api/game/actions);多人局中性(createPlayerState 条件展开无字段 / route 非 kaleido 回落 {room} / 全 isKaleidoRoom 门)。
- **retry/原子性实证**:route 的 kaleido 块在 withRetry **之外**(仅 executeGameAction 被重试)→ applyKaleidoPostAction 恰一次执行,无重复发;uiUnlocks persist 成功才发 unlock 事件(persist gates emit)→ L4 double-emit 结构上排除(L2/L4 补跑仅确认,非阻塞)。
- **实测修正**:rules_card/stance_ui P1 即 LIVE(见 §2 表·§8 D5);craft_btn 唯一 P1-DEAD(item kind 判据待接)。

---

## 8. 🎨 stub 对齐(基于 `5ee35b7`)

🎨 已按 05 §1.1 建 stub(`kaleidoUiUnlocks.js` / `useKaleidoUiUnlocks.js` / `KaleidoRunView.jsx`)并预留真数据读取缝。**stub 与本契约高度一致**:11 个 ui_key 全对齐、`INITIAL_UNLOCKED=['search_btn']`、`enabled=false` 惰性(多人中性)、且其注释已预期「服务端解锁集 + 含 nar_line 的解锁事件」——即本契约 §1.1+§1.2。以下为需 🎨 校订的对齐点(均小改,🎨 已预留缝):

| # | 🎨 stub 现状 | 契约权威 | 🎨 改动 |
|---|---|---|---|
| D1 解锁集位置 | `readServerUnlocks(gamevars)` 读 `gamevars.kaleido.uiUnlocks` | `gamevars.players[uid].uiUnlocks`(账号镜像随 player 下发,与 hp/inventory 同处) | `readServerUnlocks(me)` 读 `me.uiUnlocks`(一行;`buildUnlockCtx` 已有 `me`) |
| D2 解锁事件 | 客户端 diff 解锁集 + 本地 `UI_UNLOCK_ENTRIES` 取 nar_line | 响应信封 `unlockEvents:[{ui_key,nar_line,timing,precedes,seq}]`(nar_line 服务端权威) | 有 `unlockEvents` 时以其为准播动效 + 落 nar_line;`justUnlocked` set-diff 降级为 stub 期兜底;停用本地 nar_line 副本(消除 client 副本漂移) |
| **D3 hp_bar 触发 ⚠** | `fight_start/before`,derive 门 = `encounter‖everFought` | **改** `search/before`(时序法则 blocker:污染/Ω/收缩死亡先于 fight_start) | **hp_bar derive 门改 `ctx.searched`(首搜即显,勿等 combat)**;与 combat_panel 解耦(hp_bar 早于 combat_panel);nar_line 请 📖 复核 |
| D4 item 动词 | `verb:'item_gain'`(inventory/craft) | 无 `item_gain` 动词 = `search` + condition(`inventory_gained`/`craft_material_gained`) | 注册表 verb 对齐(stub 的 `hasItems`/`hasCraftMat` derive 不受影响) |
| D5 关入动词 | `verb:'level_enter'` + `has_rule_override`/`stance_duel` | 无 `level_enter` 动词;rules_card=`move`+`entering_nonstandard_level`(combat_mode≠standard);stance_ui=`fight_start`+`combat_mode==='stance_duel'`;**P1 均 LIVE**(E2E 30/30 实测触发) | verb 对齐;⚠ **node 字段是 `kaleidoMode` 非 `combatMode`**(stub 的 `buildUnlockCtx` 读 `node.combatMode.template_ref` → 恒 undefined;真源 `node.kaleidoMode.template_ref`)。改 unlockEvents 消费后此 derive 退居兜底,仍建议改名对齐 |
| D6 move_btn | `verb:'level_clear'` | `cleared_seq_increased` 内存 diff(level_clear 事件不回传路由) | 服务端 `unlockEvents` 会携 move_btn;stub 的 `clearedAny` derive 保持 |

> **净评估**:🎨 stub 无需推翻,按上表 6 处校订即接真数据。最实质一处 = **D3 hp_bar 提前到首次 search**(时序法则修正,影响 derive 门与 📖 文案),其余为字段名/verb 词汇对齐。`REVEAL_ORDER` 与本契约注册表顺序一致,渐次动效无需改。
