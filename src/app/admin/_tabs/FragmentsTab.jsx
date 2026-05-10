'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { BTN, INPUT, LABEL, Modal } from '../_shared/ui'

/* ── 样式常量 ── */
const SECTION_TITLE = {
  fontSize: 13, fontWeight: 700, marginBottom: 12, marginTop: 18,
  paddingBottom: 8, borderBottom: '1px solid #21262d', color: '#e6edf3',
}
const HINT = { fontSize: 11, color: '#484f58', marginTop: 4 }

const CATEGORY_OPTIONS = [
  { value: 'general',   label: '通用记录' },
  { value: 'omega',     label: 'Ω 观测记录' },
  { value: 'eden',      label: '伊甸协议' },
  { value: 'bubble',    label: '气泡宇宙' },
  { value: 'structure', label: '结构体档案' },
]
const RARITY_OPTIONS = [
  { value: 'common',    label: '普通' },
  { value: 'uncommon',  label: '优秀' },
  { value: 'rare',      label: '稀有' },
  { value: 'legendary', label: '传说' },
]
const DISCOVER_OPTIONS = [
  { value: 'search', label: '搜索随机' },
  { value: 'fixed',  label: '固定交互' },
  { value: 'both',   label: '混合' },
]

const RARITY_COLOR = {
  common: '#8b949e', uncommon: '#3fb950', rare: '#58a6ff', legendary: '#d29922',
}
const CATEGORY_ICON = {
  general: '📄', omega: '🌀', eden: '🌿', bubble: '🫧', structure: '🔷',
}

const EMPTY_FRAGMENT = {
  name: '',
  raw_text: '',
  partial_1: '',
  partial_2: '',
  full_text: '',
  category: 'general',
  rarity: 'common',
  discover_mode: 'search',
  maps: [],
  min_pollution: 0,
  requires_fragment_id: null,
  weight: 1.0,
  enabled: true,
}

export default function FragmentsTab({ toast }) {
  const [fragments, setFragments] = useState([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState('all')
  const [search, setSearch]       = useState('')
  const [modal, setModal]         = useState(false)
  const [editFrag, setEditFrag]   = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  async function load() {
    const { data } = await supabase
      .from('fragment_pool')
      .select('*')
      .order('category')
      .order('created_at', { ascending: false })
    setFragments(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = fragments.filter(f =>
    (filter === 'all' || f.category === filter)
    && (!search || f.name.includes(search) || f.full_text?.includes(search))
  )

  function openAdd() {
    setEditFrag({ ...EMPTY_FRAGMENT })
    setModal(true)
  }
  function openEdit(f) {
    setEditFrag({
      ...EMPTY_FRAGMENT,
      ...f,
      maps: f.maps || [],
    })
    setModal(true)
  }

  async function save() {
    if (!editFrag.name.trim()) { toast('请填写残片名称', 'error'); return }
    if (!editFrag.full_text.trim()) { toast('请填写完整文本（level 3）', 'error'); return }

    const payload = { ...editFrag }
    delete payload.created_at

    // requires_fragment_id 空字符串转 null
    if (!payload.requires_fragment_id) payload.requires_fragment_id = null

    if (editFrag.id) {
      const id = payload.id; delete payload.id
      const { error } = await supabase.from('fragment_pool').update(payload).eq('id', id)
      if (error) { toast('更新失败: ' + error.message, 'error'); return }
      toast('残片已更新')
    } else {
      delete payload.id
      const { error } = await supabase.from('fragment_pool').insert(payload)
      if (error) { toast('添加失败: ' + error.message, 'error'); return }
      toast('残片已添加')
    }
    setModal(false)
    load()
  }

  async function remove(id) {
    const { error } = await supabase.from('fragment_pool').delete().eq('id', id)
    if (error) { toast('删除失败', 'error'); return }
    toast('残片已删除')
    setConfirmDel(null)
    load()
  }

  async function toggleEnabled(frag) {
    const { error } = await supabase.from('fragment_pool').update({ enabled: !frag.enabled }).eq('id', frag.id)
    if (error) { toast('切换失败', 'error'); return }
    load()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#8b949e' }}>加载中...</div>

  return (
    <div>
      {/* 工具栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            placeholder="搜索残片名称或内容..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...INPUT, width: 220 }}
          />
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ ...INPUT, width: 140 }}
          >
            <option value="all">所有分类</option>
            {CATEGORY_OPTIONS.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <button onClick={openAdd} style={BTN.primary}>+ 添加残片</button>
      </div>

      {/* 统计 */}
      <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>
        共 {fragments.length} 个残片 · 当前显示 {filtered.length} 个
        · 启用 {fragments.filter(f => f.enabled).length}
        · 禁用 {fragments.filter(f => !f.enabled).length}
      </div>

      {/* 残片列表 */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>
          {search ? '没有匹配的残片' : '还没有残片，点击右上角添加'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(frag => {
            const catIcon = CATEGORY_ICON[frag.category] || '📄'
            const rarColor = RARITY_COLOR[frag.rarity] || '#8b949e'
            const rarLabel = RARITY_OPTIONS.find(r => r.value === frag.rarity)?.label || frag.rarity

            return (
              <div
                key={frag.id}
                style={{
                  background: '#161b22',
                  borderRadius: 8,
                  border: `1px solid ${frag.enabled ? '#21262d' : '#f8514930'}`,
                  padding: '10px 14px',
                  opacity: frag.enabled ? 1 : 0.5,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{catIcon}</span>
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#e6edf3' }}>
                      {frag.name}
                    </span>
                    <span style={{
                      padding: '1px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700,
                      background: `${rarColor}15`, color: rarColor,
                    }}>
                      {rarLabel}
                    </span>
                    <span style={{
                      padding: '1px 8px', borderRadius: 10, fontSize: 9, fontWeight: 600,
                      background: 'rgba(88,166,255,0.1)', color: '#58a6ff',
                    }}>
                      {DISCOVER_OPTIONS.find(d => d.value === frag.discover_mode)?.label || frag.discover_mode}
                    </span>
                    {frag.min_pollution > 0 && (
                      <span style={{
                        padding: '1px 8px', borderRadius: 10, fontSize: 9,
                        background: 'rgba(248,81,73,0.1)', color: '#f85149',
                      }}>
                        ≥{frag.min_pollution}% 污染
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#484f58', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {frag.full_text?.substring(0, 80) || '(无完整文本)'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => toggleEnabled(frag)} style={{ ...BTN.secondary, fontSize: 11, padding: '4px 10px' }}>
                    {frag.enabled ? '禁用' : '启用'}
                  </button>
                  <button onClick={() => openEdit(frag)} style={{ ...BTN.secondary, fontSize: 11, padding: '4px 10px' }}>
                    编辑
                  </button>
                  <button onClick={() => setConfirmDel(frag)} style={{ ...BTN.danger, fontSize: 11, padding: '4px 10px' }}>
                    删除
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 删除确认 */}
      {confirmDel && (
        <Modal title="确认删除" onClose={() => setConfirmDel(null)}>
          <p style={{ color: '#e6edf3', marginBottom: 16 }}>
            确定删除残片「{confirmDel.name}」？玩家已发现的记录也会被级联删除。
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setConfirmDel(null)} style={BTN.secondary}>取消</button>
            <button onClick={() => remove(confirmDel.id)} style={BTN.danger}>删除</button>
          </div>
        </Modal>
      )}

      {/* 编辑 / 新增 Modal */}
      {modal && editFrag && (
        <Modal title={editFrag.id ? `编辑残片: ${editFrag.name}` : '添加残片'} onClose={() => setModal(false)} width={640}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* 名称 */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={LABEL}>残片名称</label>
              <input
                value={editFrag.name}
                onChange={e => setEditFrag({ ...editFrag, name: e.target.value })}
                placeholder="如：Ω-17号观测日志 #003"
                style={INPUT}
              />
            </div>

            {/* 分类 */}
            <div>
              <label style={LABEL}>分类</label>
              <select value={editFrag.category} onChange={e => setEditFrag({ ...editFrag, category: e.target.value })} style={INPUT}>
                {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            {/* 稀有度 */}
            <div>
              <label style={LABEL}>稀有度</label>
              <select value={editFrag.rarity} onChange={e => setEditFrag({ ...editFrag, rarity: e.target.value })} style={INPUT}>
                {RARITY_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            {/* 发现方式 */}
            <div>
              <label style={LABEL}>发现方式</label>
              <select value={editFrag.discover_mode} onChange={e => setEditFrag({ ...editFrag, discover_mode: e.target.value })} style={INPUT}>
                {DISCOVER_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>

            {/* 权重 */}
            <div>
              <label style={LABEL}>搜索权重</label>
              <input
                type="number" step="0.1" min="0.1"
                value={editFrag.weight}
                onChange={e => setEditFrag({ ...editFrag, weight: parseFloat(e.target.value) || 1.0 })}
                style={INPUT}
              />
              <p style={HINT}>越高越容易在搜索中被选中</p>
            </div>

            {/* 最低污染度 */}
            <div>
              <label style={LABEL}>最低污染度要求</label>
              <input
                type="number" min="0" max="100"
                value={editFrag.min_pollution}
                onChange={e => setEditFrag({ ...editFrag, min_pollution: parseInt(e.target.value) || 0 })}
                style={INPUT}
              />
              <p style={HINT}>0 = 无要求</p>
            </div>

            {/* 前置残片 */}
            <div>
              <label style={LABEL}>前置残片 ID（可选）</label>
              <input
                type="number"
                value={editFrag.requires_fragment_id || ''}
                onChange={e => setEditFrag({ ...editFrag, requires_fragment_id: e.target.value ? parseInt(e.target.value) : null })}
                placeholder="留空 = 无前置"
                style={INPUT}
              />
            </div>
          </div>

          {/* 四级文本内容 */}
          <div style={SECTION_TITLE}>解码内容分层</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={LABEL}>Level 0 — 乱码占位符 <span style={{ color: '#484f58' }}>（完全未解码时显示）</span></label>
              <textarea
                rows={2}
                value={editFrag.raw_text}
                onChange={e => setEditFrag({ ...editFrag, raw_text: e.target.value })}
                placeholder="▓▒░ 数据损坏… ░▒▓"
                style={{ ...INPUT, resize: 'vertical', fontFamily: 'var(--font-jetbrains-mono), monospace' }}
              />
            </div>
            <div>
              <label style={LABEL}>Level 1 — 初步解码 <span style={{ color: '#484f58' }}>（约30%可读）</span></label>
              <textarea
                rows={3}
                value={editFrag.partial_1}
                onChange={e => setEditFrag({ ...editFrag, partial_1: e.target.value })}
                placeholder="部分可读的文字，穿插乱码..."
                style={{ ...INPUT, resize: 'vertical' }}
              />
            </div>
            <div>
              <label style={LABEL}>Level 2 — 深度解码 <span style={{ color: '#484f58' }}>（约70%可读）</span></label>
              <textarea
                rows={3}
                value={editFrag.partial_2}
                onChange={e => setEditFrag({ ...editFrag, partial_2: e.target.value })}
                placeholder="大部分可读，少量模糊..."
                style={{ ...INPUT, resize: 'vertical' }}
              />
            </div>
            <div>
              <label style={LABEL}>Level 3 — 完整文本 <span style={{ color: '#3fb950' }}>（完全解码后显示）</span></label>
              <textarea
                rows={4}
                value={editFrag.full_text}
                onChange={e => setEditFrag({ ...editFrag, full_text: e.target.value })}
                placeholder="完整可读的残片内容..."
                style={{ ...INPUT, resize: 'vertical' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button onClick={() => setModal(false)} style={BTN.secondary}>取消</button>
            <button onClick={save} style={BTN.primary}>{editFrag.id ? '保存修改' : '添加残片'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
