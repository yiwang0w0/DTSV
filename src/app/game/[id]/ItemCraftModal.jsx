'use client'

/**
 * ItemCraftModal — 局内「道具合成」面板（Phase 03/49）。
 * 与装备合成 CraftModal 同形，但消费 item_recipes（item→item）：列出启用配方 → 选一条 →
 * 实时显示材料 have/need（用 itemCraft.checkItemCraft 纯函数·与服务端同口径）→ 开始合成。
 * 提交走 onCraft(recipeId) → GameClientPage.handleCraftItem → runGameAction('craftItem')。
 * 0 配方 ⇒ 列表空（中性·守 Phase 37）。运行只认 item_id；背包是名数组，靠 item_pool 现拉 id↔name 桥接。
 */
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { checkItemCraft } from '@/lib/itemCraft'
import { Modal } from './gameUi'
import { useIsNarrow } from '@/lib/useIsNarrow'

export default function ItemCraftModal({ open, onClose, player, onCraft }) {
  const [recipes, setRecipes] = useState([])
  const [idByName, setIdByName] = useState(() => new Map())
  const [nameById, setNameById] = useState(() => new Map())
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [crafting, setCrafting] = useState(false)
  const isNarrow = useIsNarrow()

  const inventory = useMemo(() => player?.inventory || [], [player?.inventory])

  useEffect(() => {
    if (!open) return
    let active = true
    async function load() {
      setLoading(true)
      const [recRes, itemRes] = await Promise.all([
        supabase
          .from('item_recipes')
          .select('id, name, result_item_id, result_qty, success_rate, fail_behavior, req_level, description, ingredients:item_recipe_ingredients(item_id, quantity, is_consumed)')
          .eq('enabled', true)
          .order('id'),
        supabase.from('item_pool').select('id, name'),
      ])
      if (!active) return
      const idMap = new Map()
      const nameMap = new Map()
      for (const it of itemRes.data || []) { idMap.set(it.name, it.id); nameMap.set(it.id, it.name) }
      setIdByName(idMap)
      setNameById(nameMap)
      const list = recRes.data || []
      setRecipes(list)
      setSelectedId((cur) => cur || list[0]?.id || null)
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [open])

  const selected = recipes.find((r) => r.id === selectedId) || null
  const check = useMemo(
    () => (selected ? checkItemCraft(selected, inventory, idByName, player?.level ?? null) : null),
    [selected, inventory, idByName, player?.level],
  )

  function haveCount(itemId) {
    const name = nameById.get(itemId)
    if (name == null) return 0
    return inventory.filter((x) => x === name).length
  }

  async function doCraft() {
    if (!selected || !check?.canCraft || crafting) return
    setCrafting(true)
    try { await onCraft(selected.id) } finally { setCrafting(false) }
  }

  const resultName = selected ? (nameById.get(selected.result_item_id) || `#${selected.result_item_id}`) : ''

  return (
    <Modal open={open} onClose={onClose} title="道具合成">
      {loading ? (
        <div style={{ textAlign: 'center', color: '#8b949e', padding: 24 }}>加载配方中...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : '240px 1fr', gap: 16 }}>
          {/* 配方列表 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '60vh', overflowY: 'auto' }}>
            {recipes.map((r) => {
              const active = r.id === selectedId
              return (
                <button key={r.id} onClick={() => setSelectedId(r.id)} style={{
                  textAlign: 'left', padding: '10px 12px', borderRadius: 10,
                  border: `1px solid ${active ? '#58a6ff' : '#30363d'}`,
                  background: active ? '#58a6ff12' : '#161b22',
                  color: active ? '#58a6ff' : '#e6edf3', cursor: 'pointer',
                }}>
                  <div style={{ fontWeight: 700 }}>{nameById.get(r.result_item_id) || r.name}</div>
                  <div style={{ fontSize: 11, color: active ? '#58a6ff' : '#8b949e', marginTop: 4 }}>
                    产出 ×{r.result_qty ?? 1} · 成功率 {Math.round((r.success_rate ?? 1) * 100)}%
                  </div>
                </button>
              )
            })}
            {recipes.length === 0 && (
              <div style={{ textAlign: 'center', color: '#8b949e', padding: 20 }}>当前没有可用配方</div>
            )}
          </div>

          {/* 详情 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {selected ? (
              <>
                <div style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid #30363d', background: '#161b22' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#58a6ff' }}>{resultName} ×{selected.result_qty ?? 1}</div>
                      {selected.description && <div style={{ marginTop: 6, fontSize: 12, color: '#8b949e' }}>{selected.description}</div>}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 12, color: '#8b949e' }}>
                      <div>成功率：{Math.round((selected.success_rate ?? 1) * 100)}%</div>
                      <div>{selected.fail_behavior === 'keep_materials' ? '失败保留材料' : '失败扣材料'}</div>
                    </div>
                  </div>
                </div>

                <div style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid #30363d', background: '#161b22' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#8b949e', marginBottom: 10 }}>材料需求</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(selected.ingredients || []).map((ing, idx) => {
                      const name = nameById.get(ing.item_id) || `#${ing.item_id}`
                      const have = haveCount(ing.item_id)
                      const need = ing.quantity || 1
                      const enough = have >= need
                      return (
                        <div key={idx} style={{
                          display: 'flex', justifyContent: 'space-between', gap: 12,
                          padding: '10px 12px', borderRadius: 8, border: '1px solid #21262d', background: '#0e1117', fontSize: 12,
                        }}>
                          <span>
                            {name}
                            {ing.is_consumed === false && <span style={{ color: '#d29922', marginLeft: 6, fontSize: 10 }}>催化剂</span>}
                          </span>
                          <span style={{ color: enough ? '#3fb950' : '#f85149' }}>{have} / {need}</span>
                        </div>
                      )
                    })}
                    {(selected.ingredients || []).length === 0 && (
                      <div style={{ color: '#8b949e', fontSize: 12 }}>该配方当前没有材料要求</div>
                    )}
                  </div>
                </div>

                {check && !check.canCraft && (
                  <div style={{ color: '#f85149', fontSize: 12 }}>
                    {check.levelGated ? '等级不足，无法合成此配方' : '材料不足，无法合成'}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #30363d', background: 'transparent', color: '#8b949e', cursor: 'pointer' }}>关闭</button>
                  <button onClick={doCraft} disabled={!check?.canCraft || crafting} style={{
                    padding: '8px 16px', borderRadius: 8, border: 'none',
                    background: check?.canCraft ? '#3fb950' : '#484f58',
                    color: check?.canCraft ? '#000' : '#c9d1d9', fontWeight: 700,
                    cursor: check?.canCraft && !crafting ? 'pointer' : 'not-allowed',
                  }}>{crafting ? '合成中...' : '开始合成'}</button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', color: '#8b949e', padding: 24 }}>请选择一条配方</div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
