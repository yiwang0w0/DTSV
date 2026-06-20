'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { BTN, INPUT, LABEL, Modal, ITEM_KIND_META, SECTION_TITLE as SHARED_SECTION_TITLE, HINT as SHARED_HINT } from '../_shared/ui'

/* ── 子类型中文映射（远星函馆） ── */
const ITEM_SUB_KINDS = {
  // 远星 5 kind 都不强制 sub_kind（除非是 equipment 但装备走 equipment_tiers，不在 item_pool）
  tech_fragment: [
    { value: '', label: '（无）' },
    { value: 'protocol', label: '协议' },
    { value: 'algorithm', label: '算法' },
  ],
  platform_part: [
    { value: '', label: '（无）' },
    { value: 'core', label: '核心' },
    { value: 'buffer', label: '缓冲' },
    { value: 'interface', label: '接口' },
  ],
  omega_matter: [
    { value: '', label: '（无）' },
  ],
  consumable: [
    { value: '', label: '（无）' },
    { value: 'heal',         label: '治疗' },
    { value: 'pollution',    label: '污染降低' },
    { value: 'buff',         label: '增益' },
    { value: 'utility',      label: '功能' },
  ],
  // equipment 一般不在 item_pool；仅作向后兼容保留
  equipment: [
    { value: 'probe',  label: '探测设备' },
    { value: 'shield', label: '防护装置' },
    { value: 'weapon', label: '武器模块' },
    { value: 'comm',   label: '通信组件' },
  ],
}

/* ── 获取子类型中文 label ── */
function subKindLabel(kind, subKind) {
  const list = ITEM_SUB_KINDS[kind] || []
  const found = list.find(s => s.value === subKind)
  return found ? found.label : subKind || '—'
}

/* ── 分组标题 / 字段说明样式 ── 道具页用蓝色小字变体：在 _shared 基样式上 spread 覆写派生，渲染等价 ── */
const SECTION_TITLE = { ...SHARED_SECTION_TITLE, fontSize: 12, color: '#58a6ff', marginBottom: 10, paddingBottom: 6, letterSpacing: '0.3px' }
const HINT = { ...SHARED_HINT, marginTop: 3 }

export default function ItemsTab({ items, buffPool, onRefresh, toast }) {
  const [filter, setFilter]     = useState('all')
  const [search, setSearch]     = useState('')
  const [modal, setModal]       = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  // Phase 19.10: 加载 chamber_templates 替代 MAP_LIST
  const [chambers, setChambers] = useState([])
  useEffect(() => {
    supabase.from('chamber_templates').select('id,template_key,name,type,region_label').eq('enabled', true)
      .then(({ data }) => setChambers(data || []))
  }, [])

  // Phase 50: 道具系列标签（item_tags 受管词表 → item_pool.tag_ids 多标签）
  const [tags, setTags] = useState([])
  const [tagFilter, setTagFilter] = useState(null)   // 选中的标签 id（null=不按标签筛）
  useEffect(() => {
    supabase.from('item_tags').select('id,name,color,sort_order,enabled').order('sort_order')
      .then(({ data }) => setTags(data || []))
  }, [])
  const tagOf = (id) => tags.find(t => t.id === id)

  const filtered = items.filter(i =>
    (filter === 'all' || i.kind === filter) &&
    (!tagFilter || (i.tag_ids || []).includes(tagFilter)) &&
    (!search || i.name.includes(search) || (i.description || '').includes(search))
  )

  function openAdd() {
    setEditItem({
      name: '', kind: 'consumable', sub_kind: '', atk: 0, def: 0, heal: 0, effect: 0, amount: 1,
      chamber_template_ids: [], tag_ids: [], description: '', on_use_buff_ids: [], heal_formula: '', atk_formula: '', def_formula: '',
      // Phase 17: 使用模式 + 情报文本
      use_mode: 'consume', inspect_text: '',
    })
    setModal(true)
  }
  function openEdit(item) {
    setEditItem({
      ...item,
      chamber_template_ids: item.chamber_template_ids || [],
      tag_ids: item.tag_ids || [],
      on_use_buff_ids: item.on_use_buff_ids || [],
      heal_formula: item.heal_formula || '',
      atk_formula: item.atk_formula || '',
      def_formula: item.def_formula || '',
      effect: item.effect ?? 0,
      use_mode: item.use_mode || 'consume',
      inspect_text: item.inspect_text || '',
    })
    setModal(true)
  }
  async function save() {
    if (!editItem.name.trim()) { toast('请填写道具名称', 'error'); return }
    const payload = { ...editItem }; delete payload.created_at
    if (editItem.id) {
      const id = payload.id; delete payload.id
      const { error } = await supabase.from('item_pool').update(payload).eq('id', id)
      if (error) { toast('更新失败', 'error'); return }
      toast('道具已更新')
    } else {
      delete payload.id
      const { error } = await supabase.from('item_pool').insert(payload)
      if (error) { toast('添加失败', 'error'); return }
      toast('道具已添加')
    }
    setModal(false); setEditItem(null); onRefresh('items')
  }
  async function del(id) {
    const { error } = await supabase.from('item_pool').delete().eq('id', id)
    if (error) { toast('删除失败', 'error'); return }
    toast('道具已删除'); setConfirmDel(null); onRefresh('items')
  }
  function toggleArr(arr, id) { return arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id] }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input style={{ ...INPUT, width: 190 }} placeholder="🔍 搜索道具..." value={search} onChange={e => setSearch(e.target.value)} />
          <div style={{ display: 'flex', gap: 4 }}>
            {['all', ...Object.keys(ITEM_KIND_META)].map(k => (
              <button key={k} onClick={() => setFilter(k)} style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: `1px solid ${filter === k ? '#58a6ff' : '#30363d'}`, background: filter === k ? 'rgba(88,166,255,0.12)' : 'transparent', color: filter === k ? '#58a6ff' : '#8b949e' }}>
                {k === 'all' ? '全部' : ITEM_KIND_META[k].label}
              </button>
            ))}
          </div>
          {tags.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', borderLeft: '1px solid #30363d', paddingLeft: 8 }}>
              <span style={{ fontSize: 11, color: '#484f58' }}>🏷️</span>
              {tags.map(t => {
                const active = tagFilter === t.id
                return (
                  <button key={t.id} onClick={() => setTagFilter(active ? null : t.id)}
                    style={{ padding: '5px 11px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: `1px solid ${active ? t.color : '#30363d'}`, background: active ? `${t.color}22` : 'transparent', color: active ? t.color : '#8b949e' }}>
                    {t.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <button onClick={openAdd} style={BTN('#58a6ff', '#fff')}>+ 新增道具</button>
      </div>

      {/* ── 道具卡片列表 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {filtered.map(item => {
          const meta = ITEM_KIND_META[item.kind] || { label: '其他', color: '#8b949e', icon: '📦' }
          const isConf = confirmDel === item.id
          return (
            <div key={item.id} style={{ background: '#1c2129', borderRadius: 12, padding: 16, border: `1px solid ${isConf ? '#f85149' : '#30363d'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>
                    {meta.icon} {item.name}
                    <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 7px', borderRadius: 8, background: `${meta.color}15`, color: meta.color, border: `1px solid ${meta.color}30` }}>{meta.label}</span>
                    {item.sub_kind && <span style={{ marginLeft: 4, fontSize: 10, color: '#8b949e' }}>{subKindLabel(item.kind, item.sub_kind)}</span>}
                  </div>
                  {item.description && <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 4 }}>{item.description}</div>}
                  <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                    {item.atk > 0 && <span style={{ color: '#f85149' }}>ATK +{item.atk}</span>}
                    {item.def > 0 && <span style={{ color: '#58a6ff' }}>DEF +{item.def}</span>}
                    {item.heal > 0 && <span style={{ color: '#3fb950' }}>HEAL +{item.heal}</span>}
                    {item.effect > 0 && <span style={{ color: '#d29922' }}>效果值 {item.effect}</span>}
                    <span style={{ color: '#8b949e' }}>权重 {item.amount ?? 1}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => openEdit(item)} style={BTN('transparent', '#58a6ff', { padding: '4px 10px', border: '1px solid rgba(88,166,255,0.3)' })}>编辑</button>
                  {isConf
                    ? <><button onClick={() => del(item.id)} style={BTN('rgba(248,81,73,0.15)', '#f85149', { padding: '4px 10px', border: '1px solid rgba(248,81,73,0.3)' })}>确认</button>
                       <button onClick={() => setConfirmDel(null)} style={BTN('transparent', '#8b949e', { padding: '4px 10px', border: '1px solid #30363d' })}>取消</button></>
                    : <button onClick={() => setConfirmDel(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#484f58', fontSize: 15 }}>🗑️</button>}
                </div>
              </div>
              {(item.tag_ids || []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {(item.tag_ids || []).map(tid => {
                    const t = tagOf(tid)
                    return t
                      ? <span key={tid} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: `${t.color}1a`, color: t.color, border: `1px solid ${t.color}33` }}>{t.name}</span>
                      : <span key={tid} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, color: '#f85149' }}>⚠#{tid}</span>
                  })}
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                {(item.chamber_template_ids || []).slice(0, 5).map(cid => <span key={cid} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(88,166,255,0.1)', color: '#58a6ff' }}>{chambers.find(x => x.id === cid)?.name || `#${cid}`}</span>)}
                {(item.chamber_template_ids || []).length > 5 && <span style={{ fontSize: 10, color: '#8b949e' }}>+{item.chamber_template_ids.length - 5}</span>}
                {!(item.chamber_template_ids?.length) && <span style={{ fontSize: 10, color: '#484f58' }}>未分配 chamber</span>}
              </div>
            </div>
          )
        })}
      </div>
      {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 56, color: '#8b949e' }}>{search ? `未找到"${search}"` : '暂无道具'}</div>}

      {/* ── 编辑弹窗 ── */}
      <Modal open={modal} onClose={() => { setModal(false); setEditItem(null) }} title={editItem?.id ? `编辑道具：${editItem?.name}` : '添加道具'}>
        {editItem && (
          <div>
            {/* ─── 基础信息 ─── */}
            <div style={SECTION_TITLE}>📋 基础信息</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={LABEL}>名称</label>
                <input style={INPUT} value={editItem.name} onChange={e => setEditItem({ ...editItem, name: e.target.value })} />
                <div style={HINT}>道具的显示名称，玩家可见</div>
              </div>
              <div>
                <label style={LABEL}>类型</label>
                <select style={INPUT} value={editItem.kind} onChange={e => setEditItem({ ...editItem, kind: e.target.value, sub_kind: ITEM_SUB_KINDS[e.target.value]?.[0]?.value || '' })}>
                  {Object.entries(ITEM_KIND_META).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
                <div style={HINT}>决定道具的基本分类和图标</div>
              </div>
              <div>
                <label style={LABEL}>子类型</label>
                <select style={INPUT} value={editItem.sub_kind || ''} onChange={e => setEditItem({ ...editItem, sub_kind: e.target.value })}>
                  {(ITEM_SUB_KINDS[editItem.kind] || []).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <div style={HINT}>更细粒度的分类，影响战斗计算</div>
              </div>
              <div>
                <label style={LABEL}>出现权重</label>
                <input type="number" style={INPUT} value={editItem.amount} onChange={e => setEditItem({ ...editItem, amount: Number(e.target.value) })} />
                <div style={HINT}>搜索时出现的相对概率，数值越大越常见</div>
              </div>
              <div>
                <label style={LABEL}>效果值 (Effect)</label>
                <input type="number" style={INPUT} value={editItem.effect} onChange={e => setEditItem({ ...editItem, effect: Number(e.target.value) })} />
                <div style={HINT}>道具使用时的通用效果数值</div>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={LABEL}>描述</label>
                <input style={INPUT} value={editItem.description || ''} onChange={e => setEditItem({ ...editItem, description: e.target.value })} />
                <div style={HINT}>对玩家展示的道具说明文本（背包项卡片下方）</div>
              </div>
            </div>

            {/* ─── Phase 17: 使用模式 ─── */}
            <div style={SECTION_TITLE}>🎒 使用模式（Phase 17）</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={LABEL}>use_mode</label>
                <select
                  style={INPUT}
                  value={editItem.use_mode || 'consume'}
                  onChange={e => setEditItem({ ...editItem, use_mode: e.target.value })}
                >
                  <option value="consume">consume — 使用：应用 effect + 消耗</option>
                  <option value="inspect_keep">inspect_keep — 查看：写日志 + 不消耗</option>
                  <option value="inspect_consume">inspect_consume — 查看：写日志 + 一次性消耗</option>
                </select>
                <div style={HINT}>
                  inspect 模式忽略 ATK/DEF/HEAL/effect/buff，只把 inspect_text（或回落 description）写入对局日志
                </div>
              </div>
              <div>
                <label style={LABEL}>inspect_text（情报文本）</label>
                <textarea
                  rows={4}
                  style={{ ...INPUT, fontFamily: 'inherit', resize: 'vertical' }}
                  value={editItem.inspect_text || ''}
                  disabled={(editItem.use_mode || 'consume') === 'consume'}
                  onChange={e => setEditItem({ ...editItem, inspect_text: e.target.value })}
                  placeholder="例：锚点-β 残段日志：……整段失稳前 17 秒，环结构出现非典型振颤……"
                />
                <div style={HINT}>
                  仅 inspect_keep / inspect_consume 启用；玩家「查看」时会以「X 查看 物品：内容」格式写日志
                </div>
              </div>
            </div>

            {/* ─── 战斗属性 ─── */}
            <div style={SECTION_TITLE}>⚔️ 战斗属性</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={LABEL}>ATK 攻击</label>
                <input type="number" style={INPUT} value={editItem.atk} onChange={e => setEditItem({ ...editItem, atk: Number(e.target.value) })} />
                <div style={HINT}>装备/使用时增加的攻击力</div>
              </div>
              <div>
                <label style={LABEL}>DEF 防御</label>
                <input type="number" style={INPUT} value={editItem.def} onChange={e => setEditItem({ ...editItem, def: Number(e.target.value) })} />
                <div style={HINT}>装备/使用时增加的防御力</div>
              </div>
              <div>
                <label style={LABEL}>HEAL 治疗</label>
                <input type="number" style={INPUT} value={editItem.heal} onChange={e => setEditItem({ ...editItem, heal: Number(e.target.value) })} />
                <div style={HINT}>使用时恢复的生命值</div>
              </div>
            </div>

            {/* ─── 技能公式 ─── */}
            <div style={SECTION_TITLE}>🧮 技能公式</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              <div>
                <label style={LABEL}>治疗公式 (heal_formula)</label>
                <input style={{ ...INPUT, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} value={editItem.heal_formula} onChange={e => setEditItem({ ...editItem, heal_formula: e.target.value })} placeholder="例: base_heal * (1 + int * 0.02)" />
                <div style={HINT}>留空则使用固定 HEAL 数值，支持 evalFormula 变量</div>
              </div>
              <div>
                <label style={LABEL}>攻击公式 (atk_formula)</label>
                <input style={{ ...INPUT, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} value={editItem.atk_formula} onChange={e => setEditItem({ ...editItem, atk_formula: e.target.value })} placeholder="例: base_atk * (1 + level * 0.05)" />
                <div style={HINT}>留空则使用固定 ATK 数值</div>
              </div>
              <div>
                <label style={LABEL}>防御公式 (def_formula)</label>
                <input style={{ ...INPUT, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} value={editItem.def_formula} onChange={e => setEditItem({ ...editItem, def_formula: e.target.value })} placeholder="例: base_def * 1.5" />
                <div style={HINT}>留空则使用固定 DEF 数值</div>
              </div>
            </div>

            {/* ─── Buff 触发 ─── */}
            <div style={SECTION_TITLE}>✨ 使用时触发 Buff</div>
            {buffPool.length > 0 ? (
              <div>
                <div style={HINT}>点击下方标签来选择/取消道具使用时触发的 Buff 效果，绿色为增益、红色为减益</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                  {buffPool.map(b => {
                    const sel = (editItem.on_use_buff_ids || []).includes(b.id)
                    return (
                      <button key={b.id} onClick={() => setEditItem({ ...editItem, on_use_buff_ids: toggleArr(editItem.on_use_buff_ids || [], b.id) })}
                        style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, cursor: 'pointer', border: `1px solid ${sel ? (b.is_debuff ? '#f85149' : '#3fb950') : '#30363d'}`, background: sel ? (b.is_debuff ? 'rgba(248,81,73,0.12)' : 'rgba(63,185,80,0.12)') : 'transparent', color: sel ? (b.is_debuff ? '#f85149' : '#3fb950') : '#8b949e' }}>
                        {b.icon} {b.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div style={{ ...HINT, padding: '12px 0' }}>暂无可用的 Buff，请先在「战斗规则」标签页中添加 Buff 池</div>
            )}

            {/* ─── chamber 分配（Phase 19.10 替代 maps） ─── */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ ...LABEL, margin: 0 }}>分配 chamber ({(editItem.chamber_template_ids || []).length} / {chambers.length} 已选)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditItem({ ...editItem, chamber_template_ids: chambers.map(c => c.id) })} style={{ background: 'none', border: 'none', color: '#58a6ff', fontSize: 12, cursor: 'pointer' }}>全选</button>
                  <button onClick={() => setEditItem({ ...editItem, chamber_template_ids: [] })} style={{ background: 'none', border: 'none', color: '#8b949e', fontSize: 12, cursor: 'pointer' }}>清空</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 200, overflowY: 'auto' }}>
                {chambers.map(c => {
                  const selected = (editItem.chamber_template_ids || []).includes(c.id)
                  return (
                    <button key={c.id} onClick={() => setEditItem({ ...editItem, chamber_template_ids: toggleArr(editItem.chamber_template_ids || [], c.id) })}
                      style={{ padding: '4px 10px', borderRadius: 16, fontSize: 10, cursor: 'pointer', border: `1px solid ${selected ? '#58a6ff' : '#30363d'}`, background: selected ? 'rgba(88,166,255,0.12)' : 'transparent', color: selected ? '#58a6ff' : '#8b949e' }}>
                      {c.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ─── 系列标签（Phase 50） ─── */}
            <div style={{ marginTop: 14 }}>
              <label style={{ ...LABEL, marginBottom: 8, display: 'block' }}>🏷️ 系列标签（{(editItem.tag_ids || []).length} 已选）</label>
              {tags.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {tags.map(t => {
                    const sel = (editItem.tag_ids || []).includes(t.id)
                    return (
                      <button key={t.id} onClick={() => setEditItem({ ...editItem, tag_ids: toggleArr(editItem.tag_ids || [], t.id) })}
                        style={{ padding: '4px 11px', borderRadius: 16, fontSize: 11, cursor: 'pointer', border: `1px solid ${sel ? t.color : '#30363d'}`, background: sel ? `${t.color}22` : 'transparent', color: sel ? t.color : '#8b949e' }}>
                        {t.name}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div style={{ ...HINT, padding: '8px 0' }}>暂无标签，去「🏷️ 道具标签」tab 先建标签</div>
              )}
            </div>

            {/* ─── 操作按钮 ─── */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button onClick={() => { setModal(false); setEditItem(null) }} style={{ ...BTN('transparent', '#8b949e'), border: '1px solid #30363d' }}>取消</button>
              <button onClick={save} style={BTN('#58a6ff', '#fff')}>{editItem.id ? '保存修改' : '添加道具'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
