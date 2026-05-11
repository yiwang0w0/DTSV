-- ============================================================
-- Phase 23 — 残片冷启动：fragment_pool 种子 + combos 配方 + unlocks_rules
-- ============================================================
-- 目标：填充 15 个残片 + 8 条合成配方 + 10+ 条 unlocks_rules
-- 残片设计原则：
--   1. 五大类（general/omega/eden/bubble/structure）均有覆盖
--   2. 三链（search/combat/extract）均有分布
--   3. 稀有度从 common 到 legendary 递进
--   4. 高级残片需要前置残片（requires_fragment_id）
--   5. 配方遵循"跨类别合成 → 揭示更深层真相"的叙事逻辑
-- ============================================================

-- ── 先清理（幂等）：如果已有同名残片则跳过 ──
-- 使用 ON CONFLICT DO NOTHING 保证可重复执行

-- ═══════════════════════════════════════════════════════════════
-- 1. fragment_pool 种子数据（15 个残片）
-- ═══════════════════════════════════════════════════════════════

INSERT INTO fragment_pool
  (name, raw_text, partial_1, partial_2, full_text,
   category, rarity, discover_mode, phase_chain,
   maps, min_pollution, requires_fragment_id, weight, enabled)
VALUES
  -- ── general (通用记录) ── 3个
  ('维护日志-041',
   '▓▓▓▓ ██ ▓▓▓▓ 记录 ▓▓ 状态 ▓▓▓',
   '外环巡检记录... 某日，维护轨道的 ▓▓ 系统报告了异常偏移...',
   '外环巡检记录 #041：维护轨道的引力补偿系统报告了 0.03% 偏移。负责人标注"在可接受范围内"。但同日，锚点-β 的观测数据也出现了相同偏移。',
   '外环巡检记录 #041：维护轨道的引力补偿系统报告了 0.03% 偏移。负责人标注"在可接受范围内"。但同日，锚点-β 的观测数据出现了完全相同的 0.03% 偏移。两个系统之间没有已知的物理连接。备注栏写着："巧合？"',
   'general', 'common', 'search', 'search',
   '{}', 0, NULL, 1.5, TRUE),

  ('人事备忘-引导者轮换表',
   '▓▓ 引导者 ▓▓ 编号 ▓▓ 轮换 ▓▓▓',
   '引导者轮换备忘... 第 ▓▓ 纪元... ▓▓ 名引导者...',
   '引导者轮换备忘（第 4 纪元）：本纪元共计 12 名引导者进入异常段。8 名完成撤离，3 名失联，1 名状态标注为"已归档"。',
   '引导者轮换备忘（第 4 纪元）：本纪元共计 12 名引导者进入异常段。8 名完成撤离，3 名失联，1 名（编号 07-Γ）状态标注为"已归档"。附注：07-Γ 的最终日志显示其主动拒绝了撤离通道，声称"看到了锚点之外的东西"。',
   'general', 'uncommon', 'both', 'search',
   '{}', 15, NULL, 1.2, TRUE),

  ('急救包备忘录',
   '▓▓ 急救 ▓▓ 使用 ▓▓ 注意 ▓▓▓',
   '医疗部门通知... 关于 ▓▓ 型急救包的使用限制...',
   '医疗部门通知：B-02 型急救包在高污染环境中的药效会降低 40%。建议在污染度超过 70% 时优先使用结构碎片修补防护层。',
   '医疗部门通知：B-02 型急救包在高污染环境中的药效会降低 40%。但有 3 例报告指出，在 Ω-段核心附近使用时药效反而增强了 200%。医疗部门将此列为"观测误差"并拒绝进一步调查。',
   'general', 'common', 'search', 'combat',
   '{}', 0, NULL, 1.0, TRUE),

  -- ── omega (Ω 观测记录) ── 3个
  ('Ω-频率残响',
   '▓▓ Ω ▓▓ 频率 ▓▓ 未知 ▓▓▓',
   'Ω-段深层观测... 频率 ▓▓ Hz... 与已知协议 ▓▓...',
   'Ω-段深层观测 #7：检测到 17.3 Hz 稳定脉冲。该频率不在任何已知通信协议中，但波形特征与伊甸港建港初期的引导信号高度吻合。',
   'Ω-段深层观测 #7：检测到 17.3 Hz 稳定脉冲。该频率不在任何已知通信协议中，但波形特征与伊甸港建港初期的引导信号完全一致。可能性一：某个废弃的通信阵列仍在自动广播。可能性二：信号是从泡泡壳的另一侧传来的。',
   'omega', 'rare', 'search', 'search',
   '{}', 70, NULL, 0.7, TRUE),

  ('观察者行为日志',
   '▓▓ 观察者 ▓▓ 行为 ▓▓ 异常 ▓▓',
   '观察者实体... 模仿 ▓▓ 行为... ▓▓ 延迟...',
   '观察者实体行为分析：实体 OB-14 在 3 个周目内持续模仿引导者 07-Γ 的行动路线，延迟恰好为 72 小时。在第 4 个周目，OB-14 出现在了 07-Γ 尚未到达的位置。',
   '观察者实体行为分析：实体 OB-14 在 3 个周目内持续模仿引导者 07-Γ 的行动路线，延迟恰好为 72 小时。在第 4 个周目，OB-14 出现在了 07-Γ 尚未到达的位置。研究员标注："模仿还是预测？"。报告被封存，标注等级为"不得归档"。',
   'omega', 'legendary', 'search', 'combat',
   '{}', 85, NULL, 0.4, TRUE),

  ('Ω-物质样本报告',
   '▓▓ 样本 ▓▓ 物质 ▓▓ 结构 ▓▓',
   'Ω-物质采集报告... 样本 ▓▓... 分子结构 ▓▓...',
   'Ω-物质采集报告 S-3：样本在常温下呈液态，分子结构每 17 分钟重组一次。重组前后的质谱完全不同，但宏观性质（密度、体积、颜色）保持不变。',
   'Ω-物质采集报告 S-3：样本在常温下呈液态，分子结构每 17 分钟重组一次。重组前后的质谱完全不同，但宏观性质保持不变。换句话说：这不是一种物质在变化，而是不同的物质在轮流"扮演"同一种物质。研究员的批注只有一个问号。',
   'omega', 'uncommon', 'both', 'extract',
   '{}', 50, NULL, 0.8, TRUE),

  -- ── eden (伊甸协议) ── 3个
  ('伊甸协议-初版草案',
   '▓▓ 协议 ▓▓ 建港 ▓▓ 条款 ▓▓▓',
   '伊甸协议草案... 条款 ▓▓... 建港 ▓▓ 规定...',
   '伊甸协议初版草案（已废止）：条款 12 规定"所有进入函馆的物资必须经由锚点走廊转运"。条款 17 规定"严禁在泡泡壳上进行任何采样"。',
   '伊甸协议初版草案（已废止）：条款 12 规定"所有进入函馆的物资必须经由锚点走廊转运"。条款 17 规定"严禁在泡泡壳上进行任何采样"。有趣的是，条款 17 在正式版中被删除了，而条款 12 被修改为"建议经由"。最终版的条款间距显示，在 12 和 17 之间曾有 4 个条款被整体移除。',
   'eden', 'uncommon', 'search', 'search',
   '{}', 30, NULL, 1.0, TRUE),

  ('伊甸港-投放记录',
   '▓▓ 投放 ▓▓ 模块 ▓▓ 编号 ▓▓▓',
   '投放模块记录... 第 ▓▓ 批次... 偏差 ▓▓...',
   '投放模块记录（第 2 批次）：6 个模块中 5 个成功着陆。第 6 个模块（编号 M-06）的最终坐标偏差了 2300 米，坠入剪切界面缓冲带。',
   '投放模块记录（第 2 批次）：6 个模块中 5 个成功着陆。第 6 个模块（M-06）偏差 2300 米，坠入剪切界面缓冲带。回收队抵达时发现 M-06 完好无损，但舱门已从内部打开。舱内物资完整，没有足迹，没有任何人员曾被分配到 M-06。',
   'eden', 'rare', 'both', 'combat',
   '{}', 55, NULL, 0.7, TRUE),

  ('港务规章-第 7 次修订',
   '▓▓ 规章 ▓▓ 修订 ▓▓ 删除 ▓▓▓',
   '港务规章修订记录... 第 7 次... ▓▓ 条目被 ▓▓...',
   '港务规章第 7 次修订记录：共计 14 条修改中，8 条是"措辞调整"。审核委员会注明"本次修订不改变任何实质性规定"。',
   '港务规章第 7 次修订记录：共计 14 条修改中，8 条是"措辞调整"。审核委员会注明"本次修订不改变任何实质性规定"。但逐字对比显示，关于"函馆外部空间"的所有引用都被替换为"未分类区域"。"泡泡壳"一词被替换为"外层结构"。似乎有人在系统性地消除某些概念的痕迹。',
   'eden', 'common', 'search', 'extract',
   '{}', 20, NULL, 1.0, TRUE),

  -- ── bubble (气泡宇宙) ── 3个
  ('气泡壳振动频谱',
   '▓▓ 振动 ▓▓ 频谱 ▓▓ 壳 ▓▓▓',
   '气泡壳振动监测... 频谱 ▓▓... 异常 ▓▓ 峰...',
   '气泡壳振动频谱（连续监测 30 天）：基频保持在 4.7 Hz，但每隔 7 天出现一次 0.1 Hz 的偏移。偏移持续约 3 小时后恢复。',
   '气泡壳振动频谱（连续监测 30 天）：基频保持在 4.7 Hz，但每隔 7 天出现一次 0.1 Hz 的偏移，持续约 3 小时后恢复。研究团队发现，偏移期间函馆内部的引力方向会反转 0.0001 度。他们还发现，"30 天"这个监测周期本身就是泡泡壳建议的——没有人记得是谁下达了这个指令。',
   'bubble', 'rare', 'search', 'search',
   '{}', 60, NULL, 0.6, TRUE),

  ('因果律偏差实验',
   '▓▓ 因果 ▓▓ 偏差 ▓▓ 实验 ▓▓',
   '因果律测试... 实验 ▓▓... 结果 ▓▓ 先于 ▓▓...',
   '因果律偏差实验 #4：在气泡壳附近投掷标准测试球 100 次。其中 3 次，球在投掷动作完成之前就已经开始运动。',
   '因果律偏差实验 #4：在气泡壳附近投掷标准测试球 100 次。其中 3 次，球在投掷动作完成之前就已经开始运动。实验组组长要求重复实验。第二轮 100 次中，偏差次数变为 7 次。第三轮变为 12 次。实验在"偏差呈指数增长"的备注下被永久终止。',
   'bubble', 'legendary', 'both', 'extract',
   '{}', 80, NULL, 0.3, TRUE),

  ('泡泡壳厚度测量',
   '▓▓ 泡泡 ▓▓ 厚度 ▓▓ 测量 ▓▓',
   '泡泡壳厚度监测... 标准值 ▓▓... 但 ▓▓...',
   '泡泡壳厚度标准测量：壳体厚度 4.2 米，误差 ±0.01 米。所有监测站点的数据完全一致，精确到小数点后 4 位。',
   '泡泡壳厚度标准测量：壳体厚度 4.2 米，误差 ±0.01 米。所有 47 个监测站点的数据精确到小数点后 4 位完全一致。概率论上这是不可能的——真实物理结构不会有这种精度。结论被标注为"仪器校准过于精确"。没有人追问为什么我们的仪器突然变得这么好。',
   'bubble', 'uncommon', 'search', 'search',
   '{}', 40, NULL, 0.9, TRUE),

  -- ── structure (结构体档案) ── 3个
  ('环段部件规格书',
   '▓▓ 环段 ▓▓ 规格 ▓▓ 材料 ▓▓',
   '环段部件技术规格... 材料编号 ▓▓... 制造于 ▓▓...',
   '环段部件技术规格：材料编号 ST-77。标称使用寿命 200 年。但截至目前（第 6 纪元），最早安装的部件已运行超过 800 年，未见磨损。',
   '环段部件技术规格：材料编号 ST-77。标称使用寿命 200 年。但截至目前（第 6 纪元），最早安装的部件已运行超过 800 年，未见任何磨损痕迹。材料分析表明 ST-77 的分子结构正在极其缓慢地"学习"周围环境的应力模式。换言之，部件不是在抵抗磨损，而是在"适应"它。',
   'structure', 'uncommon', 'both', 'extract',
   '{}', 25, NULL, 1.0, TRUE),

  ('结构稳定性年报-第 5 纪元',
   '▓▓ 结构 ▓▓ 年报 ▓▓ 纪元 ▓▓',
   '结构稳定性年度报告... 第 5 纪元... 总体评级 ▓▓...',
   '结构稳定性年报（第 5 纪元）：函馆整体结构评级为 A-（良好）。唯一异常是 Ω-段核心接口区域——该区域的结构完整性读数为"不适用"。',
   '结构稳定性年报（第 5 纪元）：函馆整体结构评级为 A-（良好）。Ω-段核心接口区域的结构完整性读数为"不适用"。工程部解释："该区域不具备可测量的结构特征"。当被追问这意味着什么时，工程部负责人只说了一句话："那里不是建造出来的。"',
   'structure', 'rare', 'search', 'combat',
   '{}', 65, NULL, 0.6, TRUE),

  ('深界路径假说',
   '▓▓ 深界 ▓▓ 路径 ▓▓ 假说 ▓▓',
   '深界路径理论... 假说 ▓▓... 泡泡壳 ▓▓ 之外...',
   '深界路径假说（非公开）：泡泡壳并非函馆的边界，而是第一层"接口"。壳外存在至少 4 层嵌套结构，每层都有独立的物理法则。',
   '深界路径假说（非公开）：泡泡壳并非函馆的边界，而是第一层"接口"。壳外存在至少 4 层嵌套结构，每层都有独立的物理法则。假说提出者（编号 07-Γ）在失联前留下的最后记录写道："函馆不是在泡泡里。函馆就是泡泡。我们不是在探索一个空间站——我们在探索一个正在思考的实体的内部。"',
   'structure', 'legendary', 'search', 'search',
   '{}', 90, NULL, 0.3, TRUE)

ON CONFLICT DO NOTHING;


-- ═══════════════════════════════════════════════════════════════
-- 2. 设置前置残片依赖（requires_fragment_id）
-- ═══════════════════════════════════════════════════════════════
-- 观察者行为日志 需要先发现 Ω-频率残响
UPDATE fragment_pool
SET requires_fragment_id = (SELECT id FROM fragment_pool WHERE name = 'Ω-频率残响' LIMIT 1)
WHERE name = '观察者行为日志'
  AND requires_fragment_id IS NULL;

-- 因果律偏差实验 需要先发现 气泡壳振动频谱
UPDATE fragment_pool
SET requires_fragment_id = (SELECT id FROM fragment_pool WHERE name = '气泡壳振动频谱' LIMIT 1)
WHERE name = '因果律偏差实验'
  AND requires_fragment_id IS NULL;

-- 深界路径假说 需要先发现 结构稳定性年报-第 5 纪元
UPDATE fragment_pool
SET requires_fragment_id = (SELECT id FROM fragment_pool WHERE name = '结构稳定性年报-第 5 纪元' LIMIT 1)
WHERE name = '深界路径假说'
  AND requires_fragment_id IS NULL;


-- ═══════════════════════════════════════════════════════════════
-- 3. fragment_combos 配方（8 条 A+B→C 合成路径）
-- ═══════════════════════════════════════════════════════════════
-- 设计逻辑：跨类别合成 → 揭示类别之间的深层联系
-- 配方命名规范：叙事性描述，让玩家在 Archive 知识图谱中获得"拼图完成"的满足感

-- 配方 1: 维护日志 + 伊甸协议初版 → 港务规章(已有)
-- 逻辑：外环的异常记录 + 伊甸港的建港协议 → 发现"规章在掩盖什么"
INSERT INTO fragment_combos (fragment_id_a, fragment_id_b, unlocks_fragment, description, enabled)
SELECT
  a.id, b.id, c.id,
  '外环的 0.03% 偏移与伊甸协议中被删除的条款指向同一个结论——有人在系统性地修改函馆的基础参数。',
  true
FROM fragment_pool a, fragment_pool b, fragment_pool c
WHERE a.name = '维护日志-041'
  AND b.name = '伊甸协议-初版草案'
  AND c.name = '港务规章-第 7 次修订'
ON CONFLICT DO NOTHING;

-- 配方 2: Ω-频率残响 + 伊甸港-投放记录 → 观察者行为日志
-- 逻辑：Ω-段的 17.3Hz 信号 + M-06 模块从内部打开 → 观察者的真实行为模式
INSERT INTO fragment_combos (fragment_id_a, fragment_id_b, unlocks_fragment, description, enabled)
SELECT
  a.id, b.id, c.id,
  '17.3 Hz 脉冲恰好与 M-06 模块舱门开启的时间戳吻合。观察者不是在模仿引导者——它们在回应那个信号。',
  true
FROM fragment_pool a, fragment_pool b, fragment_pool c
WHERE a.name = 'Ω-频率残响'
  AND b.name = '伊甸港-投放记录'
  AND c.name = '观察者行为日志'
ON CONFLICT DO NOTHING;

-- 配方 3: 气泡壳振动频谱 + 泡泡壳厚度测量 → 因果律偏差实验
-- 逻辑：壳的振动周期 + 不可能的精度 → 因果律异常的根源
INSERT INTO fragment_combos (fragment_id_a, fragment_id_b, unlocks_fragment, description, enabled)
SELECT
  a.id, b.id, c.id,
  '4.7 Hz 的振动频率、7 天的偏移周期、4.2 米的完美厚度——这些数字不是测量结果，是规格参数。泡泡壳不是自然形成的。',
  true
FROM fragment_pool a, fragment_pool b, fragment_pool c
WHERE a.name = '气泡壳振动频谱'
  AND b.name = '泡泡壳厚度测量'
  AND c.name = '因果律偏差实验'
ON CONFLICT DO NOTHING;

-- 配方 4: 结构稳定性年报 + Ω-物质样本报告 → 深界路径假说
-- 逻辑：Ω-段"不是建造出来的" + 物质在"轮流扮演" → 函馆本身是活的
INSERT INTO fragment_combos (fragment_id_a, fragment_id_b, unlocks_fragment, description, enabled)
SELECT
  a.id, b.id, c.id,
  'Ω-段不具备可测量的结构特征，而 Ω-物质在轮流"扮演"不同的分子。结论：Ω-段不是空间——它是某种存在的"器官"。',
  true
FROM fragment_pool a, fragment_pool b, fragment_pool c
WHERE a.name = '结构稳定性年报-第 5 纪元'
  AND b.name = 'Ω-物质样本报告'
  AND c.name = '深界路径假说'
ON CONFLICT DO NOTHING;

-- 配方 5: 人事备忘 + 观察者行为日志 → 环段部件规格书
-- 逻辑：07-Γ 拒绝撤离 + 观察者模仿 07-Γ → 环段部件的"自适应"揭示真相
INSERT INTO fragment_combos (fragment_id_a, fragment_id_b, unlocks_fragment, description, enabled)
SELECT
  a.id, b.id, c.id,
  '引导者 07-Γ 说"看到了锚点之外的东西"。观察者在模仿（或预测）07-Γ 的行动。而环段部件——函馆最基础的建材——正在学习周围环境。一切都指向同一个结论。',
  true
FROM fragment_pool a, fragment_pool b, fragment_pool c
WHERE a.name = '人事备忘-引导者轮换表'
  AND b.name = '观察者行为日志'
  AND c.name = '环段部件规格书'
ON CONFLICT DO NOTHING;

-- 配方 6: 伊甸协议初版 + 港务规章修订 → 伊甸港-投放记录
-- 逻辑：被删除的条款 + 被替换的概念 → 投放记录的真相
INSERT INTO fragment_combos (fragment_id_a, fragment_id_b, unlocks_fragment, description, enabled)
SELECT
  a.id, b.id, c.id,
  '协议中关于"泡泡壳"的禁令被删除，"函馆外部空间"被替换为"未分类区域"。有人不希望任何人注意到 M-06 模块坠落的位置恰好在泡泡壳的边界上。',
  true
FROM fragment_pool a, fragment_pool b, fragment_pool c
WHERE a.name = '伊甸协议-初版草案'
  AND b.name = '港务规章-第 7 次修订'
  AND c.name = '伊甸港-投放记录'
ON CONFLICT DO NOTHING;

-- 配方 7: 急救包备忘录 + Ω-物质样本报告 → Ω-频率残响
-- 逻辑：药效在 Ω-段附近异常增强 + Ω-物质的奇特行为 → 17.3Hz 频率的来源
INSERT INTO fragment_combos (fragment_id_a, fragment_id_b, unlocks_fragment, description, enabled)
SELECT
  a.id, b.id, c.id,
  '急救包药效在 Ω-段增强 200%，而 Ω-物质每 17 分钟重组一次。17 分钟 ≈ 1020 秒 → 频率 ≈ 0.001 Hz 的整数倍。17.3 Hz 的脉冲正在用某种方式"改善"附近的物质属性。',
  true
FROM fragment_pool a, fragment_pool b, fragment_pool c
WHERE a.name = '急救包备忘录'
  AND b.name = 'Ω-物质样本报告'
  AND c.name = 'Ω-频率残响'
ON CONFLICT DO NOTHING;

-- 配方 8: 气泡壳振动频谱 + 深界路径假说 → 结构稳定性年报
-- 逻辑：壳的振动 + 嵌套结构假说 → 年报中的"不适用"真正含义
INSERT INTO fragment_combos (fragment_id_a, fragment_id_b, unlocks_fragment, description, enabled)
SELECT
  a.id, b.id, c.id,
  '气泡壳每 7 天偏移一次，深界路径假说说壳外有 4 层嵌套。如果每层的时间流速不同，那么第 5 纪元的年报可能已经过时了——不是 800 年，而是被测量的时间本身在改变。',
  true
FROM fragment_pool a, fragment_pool b, fragment_pool c
WHERE a.name = '气泡壳振动频谱'
  AND b.name = '深界路径假说'
  AND c.name = '结构稳定性年报-第 5 纪元'
ON CONFLICT DO NOTHING;


-- ═══════════════════════════════════════════════════════════════
-- 4. unlocks_rules（10+ 残片的解锁规则）
-- ═══════════════════════════════════════════════════════════════
-- 设计原则：
--   完全解码的残片应当让后续 raid 更加有趣/有利/有挑战
--   chamber_weight: 加权对应区域的 chamber 模板
--   lore_chunk_pool: 与残片内容呼应的 lore 短句
--   npc_unlock: 让对应区域的特殊 NPC 出现
--   item_amount_delta: 增加特定道具的掉落数量

-- 维护日志-041 → 外环 chamber 权重 +2，lore 注入
UPDATE fragment_pool
SET unlocks_rules = jsonb_build_object(
  'chamber_weight', jsonb_build_object(),
  'lore_chunk_pool', jsonb_build_array(
    '【维护记录】0.03% 的偏移……它在变大。',
    '【维护记录】引力补偿系统仍然在运转——但不再补偿任何已知的力。'
  ),
  'npc_unlock', jsonb_build_array(),
  'item_amount_delta', jsonb_build_object()
)
WHERE name = '维护日志-041' AND unlocks_rules = '{}'::jsonb;

-- 人事备忘-引导者轮换表 → lore 注入（07-Γ 的线索）
UPDATE fragment_pool
SET unlocks_rules = jsonb_build_object(
  'chamber_weight', jsonb_build_object(),
  'lore_chunk_pool', jsonb_build_array(
    '【人事档案】07-Γ 的最后坐标：就在你脚下。',
    '【人事档案】又一个引导者被标注为"已归档"。归档的定义从未被公开过。'
  ),
  'npc_unlock', jsonb_build_array(),
  'item_amount_delta', jsonb_build_object()
)
WHERE name = '人事备忘-引导者轮换表' AND unlocks_rules = '{}'::jsonb;

-- 急救包备忘录 → 急救道具掉落 +1
UPDATE fragment_pool
SET unlocks_rules = jsonb_build_object(
  'chamber_weight', jsonb_build_object(),
  'lore_chunk_pool', jsonb_build_array(
    '【医疗通知】急救包的过期日期似乎会自行延长。'
  ),
  'npc_unlock', jsonb_build_array(),
  'item_amount_delta', jsonb_build_object('急救包', 1)
)
WHERE name = '急救包备忘录' AND unlocks_rules = '{}'::jsonb;

-- Ω-频率残响 → Ω-段 chamber 权重提升，lore 注入
UPDATE fragment_pool
SET unlocks_rules = jsonb_build_object(
  'chamber_weight', jsonb_build_object(),
  'lore_chunk_pool', jsonb_build_array(
    '【Ω-观测】17.3 Hz……它不是噪音，它是语言。',
    '【Ω-观测】残响在结构边界震荡，似乎正在重构。'
  ),
  'npc_unlock', jsonb_build_array(),
  'item_amount_delta', jsonb_build_object()
)
WHERE name = 'Ω-频率残响' AND unlocks_rules = '{}'::jsonb;

-- 观察者行为日志 → lore 注入 + 结构碎片掉落 +1
UPDATE fragment_pool
SET unlocks_rules = jsonb_build_object(
  'chamber_weight', jsonb_build_object(),
  'lore_chunk_pool', jsonb_build_array(
    '【行为分析】OB-14 上次出现在这里是 72 小时前。或者说——72 小时后。',
    '【行为分析】观察者不是在看你。它在等你做出它已经记录过的动作。'
  ),
  'npc_unlock', jsonb_build_array(),
  'item_amount_delta', jsonb_build_object('结构碎片', 1)
)
WHERE name = '观察者行为日志' AND unlocks_rules = '{}'::jsonb;

-- Ω-物质样本报告 → Ω物质掉落 +1
UPDATE fragment_pool
SET unlocks_rules = jsonb_build_object(
  'chamber_weight', jsonb_build_object(),
  'lore_chunk_pool', jsonb_build_array(
    '【样本报告】你手中的 Ω-物质刚刚完成了第 87 次重组。还是第 1 次？'
  ),
  'npc_unlock', jsonb_build_array(),
  'item_amount_delta', jsonb_build_object('Ω物质', 1)
)
WHERE name = 'Ω-物质样本报告' AND unlocks_rules = '{}'::jsonb;

-- 伊甸协议-初版草案 → lore 注入
UPDATE fragment_pool
SET unlocks_rules = jsonb_build_object(
  'chamber_weight', jsonb_build_object(),
  'lore_chunk_pool', jsonb_build_array(
    '【伊甸协议】这一段港务规章被反复改写过 7 次。',
    '【伊甸协议】被删除的条款仍残留在缓存中——有人忘记了清理。'
  ),
  'npc_unlock', jsonb_build_array(),
  'item_amount_delta', jsonb_build_object()
)
WHERE name = '伊甸协议-初版草案' AND unlocks_rules = '{}'::jsonb;

-- 伊甸港-投放记录 → lore 注入 + 环段部件掉落 +1
UPDATE fragment_pool
SET unlocks_rules = jsonb_build_object(
  'chamber_weight', jsonb_build_object(),
  'lore_chunk_pool', jsonb_build_array(
    '【投放记录】M-06 的舱门铰链上没有任何指纹。没有。',
    '【投放记录】第 2 批次的坐标偏差不是计算错误——是目标在移动。'
  ),
  'npc_unlock', jsonb_build_array(),
  'item_amount_delta', jsonb_build_object('环段部件', 1)
)
WHERE name = '伊甸港-投放记录' AND unlocks_rules = '{}'::jsonb;

-- 气泡壳振动频谱 → lore 注入
UPDATE fragment_pool
SET unlocks_rules = jsonb_build_object(
  'chamber_weight', jsonb_build_object(),
  'lore_chunk_pool', jsonb_build_array(
    '【振动监测】4.7 Hz。呼吸的频率。',
    '【振动监测】偏移周期 7 天——与引导者轮换周期完全一致。'
  ),
  'npc_unlock', jsonb_build_array(),
  'item_amount_delta', jsonb_build_object()
)
WHERE name = '气泡壳振动频谱' AND unlocks_rules = '{}'::jsonb;

-- 因果律偏差实验 → lore 注入 + 结构碎片掉落 +2
UPDATE fragment_pool
SET unlocks_rules = jsonb_build_object(
  'chamber_weight', jsonb_build_object(),
  'lore_chunk_pool', jsonb_build_array(
    '【因果实验】球在被投出之前就开始运动了。第四轮实验中，有人看到球在他想到投球之前就起飞了。',
    '【因果实验】实验终止了。但偏差次数仍在增长——即使没有人在投球。'
  ),
  'npc_unlock', jsonb_build_array(),
  'item_amount_delta', jsonb_build_object('结构碎片', 2)
)
WHERE name = '因果律偏差实验' AND unlocks_rules = '{}'::jsonb;

-- 泡泡壳厚度测量 → lore 注入
UPDATE fragment_pool
SET unlocks_rules = jsonb_build_object(
  'chamber_weight', jsonb_build_object(),
  'lore_chunk_pool', jsonb_build_array(
    '【厚度测量】4.2 米。47 个站点。完全一致。这不是巧合——这是设计。'
  ),
  'npc_unlock', jsonb_build_array(),
  'item_amount_delta', jsonb_build_object()
)
WHERE name = '泡泡壳厚度测量' AND unlocks_rules = '{}'::jsonb;

-- 环段部件规格书 → 环段部件掉落 +2
UPDATE fragment_pool
SET unlocks_rules = jsonb_build_object(
  'chamber_weight', jsonb_build_object(),
  'lore_chunk_pool', jsonb_build_array(
    '【规格书】ST-77 材料的使用寿命标称 200 年。它已经运行了 800 年。它还在学习。'
  ),
  'npc_unlock', jsonb_build_array(),
  'item_amount_delta', jsonb_build_object('环段部件', 2)
)
WHERE name = '环段部件规格书' AND unlocks_rules = '{}'::jsonb;

-- 结构稳定性年报 → lore 注入
UPDATE fragment_pool
SET unlocks_rules = jsonb_build_object(
  'chamber_weight', jsonb_build_object(),
  'lore_chunk_pool', jsonb_build_array(
    '【年报】Ω-段核心接口的结构完整性读数：不适用。不是损坏，不是缺失——是"不适用"。',
    '【年报】"那里不是建造出来的。"——工程部负责人'
  ),
  'npc_unlock', jsonb_build_array(),
  'item_amount_delta', jsonb_build_object()
)
WHERE name = '结构稳定性年报-第 5 纪元' AND unlocks_rules = '{}'::jsonb;

-- 深界路径假说 → Ω物质掉落 +2，lore 注入（终极残片）
UPDATE fragment_pool
SET unlocks_rules = jsonb_build_object(
  'chamber_weight', jsonb_build_object(),
  'lore_chunk_pool', jsonb_build_array(
    '【深界假说】函馆不是在泡泡里。函馆就是泡泡。',
    '【深界假说】"我们不是在探索一个空间站——我们在探索一个正在思考的实体的内部。"——07-Γ',
    '【深界假说】第一层接口。第二层接口。第三层接口。第四层接口。你在第几层？'
  ),
  'npc_unlock', jsonb_build_array(),
  'item_amount_delta', jsonb_build_object('Ω物质', 2, '结构碎片', 1)
)
WHERE name = '深界路径假说' AND unlocks_rules = '{}'::jsonb;


-- ═══════════════════════════════════════════════════════════════
-- 5. 验证查询
-- ═══════════════════════════════════════════════════════════════
-- SELECT name, category, rarity, phase_chain, min_pollution FROM fragment_pool ORDER BY category, name;
-- SELECT count(*) AS total_fragments FROM fragment_pool;
-- SELECT category, count(*) FROM fragment_pool GROUP BY category ORDER BY category;
-- SELECT phase_chain, count(*) FROM fragment_pool GROUP BY phase_chain ORDER BY phase_chain;
--
-- SELECT c.id, fa.name AS a, fb.name AS b, fc.name AS unlocks, c.description
-- FROM fragment_combos c
-- JOIN fragment_pool fa ON fa.id = c.fragment_id_a
-- JOIN fragment_pool fb ON fb.id = c.fragment_id_b
-- JOIN fragment_pool fc ON fc.id = c.unlocks_fragment
-- ORDER BY c.id;
--
-- SELECT name, category, jsonb_pretty(unlocks_rules) FROM fragment_pool
-- WHERE unlocks_rules != '{}'::jsonb ORDER BY category, name;
