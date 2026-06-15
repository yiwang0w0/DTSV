'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { collectRefTables } from './refIntegrity'

/**
 * useContentCrud — 内容引擎的通用「读」hook（Phase A：load + 引用表解析）。
 *
 * 由 usePlacementRules 的「并行加载 + 缺表静默降级 + 友好 toast」范式泛化而来，
 * 但驱动源是 schema(纯数据声明)而非写死的表名。Phase A 只读；写(save/remove + 桥接
 * delete→insert)在 Phase C 接入(同样从 usePlacementRules 的 saveRule 范式泛化)。
 *
 * 直连 supabase(RLS 关·authenticated 全权·同 usePlacementRules:10 惯例)；缺表(migration
 * 未跑)静默降级 + toast，不崩 UI。
 *
 * @returns { rows, refs, loading, reload }
 *   refs: { [table]: { map: Map<id,row>, valueKey, labelKey } } — 供 resolveLabel 解析展示名
 */
export function useContentCrud(schema, toast) {
  const [rows, setRows] = useState([])
  const [refs, setRefs] = useState({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const refTables = collectRefTables(schema)
    const [main, ...refRes] = await Promise.all([
      supabase.from(schema.table).select('*').order(schema.pk || 'id'),
      ...refTables.map((rt) => supabase.from(rt.table).select('*')),
    ])
    setRows(main.data || [])

    const refMap = {}
    refTables.forEach((rt, i) => {
      const m = new Map()
      for (const r of refRes[i]?.data || []) m.set(r[rt.valueKey], r)
      refMap[rt.table] = { map: m, valueKey: rt.valueKey, labelKey: rt.labelKey }
    })
    setRefs(refMap)
    setLoading(false)

    if (main.error) {
      const msg = main.error.message || ''
      if (/does not exist|could not find the table|schema cache/i.test(msg)) {
        toast?.(`表「${schema.table}」尚未建（migration 未跑）`, 'error')
      } else {
        toast?.('加载失败: ' + msg, 'error')
      }
    }
  }, [schema, toast])

  useEffect(() => { load() }, [load])

  return { rows, refs, loading, reload: load }
}
