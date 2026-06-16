'use client'
import { resolveLabel } from './refIntegrity'
import { C, INPUT, BTN, FormulaPreview } from '../_shared/ui'

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
  if (v == null || v === '') return <span style={{ color: C.dim2 }}>—</span>
  return <span>{String(v)}</span>
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
  switch (field.type) {
    case 'textarea':
      return <textarea style={{ ...INPUT, minHeight: 60, resize: 'vertical' }} rows={field.rows || 2} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
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
