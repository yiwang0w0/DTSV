'use client'
import { useState, useEffect } from 'react'
import { resolveLabel } from './refIntegrity'
import { C, INPUT, BTN, FormulaPreview } from '../_shared/ui'

// ── JSON 序列化助手（json 字段类型用）──
function toJsonText(v) {
  if (v == null) return ''
  try { return JSON.stringify(v, null, 2) } catch { return String(v) }
}
function compactJson(v) {
  if (v == null) return '—'
  try { return JSON.stringify(v) } catch { return String(v) }
}

/**
 * fields.jsx — 字段渲染器。
 *   <FieldValue>：只读展示（列表卡片）。
 *   <FieldInput>：可编辑控件（Drawer 表单）——text/textarea/number/select/bool/ref/ingredient-list/formula。
 */

// ───────── 只读展示 ─────────
export function FieldValue({ field, row, refs }) {
  const v = row[field.name]

  if (field.type === 'bool') {
    return <span style={{ color: v ? C.green : C.dim2 }}>{v ? '✓ 是' : '— 否'}</span>
  }
  if (field.type === 'select') {
    const opt = (field.options || []).find((o) => String(o[0]) === String(v))
    return <span>{opt ? opt[1] : v == null || v === '' ? '—' : String(v)}</span>
  }
  if (field.type === 'ref') {
    if (v == null) return <span style={{ color: C.dim2 }}>—</span>
    const label = resolveLabel(refs, field.ref.table, v)
    return label != null
      ? <span style={{ color: C.accent }}>{label}</span>
      : <span style={{ color: C.red }}>⚠ 引用失效 #{v}</span>
  }
  if (field.type === 'ref-multi') {
    const arr = Array.isArray(v) ? v : []
    if (arr.length === 0) return <span style={{ color: C.dim2 }}>—</span>
    return (
      <span>
        {arr.map((id, i) => {
          const label = resolveLabel(refs, field.ref.table, id)
          return (
            <span key={i} style={{ color: label != null ? C.text : C.red }}>
              {i > 0 ? '、' : ''}{label != null ? label : `⚠#${id}`}
            </span>
          )
        })}
      </span>
    )
  }
  if (field.type === 'ingredient-list') {
    const arr = Array.isArray(v) ? v : []
    if (arr.length === 0) return <span style={{ color: C.dim2 }}>—（无材料）</span>
    const refCol = field.bridge?.refColumn
    return (
      <span>
        {arr.map((it, i) => {
          const label = resolveLabel(refs, field.ref.table, it[refCol])
          return (
            <span key={i} style={{ color: label != null ? C.text : C.red }}>
              {i > 0 ? '、' : ''}{label != null ? label : `⚠#${it[refCol]}`}×{it.quantity ?? 1}{it.is_consumed === false ? '(催化)' : ''}
            </span>
          )
        })}
      </span>
    )
  }
  if (field.type === 'json') {
    const s = compactJson(v)
    if (s === '—' || s === '{}' || s === '[]') return <span style={{ color: C.dim2 }}>—</span>
    return <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 11, color: C.dim }}>{s.length > 60 ? s.slice(0, 60) + '…' : s}</span>
  }
  if (v == null || v === '') return <span style={{ color: C.dim2 }}>—</span>
  return <span>{String(v)}</span>
}

// ───────── JSON 编辑器（json 字段类型 · 本地文本态·仅合法 JSON 提交）─────────
function JsonInput({ field, value, onChange }) {
  const [text, setText] = useState(() => toJsonText(value))
  const [err, setErr] = useState(null)

  // 外部 value 变化（换行编辑/加载）时同步文本；自身 onChange 造成的 round-trip 不重置，避免打断输入。
  useEffect(() => {
    let curEqualsValue = false
    try { curEqualsValue = JSON.stringify(JSON.parse(text)) === JSON.stringify(value) } catch { curEqualsValue = false }
    if (!curEqualsValue) { setText(toJsonText(value)); setErr(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const handle = (e) => {
    const t = e.target.value
    setText(t)
    if (t.trim() === '') { setErr(null); onChange(field.nullable ? null : {}); return }
    try {
      onChange(JSON.parse(t))
      setErr(null)
    } catch (parseErr) {
      setErr(parseErr.message)  // 非法 JSON：保留上次合法值，仅提示，不提交
    }
  }

  return (
    <div>
      <textarea
        style={{ ...INPUT, minHeight: 120, resize: 'vertical', fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 12, lineHeight: 1.5 }}
        rows={field.rows || 8}
        value={text}
        onChange={handle}
        spellCheck={false}
        placeholder={field.placeholder || '{ }'}
      />
      <div style={{ marginTop: 4, fontSize: 11, color: err ? C.red : C.dim2 }}>
        {err ? `⚠ JSON 无效：${err}（未提交，保留上次合法值）` : 'JSON · 合法时自动提交'}
      </div>
    </div>
  )
}

// ───────── 引用下拉（ref 字段 + 材料清单复用）─────────
function RefSelect({ refField, refs, value, onChange, placeholder = '— 选择 —' }) {
  const list = refs?.[refField.table]?.list || []
  const valueKey = refField.valueKey || 'id'
  const labelKey = refField.labelKey || 'name'
  return (
    <select
      style={INPUT}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    >
      <option value="">{placeholder}</option>
      {list.map((r) => <option key={r[valueKey]} value={r[valueKey]}>[{r[valueKey]}] {r[labelKey]}</option>)}
    </select>
  )
}

// ───────── 材料清单子编辑器（ingredient-list → 桥接表）─────────
function IngredientList({ field, value, onChange, refs }) {
  const list = Array.isArray(value) ? value : []
  const refCol = field.bridge.refColumn
  const update = (i, patch) => onChange(list.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  const removeAt = (i) => onChange(list.filter((_, j) => j !== i))
  const add = () => {
    const blank = { [refCol]: null }
    for (const f of field.itemFields || []) blank[f.name] = f.default ?? (f.type === 'bool' ? true : 1)
    onChange([...list, blank])
  }
  return (
    <div>
      {list.length === 0 && <div style={{ color: C.dim2, fontSize: 12, marginBottom: 8 }}>暂无材料</div>}
      {list.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8, background: C.bg2, padding: 8, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <div style={{ flex: 2 }}>
            <RefSelect refField={field.ref} refs={refs} value={it[refCol]} onChange={(v) => update(i, { [refCol]: v })} placeholder="选材料" />
          </div>
          {(field.itemFields || []).map((itf) => (
            <div key={itf.name} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 10, color: C.dim }}>{itf.label}</span>
              {itf.type === 'bool'
                ? <button onClick={() => update(i, { [itf.name]: !it[itf.name] })} style={BTN(it[itf.name] ? C.green : C.border2, it[itf.name] ? '#fff' : C.dim, { padding: '8px 10px' })}>{it[itf.name] ? '是' : '否'}</button>
                : <input type="number" style={{ ...INPUT, padding: '8px 10px' }} value={it[itf.name] ?? ''} min={itf.min ?? 1} onChange={(e) => update(i, { [itf.name]: e.target.value })} />}
            </div>
          ))}
          <button onClick={() => removeAt(i)} title="移除" style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 16, padding: '6px 4px' }}>✕</button>
        </div>
      ))}
      <button onClick={add} style={BTN('rgba(88,166,255,0.12)', C.accent, { border: `1px solid ${C.accent}40` })}>+ 加材料</button>
    </div>
  )
}

// ───────── 可编辑控件 ─────────
export function FieldInput({ field, value, onChange, refs }) {
  // 只读字段（如服务端强制的 provenance）：展示值 + 「服务端强制」提示，不给可编辑控件（编辑无效·避免误导）。
  if (field.readOnly) {
    const shown = field.type === 'json'
      ? compactJson(value ?? field.default)
      : (value == null || value === '' ? '—' : String(value))
    return (
      <div style={{ padding: '8px 10px', background: C.bg2, border: `1px dashed ${C.border}`, borderRadius: 8, color: C.dim2, fontSize: 12, fontFamily: field.type === 'json' ? 'var(--font-jetbrains-mono), monospace' : 'inherit', display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <span>{shown}</span>
        <span style={{ color: C.dim, fontSize: 11, whiteSpace: 'nowrap' }}>服务端强制 · 不可改</span>
      </div>
    )
  }
  switch (field.type) {
    case 'textarea':
      return <textarea style={{ ...INPUT, minHeight: 60, resize: 'vertical' }} rows={field.rows || 2} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    case 'json':
      return <JsonInput field={field} value={value} onChange={onChange} />
    case 'number':
      return <input type="number" style={INPUT} value={value ?? ''} min={field.min} max={field.max} step={field.step}
        onChange={(e) => onChange(e.target.value === '' ? (field.nullable ? null : '') : Number(e.target.value))} />
    case 'select':
      return (
        <select style={INPUT} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          {(field.options || []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      )
    case 'bool':
      return <button onClick={() => onChange(!value)} style={BTN(value ? C.green : C.border2, value ? '#fff' : C.dim, {})}>{value ? '✓ 是' : '— 否'}</button>
    case 'ref':
      return <RefSelect refField={field.ref} refs={refs} value={value} onChange={onChange} />
    case 'ingredient-list':
      return <IngredientList field={field} value={value} onChange={onChange} refs={refs} />
    case 'formula':
      return (
        <div>
          <input style={{ ...INPUT, fontFamily: 'var(--font-jetbrains-mono), monospace' }} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
          <FormulaPreview formula={value} />
        </div>
      )
    case 'ref-multi':
      return <div style={{ color: C.dim2, fontSize: 12 }}>（ref-multi 编辑控件待后续接入；当前只读展示）</div>
    default:
      return <input style={INPUT} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
  }
}
