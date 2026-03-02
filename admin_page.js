'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../layout'
import { isAdmin } from '@/lib/auth'
import { MAP_LIST, WEATHER_OPTIONS, ITEM_KIND_META, NPC_LEVEL_META, GAME_TYPES } from '@/lib/constants'
import { evalFormula } from '@/lib/gameEngine'

const WEAPON_SUB_KINDS = {
  slashing: '斩击', striking: '打击', throwing: '投掷',
  shooting: '射击', explosive: '爆炸', spirit: '灵力',
}
const ROOM_STATE = {
  0: { label: '等待中', color: '#d29922' },
  1: { label: '进行中', color: '#3fb950' },
  2: { label: '已结束', color: '#8b949e' },
}

/* ─── Toast ─── */
function useToast() {
  const [toasts, setToasts] = useState([])
  const show = useCallback((msg, type = 'success') => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2500)
  }, [])
  const Container = () => (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} className="toast-in" style={{
          padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 500,
          background: t.type === 'error' ? 'rgba(248,81,73,0.15)' : 'rgba(63,185,80,0.15)',
          color: t.type === 'error' ? '#f85149' : '#3fb950',
          border: `1px solid ${t.type === 'error' ? 'rgba(248,81,73,0.3)' : 'rgba(63,185,80,0.3)'}`,
        }}>{t.msg}</div>
      ))}
    </div>
  )
  return { show, Container }
}

/* ─── Modal ─── */
function Modal({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <div className="animate-in" style={{
        position: 'relative', width: 620, maxWidth: '92vw', maxHeight: '88vh', overflowY: 'auto',
        background: '#1c2129', borderRadius: 16, border: '1px solid #30363d', padding: 28,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, color = '#58a6ff', icon }) {
  return (
    <div style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: '18px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
          <div style={{ fontSize: 30, fontWeight: 700, color, fontFamily: "'JetBrains Mono'" }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: '#8b949e', marginTop: 6 }}>{sub}</div>}
        </div>
        {icon && <span style={{ fontSize: 28, opacity: 0.3 }}>{icon}</span>}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ textAlign: 'center', padding: 80, color: '#8b949e' }}>
      <style>{`@keyframes _spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ display: 'inline-block', width: 36, height: 36, border: '3px solid #30363d', borderTopColor: '#58a6ff', borderRadius: '50%', animation: '_spin 0.8s linear infinite' }} />
      <div style={{ marginTop: 12, fontSize: 13 }}>加载中...</div>
    </div>
  )
}

const INPUT = {
  width: '100%', padding: '10px 14px', borderRadius: 8,
  border: '1px solid #30363d', background: '#161b22', color: '#e6edf3',
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
}
const LABEL = { display: 'block', fontSize: 11, color: '#8b949e', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }
const BTN = (bg, color, extra) => ({
  padding: '10px 20px', borderRadius: 8, border: 'none', background: bg,
  color, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, ...extra,
})

/* ══════════════════════════════════════════
   ⚙️ 战斗规则 Tab 内部组件
══════════════════════════════════════════ */

const CATEGORY_META = {
  combat:  { label: '⚔️ 战斗公式',  color: '#f85149' },
  items:   { label: '🎒 道具公式',  color: '#d29922' },
  search:  { label: '🔍 搜索概率',  color: '#58a6ff' },
  player:  { label: '👤 玩家属性',  color: '#3fb950' },
  weather: { label: '🌦️ 天气效果', color: '#bc8cff' },
  general: { label: '⚙️ 通用',      color: '#8b949e' },
}

const BUFF_TYPE_META = {
  dot:     { label: '持续伤害/回复', color: '#f85149' },
  stat:    { label: '属性修改',       color: '#d29922' },
  shield:  { label: '护盾',            color: '#58a6ff' },
  special: { label: '特殊效果',        color: '#bc8cff' },
}

function FormulaPreview({ formula }) {
  const testVars = {
    atk: 15, def: 8, hp: 60, maxHp: 100,
    targetDef: 8, targetHp: 80, targetMaxHp: 100, targetAtk: 12,
    atkMultiplier: 1.0, defMultiplier: 0.5,
    heal: 30, effect: 5, playerAtk: 10, playerDef: 5, value: 5,
  }
  if (!formula || !formula.trim()) return null
  let result = null
  let isError = false
  try { result = evalFormula(formula, testVars) } catch { isError = true }
  if (result === null || isError) isError = true

  return (
    <div style={{
      marginTop: 6, padding: '8px 12px', borderRadius: 6,
      background: isError ? 'rgba(248,81,73,0.08)' : 'rgba(63,185,80,0.08)',
      border: `1px solid ${isError ? 'rgba(248,81,73,0.2)' : 'rgba(63,185,80,0.2)'}`,
      fontSize: 12,
    }}>
      <span style={{ color: '#8b949e' }}>预览（atk=15, def=8, heal=30）：</span>
      {isError
        ? <span style={{ color: '#f85149', marginLeft: 8 }}>⚠ 公式有误</span>
        : <span style={{ color: '#3fb950', fontFamily: "'JetBrains Mono'", marginLeft: 8, fontWeight: 700 }}>= {result}</span>
      }
    </div>
  )
}

function RuleRow({ rule, onSave, toast }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(rule.value)
  const [saving, setSaving] = useState(false)
  const isFormula = rule.input_type === 'formula'

  async function save() {
    setSaving(true)
    const { error } = await supabase.from('game_rules').update({ value: val }).eq('id', rule.id)
    setSaving(false)
    if (error) { toast('保存失败', 'error'); return }
    toast(`「${rule.label}」已更新`)
    onSave(rule.id, val)
    setEditing(false)
  }

  return (
    <div style={{
      background: editing ? '#222830' : '#1c2129',
      borderRadius: 10, border: `1px solid ${editing ? '#58a6ff40' : '#30363d'}`,
      padding: '14px 18px', transition: 'all 0.2s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{rule.label}</span>
            <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: '#484f58', background: '#0e1117', padding: '1px 7px', borderRadius: 4 }}>{rule.key}</span>
          </div>
          {rule.description && (
            <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 8, lineHeight: 1.6 }}>{rule.description}</div>
          )}

          {editing ? (
            <div>
              {isFormula ? (
                <>
                  <textarea value={val} onChange={e => setVal(e.target.value)} rows={2}
                    style={{ ...INPUT, fontFamily: "'JetBrains Mono'", fontSize: 12, resize: 'vertical', lineHeight: 1.6 }} />
                  <FormulaPreview formula={val} />
                </>
              ) : (
                <input type="number" value={val} onChange={e => setVal(e.target.value)}
                  min={rule.min_val ?? undefined} max={rule.max_val ?? undefined}
                  step={Number(val) < 2 ? 0.01 : 1}
                  style={{ ...INPUT, maxWidth: 200 }} />
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={save} disabled={saving} style={BTN('#58a6ff', '#fff', { padding: '7px 14px', fontSize: 12 })}>
                  {saving ? '保存中...' : '✓ 保存'}
                </button>
                <button onClick={() => { setVal(rule.value); setEditing(false) }}
                  style={BTN('transparent', '#8b949e', { padding: '7px 14px', fontSize: 12, border: '1px solid #30363d' })}>取消</button>
              </div>
            </div>
          ) : (
            <div style={{
              display: 'inline-block',
              fontFamily: isFormula ? "'JetBrains Mono'" : 'inherit',
              fontSize: isFormula ? 12 : 14, fontWeight: isFormula ? 400 : 700,
              color: isFormula ? '#bc8cff' : '#58a6ff',
              background: isFormula ? 'rgba(188,140,255,0.08)' : 'rgba(88,166,255,0.08)',
              border: `1px solid ${isFormula ? 'rgba(188,140,255,0.2)' : 'rgba(88,166,255,0.15)'}`,
              padding: isFormula ? '4px 10px' : '3px 12px', borderRadius: 6,
            }}>{rule.value}</div>
          )}
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} style={{
            flexShrink: 0, padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
            background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.2)', color: '#58a6ff',
          }}>编辑</button>
        )}
      </div>
    </div>
  )
}

const EMPTY_BUFF = {
  name: '', icon: '⚡', description: '', type: 'dot',
  target: 'hp', effect_formula: '-value', value: 5,
  duration: 3, max_stack: 1, is_debuff: true,
}

function BuffModal({ open, onClose, editBuff, onSave, toast }) {
  const [form, setForm] = useState(EMPTY_BUFF)
  useEffect(() => { setForm(editBuff ? { ...editBuff } : EMPTY_BUFF) }, [editBuff, open])

  async function save() {
    if (!form.name.trim()) { toast('请填写 Buff 名称', 'error'); return }
    const payload = { ...form }
    if (form.id) {
      const id = payload.id; delete payload.id; delete payload.created_at
      await supabase.from('buff_pool').update(payload).eq('id', id)
    } else {
      delete payload.id; delete payload.created_at
      await supabase.from('buff_pool').insert(payload)
    }
    toast(form.id ? 'Buff 已更新' : 'Buff 已添加')
    onSave(); onClose()
  }

  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'relative', width: 560, maxWidth: '92vw', maxHeight: '88vh', overflowY: 'auto',
        background: '#1c2129', borderRadius: 16, border: '1px solid #30363d', padding: 28,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
            {form.id ? `✏️ 编辑：${form.name}` : '➕ 添加 Buff / Debuff'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 20 }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={LABEL}>图标</label>
            <input style={{ ...INPUT, textAlign: 'center', fontSize: 22, padding: '8px' }}
              value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} maxLength={4} />
          </div>
          <div>
            <label style={LABEL}>名称</label>
            <input style={INPUT} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="如：中毒、灼烧、护盾" />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={LABEL}>描述</label>
          <input style={INPUT} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={LABEL}>类型</label>
            <select style={INPUT} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              {Object.entries(BUFF_TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label style={LABEL}>作用目标</label>
            <select style={INPUT} value={form.target} onChange={e => setForm({ ...form, target: e.target.value })}>
              <option value="hp">HP 生命</option>
              <option value="atk">ATK 攻击</option>
              <option value="def">DEF 防御</option>
            </select>
          </div>
          <div>
            <label style={LABEL}>正/负面</label>
            <select style={INPUT} value={String(form.is_debuff)} onChange={e => setForm({ ...form, is_debuff: e.target.value === 'true' })}>
              <option value="true">Debuff（负面）</option>
              <option value="false">Buff（正面）</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={LABEL}>基础值 (value)</label>
            <input type="number" style={INPUT} value={form.value} onChange={e => setForm({ ...form, value: Number(e.target.value) })} />
          </div>
          <div>
            <label style={LABEL}>持续回合</label>
            <input type="number" style={INPUT} value={form.duration} min={1} max={99} onChange={e => setForm({ ...form, duration: Number(e.target.value) })} />
          </div>
          <div>
            <label style={LABEL}>最大叠加</label>
            <input type="number" style={INPUT} value={form.max_stack} min={1} max={10} onChange={e => setForm({ ...form, max_stack: Number(e.target.value) })} />
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={LABEL}>效果公式（每回合执行）</label>
          <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 6 }}>
            可用变量：<span style={{ fontFamily: 'monospace', color: '#bc8cff' }}>value, hp, atk, def, maxHp</span>
            &nbsp;·&nbsp;负数=扣除，正数=增加
          </div>
          <textarea value={form.effect_formula} onChange={e => setForm({ ...form, effect_formula: e.target.value })}
            rows={2} style={{ ...INPUT, fontFamily: "'JetBrains Mono'", fontSize: 12, resize: 'vertical' }} />
          <FormulaPreview formula={form.effect_formula} />
        </div>

        {/* 预览卡片 */}
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 16,
          background: form.is_debuff ? 'rgba(248,81,73,0.06)' : 'rgba(63,185,80,0.06)',
          border: `1px solid ${form.is_debuff ? 'rgba(248,81,73,0.2)' : 'rgba(63,185,80,0.2)'}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 26 }}>{form.icon || '⚡'}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {form.name || '未命名'}
              <span style={{
                marginLeft: 8, fontSize: 10, padding: '1px 8px', borderRadius: 10,
                background: form.is_debuff ? 'rgba(248,81,73,0.15)' : 'rgba(63,185,80,0.15)',
                color: form.is_debuff ? '#f85149' : '#3fb950',
              }}>{form.is_debuff ? 'DEBUFF' : 'BUFF'}</span>
            </div>
            <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
              持续 {form.duration} 回合 · 作用于 {form.target.toUpperCase()} · 最多叠 {form.max_stack} 层
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ ...BTN('transparent', '#8b949e'), border: '1px solid #30363d' }}>取消</button>
          <button onClick={save} style={BTN('#58a6ff', '#fff')}>{form.id ? '保存修改' : '添加 Buff'}</button>
        </div>
      </div>
    </div>
  )
}

function RulesTab({ toast }) {
  const [rules, setRules] = useState([])
  const [buffs, setBuffs] = useState([])
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState('rules')
  const [activeCategory, setActiveCategory] = useState('combat')
  const [buffModal, setBuffModal] = useState(false)
  const [editBuff, setEditBuff] = useState(null)
  const [confirmDeleteBuff, setConfirmDeleteBuff] = useState(null)

  async function loadAll() {
    setLoading(true)
    const [{ data: r }, { data: b }] = await Promise.all([
      supabase.from('game_rules').select('*').order('category').order('id'),
      supabase.from('buff_pool').select('*').order('is_debuff', { ascending: false }).order('id'),
    ])
    setRules(r || [])
    setBuffs(b || [])
    setLoading(false)
  }
  useEffect(() => { loadAll() }, [])

  function updateRuleLocal(id, val) {
    setRules(prev => prev.map(r => r.id === id ? { ...r, value: val } : r))
  }

  async function deleteBuffConfirm(id) {
    await supabase.from('buff_pool').delete().eq('id', id)
    toast('Buff 已删除'); setConfirmDeleteBuff(null); loadAll()
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60, color: '#8b949e' }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>⚙️</div>加载规则配置中...
    </div>
  )

  const categories = [...new Set(rules.map(r => r.category))]
  const filteredRules = rules.filter(r => r.category === activeCategory)

  return (
    <div>
      {/* 子导航 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[{ k: 'rules', label: '📋 全局规则' }, { k: 'buffs', label: '✨ Buff 池', count: buffs.length }].map(s => (
          <button key={s.k} onClick={() => setSection(s.k)} style={{
            padding: '8px 18px', borderRadius: 8,
            border: `1px solid ${section === s.k ? '#58a6ff' : '#30363d'}`,
            background: section === s.k ? 'rgba(88,166,255,0.12)' : 'transparent',
            color: section === s.k ? '#58a6ff' : '#8b949e',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            {s.label}
            {s.count !== undefined && <span style={{ marginLeft: 4, fontSize: 11, opacity: 0.65 }}>({s.count})</span>}
          </button>
        ))}
      </div>

      {/* ─── 规则编辑 ─── */}
      {section === 'rules' && (
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16 }}>
          {/* 侧边分类 */}
          <div>
            <div style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', overflow: 'hidden' }}>
              {categories.map(cat => {
                const meta = CATEGORY_META[cat] || CATEGORY_META.general
                const count = rules.filter(r => r.category === cat).length
                return (
                  <button key={cat} onClick={() => setActiveCategory(cat)} style={{
                    width: '100%', padding: '12px 16px', border: 'none', textAlign: 'left',
                    background: activeCategory === cat ? `${meta.color}12` : 'transparent',
                    borderLeft: `3px solid ${activeCategory === cat ? meta.color : 'transparent'}`,
                    cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    transition: 'all 0.15s',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: activeCategory === cat ? 600 : 400, color: activeCategory === cat ? meta.color : '#8b949e' }}>
                      {meta.label}
                    </span>
                    <span style={{ fontSize: 10, color: '#484f58', fontFamily: 'monospace' }}>{count}</span>
                  </button>
                )
              })}
            </div>
            <div style={{ marginTop: 12, padding: 14, borderRadius: 10, background: 'rgba(88,166,255,0.06)', border: '1px solid rgba(88,166,255,0.15)' }}>
              <div style={{ fontSize: 11, color: '#58a6ff', fontWeight: 600, marginBottom: 6 }}>💡 使用说明</div>
              <div style={{ fontSize: 11, color: '#8b949e', lineHeight: 1.7 }}>
                规则修改后<strong style={{ color: '#d29922' }}>仅对新创建的房间生效</strong>。
                公式支持四则运算与 Math 函数，变量见字段描述。
              </div>
            </div>
          </div>
          {/* 规则列表 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>{CATEGORY_META[activeCategory]?.label}</span>
              <span style={{ fontSize: 11, color: '#484f58' }}>{filteredRules.length} 条规则</span>
            </div>
            {filteredRules.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: '#484f58', fontSize: 13 }}>
                此分类暂无规则。请先在 Supabase 中执行初始化 SQL。
              </div>
            )}
            {filteredRules.map(rule => (
              <RuleRow key={rule.id} rule={rule} onSave={updateRuleLocal} toast={toast} />
            ))}
          </div>
        </div>
      )}

      {/* ─── Buff 池 ─── */}
      {section === 'buffs' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: '#8b949e' }}>管理游戏内的 Buff / Debuff 效果，道具可触发这些效果</div>
            <button onClick={() => { setEditBuff(null); setBuffModal(true) }} style={BTN('#58a6ff', '#fff')}>+ 添加 Buff</button>
          </div>
          {[
            { label: 'Debuff — 负面效果', isDebuff: true, color: '#f85149' },
            { label: 'Buff — 正面效果', isDebuff: false, color: '#3fb950' },
          ].map(group => {
            const grouped = buffs.filter(b => b.is_debuff === group.isDebuff)
            if (grouped.length === 0) return null
            return (
              <div key={String(group.isDebuff)} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: group.color, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {group.label}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
                  {grouped.map(buff => {
                    const isConf = confirmDeleteBuff === buff.id
                    const typeMeta = BUFF_TYPE_META[buff.type] || BUFF_TYPE_META.special
                    return (
                      <div key={buff.id} style={{
                        background: '#1c2129', borderRadius: 12, padding: 16,
                        border: `1px solid ${isConf ? '#f85149' : '#30363d'}`, transition: 'border-color 0.2s',
                      }}>
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
                            <button onClick={() => { setEditBuff(buff); setBuffModal(true) }}
                              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(88,166,255,0.2)', background: 'rgba(88,166,255,0.08)', color: '#58a6ff', fontSize: 12, cursor: 'pointer' }}>编辑</button>
                            {isConf
                              ? <div style={{ display: 'flex', gap: 3 }}>
                                  <button onClick={() => deleteBuffConfirm(buff.id)}
                                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(248,81,73,0.3)', background: 'rgba(248,81,73,0.12)', color: '#f85149', fontSize: 12, cursor: 'pointer' }}>确认</button>
                                  <button onClick={() => setConfirmDeleteBuff(null)}
                                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #30363d', background: 'none', color: '#8b949e', fontSize: 12, cursor: 'pointer' }}>取消</button>
                                </div>
                              : <button onClick={() => setConfirmDeleteBuff(buff.id)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#484f58', fontSize: 16 }}>🗑️</button>
                            }
                          </div>
                        </div>
                        {buff.description && <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 10, lineHeight: 1.5 }}>{buff.description}</div>}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px 10px', fontSize: 11, marginBottom: 10 }}>
                          {[
                            { l: '每回合值', v: buff.value, max: 50, c: group.color },
                            { l: '持续回合', v: buff.duration, max: 10, c: '#d29922' },
                            { l: '叠加上限', v: buff.max_stack, max: 5, c: '#bc8cff' },
                          ].map(s => (
                            <div key={s.l}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#8b949e', marginBottom: 2 }}>
                                <span>{s.l}</span>
                                <span style={{ color: s.c, fontFamily: 'monospace', fontWeight: 600 }}>{s.v}</span>
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: `${s.c}20` }}>
                                <div style={{ height: '100%', borderRadius: 2, background: s.c, width: `${Math.min(100, s.v / s.max * 100)}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{
                          fontFamily: "'JetBrains Mono'", fontSize: 11, color: '#bc8cff',
                          background: 'rgba(188,140,255,0.07)', border: '1px solid rgba(188,140,255,0.15)',
                          padding: '5px 10px', borderRadius: 6,
                        }}>
                          f() = {buff.effect_formula}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {buffs.length === 0 && (
            <div style={{ textAlign: 'center', padding: 56, color: '#8b949e' }}>暂无 Buff，点击上方按钮添加</div>
          )}
        </div>
      )}

      <BuffModal
        open={buffModal} onClose={() => { setBuffModal(false); setEditBuff(null) }}
        editBuff={editBuff} onSave={loadAll} toast={toast}
      />
    </div>
  )
}

/* ══════════════════════════════════════════
   主管理页面（完整版，包含新标签页）
══════════════════════════════════════════ */
export default function AdminPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { show: toast, Container: ToastContainer } = useToast()
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user !== undefined && (!user || !isAdmin(user))) router.replace('/')
  }, [user])

  const [items, setItems] = useState([])
  const [npcs, setNpcs] = useState([])
  const [maps, setMaps] = useState([])
  const [rooms, setRooms] = useState([])

  const [itemModal, setItemModal] = useState(false)
  const [npcModal, setNpcModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [editNpc, setEditNpc] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const [itemFilter, setItemFilter] = useState('all')
  const [itemSearch, setItemSearch] = useState('')
  const [npcFilter, setNpcFilter] = useState('all')
  const [npcSearch, setNpcSearch] = useState('')
  const [mapSearch, setMapSearch] = useState('')
  const [selectedMap, setSelectedMap] = useState(null)
  const [roomFilter, setRoomFilter] = useState('all')

  // Buff 池（用于道具绑定）
  const [buffPool, setBuffPool] = useState([])

  async function loadAll() {
    setLoading(true)
    const [{ data: d1 }, { data: d2 }, { data: d3 }, { data: d4 }, { data: d5 }] = await Promise.all([
      supabase.from('item_pool').select('*').order('kind'),
      supabase.from('npc_pool').select('*').order('level'),
      supabase.from('map_config').select('*').order('map_id'),
      supabase.from('rooms').select('id,gamenum,gametype,gamestate,validnum,alivenum,deathnum,winner,created_at,started_at')
        .order('created_at', { ascending: false }).limit(200),
      supabase.from('buff_pool').select('id,name,icon,is_debuff').order('id'),
    ])
    setItems(d1 || [])
    setNpcs(d2 || [])
    setMaps(d3 || [])
    setRooms(d4 || [])
    setBuffPool(d5 || [])
    setLoading(false)
  }
  async function loadItems() {
    const { data } = await supabase.from('item_pool').select('*').order('kind')
    setItems(data || [])
  }
  async function loadNpcs() {
    const { data } = await supabase.from('npc_pool').select('*').order('level')
    setNpcs(data || [])
  }
  async function loadRooms() {
    const { data } = await supabase.from('rooms').select('id,gamenum,gametype,gamestate,validnum,alivenum,deathnum,winner,created_at,started_at')
      .order('created_at', { ascending: false }).limit(200)
    setRooms(data || [])
  }

  useEffect(() => { loadAll() }, [])

  /* ─── ITEM CRUD ─── */
  function openAddItem() {
    setEditItem({
      name: '', kind: 'weapon', sub_kind: 'slashing', atk: 0, def: 0, heal: 0, effect: 0,
      amount: 1, maps: [], description: '',
      on_use_buff_ids: [], heal_formula: '', atk_formula: '', def_formula: '',
    })
    setItemModal(true)
  }
  function openEditItem(item) {
    setEditItem({
      ...item, maps: item.maps || [],
      on_use_buff_ids: item.on_use_buff_ids || [],
      heal_formula: item.heal_formula || '',
      atk_formula: item.atk_formula || '',
      def_formula: item.def_formula || '',
    })
    setItemModal(true)
  }
  async function saveItem() {
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
    setItemModal(false); setEditItem(null); loadItems()
  }
  async function deleteItem(id) {
    const { error } = await supabase.from('item_pool').delete().eq('id', id)
    if (error) { toast('删除失败', 'error'); return }
    toast('道具已删除'); setConfirmDelete(null); loadItems()
  }

  /* ─── NPC CRUD ─── */
  function openAddNpc() {
    setEditNpc({ name: '', hp: 50, atk: 10, def: 5, exp: 20, level: 'easy', maps: [] })
    setNpcModal(true)
  }
  function openEditNpc(npc) {
    setEditNpc({ ...npc, maps: npc.maps || [] })
    setNpcModal(true)
  }
  async function saveNpc() {
    if (!editNpc.name.trim()) { toast('请填写NPC名称', 'error'); return }
    const payload = { ...editNpc }; delete payload.created_at
    if (editNpc.id) {
      const id = payload.id; delete payload.id
      const { error } = await supabase.from('npc_pool').update(payload).eq('id', id)
      if (error) { toast('更新失败', 'error'); return }
      toast('NPC已更新')
    } else {
      delete payload.id
      const { error } = await supabase.from('npc_pool').insert(payload)
      if (error) { toast('添加失败', 'error'); return }
      toast('NPC已添加')
    }
    setNpcModal(false); setEditNpc(null); loadNpcs()
  }
  async function deleteNpc(id) {
    const { error } = await supabase.from('npc_pool').delete().eq('id', id)
    if (error) { toast('删除失败', 'error'); return }
    toast('NPC已删除'); setConfirmDelete(null); loadNpcs()
  }

  /* ─── MAP CONFIG ─── */
  const mapTimers = useRef({})
  function updateMap(mapId, updates) {
    setMaps(prev => prev.map(m => m.map_id === mapId ? { ...m, ...updates } : m))
    clearTimeout(mapTimers.current[mapId])
    mapTimers.current[mapId] = setTimeout(() => {
      supabase.from('map_config').update(updates).eq('map_id', mapId)
    }, 600)
  }
  function updateMapNow(mapId, updates, msg) {
    setMaps(prev => prev.map(m => m.map_id === mapId ? { ...m, ...updates } : m))
    supabase.from('map_config').update(updates).eq('map_id', mapId)
    if (msg) toast(msg)
  }

  /* ─── ROOM actions ─── */
  async function deleteRoom(id) {
    const { error } = await supabase.from('rooms').delete().eq('id', id)
    if (error) { toast('删除失败', 'error'); return }
    toast('房间已删除'); setConfirmDelete(null); loadRooms()
  }
  async function endRoom(id) {
    const { error } = await supabase.from('rooms').update({ gamestate: 2 }).eq('id', id)
    if (error) { toast('操作失败', 'error'); return }
    toast('已强制结束房间'); loadRooms()
  }

  function toggleMap(arr, mapId) {
    return arr.includes(mapId) ? arr.filter(m => m !== mapId) : [...arr, mapId]
  }
  function toggleBuff(arr, buffId) {
    return arr.includes(buffId) ? arr.filter(b => b !== buffId) : [...arr, buffId]
  }

  if (!user) return <div style={{ textAlign: 'center', padding: 60, color: '#8b949e' }}>请先登录</div>
  if (loading) return <Spinner />

  const filteredItems = items.filter(i =>
    (itemFilter === 'all' || i.kind === itemFilter) &&
    (!itemSearch || i.name.includes(itemSearch) || (i.description || '').includes(itemSearch))
  )
  const filteredNpcs = npcs.filter(n =>
    (npcFilter === 'all' || n.level === npcFilter) &&
    (!npcSearch || n.name.includes(npcSearch))
  )
  const filteredMaps = maps.filter(m => !mapSearch || m.name.includes(mapSearch))
  const filteredRooms = rooms.filter(r => roomFilter === 'all' || String(r.gamestate) === roomFilter)
  const activeRooms = rooms.filter(r => r.gamestate === 1).length
  const waitingRooms = rooms.filter(r => r.gamestate === 0).length
  const blockedMaps = maps.filter(m => m.blocked).length

  const tabs = [
    { key: 'overview', label: '📊 概览' },
    { key: 'items', label: '⚔️ 道具池', count: items.length },
    { key: 'npcs', label: '🤖 NPC', count: npcs.length },
    { key: 'maps', label: '🗺️ 地图', count: maps.length },
    { key: 'rooms', label: '🏠 房间', count: rooms.length },
    { key: 'rules', label: '⚙️ 战斗规则' },
  ]

  return (
    <div className="animate-in">
      <ToastContainer />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>⚙️ 管理后台</h2>
        <nav style={{ display: 'flex', gap: 3, background: '#161b22', borderRadius: 10, padding: 4, border: '1px solid #30363d', flexWrap: 'wrap' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '8px 16px', borderRadius: 7, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              background: tab === t.key ? '#58a6ff' : 'transparent',
              color: tab === t.key ? '#fff' : '#8b949e',
              transition: 'background 0.15s, color 0.15s',
            }}>
              {t.label}
              {t.count !== undefined && <span style={{ fontSize: 11, opacity: 0.65, marginLeft: 4 }}>({t.count})</span>}
            </button>
          ))}
        </nav>
      </div>

      {/* ═══ 概览 ═══ */}
      {tab === 'overview' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14, marginBottom: 20 }}>
            <StatCard label="道具总数" value={items.length} icon="⚔️" color="#f85149"
              sub={`武器 ${items.filter(i => i.kind === 'weapon').length} / 防具 ${items.filter(i => i.kind === 'armor').length} / 消耗品 ${items.filter(i => i.kind === 'consumable').length}`} />
            <StatCard label="NPC总数" value={npcs.length} icon="🤖" color="#bc8cff"
              sub={`BOSS ${npcs.filter(n => n.level === 'boss').length} / 困难 ${npcs.filter(n => n.level === 'hard').length} / 中等 ${npcs.filter(n => n.level === 'medium').length}`} />
            <StatCard label="活跃地图" value={maps.length - blockedMaps} icon="🗺️" color="#3fb950"
              sub={blockedMaps > 0 ? `${blockedMaps} 个禁区 / 共 ${maps.length}` : `共 ${maps.length} 个地图`} />
            <StatCard label="进行中房间" value={activeRooms} icon="🏠" color="#58a6ff"
              sub={`等待中 ${waitingRooms} / 历史记录 ${rooms.length}`} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>道具分布</div>
              {Object.entries(ITEM_KIND_META).map(([k, v]) => {
                const count = items.filter(i => i.kind === k).length
                const pct = items.length ? (count / items.length * 100) : 0
                return (
                  <div key={k} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                      <span style={{ color: v.color }}>{v.emoji} {v.label}</span>
                      <span style={{ color: '#8b949e', fontFamily: "'JetBrains Mono'" }}>{count}</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: '#30363d' }}>
                      <div style={{ height: '100%', borderRadius: 3, background: v.color, width: `${pct}%`, transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>NPC 等级分布</div>
              {Object.entries(NPC_LEVEL_META).map(([k, v]) => {
                const count = npcs.filter(n => n.level === k).length
                const pct = npcs.length ? (count / npcs.length * 100) : 0
                return (
                  <div key={k} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                      <span style={{ color: v.color }}>{v.label}</span>
                      <span style={{ color: '#8b949e', fontFamily: "'JetBrains Mono'" }}>{count}</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: '#30363d' }}>
                      <div style={{ height: '100%', borderRadius: 3, background: v.color, width: `${pct}%`, transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <div style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>最近房间</div>
              <button onClick={() => setTab('rooms')} style={{ background: 'none', border: 'none', color: '#58a6ff', fontSize: 12, cursor: 'pointer' }}>查看全部 →</button>
            </div>
            {rooms.length === 0
              ? <div style={{ textAlign: 'center', padding: '20px 0', color: '#8b949e', fontSize: 13 }}>暂无房间记录</div>
              : rooms.slice(0, 6).map(r => {
                  const st = ROOM_STATE[r.gamestate] || ROOM_STATE[0]
                  return (
                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #21262d' }}>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                        <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: '#484f58', minWidth: 36 }}>#{r.id}</span>
                        <span style={{ fontSize: 13 }}>{GAME_TYPES[r.gametype] || `类型${r.gametype}`}</span>
                        <span style={{ fontSize: 11, color: st.color, background: `${st.color}18`, padding: '2px 10px', borderRadius: 10 }}>{st.label}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#8b949e' }}>
                        <span>{r.validnum || 0} 人</span>
                        {r.winner && <span style={{ color: '#d29922' }}>🏆 {r.winner}</span>}
                      </div>
                    </div>
                  )
                })}
          </div>
        </div>
      )}

      {/* ═══ 道具池 ═══ */}
      {tab === 'items' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input style={{ ...INPUT, width: 190 }} placeholder="🔍 搜索道具..."
                value={itemSearch} onChange={e => setItemSearch(e.target.value)} />
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {['all', ...Object.keys(ITEM_KIND_META)].map(k => (
                  <button key={k} onClick={() => setItemFilter(k)} style={{
                    padding: '6px 12px', borderRadius: 20, border: `1px solid ${itemFilter === k ? '#58a6ff' : '#30363d'}`,
                    background: itemFilter === k ? 'rgba(88,166,255,0.12)' : 'transparent',
                    color: itemFilter === k ? '#58a6ff' : '#8b949e', fontSize: 12, cursor: 'pointer',
                  }}>{k === 'all' ? '全部' : ITEM_KIND_META[k].label}</button>
                ))}
              </div>
            </div>
            <button onClick={openAddItem} style={BTN('#58a6ff', '#fff')}>+ 新增道具</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {filteredItems.map(item => {
              const meta = ITEM_KIND_META[item.kind] || ITEM_KIND_META.special
              const isConf = confirmDelete?.type === 'item' && confirmDelete?.id === item.id
              const itemBuffs = buffPool.filter(b => (item.on_use_buff_ids || []).includes(b.id))
              return (
                <div key={item.id} style={{ background: '#1c2129', borderRadius: 12, padding: 18, transition: 'border-color 0.2s', border: `1px solid ${isConf ? '#f85149' : '#30363d'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 22 }}>{meta.emoji}</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                          <span style={{ fontSize: 10, color: meta.color, background: `${meta.color}18`, padding: '1px 8px', borderRadius: 10 }}>{meta.label}</span>
                          {item.kind === 'weapon' && item.sub_kind &&
                            <span style={{ fontSize: 10, color: '#8b949e', background: 'rgba(139,148,158,0.1)', padding: '1px 8px', borderRadius: 10 }}>
                              {WEAPON_SUB_KINDS[item.sub_kind] || item.sub_kind}
                            </span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'flex-start' }}>
                      <button onClick={() => openEditItem(item)} style={{ background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.2)', borderRadius: 6, cursor: 'pointer', color: '#58a6ff', fontSize: 12, padding: '4px 10px' }}>编辑</button>
                      {isConf
                        ? <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => deleteItem(item.id)} style={{ background: 'rgba(248,81,73,0.15)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 6, cursor: 'pointer', color: '#f85149', fontSize: 12, padding: '4px 10px' }}>确认</button>
                            <button onClick={() => setConfirmDelete(null)} style={{ background: 'none', border: '1px solid #30363d', borderRadius: 6, cursor: 'pointer', color: '#8b949e', fontSize: 12, padding: '4px 10px' }}>取消</button>
                          </div>
                        : <button onClick={() => setConfirmDelete({ type: 'item', id: item.id })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#484f58', fontSize: 16, padding: '2px 4px' }}>🗑️</button>
                      }
                    </div>
                  </div>
                  {item.description && <p style={{ fontSize: 11, color: '#8b949e', margin: '0 0 10px', lineHeight: 1.5 }}>{item.description}</p>}
                  <div style={{ display: 'flex', gap: 14, fontSize: 11, marginBottom: 8 }}>
                    {item.atk > 0 && <span style={{ color: '#f85149' }}>ATK {item.atk}</span>}
                    {item.def > 0 && <span style={{ color: '#58a6ff' }}>DEF {item.def}</span>}
                    {item.heal > 0 && <span style={{ color: '#3fb950' }}>HEAL {item.heal}</span>}
                    {item.effect > 0 && <span style={{ color: '#bc8cff' }}>EFX {item.effect}</span>}
                    <span style={{ color: '#8b949e' }}>×{item.amount}</span>
                  </div>
                  {/* 绑定 Buff 显示 */}
                  {itemBuffs.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                      {itemBuffs.map(b => (
                        <span key={b.id} style={{ fontSize: 10, padding: '1px 8px', borderRadius: 8, background: b.is_debuff ? 'rgba(248,81,73,0.12)' : 'rgba(63,185,80,0.12)', color: b.is_debuff ? '#f85149' : '#3fb950' }}>
                          {b.icon} {b.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(item.maps || []).slice(0, 5).map(mid => {
                      const m = MAP_LIST.find(x => x.id === mid)
                      return <span key={mid} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(88,166,255,0.1)', color: '#58a6ff' }}>{m?.name || mid}</span>
                    })}
                    {(item.maps || []).length > 5 && <span style={{ fontSize: 10, color: '#8b949e' }}>+{item.maps.length - 5}</span>}
                    {(item.maps || []).length === 0 && <span style={{ fontSize: 10, color: '#484f58' }}>未分配地图</span>}
                  </div>
                </div>
              )
            })}
          </div>
          {filteredItems.length === 0 && (
            <div style={{ textAlign: 'center', padding: 56, color: '#8b949e' }}>
              {itemSearch ? `未找到"${itemSearch}"` : '暂无道具'}
            </div>
          )}
        </div>
      )}

      {/* ═══ NPC ═══ */}
      {tab === 'npcs' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input style={{ ...INPUT, width: 190 }} placeholder="🔍 搜索NPC..."
                value={npcSearch} onChange={e => setNpcSearch(e.target.value)} />
              <div style={{ display: 'flex', gap: 4 }}>
                {['all', ...Object.keys(NPC_LEVEL_META)].map(k => (
                  <button key={k} onClick={() => setNpcFilter(k)} style={{
                    padding: '6px 12px', borderRadius: 20, border: `1px solid ${npcFilter === k ? '#58a6ff' : '#30363d'}`,
                    background: npcFilter === k ? 'rgba(88,166,255,0.12)' : 'transparent',
                    color: npcFilter === k ? '#58a6ff' : '#8b949e', fontSize: 12, cursor: 'pointer',
                  }}>{k === 'all' ? '全部' : NPC_LEVEL_META[k].label}</button>
                ))}
              </div>
            </div>
            <button onClick={openAddNpc} style={BTN('#58a6ff', '#fff')}>+ 新增 NPC</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {filteredNpcs.map(npc => {
              const lv = NPC_LEVEL_META[npc.level] || NPC_LEVEL_META.easy
              const isConf = confirmDelete?.type === 'npc' && confirmDelete?.id === npc.id
              return (
                <div key={npc.id} style={{ background: '#1c2129', borderRadius: 12, padding: 18, transition: 'border-color 0.2s', border: `1px solid ${isConf ? '#f85149' : '#30363d'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>🤖 {npc.name}</div>
                      <span style={{ fontSize: 10, color: lv.color, background: `${lv.color}18`, padding: '1px 8px', borderRadius: 10 }}>{lv.label}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'flex-start' }}>
                      <button onClick={() => openEditNpc(npc)} style={{ background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.2)', borderRadius: 6, cursor: 'pointer', color: '#58a6ff', fontSize: 12, padding: '4px 10px' }}>编辑</button>
                      {isConf
                        ? <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => deleteNpc(npc.id)} style={{ background: 'rgba(248,81,73,0.15)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 6, cursor: 'pointer', color: '#f85149', fontSize: 12, padding: '4px 10px' }}>确认</button>
                            <button onClick={() => setConfirmDelete(null)} style={{ background: 'none', border: '1px solid #30363d', borderRadius: 6, cursor: 'pointer', color: '#8b949e', fontSize: 12, padding: '4px 10px' }}>取消</button>
                          </div>
                        : <button onClick={() => setConfirmDelete({ type: 'npc', id: npc.id })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#484f58', fontSize: 16, padding: '2px 4px' }}>🗑️</button>
                      }
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px', fontSize: 11, marginBottom: 10 }}>
                    {[{ l: 'HP', v: npc.hp, c: '#3fb950', max: 800 }, { l: 'ATK', v: npc.atk, c: '#f85149', max: 70 },
                      { l: 'DEF', v: npc.def, c: '#58a6ff', max: 40 }, { l: 'EXP', v: npc.exp, c: '#d29922', max: 500 }].map(s => (
                      <div key={s.l}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#8b949e', marginBottom: 2 }}>
                          <span>{s.l}</span>
                          <span style={{ color: s.c, fontFamily: "'JetBrains Mono'", fontWeight: 600 }}>{s.v}</span>
                        </div>
                        <div style={{ height: 3, borderRadius: 2, background: `${s.c}20` }}>
                          <div style={{ height: '100%', borderRadius: 2, background: s.c, width: `${Math.min(100, s.v / s.max * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(npc.maps || []).map(mid => {
                      const m = MAP_LIST.find(x => x.id === mid)
                      return <span key={mid} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: `${lv.color}15`, color: lv.color }}>{m?.name || mid}</span>
                    })}
                    {(npc.maps || []).length === 0 && <span style={{ fontSize: 10, color: '#484f58' }}>未分配地图</span>}
                  </div>
                </div>
              )
            })}
          </div>
          {filteredNpcs.length === 0 && (
            <div style={{ textAlign: 'center', padding: 56, color: '#8b949e' }}>
              {npcSearch ? `未找到"${npcSearch}"` : '暂无NPC'}
            </div>
          )}
        </div>
      )}

      {/* ═══ 地图 ═══ */}
      {tab === 'maps' && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <input style={{ ...INPUT, maxWidth: 280 }} placeholder="🔍 搜索地图..."
              value={mapSearch} onChange={e => setMapSearch(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {filteredMaps.map(map => {
              const itemCount = items.filter(i => (i.maps || []).includes(map.map_id)).reduce((s, i) => s + i.amount, 0)
              const npcCount = npcs.filter(n => (n.maps || []).includes(map.map_id)).length
              const w = WEATHER_OPTIONS.find(o => o.value === map.weather) || WEATHER_OPTIONS[0]
              const isOpen = selectedMap === map.map_id
              const dangerColors = ['', '#3fb950', '#3fb950', '#d29922', '#f85149', '#bc8cff']
              return (
                <div key={map.map_id} onClick={() => setSelectedMap(isOpen ? null : map.map_id)}
                  style={{
                    background: isOpen ? '#222830' : map.blocked ? 'rgba(248,81,73,0.05)' : '#1c2129',
                    borderRadius: 12, border: `1px solid ${isOpen ? '#58a6ff' : map.blocked ? '#f85149' : '#30363d'}`,
                    padding: 16, cursor: 'pointer', transition: 'all 0.2s',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: '#484f58' }}>#{map.map_id}</span>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{map.name}</span>
                    </div>
                    {map.blocked && <span style={{ fontSize: 10, color: '#f85149', background: 'rgba(248,81,73,0.12)', padding: '1px 8px', borderRadius: 10 }}>禁区</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#8b949e', marginBottom: 6 }}>
                    <span>{w.label}</span>
                    <span style={{ color: '#58a6ff' }}>道具 {itemCount}</span>
                    <span style={{ color: '#f85149' }}>NPC {npcCount}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10 }}>
                    <span style={{ color: '#8b949e', marginRight: 2 }}>危险度</span>
                    {[1, 2, 3, 4, 5].map(lv => (
                      <div key={lv} style={{ width: 14, height: 3, borderRadius: 2, background: lv <= map.danger_level ? dangerColors[map.danger_level] : 'rgba(72,79,88,0.4)' }} />
                    ))}
                  </div>
                  {isOpen && (
                    <div onClick={e => e.stopPropagation()} style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #30363d' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={LABEL}>天气</label>
                          <select style={INPUT} value={map.weather} onChange={e => updateMapNow(map.map_id, { weather: e.target.value }, `${map.name} 天气已更新`)}>
                            {WEATHER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={LABEL}>危险等级</label>
                          <select style={INPUT} value={map.danger_level} onChange={e => updateMapNow(map.map_id, { danger_level: Number(e.target.value) })}>
                            {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>Lv.{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={LABEL}>最大道具数</label>
                          <input type="number" style={INPUT} value={map.max_items} onChange={e => updateMap(map.map_id, { max_items: Number(e.target.value) })} />
                        </div>
                        <div>
                          <label style={LABEL}>最大NPC数</label>
                          <input type="number" style={INPUT} value={map.max_npcs} onChange={e => updateMap(map.map_id, { max_npcs: Number(e.target.value) })} />
                        </div>
                      </div>
                      <button style={{
                        ...BTN(map.blocked ? 'rgba(63,185,80,0.12)' : 'rgba(248,81,73,0.12)', map.blocked ? '#3fb950' : '#f85149'),
                        marginTop: 10, width: '100%', justifyContent: 'center',
                        border: `1px solid ${map.blocked ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)'}`,
                      }} onClick={() => updateMapNow(map.map_id, { blocked: !map.blocked }, map.blocked ? '已解除禁区' : '已设为禁区')}>
                        {map.blocked ? '✅ 解除禁区' : '⛔ 设为禁区'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══ 房间 ═══ */}
      {tab === 'rooms' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[{ k: 'all', l: '全部' }, { k: '1', l: '进行中' }, { k: '0', l: '等待中' }, { k: '2', l: '已结束' }].map(f => (
                <button key={f.k} onClick={() => setRoomFilter(f.k)} style={{
                  padding: '6px 14px', borderRadius: 20, border: `1px solid ${roomFilter === f.k ? '#58a6ff' : '#30363d'}`,
                  background: roomFilter === f.k ? 'rgba(88,166,255,0.12)' : 'transparent',
                  color: roomFilter === f.k ? '#58a6ff' : '#8b949e', fontSize: 12, cursor: 'pointer',
                }}>{f.l}</button>
              ))}
            </div>
            <button onClick={loadRooms} style={{ ...BTN('transparent', '#8b949e'), border: '1px solid #30363d', padding: '8px 16px' }}>↻ 刷新</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredRooms.map(room => {
              const st = ROOM_STATE[room.gamestate] || ROOM_STATE[0]
              const isConf = confirmDelete?.type === 'room' && confirmDelete?.id === room.id
              const createdAt = room.created_at
                ? new Date(room.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                : '-'
              return (
                <div key={room.id} style={{
                  background: '#1c2129', borderRadius: 12, padding: '14px 20px',
                  border: `1px solid ${isConf ? '#f85149' : '#30363d'}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
                }}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: '#484f58', minWidth: 40 }}>#{room.id}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{GAME_TYPES[room.gametype] || `类型${room.gametype}`}</div>
                      <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>{createdAt}</div>
                    </div>
                    <span style={{ fontSize: 11, color: st.color, background: `${st.color}15`, padding: '3px 10px', borderRadius: 10 }}>{st.label}</span>
                    <div style={{ display: 'flex', gap: 14, fontSize: 11 }}>
                      <span style={{ color: '#8b949e' }}>玩家 <span style={{ color: '#58a6ff' }}>{room.validnum || 0}</span></span>
                      {room.gamestate !== 0 && <span style={{ color: '#8b949e' }}>存活 <span style={{ color: '#3fb950' }}>{room.alivenum || 0}</span></span>}
                      {room.gamestate !== 0 && <span style={{ color: '#8b949e' }}>阵亡 <span style={{ color: '#f85149' }}>{room.deathnum || 0}</span></span>}
                      {room.winner && <span style={{ color: '#d29922' }}>🏆 {room.winner}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {room.gamestate === 1 && (
                      <button onClick={() => endRoom(room.id)}
                        style={{ ...BTN('rgba(210,153,34,0.12)', '#d29922', { padding: '6px 14px', fontSize: 12, border: '1px solid rgba(210,153,34,0.3)' }) }}>强制结束</button>
                    )}
                    {isConf
                      ? <>
                          <button onClick={() => deleteRoom(room.id)}
                            style={{ ...BTN('rgba(248,81,73,0.15)', '#f85149', { padding: '6px 14px', fontSize: 12, border: '1px solid rgba(248,81,73,0.3)' }) }}>确认删除</button>
                          <button onClick={() => setConfirmDelete(null)}
                            style={{ ...BTN('transparent', '#8b949e', { padding: '6px 14px', fontSize: 12, border: '1px solid #30363d' }) }}>取消</button>
                        </>
                      : <button onClick={() => setConfirmDelete({ type: 'room', id: room.id })}
                          style={{ ...BTN('transparent', '#8b949e', { padding: '6px 14px', fontSize: 12, border: '1px solid #30363d' }) }}>删除</button>
                    }
                  </div>
                </div>
              )
            })}
            {filteredRooms.length === 0 && <div style={{ textAlign: 'center', padding: 56, color: '#8b949e' }}>暂无房间记录</div>}
          </div>
        </div>
      )}

      {/* ═══ ⚙️ 战斗规则 ═══ */}
      {tab === 'rules' && <RulesTab toast={toast} />}

      {/* ═══ ITEM MODAL ═══ */}
      <Modal open={itemModal} onClose={() => { setItemModal(false); setEditItem(null) }}
        title={editItem?.id ? `编辑道具：${editItem.name}` : '添加道具'}>
        {editItem && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: editItem.kind === 'weapon' ? '1' : '1 / -1' }}>
                <label style={LABEL}>名称</label>
                <input style={INPUT} value={editItem.name} onChange={e => setEditItem({ ...editItem, name: e.target.value })} />
              </div>
              <div>
                <label style={LABEL}>类型</label>
                <select style={INPUT} value={editItem.kind} onChange={e => setEditItem({ ...editItem, kind: e.target.value })}>
                  {Object.entries(ITEM_KIND_META).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
                </select>
              </div>
              {editItem.kind === 'weapon' && (
                <div>
                  <label style={LABEL}>武器子类</label>
                  <select style={INPUT} value={editItem.sub_kind} onChange={e => setEditItem({ ...editItem, sub_kind: e.target.value })}>
                    {Object.entries(WEAPON_SUB_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              )}
              <div><label style={LABEL}>ATK 攻击</label><input type="number" style={INPUT} value={editItem.atk} onChange={e => setEditItem({ ...editItem, atk: Number(e.target.value) })} /></div>
              <div><label style={LABEL}>DEF 防御</label><input type="number" style={INPUT} value={editItem.def} onChange={e => setEditItem({ ...editItem, def: Number(e.target.value) })} /></div>
              <div><label style={LABEL}>HEAL 治疗</label><input type="number" style={INPUT} value={editItem.heal} onChange={e => setEditItem({ ...editItem, heal: Number(e.target.value) })} /></div>
              <div><label style={LABEL}>特效值</label><input type="number" style={INPUT} value={editItem.effect} onChange={e => setEditItem({ ...editItem, effect: Number(e.target.value) })} /></div>
              <div><label style={LABEL}>数量</label><input type="number" min={1} style={INPUT} value={editItem.amount} onChange={e => setEditItem({ ...editItem, amount: Math.max(1, Number(e.target.value)) })} /></div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={LABEL}>描述</label>
              <input style={INPUT} value={editItem.description} onChange={e => setEditItem({ ...editItem, description: e.target.value })} />
            </div>

            {/* 自定义效果公式 */}
            <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: 'rgba(188,140,255,0.05)', border: '1px solid rgba(188,140,255,0.15)' }}>
              <div style={{ fontSize: 12, color: '#bc8cff', fontWeight: 600, marginBottom: 10 }}>✨ 自定义效果公式（留空则使用全局规则）</div>
              {editItem.kind === 'consumable' && (
                <div style={{ marginBottom: 10 }}>
                  <label style={LABEL}>治疗公式</label>
                  <input style={{ ...INPUT, fontFamily: 'monospace', fontSize: 12 }}
                    placeholder="如: heal * 1.5 + effect"
                    value={editItem.heal_formula}
                    onChange={e => setEditItem({ ...editItem, heal_formula: e.target.value })} />
                  <FormulaPreview formula={editItem.heal_formula} />
                </div>
              )}
              {editItem.kind === 'weapon' && (
                <div style={{ marginBottom: 10 }}>
                  <label style={LABEL}>装备攻击公式</label>
                  <input style={{ ...INPUT, fontFamily: 'monospace', fontSize: 12 }}
                    placeholder="如: atk + floor(effect * 0.5)"
                    value={editItem.atk_formula}
                    onChange={e => setEditItem({ ...editItem, atk_formula: e.target.value })} />
                  <FormulaPreview formula={editItem.atk_formula} />
                </div>
              )}
              {editItem.kind === 'armor' && (
                <div style={{ marginBottom: 10 }}>
                  <label style={LABEL}>装备防御公式</label>
                  <input style={{ ...INPUT, fontFamily: 'monospace', fontSize: 12 }}
                    placeholder="如: def + effect"
                    value={editItem.def_formula}
                    onChange={e => setEditItem({ ...editItem, def_formula: e.target.value })} />
                  <FormulaPreview formula={editItem.def_formula} />
                </div>
              )}

              {/* 绑定 Buff */}
              {buffPool.length > 0 && (
                <div>
                  <label style={LABEL}>使用时触发 Buff</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {buffPool.map(b => {
                      const selected = (editItem.on_use_buff_ids || []).includes(b.id)
                      return (
                        <button key={b.id} onClick={() => setEditItem({ ...editItem, on_use_buff_ids: toggleBuff(editItem.on_use_buff_ids || [], b.id) })}
                          style={{
                            padding: '4px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer',
                            border: `1px solid ${selected ? (b.is_debuff ? '#f85149' : '#3fb950') : '#30363d'}`,
                            background: selected ? (b.is_debuff ? 'rgba(248,81,73,0.12)' : 'rgba(63,185,80,0.12)') : 'transparent',
                            color: selected ? (b.is_debuff ? '#f85149' : '#3fb950') : '#8b949e',
                          }}>
                          {b.icon} {b.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ ...LABEL, margin: 0 }}>分配地图 <span style={{ color: '#58a6ff', fontStyle: 'normal', textTransform: 'none', letterSpacing: 0 }}>({editItem.maps.length} 已选)</span></label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditItem({ ...editItem, maps: MAP_LIST.map(m => m.id) })} style={{ background: 'none', border: 'none', color: '#58a6ff', fontSize: 12, cursor: 'pointer' }}>全选</button>
                  <button onClick={() => setEditItem({ ...editItem, maps: [] })} style={{ background: 'none', border: 'none', color: '#8b949e', fontSize: 12, cursor: 'pointer' }}>清空</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 150, overflowY: 'auto', padding: '4px 0' }}>
                {MAP_LIST.map(m => (
                  <button key={m.id} onClick={() => setEditItem({ ...editItem, maps: toggleMap(editItem.maps, m.id) })}
                    style={{
                      padding: '4px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer',
                      border: `1px solid ${editItem.maps.includes(m.id) ? '#58a6ff' : '#30363d'}`,
                      background: editItem.maps.includes(m.id) ? 'rgba(88,166,255,0.12)' : 'transparent',
                      color: editItem.maps.includes(m.id) ? '#58a6ff' : '#8b949e',
                    }}>{m.name}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button onClick={() => { setItemModal(false); setEditItem(null) }} style={{ ...BTN('transparent', '#8b949e'), border: '1px solid #30363d' }}>取消</button>
              <button onClick={saveItem} style={BTN('#58a6ff', '#fff')}>{editItem.id ? '保存修改' : '添加道具'}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══ NPC MODAL ═══ */}
      <Modal open={npcModal} onClose={() => { setNpcModal(false); setEditNpc(null) }}
        title={editNpc?.id ? `编辑NPC：${editNpc.name}` : '添加 NPC'}>
        {editNpc && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={LABEL}>名称</label><input style={INPUT} value={editNpc.name} onChange={e => setEditNpc({ ...editNpc, name: e.target.value })} /></div>
              <div>
                <label style={LABEL}>难度</label>
                <select style={INPUT} value={editNpc.level} onChange={e => setEditNpc({ ...editNpc, level: e.target.value })}>
                  {Object.entries(NPC_LEVEL_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div><label style={LABEL}>HP 生命值</label><input type="number" style={INPUT} value={editNpc.hp} onChange={e => setEditNpc({ ...editNpc, hp: Number(e.target.value) })} /></div>
              <div><label style={LABEL}>ATK 攻击</label><input type="number" style={INPUT} value={editNpc.atk} onChange={e => setEditNpc({ ...editNpc, atk: Number(e.target.value) })} /></div>
              <div><label style={LABEL}>DEF 防御</label><input type="number" style={INPUT} value={editNpc.def} onChange={e => setEditNpc({ ...editNpc, def: Number(e.target.value) })} /></div>
              <div><label style={LABEL}>EXP 经验</label><input type="number" style={INPUT} value={editNpc.exp} onChange={e => setEditNpc({ ...editNpc, exp: Number(e.target.value) })} /></div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ ...LABEL, margin: 0 }}>分配地图 <span style={{ color: '#58a6ff', fontStyle: 'normal', textTransform: 'none', letterSpacing: 0 }}>({editNpc.maps.length} 已选)</span></label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditNpc({ ...editNpc, maps: MAP_LIST.map(m => m.id) })} style={{ background: 'none', border: 'none', color: '#58a6ff', fontSize: 12, cursor: 'pointer' }}>全选</button>
                  <button onClick={() => setEditNpc({ ...editNpc, maps: [] })} style={{ background: 'none', border: 'none', color: '#8b949e', fontSize: 12, cursor: 'pointer' }}>清空</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 150, overflowY: 'auto', padding: '4px 0' }}>
                {MAP_LIST.map(m => (
                  <button key={m.id} onClick={() => setEditNpc({ ...editNpc, maps: toggleMap(editNpc.maps, m.id) })}
                    style={{
                      padding: '4px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer',
                      border: `1px solid ${editNpc.maps.includes(m.id) ? '#58a6ff' : '#30363d'}`,
                      background: editNpc.maps.includes(m.id) ? 'rgba(88,166,255,0.12)' : 'transparent',
                      color: editNpc.maps.includes(m.id) ? '#58a6ff' : '#8b949e',
                    }}>{m.name}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button onClick={() => { setNpcModal(false); setEditNpc(null) }} style={{ ...BTN('transparent', '#8b949e'), border: '1px solid #30363d' }}>取消</button>
              <button onClick={saveNpc} style={BTN('#58a6ff', '#fff')}>{editNpc.id ? '保存修改' : '添加 NPC'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
