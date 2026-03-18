'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { checkCanCraft, RARITY_META } from '@/lib/equipmentEngine'
import { Modal } from './gameUi'

function buildInventoryMap(inventory) {
  const counts = {}
  for (const itemName of inventory || []) {
    counts[itemName] = (counts[itemName] || 0) + 1
  }
  return Object.entries(counts).map(([name, count]) => ({ name, count }))
}

export default function CraftModal({
  open,
  onClose,
  player,
  equipments,
  onCraft,
}) {
  const [craftables, setCraftables] = useState([])
  const [selectedTierId, setSelectedTierId] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [crafting, setCrafting] = useState(false)

  const inventoryMap = useMemo(() => buildInventoryMap(player?.inventory || []), [player?.inventory])

  useEffect(() => {
    if (!open) return
    let active = true

    async function loadCraftables() {
      setLoading(true)
      const { data } = await supabase
        .from('equipment_tiers')
        .select(`
          id, name, tier, rarity, variant,
          series:equipment_series(name, slot),
          recipe:tier_recipes(
            id, success_rate, gold_cost, fail_behavior,
            ingredients:recipe_ingredients(
              id, quantity, ingredient_type,
              item:item_pool(id, name),
              equipment:equipment_tiers(id, name)
            )
          )
        `)
        .order('tier')

      if (!active) return
      const list = (data || []).filter(tier => (tier.recipe || []).length > 0)
      setCraftables(list)
      setSelectedTierId(current => current || list[0]?.id || null)
      setLoading(false)
    }

    loadCraftables()
    return () => {
      active = false
    }
  }, [open])

  useEffect(() => {
    if (!open || !selectedTierId || !player) return
    let active = true

    async function loadPreview() {
      const result = await checkCanCraft(
        selectedTierId,
        inventoryMap,
        equipments.map(eq => ({
          id: eq.id,
          tier_id: eq.tier_id,
          is_equipped: eq.is_equipped,
          durability_current: eq.durability_current,
        })),
        player.level || 1,
        '',
        supabase,
      )
      if (active) {
        setPreview(result)
      }
    }

    loadPreview()
    return () => {
      active = false
    }
  }, [open, selectedTierId, player, inventoryMap, equipments])

  const selectedTier = craftables.find(tier => tier.id === selectedTierId) || null
  const selectedRecipe = selectedTier?.recipe?.[0] || null

  async function handleCraft() {
    if (!selectedTierId) return
    setCrafting(true)
    try {
      const result = await onCraft(selectedTierId)
      if (result?.success) {
        const nextPreview = await checkCanCraft(
          selectedTierId,
          inventoryMap,
          equipments.map(eq => ({
            id: eq.id,
            tier_id: eq.tier_id,
            is_equipped: eq.is_equipped,
            durability_current: eq.durability_current,
          })),
          player.level || 1,
          '',
          supabase,
        )
        setPreview(nextPreview)
      }
    } finally {
      setCrafting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="装备合成">
      {loading ? (
        <div style={{ textAlign: 'center', color: '#8b949e', padding: 24 }}>加载配方中...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '60vh', overflowY: 'auto' }}>
            {craftables.map(tier => {
              const rarity = RARITY_META[tier.rarity] || RARITY_META.common
              const active = tier.id === selectedTierId
              return (
                <button
                  key={tier.id}
                  onClick={() => setSelectedTierId(tier.id)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${active ? rarity.color : '#30363d'}`,
                    background: active ? `${rarity.color}12` : '#161b22',
                    color: active ? rarity.color : '#e6edf3',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{tier.name}</div>
                  <div style={{ fontSize: 11, color: active ? rarity.color : '#8b949e', marginTop: 4 }}>
                    T{tier.tier} · {tier.series?.name || '未知系列'}
                  </div>
                </button>
              )
            })}
            {craftables.length === 0 && (
              <div style={{ textAlign: 'center', color: '#8b949e', padding: 20 }}>当前没有可用配方</div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {selectedTier ? (
              <>
                <div style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid #30363d', background: '#161b22' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: RARITY_META[selectedTier.rarity]?.color }}>{selectedTier.name}</div>
                      <div style={{ marginTop: 6, fontSize: 12, color: '#8b949e' }}>
                        {selectedTier.series?.name || '未知系列'} · T{selectedTier.tier}
                        {selectedTier.variant ? ` · ${selectedTier.variant}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 12, color: '#8b949e' }}>
                      <div>成功率：{Math.round((selectedRecipe?.success_rate || 1) * 100)}%</div>
                      <div>金币：{selectedRecipe?.gold_cost || 0}</div>
                    </div>
                  </div>
                </div>

                <div style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid #30363d', background: '#161b22' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#8b949e', marginBottom: 10 }}>材料需求</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(selectedRecipe?.ingredients || []).map(ingredient => (
                      <div
                        key={ingredient.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: '1px solid #21262d',
                          background: '#0e1117',
                          fontSize: 12,
                        }}
                      >
                        <span>
                          {ingredient.ingredient_type === 'item'
                            ? ingredient.item?.name || '未知材料'
                            : ingredient.equipment?.name || '未知装备'}
                        </span>
                        <span style={{ color: '#8b949e' }}>x{ingredient.quantity}</span>
                      </div>
                    ))}
                    {(selectedRecipe?.ingredients || []).length === 0 && (
                      <div style={{ color: '#8b949e', fontSize: 12 }}>该配方当前没有材料要求</div>
                    )}
                  </div>
                </div>

                <div style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid #30363d', background: '#161b22' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#8b949e', marginBottom: 10 }}>合成校验</div>
                  {preview ? (
                    preview.canCraft ? (
                      <div style={{ color: '#3fb950', fontSize: 13 }}>材料齐全，可以开始合成。</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {preview.missing.map((item, index) => (
                          <div key={`${item}-${index}`} style={{ color: '#f85149', fontSize: 12 }}>
                            • {item}
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <div style={{ color: '#8b949e', fontSize: 12 }}>正在计算条件...</div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    onClick={onClose}
                    style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #30363d', background: 'transparent', color: '#8b949e', cursor: 'pointer' }}
                  >
                    关闭
                  </button>
                  <button
                    onClick={handleCraft}
                    disabled={!preview?.canCraft || crafting}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: 'none',
                      background: preview?.canCraft ? '#d29922' : '#484f58',
                      color: preview?.canCraft ? '#000' : '#c9d1d9',
                      fontWeight: 700,
                      cursor: preview?.canCraft && !crafting ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {crafting ? '合成中...' : '开始合成'}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', color: '#8b949e', padding: 24 }}>请选择一条装备配方</div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

