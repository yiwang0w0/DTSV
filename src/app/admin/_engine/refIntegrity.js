/**
 * refIntegrity.js — 引用解析 + 断链扫描（纯函数·零 React·零 DB）
 *
 * 内容引擎(ContentEngine)的「引用完整性层」：所有跨内容引用走 ID(FK)，展示名靠运行期解析——
 * 展示名改了也不影响引用(杜绝 dts itemmix/card 的「改名即断链」名串匹配)。
 *
 * refs 形态(由 useContentCrud 构建)：{ [table]: { map: Map<id,row>, valueKey, labelKey } }
 */

/** 从 schema.fields 收集所有被引用的表(去重)。ref/ref-multi/ingredient-list 字段的 field.ref。 */
export function collectRefTables(schema) {
  const seen = new Map()
  for (const f of schema?.fields || []) {
    if ((f.type === 'ref' || f.type === 'ref-multi' || f.type === 'ingredient-list') && f.ref?.table) {
      if (!seen.has(f.ref.table)) {
        seen.set(f.ref.table, {
          table: f.ref.table,
          valueKey: f.ref.valueKey || 'id',
          labelKey: f.ref.labelKey || 'name',
        })
      }
    }
  }
  return Array.from(seen.values())
}

/** 从 schema.fields 收集「桥接表」字段(ingredient-list)：一对多子表(如配方→材料)。
 *  返回 [{ fieldName, table, parentKey, refColumn, itemFields, ref }]。 */
export function collectBridges(schema) {
  const out = []
  for (const f of schema?.fields || []) {
    if (f.type === 'ingredient-list' && f.bridge?.table) {
      out.push({
        fieldName: f.name,
        table: f.bridge.table,
        parentKey: f.bridge.parentKey,
        refColumn: f.bridge.refColumn,   // 桥接表里存「引用对象 id」的列名(如 item_id)
        itemFields: f.itemFields || [],  // 子行的附加字段(quantity/is_consumed…)
        ref: f.ref,
      })
    }
  }
  return out
}

/** 解析一个 id 在被引用表里的展示名；找不到(断链/孤儿)返回 null。 */
export function resolveLabel(refs, table, id) {
  const e = refs?.[table]
  if (!e || id == null) return null
  const row = e.map.get(id) ?? e.map.get(Number(id)) ?? e.map.get(String(id))
  return row ? row[e.labelKey] : null
}

/** 扫一行里所有 ref/ref-multi 字段的孤儿引用，返回 [{ field, id }]。 */
export function scanRowOrphans(row, schema, refs) {
  const bad = []
  for (const f of schema?.fields || []) {
    if (f.type === 'ref' && row[f.name] != null) {
      if (resolveLabel(refs, f.ref.table, row[f.name]) == null) bad.push({ field: f.name, id: row[f.name] })
    } else if (f.type === 'ref-multi' && Array.isArray(row[f.name])) {
      for (const id of row[f.name]) {
        if (resolveLabel(refs, f.ref.table, id) == null) bad.push({ field: f.name, id })
      }
    }
  }
  return bad
}

/** 全表孤儿扫描汇总：返回 [{ rowId, field, id }]。 */
export function scanAllOrphans(rows, schema, refs) {
  const out = []
  const pk = schema?.pk || 'id'
  for (const row of rows || []) {
    for (const o of scanRowOrphans(row, schema, refs)) out.push({ rowId: row[pk], ...o })
  }
  return out
}
