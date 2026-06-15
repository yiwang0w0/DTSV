'use client'
import { useMemo, useState, Fragment } from 'react'
import { useContentCrud } from './useContentCrud'
import { FieldValue } from './fields'
import { resolveLabel, scanRowOrphans, scanAllOrphans } from './refIntegrity'
import { BTN, INPUT, C, HINT, Spinner } from '../_shared/ui'

/**
 * ContentEngine — schema 驱动的通用内容编辑引擎（01·后台内容编辑引擎主轴）。
 *
 * Phase A（本提交）：只读 —— 从一份纯数据 schema 自动派生「列表 + 搜索 + 筛选 + 引用解析展示
 *   + 断链标红」。零写库、零碰运行端。先用 item_pool 只读 schema 自测引擎骨架。
 * Phase C：接 useContentCrud 的 save/remove + fields 的可编辑控件 + Drawer 表单 + 桥接清单，
 *   让「新增/编辑」真正可填（届时 schema.readOnly 为 false 的类型出现「+ 新增 / 编辑」）。
 *
 * 复用 _shared/ui（BTN/INPUT/C/HINT/Spinner）与 usePlacementRules 的并行加载/缺表降级范式，
 * 不另起视觉体系。新增内容类型 = 写一份 schema，而非 copy 一个 400 行 tab。
 */
export default function ContentEngine({ schema, toast }) {
  const { rows, refs, loading, reload } = useContentCrud(schema, toast)
  const [search, setSearch] = useState('')
  const [filterVals, setFilterVals] = useState({})

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
  const pk = schema.pk || 'id'
  const ref = (table, id) => resolveLabel(refs, table, id)

  if (loading) return <Spinner />

  return (
    <div>
      {/* 顶栏：搜索 + 筛选 chips + 刷新 + 新增(Phase C) */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <input
          placeholder={`搜索 ${schema.label}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...INPUT, width: 240 }}
        />
        {(schema.filters || []).map((flt) => (
          <div key={flt.field} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {(flt.options || []).map(([val, label]) => {
              const active = (filterVals[flt.field] || 'all') === String(val)
              return (
                <button
                  key={val}
                  onClick={() => setFilterVals((s) => ({ ...s, [flt.field]: val }))}
                  style={BTN(active ? C.accent : 'transparent', active ? '#fff' : C.dim, {
                    padding: '5px 12px', fontWeight: 600, border: `1px solid ${active ? C.accent : C.border}`,
                  })}
                >{label}</button>
              )
            })}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={reload} style={BTN('transparent', C.dim, { border: `1px solid ${C.border}` })}>↻ 刷新</button>
        <button
          disabled
          title="新增 / 编辑将在 Phase C 接入（本期为只读引擎骨架）"
          style={BTN(C.border2, C.dim2, { cursor: 'not-allowed' })}
        >+ 新增（Phase C）</button>
      </div>

      <div style={{ ...HINT, marginBottom: 14 }}>
        🧪 内容引擎预览（只读）· schema「{schema.key}」· 表 <code style={{ color: C.cyan }}>{schema.table}</code> ·
        {' '}{filtered.length}/{rows.length} 条 · 搜索/筛选/引用解析全部由 schema 自动派生
        {totalOrphans > 0 && <span style={{ color: C.red }}> · ⚠ 全表 {totalOrphans} 处引用失效</span>}
      </div>

      {/* 列表卡片网格 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {filtered.map((row) => {
          const orphans = scanRowOrphans(row, schema, refs)
          return (
            <div
              key={row[pk]}
              style={{ background: C.bg1, border: `1px solid ${orphans.length ? C.red : C.border}`, borderRadius: 12, padding: 14 }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 10 }}>
                {schema.summary ? schema.summary(row, { ref }) : row[schema.searchFields?.[0]] ?? row[pk]}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px', fontSize: 12 }}>
                {schema.fields.map((f) => (
                  <Fragment key={f.name}>
                    <div style={{ color: C.dim, whiteSpace: 'nowrap' }}>{f.label}</div>
                    <div style={{ color: C.text, wordBreak: 'break-word' }}>
                      <FieldValue field={f} row={row} refs={refs} />
                    </div>
                  </Fragment>
                ))}
              </div>
              {orphans.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: C.red }}>⚠ {orphans.length} 个引用失效（ID 改名/删除后未同步）</div>
              )}
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div style={{ color: C.dim, padding: 40, textAlign: 'center', gridColumn: '1/-1' }}>无匹配内容</div>
        )}
      </div>
    </div>
  )
}
