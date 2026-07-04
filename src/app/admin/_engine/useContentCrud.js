'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { collectRefTables, collectBridges } from './refIntegrity'
import { postGameApi } from '@/lib/gameApi'

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
 * 读(load)：直连 supabase anon（内容表公开读·RLS 收紧后仍可读）。
 * 写(save/remove)：改走服务端 /api/admin/content（service_role · phase-51 起写仅 service_role）。缺表静默降级 + toast。
 */
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
    const isNew = draft.__isNew || draft[pk] == null
    // 写路径服务端化（service_role）：主表 upsert + 桥接 delete→insert 全在 /api/admin/content 内完成。
    try {
      await postGameApi('/api/admin/content', { table: schema.table, op: 'save', draft })
    } catch (e) {
      toast?.('保存失败: ' + (e.message || ''), 'error')
      return false
    }
    toast?.(isNew ? '已添加' : '已更新')
    await load()
    return true
  }, [schema, toast, pk, load])

  const remove = useCallback(async (row) => {
    if (row.__isNew || row[pk] == null) return true
    try {
      await postGameApi('/api/admin/content', { table: schema.table, op: 'remove', row })
    } catch (e) {
      toast?.('删除失败: ' + (e.message || ''), 'error')
      return false
    }
    toast?.('已删除')
    await load()
    return true
  }, [schema, toast, pk, load])

  return { rows, refs, loading, reload: load, save, remove }
}
