-- ═══════════════════════════════════════════════════════════════════
-- 远星函馆 Lore 文本更新（精简世界观落地）
-- 2026-05-10
-- ═══════════════════════════════════════════════════════════════════
-- 目的：重写 item_pool / npc_pool / event_pool / contracts / endings
--       的 description 字段，按早期/中期/后期分层埋设 lore 碎片。
-- 术语变更：泡层 → 泡泡，泡层壳体 → 泡泡壳，泡层文明 → 不提
-- ═══════════════════════════════════════════════════════════════════

-- ── map_config 描述 ──
UPDATE map_config SET description = '环最外层，残存的维护轨道还在低功耗运行。引导灯忽明忽灭。'              WHERE map_id = 0;
UPDATE map_config SET description = '原来固定环结构的锚点残段。泡泡的壳已经嵌进了墙壁里，像长在上面一样。' WHERE map_id = 1;
UPDATE map_config SET description = '曾经最繁忙的港区，现在堆满了崩塌的碎片。空气中有什么东西在低频震动。' WHERE map_id = 2;
UPDATE map_config SET description = '贴近黑洞的边缘地带。结构在缓慢变形，你能看到墙面像橡皮一样在拉伸。' WHERE map_id = 3;
UPDATE map_config SET description = '最深处。泡泡和平台在这里融为一体，分不清哪边是哪边。到处是未归档的脉冲。' WHERE map_id = 4;
UPDATE map_config SET description = '锚点走廊分出来的死路，但紧急撤离通道还能用。'                           WHERE map_id = 10;
UPDATE map_config SET description = '伊甸港残墟的侧通道，紧急撤离出口。墙上的标识已经被泡泡侵蚀了一半。'   WHERE map_id = 11;

-- ── item_pool 描述 ──
-- 早期物品：只有简短技术描述，不解释背景
UPDATE item_pool SET description = '从环面上脱落的金属片。上面有模糊的编号，看不清属于哪个部门。'           WHERE name = '结构碎片';
UPDATE item_pool SET description = '一份残缺的技术文档碎片。只看得出"锚点-β""稳定""结构失衡"几个词。'   WHERE name = '锚点稳定协议';
UPDATE item_pool SET description = '还能用的环段零件。可以修复结构、降低污染，也可以作为撤离时的消耗。'     WHERE name = '环段部件';
UPDATE item_pool SET description = '港区接口用的缓冲材料。摸起来有弹性，像是在吸收什么东西。'               WHERE name = '缓冲材料';
UPDATE item_pool SET description = '原来连接港区和锚点的接口碎件。断面上有泡泡残留的痕迹。'                 WHERE name = '伊甸港接口残件';

-- 中期物品：开始暗示泡泡内部有东西
UPDATE item_pool SET description = '一份无法完整解码的数据。标注来源是"泡泡内部"——里面曾经有什么东西在运算。'  WHERE name = '语言压缩算法';

-- 后期物品：信息密度升高
UPDATE item_pool SET description = '不是普通物质。像是正在被重新排列的数据——暗示环结构在进行某种计算。'         WHERE name = 'Ω物质';
UPDATE item_pool SET description = 'Ω-段核心的采样。泡泡与平台在此处共构——不是简单的粘合，而是融在一起。'       WHERE name = '共构扰动样本';
UPDATE item_pool SET description = '观察者交易获得。标记了一条通向更深处的路径。'                               WHERE name = '深界情报';

-- 消耗品：简洁实用
UPDATE item_pool SET description = '标准修复补给。回复 30 HP。'                                               WHERE name = '结构修复包';
UPDATE item_pool SET description = '注入后能暂时压制个人污染。-10% 个人污染。'                                 WHERE name = '认知稳定剂';
UPDATE item_pool SET description = '液态强化剂，使用后短暂获得 DEF+5。'                                       WHERE name = '结构强化液';
UPDATE item_pool SET description = '共生体给你的凭证。它们似乎在等你拿这个去做什么。'                           WHERE name = '共生协议';

-- ── npc_pool：添加 description 列（如果不存在）+ 更新 ──
ALTER TABLE npc_pool ADD COLUMN IF NOT EXISTS description TEXT;

-- 残响（早→中期敌对）
UPDATE npc_pool SET description = '环结构自己产生的回声。形态模糊，会发出刺耳的低频音。'                     WHERE name = '残响低语';
UPDATE npc_pool SET description = '更强的残响。轮廓偶尔会短暂显现出某种人形——像是在模仿什么。'               WHERE name = '裂解残影';
UPDATE npc_pool SET description = '泡泡壳里涌出的最强残响。你能感觉到它在审视你的编号。'                     WHERE name = '泡层主权';
UPDATE npc_pool SET description = '异常段最深处的守望实体。它似乎在保护什么不被你看到。'                     WHERE name = 'Ω-段守望者';

-- 伪装体（中期敌对）
UPDATE npc_pool SET description = '它在发送一个引导者编号——但那个编号是假的。'                               WHERE name = '伪装信号';
UPDATE npc_pool SET description = '高级伪装体。它伪造的编号几乎通过了你的校验。'                             WHERE name = '伪造编号-7';

-- 共生体（中→后期，非敌对，可交易）
UPDATE npc_pool SET description = '寄生在环结构上的温和实体。用环段部件就能跟它交换 Ω物质。'               WHERE name = '共生节点-α';
UPDATE npc_pool SET description = '更深处的共生体。交易时偶尔会低频发出片段："……不是用来住的……"'           WHERE name = '共生节点-β';

-- 观察者（后期，非敌对，可交易情报）
UPDATE npc_pool SET description = '不攻击你的实体。镜面表面会回放你之前的行动。用碎片换情报。'             WHERE name = '观察者-Ι';
UPDATE npc_pool SET description = 'Ω-段深处的观察者。比外面的更冷漠，但愿意出更高价。'                     WHERE name = '观察者-Ω';

-- ── event_pool 描述 + log_only 文本 ──
UPDATE event_pool SET
  description = '锚点残段在搜索中泛起回响。有什么东西从静电中显形了。',
  effects = '[{"type":"give_item","itemName":"结构碎片","count":1},
              {"type":"log_only","text":"一片金属从墙壁缝隙中滑出，上面的编号已经模糊。"}]'::jsonb
WHERE name = '锚点残响';

UPDATE event_pool SET
  description = '泡泡的壳裂开了。里面涌出了什么东西。',
  effects = '[{"type":"spawn_npc","entity_type":"remnant"},
              {"type":"set_flag","key":"shellBreach","value":true,"silent":true},
              {"type":"log_only","text":"泡泡壳炸开的瞬间，你看到里面有光在闪——然后残响扑了过来。"}]'::jsonb
WHERE name = '泡层壳体裂解';

UPDATE event_pool SET
  description = 'Ω-段脉冲击穿了你的防护。脑海里闪过不属于你的画面。',
  effects = '[{"type":"damage","amount":10},
              {"type":"inc_flag","key":"omegaPulse","value":1,"silent":true},
              {"type":"log_only","text":"一瞬间你看见了这个环完整的样子——然后什么都没了。"}]'::jsonb
WHERE name = 'Ω-段脉冲';

UPDATE event_pool SET
  description = '它在发送引导者编号——但那个编号是假的。',
  effects = '[{"type":"spawn_npc","entity_type":"infiltrator"},
              {"type":"log_only","text":"你身后那个信号源的编号正在重组。不是同伴。"}]'::jsonb
WHERE name = '伪装识别失败';

UPDATE event_pool SET
  description = '电磁噪声太大，你错过了关键的编号校验。',
  effects = '[{"type":"spawn_npc","entity_type":"infiltrator"},
              {"type":"log_only","text":"它等你放下戒备之后才发动的。"}]'::jsonb
WHERE name = '伪装识别失败-3区';

UPDATE event_pool SET
  description = '一个温热的脉冲穿过你的传感器——有东西想和你说话。',
  effects = '[{"type":"spawn_npc","entity_type":"symbiote"},
              {"type":"log_only","text":"非敌对信号。它在请求建立连接。"}]'::jsonb
WHERE name = '共生体信号';

UPDATE event_pool SET
  description = '接口节点松动了。你可以拆下一块环段部件。',
  effects = '[{"type":"give_item","itemName":"环段部件","count":1},
              {"type":"log_only","text":"接口松了——你拆下了一块还能用的部件。"}]'::jsonb
WHERE name = '结构修复窗口';

UPDATE event_pool SET
  description = '这里的备用接口居然还在工作。',
  effects = '[{"type":"give_item","itemName":"环段部件","count":1},
              {"type":"log_only","text":"备用接口的灯还亮着。你拆下了一块部件。"}]'::jsonb
WHERE name = '结构修复窗口-10区';

UPDATE event_pool SET
  description = '有什么东西在看着你——不像有敌意。',
  effects = '[{"type":"spawn_npc","entity_type":"observer"},
              {"type":"log_only","text":"它的表面像镜子一样，映着你几分钟前的动作。"}]'::jsonb
WHERE name = '观察者接触';

UPDATE event_pool SET
  description = 'Ω-段的观察者沉默地悬停着。比外面那些更冷漠。',
  effects = '[{"type":"spawn_npc","entity_type":"observer"},
              {"type":"log_only","text":"它在等。等你拿出结构碎片。"}]'::jsonb
WHERE name = '观察者接触-Ω段';

UPDATE event_pool SET
  description = '引力突然加速拉扯。墙壁和你之间的距离在变。',
  effects = '[{"type":"damage","amount":15},
              {"type":"inc_flag","key":"shearWave","value":1,"silent":true},
              {"type":"log_only","text":"剪切波扫过来的时候，你的防护罩发出了一声脆响。"}]'::jsonb
WHERE name = '引力剪切波';

-- ── contracts 描述 ──
UPDATE contracts SET description = '从锚点走廊或废弃投放口找到 3 块环段部件。用来修复锚点-β 的中继节点。'  WHERE name = '修复锚点中继';
UPDATE contracts SET description = '伊甸港残墟里的残响太多了。清掉一些，让这个区域安静下来。'                 WHERE name = '清除残响实体';
UPDATE contracts SET description = '去剪切缓冲带或 Ω-段深处找 Ω物质。带回来——不要问它是什么。'               WHERE name = '提取Ω-段数据';
UPDATE contracts SET description = '进入 Ω-段核心接口，然后活着出来。至少一次。'                               WHERE name = '侦查Ω-段边界';
UPDATE contracts SET description = '从任意撤离点安全退出一次。最基本的引导者认证。'                             WHERE name = '安全撤离';
UPDATE contracts SET description = '找到一个共生体，用环段部件跟它交换——它会给你一份共生协议。'               WHERE name = '建立共生通信';

-- ── endings 描述 + banner_text ──
UPDATE endings SET
  description  = '环撑不住了。污染爆了，撤离也失败了，整段结构开始向视界线坠落。',
  banner_text  = '异常段正在坠入视界线……引导灯全部熄灭。'
WHERE key = 'collapse';

UPDATE endings SET
  description  = '你们杀了太多实体，但没带回足够的碎片。平台判定这段环没有保留价值了。',
  banner_text  = '异常段已被隔离。Ω-段接口关闭。你们被标记为高效但无收益。'
WHERE key = 'purge';

UPDATE endings SET
  description  = '你们和泡泡里的东西聊够了，污染也没有失控。平台同意让它们留下来。',
  banner_text  = '共存协议已签署。共生体仍在环上低频运行。泡泡没有继续扩张。'
WHERE key = 'merge';

UPDATE endings SET
  description  = '你去了 Ω-段太多次，带回了太多 Ω物质。平台发现了一条新的路径——通向更深的地方。',
  banner_text  = '路径图上出现了新的标记。深界向你打开了。'
WHERE key = 'explore';

-- ── branch_nodes 描述 ──
UPDATE branch_nodes SET description = '污染爆了 + 撤离失败太多次 → 整段环开始坠落。'                         WHERE name = '崩解判定';
UPDATE branch_nodes SET description = '杀了太多实体但碎片收集少 → 平台强制隔离异常段。'                       WHERE name = '清算判定';
UPDATE branch_nodes SET description = '和非敌对实体交流够了 + 污染受控 → 允许共存。'                           WHERE name = '合流判定';
UPDATE branch_nodes SET description = '多次进入 Ω-段 + 提取足够 Ω物质 → 发现新路径。'                         WHERE name = '探索判定';

-- 验证
SELECT 'items' AS category, name, LEFT(description, 40) AS desc_preview FROM item_pool ORDER BY name
UNION ALL
SELECT 'npcs', name, LEFT(description, 40) FROM npc_pool ORDER BY name
UNION ALL
SELECT 'events', name, LEFT(description, 40) FROM event_pool ORDER BY name
UNION ALL
SELECT 'contracts', name, LEFT(description, 40) FROM contracts ORDER BY name
UNION ALL
SELECT 'endings', name, LEFT(description, 40) FROM endings ORDER BY name;
