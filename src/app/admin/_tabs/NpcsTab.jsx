'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { BTN, INPUT, LABEL, Modal, NPC_LEVEL_META, RARITY_META } from '../_shared/ui'
import { ENTITY_TYPE_META } from '@/lib/constants'

/* ── 样式常量 ── */
const SECTION_TITLE = {
  fontSize: 13, fontWeight: 700, marginBottom: 12, marginTop: 18,
  paddingBottom: 8, borderBottom: '1px solid #21262d', color: '#e6edf3',
}
const HINT = { fontSize: 11, color: '#484f58', marginTop: 4 }

/* ── Phase 37: NPC 装备槽（镜像玩家 loadout 四槽，键与 equipment_series.slot 对齐）── */
const LOADOUT_SLOTS = [
  { key: 'probe',  label: '探针', icon: '🛰️' },
  { key: 'shield', label: '护盾', icon: '🛡️' },
  { key: 'weapon', label: '武器', icon: '⚔️' },
  { key: 'comm',   label: '通讯', icon: '📡' },
]
const EMPTY_LOADOUT = { probe: null, shield: null, weapon: null, comm: null }

export default function NpcsTab({ npcs, onRefresh, toast }) {
  // Phase 19.10: 加载 chamber_templates 替代 MAP_LIST
  const [chambers, setChambers] = useState([])
  useEffect(() => {
    supabase.from('chamber_templates').select('id,template_key,name,type,region_label').eq('enabled', true)
      .then(({ data }) => setChambers(data || []))
  }, [])

  // Phase 37: 加载职业 + 装备阶级（按 series.slot 分组）供 NPC 镜像玩家槽位
  const [classes, setClasses] = useState([])
  const [tiersBySlot, setTiersBySlot] = useState({ probe: [], shield: [], weapon: [], comm: [] })
  useEffect(() => {
    supabase.from('classes').select('id,name,rarity').eq('enabled', true).order('id')
      .then(({ data }) => setClasses(data || []))
    supabase.from('equipment_tiers').select('id,name,rarity,tier,series:equipment_series(slot,name)').order('tier')
      .then(({ data }) => {
        const g = { probe: [], shield: [], weapon: [], comm: [] }
        for (const t of (data || [])) { const sl = t.series?.slot; if (g[sl]) g[sl].push(t) }
        setTiersBySlot(g)
      })
  }, [])
  const [filter, setFilter]   = useState('all')
  const [search, setSearch]   = useState('')
  const [modal, setModal]     = useState(false)
  const [editNpc, setEditNpc] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  const filtered = npcs.filter(n =>
    (filter === 'all' || n.level === filter) && (!search || n.name.includes(search))
  )

  function openAdd() {
    setEditNpc({
      name: '', hp: 50, atk: 10, def: 5, exp: 20, level: 'easy', chamber_template_ids: [],
      entity_type: 'remnant', hostile: true, tradeable: false,
      trade_wants: null, trade_offers: null,
      pollution_on_kill: 4, spawn_weight: 1.0, min_pollution: 0,
      // Phase 16: 单次袭击战斗参数
      accuracy: 0.85, counter_rate: 0.30,
      // Phase 37: 镜像玩家槽位（统一战斗引擎）
      class_id: null, loadout_tiers: { ...EMPTY_LOADOUT }, item_slots: [],
    })
    setModal(true)
  }
  function openEdit(n) {
    setEditNpc({
      ...n,
      chamber_template_ids: n.chamber_template_ids || [],
      entity_type: n.entity_type || 'remnant',
      hostile: n.hostile ?? true,
      tradeable: n.tradeable ?? false,
      trade_wants: n.trade_wants ?? null,
      trade_offers: n.trade_offers ?? null,
      pollution_on_kill: n.pollution_on_kill ?? 4,
      spawn_weight: n.spawn_weight ?? 1.0,
      min_pollution: n.min_pollution ?? 0,
      accuracy: n.accuracy ?? 0.85,
      counter_rate: n.counter_rate ?? 0.30,
      // Phase 37: 镜像玩家槽位
      class_id: n.class_id ?? null,
      loadout_tiers: (n.loadout_tiers && typeof n.loadout_tiers === 'object')
        ? { ...EMPTY_LOADOUT, ...n.loadout_tiers }
        : { ...EMPTY_LOADOUT },
      item_slots: Array.isArray(n.item_slots) ? n.item_slots : [],
    })
    setModal(true)
  }

  async function save() {
    if (!editNpc.name.trim()) { toast('请填写实体名称', 'error'); return }
    const payload = { ...editNpc }; delete payload.created_at
    // Phase 37: 规整镜像槽位 — class_id 空存 null（bigint FK），loadout 仅保 4 槽，item_slots 去空行
    payload.class_id = payload.class_id || null
    payload.loadout_tiers = LOADOUT_SLOTS.reduce((acc, s) => {
      acc[s.key] = payload.loadout_tiers?.[s.key] || null
      return acc
    }, {})
    payload.item_slots = (Array.isArray(payload.item_slots) ? payload.item_slots : [])
      .map(r => ({ item: (r.item || '').trim(), qty: Math.max(1, Number(r.qty) || 1) }))
      .filter(r => r.item)
    if (editNpc.id) {
      const id = payload.id; delete payload.id
      const { error } = await supabase.from('npc_pool').update(payload).eq('id', id)
      if (error) { toast('更新失败', 'error'); return }
      toast('实体已更新')
    } else {
      delete payload.id
      const { error } = await supabase.from('npc_pool').insert(payload)
      if (error) { toast('添加失败', 'error'); return }
      toast('实体已添加')
    }
    setModal(false); setEditNpc(null); onRefresh('npcs')
  }
  async function del(id) {
    const { error } = await supabase.from('npc_pool').delete().eq('id', id)
    if (error) { toast('删除失败', 'error'); return }
    toast('实体已删除'); setConfirmDel(null); onRefresh('npcs')
  }
  function toggleMap(arr, id) { return arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id] }

  return (
    <div>
      {/* ── 顶部筛选栏 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input style={{ ...INPUT, width: 190 }} placeholder="🔍 搜索实体..." value={search} onChange={e => setSearch(e.target.value)} />
          <div style={{ display: 'flex', gap: 4 }}>
            {['all', ...Object.keys(NPC_LEVEL_META)].map(k => (
              <button key={k} onClick={() => setFilter(k)} style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: `1px solid ${filter === k ? '#58a6ff' : '#30363d'}`, background: filter === k ? 'rgba(88,166,255,0.12)' : 'transparent', color: filter === k ? '#58a6ff' : '#8b949e' }}>
                {k === 'all' ? '全部' : NPC_LEVEL_META[k].label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={openAdd} style={BTN('#58a6ff', '#fff')}>+ 新增实体</button>
      </div>

      {/* ── 卡片列表 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {filtered.map(npc => {
          const lv = NPC_LEVEL_META[npc.level] || NPC_LEVEL_META.easy
          const isConf = confirmDel === npc.id
          return (
            <div key={npc.id} style={{ background: '#1c2129', borderRadius: 12, padding: 18, border: `1px solid ${isConf ? '#f85149' : '#30363d'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                    {ENTITY_TYPE_META[npc.entity_type]?.icon || '🤖'} {npc.name}
                    <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 7px', borderRadius: 8, background: `${lv.color}15`, color: lv.color, border: `1px solid ${lv.color}30` }}>{lv.label}</span>
                    {npc.entity_type && (() => {
                      const em = ENTITY_TYPE_META[npc.entity_type]
                      return em ? <span style={{ marginLeft: 4, fontSize: 10, padding: '1px 7px', borderRadius: 8, background: `${em.color}15`, color: em.color, border: `1px solid ${em.color}30` }}>{em.label}</span> : null
                    })()}
                    {!npc.hostile && <span style={{ marginLeft: 4, fontSize: 10, padding: '1px 7px', borderRadius: 8, background: 'rgba(63,185,80,0.15)', color: '#3fb950', border: '1px solid rgba(63,185,80,0.3)' }}>非敌对</span>}
                    {npc.tradeable && <span style={{ marginLeft: 4, fontSize: 10, padding: '1px 7px', borderRadius: 8, background: 'rgba(210,153,34,0.15)', color: '#d29922', border: '1px solid rgba(210,153,34,0.3)' }}>可交易</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                    <span style={{ color: '#3fb950' }}>HP {npc.hp}</span>
                    <span style={{ color: '#f85149' }}>ATK {npc.atk}</span>
                    <span style={{ color: '#58a6ff' }}>DEF {npc.def}</span>
                    <span style={{ color: '#d29922' }}>EXP {npc.exp}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => openEdit(npc)} style={BTN('transparent', '#58a6ff', { padding: '4px 10px', border: '1px solid rgba(88,166,255,0.3)' })}>编辑</button>
                  {isConf
                    ? <><button onClick={() => del(npc.id)} style={BTN('rgba(248,81,73,0.15)', '#f85149', { padding: '4px 10px', border: '1px solid rgba(248,81,73,0.3)' })}>确认</button>
                       <button onClick={() => setConfirmDel(null)} style={BTN('transparent', '#8b949e', { padding: '4px 10px', border: '1px solid #30363d' })}>取消</button></>
                    : <button onClick={() => setConfirmDel(npc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#484f58', fontSize: 15 }}>🗑️</button>}
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(npc.chamber_template_ids || []).slice(0, 4).map(cid => <span key={cid} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(88,166,255,0.1)', color: '#58a6ff' }}>{chambers.find(x => x.id === cid)?.name || `#${cid}`}</span>)}
                {(npc.chamber_template_ids || []).length > 4 && <span style={{ fontSize: 10, color: '#8b949e' }}>+{npc.chamber_template_ids.length - 4}</span>}
                {!(npc.chamber_template_ids?.length) && <span style={{ fontSize: 10, color: '#484f58' }}>未分配 chamber</span>}
              </div>
            </div>
          )
        })}
      </div>
      {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 56, color: '#8b949e' }}>暂无实体</div>}

      {/* ── 编辑 / 新增弹窗 ── */}
      <Modal open={modal} onClose={() => { setModal(false); setEditNpc(null) }} title={editNpc?.id ? `编辑实体：${editNpc?.name}` : '添加实体'}>
        {editNpc && (
          <div>
            {/* ── 第一组：基础信息 ── */}
            <div style={{ ...SECTION_TITLE, marginTop: 0 }}>📋 基础信息</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={LABEL}>名称</label>
                <input style={INPUT} value={editNpc.name} onChange={e => setEditNpc({ ...editNpc, name: e.target.value })} />
                <div style={HINT}>实体的显示名称，玩家在游戏中会看到</div>
              </div>
              <div>
                <label style={LABEL}>难度</label>
                <select style={INPUT} value={editNpc.level} onChange={e => setEditNpc({ ...editNpc, level: e.target.value })}>
                  {Object.entries(NPC_LEVEL_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <div style={HINT}>影响实体掉落奖励和 AI 行为模式</div>
              </div>
            </div>

            {/* ── 第二组：战斗属性 ── */}
            <div style={SECTION_TITLE}>⚔️ 战斗属性</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={LABEL}>HP 生命值</label>
                <input type="number" style={INPUT} value={editNpc.hp} onChange={e => setEditNpc({ ...editNpc, hp: Number(e.target.value) })} />
                <div style={HINT}>实体的最大生命值，被击杀时归零</div>
              </div>
              <div>
                <label style={LABEL}>ATK 攻击</label>
                <input type="number" style={INPUT} value={editNpc.atk} onChange={e => setEditNpc({ ...editNpc, atk: Number(e.target.value) })} />
                <div style={HINT}>基础攻击力，影响对玩家的伤害计算</div>
              </div>
              <div>
                <label style={LABEL}>DEF 防御</label>
                <input type="number" style={INPUT} value={editNpc.def} onChange={e => setEditNpc({ ...editNpc, def: Number(e.target.value) })} />
                <div style={HINT}>基础防御力，降低玩家对实体的伤害</div>
              </div>
              <div>
                <label style={LABEL}>EXP 经验</label>
                <input type="number" style={INPUT} value={editNpc.exp} onChange={e => setEditNpc({ ...editNpc, exp: Number(e.target.value) })} />
                <div style={HINT}>击杀后玩家获得的经验值</div>
              </div>
            </div>

            {/* ── 第二·五组：职业 + 装备 + 物品槽（Phase 37 统一战斗，镜像玩家）── */}
            <div style={SECTION_TITLE}>🧬 职业与装备（统一战斗）</div>
            <div style={HINT}>NPC 镜像玩家结构：职业加成 + 已装备阶级 + 物品槽。物品槽同时作为击杀掉落表。留空则与基础 HP/ATK/DEF 数值等价（平衡中性）。</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={LABEL}>职业（class_id）</label>
                <select style={INPUT} value={editNpc.class_id ?? ''}
                  onChange={e => setEditNpc({ ...editNpc, class_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">无职业</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.rarity ? `（${RARITY_META[c.rarity]?.label ?? c.rarity}）` : ''}
                    </option>
                  ))}
                </select>
                <div style={HINT}>非空时解析职业 base_*_bonus（加法）与 perks（乘区）；镜像玩家职业</div>
              </div>
              {LOADOUT_SLOTS.map(slot => (
                <div key={slot.key}>
                  <label style={LABEL}>{slot.icon} {slot.label}槽</label>
                  <select style={INPUT} value={editNpc.loadout_tiers?.[slot.key] ?? ''}
                    onChange={e => setEditNpc({
                      ...editNpc,
                      loadout_tiers: { ...editNpc.loadout_tiers, [slot.key]: e.target.value ? Number(e.target.value) : null },
                    })}>
                    <option value="">未装备</option>
                    {(tiersBySlot[slot.key] || []).map(t => (
                      <option key={t.id} value={t.id}>
                        [{RARITY_META[t.rarity]?.label ?? t.rarity}] {t.name}{Number.isFinite(t.tier) ? ` ·T${t.tier}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {/* item_slots repeater（镜像玩家 inventory，兼掉落表） */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 6 }}>
              <label style={{ ...LABEL, margin: 0 }}>物品槽 item_slots（{(editNpc.item_slots || []).length} 项）</label>
              <button
                onClick={() => setEditNpc({ ...editNpc, item_slots: [...(editNpc.item_slots || []), { item: '', qty: 1 }] })}
                style={{ background: 'none', border: 'none', color: '#58a6ff', fontSize: 12, cursor: 'pointer' }}>
                + 添加物品槽
              </button>
            </div>
            <div style={HINT}>每行：物品/装备名称 + 数量。击杀该 NPC 时按此（含上方已装备阶级）生成尸体掉落。</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {(editNpc.item_slots || []).length === 0 && (
                <div style={{ fontSize: 11, color: '#484f58' }}>无物品槽（死亡仅掉落已装备阶级，若有）</div>
              )}
              {(editNpc.item_slots || []).map((row, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input style={{ ...INPUT, flex: 1 }} placeholder="物品/装备名称" value={row.item || ''}
                    onChange={e => {
                      const next = [...editNpc.item_slots]
                      next[i] = { ...next[i], item: e.target.value }
                      setEditNpc({ ...editNpc, item_slots: next })
                    }} />
                  <input type="number" min={1} style={{ ...INPUT, width: 90 }} value={row.qty ?? 1}
                    onChange={e => {
                      const next = [...editNpc.item_slots]
                      next[i] = { ...next[i], qty: Math.max(1, Number(e.target.value) || 1) }
                      setEditNpc({ ...editNpc, item_slots: next })
                    }} />
                  <button
                    onClick={() => setEditNpc({ ...editNpc, item_slots: editNpc.item_slots.filter((_, j) => j !== i) })}
                    style={{ background: 'none', border: '1px solid #30363d', borderRadius: 7, color: '#f85149', fontSize: 13, cursor: 'pointer', padding: '8px 12px' }}>
                    删除
                  </button>
                </div>
              ))}
            </div>

             {/* ── 第三组：远星实体属性 ── */}
            <div style={SECTION_TITLE}>🌌 远星属性</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={LABEL}>实体类型</label>
                <select style={INPUT} value={editNpc.entity_type || 'remnant'} onChange={e => setEditNpc({ ...editNpc, entity_type: e.target.value })}>
                  {Object.entries(ENTITY_TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
                <div style={HINT}>残响/伪装入侵者/共生/观察 4 类</div>
              </div>
              <div>
                <label style={LABEL}>是否敌对</label>
                <select style={INPUT} value={editNpc.hostile ? '1' : '0'} onChange={e => setEditNpc({ ...editNpc, hostile: e.target.value === '1' })}>
                  <option value="1">是（主动攻击）</option>
                  <option value="0">否（不主动攻击）</option>
                </select>
              </div>
              <div>
                <label style={LABEL}>是否可交易</label>
                <select style={INPUT} value={editNpc.tradeable ? '1' : '0'} onChange={e => setEditNpc({ ...editNpc, tradeable: e.target.value === '1' })}>
                  <option value="0">否</option>
                  <option value="1">是（可与玩家交换物品）</option>
                </select>
              </div>
              <div>
                <label style={LABEL}>击杀污染加成</label>
                <input type="number" min={0} style={INPUT} value={editNpc.pollution_on_kill ?? 4} onChange={e => setEditNpc({ ...editNpc, pollution_on_kill: Math.max(0, Number(e.target.value) || 0) })} />
                <div style={HINT}>玩家击杀后个人污染额外增加</div>
              </div>
              <div>
                <label style={LABEL}>刷新权重</label>
                <input type="number" step="0.1" min={0} style={INPUT} value={editNpc.spawn_weight ?? 1.0} onChange={e => setEditNpc({ ...editNpc, spawn_weight: Math.max(0, Number(e.target.value) || 0) })} />
                <div style={HINT}>事件 spawn_npc 加权抽取的权重</div>
              </div>
              <div>
                <label style={LABEL}>最低环境污染要求</label>
                <input type="number" min={0} max={100} style={INPUT} value={editNpc.min_pollution ?? 0} onChange={e => setEditNpc({ ...editNpc, min_pollution: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
                <div style={HINT}>环境污染未达此值时不会被抽中</div>
              </div>
              <div>
                <label style={LABEL}>反击命中率（accuracy）</label>
                <input type="number" step="0.05" min={0} max={1} style={INPUT} value={editNpc.accuracy ?? 0.85} onChange={e => setEditNpc({ ...editNpc, accuracy: Math.max(0, Math.min(1, Number(e.target.value) || 0)) })} />
                <div style={HINT}>Phase 16：NPC 反击时的命中概率（0-1）</div>
              </div>
              <div>
                <label style={LABEL}>反击触发率（counter_rate）</label>
                <input type="number" step="0.05" min={0} max={1} style={INPUT} value={editNpc.counter_rate ?? 0.3} onChange={e => setEditNpc({ ...editNpc, counter_rate: Math.max(0, Math.min(1, Number(e.target.value) || 0)) })} />
                <div style={HINT}>Phase 16：玩家袭击后该 NPC 触发反击的概率（0-1，独立于玩家是否命中）</div>
              </div>
              {editNpc.tradeable && (
                <>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={LABEL}>交易需求 trade_wants（JSON：{`{"item":"环段部件","qty":1}`}）</label>
                    <input style={INPUT}
                      value={editNpc.trade_wants ? JSON.stringify(editNpc.trade_wants) : ''}
                      onChange={e => {
                        const v = e.target.value.trim()
                        if (!v) { setEditNpc({ ...editNpc, trade_wants: null }); return }
                        try {
                          const parsed = JSON.parse(v)
                          if (parsed && parsed.item && parsed.qty) setEditNpc({ ...editNpc, trade_wants: parsed })
                        } catch { /* 等待合法 JSON */ }
                      }}
                      placeholder='{"item":"环段部件","qty":1}' />
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={LABEL}>交易提供 trade_offers（JSON）</label>
                    <input style={INPUT}
                      value={editNpc.trade_offers ? JSON.stringify(editNpc.trade_offers) : ''}
                      onChange={e => {
                        const v = e.target.value.trim()
                        if (!v) { setEditNpc({ ...editNpc, trade_offers: null }); return }
                        try {
                          const parsed = JSON.parse(v)
                          if (parsed && parsed.item && parsed.qty) setEditNpc({ ...editNpc, trade_offers: parsed })
                        } catch { /* */ }
                      }}
                      placeholder='{"item":"Ω物质","qty":1}' />
                  </div>
                </>
              )}
            </div>

            {/* ── 第四组：地图分配 ── */}
            <div style={SECTION_TITLE}>🌀 chamber 分配（Phase 19.10）</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ ...LABEL, margin: 0 }}>出没 chamber（{(editNpc.chamber_template_ids || []).length} / {chambers.length} 已选）</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setEditNpc({ ...editNpc, chamber_template_ids: chambers.map(c => c.id) })} style={{ background: 'none', border: 'none', color: '#58a6ff', fontSize: 12, cursor: 'pointer' }}>全选</button>
                <button onClick={() => setEditNpc({ ...editNpc, chamber_template_ids: [] })} style={{ background: 'none', border: 'none', color: '#8b949e', fontSize: 12, cursor: 'pointer' }}>清空</button>
              </div>
            </div>
            <div style={HINT}>选择该实体可以在哪些 chamber 中出现；未选择则不会被刷新</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 200, overflowY: 'auto', marginTop: 8 }}>
              {chambers.map(c => {
                const sel = (editNpc.chamber_template_ids || []).includes(c.id)
                return (
                  <button key={c.id} onClick={() => setEditNpc({ ...editNpc, chamber_template_ids: toggleMap(editNpc.chamber_template_ids || [], c.id) })}
                    style={{ padding: '4px 10px', borderRadius: 16, fontSize: 10, cursor: 'pointer', border: `1px solid ${sel ? '#58a6ff' : '#30363d'}`, background: sel ? 'rgba(88,166,255,0.12)' : 'transparent', color: sel ? '#58a6ff' : '#8b949e' }}>
                    {c.name}
                  </button>
                )
              })}
            </div>

            {/* ── 操作按钮 ── */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button onClick={() => { setModal(false); setEditNpc(null) }} style={{ ...BTN('transparent', '#8b949e'), border: '1px solid #30363d' }}>取消</button>
              <button onClick={save} style={BTN('#58a6ff', '#fff')}>{editNpc.id ? '保存修改' : '添加实体'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
