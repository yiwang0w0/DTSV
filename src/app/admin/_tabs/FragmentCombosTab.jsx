'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { BTN, INPUT, LABEL, Modal } from '../_shared/ui'

/**
 * Phase 20.4 — fragment_combos 管理：A + B → C 合成解锁
 *
 * 玩家在 A 和 B 残片上都达到 decode_level=3 时，C 残片自动以 decode_level=0
 * 出现在玩家档案中。Description 在 /archive 知识图谱里展示作为合成叙事。
 */

const HINT = { fontSize: 11, color: '#484f58', marginTop: 4 }

const EMPTY_COMBO = {
  fragment_id_a: null,
  fragment_id_b: null,
  unlocks_fragment: null,
  description: '',
  enabled: true,
}

export default function FragmentCombosTab({ toast }) {
  const [combos, setCombos] = useState([])
  const [fragments, setFragments] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editCombo, setEditCombo] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  async function load() {
    const [combosRes, fragsRes] = await Promise.all([
      supabase.from('fragment_combos').select('*').order('id', { ascending: false }),
      supabase.from('fragment_pool').select('id, name, category, rarity').order('category'),
    ])
    setCombos(combosRes.data || [])
    setFragments(fragsRes.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const fragMap = new Map(fragments.map(f => [f.id, f]))
  const fragLabel = (id) => {
    const f = fragMap.get(id)
    return f ? `[${f.id}] ${f.name}` : `[${id}] ?`
  }

  function openAdd() {
    setEditCombo({ ...EMPTY_COMBO })
    setModal(true)
  }
  function openEdit(c) {
    setEditCombo({ ...EMPTY_COMBO, ...c })
    setModal(true)
  }

  async function save() {
    if (!editCombo.fragment_id_a || !editCombo.fragment_id_b || !editCombo.unlocks_fragment) {
      toast('A / B / C 残片都必须选择', 'error')
      return
    }
    if (editCombo.fragment_id_a === editCombo.unlocks_fragment || editCombo.fragment_id_b === editCombo.unlocks_fragment) {
      toast('C 残片不能与 A 或 B 相同', 'error')
      return
    }
    const payload = { ...editCombo }
    delete payload.created_at
    if (editCombo.id) {
      const id = payload.id; delete payload.id
      const { error } = await supabase.from('fragment_combos').update(payload).eq('id', id)
      if (error) { toast('更新失败: ' + error.message, 'error'); return }
      toast('配方已更新')
    } else {
      delete payload.id
      const { error } = await supabase.from('fragment_combos').insert(payload)
      if (error) { toast('添加失败: ' + error.message, 'error'); return }
      toast('配方已添加')
    }
    setModal(false)
    load()
  }

  async function remove(id) {
    const { error } = await supabase.from('fragment_combos').delete().eq('id', id)
    if (error) { toast('删除失败', 'error'); return }
    toast('配方已删除')
    setConfirmDel(null)
    load()
  }

  async function toggleEnabled(c) {
    await supabase.from('fragment_combos').update({ enabled: !c.enabled }).eq('id', c.id)
    load()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#8b949e' }}>加载中...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#8b949e' }}>
          残片合成配方：A + B（均完全解码）→ 自动解锁 C 残片
          <br />共 {combos.length} 条 · 启用 {combos.filter(c => c.enabled).length}
        </div>
        <button onClick={openAdd} style={BTN('#bc8cff', '#fff')}>+ 添加配方</button>
      </div>

      {combos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>
          还没有合成配方，点击右上角添加
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {combos.map(c => (
            <div key={c.id} style={{
              background: '#161b22', borderRadius: 8,
              border: `1px solid ${c.enabled ? '#21262d' : '#f8514930'}`,
              padding: '10px 14px',
              opacity: c.enabled ? 1 : 0.5,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ padding: '2px 8px', borderRadius: 6, background: '#58a6ff18', color: '#58a6ff', border: '1px solid #58a6ff40' }}>
                      {fragLabel(c.fragment_id_a)}
                    </span>
                    <span style={{ color: '#484f58' }}>+</span>
                    <span style={{ padding: '2px 8px', borderRadius: 6, background: '#3fb95018', color: '#3fb950', border: '1px solid #3fb95040' }}>
                      {fragLabel(c.fragment_id_b)}
                    </span>
                    <span style={{ color: '#bc8cff' }}>→</span>
                    <span style={{ padding: '2px 8px', borderRadius: 6, background: '#bc8cff18', color: '#bc8cff', border: '1px solid #bc8cff40', fontWeight: 700 }}>
                      {fragLabel(c.unlocks_fragment)}
                    </span>
                  </div>
                  {c.description && (
                    <div style={{ fontSize: 11, color: '#8b949e', fontStyle: 'italic' }}>
                      {c.description}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => toggleEnabled(c)} style={BTN('transparent', '#8b949e', { fontSize: 11, padding: '4px 10px', border: '1px solid #30363d' })}>
                    {c.enabled ? '禁用' : '启用'}
                  </button>
                  <button onClick={() => openEdit(c)} style={BTN('transparent', '#58a6ff', { fontSize: 11, padding: '4px 10px', border: '1px solid rgba(88,166,255,0.3)' })}>
                    编辑
                  </button>
                  <button onClick={() => setConfirmDel(c)} style={BTN('rgba(248,81,73,0.15)', '#f85149', { fontSize: 11, padding: '4px 10px', border: '1px solid rgba(248,81,73,0.3)' })}>
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDel && (
        <Modal open={true} title="确认删除" onClose={() => setConfirmDel(null)}>
          <p style={{ color: '#e6edf3', marginBottom: 16 }}>
            确定删除配方 {fragLabel(confirmDel.fragment_id_a)} + {fragLabel(confirmDel.fragment_id_b)} → {fragLabel(confirmDel.unlocks_fragment)}？
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setConfirmDel(null)} style={BTN('transparent', '#8b949e', { border: '1px solid #30363d' })}>取消</button>
            <button onClick={() => remove(confirmDel.id)} style={BTN('rgba(248,81,73,0.15)', '#f85149', { border: '1px solid rgba(248,81,73,0.3)' })}>删除</button>
          </div>
        </Modal>
      )}

      {modal && editCombo && (
        <Modal open={true} title={editCombo.id ? '编辑合成配方' : '添加合成配方'} onClose={() => setModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={LABEL}>残片 A（输入）</label>
              <select
                value={editCombo.fragment_id_a || ''}
                onChange={e => setEditCombo({ ...editCombo, fragment_id_a: parseInt(e.target.value) || null })}
                style={INPUT}
              >
                <option value="">— 选择 —</option>
                {fragments.map(f => (
                  <option key={f.id} value={f.id}>[{f.id}] {f.name} ({f.category})</option>
                ))}
              </select>
              <p style={HINT}>玩家需在 A 上达到 decode_level=3</p>
            </div>
            <div>
              <label style={LABEL}>残片 B（输入）</label>
              <select
                value={editCombo.fragment_id_b || ''}
                onChange={e => setEditCombo({ ...editCombo, fragment_id_b: parseInt(e.target.value) || null })}
                style={INPUT}
              >
                <option value="">— 选择 —</option>
                {fragments.map(f => (
                  <option key={f.id} value={f.id}>[{f.id}] {f.name} ({f.category})</option>
                ))}
              </select>
              <p style={HINT}>玩家需在 B 上达到 decode_level=3</p>
            </div>
            <div>
              <label style={LABEL}>解锁残片 C（输出）</label>
              <select
                value={editCombo.unlocks_fragment || ''}
                onChange={e => setEditCombo({ ...editCombo, unlocks_fragment: parseInt(e.target.value) || null })}
                style={INPUT}
              >
                <option value="">— 选择 —</option>
                {fragments.map(f => (
                  <option key={f.id} value={f.id}>[{f.id}] {f.name} ({f.category})</option>
                ))}
              </select>
              <p style={HINT}>A+B 满足时自动解锁（decode_level=0 起步）</p>
            </div>
            <div>
              <label style={LABEL}>合成叙事文案（在知识图谱里展示）</label>
              <textarea
                rows={2}
                value={editCombo.description}
                onChange={e => setEditCombo({ ...editCombo, description: e.target.value })}
                placeholder="如：当 Ω 频率残响与伊甸协议日志同时被解码，结构边界出现了新条目..."
                style={{ ...INPUT, resize: 'vertical' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button onClick={() => setModal(false)} style={BTN('transparent', '#8b949e', { border: '1px solid #30363d' })}>取消</button>
            <button onClick={save} style={BTN('#bc8cff', '#fff')}>
              {editCombo.id ? '保存修改' : '添加配方'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
