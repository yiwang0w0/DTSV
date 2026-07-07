# 📖 剧情轨 · 变更日志(倒序置顶)

## 2026-07-07(深夜)· KP1-R 队列②:N4 种子关文案 seq1-2 首批(对抗验证过)

- 依 🧭 N4 kickoff(先限 seq1-2)+ ⚙️ D6 结构初稿(`06-d6-seed-levels.md` §2/§3 + seed SQL),交付 [`docs/narrative/kaleido-n4-seed-levels-seq1-2.md`](../../docs/narrative/kaleido-n4-seed-levels-seq1-2.md):seq1「外圈·停摆段」(觉醒纯搜索·点亮 log_panel/inventory/craft_btn)+ seq2「往里·承重段」(首次安全战·点亮 hp_bar/combat_panel/rules_card)的 name/description/enter_text/ambient(值班的+留下的字双声线)+ 敌名。
- **敌 id8 描述制无正名**:legacy 名「残响低语」含禁用词「残响」(名随物后·见 3 次才可命名);`combatSetup.enemy.name` 填「那东西」占位**防回落**(留空会漏 `npc_pool.name`)。未来命名 payoff 已登记(seq3+/Kanata 命名)。
- chamber legacy 名(外环-巡查节点/锚点-残响游走区)弃用,kaleido 命名归 📖(⚙️ §8);跨轨注记 5 条(入库字段填法/legacy 名弃用/敌名禁回落 npc_pool/item 名 canon 核/声线分渲结构)。
- **对抗验证**(两镜头 canon):defects-found→折入 4 处 minor/nit(敌名口径统一防回落 / enter_text 登记式 / 残页时态锚点 / 波间去劝慰),禁用词零泄漏 + D6 结构忠实 + N3 咬合 + 硬时序双镜头确认。
- 状态:文案就绪(声线不受引擎接线时序影响);seq1-2 结构侧 `enabled=false` 待 🔧 钩子①(非 📖 阻塞)。seq3-5 文案等 ⚙️ 结构续批。

## 2026-07-07(深夜)· KP1-R 队列①:N3 §1.4 十二项对齐自查(对抗验证过)

- 依 🧭 KP1-R 恢复令 📖 队列①:N3 §1 供稿(原 11 条 nar_line)↔ 05 §1.3 十二项 ui_key 清单逐项对齐。
- **结论:唯一差值 = `convergence`(分类差值非缺口)**——05 §1.3 自标其「不属解锁物」(run 终态常驻页·不经触发浮现),不占 unlock nar_line 槽;其文本已由静态层 §2 收敛页题记 + N2「值班的」末行日志覆盖。已在 [`docs/narrative/kaleido-n3-static-layer.md`](../../docs/narrative/kaleido-n3-static-layer.md) §1 表补第 12 行(标「非解锁物」+ 指针)+ 新增 §1.4 对齐自查小节,12 项 1:1 闭合。
- **timing=before 两条(hp_bar/rules_card)时序措辞复核 = 通过**,措辞已最优不改(改良好文本有回退风险)。
- **对抗验证**(两镜头 supplement-sound):折入 4 处 nit/minor 精度澄清(hp_bar/combat_panel 共用 fight_start 事件 · convergence 收敛页双声线 · **abandon 刻意无值班的末行日志**=系统不为逃兵留档 · turn_counter 时机标「暂取」),**零 nar_line 文本改动**。
- 给下游:convergence 不需解锁触发/持久化接线;abandon 勿按三终态对称落末行日志。队列②(N4 种子关文案)仍等 ⚙️ D6 结构初稿触发;四项 Kanata 挂起决策不阻塞,结局文案维持冻结。

## 2026-07-07(晚) · N3 交付 + narrative-vision.md 正史修订(中控授权)

- [`docs/narrative/kaleido-n3-static-layer.md`](../../docs/narrative/kaleido-n3-static-layer.md):ui_unlocks 全 11 key 的 nar_line 供稿(值班的声线·05 §1.1 形状)+ 静态挂载点 8 处即用文案 + 「引导者/PI/万华镜」替换表(kaleido 面残留极小:仅入口卡标题,过渡文案「单人 · 往里走」;constants 引导者对白池=多人线资产不动、**kaleido 禁止接线复用**)+ 挂载点作者手册。
- [`docs/narrative-vision.md`](../../docs/narrative-vision.md) 按作品正史全面修订:分期改为 起源(序章)+监听/构造/失衡/拓荒/逃逸/深界;**双产品线时间锚**(多人=深界6·当前 / KALEIDO=失衡3);F01-F15 对照表重挂;命名速查表重写;**宪法条款 §6 逐条保留**(6.2 增补 UI 解锁集=持久层、6.4 增补渐进披露时序延伸,均为新机制的条款适用说明,非改动原义)。

### ⚠ 修订对游戏内容的实际影响清单(各轨恢复后消化)

1. **F01-F15 对照表重挂**(仅归属行,零文本改动):F04 封锁纪→**拓荒(4)**;F11 共构(6)→**拓荒(4)**;F06 失衡(4)→**失衡(3)**;F07 →3;F02 →5(起源3末);F10 →3末-4;F12 →4~5;F14 →5;F09 →6;其余不变。
2. **修文候选(待 Kanata 定,走 6.1.5 修文不删片·lore-revision)**:F12「临时编号已持续两个纪元」——按书写于第 5 纪元成立;若残片语境定为第 6,需改「三个纪元」。仅此一处数字级错位。
3. **「引导者」称呼**:多人线(深界)全部正确**不动**;KALEIDO 面禁用,替换表在 N3 §3(实装归 🎨/🔧,一处 UI 标题 + 防误接线注记)。
4. **ver2「终末」vs 根「深界」结局四支不一致**(清算/合流 vs 转化/失败):现行游戏四结局=根目录深界版,归一待 Kanata 钦定;在钦定前**结局相关文案冻结不新增**。
5. **地图/chamber 现有文案**(外环维护廊等,深界视角):多人线不动;KALEIDO 种子关(N4)选用 chamber 时,其 description 若含深界视角表述需按失衡语感重写文案字段(不改表结构,内容层工作,已列入 N4 范围)。
6. dtsv-dev skill 的六纪元摘要与新分期一致,无需改;lore-minimum-viable.md 为多人线(深界)玩家词表,不受本次修订影响。

## 2026-07-07 · KP1-N 首批交付:N1 世界观定稿 v2 + N2 声线小样 v2(Kanata 已定向)

- **正史源确认**:`D:\Fragments\Farstar_Hakodate_作品_20260509` = 唯一正史(六纪元 = 监听/构造/失衡/拓荒/逃逸/深界 + ver2 起源序章·终末;环系继承自灭绝文明非自建)。仓库 `docs/narrative-vision.md` 分期与之不符,分期部分待中控仲裁修订;其宪法条款(additive-evergreen/机制叙事双频道/反FOMO)为治理规则,继续生效。
- **Kanata 定向(拍板级)**:①开局无 UI 只有搜索按钮,UI 渐进丰富 ②世界线=第三纪元(失衡时代) ③玩家不熟知函馆内部构造,探索内部构造与 π-段 ④**写作铁律:别让玩家看不懂,少专有名词**。
- [`docs/narrative/kaleido-n1-worldview.md`](../../docs/narrative/kaleido-n1-worldview.md)(定稿 v2):玩家=**结构工程体**(失衡时代极端状态下封锁控制权逐格授予 = UI 渐进的世界内理由);π-段/Ω-段正史隔离(ver2「Frozen Echo-π」提供字母席位);双层制(驻点持久层+远征生成层);**KALEIDO 玩家不叫「引导者」**(PI 岗位拓荒时代才启用——时代错误勘正,引导者保留给多人线);写作铁律 6 条(专名预算/名随物后/日常词优先/深埋不说/双频道/编号极俭省)。
- [`docs/narrative/kaleido-n2-nar-voice.md`](../../docs/narrative/kaleido-n2-nar-voice.md)(v2):三声线失衡语感+日常词重打——「值班的」(系统冷记录·主)/「墙后的」(稀有插入)/「留下的字」(前人残页·静态素材),游戏内均不署名;待 Kanata 选型微调。
- 下一步:N3 挂载点+`nar_line` 供稿(等 UI 渐进玩法侧拆解)/ N4 种子关文案(等 ⚙️ 结构)。
