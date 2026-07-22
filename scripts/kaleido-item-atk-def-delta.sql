-- ─────────────────────────────────────────────────────────────────
-- KALEIDO · item_pool.atk_delta / def_delta 承载列（🧭 派单二 · 2026-07-22 · 🔧）
-- ⚠⚠ 本文件 **待 🧭 审 + 转 🔒 批准后由 🧭 执行**。🔧 不自跑。⚠⚠
-- ─────────────────────────────────────────────────────────────────
-- 背景：`calcItemEffect` 的 atk/def **生产点**是死代码 —— 只在 `item.kind === 'weapon' / 'armor'`
--   时产出，而 `ITEM_KIND_META`(src/lib/constants.js) 里**根本没有这两个 kind**（现 6 类 =
--   tech_fragment / platform_part / omega_matter / equipment / consumable / material）。
--   ⇒ ⚙️ 的加力件(id32·atk=2) / 加防件(id33·def=2) 是 `kind='consumable'`，走 consumable 支，
--     那支只产 hpDelta / staminaDelta ⇒ 返回全零 ⇒ `resolveUseItemAction` 里所有 `if (result.X)`
--     日志块全跳过，**但末尾 removeInventoryItem 无条件执行**
--   ⇒ **玩家合成出加力件、点使用、道具没了、属性没变、日志一个字都没有。**
--
-- 为什么加列而不是「让 calcItemEffect 按现有 atk/def 字段驱动」（🎨 提议·经查证否决）：
--   实测全库 `COALESCE(atk,0)<>0 OR COALESCE(def,0)<>0` **只有 3 行**：
--     id24 结构强化液(kind=consumable · def=50 · **多人存量** · 当前恒哑)
--     id32 加力件(atk=2) / id33 加防件(def=2)  ← ⚙️ 的 kaleido 新件
--   按字段驱动会让 **id24 突然开始生效**(多人局玩家用它会白得 +50 def) ⇒ 破「多人局零行为变化」铁律。
--   加新列则**存量列语义一个字不动、新列只有 kaleido 新道具有值** ⇒ 中性是**结构上不可能被破**的，
--   而不是靠「我数过只有 3 行」这种审计结论来保证。
--   （另一个被否的选项是「把 id24 的 def 归零」：确实零行为变化，但会抹掉该道具当年的设计记录。）
--
-- 安全性：纯加列 + NOT NULL DEFAULT 0 ⇒ 存量行全部取 0 ⇒ 引擎侧
--   `Number(item.atk_delta) || 0` 恒 0 ⇒ **多人局与存量道具逐字节零行为变化**。
--   引擎读法是防御式的（列不存在也回落 0），故本迁移与引擎代码上线**无先后依赖**：
--   代码可以先上（此时全零、无任何效果），列后建，⚙️ 再补值。
-- 幂等：可重复执行。不改任何 RLS policy / 不动行级权限。
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE item_pool ADD COLUMN IF NOT EXISTS atk_delta INTEGER NOT NULL DEFAULT 0;
ALTER TABLE item_pool ADD COLUMN IF NOT EXISTS def_delta INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN item_pool.atk_delta IS
  '使用该道具永久提升的 ATK。0=无此效果。kind 无关（扁平值·不走公式）。引擎：calcItemEffect → resolveUseItemAction。';
COMMENT ON COLUMN item_pool.def_delta IS
  '使用该道具永久提升的 DEF。0=无此效果。kind 无关（扁平值·不走公式）。引擎：calcItemEffect → resolveUseItemAction。';

-- 验证（执行后手跑）：
--   SELECT column_name, data_type, column_default, is_nullable FROM information_schema.columns
--     WHERE table_name='item_pool' AND column_name IN ('atk_delta','def_delta');
--   SELECT count(*) FROM item_pool WHERE atk_delta <> 0 OR def_delta <> 0;   -- 迁移后应为 0（⚙️ 补值前）
--
-- ⚙️ 后续补丁（本文件不含·归 ⚙️ 的经济批）——把值从旧列迁到新列：
--   UPDATE item_pool SET atk_delta = 2 WHERE name = '加力件';
--   UPDATE item_pool SET def_delta = 2 WHERE name = '加防件';
--   -- ⚠ 旧的 atk/def 列**保持原值不动**（它们是设计记录，且 admin ItemsTab 仍在读写）。
--   -- ⚠ id24 结构强化液**不要**补 def_delta —— 它是多人存量道具，补了就等于给多人局加强度。
