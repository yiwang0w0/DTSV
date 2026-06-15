'use client'
import { resolveLabel } from './refIntegrity'
import { C } from '../_shared/ui'

/**
 * fields.jsx — 字段渲染器。
 * Phase A：只读展示渲染器 <FieldValue>（type → 展示）。
 * Phase C 在此追加可编辑控件 <FieldInput>（text/number/select/bool/ref/ref-multi/ingredient-list/formula）。
 */

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

  if (v == null || v === '') return <span style={{ color: C.dim2 }}>—</span>
  return <span>{String(v)}</span>
}
