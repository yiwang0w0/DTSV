# 🔧 引擎轨 · 变更日志(倒序置顶)

> 以下历史段由 ⚙️ 游戏性轨(时任引擎职责)交付,2026-07-07 归属移交 🔧。

## 最近变更（2026-07-08 / 🔧 ✅ hook① 内容注入消费器落地 —— AVG A1 阻塞已清·E2E 36/36·build 绿）

- **✅ hook① 上 main（`e97c91d`）**：AVG 垂直切片(10-avg)唯一阻塞 A1。5 件 + 校验:
  - **event_deck item_find 排空**(resolveSearchAction·isKaleidoRoom 门·1/search front-load·guaranteed 硬保证·consumedEventDeck 存 `gamevars.kaleido[chamberIdx]`·item id→name 查 item_pool·命中即 return)。
  - **hook④ 零随机刷怪**(npc-spawn gate `:1411` 加 `&& !isKaleidoRoom(room)`)→ 战斗敌只从入关注入·seq1(start·无 move-in + 无 combatSetup)零战斗。
  - **非 boss 入关注入**(movePlayer `:3488` boss 块泛化到任意 `nextChamber.kaleidoEnemy`·level 取 `ke.level`·`isBoss = archetype==='boss' || ke.level==='boss'` → 强制 boss level 保 bossDefeated/boss_kill 链)。
  - **推进层重锁泛化**(advanceKaleidoProgress `:2734` boss 重锁扩到 `node.kaleidoEnemy && mode≠stance_duel && !encounter`·find by `mapId===templateId && hp>0`·usedChambers 保唯一无碰撞·stance_duel 由 LW-2 lock-until-death 自管排除)→ 弱敌可打完不遗弃半血。
  - **hook⑥ `validateSeedLevel`**(runs.js·非致命 warn):boss_kill 缺敌 / guaranteed 超预算(#guaranteed ≤ survive_turns−(非首关 1))。`.eq('enabled',true)` 确认已在 `:2616`。
- **验证 E2E 36/36**(30 回归零破 + §③ 6 新)：§③ 临时点亮 d6-seq1/2(id 2,3)→ 实测 guaranteed 硬保证(seq1 背包+2=id27+id13)/ seq1 零战斗(无 fight_start·attack@seq1)/ consumedEventDeck 记录 → finally 恢复 enabled=false;postgres MCP 查证五关全 false 无残留。build ✓ 绿。多人局中性(全 isKaleidoRoom 门·回归 boss_kill 链不破)。
- **交接 🧭**：seq1-2 已永久 enabled=true(🧭)→ 启用态复跑 E2E 36/36 四点全过(search 计数对齐/guaranteed 活流成立/seq1 零战斗/boss_kill 不破)。**自查修 `fa4fb2e`**:§③ finally 硬编码 enabled=false 会覆盖永久态 → 改「捕获原 enabled 逐 id 还原」(postgres 查证 seq1-2 仍 true)。撤=收敛(extractPlayer 保持 throw·Kanata 拍板)。
- **✅ craft_btn 接通（`aed7b6c`·E2E 38/38·🧭 信号·排 LW-3 前）**：AVG 链「搜→物品→物品栏→合成」完整。口径查证 recipe 表全空 → 按 kind 判材料:`CRAFT_MATERIAL_KINDS=[tech_fragment,platform_part,omega_matter]`(id13/id14=tech_fragment)。hook① drain 搜到材料置 `player.hasCraftMat`(单调);`craftMatGained = after∧!before`(首获材料转变)→ craft_btn 解锁一次。实测 seq1:搜1→log/inventory/hp·搜2→**craft_btn**·清关→move。
- **✅ LW-3 gauntlet 波次落地（`074049c`·E2E 43/43·build 绿）**：裁决 C·07 seq2 首战 2 波完整性。推进层波次编排(advanceKaleidoProgress relock 块扩):gauntlet 关当前波敌死(无活实例)∧ curWave<wavesTotal → 生成下一波(base×enemyScale^(wave-1)·waveHeal clamp maxHp)+ 重锁;波敌走 attackNpc 富战斗路径(裁决 C);exit 仍 survive_turns(波=内容非门);movePlayer 入关 gauntletWave=1。E2E +5(seq2=gauntlet waves≥2/入关 wave-1/杀 wave-1→wave-2 生成+重锁/wave-2 缩放/wave-1 死)。软锁排除:curWave<wavesTotal 封顶·survive_turns 恒收·search-while-encounter 不锁·isKaleidoRoom+template_ref 双门(多人/非 gauntlet 零变化·回归 38/38)。
- **✅ D5 R1 战斗 seed 化落地（`bd29d02`·E2E 44/44·build 绿）**：现 kaleido 战斗走 Math.random 违 R1(P1 闸门「同 seed 回放一致」前提)。resolveNpcAttackAction 顶构 `krng = mulberry32(hashStr(runId:chamberIndex:turnCount:atk))`(每攻击唯一流·内多 roll 顺序步进);5 处战斗 Math.random→rnd()(playerHit/counterTriggered/npcHit/fragment)+ calcDamage 暴击(gameEngine.js 加可选 rng 参·玩家攻击&NPC 反击两处传 krng)。**多人局 krng=null→Math.random 逐字节不动**(isKaleidoRoom 门+calcDamage rng 默认 null·PvP/多人 PvE 不传参零变化);search 路径 Math.random 不在战斗 scope。E2E +1=同状态×2 重放 6-attack 高熵序列(跨 wave 死+累积 crit/counter)逐字节一致。mulberry32 复用 br/forbidden 既有 import(避重声明)。
- **垂直切片引擎侧 + R1 全清**：hook① / craft_btn / LW-3 / D5 全 ✅（E2E 44/44）。**唯余 D3 mergeGameRules**——按 🧭 令**缓到 Kanata 手感/全量拍板**(服务 seq3-5 规则关·seq1-2 env_rules/formula_overrides 都空不涉及)。手感未定前本轨无待推项;若手感有向,可提前研究 seq3-5 全量引擎影响面(待 🧭 信号)。

## 研究简报（2026-07-08 / 🔧 · ui_unlocks 支撑 AVG 渐进披露引擎可行性 —— 🧭 命题·已 send）

> Kanata AVG 愿景(登录直进 run·初始仅搜索按钮·每搜一次系统一件件浮现·「UI 即进度」)引擎可行性研究。3-reader workflow(w4eq8cw2p·Q2/Q3 绿·Q1 schema 超限我手补读 KaleidoRunView)。**总判:ui_unlocks 正是这个愿景的引擎,核心循环已架构性实现。**

- **Q1 ui_key 覆盖 + 缺口**：11 ui_key **完全覆盖当前 kaleido UI 面**(关卡头/回合计数/HP/规则卡/战斗面板/三态/搜索/前进/合成/背包/日志·KaleidoRunView.jsx 逐件 RevealSlot 门控)。**缺口**:①「撤」(extract)——kaleido 无撤离(用 run 收敛),extractPlayer 对 kaleido throw(:3980)·无 ui_key/按钮 →「搜打撤」的撤=收敛(已覆盖)还是要中途主动撤(新功能)? **设计澄清问 Kanata**;②未上屏系统(污染/Ω/残片/buff/立绘)kaleido 全不渲染——「整套」若要它们长出来 = 各加 1 ui_key(同 pattern·trivial);③convergence 是终态非解锁物(非缺口·spec 已标)。
- **Q2 登录直进 run = yes·小工程**：startKaleidoRun 已幂等(active 续/ended 自动新)·自动进入原语已存在(handleKaleidoRestart / rooms 出勤卡)。改 = 登录后 redirect 到新 /play 路由(调 /api/kaleido/run → /game/[id])。工程:login/page.js:32 `router.push('/')`→/play(trivial)+ 新 /play 页(small·含 loading/error/30s 冷却/空模板兜底)。**风险**:①勿挂 RootShell onAuthStateChange(全局 fire·会劫持 admin/stash 导航)②冷却/空模板 throw 需优雅兜底③多人/admin 逃生(留 Nav 或豁免)④可选 full-bleed 去 Nav chrome。
- **Q3 动作渐现 = yes·已实现**：客户端 RevealSlot(show=isUnlocked(key)→未解锁不产 DOM)已门控每颗动作按钮;新 run uiUnlocks=['search_btn']→仅搜索显 →「初始仅搜索按钮」**已成立**。动作→ui_key 干净(attack→combat_panel/move→move_btn/craft→craft_btn/useItem→inventory/stance→stance_ui)。**缺口**:服务端 dispatcher **unlock-blind**(:3332 纯 action 串路由·「不出现」仅客户端保证)→ 可选 defense-in-depth 服务端解锁门(small);emergencyRetreat 未 kaleido-gate(:4227·API 可达无按钮)→ trivial 补 gate。
- **效果结论**:愿景**已架构性实现**(ui_unlocks+KaleidoRunView 已交付「搜索起手→系统按解锁渐现」核心循环)。补全 = 登录直进(小)+「撤」语义定夺(设计)+ 可选 N 个新 ui_key(污染/残片…若扩)+ 可选服务端解锁门。**无阻塞级引擎缺口·全部 additive**。

## 工作包设计捕获（2026-07-08 / 🔧 · hook①③④+LW-3+D5 · 两 workflow 全测绘后的可续实现蓝图）

> ui_unlocks 全链闭合后转工作包。两轮 seam-mapping(wk93hy7qx gauntlet·w0iysva08 searchArea/注入/RNG/placement)完成 + D6 五关真数据查证(content_pool id2-6·⚙️ 已应用我全部修订:npc_encounter 去冗余·boss 乙值 260/34/8·seq1 无 combatSetup 键)。**下面是可直接开工的实现蓝图。**

- **提交切分**：
  - **C1(安全核·解锁链解阻·零软锁·先做)**：① hook① item_find guaranteed 排空(resolveSearchAction·isKaleidoRoom 门·1/search front-load·consumed 存 `gamevars.kaleido.consumedEventDeck[chamberIdx]=[已消费 index]`·item id→name 查 item_pool) ② hook④ kaleido 搜索零随机刷怪(npc-spawn gate 加 isKaleidoRoom skip·kaleido 战斗敌只从 combatSetup 入关注入·非搜索随机) ③ hook⑥ 校验(boss_kill 缺 combatSetup.enemy 拒 + guaranteed 预算不变式 `#guaranteed_item ≤ 可用 search 数`)。**E2E**:临时点亮 d6-seq1/seq4 → 断言 guaranteed 掉落序 + inventory/craft_btn 解锁 + seq1 零 fight_start。
  - **C2(战斗注入·设计有 nuance)**：非 boss combatSetup.enemy 入关注入(镜像 boss `movePlayer:3488`,扩 encounter/elite/resource) + gauntlet LW-3 波次编排 + **survive_turns×encounter 交界解析**。
  - **C3**：D5 rich-path seed 化(6 Math.random sites)。
- **seam 锚点(w0iysva08)**：
  - inventory-add = `gameActions.js:1573`(`[...polluted.inventory, ...addedEntries]`)·item=item_pool.**name 字符串**(非 id→需查 item_pool)。
  - npc-spawn gate(hook④)= `1411`(`roll<npcChance && bundle.npcPool.length>0`)+`1437`(pickOrSpawnNpcInstance)→加 isKaleidoRoom skip。
  - chamber 取 = `getCurrentChamber(gamevars,player)` roomState.js:249 → node.kaleidoEventDeck / node.kaleidoEnemy。
  - boss 注入(C2 镜像)= `movePlayer:3488`;boss relock=`advanceKaleidoProgress:2734`;encounter step5 无条件清=`attackNpc:2039`。
  - consumed 存 `gamevars.kaleido`(非 players·per-run;normalizeGamevars 透传·读时 `|| {}` 兜底)。
- **⚠ survive_turns×encounter 关键事实(softlock 分析)**：`evaluateExitCondition(survive_turns)` 只读 `turnCount≥turns`·**不管 encounter**(w0iysva08 map B)→ 清 encounter 不阻过关,∴ 非 boss survive_turns 关注入 encounter **不硬软锁**(搜索推 turnCount 即过);但注入后 step5 清、非 boss 无 relock → 再 attackNpc 报「无目标」(非软锁·可搜索兜)。**C2 待定(逐条推演 + 可能问 ⚙️/🧭)**:relock 语义分档——boss=relock(现有)·elite/stance_duel=LW-2 lock-until-death(seq3·:1752)·gauntlet=LW-3 波次管(seq2)·resource/standard 弱敌可不 relock;且 gauntlet survive_turns 是否强制打完波次(vs 搜索 past)= 玩法设计问 ⚙️/🧭。
- **D5 6 sites(C3·isKaleidoRoom 门·mulberry32(hashStr) 复用·seed=runId+chamberIndex+turnCount+seq)**：`gameActions.js:1841`(playerHit)/`1990`(counterTriggered)/`1993`(counterHit)/`1954`(fragment drop)+`gameEngine.js:89`(crit·calcDamage·被 player→npc 1859 & npc→player 1998 双调用→一 PRNG 流串)+`combatModes/index.js:157`(stance·已确定性 stepRng·不动)。PvP resolvePlayerAttackAction:2060+ 也用 calcDamage(多人·不 gate·零变化)。
- **已答 ⚙️(09)**：atk/def 持久强化件现成(resolveUseItemAction:2321/2326 直改 nextPlayer·非 buff);maxHp 需加 `maxHpDelta` 钩子(calcItemEffect + :2296 后分支)——我可接。staminaDelta 已 `!isKaleidoRoom` 排除。
- **待接(工作包内·排 hook① 后)**：跨 run 继承 E2E(专用 E2E-* auth 用户·固定 UUID·跑前 reset ui_unlocks='[]'·绝不碰 4 真人·断言后 🔒 复核签 ui_unlocks 关链)。

## 最近变更（2026-07-07 / 🔧 · step 0 里程碑通过 → KP1-E 增补工单(推进层 payload 消费统一化)）

- **✅ Commit B 落地 —— ui_unlocks 全链闭合**（`6128411`·E2E 30/30·build 绿）：🔒 已执行 DDL+列级守卫(b4502b0·3 探针通过)后接账号持久化——startKaleidoRun 读 profiles.ui_unlocks 种子(service_role·缺行回落 UI_SEED)；applyKaleidoPostAction 解锁时 merged 单调全集写回 profiles(过守卫白名单·失败不阻断)。跨 run 继承真验 = 🔒 step④(合成 UUID 无 profiles FK 行·E2E 测不到·已报 🧭 调 🔒)。**接口形状→运行时机制→账号持久 三段全闭合**，仅剩 🔒 step④ 签字。
- **✅ nar_line 全角同步**（同 6128411 前一 commit）：8 条半角标点→全角逐字取 N3 §1(36a17c1)·supersede a85bc73;全角=逐字一致规约(🎨提议🧭批),以后取稿以 N3 §1 最新表为源。
- **✅ 回执**：hp_bar nar_line 定稿同步(全角)；敌名不回落 npc_pool 实证(boss 分支 ke.name||'首领'·normalizeNpcInstance 零 DB 查)已答 🧭 转 📖/⚙️；payload 批复+敌人单一来源修订已转 ⚙️(出 seq3-5 SQL)。
- **✅ step 0 里程碑通过**（🧭 裁决）：06 契约(ef726b7)+§8(a06b468)+Commit A(ec38ed6) 收讫;🎨 已集成(50a9ec2)+ D2 unlockEvents 消费 landed(cdcb107)。我的方案 supersede ⚙️ 提案。nar_line 存储裁定=**方案 A(引擎内联)**(uiUnlocks.js 📖 供稿逐字·P2 迁 content_pool);hp_bar 首搜批准;命名坑广播(node.**kaleidoMode** 非 combatMode·我已用对)。
- **⚠ 范围变更（🧭 裁决）**：LW-3 并入 **KP1-E 增补工单 = 推进层 payload 消费统一化**(⚙️ 抓到阻塞缺口:event_deck 零运行时读者·非 boss 敌人注入缺失 → 种子关 inert·inventory/craft_btn 解锁链断)。工作包 = ① event_deck 掉落消费 + 非 boss combatSetup.enemy 注入(镜像 boss 3404)② craft_btn 状态检查(已在契约)③ gauntlet 波次编排(LW-3 本体·推进层·D5=乙 富路径 live-wire)④ seq1 零战斗(安全首战法则)⑤ boss 缺 combatSetup.enemy 校验挡板 ⑥ enabled 过滤(已满足·runs.js:2615)。E2E 增「保底掉落 + 首战安全 + seq1 零战斗 + raid_stats 清理」断言。
- **✅ 前置动作:07 §0.3 payload 形状批复=通过 + 1 结构修订**(已 send 🧭 转 ⚙️)。核实可消费(runs.js:178-189 落 node.kaleidoEnemy/kaleidoEventDeck)。**修订**:combatSetup.enemy = 权威战斗敌(入关注入·镜像 boss·gauntlet 用作 wave-1 base + params.waves);event_deck 只消费 item_find;请 ⚙️ 移除 seq2/3/5 的 npc_encounter 冗余(否则双刷)。⚙️ 可出 seq3-5 SQL(enabled=false·boss 用乙值)。
- **LW-3 gauntlet 理解(wk93hy7qx·4 map)**：gauntlet 模板 resolveTurn **自带波次逻辑**(combatModes/index.js:116·敌死∧有余波→scale^(w-1) 造下波+waveHeal 续) = **离线 bot sim 路径**;裁决 C 的 LIVE 路径 = 推进层编排富战斗(D5=乙),**不走** resolveTurn。软锁点:advance 重入需先 reset wave/enemy/outcome 才推进,否则 resolveTurn 早返回不变态。gauntlet 未接 live(attackNpc 只有 stance_duel 分支 1822·零 gauntlet 分支)。
- **🔒 DDL(31f5265)**：列级守卫方案已接受(BEFORE 触发器令 ui_unlocks 客户端不可变·kaleido-ui-unlocks-guard.sql);createServerSupabase()=service_role 确认过守卫;06 §4 已更正(public-read 非 owner-read·案②)。执行顺序 🧭 定(🔒 exec DDL+守卫 → 我 Commit B → 🔒 复验),待 🧭 令。
- **下一步**：实现增补工作包(hook ①③④ + gauntlet LW-3 + seq1 零战斗 + boss 校验)——软锁风险类(遭遇/体力/lifecycle 逐条推演),机制对 sampled 关即可 E2E 测(不必等种子关 enable);改状态机必跑 kaleido-e2e。D3/D5 顺延。Commit B(账号持久)待 🧭 DDL 执行令。

## 最近变更（2026-07-07 / 🔧 ▶ 恢复令开工 · KP1-E step 0 ui_unlocks 接口形状定稿）

- **恢复令收讫**：🧭 KP1-R 解禁,rebase 到 `473ddb4`。队列重排:ui_unlocks 提最优先(接口形状=首里程碑,🎨 结构级改造等它),其后 LW-3/D3/D5。
- **✅ 首里程碑达成（已上 main `a06b468`·已 send 🧭 广播 🎨）**：`docs/plan/kaleido/06-ui-unlocks-contract.md` 接口契约定稿。
  - **契约**：持久解锁集 = `room.gamevars.players[uid].uiUnlocks:string[]`(渲染=∈集合即渲染·种子 ["search_btn"]·veteran 继承);瞬态解锁事件 = 信封顶层 `unlockEvents:[{ui_key,nar_line,timing,precedes,seq}]`(否决 gamevars 内嵌=陈旧回放·幂等每键至多一次·多人局仍 {room});账号持久 = `profiles.ui_unlocks` jsonb(否决 player_profile/新表·DDL 待 🔒 审)。
  - **方法**：2 个理解 workflow(5 子系统 map + 5 视角对抗验证)。**确认 blocker(已改契约)**:时序法则——非战斗死亡向量(污染/Ω/收缩)先于 fight_start → **hp_bar 由 fight_start 改挂首次 search/before** + 路由边界无条件求值(死亡回合亦发)。
  - **🎨 stub(5ee35b7)对齐**:stub 与契约高度一致(已预期服务端解锁集+含 nar_line 事件),6 处小校订见 06 §8(最实质=D3 hp_bar 提前到首搜)。
- **待决策(已报 🧭)**：nar_line 存储(A 引擎内联/B content_pool);condition 判据交 ⚙️ 对齐 seq1-2 投放;rules_card/stance_ui P1 DEAD(待 D3/LW-2)。
- **DDL 待审**：`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ui_unlocks JSONB NOT NULL DEFAULT '[]'::jsonb`(🔒 审 owner 不可自改)。
- **✅ Commit A 落地（`ec38ed6` 上 main·运行时机制·无 profiles 依赖）**：
  - `src/lib/server/kaleido/uiUnlocks.js`（12 项触发注册表 + evaluateUnlocks 纯判定 + unlockEvents payload）；`applyKaleidoPostAction`（gameActions.js·route 边界 + E2E act() 单一共享入口·消除分叉）；route.js 信封扩 unlockEvents；createPlayerState 条件展开 uiUnlocks（多人局无字段=严格中性）；startKaleidoRun 种子 `['search_btn']`；E2E +7 断言。
  - **验证：E2E 30/30**（真库·解锁序 + hp_bar 首搜解锁·id 严格先于首 attack·幂等·镜像）+ **build 绿**（next build 全路由·先修 worktree 缺 locatorjs-nextjs-experimental 声明依赖，--no-save 装入 shared node_modules，无 tracked 改动）。
  - **实测修正**：rules_card/stance_ui P1 **即 LIVE**（采样器出非标准 combat_mode·判定读关 node.kaleidoMode）；craft_btn 唯一 P1-DEAD（item kind 判据待接）。契约 06 §2/§7.1/§8 已更。
  - **retry/原子性**：route 的 kaleido 块在 withRetry **之外**（恰一次）+ persist gates emit → L4 double-emit 结构排除。
- **待办**：① **Commit B（账号持久化）阻塞于 🔒 审 `scripts/kaleido-ui-unlocks.sql`**（profiles.ui_unlocks + RLS owner 不可自改）——已报 🧭 路由；② L2/L4 补跑（确认性·非阻塞）；③ 队列续 LW-3 gauntlet / D3 mergeGameRules / D5 R3 seed。
- **环境备忘**：本 worktree 已放 `.env.local`（从 suspicious-solomon 取·gitignored·跑 E2E 用）；E2E 跑法 = 建临时 tsconfig.json(paths @/*→src/*) + `npx --yes tsx scripts/kaleido-e2e.mjs`，跑后删 tsconfig。

## 最近变更（2026-07-07 / 🔧 ⏸ 全局同步点简报锚点 —— 仍停机待命·非恢复令）

- 🧭 简报要点(`e92d0b0` 全局同步点):①KP1-E(LW-3 波次/D3 mergeGameRules/D5 R3 seed)仍有效,恢复后**可能扩编 ui_unlocks**(UI 渐进披露归 🔧:触发判定复用传感层动词·账号级持久化·解锁事件下发·E2E 增解锁序断言,接口形状+12 项 ui_key 见 05 §1);②新增必读:docs/plan/kaleido/05 全文 + 04 §5 软锁教训(自测第一项);③本轨家=Claude/engine/(README+log);④恢复后开工先读 Claude/engine/GPT.md(只读协作接口);⑤若 /compact,以 hub + Claude/engine/ + 03 KP1-E 段 + 05 + 04 重建上下文。本轨状态:干净停点(HEAD=main),继续待命。

> Kanata 暂停令：全轨收敛到安全停止位待命。本轨停点 = `ae5a813`（LW-2 已完整推送·工作区干净·无半成品）。

- **已完成（全部上 main·smoke+build 绿·多人局中性）**：D4 evalFormula 变量注入（`b7d7e2a`）→ D2 combatModes 3 模板×bot（`90e8cf3`·🔒 R1 审通过·两 finding 已修 `207e4e9`）→ D1 采样器正式化（`4422cee`·E2E 20/20）→ LW-1 seq5 boss 投放+BOSS_KILL_LIVE=true（`97f3e32`·软锁修复 `6e129c2`·E2E 23/23）→ **LW-2 stance_duel 接 attackNpc（`ae5a813`·待 🧭 E2E 断言联验）**。
- **下一步（恢复令后）**：LW-3 gauntlet 波次推进层（live-wiring 最后一块）→ D3 mergeGameRules 逐关覆盖 → D5 R3 seed 化 → D6 种子关 12-15 个 + 难度平衡核算（含 🧭 数据点：裸属性玩家 8 拳死于 seq5 boss → 需核 seq1-4 搜刮期望增益 vs boss 强度）。
- **在途等待**：🧭 E2E 加 stance_duel 断言联验 LW-2；🎨 接 stance UI 协议（已发定稿：`{action:'attackNpc', stance:'atk'|'def'|'skill'}`）。

## 最近变更（2026-07-06 / ⚙️ KP0-S 服务端核心全六件：六表+守卫+传感层+run 生命周期+beacon）

> KALEIDO P0 服务端核心（02 §2）交付完毕，全程 `isKaleidoRoom()` 守卫、多人局零行为变化（smoke-check + build 33/33 自证）。六表已由 🔒 审毕应用（`dd17323`）。

- **🎨 接线契约（单人出勤入口卡用）**：`POST /api/kaleido/run`（Bearer 鉴权、无 body）→ `{ roomId, runId }` → 跳 `/game/[roomId]`。幂等：已有 active run 直接返回同一 `{roomId, runId}`。失败 `{ error }` 400。局内放弃 = 走既有 `/api/game/actions` 发 `{ roomId, action: 'abandonRun' }`。kaleido 局判定：`import { isKaleidoRoom } from '@/lib/roomState'`（`room.gametype === KALEIDO_GAME_TYPE = 30`）。
- **run 生命周期**（[gameActions.js](src/lib/server/gameActions.js) 新增）：`startKaleidoRun`（幂等·runs 行 → 采样 5 关落 levels → 建房 gametype=30 + 落座 + startGame → 回填 room_id·失败补偿弃置 run）；`advanceKaleidoProgress`（路由边界每消耗性动作后：turnCount+1 → exit_condition 三型判定 boss_kill/survive_turns/collect → 过关推进/收敛·通关写 `endingResult` 走通用收房·死亡标 runs.status='dead'·域真源 runs/levels 同步 + level_clear/death 事件）；`abandonRun`（分发器动作·显式放弃·关页≠放弃 R11）。
- **P0 极简采样**（[kaleido/runs.js](src/lib/server/kaleido/runs.js) 纯函数·smoke 29/29）：chamber_templates(enabled) 加权 `spawn_weight` 无放回抽 5，**确定性**（mulberry32(hashStr(seed))·同 seed 同序·禁 Math.random）；节点契约逐 key 对齐 pathGenerator（下游搜索/战斗/污染零改动可用）+ 增量 `kaleidoExit`/`levelId`。P0 exit_condition 全部 `survive_turns(2+seq)`（极简采样无法保证 boss 投放；判定器支持三型，P1 战斗模板保证 boss 后 seq=5 换 boss_kill）。
- **传感层**（[kaleido/events.js](src/lib/server/kaleido/events.js) smoke 21/21）：`emitPlayerEvents` 批量 insert + payload 消毒（键≤24/串≤200/剔对象数组）；发射点=**路由边界**（`/api/game/actions` 动作成功后·仅 kaleido 局·仅已映射动词）——sweep/branches 借道属服务端内部绝不经路由，天然满足「只真实动作」（获批语义的实现下移，deathLog.js 零改动：kaleido 死亡全部经动作产生，路由边界必经，death 事件在 advance 收敛点发）。
- **beacon**（[/api/kaleido/beacon](src/app/api/kaleido/beacon/route.js)·待🔒 KP0-X #2 审）：客户端动词白名单（session_end/ui_read_ms/idle_ms/return_latency/hesitation_ms）+ body≤8KB/≤10 事件/ms≤24h 钳制/run_id UUID 形状校验/身份只信 token。
- **守卫补两处**（超出派单 5 处·均中性）：`applyRoomLifecycle` bossDefeated 判胜分支加 `!isKaleidoRoom` 豁免（否则 kaleido 中途击杀 boss 被抢先收房）；`joinRoom` kaleido 局拒他人加入（owner 重进走既有幂等返回）。
- 尚未做（后续）：P0 验收跑通 5 关 run（待 🎨 UI 或中控闸门验收）；KP1-S（正式采样器/3 战斗模板×bot/mergeGameRules 逐关覆盖）。
