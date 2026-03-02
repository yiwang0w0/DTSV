-- ============================================================
-- DTS 游戏规则引擎 - 数据库初始化 SQL
-- 在 Supabase SQL Editor 中执行此文件
-- ============================================================

-- ─── game_rules 表：键值对形式的全局规则 ───
CREATE TABLE IF NOT EXISTS game_rules (
  id          SERIAL PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  value       TEXT NOT NULL DEFAULT '',
  label       TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  category    TEXT NOT NULL DEFAULT 'general',
  input_type  TEXT NOT NULL DEFAULT 'number',  -- number | formula | select
  min_val     NUMERIC,
  max_val     NUMERIC,
  options     JSONB,  -- for select type: [{ value, label }]
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── buff_pool 表：Buff/Debuff 定义 ───
CREATE TABLE IF NOT EXISTS buff_pool (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  icon            TEXT DEFAULT '⚡',
  description     TEXT DEFAULT '',
  type            TEXT NOT NULL DEFAULT 'dot',  -- dot|stat|shield|special
  target          TEXT NOT NULL DEFAULT 'hp',   -- hp|atk|def
  effect_formula  TEXT NOT NULL DEFAULT '-value', -- 每回合执行的公式
  value           NUMERIC NOT NULL DEFAULT 5,
  duration        INT NOT NULL DEFAULT 3,        -- 持续回合
  max_stack       INT NOT NULL DEFAULT 1,        -- 最大叠加层数
  is_debuff       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 默认规则数据
-- ============================================================
INSERT INTO game_rules (key, value, label, description, category, input_type, min_val, max_val) VALUES

-- 【战斗公式】
('damage_formula',        'atk * atkMultiplier - def * defMultiplier',
  '伤害计算公式', '可用变量: atk, def, targetDef, targetHp, targetMaxHp, atkMultiplier, defMultiplier, roll',
  'combat', 'formula', NULL, NULL),

('atk_base_multiplier',   '1.0', '攻击基础倍率', '攻击力的基础乘数', 'combat', 'number', 0.1, 5.0),
('def_base_multiplier',   '0.5', '防御减免倍率', '防御力在伤害中的减免倍率', 'combat', 'number', 0.0, 2.0),
('crit_rate',             '0.1', '暴击率', '0~1之间，触发暴击的概率', 'combat', 'number', 0, 1),
('crit_multiplier',       '1.5', '暴击倍率', '暴击时伤害的额外倍率', 'combat', 'number', 1.0, 5.0),
('min_damage',            '1',   '最低伤害', '每次攻击的最低保底伤害', 'combat', 'number', 0, 50),

-- 【道具公式】
('item_heal_formula',     'heal', '治疗公式', '可用变量: heal, hp, maxHp, effect', 'items', 'formula', NULL, NULL),
('item_equip_atk_formula','atk',  '装备攻击公式', '可用变量: atk, effect, playerAtk', 'items', 'formula', NULL, NULL),
('item_equip_def_formula','def',  '装备防御公式', '可用变量: def, effect, playerDef', 'items', 'formula', NULL, NULL),

-- 【搜索概率】
('search_item_chance',    '0.4',  '搜索到道具概率', '每次搜索找到道具的基础概率', 'search', 'number', 0, 1),
('search_npc_chance',     '0.25', '搜索遭遇NPC概率', '每次搜索遭遇NPC的基础概率', 'search', 'number', 0, 1),

-- 【玩家初始属性】
('player_init_hp',        '100', '初始生命值',  '玩家进入游戏时的HP', 'player', 'number', 10, 9999),
('player_init_atk',       '10',  '初始攻击力',  '玩家进入游戏时的ATK', 'player', 'number', 1, 999),
('player_init_def',       '5',   '初始防御力',  '玩家进入游戏时的DEF', 'player', 'number', 0, 999),

-- 【天气效果数值】
('weather_rain_shooting_penalty', '0.1',  '雨天射击惩罚',     '射击/投掷武器攻击倍率减少量（如0.1表示-10%）', 'weather', 'number', 0, 1),
('weather_fog_search_multiplier', '0.5',  '大雾搜索倍率',     '大雾天气下搜索概率乘数', 'weather', 'number', 0, 1),
('weather_storm_all_penalty',     '0.05', '暴风雨全属性惩罚', '暴风雨天气下攻防搜索的减少比例', 'weather', 'number', 0, 1),
('weather_night_search_penalty',  '0.15', '黑夜搜索惩罚',     '黑夜天气下搜索道具概率减少量', 'weather', 'number', 0, 1),
('weather_snow_move_penalty',     '0.2',  '暴雪移动惩罚',     '暴雪天气下可移动范围减少比例（预留）', 'weather', 'number', 0, 1)

ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 默认 Buff 数据
-- ============================================================
INSERT INTO buff_pool (name, icon, description, type, target, effect_formula, value, duration, max_stack, is_debuff) VALUES

('中毒',   '🤢', '每回合持续损失HP',       'dot',    'hp',  '-value',            8,  3, 1, TRUE),
('灼烧',   '🔥', '灼烧每回合造成更多伤害', 'dot',    'hp',  '-(value + atk * 0.05)', 12, 2, 1, TRUE),
('腐蚀',   '☣️', '降低防御力',             'stat',   'def', '-value',            5,  3, 3, TRUE),
('诅咒',   '💀', '降低攻击力',             'stat',   'atk', '-value',            5,  3, 1, TRUE),
('护盾',   '🛡️', '每回合恢复少量HP',       'shield', 'hp',  'value',             5,  4, 1, FALSE),
('强化',   '💪', '增加攻击力',             'stat',   'atk', 'value',             8,  3, 3, FALSE),
('再生',   '🌿', '大量回复HP',             'dot',    'hp',  'value',             15, 3, 1, FALSE),
('虚弱',   '😵', '攻防双降',               'stat',   'atk', '-value',            3,  4, 2, TRUE),
('狂暴',   '😤', '攻击大增但防御降低',     'special','atk', 'value',             15, 3, 1, FALSE)

ON CONFLICT DO NOTHING;

-- ─── 在 item_pool 表中增加 Buff 相关字段 ───
ALTER TABLE item_pool
  ADD COLUMN IF NOT EXISTS on_use_buff_ids  INT[]    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS heal_formula     TEXT     DEFAULT '',
  ADD COLUMN IF NOT EXISTS atk_formula      TEXT     DEFAULT '',
  ADD COLUMN IF NOT EXISTS def_formula      TEXT     DEFAULT '';

-- ─── RLS 策略（管理员全权访问，普通用户只读）───
ALTER TABLE game_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE buff_pool  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_read_game_rules" ON game_rules FOR SELECT USING (TRUE);
CREATE POLICY "anyone_read_buff_pool"  ON buff_pool  FOR SELECT USING (TRUE);

-- 如有 service_role 密钥则后端可绕过 RLS；
-- 前端管理员写入依赖 Supabase 的 anon key + 以下策略：
CREATE POLICY "admin_write_game_rules" ON game_rules
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "admin_write_buff_pool" ON buff_pool
  FOR ALL USING (auth.role() = 'authenticated');
