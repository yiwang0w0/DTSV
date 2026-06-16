'use client'
import { useMemo, useState, Fragment } from 'react'
import { useContentCrud } from './useContentCrud'
import { FieldValue, FieldInput } from './fields'
import { resolveLabel, scanRowOrphans, scanAllOrphans } from './refIntegrity'
import { BTN, INPUT, LABEL, HINT, C, Spinner, Drawer, DeleteBtn } from '../_shared/ui'

/**
 * ContentEngine — schema 驱动的通用内容编辑引擎（01·后台内容编辑引擎主轴）。
 *   schema.readOnly ⇒ 只读浏览（列表+搜索+筛选+引用解析+断链标红）。
 *   否则 ⇒ 全 CRUD：+新增 / 编辑(Drawer 表单·含桥接材料清单) / 删除(二步确认)。
 * 复用 _shared/ui 与 usePlacementRules 的「主表 upsert + 桥接 delete→insert」范式；
 * 新增一种内容 = 写一份 schema，而非 copy 一个 400 行 tab。
 */

function makeEmpty(schema) {
  const pk = schema.pk || 'id'
  const d = { __isNew: true }
  for (const f of schema.fields) {
    if (f.name === pk) continue
    if (f.type === 'ingredient-list') d[f.name] = []
    else if (f.type === 'bool') d[f.name] = f.default ?? false
    else if (f.type === 'number') d[f.name] = f.default ?? (f.nullable ? null : 0)
    else d[f.name] = f.default ?? ''
  }
  return d
}

function validateDraft(schema, draft) {
  for (const f of schema.fields) {
    const v = draft[f.name]
    if (f.required && (v == null || v === '')) return `「${f.label}」必填`
    if (f.type === 'number' && v != null && v !== '') {
      const n = Number(v)
      if (f.min != null && n < f.min) return `「${f.label}」不能小于 ${f.min}`
      if (f.max != null && n > f.max) return `「${f.label}」不能大于 ${f.max}`
    }
    if (f.type === 'ingredient-list' && typeof f.validate === 'function') {
      const e = f.validate(Array.isArray(v) ? v : [])
      if (e) return e
    }
  }
  if (typeof schema.validate === 'function') {
    const e = schema.validate(draft)
    if (e) return e
  }
  return null
}

export default function ContentEngine({ schema, toast }) {
  const { rows, refs, loading, reload, save, remove } = useContentCrud(schema, toast)
  const [search, setSearch] = useState('')
  const [filterVals, setFilterVals] = useState({})
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)

  const readOnly = !!schema.readOnly
  const pk = schema.pk || 'id'
  const ref = (table, id) => resolveLabel(refs, table, id)

  const filtered = useMemo(() => {
    let out = rows
    const q = search.trim().toLowerCase()
    if (q && schema.searchFields?.length) {
      out = out.filter((r) => schema.searchFields.some((f) => String(r[f] ?? '').toLowerCase().includes(q)))
    }
    for (const flt of schema.filters || []) {
      const val = filterVals[flt.field]
      if (val && val !== 'all') out = out.filter((r) => String(r[flt.field]) === String(val))
    }
    return out
  }, [rows, search, filterVals, schema])

  const totalOrphans = useMemo(() => scanAllOrphans(rows, schema, refs).length, [rows, schema, refs])

  async function handleSave() {
    const err = validateDraft(schema, editing)
    if (err) { toast?.(err, 'error'); return }
    setSaving(true)
    const ok = await save(editing)
    setSaving(false)
    if (ok) setEditing(null)
  }

  if (loading) return <Spinner />

  return (
    <div>
      {/* 顶栏 */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <input placeholder={`搜索 ${schema.label}…`} value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...INPUT, width: 240 }} />
        {(schema.filters || []).map((flt) => (
          <div key={flt.field} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {(flt.options || []).map(([val, label]) => {
              const active = (filterVals[flt.field] || 'all') === String(val)
              return (
                <button key={val} onClick={() => setFilterVals((s) => ({ ...s, [flt.field]: val }))}
                  style={BTN(active ? C.accent : 'transparent', active ? '#fff' : C.dim, { padding: '5px 12px', fontWeight: 600, border: `1px solid ${active ? C.accent : C.border}` })}>{label}</button>
              )
            })}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={reload} style={BTN('transparent', C.dim, { border: `1px solid ${C.border}` })}>↻ 刷新</button>
        {readOnly
          ? <button disabled title="只读 schema" style={BTN(C.border2, C.dim2, { cursor: 'not-allowed' })}>只读预览</button>
          : <button onClick={() => setEditing(makeEmpty(schema))} style={BTN(C.accent, '#fff', {})}>+ 新增</button>}
      </div>

      <div style={{ ...HINT, marginBottom: 14 }}>
        {readOnly ? '🧪 引擎预览（只读）· ' : '🧪 内容引擎 · '}schema「{schema.key}」· 表 <code style={{ color: C.cyan }}>{schema.table}</code> ·
        {' '}{filtered.length}/{rows.length} 条 · 搜索/筛选/引用解析由 schema 自动派生
        {totalOrphans > 0 && <span style={{ color: C.red }}> · ⚠ 全表 {totalOrphans} 处引用失效</span>}
      </div>

      {/* 列表 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {filtered.map((row) => {
          const orphans = scanRowOrphans(row, schema, refs)
          return (
            <div key={row[pk]} style={{ background: C.bg1, border: `1px solid ${orphans.length ? C.red : C.border}`, borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                  {schema.summary ? schema.summary(row, { ref }) : row[schema.searchFields?.[0]] ?? row[pk]}
                </div>
                {!readOnly && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    <button onClick={() => setEditing({ ...row })} style={{ background: 'none', border: 'none', color: C.accent, cursor: 'pointer', fontSize: 13 }}>编辑</button>
                    <DeleteBtn onConfirm={() => remove(row)} />
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px', fontSize: 12 }}>
                {schema.fields.map((f) => (
                  <Fragment key={f.name}>
                    <div style={{ color: C.dim, whiteSpace: 'nowrap' }}>{f.label}</div>
                    <div style={{ color: C.text, wordBreak: 'break-word' }}><FieldValue field={f} row={row} refs={refs} /></div>
                  </Fragment>
                ))}
              </div>
              {orphans.length > 0 && <div style={{ marginTop: 8, fontSize: 11, color: C.red }}>⚠ {orphans.length} 个引用失效</div>}
            </div>
          )
        })}
        {filtered.length === 0 && <div style={{ color: C.dim, padding: 40, textAlign: 'center', gridColumn: '1/-1' }}>无匹配内容</div>}
      </div>

      {/* 编辑 Drawer */}
      {!readOnly && (
        <Drawer open={!!editing} onClose={() => setEditing(null)} title={editing?.__isNew ? `新增 ${schema.label}` : `编辑 ${schema.label}`}>
          {editing && (
            <div>
              {schema.fields.filter((f) => f.name !== pk).map((f) => (
                <div key={f.name} style={{ marginBottom: 14 }}>
                  <label style={LABEL}>{f.label}{f.required && <span style={{ color: C.red }}> *</span>}</label>
                  <FieldInput field={f} value={editing[f.name]} onChange={(v) => setEditing((e) => ({ ...e, [f.name]: v }))} refs={refs} />
                  {f.hint && <div style={HINT}>{f.hint}</div>}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 10, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border2}` }}>
                <button onClick={handleSave} disabled={saving} style={BTN(C.accent, '#fff', { opacity: saving ? 0.6 : 1 })}>{saving ? '保存中…' : '保存'}</button>
                <button onClick={() => setEditing(null)} style={BTN('transparent', C.dim, { border: `1px solid ${C.border}` })}>取消</button>
              </div>
            </div>
          )}
        </Drawer>
      )}
    </div>
  )
}
