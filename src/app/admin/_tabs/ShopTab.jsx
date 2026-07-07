'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { postGameApi } from '@/lib/gameApi'
import { BTN, INPUT, LABEL, Modal, ITEM_KIND_META, RARITY_META } from '../_shared/ui'

/**
 * Phase 24b — ShopTab: shop_catalog CRUD
 *
 * 目录分 3 类:
 *   - equipment (tier_id 引用 equipment_tiers)
 *   - consumable (item_name = item_pool.name where kind=consumable)
 *   - story_item (item_name = item_pool.name where kind IN tech_fragment/platform_part/omega_matter)
 */

const POINT_TYPES = [
  { value: 'high_equip_pt', label: '高级装备点', color: '#bc8cff' },
  { value: 'low_equip_pt',  label: '普通装备点', color: '#58a6ff' },
  { value: 'item_pt',       label: '道具点',     color: '#d29922' },
]

const ENTRY_KIND_META = {
  equipment:   { label: '⚔ 装备', color: '#bc8cff' },
  consumable:  { label: '💊 消耗品', color: '#3fb950' },
  story_item:  { label: '📦 剧情物品', color: '#d29922' },
}

const EMPTY = {
  entry_kind: 'consumable',
  tier_id: null,
  item_name: '',
  point_type: 'item_pt',
  cost: 5,
  required_class_ids: [],
  enabled: true,
  display_order: 100,
}

export default function ShopTab({ toast }) {
  const [catalog, setCatalog] = useState([])
  const [tiers, setTiers] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [modal, setModal] = useState(false)
  const [edit, setEdit] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  async function load() {
    const [catRes, tierRes, itemRes] = await Promise.all([
      supabase.from('shop_catalog').select('*').order('display_order'),
      supabase.from('equipment_tiers').select('id, name, rarity, base_atk, base_def, base_hp, equipment_series(name, slot)').order('rarity').order('name'),
      supabase.from('item_pool').select('name, kind').in('kind', ['consumable', 'tech_fragment', 'platform_part', 'omega_matter']).order('kind').order('name'),
    ])
    setCatalog(catRes.data || [])
    setTiers(tierRes.data || [])
    setItems(itemRes.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => filter === 'all' ? catalog : catalog.filter(c => c.entry_kind === filter), [catalog, filter])

  function openAdd() { setEdit({ ...EMPTY }); setModal(true) }
  function openEdit(c) { setEdit({ ...EMPTY, ...c }); setModal(true) }

  async function save() {
    const payload = { ...edit }
    delete payload.created_at
    // 修正：entry_kind=equipment 时 item_name 必须为 null；反之 tier_id 必须为 null
    if (payload.entry_kind === 'equipment') {
      payload.item_name = null
      if (!payload.tier_id) { toast('请选择装备 tier', 'error'); return }
    } else {
      payload.tier_id = null
      if (!payload.item_name) { toast('请选择 item 名称', 'error'); return }
    }
    if (!payload.point_type) { toast('请选择 point_type', 'error'); return }
    if (!payload.cost || payload.cost < 1) { toast('cost 必须 ≥1', 'error'); return }

    // 写路径服务端化（service_role · phase-55/52b）：shop_catalog 增删改走 /api/admin/table。
    try {
      await postGameApi('/api/admin/table', { table: 'shop_catalog', op: 'save', id: edit.id || null, row: payload })
    } catch (e) { toast((edit.id ? '更新失败: ' : '添加失败: ') + (e.message || ''), 'error'); return }
    toast(edit.id ? '条目已更新' : '条目已添加')
    setModal(false)
    load()
  }

  async function remove(id) {
    try {
      await postGameApi('/api/admin/table', { table: 'shop_catalog', op: 'delete', id })
    } catch (e) { toast('删除失败', 'error'); return }
    toast('条目已删除')
    setConfirmDel(null)
    load()
  }

  async function toggleEnabled(c) {
    try {
      await postGameApi('/api/admin/table', { table: 'shop_catalog', op: 'save', id: c.id, row: { enabled: !c.enabled } })
    } catch (e) { toast('切换失败', 'error'); return }
    load()
  }

  function entryDisplay(c) {
    if (c.entry_kind === 'equipment') {
      const t = tiers.find(t => t.id === c.tier_id)
      const slot = t?.equipment_series?.slot
      return t ? `${t.name} (${RARITY_META[t.rarity]?.label ?? t.rarity}${slot ? `/${slot}` : ''})` : `装备阶 #${c.tier_id}`
    }
    return c.item_name
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#8b949e' }}>加载中...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {['all', 'equipment', 'consumable', 'story_item'].map(t => (
            <button key={t} onClick={() => setFilter(t)} style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: 'none', cursor: 'pointer',
              background: filter === t ? '#58a6ff' : '#21262d',
              color: filter === t ? '#fff' : '#8b949e',
            }}>{t === 'all' ? `全部 (${catalog.length})` : `${ENTRY_KIND_META[t]?.label} (${catalog.filter(c => c.entry_kind === t).length})`}</button>
          ))}
        </div>
        <button onClick={openAdd} style={BTN('#58a6ff', '#fff')}>+ 添加条目</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map(c => {
          const meta = ENTRY_KIND_META[c.entry_kind] || { label: c.entry_kind, color: '#8b949e' }
          const pmeta = POINT_TYPES.find(p => p.value === c.point_type)
          return (
            <div key={c.id} style={{
              background: '#161b22', borderRadius: 8,
              border: `1px solid ${c.enabled ? '#21262d' : '#f8514930'}`,
              borderLeft: `3px solid ${meta.color}`,
              padding: '10px 14px', opacity: c.enabled ? 1 : 0.5,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ padding: '1px 8px', borderRadius: 6, fontSize: 9, fontWeight: 700, background: `${meta.color}18`, color: meta.color }}>{meta.label}</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#e6edf3' }}>{entryDisplay(c)}</span>
                  <span style={{ fontSize: 11, color: pmeta?.color }}>{c.cost} {pmeta?.label}</span>
                  <span style={{ fontSize: 9, color: '#484f58', fontFamily: 'monospace' }}>order={c.display_order}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => toggleEnabled(c)} style={BTN('transparent', '#8b949e', { fontSize: 11, padding: '4px 10px', border: '1px solid #30363d' })}>{c.enabled ? '禁用' : '启用'}</button>
                <button onClick={() => openEdit(c)} style={BTN('transparent', '#58a6ff', { fontSize: 11, padding: '4px 10px', border: '1px solid rgba(88,166,255,0.3)' })}>编辑</button>
                <button onClick={() => setConfirmDel(c)} style={BTN('rgba(248,81,73,0.15)', '#f85149', { fontSize: 11, padding: '4px 10px', border: '1px solid rgba(248,81,73,0.3)' })}>删除</button>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>没有匹配的条目</div>}
      </div>

      {confirmDel && (
        <Modal open={true} title="确认删除" onClose={() => setConfirmDel(null)}>
          <p style={{ color: '#e6edf3', marginBottom: 16 }}>删除商店条目「{entryDisplay(confirmDel)}」？</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setConfirmDel(null)} style={BTN('transparent', '#8b949e', { border: '1px solid #30363d' })}>取消</button>
            <button onClick={() => remove(confirmDel.id)} style={BTN('rgba(248,81,73,0.15)', '#f85149', { border: '1px solid rgba(248,81,73,0.3)' })}>删除</button>
          </div>
        </Modal>
      )}

      {modal && edit && (
        <Modal open={true} title={edit.id ? '编辑商店条目' : '添加商店条目'} onClose={() => setModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={LABEL}>条目类型</label>
              <select value={edit.entry_kind} onChange={e => setEdit({ ...edit, entry_kind: e.target.value, tier_id: null, item_name: '' })} style={INPUT}>
                <option value="equipment">⚔ 装备 (来自 equipment_tiers)</option>
                <option value="consumable">💊 消耗品</option>
                <option value="story_item">📦 剧情物品</option>
              </select>
            </div>
            {edit.entry_kind === 'equipment' && (
              <div>
                <label style={LABEL}>装备 tier</label>
                <select value={edit.tier_id || ''} onChange={e => setEdit({ ...edit, tier_id: parseInt(e.target.value) || null })} style={INPUT}>
                  <option value="">— 选择 —</option>
                  {tiers.map(t => (
                    <option key={t.id} value={t.id}>[{RARITY_META[t.rarity]?.label ?? t.rarity}] {t.name} {t.equipment_series?.slot ? `/${t.equipment_series.slot}` : ''} (ATK {t.base_atk}/DEF {t.base_def}/HP {t.base_hp})</option>
                  ))}
                </select>
              </div>
            )}
            {edit.entry_kind !== 'equipment' && (
              <div>
                <label style={LABEL}>道具名称</label>
                <select value={edit.item_name} onChange={e => setEdit({ ...edit, item_name: e.target.value })} style={INPUT}>
                  <option value="">— 选择 —</option>
                  {items
                    .filter(i => edit.entry_kind === 'consumable' ? i.kind === 'consumable' : ['tech_fragment','platform_part','omega_matter'].includes(i.kind))
                    .map(i => <option key={i.name} value={i.name}>[{ITEM_KIND_META[i.kind]?.label ?? i.kind}] {i.name}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <div>
                <label style={LABEL}>点数类型</label>
                <select value={edit.point_type} onChange={e => setEdit({ ...edit, point_type: e.target.value })} style={INPUT}>
                  {POINT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label style={LABEL}>cost</label>
                <input type="number" min="1" value={edit.cost} onChange={e => setEdit({ ...edit, cost: parseInt(e.target.value) || 1 })} style={INPUT} />
              </div>
            </div>
            <div>
              <label style={LABEL}>display_order（数字小的排前面）</label>
              <input type="number" value={edit.display_order} onChange={e => setEdit({ ...edit, display_order: parseInt(e.target.value) || 0 })} style={INPUT} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button onClick={() => setModal(false)} style={BTN('transparent', '#8b949e', { border: '1px solid #30363d' })}>取消</button>
            <button onClick={save} style={BTN('#58a6ff', '#fff')}>{edit.id ? '保存' : '添加'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
