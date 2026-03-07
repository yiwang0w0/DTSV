'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Drawer, DeleteBtn } from '../_shared/ui'

const INPUT = { width: '100%', padding: '9px 13px', borderRadius: 7, border: '1px solid #30363d', background: '#161b22', color: '#e6edf3', fontSize: 13, outline: 'none', boxSizing: 'border-box' }
const LABEL = { display: 'block', fontSize: 10, color: '#8b949e', marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }
const BTN = (bg, color, extra = {}) => ({ padding: '8px 16px', borderRadius: 7, border: 'none', background: bg, color, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, ...extra })
const CARD = (extra = {}) => ({ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: 16, ...extra })
const TAG = (color) => ({ display: 'inline-block', fontSize: 10, padding: '1px 8px', borderRadius: 8, background: `${color}15`, color, border: `1px solid ${color}30` })

const RARITY_META = {
  common:    { label: '普通', color: '#8b949e' },
  uncommon:  { label: '优秀', color: '#3fb950' },
  rare:      { label: '稀有', color: '#58a6ff' },
  epic:      { label: '史诗', color: '#bc8cff' },
  legendary: { label: '传说', color: '#d29922' },
  mythic:    { label: '神话', color: '#f85149' },
}
const ELEMENT_META = {
  none:    { label: '无', icon: '—'  },
  fire:    { label: '火', icon: '🔥' },
  ice:     { label: '冰', icon: '❄️' },
  thunder: { label: '雷', icon: '⚡' },
  wind:    { label: '风', icon: '🌀' },
  light:   { label: '光', icon: '✨' },
  dark:    { label: '暗', icon: '🌑' },
  water:   { label: '水', icon: '💧' },
}
const SLOT_META = {
  weapon:    { label: '武器', icon: '⚔️'  },
  armor:     { label: '护甲', icon: '🛡️'  },
  helmet:    { label: '头盔', icon: '⛑️'  },
  boots:     { label: '靴子', icon: '👢'  },
  accessory: { label: '饰品', icon: '💍'  },
}
const FAIL_BEHAVIORS = [
  { value: 'keep_materials', label: '材料保留（可重试）' },
  { value: 'lose_materials', label: '材料损失' },
  { value: 'downgrade',      label: '前置装备受损' },
]
const EMPTY_SERIES = { name: '', slot: 'weapon', description: '', icon: '⚔️', max_tier: 5 }
const EMPTY_TIER = {
  name: '', rarity: 'common', variant: '', tier: 1,
  base_atk: 0, base_def: 0, base_hp: 0, base_spd: 0,
  element: 'none', element_power: 0, durability_max: 0,
  passive_skill_id: null, passive_note: '', req_level: 1, req_class: [], special_note: '',
}
const EMPTY_RECIPE = {
  recipe_name: '', requires_prev_tier_id: null,
  requires_prev_series_id: null, requires_prev_tier_num: null,
  gold_cost: 0, success_rate: 1.0, fail_behavior: 'keep_materials',
  ingredients: [],
}

function PyramidView({ seriesTree, onSelectTier, selectedTierId }) {
  if (!seriesTree) return (
    <div style={{ textAlign: 'center', padding: 40, color: '#484f58' }}>选择一个系列查看金字塔</div>
  )
  const { byTier, maxTier } = seriesTree
  const tiers = Array.from({ length: maxTier }, (_, i) => maxTier - i)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', padding: '16px 0' }}>
      {tiers.map(tierNum => {
        const nodes = byTier[tierNum] || []
        return (
          <div key={tierNum} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            {tierNum < maxTier && (
              <div style={{ display: 'flex', justifyContent: 'center', width: '100%', position: 'relative', height: 20 }}>
                {nodes.length > 0 && (
                  <div style={{ width: nodes.length > 1 ? '60%' : 2, height: 2, background: '#30363d', position: 'absolute', top: 10 }} />
                )}
                {nodes.map((_, i) => (
                  <div key={i} style={{ position: 'absolute', top: 0, width: 2, height: '100%', background: '#30363d', left: nodes.length === 1 ? '50%' : `${(i / (nodes.length - 1)) * 60 + 20}%` }} />
                ))}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <div style={{ fontSize: 10, color: '#484f58', fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>T{tierNum}</div>
              {nodes.length > 1 && <div style={{ fontSize: 10, color: '#30363d' }}>— {nodes.length} 个变体</div>}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {nodes.map(node => {
                const rarity  = RARITY_META[node.rarity] || RARITY_META.common
                const element = ELEMENT_META[node.element] || ELEMENT_META.none
                const isSelected = selectedTierId === node.id
                return (
                  <div key={node.id} onClick={() => onSelectTier(node)}
                    style={{ padding: '10px 16px', borderRadius: 10, cursor: 'pointer', background: isSelected ? `${rarity.color}18` : '#1c2129', border: `1px solid ${isSelected ? rarity.color : '#30363d'}`, boxShadow: isSelected ? `0 0 12px ${rarity.color}30` : 'none', transition: 'all 0.15s', minWidth: 120, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, marginBottom: 4, opacity: 0.7 }}>{element.icon} {element.label}</div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: rarity.color, marginBottom: 4 }}>{node.name}</div>
                    <div style={{ ...TAG(rarity.color), fontSize: 9 }}>{rarity.label}</div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 6, fontSize: 10, color: '#8b949e' }}>
                      {node.base_atk > 0 && <span style={{ color: '#f85149' }}>ATK {node.base_atk}</span>}
                      {node.base_def > 0 && <span style={{ color: '#58a6ff' }}>DEF {node.base_def}</span>}
                    </div>
                    {node.passive && <div style={{ marginTop: 5, fontSize: 10, color: '#bc8cff' }}>{node.passive.icon} {node.passive.name}</div>}
                    {node.recipe && <div style={{ marginTop: 4, fontSize: 9, color: '#484f58' }}>{node.recipe[0]?.ingredients?.length || 0} 种材料</div>}
                  </div>
                )
              })}
              {nodes.length === 0 && (
                <div style={{ padding: '10px 20px', borderRadius: 10, border: '1px dashed #30363d', color: '#484f58', fontSize: 12 }}>空阶级</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function EquipmentSeriesSection({ toast }) {
  const [seriesList, setSeriesList]   = useState([])
  const [tiers, setTiers]             = useState([])
  const [allPassives, setAllPassives] = useState([])
  const [allItems, setAllItems]       = useState([])
  const [seriesTree, setSeriesTree]   = useState(null)
  const [loading, setLoading]         = useState(true)

  const [selectedSeries, setSelectedSeries] = useState(null)
  const [selectedTier, setSelectedTier]     = useState(null)

  const [seriesDrawer, setSeriesDrawer] = useState(false)
  const [tierDrawer, setTierDrawer]     = useState(false)
  const [recipeDrawer, setRecipeDrawer] = useState(false)

  const [editSeries, setEditSeries] = useState(null)
  const [editTier, setEditTier]     = useState(null)
  const [editRecipe, setEditRecipe] = useState(null)

  async function loadAll() {
    setLoading(true)
    const [{ data: s }, { data: p }, { data: i }] = await Promise.all([
      supabase.from('equipment_series').select('*').order('id'),
      supabase.from('passive_skills').select('id,name,icon').order('id'),
      supabase.from('item_pool').select('id,name,kind').order('name'),
    ])
    setSeriesList(s || [])
    setAllPassives(p || [])
    setAllItems(i || [])
    setLoading(false)
  }

  async function loadSeriesTree(seriesId) {
    const { data: allTiersRaw } = await supabase
      .from('equipment_tiers')
      .select(`
        *,
        passive:passive_skills(id,name,icon),
        recipe:tier_recipes(
          id, success_rate, gold_cost, fail_behavior,
          requires_prev_tier_id, requires_prev_series_id, requires_prev_tier_num,
          ingredients:recipe_ingredients(
            id, quantity, is_consumed, is_catalyst, ingredient_type,
            item:item_pool(id,name),
            equipment:equipment_tiers(id,name)
          )
        )
      `)
      .eq('series_id', seriesId)
      .order('tier').order('variant')
    setTiers(allTiersRaw || [])
    const maxTier = allTiersRaw?.length ? Math.max(...allTiersRaw.map(t => t.tier)) : 5
    const byTier = {}
    for (const t of allTiersRaw || []) {
      if (!byTier[t.tier]) byTier[t.tier] = []
      byTier[t.tier].push(t)
    }
    setSeriesTree({ seriesId, byTier, maxTier })
  }

  useEffect(() => { loadAll() }, [])

  async function selectSeries(s) {
    setSelectedSeries(s)
    setSelectedTier(null)
    await loadSeriesTree(s.id)
  }

  async function saveSeries() {
    if (!editSeries.name.trim()) { toast('请填写系列名称', 'error'); return }
    const payload = { ...editSeries }
    if (editSeries.id) {
      const id = payload.id; delete payload.id; delete payload.created_at
      await supabase.from('equipment_series').update(payload).eq('id', id)
    } else {
      delete payload.id; delete payload.created_at
      await supabase.from('equipment_series').insert(payload)
    }
    toast(editSeries.id ? '系列已更新' : '系列已添加')
    setSeriesDrawer(false); setEditSeries(null); loadAll()
  }

  async function deleteSeries(id) {
    await supabase.from('equipment_series').delete().eq('id', id)
    toast('系列已删除')
    if (selectedSeries?.id === id) { setSelectedSeries(null); setSeriesTree(null); setTiers([]) }
    loadAll()
  }

  async function saveTier() {
    if (!editTier.name.trim()) { toast('请填写装备名称', 'error'); return }
    const payload = { ...editTier, series_id: selectedSeries.id }
    if (!payload.variant?.trim()) payload.variant = null
    if (editTier.id) {
      const id = payload.id; delete payload.id; delete payload.created_at
      await supabase.from('equipment_tiers').update(payload).eq('id', id)
    } else {
      delete payload.id; delete payload.created_at
      await supabase.from('equipment_tiers').insert(payload)
    }
    toast(editTier.id ? '装备已更新' : '装备已添加')
    setTierDrawer(false); setEditTier(null); loadSeriesTree(selectedSeries.id)
  }

  async function deleteTier(id) {
    await supabase.from('equipment_tiers').delete().eq('id', id)
    toast('装备已删除')
    if (selectedTier?.id === id) setSelectedTier(null)
    loadSeriesTree(selectedSeries.id)
  }

  async function openRecipe(tier) {
    setSelectedTier(tier)
    const recipe = tier.recipe?.[0] || null
    setEditRecipe(recipe ? { ...recipe, ingredients: recipe.ingredients || [] } : { ...EMPTY_RECIPE, ingredients: [] })
    setRecipeDrawer(true)
  }

  async function saveRecipe() {
    const tierId = selectedTier.id
    const payload = {
      result_tier_id: tierId,
      recipe_name: editRecipe.recipe_name,
      requires_prev_tier_id: editRecipe.requires_prev_tier_id || null,
      requires_prev_series_id: editRecipe.requires_prev_series_id || null,
      requires_prev_tier_num: editRecipe.requires_prev_tier_num || null,
      gold_cost: editRecipe.gold_cost || 0,
      success_rate: editRecipe.success_rate,
      fail_behavior: editRecipe.fail_behavior,
    }
    let recipeId = editRecipe.id
    if (recipeId) {
      await supabase.from('tier_recipes').update(payload).eq('id', recipeId)
    } else {
      const { data: inserted } = await supabase.from('tier_recipes').insert(payload).select().single()
      recipeId = inserted?.id
    }
    if (!recipeId) { toast('配方保存失败', 'error'); return }
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId)
    if (editRecipe.ingredients.length > 0) {
      const ingPayload = editRecipe.ingredients
        .filter(i => i.item_id || i.equipment_tier_id)
        .map(i => ({
          recipe_id: recipeId,
          ingredient_type: i.ingredient_type || 'item',
          item_id: i.ingredient_type === 'item' ? i.item_id : null,
          equipment_tier_id: i.ingredient_type === 'equipment' ? i.equipment_tier_id : null,
          quantity: i.quantity || 1,
          is_consumed: i.is_consumed !== false,
          is_catalyst: !!i.is_catalyst,
        }))
      await supabase.from('recipe_ingredients').insert(ingPayload)
    }
    toast('配方已保存')
    setRecipeDrawer(false); loadSeriesTree(selectedSeries.id)
  }

  function addIngredient() {
    setEditRecipe({ ...editRecipe, ingredients: [...editRecipe.ingredients, { ingredient_type: 'item', item_id: null, quantity: 1, is_consumed: true, is_catalyst: false }] })
  }
  function updateIng(idx, patch) {
    const ings = [...editRecipe.ingredients]
    ings[idx] = { ...ings[idx], ...patch }
    setEditRecipe({ ...editRecipe, ingredients: ings })
  }
  function removeIng(idx) {
    setEditRecipe({ ...editRecipe, ingredients: editRecipe.ingredients.filter((_, i) => i !== idx) })
  }

  const e  = editTier   || {}
  const er = editRecipe || {}
  const es = editSeries || {}

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>加载中...</div>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, height: 'calc(100vh - 200px)', minHeight: 500 }}>

      {/* 左栏：系列列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#8b949e', fontWeight: 700 }}>装备系列 ({seriesList.length})</span>
          <button onClick={() => { setEditSeries({ ...EMPTY_SERIES }); setSeriesDrawer(true) }}
            style={BTN('rgba(88,166,255,0.1)', '#58a6ff', { padding: '5px 10px', border: '1px solid rgba(88,166,255,0.2)' })}>+ 新建</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {seriesList.map(s => {
            const slot = SLOT_META[s.slot] || SLOT_META.weapon
            const isActive = selectedSeries?.id === s.id
            return (
              <div key={s.id} onClick={() => selectSeries(s)}
                style={{ padding: '10px 14px', borderRadius: 9, cursor: 'pointer', background: isActive ? 'rgba(88,166,255,0.1)' : '#1c2129', border: `1px solid ${isActive ? '#58a6ff' : '#30363d'}`, transition: 'all 0.15s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span>{s.icon}</span>
                    <span style={{ fontWeight: 600, fontSize: 13, color: isActive ? '#58a6ff' : '#e6edf3' }}>{s.name}</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#8b949e' }}>{slot.icon} {slot.label} · T1~T{s.max_tier}</div>
                </div>
                <div style={{ display: 'flex', gap: 3 }} onClick={ev => ev.stopPropagation()}>
                  <button onClick={() => { setEditSeries({ ...s }); setSeriesDrawer(true) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b949e', fontSize: 13 }}>✏️</button>
                  <DeleteBtn onConfirm={() => deleteSeries(s.id)} />
                </div>
              </div>
            )
          })}
          {seriesList.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#484f58', fontSize: 12 }}>暂无系列，点击新建</div>}
        </div>
      </div>

      {/* 右栏：金字塔 + 详情 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
        {selectedSeries ? (
          <>
            <div style={{ ...CARD(), display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 28 }}>{selectedSeries.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedSeries.name}</div>
                  <div style={{ fontSize: 11, color: '#8b949e' }}>
                    {SLOT_META[selectedSeries.slot]?.label} · {tiers.length} 个阶级装备 · 最高 T{selectedSeries.max_tier}
                  </div>
                </div>
              </div>
              <button onClick={() => { setEditTier({ ...EMPTY_TIER, tier: (seriesTree?.maxTier || 0) + 1 }); setTierDrawer(true) }}
                style={BTN('#58a6ff', '#fff')}>+ 添加阶级</button>
            </div>

            <div style={{ ...CARD({ flex: 1, overflowY: 'auto' }) }}>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                升阶金字塔 — 点击节点查看详情
              </div>
              <PyramidView seriesTree={seriesTree} onSelectTier={tier => setSelectedTier(tier)} selectedTierId={selectedTier?.id} />
            </div>

            {selectedTier && (
              <div style={{ ...CARD({ flexShrink: 0 }), animation: 'fadeInUp 0.2s ease-out' }}>
                <style>{`@keyframes fadeInUp { from { opacity:0; transform: translateY(8px) } to { opacity:1; transform:none } }`}</style>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 16, color: RARITY_META[selectedTier.rarity]?.color }}>{selectedTier.name}</span>
                        <span style={{ ...TAG(RARITY_META[selectedTier.rarity]?.color || '#8b949e'), fontSize: 9 }}>T{selectedTier.tier} · {RARITY_META[selectedTier.rarity]?.label}</span>
                        {selectedTier.variant && <span style={{ ...TAG('#d29922'), fontSize: 9 }}>{selectedTier.variant} 变体</span>}
                        <span style={{ fontSize: 12 }}>{ELEMENT_META[selectedTier.element]?.icon}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#8b949e' }}>
                        {selectedTier.base_atk > 0 && <span>ATK <strong style={{ color: '#f85149' }}>+{selectedTier.base_atk}</strong></span>}
                        {selectedTier.base_def > 0 && <span>DEF <strong style={{ color: '#58a6ff' }}>+{selectedTier.base_def}</strong></span>}
                        {selectedTier.base_hp > 0 && <span>HP <strong style={{ color: '#3fb950' }}>+{selectedTier.base_hp}</strong></span>}
                        {selectedTier.element_power > 0 && <span>元素强度 <strong style={{ color: '#d29922' }}>{selectedTier.element_power}</strong></span>}
                        {selectedTier.durability_max > 0 && <span>耐久 <strong style={{ color: '#bc8cff' }}>{selectedTier.durability_max}</strong></span>}
                        {selectedTier.req_level > 1 && <span>需 Lv.<strong>{selectedTier.req_level}</strong></span>}
                      </div>
                      {selectedTier.passive && <div style={{ marginTop: 5, fontSize: 11, color: '#bc8cff' }}>{selectedTier.passive.icon} 被动：{selectedTier.passive.name}</div>}
                      {selectedTier.recipe?.[0] && (
                        <div style={{ marginTop: 6, fontSize: 11, color: '#8b949e' }}>
                          🔨 配方：{selectedTier.recipe[0].ingredients?.length || 0} 种材料
                          {selectedTier.recipe[0].success_rate < 1 && <span style={{ color: '#d29922', marginLeft: 6 }}>成功率 {Math.round(selectedTier.recipe[0].success_rate * 100)}%</span>}
                          {selectedTier.recipe[0].gold_cost > 0 && <span style={{ color: '#d29922', marginLeft: 6 }}>💰 {selectedTier.recipe[0].gold_cost}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => openRecipe(selectedTier)} style={BTN('rgba(210,153,34,0.1)', '#d29922', { border: '1px solid rgba(210,153,34,0.25)' })}>🔨 配方</button>
                    <button onClick={() => { setEditTier({ ...selectedTier, variant: selectedTier.variant || '' }); setTierDrawer(true) }} style={BTN('rgba(88,166,255,0.1)', '#58a6ff', { border: '1px solid rgba(88,166,255,0.25)' })}>✏️ 编辑</button>
                    <DeleteBtn onConfirm={() => deleteTier(selectedTier.id)} />
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#484f58', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 36 }}>🗡️</div>
            <div>从左侧选择一个装备系列</div>
          </div>
        )}
      </div>

      {/* 系列编辑 Drawer */}
      <Drawer open={seriesDrawer} onClose={() => { setSeriesDrawer(false); setEditSeries(null) }}
        title={es.id ? `编辑系列：${es.name}` : '新建装备系列'} width={520}>
        {editSeries && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 10 }}>
              <div>
                <label style={LABEL}>图标</label>
                <input style={{ ...INPUT, textAlign: 'center', fontSize: 20, padding: 6 }}
                  value={es.icon} onChange={ev => setEditSeries({ ...es, icon: ev.target.value })} maxLength={4} />
              </div>
              <div>
                <label style={LABEL}>系列名称</label>
                <input style={INPUT} value={es.name} onChange={ev => setEditSeries({ ...es, name: ev.target.value })} placeholder="如：常磐之刃" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={LABEL}>装备槽位</label>
                <select style={INPUT} value={es.slot} onChange={ev => setEditSeries({ ...es, slot: ev.target.value })}>
                  {Object.entries(SLOT_META).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
              <div>
                <label style={LABEL}>最高阶级</label>
                <input type="number" style={INPUT} value={es.max_tier} min={1} max={10}
                  onChange={ev => setEditSeries({ ...es, max_tier: parseInt(ev.target.value) })} />
              </div>
            </div>
            <div>
              <label style={LABEL}>系列描述</label>
              <textarea style={{ ...INPUT, resize: 'vertical' }} rows={3} value={es.description}
                onChange={ev => setEditSeries({ ...es, description: ev.target.value })} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid #21262d' }}>
              <button onClick={() => { setSeriesDrawer(false); setEditSeries(null) }} style={BTN('transparent', '#8b949e', { border: '1px solid #30363d' })}>取消</button>
              <button onClick={saveSeries} style={BTN('#58a6ff', '#fff')}>{es.id ? '保存修改' : '创建系列'}</button>
            </div>
          </div>
        )}
      </Drawer>

      {/* 阶级编辑 Drawer */}
      <Drawer open={tierDrawer} onClose={() => { setTierDrawer(false); setEditTier(null) }}
        title={e.id ? `编辑装备：${e.name}` : `新增阶级（${selectedSeries?.name}）`}>
        {editTier && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#161b22', borderRadius: 10, padding: 14, border: '1px solid #21262d' }}>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 10, fontWeight: 700 }}>基本信息</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={LABEL}>装备名称</label>
                  <input style={INPUT} value={e.name} onChange={ev => setEditTier({ ...e, name: ev.target.value })} placeholder="如：烈焰常磐之刃" />
                </div>
                <div>
                  <label style={LABEL}>阶级 (Tier)</label>
                  <input type="number" style={INPUT} value={e.tier} min={1} max={10}
                    onChange={ev => setEditTier({ ...e, tier: parseInt(ev.target.value) })} />
                </div>
                <div>
                  <label style={LABEL}>变体标识</label>
                  <input style={INPUT} value={e.variant} placeholder="留空=主线；fire/ice/dark..." onChange={ev => setEditTier({ ...e, variant: ev.target.value })} />
                </div>
                <div>
                  <label style={LABEL}>稀有度</label>
                  <select style={INPUT} value={e.rarity} onChange={ev => setEditTier({ ...e, rarity: ev.target.value })}>
                    {Object.entries(RARITY_META).map(([k, v]) => <option key={k} value={k} style={{ color: v.color }}>{v.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div style={{ background: '#161b22', borderRadius: 10, padding: 14, border: '1px solid #21262d' }}>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 10, fontWeight: 700 }}>基础属性</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={LABEL}>ATK 攻击加成</label><input type="number" style={INPUT} value={e.base_atk} onChange={ev => setEditTier({ ...e, base_atk: parseInt(ev.target.value) || 0 })} /></div>
                <div><label style={LABEL}>DEF 防御加成</label><input type="number" style={INPUT} value={e.base_def} onChange={ev => setEditTier({ ...e, base_def: parseInt(ev.target.value) || 0 })} /></div>
                <div><label style={LABEL}>HP 生命加成</label><input type="number" style={INPUT} value={e.base_hp} onChange={ev => setEditTier({ ...e, base_hp: parseInt(ev.target.value) || 0 })} /></div>
                <div><label style={LABEL}>耐久度上限 (0=无限)</label><input type="number" style={INPUT} value={e.durability_max} min={0} onChange={ev => setEditTier({ ...e, durability_max: parseInt(ev.target.value) || 0 })} /></div>
              </div>
            </div>
            <div style={{ background: '#161b22', borderRadius: 10, padding: 14, border: '1px solid #21262d' }}>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 10, fontWeight: 700 }}>元素属性</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={LABEL}>元素</label>
                  <select style={INPUT} value={e.element} onChange={ev => setEditTier({ ...e, element: ev.target.value })}>
                    {Object.entries(ELEMENT_META).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LABEL}>元素强度</label>
                  <input type="number" style={INPUT} value={e.element_power} min={0} onChange={ev => setEditTier({ ...e, element_power: parseInt(ev.target.value) || 0 })} />
                </div>
              </div>
            </div>
            <div style={{ background: '#161b22', borderRadius: 10, padding: 14, border: '1px solid #21262d' }}>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 10, fontWeight: 700 }}>被动技能 & 装备限制</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={LABEL}>绑定被动技能</label>
                  <select style={INPUT} value={e.passive_skill_id || ''} onChange={ev => setEditTier({ ...e, passive_skill_id: ev.target.value ? parseInt(ev.target.value) : null })}>
                    <option value="">— 无被动 —</option>
                    {allPassives.map(p => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LABEL}>等级要求</label>
                  <input type="number" style={INPUT} value={e.req_level} min={1} onChange={ev => setEditTier({ ...e, req_level: parseInt(ev.target.value) || 1 })} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={LABEL}>被动说明</label>
                  <input style={INPUT} value={e.passive_note} placeholder="如：攻击时20%概率附加火焰伤害" onChange={ev => setEditTier({ ...e, passive_note: ev.target.value })} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={LABEL}>特殊说明</label>
                  <input style={INPUT} value={e.special_note} onChange={ev => setEditTier({ ...e, special_note: ev.target.value })} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid #21262d' }}>
              <button onClick={() => { setTierDrawer(false); setEditTier(null) }} style={BTN('transparent', '#8b949e', { border: '1px solid #30363d' })}>取消</button>
              <button onClick={saveTier} style={BTN('#58a6ff', '#fff')}>{e.id ? '保存修改' : '添加装备'}</button>
            </div>
          </div>
        )}
      </Drawer>

      {/* 配方编辑 Drawer */}
      <Drawer open={recipeDrawer} onClose={() => { setRecipeDrawer(false); setEditRecipe(null) }}
        title={`配方编辑 — ${selectedTier?.name}`} width={700}>
        {editRecipe && selectedTier && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#161b22', borderRadius: 10, padding: 14, border: '1px solid #21262d' }}>
              <div style={{ fontSize: 11, color: '#d29922', marginBottom: 10, fontWeight: 700 }}>⬆️ 升阶前置装备</div>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 10, lineHeight: 1.6 }}>
                T1 基础装备无需前置。T2+ 必须消耗前一阶成品。<br />
                选精确ID = 只接受特定变体；选宽松匹配 = 接受该系列该阶任意变体。
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={LABEL}>精确前置装备 ID</label>
                  <select style={INPUT} value={er.requires_prev_tier_id || ''}
                    onChange={ev => setEditRecipe({ ...er, requires_prev_tier_id: ev.target.value ? parseInt(ev.target.value) : null, requires_prev_series_id: null, requires_prev_tier_num: null })}>
                    <option value="">— 无（T1基础/宽松匹配）—</option>
                    {tiers.filter(t => t.id !== selectedTier?.id).map(t => (
                      <option key={t.id} value={t.id}>T{t.tier} {t.name}{t.variant ? ` [${t.variant}]` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ ...LABEL, color: '#d29922' }}>或：宽松匹配阶级</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="number" style={{ ...INPUT, flex: 1 }} placeholder="前置阶级数"
                      value={er.requires_prev_tier_num || ''}
                      disabled={!!er.requires_prev_tier_id}
                      onChange={ev => setEditRecipe({ ...er, requires_prev_tier_id: null, requires_prev_series_id: selectedSeries.id, requires_prev_tier_num: parseInt(ev.target.value) || null })} />
                    <div style={{ fontSize: 10, color: '#8b949e', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>本系列任意变体</div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ background: '#161b22', borderRadius: 10, padding: 14, border: '1px solid #21262d' }}>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 10, fontWeight: 700 }}>合成参数</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div><label style={LABEL}>配方名称</label><input style={INPUT} value={er.recipe_name} onChange={ev => setEditRecipe({ ...er, recipe_name: ev.target.value })} placeholder="可留空" /></div>
                <div><label style={LABEL}>成功率 (0~1)</label><input type="number" style={INPUT} value={er.success_rate} step={0.05} min={0} max={1} onChange={ev => setEditRecipe({ ...er, success_rate: parseFloat(ev.target.value) })} /></div>
                <div><label style={LABEL}>金币消耗</label><input type="number" style={INPUT} value={er.gold_cost} min={0} onChange={ev => setEditRecipe({ ...er, gold_cost: parseInt(ev.target.value) || 0 })} /></div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={LABEL}>失败行为</label>
                  <select style={INPUT} value={er.fail_behavior} onChange={ev => setEditRecipe({ ...er, fail_behavior: ev.target.value })}>
                    {FAIL_BEHAVIORS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div style={{ background: '#161b22', borderRadius: 10, padding: 14, border: '1px solid #21262d' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700 }}>🔩 合成材料 ({er.ingredients.length} 种)</div>
                <button onClick={addIngredient} style={BTN('rgba(63,185,80,0.1)', '#3fb950', { padding: '5px 10px', border: '1px solid rgba(63,185,80,0.2)', fontSize: 11 })}>+ 添加材料行</button>
              </div>
              {er.ingredients.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#484f58', fontSize: 12 }}>点击"添加材料行"添加所需材料</div>}
              {er.ingredients.map((ing, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 60px 80px 80px 28px', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                  <select style={{ ...INPUT, fontSize: 11, padding: '7px 8px' }} value={ing.ingredient_type}
                    onChange={ev => updateIng(idx, { ingredient_type: ev.target.value, item_id: null, equipment_tier_id: null })}>
                    <option value="item">道具材料</option>
                    <option value="equipment">特定装备</option>
                  </select>
                  {ing.ingredient_type === 'item' ? (
                    <select style={{ ...INPUT, fontSize: 11, padding: '7px 8px' }} value={ing.item_id || ''} onChange={ev => updateIng(idx, { item_id: parseInt(ev.target.value) || null })}>
                      <option value="">选择材料...</option>
                      {allItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  ) : (
                    <select style={{ ...INPUT, fontSize: 11, padding: '7px 8px' }} value={ing.equipment_tier_id || ''} onChange={ev => updateIng(idx, { equipment_tier_id: parseInt(ev.target.value) || null })}>
                      <option value="">选择装备...</option>
                      {tiers.map(t => <option key={t.id} value={t.id}>T{t.tier} {t.name}</option>)}
                    </select>
                  )}
                  <input type="number" style={{ ...INPUT, fontSize: 11, padding: '7px 8px' }} value={ing.quantity} min={1} onChange={ev => updateIng(idx, { quantity: parseInt(ev.target.value) || 1 })} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#8b949e', cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox" checked={ing.is_consumed !== false} onChange={ev => updateIng(idx, { is_consumed: ev.target.checked })} />消耗
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#8b949e', cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox" checked={!!ing.is_catalyst} onChange={ev => updateIng(idx, { is_catalyst: ev.target.checked })} />催化剂
                  </label>
                  <button onClick={() => removeIng(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#484f58', fontSize: 14 }}>✕</button>
                </div>
              ))}
              {er.ingredients.length > 0 && <div style={{ fontSize: 10, color: '#484f58', marginTop: 4 }}>勾选"消耗"= 合成后材料消失；"催化剂"= 需持有但不消耗</div>}
            </div>
            <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(210,153,34,0.05)', border: '1px solid rgba(210,153,34,0.2)' }}>
              <div style={{ fontSize: 11, color: '#d29922', fontWeight: 700, marginBottom: 6 }}>📋 配方预览</div>
              <div style={{ fontSize: 12, color: '#e6edf3' }}>
                合成目标：<strong style={{ color: RARITY_META[selectedTier.rarity]?.color }}>{selectedTier.name}</strong>
                &nbsp;（T{selectedTier.tier}{selectedTier.variant ? ` · ${selectedTier.variant} 变体` : ''}）
              </div>
              {(er.requires_prev_tier_id || er.requires_prev_tier_num) && (
                <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>
                  ↑ 消耗前置：{er.requires_prev_tier_id
                    ? tiers.find(t => t.id === er.requires_prev_tier_id)?.name || `ID ${er.requires_prev_tier_id}`
                    : `T${er.requires_prev_tier_num} 任意变体`}
                </div>
              )}
              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
                成功率：<strong style={{ color: er.success_rate < 1 ? '#f85149' : '#3fb950' }}>{Math.round(er.success_rate * 100)}%</strong>
                {er.gold_cost > 0 && <span style={{ marginLeft: 10 }}>💰 {er.gold_cost}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid #21262d' }}>
              <button onClick={() => { setRecipeDrawer(false); setEditRecipe(null) }} style={BTN('transparent', '#8b949e', { border: '1px solid #30363d' })}>取消</button>
              <button onClick={saveRecipe} style={BTN('#d29922', '#000', { color: '#000' })}>💾 保存配方</button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}
