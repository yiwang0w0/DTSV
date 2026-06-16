'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { collectRefTables, collectBridges } from './refIntegrity'

/**
 * useContentCrud — 内容引擎的通用 CRUD hook（schema 驱动）。
 *
 * 从 usePlacementRules 的「并行加载 + 主表 upsert + 桥接表 delete-by-parent→批量 insert +
 * 缺表静默降级 + 友好 toast」范式泛化而来，驱动源改为 schema(纯数据)而非写死表名。
 *
 * - load：并行拉 主表 + 各被引用表(ref 解析) + 各桥接表(ingredient-list)，把桥接子行按
 *   parentKey 归并挂到每行 row[fieldName]。
 * - save(draft)：主表 insert/update + 每个桥接 delete(parentKey=id)→批量 insert（同 usePlacementRules）。
 * - remove(row)：主表 delete（桥接 ON DELETE CASCADE 自动清）。
 *
 * 直连 supabase(RLS 关·authenticated 全权·同 usePlacementRules:10 惯例)；缺表静默降级 + toast。
 */
// 主表 payload：仅真实列(排除桥接虚拟字段 + pk + __内部字段)，按 type 强转。模块级纯函数(非 hook 依赖)。
function buildMainPayload(schema, draft, pk) {
  const bridgeNames = new Set(collectBridges(schema).map((b) => b.fieldName))
  const payload = {}
  for (const f of schema.fields) {
    if (bridgeNames.has(f.name) || f.name === pk) continue
    let v = draft[f.name]
    if (f.type === 'number') {
      v = v === '' || v == null ? (f.nullable ? null : f.default ?? 0) : Number(v)
    } else if (f.type === 'bool') {
      v = !!v
    } else if ((f.type === 'text' || f.type === 'textarea' || f.type === 'formula') && v != null) {
      v = String(v)
      if (v === '' && f.nullable) v = null
    }
    payload[f.name] = v
  }
  return payload
}

export function useContentCrud(schema, toast) {
  const [rows, setRows] = useState([])
  const [refs, setRefs] = useState({})
  const [loading, setLoading] = useState(true)
  const pk = schema.pk || 'id'

  const load = useCallback(async () => {
    setLoading(true)
    const refTables = collectRefTables(schema)
    const bridges = collectBridges(schema)
    const results = await Promise.all([
      supabase.from(schema.table).select('*').order(pk),
      ...refTables.map((rt) => supabase.from(rt.table).select('*')),
      ...bridges.map((b) => supabase.from(b.table).select('*')),
    ])
    const main = results[0]
    const refRes = results.slice(1, 1 + refTables.length)
    const bridgeRes = results.slice(1 + refTables.length)

    const mainRows = main.data || []

    // 引用表 → id→row map（供 resolveLabel + ref 选择器）
    const refMap = {}
    refTables.forEach((rt, i) => {
      const m = new Map()
      for (const r of refRes[i]?.data || []) m.set(r[rt.valueKey], r)
      refMap[rt.table] = { map: m, valueKey: rt.valueKey, labelKey: rt.labelKey, list: refRes[i]?.data || [] }
    })
    setRefs(refMap)

    // 桥接子行按 parentKey 归并挂到主行 row[fieldName]
    bridges.forEach((b, i) => {
      const byParent = new Map()
      for (const br of bridgeRes[i]?.data || []) {
        const k = br[b.parentKey]
        if (!byParent.has(k)) byParent.set(k, [])
        byParent.get(k).push(br)
      }
      for (const row of mainRows) row[b.fieldName] = byParent.get(row[pk]) || []
    })
    setRows(mainRows)
    setLoading(false)

    if (main.error) {
      const msg = main.error.message || ''
      if (/does not exist|could not find the table|schema cache/i.test(msg)) {
        toast?.(`表「${schema.table}」尚未建（migration 未跑）`, 'error')
      } else {
        toast?.('加载失败: ' + msg, 'error')
      }
    }
  }, [schema, toast, pk])

  useEffect(() => { load() }, [load])

  const save = useCallback(async (draft) => {
    const bridges = collectBridges(schema)
    const isNew = draft.__isNew || draft[pk] == null
    let mainId = draft[pk]

    const payload = buildMainPayload(schema, draft, pk)
    if (isNew) {
      const { data, error } = await supabase.from(schema.table).insert(payload).select(pk).single()
      if (error) { toast?.('保存失败: ' + error.message, 'error'); return false }
      mainId = data[pk]
    } else {
      const { error } = await supabase.from(schema.table).update(payload).eq(pk, mainId)
      if (error) { toast?.('保存失败: ' + error.message, 'error'); return false }
    }

    // 桥接：先清后插（CASCADE 仅在删主行时触发；此处仅清本父的子行）
    for (const b of bridges) {
      const { error: delErr } = await supabase.from(b.table).delete().eq(b.parentKey, mainId)
      if (delErr) { toast?.('子项清理失败: ' + delErr.message, 'error'); return false }
      const list = Array.isArray(draft[b.fieldName]) ? draft[b.fieldName] : []
      const childRows = list
        .map((it) => {
          const r = { [b.parentKey]: mainId, [b.refColumn]: it[b.refColumn] }
          for (const itf of b.itemFields) {
            let v = it[itf.name]
            if (itf.type === 'number') v = Number(v ?? itf.default ?? 1)
            else if (itf.type === 'bool') v = !!v
            r[itf.name] = v
          }
          return r
        })
        .filter((r) => r[b.refColumn] != null)
      if (childRows.length > 0) {
        const { error: insErr } = await supabase.from(b.table).insert(childRows)
        if (insErr) { toast?.('子项写入失败: ' + insErr.message, 'error'); return false }
      }
    }

    toast?.(isNew ? '已添加' : '已更新')
    await load()
    return true
  }, [schema, toast, pk, load])

  const remove = useCallback(async (row) => {
    if (row.__isNew || row[pk] == null) return true
    const { error } = await supabase.from(schema.table).delete().eq(pk, row[pk])
    if (error) { toast?.('删除失败: ' + error.message, 'error'); return false }
    toast?.('已删除')
    await load()
    return true
  }, [schema, toast, pk, load])

  return { rows, refs, loading, reload: load, save, remove }
}
