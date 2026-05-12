-- ============================================================
-- Phase 24a — 残片 lore 重写：F01-F15 + 8 配方
-- ============================================================
-- 目标：用六纪元设定文档的史实重写 Phase 23 凭空编造的 15 残片
-- 史实主线：Ω-段诞生（失衡时代）→ 伊甸港封锁 → D-8821 逃逸 →
--           PI-1 探针 → Ω-段分类失败 → 共构本质 → 深界路径暴露
--
-- 文案风格规则（lore-minimum-viable.md）：
--   - 不解释只描述
--   - 泡层叫"泡泡"，壳体叫"泡泡壳"
--   - 早期不提"文明""纪元""实验"等概念
--   - 短句 > 长句，技术编号零星出现不解释
--
-- 幂等设计：先 DELETE Phase 23 残片 + combos + player_fragments，再 INSERT
-- 已部署 Phase 23 的环境跑此 SQL 会无损升级到 Phase 24a 数据
-- ============================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- Step 0: 防御性 schema 检查（如果 Phase 18.1 / Phase 20.1 未运行则补齐）
-- ═══════════════════════════════════════════════════════════════

-- Phase 18.1 残片三链字段
ALTER TABLE fragment_pool
  ADD COLUMN IF NOT EXISTS phase_chain TEXT NOT NULL DEFAULT 'search';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fragment_pool_phase_chain_check'
  ) THEN
    ALTER TABLE fragment_pool
      ADD CONSTRAINT fragment_pool_phase_chain_check
      CHECK (phase_chain IN ('search', 'combat', 'extract'));
  END IF;
END $$;

-- Phase 20.1 残片解锁规则字段
ALTER TABLE fragment_pool
  ADD COLUMN IF NOT EXISTS unlocks_rules JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Phase 20.4 残片合成配方表（如果不存在则建表）
CREATE TABLE IF NOT EXISTS fragment_combos (
  id                 BIGSERIAL PRIMARY KEY,
  fragment_id_a      INTEGER NOT NULL,
  fragment_id_b      INTEGER NOT NULL,
  unlocks_fragment   INTEGER NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  enabled            BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fragment_combos_unique UNIQUE (fragment_id_a, fragment_id_b, unlocks_fragment),
  CONSTRAINT fragment_combos_ne CHECK (fragment_id_a != unlocks_fragment AND fragment_id_b != unlocks_fragment)
);

CREATE INDEX IF NOT EXISTS fragment_combos_lookup_idx
  ON fragment_combos(fragment_id_a, fragment_id_b)
  WHERE enabled = true;

CREATE INDEX IF NOT EXISTS fragment_combos_target_idx
  ON fragment_combos(unlocks_fragment)
  WHERE enabled = true;

-- ═══════════════════════════════════════════════════════════════
-- Step 1: 清理 Phase 23 数据
-- ═══════════════════════════════════════════════════════════════

-- 1.1 清理 player_fragments（玩家解码记录）— 玩家进度会随老残片删除而清空
DELETE FROM player_fragments
WHERE fragment_id IN (
  SELECT id FROM fragment_pool WHERE name IN (
    '维护日志-041','人事备忘-引导者轮换表','急救包备忘录',
    'Ω-频率残响','观察者行为日志','Ω-物质样本报告',
    '伊甸协议-初版草案','伊甸港-投放记录','港务规章-第 7 次修订',
    '气泡壳振动频谱','因果律偏差实验','泡泡壳厚度测量',
    '环段部件规格书','结构稳定性年报-第 5 纪元','深界路径假说'
  )
);

-- 1.2 清理 fragment_combos（合成配方）
DELETE FROM fragment_combos
WHERE fragment_id_a IN (SELECT id FROM fragment_pool WHERE name IN (
    '维护日志-041','人事备忘-引导者轮换表','急救包备忘录',
    'Ω-频率残响','观察者行为日志','Ω-物质样本报告',
    '伊甸协议-初版草案','伊甸港-投放记录','港务规章-第 7 次修订',
    '气泡壳振动频谱','因果律偏差实验','泡泡壳厚度测量',
    '环段部件规格书','结构稳定性年报-第 5 纪元','深界路径假说'
  ))
   OR fragment_id_b IN (SELECT id FROM fragment_pool WHERE name IN (
    '维护日志-041','人事备忘-引导者轮换表','急救包备忘录',
    'Ω-频率残响','观察者行为日志','Ω-物质样本报告',
    '伊甸协议-初版草案','伊甸港-投放记录','港务规章-第 7 次修订',
    '气泡壳振动频谱','因果律偏差实验','泡泡壳厚度测量',
    '环段部件规格书','结构稳定性年报-第 5 纪元','深界路径假说'
  ))
   OR unlocks_fragment IN (SELECT id FROM fragment_pool WHERE name IN (
    '维护日志-041','人事备忘-引导者轮换表','急救包备忘录',
    'Ω-频率残响','观察者行为日志','Ω-物质样本报告',
    '伊甸协议-初版草案','伊甸港-投放记录','港务规章-第 7 次修订',
    '气泡壳振动频谱','因果律偏差实验','泡泡壳厚度测量',
    '环段部件规格书','结构稳定性年报-第 5 纪元','深界路径假说'
  ));

-- 1.3 清理 fragment_pool（残片表）
DELETE FROM fragment_pool WHERE name IN (
  '维护日志-041','人事备忘-引导者轮换表','急救包备忘录',
  'Ω-频率残响','观察者行为日志','Ω-物质样本报告',
  '伊甸协议-初版草案','伊甸港-投放记录','港务规章-第 7 次修订',
  '气泡壳振动频谱','因果律偏差实验','泡泡壳厚度测量',
  '环段部件规格书','结构稳定性年报-第 5 纪元','深界路径假说'
);

-- 同时清理可能已部分插入的 F01-F15（重复执行幂等）
DELETE FROM player_fragments WHERE fragment_id IN (SELECT id FROM fragment_pool WHERE name LIKE 'F0%' OR name LIKE 'F1%');
DELETE FROM fragment_combos WHERE fragment_id_a IN (SELECT id FROM fragment_pool WHERE name LIKE 'F0%' OR name LIKE 'F1%')
   OR fragment_id_b IN (SELECT id FROM fragment_pool WHERE name LIKE 'F0%' OR name LIKE 'F1%')
   OR unlocks_fragment IN (SELECT id FROM fragment_pool WHERE name LIKE 'F0%' OR name LIKE 'F1%');
DELETE FROM fragment_pool WHERE name LIKE 'F0%' OR name LIKE 'F1%';

-- ═══════════════════════════════════════════════════════════════
-- Step 2: 插入 15 个新残片 F01-F15（requires_fragment_id 留空，第 3 步补）
-- ═══════════════════════════════════════════════════════════════

INSERT INTO fragment_pool
  (name, raw_text, partial_1, partial_2, full_text,
   category, rarity, discover_mode, phase_chain,
   min_pollution, weight, enabled, unlocks_rules)
VALUES

-- ── 早期残片（5 个）— general + structure ────────────────────────

-- F01 外环巡检单-第17段（巡检发现的"不归我们管"）
('F01 外环巡检单-第17段',
 '▓▓ 巡检 ▓▓ 第17段 ▓▓ 状态 ▓▓▓',
 '外环维护廊巡检单... 第 17 段... 结构完整性 ▓▓%...',
 '外环维护廊巡检单（第 17 段）：结构完整性 41%。主锚连接状态：离线。备注栏只有一行字："不归我们管。"',
 '外环维护廊巡检单（第 17 段）：结构完整性 41%。主锚连接状态：离线。供能仍在持续但来源无法确定。备注栏只有一行字："不归我们管。"该段结构已从所有常规巡检路线中移除，标注日期早于当前纪元。',
 'general', 'common', 'search', 'search',
 0, 1.5, TRUE,
 jsonb_build_object(
   'chamber_weight', jsonb_build_object(),
   'lore_chunk_pool', jsonb_build_array(
     '巡检表上有一行被涂改过的小字：第 17 段。',
     '通道尽头有一道焊缝，缝两侧的金属配色不一样。'
   ),
   'npc_unlock', jsonb_build_array(),
   'item_amount_delta', jsonb_build_object()
 )),

-- F02 锚点-β 校准日志（空锚运行）
('F02 锚点-β 校准日志',
 '▓▓ 锚点 ▓▓ 校准 ▓▓ 异常 ▓▓▓',
 'Anchor-β 校准记录... 偏差 ▓▓... 已标记...',
 'Anchor-β 校准记录：锚点结构持续输出稳定信号，但目标挂载物已不存在。系统判定为"空锚运行"，建议关闭。',
 'Anchor-β 校准记录：锚点结构持续输出稳定信号，但目标挂载物已不存在。系统判定为"空锚运行"，建议关闭。关闭指令已提交 14 次，均被主控驳回。驳回理由：该锚点仍在被某结构引用。引用源：未归档路径。',
 'structure', 'common', 'search', 'search',
 0, 1.5, TRUE,
 jsonb_build_object(
   'chamber_weight', jsonb_build_object(),
   'lore_chunk_pool', jsonb_build_array(
     '锚点指示灯仍在闪——没人记得它在挂着什么。',
     '设备日志写着 14 次驳回，没有一条解释驳回理由。'
   ),
   'npc_unlock', jsonb_build_array(),
   'item_amount_delta', jsonb_build_object()
 )),

-- F03 结构修复包使用规程（泡泡壳粘合反应）
('F03 结构修复包使用规程',
 '▓▓ 修复 ▓▓ 使用 ▓▓ 注意 ▓▓▓',
 '标准修复包使用规程... 适用区域 ▓▓... 注意事项 ▓▓...',
 '标准修复包使用规程：适用于所有常规环段。注意：在泡泡壳覆盖区域使用时，修复材料可能与壳体产生粘合反应，请勿尝试分离。',
 '标准修复包使用规程：适用于所有常规环段。注意：在泡泡壳覆盖区域使用时，修复材料可能与壳体产生粘合反应，请勿尝试分离。附录更新：部分区段报告修复材料被壳体"吸收"后原地生长出新结构。工程部未确认该现象。',
 'general', 'common', 'combat', 'search',
 0, 1.3, TRUE,
 jsonb_build_object(
   'chamber_weight', jsonb_build_object(),
   'lore_chunk_pool', jsonb_build_array(
     '修复包标签底下贴着一张未签名的便利贴："别碰壳的部分。"'
   ),
   'npc_unlock', jsonb_build_array(),
   'item_amount_delta', jsonb_build_object('急救包', 1)
 )),

-- F04 人员调度令-PI 序列启用
('F04 人员调度令-PI 序列启用',
 '▓▓ 调度 ▓▓ PI ▓▓ 启用 ▓▓▓',
 '人员调度令... PI 序列... 异常段 ▓▓ 优先...',
 '人员调度令：启用 PI 序列岗位（Pioneer Interface Operator）。部署目标：17 号异常段边界路径。任务级别：结构最高优先。',
 '人员调度令：启用 PI 序列岗位（Pioneer Interface Operator）。部署目标：17 号异常段边界路径。任务级别：结构最高优先。备注：PI 引导者不具备主控访问权限，不知晓 MPF 系统存在，不了解泡层原始用途。这是设计要求，不是权限疏漏。',
 'general', 'uncommon', 'search', 'search',
 15, 1.2, TRUE,
 jsonb_build_object(
   'chamber_weight', jsonb_build_object(),
   'lore_chunk_pool', jsonb_build_array(
     '调度单底部一行小字：你不需要知道为什么。',
     '岗位编号 PI 序列，前 13 位的人事档案均显示"已归档"。'
   ),
   'npc_unlock', jsonb_build_array(),
   'item_amount_delta', jsonb_build_object()
 )),

-- F05 外环结构应力图（反向应力源）
('F05 外环结构应力图',
 '▓▓ 应力 ▓▓ 分布 ▓▓ 异常 ▓▓▓',
 '环结构应力分布图... 第 17 段... 集中于 ▓▓...',
 '环结构应力分布图：第 17 段整体应力偏向黑洞方向，但在段末出现一个反向应力源。该应力源不在任何结构清单中。',
 '环结构应力分布图：第 17 段整体应力偏向黑洞方向（正常引力牵引），但在段末出现一个反向应力源，其张力恰好抵消了该区域的引力坍缩趋势。系统标注：该应力源不在任何结构清单中，来源为"泡层壳体逆向张力"。没有泡层被分配到此位置。',
 'structure', 'uncommon', 'extract', 'extract',
 20, 1.0, TRUE,
 jsonb_build_object(
   'chamber_weight', jsonb_build_object(),
   'lore_chunk_pool', jsonb_build_array(
     '应力图上有一道额外的线，没人画过，但它每次刷新都在。'
   ),
   'npc_unlock', jsonb_build_array(),
   'item_amount_delta', jsonb_build_object()
 )),

-- ── 中期残片（5 个）— eden + structure ──────────────────────────

-- F06 伊甸港-3号干道事故摘要（共构起源）
('F06 伊甸港-3号干道事故摘要',
 '▓▓ 伊甸 ▓▓ 事故 ▓▓ 干道 ▓▓▓',
 '伊甸港事故报告... 3 号干道... 主锚 ▓▓ 未响应...',
 '伊甸港事故摘要：高密度投放周期中，3 号干道主锚未响应同步指令。结构失衡波及环带四分之一区块。坍陷趋势已终止，原因待定。',
 '伊甸港事故摘要：高密度投放周期中，12 组泡层同时部署，3 号干道主锚未响应同步指令。十秒内结构失衡波及环带四分之一区块，整片平台滑入剪切界面边缘。所有预测模型给出同一结果：这段环不可能留下来。但它留下来了。因为那些还没部署完的泡层壳体自动展开，在错误的位置包覆了错误的东西——主环自身。',
 'eden', 'uncommon', 'search', 'search',
 35, 1.0, TRUE,
 jsonb_build_object(
   'chamber_weight', jsonb_build_object(),
   'lore_chunk_pool', jsonb_build_array(
     '事故记录里有一句话被划掉重写过 3 次："它留下来了。"',
     '"十秒"，事故报告里这个数字被特意加粗。',
     '没有人写出"主锚为什么没响应"——那一栏是空的。'
   ),
   'npc_unlock', jsonb_build_array(),
   'item_amount_delta', jsonb_build_object()
 )),

-- F07 伊甸港封锁令（依赖 F06）
('F07 伊甸港封锁令',
 '▓▓ 封锁 ▓▓ 伊甸 ▓▓ 冻结 ▓▓▓',
 '伊甸港封锁通知... 全面冻结... 投放模块 ▓▓...',
 '伊甸港封锁令：所有投放模块进入重检状态。泡层投放计划全面冻结。回响归档模块转入低频记录。所有新增节点编号生成指令挂起。',
 '伊甸港封锁令：所有投放模块进入重检状态。泡层投放计划全面冻结。回响归档模块转入低频记录。所有新增节点编号生成指令挂起。系统没有宣布紧急状态，但一切行为都收缩了。它不是在修复——它是在确认自己还完整。伊甸港出口区域已被泡泡壳体整体包覆，无法进入。',
 'eden', 'rare', 'combat', 'combat',
 50, 0.8, TRUE,
 jsonb_build_object(
   'chamber_weight', jsonb_build_object(),
   'lore_chunk_pool', jsonb_build_array(
     '伊甸港的出口标识仍亮着，但门后是一整片半透明的壳。',
     '"它不是在修复——它是在确认自己还完整。"'
   ),
   'npc_unlock', jsonb_build_array(),
   'item_amount_delta', jsonb_build_object('环段部件', 1)
 )),

-- F08 D-8821 追踪记录
('F08 D-8821 追踪记录',
 '▓▓ D-8821 ▓▓ 追踪 ▓▓ 逃逸 ▓▓',
 '泡层编号 D-8821... 预期终点... ▓▓ 未到达...',
 '泡层 D-8821 追踪记录：该泡层拖延至预期终点边界，由 Anchor-β 残存锚点吊挂。预定自动解链坠落。但锚点结构与附近区域残余耦合机制产生交叠。系统将其误归入某条托管路径。',
 '泡层 D-8821 追踪记录：该泡层由 Anchor-β 残存锚点吊挂，预定下一周期解链坠落。但 Ω-段在周边释放的非稳定扰动导致锚点结构交叠，系统错误将其归入"Ω-段托管路径"，并在崩解前写入主控结构图。伊甸港旧 3 号通道短暂激活。泡层并未终结——它逃逸进入了系统内部。',
 'structure', 'rare', 'search', 'search',
 55, 0.8, TRUE,
 jsonb_build_object(
   'chamber_weight', jsonb_build_object(),
   'lore_chunk_pool', jsonb_build_array(
     '一个本该消失的编号，仍在系统路径图里闪烁。',
     'D-8821——这个编号被标记为"已坠落"，但仍在主控的引用列表里。'
   ),
   'npc_unlock', jsonb_build_array(),
   'item_amount_delta', jsonb_build_object()
 )),

-- F09 入侵者编号伪造分析
('F09 入侵者编号伪造分析',
 '▓▓ 入侵 ▓▓ 编号 ▓▓ 伪造 ▓▓',
 '实体分析... 编号格式 ▓▓... 与标准 ▓▓ 不符...',
 '入侵实体编号分析：多个实体携带类似引导者编号的标识，但格式细节与平台标准不符。这些编号不是复制的——是用另一套规则生成的。',
 '入侵实体编号分析：多个实体携带类似引导者编号的标识，但格式细节与平台标准不符。进一步分析显示，这些编号的生成逻辑与泡层内部的文明编号体系一致。它们不是在伪装成引导者——它们用自己文明的方式给自己编了号，恰好和我们的格式相似。它们有自己的系统。',
 'eden', 'uncommon', 'combat', 'combat',
 40, 1.0, TRUE,
 jsonb_build_object(
   'chamber_weight', jsonb_build_object(),
   'lore_chunk_pool', jsonb_build_array(
     '它的胸口印着一串数字，格式和我们的引导者编号几乎一致。',
     '"它们用自己文明的方式给自己编了号。"'
   ),
   'npc_unlock', jsonb_build_array(),
   'item_amount_delta', jsonb_build_object()
 )),

-- F10 剪切带结构变形报告
('F10 剪切带结构变形报告',
 '▓▓ 剪切 ▓▓ 变形 ▓▓ 报告 ▓▓',
 '剪切界面结构报告... 变形率 ▓▓... 非正常...',
 '剪切界面缓冲带变形报告：墙面出现缓慢拉伸现象。变形方向不是朝向黑洞，而是朝向 Ω-段。引力波间歇归零。',
 '剪切界面缓冲带变形报告：墙面出现缓慢拉伸现象，变形方向不是朝向黑洞而是朝向 Ω-段。引力波每隔数小时短暂归零——这些"静默窗口"与 Ω-段活跃区的扰动释放周期吻合。系统判断：Ω-段正在对周边结构施加非引力性牵引。不是在拉，是在"接入"。',
 'structure', 'uncommon', 'extract', 'extract',
 45, 1.0, TRUE,
 jsonb_build_object(
   'chamber_weight', jsonb_build_object(),
   'lore_chunk_pool', jsonb_build_array(
     '墙面慢慢凸起，凸的方向不对——不是朝黑洞，而是朝里面。'
   ),
   'npc_unlock', jsonb_build_array(),
   'item_amount_delta', jsonb_build_object('结构碎片', 1)
 )),

-- ── 后期残片（5 个）— omega ───────────────────────────────────

-- F11 PI-1 探针部署记录（"它还在发生中"）
('F11 PI-1 探针部署记录',
 '▓▓ PI-1 ▓▓ 探针 ▓▓ 部署 ▓▓',
 'PI-1 探测报告... 靠近 Ω-段... 六十周期... ▓▓...',
 'PI-1 探针部署记录：使用低权限观测单元进入 Ω-段边界。靠近进行了六十周期。未观测到编码信号。结构未打断，通道未被拒。',
 'PI-1 探针部署记录：使用低权限观测单元进入 Ω-段边界。靠近进行了六十周期，未观测到编码信号，但结构未打断，通道未被拒。第二批探针尝试建立查询路径和数据转换模型，结果不一致——每次回应的结构顺序都不一样，排列方式会变动，从不重复前一次的样子。系统备注只有一行："它还在发生中。"',
 'omega', 'rare', 'search', 'search',
 65, 0.7, TRUE,
 jsonb_build_object(
   'chamber_weight', jsonb_build_object(),
   'lore_chunk_pool', jsonb_build_array(
     '每次返回的数据排列都不一样，没有一次是重复的。',
     '系统备注栏只写了五个字："它还在发生中。"',
     '探针送回的是结构，不是信号。'
   ),
   'npc_unlock', jsonb_build_array(),
   'item_amount_delta', jsonb_build_object()
 )),

-- F12 Ω-段结构分类报告（依赖 F06）
('F12 Ω-段结构分类报告',
 '▓▓ Ω-段 ▓▓ 分类 ▓▓ 失败 ▓▓',
 'Ω-段结构分类... 尝试 ▓▓ 次... 结果 ▓▓...',
 'Ω-段结构分类报告：结构中包含主环带碎片、伊甸平台构件、未编号泡层核心模块。供能持续但来源不明。表面结构不断缓慢变化。无法读取、无法重建、无法接入。',
 'Ω-段结构分类报告：结构中包含主环带碎片、伊甸平台构件、未编号泡层核心模块。扰动链尚未终止，供能仍在持续。表面结构不断缓慢变化，无法读取、无法重建、也无法接入。它不是平台残骸，也不是泡层，更不是任何归档系统能识别的对象。但它稳定。未扩散，未崩解，就这样停在剪切界面边缘。系统为它分配了临时编号——这个"临时"已经持续了两个纪元。',
 'omega', 'rare', 'combat', 'combat',
 75, 0.6, TRUE,
 jsonb_build_object(
   'chamber_weight', jsonb_build_object(),
   'lore_chunk_pool', jsonb_build_array(
     '"临时编号"已经持续了两个纪元，没人记得它原本要被替换成什么。',
     '它不是任何归档系统能识别的对象，但它稳定。'
   ),
   'npc_unlock', jsonb_build_array(),
   'item_amount_delta', jsonb_build_object('Ω物质', 1)
 )),

-- F13 共构扰动样本分析（依赖 F12，传说级）
('F13 共构扰动样本分析',
 '▓▓ 共构 ▓▓ 扰动 ▓▓ 样本 ▓▓',
 '共构扰动样本... Ω-段核心... ▓▓ 与 ▓▓ 在此共构...',
 'Ω-段共构扰动样本：采样点位于泡泡壳与平台结构融合最紧密的区域。样本同时具备泡层材料和主环材料的特征，但不是简单混合——两种结构在分子级别互相嵌入。',
 'Ω-段共构扰动样本：采样点位于泡泡壳与平台结构融合最紧密的区域。样本同时具备泡层材料和主环材料的特征，但不是简单混合——两种结构在分子级别互相嵌入，形成了一种不属于任何一方的新结构。Ω-段不是泡层包覆了平台。也不是平台吞噬了泡层。它是两者在一次错误中共同生成的第三种东西。没有人设计它，它自己就这样出现了。',
 'omega', 'legendary', 'extract', 'extract',
 85, 0.4, TRUE,
 jsonb_build_object(
   'chamber_weight', jsonb_build_object(),
   'lore_chunk_pool', jsonb_build_array(
     '"第三种东西"——分析员在样本旁画了一个圈，没写注释。',
     '没有人设计它。它自己就这样出现了。'
   ),
   'npc_unlock', jsonb_build_array(),
   'item_amount_delta', jsonb_build_object('Ω物质', 2, '结构碎片', 1)
 )),

-- F14 路径污染源标记清单
('F14 路径污染源标记清单',
 '▓▓ 路径 ▓▓ 污染 ▓▓ 标记 ▓▓',
 '路径污染源清单... Echo-γ 记录... ▓▓ 被设为污染源...',
 '路径污染源标记清单：所有涉及泡层编号或路径重写的 Echo-γ 记录片段已被设为"结构污染源"。系统路径图首次出现"不可确定归属段"。',
 '路径污染源标记清单：所有涉及泡层编号或路径重写的 Echo-γ 记录片段已被设为"结构污染源"。Anchor-β 路径逻辑反向激活，重复请求主控参数。伊甸港路径结构图短暂出现动态重排。这不是泡层返回的信息——这是泡层正在系统内部运行的反馈。我们自己造出的东西，越过了我们设下的终点。',
 'omega', 'rare', 'search', 'search',
 70, 0.6, TRUE,
 jsonb_build_object(
   'chamber_weight', jsonb_build_object(),
   'lore_chunk_pool', jsonb_build_array(
     '路径图上多出一格，标注是"不可确定归属段"。',
     '"我们自己造出的东西，越过了我们设下的终点。"'
   ),
   'npc_unlock', jsonb_build_array(),
   'item_amount_delta', jsonb_build_object()
 )),

-- F15 深界路径标注图（依赖 F11，传说级）
('F15 深界路径标注图',
 '▓▓ 深界 ▓▓ 路径 ▓▓ 标注 ▓▓',
 '深界路径... 标注图... Ω-段通路延伸 ▓▓...',
 '深界路径标注图：Ω-段通路意外延伸至主环深层。一段从未启用的环结构首次出现在路径图中。系统记录到多条未授权穿行路径。',
 '深界路径标注图：Ω-段通路意外延伸，暴露了一段沉入黑洞视界线边缘的环结构——从未启用，只保留结构支撑与供能。多个泡层文明驾驶设备穿越了投放模块、锚点走廊，接近过去只用于维护的底层区域。它们没有发出请求，也没有攻击，但路径非常明确：往深处走。它们不是误入，而是计划好的闯入。这条路，迟早要面对。',
 'omega', 'legendary', 'search', 'search',
 90, 0.4, TRUE,
 jsonb_build_object(
   'chamber_weight', jsonb_build_object(),
   'lore_chunk_pool', jsonb_build_array(
     '路径图首次出现一段从未点亮过的环。',
     '"它们不是误入，而是计划好的闯入。"',
     '深界区域的供能曲线显示：它从未真正关闭过。'
   ),
   'npc_unlock', jsonb_build_array(),
   'item_amount_delta', jsonb_build_object('Ω物质', 1, '环段部件', 1)
 ))
;

-- ═══════════════════════════════════════════════════════════════
-- Step 3: 设置 requires_fragment_id 依赖（F07/F12 依赖 F06，F13 依赖 F12，F15 依赖 F11）
-- ═══════════════════════════════════════════════════════════════

UPDATE fragment_pool SET requires_fragment_id =
  (SELECT id FROM fragment_pool WHERE name='F06 伊甸港-3号干道事故摘要')
WHERE name='F07 伊甸港封锁令';

UPDATE fragment_pool SET requires_fragment_id =
  (SELECT id FROM fragment_pool WHERE name='F06 伊甸港-3号干道事故摘要')
WHERE name='F12 Ω-段结构分类报告';

UPDATE fragment_pool SET requires_fragment_id =
  (SELECT id FROM fragment_pool WHERE name='F12 Ω-段结构分类报告')
WHERE name='F13 共构扰动样本分析';

UPDATE fragment_pool SET requires_fragment_id =
  (SELECT id FROM fragment_pool WHERE name='F11 PI-1 探针部署记录')
WHERE name='F15 深界路径标注图';

-- ═══════════════════════════════════════════════════════════════
-- Step 4: 插入 8 条合成配方（按叙事主线顺序）
-- ═══════════════════════════════════════════════════════════════

-- Combo 1: F01 + F05 → F02 (巡检发现 + 反向应力 → 空锚运行)
INSERT INTO fragment_combos (fragment_id_a, fragment_id_b, unlocks_fragment, description, enabled)
SELECT a.id, b.id, c.id,
  '巡检发现的"不归我们管"加上一个不在清单里的反向应力源，拼出了锚点-β 的真相——它在空转维持着什么东西。',
  TRUE
FROM fragment_pool a, fragment_pool b, fragment_pool c
WHERE a.name='F01 外环巡检单-第17段' AND b.name='F05 外环结构应力图' AND c.name='F02 锚点-β 校准日志';

-- Combo 2: F06 + F02 → F07 (事故 + 空锚 → 封锁令)
INSERT INTO fragment_combos (fragment_id_a, fragment_id_b, unlocks_fragment, description, enabled)
SELECT a.id, b.id, c.id,
  '3 号干道事故的真相加上锚点-β 的空锚运行——伊甸港封锁不是为了修复，是在确认自己还完整。',
  TRUE
FROM fragment_pool a, fragment_pool b, fragment_pool c
WHERE a.name='F06 伊甸港-3号干道事故摘要' AND b.name='F02 锚点-β 校准日志' AND c.name='F07 伊甸港封锁令';

-- Combo 3: F07 + F09 → F08 (封锁 + 编号伪造 → D-8821 逃逸)
INSERT INTO fragment_combos (fragment_id_a, fragment_id_b, unlocks_fragment, description, enabled)
SELECT a.id, b.id, c.id,
  '伊甸港全面封锁，但仍有"用自己规则编号"的实体闯入。这两件事拼起来，D-8821 逃逸的完整经过浮现出来。',
  TRUE
FROM fragment_pool a, fragment_pool b, fragment_pool c
WHERE a.name='F07 伊甸港封锁令' AND b.name='F09 入侵者编号伪造分析' AND c.name='F08 D-8821 追踪记录';

-- Combo 4: F08 + F10 → F11 (D-8821 + 剪切带变形 → PI-1 部署)
INSERT INTO fragment_combos (fragment_id_a, fragment_id_b, unlocks_fragment, description, enabled)
SELECT a.id, b.id, c.id,
  '泡层逃逸进入系统内部，加上剪切带正在被"接入"。系统决定主动派 PI-1 探针进入 Ω-段边界。',
  TRUE
FROM fragment_pool a, fragment_pool b, fragment_pool c
WHERE a.name='F08 D-8821 追踪记录' AND b.name='F10 剪切带结构变形报告' AND c.name='F11 PI-1 探针部署记录';

-- Combo 5: F04 + F11 → F12 (PI 调度 + 探针 → Ω-段分类失败)
INSERT INTO fragment_combos (fragment_id_a, fragment_id_b, unlocks_fragment, description, enabled)
SELECT a.id, b.id, c.id,
  '为什么启用 PI 引导者，加上探针从 Ω-段返回的"无法重复的回应"。系统正式尝试分类 Ω-段，但失败了。',
  TRUE
FROM fragment_pool a, fragment_pool b, fragment_pool c
WHERE a.name='F04 人员调度令-PI 序列启用' AND b.name='F11 PI-1 探针部署记录' AND c.name='F12 Ω-段结构分类报告';

-- Combo 6: F12 + F10 → F13 (分类失败 + 接入 → 共构样本)
INSERT INTO fragment_combos (fragment_id_a, fragment_id_b, unlocks_fragment, description, enabled)
SELECT a.id, b.id, c.id,
  'Ω-段无法被分类，加上它正在"接入"周边——这两条信息共同指向：Ω-段是泡层与平台共同生成的第三种东西。',
  TRUE
FROM fragment_pool a, fragment_pool b, fragment_pool c
WHERE a.name='F12 Ω-段结构分类报告' AND b.name='F10 剪切带结构变形报告' AND c.name='F13 共构扰动样本分析';

-- Combo 7: F06 + F12 → F14 (事故 + 分类失败 → 路径污染源)
INSERT INTO fragment_combos (fragment_id_a, fragment_id_b, unlocks_fragment, description, enabled)
SELECT a.id, b.id, c.id,
  '3 号干道事故的源头，加上 Ω-段无法归类的现状——系统开始把所有相关记录标记为"结构污染源"。',
  TRUE
FROM fragment_pool a, fragment_pool b, fragment_pool c
WHERE a.name='F06 伊甸港-3号干道事故摘要' AND b.name='F12 Ω-段结构分类报告' AND c.name='F14 路径污染源标记清单';

-- Combo 8: F14 + F13 → F15 (污染源 + 共构 → 深界路径)
INSERT INTO fragment_combos (fragment_id_a, fragment_id_b, unlocks_fragment, description, enabled)
SELECT a.id, b.id, c.id,
  '泡层正在系统内部运行，加上共构生成的第三种结构——通路向深界延伸，多个文明已经在往深处走。',
  TRUE
FROM fragment_pool a, fragment_pool b, fragment_pool c
WHERE a.name='F14 路径污染源标记清单' AND b.name='F13 共构扰动样本分析' AND c.name='F15 深界路径标注图';

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- 验证查询
-- ═══════════════════════════════════════════════════════════════

-- SELECT count(*) AS fragment_count FROM fragment_pool WHERE name LIKE 'F%';
-- 期望：15
--
-- SELECT count(*) AS combo_count FROM fragment_combos WHERE enabled=TRUE;
-- 期望：8（加上其他保留的）
--
-- SELECT name, requires_fragment_id IS NOT NULL AS has_req
-- FROM fragment_pool WHERE name LIKE 'F%' ORDER BY name;
-- 期望：F07/F12/F13/F15 has_req=true，其他 false
--
-- SELECT count(*) FROM fragment_pool WHERE unlocks_rules != '{}'::jsonb AND name LIKE 'F%';
-- 期望：15（每个新残片都有 unlocks_rules）
