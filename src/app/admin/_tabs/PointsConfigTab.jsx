'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { postGameApi } from '@/lib/gameApi'
import { BTN, INPUT, LABEL, Modal, DeleteBtn } from '../_shared/ui'

/**
 * Phase 24b — PointsConfigTab
 *
 * 三块:
 *   1. shop_exchange_rates CRUD
 *   2. 当前玩家 player_points 余额分布（直方图）
 *   3. 折算系数只读说明（写在 src/lib/server/points.js EQUIP_RARITY_VALUE / ITEM_KIND_VALUE）
 */

const POINT_TYPES = [
  { value: 'high_equip_pt', label: '高级装备点', color: '#bc8cff' },
  { value: 'low_equip_pt',  label: '普通装备点', color: '#58a6ff' },
  { value: 'item_pt',       label: '道具点',     color: '#d29922' },
  { value: 'class_pt',      label: '高级职业点', color: '#ff8c42' },
]

const EMPTY_RATE = {
  from_type: 'low_equip_pt', to_type: 'item_pt',
  from_amount: 5, to_amount: 1,
  enabled: true, description: '',
}

const CONVERSION_REFERENCE = [
  { kind: '装备 (extract 折算)', rows: [
    { from: 'common',    to: 'low_equip_pt',  rate: '× 5'  },
    { from: 'uncommon',  to: 'low_equip_pt',  rate: '× 12' },
    { from: 'rare',      to: 'high_equip_pt', rate: '× 8'  },
    { from: 'epic',      to: 'high_equip_pt', rate: '× 18' },
    { from: 'legendary', to: 'high_equip_pt', rate: '× 35' },
    { from: 'mythic',    to: 'high_equip_pt', rate: '× 60' },
  ]},
  { kind: '装备 bonus_atk/def 加成', rows: [
    { from: '+1 atk', to: 'low_equip_pt', rate: '+ 2' },
    { from: '+1 def', to: 'low_equip_pt', rate: '+ 2' },
  ]},
  { kind: '装备耐久度', rows: [
    { from: 'durability_current / durability_max', to: '点数', rate: '× clamp [0.3, 1.0]' },
  ]},
  { kind: '物品 (extract 折算)', rows: [
    { from: 'consumable',    to: 'item_pt', rate: '× 3 / unit' },
    { from: 'tech_fragment', to: 'item_pt', rate: '× 8 / unit' },
    { from: 'platform_part', to: 'item_pt', rate: '× 4 / unit' },
    { from: 'omega_matter',  to: 'item_pt', rate: '× 15 / unit' },
  ]},
  { kind: 'class_pt 来源', rows: [
    { from: '成功撤离',         to: 'class_pt', rate: '+ 1' },
    { from: '残片解码 lv3 完成', to: 'class_pt', rate: '+ 2 (Phase 24c)' },
    { from: 'Ω-段相关结局',     to: 'class_pt', rate: '+ 5 (Phase 24c)' },
  ]},
]

export default function PointsConfigTab({ toast }) {
  const [rates, setRates] = useState([])
  const [balances, setBalances] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [edit, setEdit] = useState(null)

  async function load() {
    const [r1, r2] = await Promise.all([
      supabase.from('shop_exchange_rates').select('*').order('from_type').order('to_type'),
      supabase.from('player_points').select('point_type, balance'),
    ])
    setRates(r1.data || [])
    setBalances(r2.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const distribution = useMemo(() => {
    const byType = { high_equip_pt: [], low_equip_pt: [], item_pt: [], class_pt: [] }
    for (const b of balances) {
      if (byType[b.point_type]) byType[b.point_type].push(Number(b.balance) || 0)
    }
    const stats = {}
    for (const [t, arr] of Object.entries(byType)) {
      const sum = arr.reduce((a, b) => a + b, 0)
      const sorted = arr.slice().sort((a, b) => b - a)
      const topCount = Math.max(1, Math.floor(arr.length * 0.25))
      const topSum = sorted.slice(0, topCount).reduce((a, b) => a + b, 0)
      const topShare = sum > 0 ? topSum / sum : 0
      // Phase 25.4: 集中度警告
      let warning = null
      if (sorted[0] > 0 && sum > 0) {
        const maxShare = sorted[0] / sum
        if (maxShare > 0.5) warning = `⚠ 单玩家占 ${Math.round(maxShare * 100)}% 总量,建议调低折算系数`
        else if (topShare > 0.8 && arr.length > 3) warning = `⚠ 前 25% 玩家占 ${Math.round(topShare * 100)}% 总量,分配过度集中`
      }
      stats[t] = {
        count: arr.length,
        sum,
        avg: arr.length > 0 ? Math.round(sum / arr.length) : 0,
        max: arr.length > 0 ? Math.max(...arr) : 0,
        topShare: Math.round(topShare * 100),
        warning,
      }
    }
    return stats
  }, [balances])

  function openAdd() { setEdit({ ...EMPTY_RATE }); setModal(true) }
  function openEdit(r) { setEdit({ ...EMPTY_RATE, ...r }); setModal(true) }

  async function save() {
    if (edit.from_type === edit.to_type) { toast('from_type 不能等于 to_type', 'error'); return }
    if (edit.from_amount < 1 || edit.to_amount < 1) { toast('数量必须 ≥1', 'error'); return }
    const payload = { ...edit }
    // 写路径服务端化（service_role · phase-55/52b）：shop_exchange_rates 增删改走 /api/admin/table。
    try {
      await postGameApi('/api/admin/table', { table: 'shop_exchange_rates', op: 'save', id: edit.id || null, row: payload })
    } catch (e) { toast((edit.id ? '更新失败: ' : '添加失败: ') + (e.message || ''), 'error'); return }
    toast(edit.id ? '汇率已更新' : '汇率已添加')
    setModal(false)
    load()
  }

  async function remove(id) {
    try {
      await postGameApi('/api/admin/table', { table: 'shop_exchange_rates', op: 'delete', id })
    } catch (e) { toast('删除失败', 'error'); return }
    load()
  }

  async function toggleEnabled(r) {
    try {
      await postGameApi('/api/admin/table', { table: 'shop_exchange_rates', op: 'save', id: r.id, row: { enabled: !r.enabled } })
    } catch (e) { toast('切换失败', 'error'); return }
    load()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#8b949e' }}>加载中...</div>

  return (
    <div>
      {/* 1. 玩家余额分布 */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, color: '#e6edf3', margin: '0 0 10px' }}>📊 玩家余额分布（{balances.length / 4} 个用户）</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {POINT_TYPES.map(p => {
            const d = distribution[p.value] || {}
            return (
              <div key={p.value} style={{
                padding: '10px 12px', borderRadius: 8,
                background: '#161b22', border: `1px solid ${d.warning ? '#f8514950' : '#21262d'}`, borderLeft: `3px solid ${p.color}`,
              }}>
                <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>{p.label}</div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11, flexWrap: 'wrap' }}>
                  <span><span style={{ color: '#484f58' }}>持有</span> <strong style={{ color: p.color }}>{d.count || 0}</strong></span>
                  <span><span style={{ color: '#484f58' }}>总量</span> <strong>{d.sum || 0}</strong></span>
                  <span><span style={{ color: '#484f58' }}>均值</span> <strong>{d.avg || 0}</strong></span>
                  <span><span style={{ color: '#484f58' }}>峰值</span> <strong>{d.max || 0}</strong></span>
                  {/* Phase 25.4: 前 25% 占比 */}
                  {d.count > 0 && d.topShare > 0 && (
                    <span title="前 25% 玩家占总量比例(基尼系数近似)">
                      <span style={{ color: '#484f58' }}>P25</span> <strong style={{ color: d.topShare > 80 ? '#f85149' : '#8b949e' }}>{d.topShare}%</strong>
                    </span>
                  )}
                </div>
                {/* Phase 25.4: 集中度警告 */}
                {d.warning && (
                  <div style={{ fontSize: 10, color: '#f85149', marginTop: 6, padding: '4px 6px', background: '#f8514910', borderRadius: 4 }}>
                    {d.warning}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 2. 兑换汇率 CRUD */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ fontSize: 14, color: '#e6edf3', margin: 0 }}>💱 商店兑换汇率（{rates.length}）</h3>
          <button onClick={openAdd} style={BTN('#58a6ff', '#fff')}>+ 添加汇率</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rates.map(r => {
            const fm = POINT_TYPES.find(p => p.value === r.from_type)
            const tm = POINT_TYPES.find(p => p.value === r.to_type)
            return (
              <div key={r.id} style={{
                background: '#161b22', borderRadius: 8, border: `1px solid ${r.enabled ? '#21262d' : '#f8514930'}`,
                padding: '10px 14px', opacity: r.enabled ? 1 : 0.5,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
              }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
                  <span style={{ padding: '2px 8px', borderRadius: 6, background: `${fm?.color}18`, color: fm?.color, fontWeight: 600 }}>
                    {r.from_amount} {fm?.label}
                  </span>
                  <span style={{ color: '#484f58' }}>→</span>
                  <span style={{ padding: '2px 8px', borderRadius: 6, background: `${tm?.color}18`, color: tm?.color, fontWeight: 700 }}>
                    {r.to_amount} {tm?.label}
                  </span>
                  {r.description && <span style={{ fontSize: 10, color: '#8b949e', marginLeft: 6 }}>{r.description}</span>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => toggleEnabled(r)} style={BTN('transparent', '#8b949e', { fontSize: 11, padding: '4px 10px', border: '1px solid #30363d' })}>{r.enabled ? '禁用' : '启用'}</button>
                  <button onClick={() => openEdit(r)} style={BTN('transparent', '#58a6ff', { fontSize: 11, padding: '4px 10px', border: '1px solid rgba(88,166,255,0.3)' })}>编辑</button>
                  <DeleteBtn onConfirm={() => remove(r.id)} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 3. 折算系数说明（只读） */}
      <div>
        <h3 style={{ fontSize: 14, color: '#e6edf3', margin: '0 0 10px' }}>📐 折算系数 (硬编码于 src/lib/server/points.js)</h3>
        {CONVERSION_REFERENCE.map((block, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: '#d29922', marginBottom: 4 }}>{block.kind}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {block.rows.map((row, j) => (
                <div key={j} style={{ padding: '6px 10px', background: '#161b22', borderRadius: 6, border: '1px solid #21262d', fontSize: 11 }}>
                  <span style={{ color: '#8b949e' }}>{row.from}</span>
                  <span style={{ color: '#484f58', margin: '0 6px' }}>→</span>
                  <span style={{ color: '#e6edf3' }}>{row.to}</span>
                  <span style={{ color: '#3fb950', marginLeft: 6, fontFamily: 'monospace' }}>{row.rate}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {modal && edit && (
        <Modal open={true} title={edit.id ? '编辑兑换汇率' : '添加兑换汇率'} onClose={() => setModal(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LABEL}>from_type</label>
              <select value={edit.from_type} onChange={e => setEdit({ ...edit, from_type: e.target.value })} style={INPUT}>
                {POINT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label style={LABEL}>to_type</label>
              <select value={edit.to_type} onChange={e => setEdit({ ...edit, to_type: e.target.value })} style={INPUT}>
                {POINT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label style={LABEL}>from_amount</label>
              <input type="number" min="1" value={edit.from_amount} onChange={e => setEdit({ ...edit, from_amount: parseInt(e.target.value) || 1 })} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>to_amount</label>
              <input type="number" min="1" value={edit.to_amount} onChange={e => setEdit({ ...edit, to_amount: parseInt(e.target.value) || 1 })} style={INPUT} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={LABEL}>description</label>
              <input value={edit.description || ''} onChange={e => setEdit({ ...edit, description: e.target.value })} style={INPUT} placeholder="如: 5 普通装备点 → 1 道具点" />
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
