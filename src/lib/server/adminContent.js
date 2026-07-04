/**
 * adminContent.js — 内容引擎(ContentEngine)写路径的服务端实现（service_role · 仅管理员）。
 *
 * 背景（🔒 安全性轨 · phase-51 RLS 收紧联动）：内容表 RLS 收紧后写仅 service_role，
 *   原 useContentCrud 用浏览器 anon client 直写会被挡 → 保存/删除改经 /api/admin/content 走服务端。
 * 本模块把 useContentCrud 的「主表 upsert + 桥接 delete-by-parent → 批量 insert」纯逻辑搬到服务端，
 *   用传入的 service_role client 执行；schema 来自服务端可信副本（允许清单），绝不信任客户端传来的表名。
 *
 * 安全不变量：
 *   - 只写「允许清单 CONTENT_SCHEMAS」里的表（拒绝任意表名注入）。
 *   - 主表 payload 仅取 schema.fields 声明的列（buildMainPayload），桥接子行仅取声明的 itemFields。
 *   - 保存前服务端再校验一次（validateContent，防绕过前端）。
 */
import itemRecipe from '@/app/admin/_engine/schemas/itemRecipe'
import itemTag from '@/app/admin/_engine/schemas/itemTag'
import { collectBridges } from '@/app/admin/_engine/refIntegrity'

// 允许清单：key = 表名（客户端只能指定这些表；未知表名一律拒绝）。
export const CONTENT_SCHEMAS = {
  [itemRecipe.table]: itemRecipe, // item_recipes (+ 桥接 item_recipe_ingredients)
  [itemTag.table]: itemTag,       // item_tags
}

// 主表 payload：仅真实列(排除桥接虚拟字段 + pk + __内部字段)，按 type 强转。
// —— 与原 useContentCrud.buildMainPayload 逐字等价（迁到服务端）。
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

/** 服务端保存前校验（镜像 ContentEngine.validateDraft，防绕过前端校验）。返回错误字符串或 null。 */
export function validateContent(schema, draft) {
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

/** 主表 insert/update + 每个桥接 delete(parentKey=id) → 批量 insert（与原 useContentCrud.save 逐值等价）。 */
export async function saveContent(client, schema, draft) {
  const pk = schema.pk || 'id'
  const bridges = collectBridges(schema)
  const isNew = draft.__isNew || draft[pk] == null
  let mainId = draft[pk]

  const payload = buildMainPayload(schema, draft, pk)
  if (isNew) {
    const { data, error } = await client.from(schema.table).insert(payload).select(pk).single()
    if (error) throw new Error(error.message)
    mainId = data[pk]
  } else {
    const { error } = await client.from(schema.table).update(payload).eq(pk, mainId)
    if (error) throw new Error(error.message)
  }

  for (const b of bridges) {
    const { error: delErr } = await client.from(b.table).delete().eq(b.parentKey, mainId)
    if (delErr) throw new Error(delErr.message)
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
      const { error: insErr } = await client.from(b.table).insert(childRows)
      if (insErr) throw new Error(insErr.message)
    }
  }

  return { ok: true, id: mainId }
}

/** 主表 delete（桥接 ON DELETE CASCADE 自动清）。 */
export async function removeContent(client, schema, row) {
  const pk = schema.pk || 'id'
  if (!row || row.__isNew || row[pk] == null) return { ok: true }
  const { error } = await client.from(schema.table).delete().eq(pk, row[pk])
  if (error) throw new Error(error.message)
  return { ok: true }
}
