-- ============================================================
-- DTS 装备系统数据库 — 完整初始化 SQL
-- 在 Supabase SQL Editor 中执行
-- ============================================================

-- ─── 1. 被动技能表 ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS passive_skills (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  icon             TEXT NOT NULL DEFAULT '⚡',
  description      TEXT NOT NULL DEFAULT '',
  trigger_event    TEXT NOT NULL DEFAULT 'on_attack',
  -- on_attack | on_defend | on_kill | on_turn_start | on_hp_below_30 | on_equip
  effect_type      TEXT NOT NULL DEFAULT 'damage',
  -- damage | heal | buff | debuff | elemental | stat_boost
  effect_formula   TEXT NOT NULL DEFAULT 'value',
  -- 接入 gameEngine.evalFormula，可用: atk, def, hp, maxHp, value, enemyHp
  effect_target    TEXT NOT NULL DEFAULT 'enemy',
  -- self | enemy | all
  trigger_chance   FLOAT NOT NULL DEFAULT 1.0,   -- 触发概率 0-1
  buff_id          INT REFERENCES buff_pool(id) ON DELETE SET NULL,
  cooldown_turns   INT NOT NULL DEFAULT 0,        -- 0=无冷却
  value            FLOAT NOT NULL DEFAULT 0,      -- 公式中的 value 变量
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. 装备系列表 ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_series (
  id                 SERIAL PRIMARY KEY,
  name               TEXT NOT NULL,
  slot               TEXT NOT NULL DEFAULT 'weapon',
  -- weapon | armor | helmet | boots | accessory
  description        TEXT DEFAULT '',
  icon               TEXT DEFAULT '⚔️',
  max_tier           INT NOT NULL DEFAULT 5,
  unlock_condition   JSONB DEFAULT '{}',
  -- { "min_level": 5, "story_flag": "arc1_complete" }
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 3. 装备阶级（具体装备定义）──────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_tiers (
  id               SERIAL PRIMARY KEY,
  series_id        INT NOT NULL REFERENCES equipment_series(id) ON DELETE CASCADE,
  tier             INT NOT NULL DEFAULT 1,        -- 1 = 最低阶
  variant          TEXT DEFAULT NULL,
  -- NULL=主线/唯一, 'fire'=火系分支, 'ice'=冰系分支, 'dark'=暗属性变体 ...
  name             TEXT NOT NULL,
  rarity           TEXT NOT NULL DEFAULT 'common',
  -- common | uncommon | rare | epic | legendary | mythic

  -- 基础属性
  base_atk         INT NOT NULL DEFAULT 0,
  base_def         INT NOT NULL DEFAULT 0,
  base_hp          INT NOT NULL DEFAULT 0,        -- 装备后的HP加成
  base_spd         INT NOT NULL DEFAULT 0,        -- 速度（预留）

  -- 元素系统
  element          TEXT NOT NULL DEFAULT 'none',
  -- none | fire | ice | thunder | wind | light | dark | water
  element_power    INT NOT NULL DEFAULT 0,        -- 元素强度，影响元素反应

  -- 耐久度（0=无限耐久）
  durability_max   INT NOT NULL DEFAULT 0,

  -- 被动技能
  passive_skill_id INT REFERENCES passive_skills(id) ON DELETE SET NULL,
  passive_note     TEXT DEFAULT '',               -- 简短被动说明（用于卡片显示）

  -- 装备限制
  req_level        INT NOT NULL DEFAULT 1,
  req_class        TEXT[] DEFAULT '{}',           -- 空数组=全职业可用

  special_note     TEXT DEFAULT '',
  created_at       TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(series_id, tier, variant)  -- 同系列同阶同变体唯一
);

-- ─── 4. 合成配方表 ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tier_recipes (
  id                    SERIAL PRIMARY KEY,
  result_tier_id        INT NOT NULL UNIQUE REFERENCES equipment_tiers(id) ON DELETE CASCADE,
  recipe_name           TEXT DEFAULT '',
  -- 升阶核心：前置装备（NULL=T1基础合成，无需前置）
  requires_prev_tier_id INT REFERENCES equipment_tiers(id) ON DELETE SET NULL,
  -- 允许"T3接受T2任意变体"的宽松匹配
  requires_prev_series_id INT REFERENCES equipment_series(id) ON DELETE SET NULL,
  requires_prev_tier_num  INT,
  -- 当 requires_prev_tier_id IS NULL 但 requires_prev_series_id IS NOT NULL 时，
  -- 表示接受该系列该阶任意变体
  gold_cost             INT NOT NULL DEFAULT 0,
  success_rate          FLOAT NOT NULL DEFAULT 1.0,  -- 1.0=必定成功
  fail_behavior         TEXT NOT NULL DEFAULT 'keep_materials',
  -- keep_materials: 材料保留，可重试
  -- lose_materials: 材料损失
  -- downgrade: 前置装备降一阶
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 5. 配方材料明细表 ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id                  SERIAL PRIMARY KEY,
  recipe_id           INT NOT NULL REFERENCES tier_recipes(id) ON DELETE CASCADE,
  ingredient_type     TEXT NOT NULL DEFAULT 'item',
  -- 'item' = item_pool 中的材料
  -- 'equipment' = equipment_tiers 中的特定装备（催化剂场景）
  item_id             INT REFERENCES item_pool(id) ON DELETE SET NULL,
  equipment_tier_id   INT REFERENCES equipment_tiers(id) ON DELETE SET NULL,
  quantity            INT NOT NULL DEFAULT 1,
  is_consumed         BOOL NOT NULL DEFAULT TRUE,   -- 合成后是否消耗
  is_catalyst         BOOL NOT NULL DEFAULT FALSE   -- 催化剂：需持有但不消耗
);

-- ─── 6. 玩家装备实例表 ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_instances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id           INT NOT NULL REFERENCES equipment_tiers(id),
  owner_id          UUID NOT NULL,                 -- 对应 auth.users.id
  room_id           INT REFERENCES rooms(id) ON DELETE CASCADE,
  -- 实例状态
  durability_current INT NOT NULL DEFAULT 0,       -- 当前耐久（0=满/无限）
  bonus_atk         INT NOT NULL DEFAULT 0,        -- 强化附加攻击
  bonus_def         INT NOT NULL DEFAULT 0,        -- 强化附加防御
  is_equipped       BOOL NOT NULL DEFAULT FALSE,
  equipped_slot     TEXT DEFAULT NULL,             -- 实际装备到哪个槽
  -- 追踪
  acquired_at       TIMESTAMPTZ DEFAULT NOW(),
  upgraded_count    INT NOT NULL DEFAULT 0         -- 该实例被强化次数
);

-- ─── 索引 ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_eq_tiers_series   ON equipment_tiers(series_id, tier);
CREATE INDEX IF NOT EXISTS idx_eq_instances_owner ON equipment_instances(owner_id, room_id);
CREATE INDEX IF NOT EXISTS idx_recipe_result      ON tier_recipes(result_tier_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_recipe ON recipe_ingredients(recipe_id);

-- ─── RLS ───────────────────────────────────────────────────────
ALTER TABLE passive_skills        ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_series      ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_tiers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tier_recipes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients    ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_instances   ENABLE ROW LEVEL SECURITY;

-- 全局只读（所有登录用户可查定义表）
CREATE POLICY "read_passive_skills"     ON passive_skills     FOR SELECT USING (TRUE);
CREATE POLICY "read_equipment_series"   ON equipment_series   FOR SELECT USING (TRUE);
CREATE POLICY "read_equipment_tiers"    ON equipment_tiers    FOR SELECT USING (TRUE);
CREATE POLICY "read_tier_recipes"       ON tier_recipes       FOR SELECT USING (TRUE);
CREATE POLICY "read_recipe_ingredients" ON recipe_ingredients FOR SELECT USING (TRUE);

-- 实例表：只能读写自己的
CREATE POLICY "own_equipment_instances" ON equipment_instances
  FOR ALL USING (auth.uid() = owner_id);

-- 管理员写入（定义表）
CREATE POLICY "admin_write_passive"   ON passive_skills     FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_write_series"    ON equipment_series   FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_write_tiers"     ON equipment_tiers    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_write_recipes"   ON tier_recipes       FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_write_ingredients" ON recipe_ingredients FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- 示例数据：「常磐之刃」系列（验证结构用）
-- ============================================================

-- 被动技能
INSERT INTO passive_skills (name, icon, description, trigger_event, effect_type, effect_formula, effect_target, trigger_chance, value) VALUES
('烈焰斩',   '🔥', '攻击时20%概率附加火焰伤害',       'on_attack',       'elemental', 'floor(atk * 0.3 + value)', 'enemy',  0.20, 5),
('霜冻触',   '❄️', '攻击时15%概率冻结敌人1回合',       'on_attack',       'debuff',    'value',                   'enemy',  0.15, 0),
('暗影毒',   '☠️', '攻击时25%概率施加中毒',            'on_attack',       'debuff',    'value',                   'enemy',  0.25, 0),
('圣光治愈', '✨', '击杀敌人时恢复HP',                 'on_kill',         'heal',      'floor(maxHp * 0.1)',       'self',   1.00, 0),
('末日之力', '💀', 'HP低于30%时ATK+20',               'on_hp_below_30',  'stat_boost','value',                   'self',   1.00, 20),
('神器共鸣', '⚡', '每回合开始ATK+5（最多叠加3次）',   'on_turn_start',   'stat_boost','value',                   'self',   1.00, 5)
ON CONFLICT DO NOTHING;

-- 系列
INSERT INTO equipment_series (name, slot, description, icon, max_tier) VALUES
('常磐之刃', 'weapon', '传说中常磐台中学的神秘武器系列，据说由某位失踪学生留下', '⚔️', 5)
ON CONFLICT DO NOTHING;

-- 注：后续 equipment_tiers 和 tier_recipes 建议通过后台管理界面录入
-- 以下为结构示例（实际ID需替换）：

-- T1: 朴素铁刃（无需前置）
-- INSERT INTO equipment_tiers (series_id, tier, variant, name, rarity, base_atk, element, durability_max)
-- VALUES (1, 1, NULL, '朴素铁刃', 'common', 8, 'none', 50);

-- T2a: 烈焰铁刃（火系分支）
-- INSERT INTO equipment_tiers (series_id, tier, variant, name, rarity, base_atk, element, element_power, passive_skill_id)
-- VALUES (1, 2, 'fire', '烈焰铁刃', 'uncommon', 15, 'fire', 20, 1);

-- T2b: 霜冻铁刃（冰系分支）
-- INSERT INTO equipment_tiers (series_id, tier, variant, name, rarity, base_atk, element, element_power, passive_skill_id)
-- VALUES (1, 2, 'ice', '霜冻铁刃', 'uncommon', 15, 'ice', 20, 2);
