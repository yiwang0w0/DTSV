'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { BTN, INPUT, LABEL, Modal } from '../_shared/ui'

/* Phase 19.9: chamber_templates 模板池 CRUD */

const TYPE_OPTIONS = [
  { value: 'scan_dense',     label: '搜密 (scan_dense)',     color: '#58a6ff', icon: '🔍' },
  { value: 'combat_dense',   label: '打密 (combat_dense)',   color: '#f85149', icon: '⚔️' },
  { value: 'fragment_dense', label: '残密 (fragment_dense)', color: '#bc8cff', icon: '📡' },
  { value: 'hazard',         label: '危险 (hazard)',         color: '#d29922', icon: '☢'  },
  { value: 'exit',           label: '撤离点 (exit)',         color: '#3fb950', icon: '🚪' },
  { value: 'milestone',      label: '里程碑 (milestone)',    color: '#ff8c42', icon: '🏆' },
]

const EMPTY = {
  template_key: '',
  name: '',
  type: 'scan_dense',
  description: '',
  region_label: '',
  pollution_base: 0,
  pollution_accel: 0,
  is_exit: false,
  exit_cost: null,    // {item, qty}
  omega_window: 0,
  max_items: 5,
  max_npcs: 2,
  spawn_weight: 1.0,
  exit_count: 2,
  enabled: true,
}

export default function ChambersTab({ toast }) {
  const [chambers, setChambers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [edit, setEdit] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  // Phase 22.3: 最近 N 局每个 chamber 的出现次数（balance hint）
  const [appearanceCounts, setAppearanceCounts] = useState({})

  async function load() {
    const { data } = await supabase
      .from('chamber_templates')
      .select('*')
      .order('type')
      .order('template_key')
    setChambers(data || [])

    // Phase 22.3: 从最近 30 局 raid_stats.metadata.chamber_counts 累加
    try {
      const { data: stats } = await supabase
        .from('raid_stats')
        .select('metadata')
        .order('ended_at', { ascending: false })
        .limit(30)
      const acc = {}
      for (const s of stats || []) {
        const counts = s.metadata?.chamber_counts || {}
        for (const [tid, n] of Object.entries(counts)) {
          acc[tid] = (acc[tid] || 0) + Number(n)
        }
      }
      setAppearanceCounts(acc)
    } catch { /* skip if raid_stats not deployed yet */ }

    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = chambers.filter(c =>
    (filter === 'all' || c.type === filter)
    && (!search || c.name.includes(search) || c.template_key.includes(search) || (c.description || '').includes(search))
  )

  // Phase 25.2: 推荐 spawn_weight 调整 — 按 type 分组计算中位数,偏离 50%/200% 给出提示
  const recommendations = useMemo(() => {
    const out = {}
    const byType = {}
    for (const c of chambers) {
      if (!c.enabled) continue
      const cnt = appearanceCounts[c.id] || 0
      if (!byType[c.type]) byType[c.type] = []
      byType[c.type].push({ id: c.id, cnt })
    }
    for (const [type, arr] of Object.entries(byType)) {
      if (arr.length < 2) continue
      const sorted = arr.map(a => a.cnt).sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)]
      if (median === 0) continue
      for (const a of arr) {
        const ratio = a.cnt / median
        if (ratio < 0.5) {
          out[a.id] = { kind: 'up', text: '建议 +1', tip: `仅出现 ${a.cnt} 次,同类型中位数 ${median}` }
        } else if (ratio > 2.0) {
          out[a.id] = { kind: 'down', text: '建议 -1', tip: `出现 ${a.cnt} 次,同类型中位数 ${median}` }
        }
      }
    }
    return out
  }, [chambers, appearanceCounts])

  function openAdd() {
    setEdit({ ...EMPTY })
    setModal(true)
  }
  function openEdit(c) {
    setEdit({
      ...EMPTY,
      ...c,
      exit_cost: c.exit_cost
        ? (typeof c.exit_cost === 'string' ? JSON.parse(c.exit_cost) : c.exit_cost)
        : null,
    })
    setModal(true)
  }

  async function save() {
    if (!edit.template_key?.trim()) { toast('请填写 template_key', 'error'); return }
    if (!edit.name?.trim()) { toast('请填写显示名', 'error'); return }
    const payload = { ...edit }
    delete payload.created_at
    if (payload.exit_cost && !payload.exit_cost.item) payload.exit_cost = null

    if (edit.id) {
      const id = payload.id; delete payload.id
      const { error } = await supabase.from('chamber_templates').update(payload).eq('id', id)
      if (error) { toast('更新失败: ' + error.message, 'error'); return }
      toast('chamber 已更新')
    } else {
      delete payload.id
      const { error } = await supabase.from('chamber_templates').insert(payload)
      if (error) { toast('添加失败: ' + error.message, 'error'); return }
      toast('chamber 已添加')
    }
    setModal(false)
    load()
  }

  async function remove(id) {
    const { error } = await supabase.from('chamber_templates').delete().eq('id', id)
    if (error) { toast('删除失败', 'error'); return }
    toast('chamber 已删除')
    setConfirmDel(null)
    load()
  }

  async function toggleEnabled(c) {
    await supabase.from('chamber_templates').update({ enabled: !c.enabled }).eq('id', c.id)
    load()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#8b949e' }}>加载中...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input placeholder="搜索 chamber..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...INPUT, width: 220 }} />
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ ...INPUT, width: 180 }}>
            <option value="all">所有类型</option>
            {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
          </select>
        </div>
        <button onClick={openAdd} style={BTN('#58a6ff', '#fff')}>+ 添加 chamber</button>
      </div>

      <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>
        共 {chambers.length} 个 chamber · 显示 {filtered.length} · 启用 {chambers.filter(c => c.enabled).length}
        {Object.keys(appearanceCounts).length > 0 && (
          <span style={{ marginLeft: 12, color: '#d29922' }}>
            📊 数字 = 最近 30 局出现次数（红字 = 未出现，建议提升 spawn_weight）
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map(c => {
          const meta = TYPE_OPTIONS.find(t => t.value === c.type) || TYPE_OPTIONS[0]
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
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#e6edf3' }}>{c.name}</span>
                  <span style={{ fontSize: 9, color: '#484f58', fontFamily: 'monospace' }}>{c.template_key}</span>
                  <span style={{
                    padding: '1px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700,
                    background: `${meta.color}15`, color: meta.color,
                  }}>{meta.icon} {meta.label.split(' ')[0]}</span>
                  {c.region_label && <span style={{ fontSize: 9, color: '#8b949e' }}>· {c.region_label}</span>}
                  <span style={{ fontSize: 9, color: '#8b949e' }}>污染 {c.pollution_base}%(+{c.pollution_accel}/t)</span>
                  {c.is_exit && <span style={{ fontSize: 9, color: '#3fb950' }}>🚪 撤离</span>}
                  {c.omega_window > 0 && <span style={{ fontSize: 9, color: '#bc8cff' }}>Ω{c.omega_window}t</span>}
                  <span style={{ fontSize: 9, color: '#d29922' }}>w={c.spawn_weight}</span>
                  {/* Phase 22.3: 最近 30 局出现次数 */}
                  {(() => {
                    const cnt = appearanceCounts[c.id] || 0
                    const color = cnt === 0 ? '#f85149' : cnt > 5 ? '#3fb950' : '#8b949e'
                    return (
                      <span title={`最近 30 局共出现 ${cnt} 次`} style={{
                        fontSize: 9, padding: '1px 6px', borderRadius: 6,
                        background: `${color}15`, color, border: `1px solid ${color}30`,
                      }}>
                        📊 {cnt}
                      </span>
                    )
                  })()}
                  {/* Phase 25.2: 推荐 spawn_weight 调整 */}
                  {(() => {
                    const r = recommendations[c.id]
                    if (!r) return null
                    const color = r.kind === 'up' ? '#d29922' : '#8b949e'
                    return (
                      <span title={r.tip} style={{
                        fontSize: 9, padding: '1px 6px', borderRadius: 6,
                        background: `${color}25`, color, border: `1px solid ${color}50`,
                        fontWeight: 600,
                      }}>
                        ⚖ {r.text}
                      </span>
                    )
                  })()}
                </div>
                {c.description && <div style={{ fontSize: 11, color: '#8b949e', marginTop: 3 }}>{c.description.slice(0, 100)}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => toggleEnabled(c)} style={BTN('transparent', '#8b949e', { fontSize: 11, padding: '4px 10px', border: '1px solid #30363d' })}>
                  {c.enabled ? '禁用' : '启用'}
                </button>
                <button onClick={() => openEdit(c)} style={BTN('transparent', '#58a6ff', { fontSize: 11, padding: '4px 10px', border: '1px solid rgba(88,166,255,0.3)' })}>编辑</button>
                <button onClick={() => setConfirmDel(c)} style={BTN('rgba(248,81,73,0.15)', '#f85149', { fontSize: 11, padding: '4px 10px', border: '1px solid rgba(248,81,73,0.3)' })}>删除</button>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>
            {search ? '没有匹配的 chamber' : '还没有 chamber，点击右上角添加'}
          </div>
        )}
      </div>

      {confirmDel && (
        <Modal open={true} title="确认删除" onClose={() => setConfirmDel(null)}>
          <p style={{ color: '#e6edf3', marginBottom: 16 }}>
            确定删除 chamber「{confirmDel.name}」？这只会删除模板，不影响进行中对局的 raidPath 快照。
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setConfirmDel(null)} style={BTN('transparent', '#8b949e', { border: '1px solid #30363d' })}>取消</button>
            <button onClick={() => remove(confirmDel.id)} style={BTN('rgba(248,81,73,0.15)', '#f85149', { border: '1px solid rgba(248,81,73,0.3)' })}>删除</button>
          </div>
        </Modal>
      )}

      {modal && edit && (
        <Modal open={true} title={edit.id ? `编辑 ${edit.name}` : '添加 chamber'} onClose={() => setModal(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={LABEL}>template_key（业务键）</label>
              <input style={INPUT} value={edit.template_key} onChange={e => setEdit({ ...edit, template_key: e.target.value })} placeholder="如 outer_ring_scan_1" />
            </div>
            <div>
              <label style={LABEL}>显示名</label>
              <input style={INPUT} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} />
            </div>
            <div>
              <label style={LABEL}>类型</label>
              <select style={INPUT} value={edit.type} onChange={e => setEdit({ ...edit, type: e.target.value })}>
                {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={LABEL}>region_label</label>
              <input style={INPUT} value={edit.region_label || ''} onChange={e => setEdit({ ...edit, region_label: e.target.value })} placeholder="如 外环维护廊" />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={LABEL}>lore 描述（玩家进入时显示）</label>
              <textarea rows={2} style={{ ...INPUT, resize: 'vertical' }} value={edit.description || ''} onChange={e => setEdit({ ...edit, description: e.target.value })} />
            </div>
            <div>
              <label style={LABEL}>污染基线</label>
              <input type="number" style={INPUT} value={edit.pollution_base} onChange={e => setEdit({ ...edit, pollution_base: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <label style={LABEL}>污染增速 / 回合</label>
              <input type="number" style={INPUT} value={edit.pollution_accel} onChange={e => setEdit({ ...edit, pollution_accel: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <label style={LABEL}>最大物品池</label>
              <input type="number" style={INPUT} value={edit.max_items} onChange={e => setEdit({ ...edit, max_items: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <label style={LABEL}>最大实体池</label>
              <input type="number" style={INPUT} value={edit.max_npcs} onChange={e => setEdit({ ...edit, max_npcs: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <label style={LABEL}>抽取权重</label>
              <input type="number" step="0.1" style={INPUT} value={edit.spawn_weight} onChange={e => setEdit({ ...edit, spawn_weight: parseFloat(e.target.value) || 1 })} />
            </div>
            <div>
              <label style={LABEL}>出口数（exit_count, 1-3）</label>
              <input type="number" min={1} max={3} style={INPUT} value={edit.exit_count} onChange={e => setEdit({ ...edit, exit_count: Number(e.target.value) || 2 })} />
            </div>
            <div>
              <label style={LABEL}>Ω 倒计时（0 = 不启用）</label>
              <input type="number" style={INPUT} value={edit.omega_window} onChange={e => setEdit({ ...edit, omega_window: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <label style={LABEL}>is_exit（撤离点）</label>
              <select style={INPUT} value={edit.is_exit ? '1' : '0'} onChange={e => setEdit({ ...edit, is_exit: e.target.value === '1' })}>
                <option value="0">否</option>
                <option value="1">是</option>
              </select>
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={LABEL}>exit_cost（JSON, 仅 is_exit=true 用）</label>
              <input style={{ ...INPUT, fontFamily: 'monospace' }} placeholder='{"item":"环段部件","qty":1}'
                value={edit.exit_cost ? JSON.stringify(edit.exit_cost) : ''}
                onChange={e => {
                  const v = e.target.value.trim()
                  if (!v) { setEdit({ ...edit, exit_cost: null }); return }
                  try { setEdit({ ...edit, exit_cost: JSON.parse(v) }) } catch { /* keep typing */ }
                }} />
            </div>
            <div>
              <label style={LABEL}>启用</label>
              <select style={INPUT} value={edit.enabled ? '1' : '0'} onChange={e => setEdit({ ...edit, enabled: e.target.value === '1' })}>
                <option value="1">启用</option>
                <option value="0">禁用</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button onClick={() => setModal(false)} style={BTN('transparent', '#8b949e', { border: '1px solid #30363d' })}>取消</button>
            <button onClick={save} style={BTN('#58a6ff', '#fff')}>{edit.id ? '保存修改' : '添加'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
