-- ═══════════════════════════════════════════════════════════════
-- Phase 25k — 兑换汇率微调: high_equip_pt → low_equip_pt 1:8 → 1:7
-- ═══════════════════════════════════════════════════════════════
-- 背景 (TODO_AUTO research-2026-05-12 P1):
--   降级路径 low_equip_pt → high_equip_pt → low_equip_pt 的 round_trip
--   原为 8/10 = 0.80,已逼近 0.85 警戒线(来回兑换损耗过低 = 软通胀缺口)。
--   将 high_equip_pt → low_equip_pt 的 to_amount 由 8 改为 7,
--   使 round_trip = 7/10 = 0.70,损耗提升到 ~30%。
--
-- 约束:
--   - economy_version 保持 1(非 wipe,仅常规调参,沿用 phase-25b 版本语义)。
--   - 幂等: WHERE 锚定 (from_type, to_type) 唯一键,重复执行结果不变。
--   - 非破坏: 仅 UPDATE 单行,不 DROP/TRUNCATE/DELETE。
-- ═══════════════════════════════════════════════════════════════

UPDATE shop_exchange_rates
   SET to_amount   = 7,
       description = '1 高级装备点 → 7 普通装备点(降级,有损耗,round_trip 0.70)'
 WHERE from_type        = 'high_equip_pt'
   AND to_type          = 'low_equip_pt'
   AND economy_version  = 1;

-- 验证:
-- SELECT from_type, to_type, from_amount, to_amount, economy_version
--   FROM shop_exchange_rates
--  WHERE from_type = 'high_equip_pt' AND to_type = 'low_equip_pt';
-- 期望 to_amount = 7;  round_trip = (1.0 / 10) * 7 = 0.70
