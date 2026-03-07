'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { BTN } from '../_shared/ui'
import RuleRow from './RulesRuleRow'
import RulesBuffModal, { BUFF_TYPE_META } from './RulesBuffModal'

const CATEGORY_META = {
  combat:  { label: '⚔️ 战斗公式',  color: '#f85149' },
  items:   { label: '🎒 道具公式',  color: '#d29922' },
  search:  { label: '🔍 搜索概率',  color: '#58a6ff' },
  player:  { label: '👤 玩家属性',  color: '#3fb950' },
  weather: { label: '🌦️ 天气效果', color: '#bc8cff' },
  general: { label: '⚙️ 通用',      color: '#8b949e' },
}

export default function RulesTab({ toast }) {
  const [rules, setRules]       = useState([])
  const [buffs, setBuffs]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [section, setSection]   = useState('rules')
  const [activeCategory, setActiveCategory]   = useState('combat')
  const [buffModal, setBuffModal]             = useState(false)
  const [editBuff, setEditBuff]               = useState(null)
  const [confirmDeleteBuff, setConfirmDeleteBuff] = useState(null)

  async function loadAll() {
    setLoading(true)
    const [{ data: r }, { data: b }] = await Promise.all([
      supabase.from('game_rules').select('*').order('category').order('id'),
      supabase.from('buff_pool').select('*').order('is_debuff', { ascending: false }).order('id'),
    ])
    setRules(r || []); setBuffs(b || []); setLoading(false)
  }
  useEffect(() => { loadAll() }, [])

  function updateRuleLocal(id, val) { setRules(prev => prev.map(r => r.id === id ? { ...r, value: val } : r)) }

  async function deleteBuffConfirm(id) {
    await supabase.from('buff_pool').delete().eq('id', id)
    toast('Buff 已删除'); setConfirmDeleteBuff(null); loadAll()
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#8b949e' }}><div style={{ fontSize: 28, marginBottom: 8 }}>⚙️</div>加载规则配置中...</div>

  const categories    = [...new Set(rules.map(r => r.category))]
  const filteredRules = rules.filter(r => r.category === activeCategory)

  return (
    <div>
      {/* 子导航 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[{ k: 'rules', label: '📋 全局规则' }, { k: 'buffs', label: '✨ Buff 池', count: buffs.length }].map(s => (
          <button key={s.k} onClick={() => setSection(s.k)} style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${section === s.k ? '#58a6ff' : '#30363d'}`, background: section === s.k ? 'rgba(88,166,255,0.12)' : 'transparent', color: section === s.k ? '#58a6ff' : '#8b949e', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {s.label}{s.count !== undefined && <span style={{ marginLeft: 4, fontSize: 11, opacity: 0.65 }}>({s.count})</span>}
          </button>
        ))}
      </div>

      {/* 规则编辑 */}
      {section === 'rules' && (
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16 }}>
          <div>
            <div style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', overflow: 'hidden' }}>
              {categories.map(cat => {
                const meta  = CATEGORY_META[cat] || CATEGORY_META.general
                const count = rules.filter(r => r.category === cat).length
                return (
                  <button key={cat} onClick={() => setActiveCategory(cat)} style={{ width: '100%', padding: '12px 16px', border: 'none', textAlign: 'left', background: activeCategory === cat ? `${meta.color}12` : 'transparent', borderLeft: `3px solid ${activeCategory === cat ? meta.color : 'transparent'}`, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.15s' }}>
                    <span style={{ fontSize: 13, fontWeight: activeCategory === cat ? 600 : 400, color: activeCategory === cat ? meta.color : '#8b949e' }}>{meta.label}</span>
                    <span style={{ fontSize: 10, color: '#484f58', fontFamily: 'monospace' }}>{count}</span>
                  </button>
                )
              })}
            </div>
            <div style={{ marginTop: 12, padding: 14, borderRadius: 10, background: 'rgba(88,166,255,0.06)', border: '1px solid rgba(88,166,255,0.15)' }}>
              <div style={{ fontSize: 11, color: '#58a6ff', fontWeight: 600, marginBottom: 6 }}>💡 使用说明</div>
              <div style={{ fontSize: 11, color: '#8b949e', lineHeight: 1.7 }}>规则修改后<strong style={{ color: '#d29922' }}>仅对新创建的房间生效</strong>。公式支持四则运算与 Math 函数。</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>{CATEGORY_META[activeCategory]?.label}</span>
              <span style={{ fontSize: 11, color: '#484f58' }}>{filteredRules.length} 条规则</span>
            </div>
            {filteredRules.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#484f58', fontSize: 13 }}>此分类暂无规则。请先在 Supabase 中执行初始化 SQL。</div>}
            {filteredRules.map(rule => <RuleRow key={rule.id} rule={rule} onSave={updateRuleLocal} toast={toast} />)}
          </div>
        </div>
      )}

      {/* Buff 池 */}
      {section === 'buffs' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: '#8b949e' }}>管理游戏内的 Buff / Debuff 效果，道具可触发这些效果</div>
            <button onClick={() => { setEditBuff(null); setBuffModal(true) }} style={BTN('#58a6ff', '#fff')}>+ 添加 Buff</button>
          </div>
          {[{ label: 'Debuff — 负面效果', isDebuff: true, color: '#f85149' }, { label: 'Buff — 正面效果', isDebuff: false, color: '#3fb950' }].map(group => {
            const grouped = buffs.filter(b => b.is_debuff === group.isDebuff)
            if (grouped.length === 0) return null
            return (
              <div key={String(group.isDebuff)} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: group.color, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{group.label}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
                  {grouped.map(buff => {
                    const isConf   = confirmDeleteBuff === buff.id
                    const typeMeta = BUFF_TYPE_META[buff.type] || BUFF_TYPE_META.special
                    return (
                      <div key={buff.id} style={{ background: '#1c2129', borderRadius: 12, padding: 16, border: `1px solid ${isConf ? '#f85149' : '#30363d'}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 26 }}>{buff.icon}</span>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 14 }}>{buff.name}</div>
                              <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                                <span style={{ fontSize: 10, color: typeMeta.color, background: `${typeMeta.color}15`, padding: '1px 7px', borderRadius: 8 }}>{typeMeta.label}</span>
                                <span style={{ fontSize: 10, color: '#8b949e', background: 'rgba(139,148,158,0.1)', padding: '1px 7px', borderRadius: 8 }}>{buff.target.toUpperCase()}</span>
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
                            <button onClick={() => { setEditBuff(buff); setBuffModal(true) }} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(88,166,255,0.2)', background: 'rgba(88,166,255,0.08)', color: '#58a6ff', fontSize: 12, cursor: 'pointer' }}>编辑</button>
                            {isConf
                              ? <><button onClick={() => deleteBuffConfirm(buff.id)} style={BTN('rgba(248,81,73,0.15)', '#f85149', { padding: '4px 10px', fontSize: 11, border: '1px solid rgba(248,81,73,0.3)' })}>确认</button>
                                 <button onClick={() => setConfirmDeleteBuff(null)} style={BTN('transparent', '#8b949e', { padding: '4px 10px', fontSize: 11, border: '1px solid #30363d' })}>取消</button></>
                              : <button onClick={() => setConfirmDeleteBuff(buff.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#484f58', fontSize: 15 }}>🗑️</button>}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: '#8b949e', display: 'flex', gap: 12 }}>
                          <span>⏱ {buff.duration} 回合</span>
                          <span>叠加 ×{buff.max_stack}</span>
                          <span style={{ color: '#484f58', fontFamily: 'monospace' }}>{buff.effect_formula}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {buffs.length === 0 && <div style={{ textAlign: 'center', padding: 56, color: '#8b949e' }}>暂无 Buff，点击上方按钮添加</div>}
        </div>
      )}

      <RulesBuffModal open={buffModal} onClose={() => { setBuffModal(false); setEditBuff(null) }} editBuff={editBuff} onSave={loadAll} toast={toast} />
    </div>
  )
}
