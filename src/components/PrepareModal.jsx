'use client'

/**
 * PrepareModal — Phase 24b+24c 入场准备模态（替代 LoadoutModal）
 *
 * 4 tab:
 *   1. 职业    — 3 normal + 10% legendary 候选 + 1 class_pt 保底刷高级（Phase 24c）
 *   2. 装备购买 — 从 shop_catalog (entry_kind=equipment) 选 4 槽
 *   3. 道具购买 — 从 shop_catalog (entry_kind=consumable/story_item) 累加 qty
 *   4. 商店兑换 — shop_exchange_rates 跨类型互换
 *
 * 持久 points 余额栏（4 类）显示当前余额 - cart 扣除后预览
 *
 * Props:
 *   open
 *   onClose()
 *   onConfirm({ classId, usedHighPt, catalogPurchases: [{catalogId, qty}], exchanges: [{rateId, times}] })
 *   roomTitle
 */

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { THEME } from '@/lib/theme'
import { getGameApi, postGameApi } from '@/lib/gameApi'
import { useAuth } from '@/app/_shell/RootShell'
import { NEWBIE_PROTECTION, LOADOUT_PRESETS, RUN_GOALS, HIGH_RISK } from '@/lib/constants'
import { sanitizeHeatLevel } from '@/lib/server/heat'
import { firstContactFraming } from '@/lib/server/raids'
import {
  sanitizeLoadoutPresets,
  applyPresetToCart,
  buildPresetFromCart,
  upsertLoadoutPresets,
  removeLoadoutPreset,
} from '@/lib/server/loadoutPresets'
import { sanitizeRunGoal, runGoalDef } from '@/lib/server/runGoals'

// collect_points 默认目标（从 RUN_GOALS 定义派生，避免硬编码漂移）
const DEFAULT_POINTS_TARGET = runGoalDef('collect_points')?.target ?? 50

// 本地调色板：键名保留（所有消费点不变），值改为引用全站统一 THEME（GitHub-dark 单一真源）。
//   漂移值统一到最近的 THEME 语义 token（orange #ff8c42 → orange）；换肤只需改 src/lib/theme.js 一处。
const C = {
  bg0:    THEME.bg,
  bg1:    THEME.panel2,
  bg2:    THEME.panel,
  border: THEME.border,
  border2:THEME.panel3,
  text:   THEME.text,
  dim:    THEME.dim,
  dim2:   THEME.dim3,
  accent: THEME.accent,
  green:  THEME.success,
  red:    THEME.danger,
  yellow: THEME.warning,
  purple: THEME.purple,
  orange: THEME.orange,
}

const POINT_META = {
  high_equip_pt: { label: '高级装备点', icon: '⚔', color: C.purple },
  low_equip_pt:  { label: '普通装备点', icon: '🛡', color: C.accent },
  item_pt:       { label: '道具点',     icon: '💊', color: C.yellow },
  class_pt:      { label: '职业点',     icon: '✦',  color: C.orange },
}

const RARITY_COLOR = {
  common: '#8b949e', uncommon: '#3fb950', rare: '#58a6ff',
  epic: '#bc8cff', legendary: '#d29922', mythic: '#f85149',
}

const SLOT_LABEL = {
  probe: '探测', shield: '防护', weapon: '武器', comm: '通信',
}

export default function PrepareModal({ open, onClose, onConfirm, roomTitle }) {
  const { user } = useAuth()
  const [tab, setTab] = useState('class')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  const [balances, setBalances] = useState({ high_equip_pt: 0, low_equip_pt: 0, item_pt: 0, class_pt: 0 })
  const [catalog, setCatalog] = useState({ equipment: [], consumables: [], storyItems: [] })
  const [rates, setRates] = useState([])
  const [firstRaidsCount, setFirstRaidsCount] = useState(null) // phase-25l 新手保护期计数
  const [presets, setPresets] = useState([])        // phase-25m profiles.saved_loadouts
  const [presetMsg, setPresetMsg] = useState('')     // 套用/保存反馈
  const [presetSaving, setPresetSaving] = useState(false)

  // 本局目标（research 2026-05-29-A，RUN_GOALS.ENABLED 门控，预埋不启用）
  const [runGoalType, setRunGoalType] = useState(RUN_GOALS.DEFAULT_TYPE)
  const [runGoalTarget, setRunGoalTarget] = useState(DEFAULT_POINTS_TARGET)

  // 高危出勤等级（research 2026-05-29-B，HIGH_RISK.ENABLED 门控，预埋不启用）
  const [heatLevel, setHeatLevel] = useState(HIGH_RISK.DEFAULT_LEVEL)

  // Phase 24c 职业状态
  const [classCandidates, setClassCandidates] = useState([])
  const [selectedClassId, setSelectedClassId] = useState(null)
  const [usedHighPt, setUsedHighPt] = useState(false)
  const [classForcing, setClassForcing] = useState(false)

  // cart 状态
  const [equipCart, setEquipCart] = useState({}) // { catalogId: true } — 装备每件 qty=1
  const [itemCart, setItemCart] = useState({})   // { catalogId: qty }
  const [exchangeCart, setExchangeCart] = useState({}) // { rateId: times }

  // ── 加载数据 ──
  useEffect(() => {
    if (!open || !user?.id) return
    let cancelled = false
    setLoading(true)
    setError('')
    setEquipCart({})
    setItemCart({})
    setExchangeCart({})
    setPresetMsg('')
    setClassCandidates([])
    setSelectedClassId(null)
    setUsedHighPt(false)
    setRunGoalType(RUN_GOALS.DEFAULT_TYPE)
    setRunGoalTarget(DEFAULT_POINTS_TARGET)
    setHeatLevel(HIGH_RISK.DEFAULT_LEVEL)
    setTab('class')

    Promise.all([
      supabase.from('player_points').select('point_type, balance').eq('user_id', user.id),
      supabase
        .from('shop_catalog')
        .select(`
          id, entry_kind, tier_id, item_name, point_type, cost, display_order, required_class_ids,
          equipment_tiers (
            id, name, rarity, base_atk, base_def, base_hp, durability_max,
            equipment_series ( name, slot )
          ),
          item_pool:item_name ( name, kind, sub_kind, heal, atk, def, description )
        `)
        .eq('enabled', true)
        .order('display_order'),
      supabase.from('shop_exchange_rates').select('*').eq('enabled', true),
      // Phase 24c: 拉职业候选
      getGameApi('/api/classes').catch(() => ({ candidates: [], canForceHigh: false, classPtBalance: 0 })),
      // phase-25l 新手保护期计数 + phase-25m 装配预设（列缺失/查询失败容错 → 不显示）
      supabase.from('profiles').select('first_raids_count, saved_loadouts').eq('id', user.id).maybeSingle().then(r => r).catch(() => null),
    ]).then(([balRes, catRes, ratesRes, classRes, profRes]) => {
      if (cancelled) return
      const b = { high_equip_pt: 0, low_equip_pt: 0, item_pt: 0, class_pt: 0 }
      for (const row of (balRes?.data || [])) b[row.point_type] = Number(row.balance) || 0
      setBalances(b)
      const frc = profRes?.data?.first_raids_count
      setFirstRaidsCount(Number.isFinite(Number(frc)) ? Number(frc) : null)
      setPresets(sanitizeLoadoutPresets(profRes?.data?.saved_loadouts))

      const cat = catRes?.data || []
      setCatalog({
        equipment: cat.filter(r => r.entry_kind === 'equipment'),
        consumables: cat.filter(r => r.entry_kind === 'consumable'),
        storyItems: cat.filter(r => r.entry_kind === 'story_item'),
      })
      setRates(ratesRes?.data || [])
      setClassCandidates(classRes?.candidates || [])
    }).catch(e => {
      if (!cancelled) setError(`加载失败：${e?.message || e}`)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [open, user?.id])

  async function handleForceLegendary() {
    if (classForcing || balances.class_pt < 1) return
    setClassForcing(true)
    try {
      const res = await postGameApi('/api/classes', { action: 'force' })
      if (res.candidate) {
        setClassCandidates(prev => {
          if (prev.some(c => c.id === res.candidate.id)) return prev
          return [...prev, res.candidate]
        })
        setBalances(prev => ({ ...prev, class_pt: prev.class_pt - 1 }))
        setUsedHighPt(true)
      }
    } catch (e) {
      setError(`保底刷出失败：${e?.message || e}`)
    } finally {
      setClassForcing(false)
    }
  }

  // ── phase-25m 装配预设：套用 / 保存 / 删除 ──
  function handleApplyPreset(preset) {
    if (!preset) return
    const res = applyPresetToCart(preset, {
      equipment: catalog.equipment,
      consumables: catalog.consumables,
      storyItems: catalog.storyItems,
      rates,
    })
    // 职业有效性校验：仅当候选当前仍存在时才选中（候选每次重 roll，旧 id 可能已失效）
    if (res.classId != null && classCandidates.some(c => c.id === res.classId)) {
      setSelectedClassId(res.classId)
    }
    setEquipCart(res.equipCart)
    setItemCart(res.itemCart)
    setExchangeCart(res.exchangeCart)
    const dropped = res.dropped.equip + res.dropped.items + res.dropped.exchanges
    setPresetMsg(dropped > 0 ? `已套用「${preset.name}」（${dropped} 项已失效已跳过）` : `已套用「${preset.name}」`)
  }

  async function handleSavePreset(rawName) {
    if (presetSaving || !user?.id) return
    const preset = buildPresetFromCart({ name: rawName, classId: selectedClassId, equipCart, itemCart, exchangeCart })
    const { ok, presets: next, reason } = upsertLoadoutPresets(presets, preset, LOADOUT_PRESETS.MAX_SLOTS)
    if (!ok) {
      setPresetMsg(reason === 'slots-full' ? `预设已满（最多 ${LOADOUT_PRESETS.MAX_SLOTS} 套），请先删除一套` : '保存失败：预设无效')
      return
    }
    setPresetSaving(true)
    try {
      const { error: upErr } = await supabase.from('profiles').update({ saved_loadouts: next }).eq('id', user.id)
      if (upErr) throw upErr
      setPresets(next)
      setPresetMsg(`已保存「${preset.name}」`)
    } catch (e) {
      setPresetMsg(`保存失败：${e?.message || e}`)
    } finally {
      setPresetSaving(false)
    }
  }

  async function handleDeletePreset(name) {
    if (presetSaving || !user?.id) return
    const next = removeLoadoutPreset(presets, name)
    setPresetSaving(true)
    try {
      const { error: upErr } = await supabase.from('profiles').update({ saved_loadouts: next }).eq('id', user.id)
      if (upErr) throw upErr
      setPresets(next)
      setPresetMsg(`已删除「${name}」`)
    } catch (e) {
      setPresetMsg(`删除失败：${e?.message || e}`)
    } finally {
      setPresetSaving(false)
    }
  }

  // ── 计算 cart 扣点（含 exchange 影响） ──
  const previewBalances = useMemo(() => {
    const out = { ...balances }

    // 1) 兑换：先扣 from 再加 to（按顺序，保证中间余额准确）
    for (const [rateId, times] of Object.entries(exchangeCart)) {
      const T = Number(times) || 0
      if (T <= 0) continue
      const rate = rates.find(r => r.id === Number(rateId))
      if (!rate) continue
      out[rate.from_type] = (out[rate.from_type] || 0) - rate.from_amount * T
      out[rate.to_type] = (out[rate.to_type] || 0) + rate.to_amount * T
    }

    // 2) 装备购买
    for (const cid of Object.keys(equipCart)) {
      if (!equipCart[cid]) continue
      const row = catalog.equipment.find(c => c.id === Number(cid))
      if (!row) continue
      out[row.point_type] = (out[row.point_type] || 0) - row.cost
    }

    // 3) 消耗品+剧情物品
    for (const [cid, qty] of Object.entries(itemCart)) {
      const Q = Number(qty) || 0
      if (Q <= 0) continue
      const row = [...catalog.consumables, ...catalog.storyItems].find(c => c.id === Number(cid))
      if (!row) continue
      out[row.point_type] = (out[row.point_type] || 0) - row.cost * Q
    }

    return out
  }, [balances, equipCart, itemCart, exchangeCart, rates, catalog])

  const hasInsufficient = useMemo(
    () => Object.values(previewBalances).some(v => v < 0),
    [previewBalances],
  )

  const cartSummary = useMemo(() => {
    const equipCount = Object.values(equipCart).filter(Boolean).length
    const itemCount = Object.values(itemCart).reduce((s, q) => s + (Number(q) || 0), 0)
    const exchangeCount = Object.values(exchangeCart).reduce((s, t) => s + (Number(t) || 0), 0)
    return { equipCount, itemCount, exchangeCount }
  }, [equipCart, itemCart, exchangeCart])

  // 装备槽冲突检测：每个 slot 至多 1 件
  const equipSlots = useMemo(() => {
    const slots = { probe: null, shield: null, weapon: null, comm: null }
    for (const cid of Object.keys(equipCart)) {
      if (!equipCart[cid]) continue
      const row = catalog.equipment.find(c => c.id === Number(cid))
      const slot = row?.equipment_tiers?.equipment_series?.slot
      if (slot && slots[slot] == null) slots[slot] = row
    }
    return slots
  }, [equipCart, catalog.equipment])

  function toggleEquip(row) {
    const slot = row.equipment_tiers?.equipment_series?.slot
    if (!slot) return
    setEquipCart(prev => {
      const next = { ...prev }
      // 如果已经选中，取消
      if (next[row.id]) {
        delete next[row.id]
        return next
      }
      // 否则替换该槽位现有选择
      for (const cid of Object.keys(next)) {
        const r = catalog.equipment.find(c => c.id === Number(cid))
        if (r?.equipment_tiers?.equipment_series?.slot === slot) delete next[cid]
      }
      next[row.id] = true
      return next
    })
  }

  function changeItemQty(catalogId, delta) {
    setItemCart(prev => {
      const cur = Number(prev[catalogId]) || 0
      const next = Math.max(0, cur + delta)
      const out = { ...prev }
      if (next === 0) delete out[catalogId]
      else out[catalogId] = next
      return out
    })
  }

  function changeExchange(rateId, delta) {
    setExchangeCart(prev => {
      const cur = Number(prev[rateId]) || 0
      const next = Math.max(0, cur + delta)
      const out = { ...prev }
      if (next === 0) delete out[rateId]
      else out[rateId] = next
      return out
    })
  }

  async function handleConfirm() {
    if (hasInsufficient) return
    if (!selectedClassId) {
      setError('请先选择一个职业')
      setTab('class')
      return
    }
    setConfirming(true)
    try {
      const catalogPurchases = []
      for (const cid of Object.keys(equipCart)) {
        if (equipCart[cid]) catalogPurchases.push({ catalogId: Number(cid), qty: 1 })
      }
      for (const [cid, qty] of Object.entries(itemCart)) {
        const Q = Number(qty) || 0
        if (Q > 0) catalogPurchases.push({ catalogId: Number(cid), qty: Q })
      }
      const exchanges = []
      for (const [rid, times] of Object.entries(exchangeCart)) {
        const T = Number(times) || 0
        if (T > 0) exchanges.push({ rateId: Number(rid), times: T })
      }
      // 本局目标：sanitizeRunGoal 在未启用 / 选 none 时返回 null，仅有效时附带（additive，旧 join 流程忽略未知字段）
      const runGoal = sanitizeRunGoal({ type: runGoalType, target: runGoalTarget })
      // 高危出勤：sanitizeHeatLevel 在未启用时恒返回 0，仅 > 0 时附带（additive，旧 join 流程忽略未知字段）
      const safeHeat = sanitizeHeatLevel(heatLevel)
      await onConfirm({
        classId: selectedClassId,
        usedHighPt,
        catalogPurchases,
        exchanges,
        ...(runGoal ? { runGoal } : {}),
        ...(safeHeat > 0 ? { heatLevel: safeHeat } : {}),
      })
    } catch (e) {
      setError(e?.message || '提交失败')
    } finally {
      setConfirming(false)
    }
  }

  if (!open) return null

  // 首局自我筛选框架（research 2026-05-29-C，FIRST_CONTACT_FRAMING.ENABLED 门控 + 仅 first_raids_count===0）
  const firstContact = firstContactFraming(firstRaidsCount)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(4px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div style={{
        background: C.bg1, borderRadius: 14, border: `1px solid ${C.border}`,
        width: '95%', maxWidth: 980, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: `0 0 60px rgba(0,0,0,0.6), 0 0 2px ${C.accent}30`,
        overflow: 'hidden',
      }}>
        {/* 顶部标题 + 关闭 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}>
              🎒 入场准备
              {NEWBIE_PROTECTION.ENABLED && firstRaidsCount != null && firstRaidsCount < NEWBIE_PROTECTION.FIRST_RAIDS && (
                <span
                  title={`前 ${NEWBIE_PROTECTION.FIRST_RAIDS} 局撤离失败返还 ${Math.round(NEWBIE_PROTECTION.REFUND_RATE * 100)}% 入场购买点数（已出勤 ${firstRaidsCount}/${NEWBIE_PROTECTION.FIRST_RAIDS}）`}
                  style={{
                    fontSize: 11, fontWeight: 600, color: C.green,
                    background: `${C.green}1a`, border: `1px solid ${C.green}55`,
                    borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap',
                  }}
                >
                  🛡 新手 raid · 失败返还 {Math.round(NEWBIE_PROTECTION.REFUND_RATE * 100)}%
                </span>
              )}
            </div>
            {roomTitle && <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{roomTitle}</div>}
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(14,17,23,0.5)', border: `1px solid ${C.border}`, borderRadius: 6,
            padding: '4px 10px', color: C.dim, cursor: 'pointer', fontSize: 16,
          }}>✕</button>
        </div>

        {/* 4 类点数余额栏 */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
          padding: '12px 20px', borderBottom: `1px solid ${C.border}`, background: C.bg0, flexShrink: 0,
        }}>
          {['high_equip_pt', 'low_equip_pt', 'item_pt', 'class_pt'].map(t => {
            const meta = POINT_META[t]
            const cur = balances[t] || 0
            const preview = previewBalances[t] || 0
            const insufficient = preview < 0
            return (
              <div key={t} style={{
                padding: '8px 10px', borderRadius: 8,
                background: insufficient ? `${C.red}15` : C.bg2,
                border: `1px solid ${insufficient ? C.red : C.border}`,
                borderLeft: `3px solid ${meta.color}`,
              }}>
                <div style={{ fontSize: 10, color: C.dim, marginBottom: 2 }}>
                  {meta.icon} {meta.label}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: insufficient ? C.red : meta.color, fontFamily: 'monospace' }}>
                    {preview}
                  </span>
                  {preview !== cur && (
                    <span style={{ fontSize: 10, color: C.dim2, textDecoration: 'line-through' }}>{cur}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* 首次接触自我筛选框架卡（research 2026-05-29-C，FIRST_CONTACT_FRAMING.ENABLED 门控 + 仅玩家首局，预埋不启用） */}
        {firstContact.active && (
          <div style={{
            margin: '12px 20px 0', padding: '14px 16px', flexShrink: 0,
            background: `linear-gradient(180deg, ${C.purple}14, ${C.bg2})`,
            border: `1px solid ${C.purple}55`, borderLeft: `3px solid ${C.purple}`,
            borderRadius: 10,
          }}>
            {firstContact.title && (
              <div style={{ fontSize: 12, fontWeight: 700, color: C.purple, letterSpacing: 1, marginBottom: 8 }}>
                {firstContact.title}
              </div>
            )}
            {firstContact.lines.map((ln, i) => (
              <p key={i} style={{ fontSize: 12.5, lineHeight: 1.7, color: C.text, margin: i === 0 ? 0 : '6px 0 0' }}>
                {ln}
              </p>
            ))}
            {firstContact.signature && (
              <div style={{ fontSize: 11, color: C.dim, marginTop: 8, textAlign: 'right', fontStyle: 'italic' }}>
                {firstContact.signature}
              </div>
            )}
          </div>
        )}

        {/* phase-25m 装配预设栏（LOADOUT_PRESETS.ENABLED 门控，预埋不启用） */}
        {LOADOUT_PRESETS.ENABLED && (
          <PresetBar
            presets={presets}
            onApply={handleApplyPreset}
            onSave={handleSavePreset}
            onDelete={handleDeletePreset}
            saving={presetSaving}
            msg={presetMsg}
            maxSlots={LOADOUT_PRESETS.MAX_SLOTS}
          />
        )}

        {/* 本局目标选择条（research 2026-05-29-A，RUN_GOALS.ENABLED 门控，预埋不启用） */}
        {RUN_GOALS.ENABLED && (
          <RunGoalBar
            selectedType={runGoalType}
            pointsTarget={runGoalTarget}
            onSelect={setRunGoalType}
            onChangeTarget={setRunGoalTarget}
          />
        )}

        {/* 高危出勤选择条（research 2026-05-29-B，HIGH_RISK.ENABLED 门控，预埋不启用） */}
        {HIGH_RISK.ENABLED && (
          <HighRiskBar selectedLevel={heatLevel} onSelect={setHeatLevel} />
        )}

        {/* tab 切换 */}
        <div style={{
          display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          {[
            { key: 'class',     label: `✦ 职业${selectedClassId ? ' ✓' : ''}` },
            { key: 'equipment', label: `⚔ 装备购买${cartSummary.equipCount > 0 ? ` (${cartSummary.equipCount}/4)` : ''}` },
            { key: 'consumable', label: `💊 道具购买${cartSummary.itemCount > 0 ? ` (${cartSummary.itemCount})` : ''}` },
            { key: 'exchange',  label: `💱 商店兑换${cartSummary.exchangeCount > 0 ? ` (${cartSummary.exchangeCount})` : ''}` },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: '10px 0', cursor: 'pointer',
              background: tab === t.key ? C.bg2 : 'transparent',
              border: 'none', borderBottom: `2px solid ${tab === t.key ? C.accent : 'transparent'}`,
              color: tab === t.key ? C.text : C.dim, fontWeight: 600, fontSize: 13,
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {loading && <div style={{ textAlign: 'center', padding: 40, color: C.dim }}>加载中...</div>}
          {error && <div style={{ color: C.red, padding: 12, background: `${C.red}10`, borderRadius: 6 }}>{error}</div>}

          {!loading && !error && tab === 'class' && (
            <ClassList
              candidates={classCandidates}
              selectedId={selectedClassId}
              onSelect={setSelectedClassId}
              classPtBalance={balances.class_pt}
              onForceLegendary={handleForceLegendary}
              forcing={classForcing}
              usedHighPt={usedHighPt}
            />
          )}
          {!loading && !error && tab === 'equipment' && (
            <EquipmentList
              rows={catalog.equipment}
              selectedClassId={selectedClassId}
              cart={equipCart}
              slotsState={equipSlots}
              onToggle={toggleEquip}
              previewBal={previewBalances}
            />
          )}
          {!loading && !error && tab === 'consumable' && (
            <ItemList rows={[...catalog.consumables, ...catalog.storyItems]} cart={itemCart} onChange={changeItemQty} previewBal={previewBalances} />
          )}
          {!loading && !error && tab === 'exchange' && (
            <ExchangeList rates={rates} cart={exchangeCart} onChange={changeExchange} previewBal={previewBalances} />
          )}
        </div>

        {/* 底部确认 */}
        <div style={{
          padding: '12px 20px', borderTop: `1px solid ${C.border}`, flexShrink: 0,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 11, color: hasInsufficient || !selectedClassId ? C.red : C.dim }}>
            {!selectedClassId
              ? '⚠ 请先选择职业'
              : hasInsufficient
                ? '⚠ 点数不足，请减少购买或先兑换'
                : `已选职业 + ${cartSummary.equipCount} 装备 / ${cartSummary.itemCount} 道具 / ${cartSummary.exchangeCount} 次兑换`}
          </div>
          <button
            onClick={handleConfirm}
            disabled={hasInsufficient || confirming || !selectedClassId}
            style={{
              padding: '10px 28px', borderRadius: 8, border: 'none',
              background: hasInsufficient || !selectedClassId ? C.bg0 : C.green,
              color: hasInsufficient || !selectedClassId ? C.dim2 : '#fff',
              cursor: hasInsufficient || confirming || !selectedClassId ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 700,
              opacity: confirming ? 0.6 : 1,
            }}
          >
            {confirming ? '装载中...' : '🚀 进入虚拟空间'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────── 子组件 ─────────────────────────────

// phase-25m 装配预设栏：芯片式预设列表（点名套用 / ✕ 删除）+ 内联命名保存
function PresetBar({ presets, onApply, onSave, onDelete, saving, msg, maxSlots }) {
  const [name, setName] = useState('')
  const full = presets.length >= maxSlots
  return (
    <div style={{
      display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
      padding: '8px 20px', borderBottom: `1px solid ${C.border}`, background: C.bg2, flexShrink: 0,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.dim, whiteSpace: 'nowrap' }}>📋 预设</span>
      {presets.length === 0 && (
        <span style={{ fontSize: 11, color: C.dim2 }}>暂无保存的装配</span>
      )}
      {presets.map(p => (
        <span key={p.name} style={{
          display: 'inline-flex', alignItems: 'center', gap: 2,
          borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg0,
        }}>
          <button
            onClick={() => onApply(p)}
            disabled={saving}
            title="套用此预设"
            style={{
              background: 'transparent', border: 'none', color: C.accent,
              padding: '3px 8px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 600,
            }}
          >
            {p.name}
          </button>
          <button
            onClick={() => onDelete(p.name)}
            disabled={saving}
            title="删除此预设"
            style={{
              background: 'transparent', border: 'none', borderLeft: `1px solid ${C.border}`,
              color: C.dim2, padding: '3px 6px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 10,
            }}
          >
            ✕
          </button>
        </span>
      ))}
      <span style={{ flex: 1 }} />
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="预设名"
        maxLength={24}
        style={{
          width: 96, fontSize: 11, padding: '4px 8px', borderRadius: 6,
          background: C.bg0, border: `1px solid ${C.border}`, color: C.text,
        }}
      />
      <button
        onClick={() => { onSave(name); setName('') }}
        disabled={saving || full}
        title={full ? `预设已满（最多 ${maxSlots} 套）` : '将当前装配存为预设'}
        style={{
          padding: '4px 12px', borderRadius: 6, border: 'none',
          background: saving || full ? C.bg0 : C.accent,
          color: saving || full ? C.dim2 : '#fff',
          cursor: saving || full ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 600,
        }}
      >
        💾 存为预设
      </button>
      {msg && <span style={{ fontSize: 10, color: C.dim, width: '100%' }}>{msg}</span>}
    </div>
  )
}

// 本局目标选择条（research 2026-05-29-A）：芯片单选 + collect_points 目标步进。
// 红线提示文案显式声明评级不附带任何经济收益（economy-canon §3 / narrative-vision §6.1）。
function RunGoalBar({ selectedType, pointsTarget, onSelect, onChangeTarget }) {
  const selectedDef = RUN_GOALS.TYPES.find(t => t.type === selectedType) || null
  const showStepper = !!selectedDef?.targetEditable
  function stepTarget(delta) {
    const cur = Number(pointsTarget) || RUN_GOALS.POINTS_TARGET_MIN
    const next = cur + delta * RUN_GOALS.POINTS_TARGET_STEP
    onChangeTarget(Math.max(RUN_GOALS.POINTS_TARGET_MIN, Math.min(RUN_GOALS.POINTS_TARGET_MAX, next)))
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
      padding: '8px 20px', borderBottom: `1px solid ${C.border}`, background: C.bg2, flexShrink: 0,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.dim, whiteSpace: 'nowrap' }}>🎯 本局目标</span>
      {RUN_GOALS.TYPES.map(g => {
        const active = g.type === selectedType
        return (
          <button
            key={g.type}
            onClick={() => onSelect(g.type)}
            title={g.desc}
            style={{
              borderRadius: 6, border: `1px solid ${active ? C.accent : C.border}`,
              background: active ? `${C.accent}1a` : C.bg0,
              color: active ? C.accent : C.dim,
              padding: '3px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 600,
            }}
          >
            {g.icon} {g.label}
          </button>
        )
      })}
      {showStepper && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
          <button onClick={() => stepTarget(-1)} disabled={pointsTarget <= RUN_GOALS.POINTS_TARGET_MIN} style={btn(pointsTarget <= RUN_GOALS.POINTS_TARGET_MIN)}>-</button>
          <span style={{ minWidth: 48, textAlign: 'center', fontWeight: 700, color: C.accent, fontFamily: 'monospace' }}>{pointsTarget} 点</span>
          <button onClick={() => stepTarget(1)} disabled={pointsTarget >= RUN_GOALS.POINTS_TARGET_MAX} style={btn(pointsTarget >= RUN_GOALS.POINTS_TARGET_MAX)}>+</button>
        </span>
      )}
      <span style={{ flex: 1 }} />
      {selectedDef && (
        <span style={{ fontSize: 10, color: C.dim2, width: '100%' }}>
          {selectedDef.desc}
          {selectedDef.type !== RUN_GOALS.DEFAULT_TYPE && ' · 仅影响结算评级展示，不附带任何点数 / 掉落收益'}
        </span>
      )}
    </div>
  )
}

// 高危出勤选择条（research 2026-05-29-B）：芯片单选 heatLevel，与 Streak-breaker（下行）对称的上行阀门。
// 红线提示文案显式声明这是"承担更高死亡风险换奖励"的对价、非免费收益（economy-canon §6.1）。
function HighRiskBar({ selectedLevel, onSelect }) {
  const selectedDef = HIGH_RISK.LEVELS.find(l => l.level === selectedLevel) || HIGH_RISK.LEVELS[0]
  const risky = selectedDef.level > 0
  return (
    <div style={{
      display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
      padding: '8px 20px', borderBottom: `1px solid ${C.border}`, background: C.bg2, flexShrink: 0,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.dim, whiteSpace: 'nowrap' }}>🔥 高危出勤</span>
      {HIGH_RISK.LEVELS.map(l => {
        const active = l.level === selectedLevel
        const tone = l.level === 0 ? C.accent : C.orange
        return (
          <button
            key={l.level}
            onClick={() => onSelect(l.level)}
            title={l.desc}
            style={{
              borderRadius: 6, border: `1px solid ${active ? tone : C.border}`,
              background: active ? `${tone}1a` : C.bg0,
              color: active ? tone : C.dim,
              padding: '3px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 600,
            }}
          >
            {l.icon} {l.label}
          </button>
        )
      })}
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 10, color: risky ? C.orange : C.dim2, width: '100%' }}>
        {selectedDef.desc}
        {risky && ' · 奖励是承担更高死亡风险的对价，非免费收益（阵亡损失同步放大）'}
      </span>
    </div>
  )
}

const PERK_LABEL = {
  search_bonus:         { label: '搜索成功率', icon: '🔍', formatter: v => `+${Math.round(v * 100)}%` },
  pollution_resist:     { label: '污染抵抗',   icon: '☢',  formatter: v => v >= 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%` },
  combat_dmg_mult:      { label: '战斗伤害',   icon: '⚔', formatter: v => `+${Math.round(v * 100)}%` },
  combat_def_mult:      { label: '战斗防御',   icon: '🛡', formatter: v => `+${Math.round(v * 100)}%` },
  omega_window_bonus:   { label: 'Ω 窗口',     icon: '⏳', formatter: v => `+${v} 回合` },
  fragment_drop_bonus:  { label: '残片掉率',   icon: '📡', formatter: v => `+${Math.round(v * 100)}%` },
  catalog_unlock_tag:   { label: '专属商店',   icon: '🛒', formatter: v => `${v}` },
}

function ClassList({ candidates, selectedId, onSelect, classPtBalance, onForceLegendary, forcing, usedHighPt }) {
  const hasLegendaryInList = candidates.some(c => c.rarity === 'legendary')
  // 软保底：1 职业点 = 1 次必出 legendary；每次成功撤离 +1 职业点
  const pityRemaining = Math.max(0, 1 - (Number(classPtBalance) || 0))

  return (
    <div>
      {candidates.length === 0 && (
        <div style={{ color: C.dim, textAlign: 'center', padding: 30 }}>加载职业候选中...</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
        {candidates.map(c => {
          const isSelected = selectedId === c.id
          const legendaryColor = c.rarity === 'legendary' ? C.yellow : C.accent
          return (
            <div key={c.id}
              onClick={() => onSelect(c.id)}
              style={{
                padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                background: isSelected ? `${legendaryColor}20` : C.bg2,
                border: `1px solid ${isSelected ? legendaryColor : C.border}`,
                borderLeft: `4px solid ${legendaryColor}`,
                transition: 'all 0.15s',
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: legendaryColor }}>
                  {c.name}
                </span>
                <span style={{
                  padding: '1px 8px', borderRadius: 6, fontSize: 9, fontWeight: 700,
                  background: `${legendaryColor}18`, color: legendaryColor, border: `1px solid ${legendaryColor}40`,
                }}>
                  {c.rarity === 'legendary' ? '★ LEGENDARY' : 'NORMAL'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 6 }}>
                {c.description}
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: 10, color: C.dim2, marginBottom: 6 }}>
                <span>ATK +{c.base_atk_bonus}</span>
                <span>DEF +{c.base_def_bonus}</span>
                <span>HP +{c.base_hp_bonus}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {Object.entries(c.perks || {}).map(([k, v]) => {
                  const meta = PERK_LABEL[k]
                  if (!meta) return null
                  return (
                    <span key={k} title={meta.label} style={{
                      fontSize: 10, padding: '2px 6px', borderRadius: 6,
                      background: `${C.purple}15`, color: C.purple, border: `1px solid ${C.purple}30`,
                    }}>
                      {meta.icon} {meta.label} {meta.formatter(v)}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* class_pt 保底刷高级按钮 */}
      <div style={{
        marginTop: 16, padding: '10px 14px', borderRadius: 8,
        background: C.bg2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.orange}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, color: C.text, marginBottom: 2 }}>
              💎 高级职业保底（消耗 1 高级职业点刷出一个 legendary 候选）
            </div>
            <div style={{ fontSize: 10, color: C.dim }}>
              当前余额：<span style={{ color: C.orange, fontWeight: 700 }}>{classPtBalance}</span>
              {usedHighPt && <span style={{ color: C.green, marginLeft: 6 }}>✓ 已保底刷出</span>}
              {hasLegendaryInList && !usedHighPt && <span style={{ color: C.yellow, marginLeft: 6 }}>★ 自然 roll 已包含 legendary</span>}
            </div>
            <div style={{ fontSize: 10, marginTop: 3, color: pityRemaining === 0 ? C.green : C.dim }}>
              {pityRemaining === 0
                ? '✓ 当前已可必出 legendary（点击右侧保底刷出）'
                : `距离必出 legendary 还差 ${pityRemaining} 个职业点 · 每次成功撤离 +1`}
            </div>
          </div>
          <button
            onClick={onForceLegendary}
            disabled={forcing || classPtBalance < 1 || usedHighPt}
            style={{
              padding: '6px 16px', borderRadius: 6, border: 'none',
              background: classPtBalance < 1 || usedHighPt ? C.bg0 : C.orange,
              color: classPtBalance < 1 || usedHighPt ? C.dim2 : '#fff',
              cursor: forcing || classPtBalance < 1 || usedHighPt ? 'not-allowed' : 'pointer',
              fontSize: 12, fontWeight: 700,
            }}
          >
            {forcing ? '刷出中...' : '保底刷出'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EquipmentList({ rows, selectedClassId, cart, slotsState, onToggle, previewBal }) {
  // Phase 24c: 按 required_class_ids 过滤 — 空数组 = 所有 class 可见，否则必须包含 selectedClassId
  const visibleRows = useMemo(() => rows.filter(r => {
    if (!Array.isArray(r.required_class_ids) || r.required_class_ids.length === 0) return true
    return selectedClassId != null && r.required_class_ids.includes(Number(selectedClassId))
  }), [rows, selectedClassId])

  // 按 slot 分组
  const grouped = useMemo(() => {
    const out = { probe: [], shield: [], weapon: [], comm: [] }
    for (const r of visibleRows) {
      const slot = r.equipment_tiers?.equipment_series?.slot
      if (slot && out[slot]) out[slot].push(r)
    }
    return out
  }, [visibleRows])

  if (rows.length === 0) return <div style={{ color: C.dim, textAlign: 'center', padding: 30 }}>商店暂无装备</div>

  return (
    <div>
      <div style={{
        marginBottom: 12, padding: '8px 12px', borderRadius: 6,
        background: `${C.yellow}12`, border: `1px solid ${C.yellow}40`,
        fontSize: 11, color: C.yellow, lineHeight: 1.5,
      }}>
        ⚠ 入场装备为本局一次性消耗：撤离成功按耐久折算返还点数，阵亡则永久销毁——装备不会保留到下一局。
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
      {['probe', 'shield', 'weapon', 'comm'].map(slot => (
        <div key={slot}>
          <div style={{ fontSize: 11, color: C.dim, fontWeight: 700, marginBottom: 6, letterSpacing: 1 }}>
            {SLOT_LABEL[slot]} {slotsState[slot] && <span style={{ color: C.green }}>✓ 已选</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {grouped[slot].length === 0 && <div style={{ fontSize: 11, color: C.dim2 }}>暂无</div>}
            {grouped[slot].map(r => {
              const tier = r.equipment_tiers || {}
              const rar = tier.rarity || 'common'
              const isSelected = !!cart[r.id]
              const canAfford = previewBal[r.point_type] >= 0 || isSelected
              return (
                <div key={r.id}
                  onClick={() => onToggle(r)}
                  style={{
                    padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                    background: isSelected ? `${RARITY_COLOR[rar]}20` : C.bg2,
                    border: `1px solid ${isSelected ? RARITY_COLOR[rar] : C.border}`,
                    opacity: !canAfford ? 0.5 : 1,
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 12, color: RARITY_COLOR[rar] }}>
                      {tier.name || `tier#${tier.id}`}
                    </span>
                    <span style={{ fontSize: 11, color: POINT_META[r.point_type]?.color || C.dim }}>
                      {POINT_META[r.point_type]?.icon} {r.cost}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>
                    ATK {tier.base_atk || 0} · DEF {tier.base_def || 0} · HP {tier.base_hp || 0} · Dur {tier.durability_max || '-'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
      </div>
    </div>
  )
}

function ItemList({ rows, cart, onChange, previewBal }) {
  if (rows.length === 0) return <div style={{ color: C.dim, textAlign: 'center', padding: 30 }}>商店暂无道具</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(r => {
        const item = r.item_pool || {}
        const qty = Number(cart[r.id]) || 0
        const canAddMore = previewBal[r.point_type] >= r.cost
        return (
          <div key={r.id} style={{
            display: 'grid', gridTemplateColumns: '1fr auto', gap: 12,
            padding: '8px 12px', borderRadius: 6, background: C.bg2, border: `1px solid ${C.border}`,
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{item.name || r.item_name}</span>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: `${C.dim}20`, color: C.dim }}>
                  {item.kind || r.entry_kind}
                </span>
                <span style={{ fontSize: 11, color: POINT_META[r.point_type]?.color || C.dim }}>
                  {POINT_META[r.point_type]?.icon} {r.cost} / 个
                </span>
              </div>
              {item.description && (
                <div style={{ fontSize: 11, color: C.dim, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.description}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => onChange(r.id, -1)} disabled={qty === 0}
                style={btn(qty === 0)}>-</button>
              <span style={{ minWidth: 28, textAlign: 'center', fontWeight: 700, color: qty > 0 ? POINT_META[r.point_type]?.color : C.dim2 }}>{qty}</span>
              <button onClick={() => onChange(r.id, 1)} disabled={!canAddMore}
                style={btn(!canAddMore)}>+</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ExchangeList({ rates, cart, onChange, previewBal }) {
  if (rates.length === 0) return <div style={{ color: C.dim, textAlign: 'center', padding: 30 }}>商店暂无兑换汇率</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rates.map(r => {
        const times = Number(cart[r.id]) || 0
        const fromMeta = POINT_META[r.from_type]
        const toMeta = POINT_META[r.to_type]
        const canAddMore = previewBal[r.from_type] >= r.from_amount
        return (
          <div key={r.id} style={{
            display: 'grid', gridTemplateColumns: '1fr auto', gap: 12,
            padding: '10px 14px', borderRadius: 6, background: C.bg2, border: `1px solid ${C.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
              <span style={{ padding: '2px 8px', borderRadius: 6, background: `${fromMeta?.color}18`, color: fromMeta?.color, fontWeight: 600 }}>
                {r.from_amount} {fromMeta?.icon} {fromMeta?.label}
              </span>
              <span style={{ color: C.dim }}>→</span>
              <span style={{ padding: '2px 8px', borderRadius: 6, background: `${toMeta?.color}18`, color: toMeta?.color, fontWeight: 700 }}>
                {r.to_amount} {toMeta?.icon} {toMeta?.label}
              </span>
              {r.description && <span style={{ fontSize: 10, color: C.dim2, marginLeft: 6 }}>{r.description}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => onChange(r.id, -1)} disabled={times === 0} style={btn(times === 0)}>-</button>
              <span style={{ minWidth: 28, textAlign: 'center', fontWeight: 700, color: times > 0 ? toMeta?.color : C.dim2 }}>×{times}</span>
              <button onClick={() => onChange(r.id, 1)} disabled={!canAddMore} style={btn(!canAddMore)}>+</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function btn(disabled) {
  return {
    width: 28, height: 28, borderRadius: 4,
    background: disabled ? '#0a0d12' : '#21262d',
    border: `1px solid ${disabled ? '#21262d' : '#30363d'}`,
    color: disabled ? '#484f58' : '#e6edf3',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 700, fontSize: 14,
  }
}
