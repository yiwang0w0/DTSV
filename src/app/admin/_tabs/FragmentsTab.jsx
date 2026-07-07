'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { postGameApi } from '@/lib/gameApi'
import { BTN, INPUT, LABEL, Modal, SECTION_TITLE, HINT } from '../_shared/ui'

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

// Phase 18.1: 残片三链 — 三个 raid 阶段分别抽对应链
const CHAIN_OPTIONS = [
  { value: 'search',  label: '搜（监听/构造时代碎片）',   icon: '🔍' },
  { value: 'combat',  label: '打（失衡/逃逸时代战斗记录）', icon: '⚔️' },
  { value: 'extract', label: '撤（深界时代撤离日志）',     icon: '🚪' },
]

const RARITY_COLOR = {
  common: '#8b949e', uncommon: '#3fb950', rare: '#58a6ff', legendary: '#d29922',
}
const CATEGORY_ICON = {
  general: '📄', omega: '🌀', eden: '🌿', bubble: '🫧', structure: '🔷',
}
const CHAIN_COLOR = {
  search: '#58a6ff', combat: '#f85149', extract: '#3fb950',
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
  phase_chain: 'search',
  min_pollution: 0,
  requires_fragment_id: null,
  weight: 1.0,
  enabled: true,
  // Phase 20.1: 残片完全解码后对下次 raid 的解锁规则
  unlocks_rules: {
    chamber_weight: {},
    lore_chunk_pool: [],
    npc_unlock: [],
    item_amount_delta: {},
  },
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
      phase_chain: f.phase_chain || 'search',
      // Phase 20.1: 合并解锁规则字段（DB 字段可能为空对象）
      unlocks_rules: {
        chamber_weight: {},
        lore_chunk_pool: [],
        npc_unlock: [],
        item_amount_delta: {},
        ...(f.unlocks_rules || {}),
      },
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

    // 写路径服务端化（service_role · phase-55/52b）：fragment_pool 增删改走 /api/admin/table。
    try {
      await postGameApi('/api/admin/table', { table: 'fragment_pool', op: 'save', id: editFrag.id || null, row: payload })
    } catch (e) { toast((editFrag.id ? '更新失败: ' : '添加失败: ') + (e.message || ''), 'error'); return }
    toast(editFrag.id ? '残片已更新' : '残片已添加')
    setModal(false)
    load()
  }

  async function remove(id) {
    try {
      await postGameApi('/api/admin/table', { table: 'fragment_pool', op: 'delete', id })
    } catch (e) { toast('删除失败', 'error'); return }
    toast('残片已删除')
    setConfirmDel(null)
    load()
  }

  async function toggleEnabled(frag) {
    try {
      await postGameApi('/api/admin/table', { table: 'fragment_pool', op: 'save', id: frag.id, row: { enabled: !frag.enabled } })
    } catch (e) { toast('切换失败', 'error'); return }
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
            <option value="all">全部分类</option>
            {CATEGORY_OPTIONS.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <button onClick={openAdd} style={BTN('#58a6ff', '#fff')}>+ 添加残片</button>
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
                    {/* Phase 18.1: chain 徽章 */}
                    {(() => {
                      const chainKey = frag.phase_chain || 'search'
                      const chainMeta = CHAIN_OPTIONS.find(c => c.value === chainKey)
                      const color = CHAIN_COLOR[chainKey] || '#8b949e'
                      return (
                        <span style={{
                          padding: '1px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700,
                          background: `${color}18`, color, border: `1px solid ${color}40`,
                        }}>
                          {chainMeta?.icon} {chainKey}
                        </span>
                      )
                    })()}
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
                  <button
                    onClick={() => toggleEnabled(frag)}
                    style={BTN('transparent', '#8b949e', { fontSize: 11, padding: '4px 10px', border: '1px solid #30363d' })}
                  >
                    {frag.enabled ? '禁用' : '启用'}
                  </button>
                  <button
                    onClick={() => openEdit(frag)}
                    style={BTN('transparent', '#58a6ff', { fontSize: 11, padding: '4px 10px', border: '1px solid rgba(88,166,255,0.3)' })}
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => setConfirmDel(frag)}
                    style={BTN('rgba(248,81,73,0.15)', '#f85149', { fontSize: 11, padding: '4px 10px', border: '1px solid rgba(248,81,73,0.3)' })}
                  >
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
        <Modal open={true} title="确认删除" onClose={() => setConfirmDel(null)}>
          <p style={{ color: '#e6edf3', marginBottom: 16 }}>
            确定删除残片「{confirmDel.name}」？玩家已发现的记录也会被级联删除。
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setConfirmDel(null)}
              style={BTN('transparent', '#8b949e', { border: '1px solid #30363d' })}
            >
              取消
            </button>
            <button
              onClick={() => remove(confirmDel.id)}
              style={BTN('rgba(248,81,73,0.15)', '#f85149', { border: '1px solid rgba(248,81,73,0.3)' })}
            >
              删除
            </button>
          </div>
        </Modal>
      )}

      {/* 编辑 / 新增 Modal */}
      {modal && editFrag && (
        <Modal open={true} title={editFrag.id ? `编辑残片: ${editFrag.name}` : '添加残片'} onClose={() => setModal(false)}>
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

            {/* Phase 18.1: 三链阶段 */}
            <div>
              <label style={LABEL}>三链阶段（phase_chain）</label>
              <select value={editFrag.phase_chain || 'search'} onChange={e => setEditFrag({ ...editFrag, phase_chain: e.target.value })} style={INPUT}>
                {CHAIN_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
              </select>
              <p style={HINT}>决定残片在哪个 raid 阶段被抽到：搜索 / 击杀 NPC / 撤离</p>
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

          {/* Phase 20.1: 解锁规则编辑器 — 完全解码后的下次 raid 影响 */}
          <div style={SECTION_TITLE}>🔓 解锁规则 <span style={{ color: '#484f58', fontWeight: 400 }}>（完全解码后影响下次 raid）</span></div>
          <div style={{
            background: 'rgba(188,140,255,0.05)',
            border: '1px solid rgba(188,140,255,0.2)',
            borderRadius: 6, padding: 12,
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            {/* lore_chunk_pool — 解锁的 chamber 描述短句池 */}
            <div>
              <label style={LABEL}>Lore 短句池 <span style={{ color: '#484f58' }}>（每行一条，会随机注入 chamber 描述）</span></label>
              <textarea
                rows={3}
                value={(editFrag.unlocks_rules?.lore_chunk_pool || []).join('\n')}
                onChange={e => setEditFrag({
                  ...editFrag,
                  unlocks_rules: {
                    ...(editFrag.unlocks_rules || {}),
                    lore_chunk_pool: e.target.value.split('\n').map(s => s.trim()).filter(Boolean),
                  },
                })}
                placeholder="【Ω-观测残片】回声内含 17.3Hz 节律"
                style={{ ...INPUT, resize: 'vertical', fontSize: 12 }}
              />
              <p style={HINT}>每行一条；30% 概率被注入到本局 chamber 描述里</p>
            </div>

            {/* chamber_weight — JSON 编辑器（key=template_id, value=delta） */}
            <div>
              <label style={LABEL}>Chamber 抽取权重加成 <span style={{ color: '#484f58' }}>（JSON：template_id → delta）</span></label>
              <textarea
                rows={2}
                value={JSON.stringify(editFrag.unlocks_rules?.chamber_weight || {})}
                onChange={e => {
                  try {
                    const obj = JSON.parse(e.target.value || '{}')
                    setEditFrag({
                      ...editFrag,
                      unlocks_rules: { ...(editFrag.unlocks_rules || {}), chamber_weight: obj },
                    })
                  } catch { /* 静默：保留原值 */ }
                }}
                placeholder='{"5": 2, "12": -1}'
                style={{ ...INPUT, resize: 'vertical', fontSize: 11, fontFamily: 'var(--font-jetbrains-mono), monospace' }}
              />
              <p style={HINT}>正数加权重（更可能被抽到），负数减；最低 0.1 保底</p>
            </div>

            {/* npc_unlock — int array */}
            <div>
              <label style={LABEL}>解锁 NPC ID 列表 <span style={{ color: '#484f58' }}>（逗号分隔）</span></label>
              <input
                type="text"
                value={(editFrag.unlocks_rules?.npc_unlock || []).join(',')}
                onChange={e => setEditFrag({
                  ...editFrag,
                  unlocks_rules: {
                    ...(editFrag.unlocks_rules || {}),
                    npc_unlock: e.target.value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)),
                  },
                })}
                placeholder="3,17,42"
                style={INPUT}
              />
              <p style={HINT}>把这些 NPC 加入本局 chamber NPC 池（即使 chamber_template_ids 不含）</p>
            </div>

            {/* item_amount_delta — JSON */}
            <div>
              <label style={LABEL}>物品掉落权重加成 <span style={{ color: '#484f58' }}>（JSON：物品名 → delta）</span></label>
              <textarea
                rows={2}
                value={JSON.stringify(editFrag.unlocks_rules?.item_amount_delta || {})}
                onChange={e => {
                  try {
                    const obj = JSON.parse(e.target.value || '{}')
                    setEditFrag({
                      ...editFrag,
                      unlocks_rules: { ...(editFrag.unlocks_rules || {}), item_amount_delta: obj },
                    })
                  } catch { /* 静默 */ }
                }}
                placeholder='{"结构碎片": 1, "Ω物质": 2}'
                style={{ ...INPUT, resize: 'vertical', fontSize: 11, fontFamily: 'var(--font-jetbrains-mono), monospace' }}
              />
              <p style={HINT}>按物品名加权重；最低 1 保底</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button
              onClick={() => setModal(false)}
              style={BTN('transparent', '#8b949e', { border: '1px solid #30363d' })}
            >
              取消
            </button>
            <button onClick={save} style={BTN('#58a6ff', '#fff')}>
              {editFrag.id ? '保存修改' : '添加残片'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
