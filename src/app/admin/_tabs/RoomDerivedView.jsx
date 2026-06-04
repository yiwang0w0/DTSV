'use client'
import { useState } from 'react'
import { INPUT, C } from '../_shared/ui'

/* 「② 按房只读派生」共享视图 — RoomItemsTab / NpcPlacementTab 逐字共用本整区（约 95 行）。
 * ─ 选一房 → 派生「这房作为候选的规则」，只读，引导去规则中心编辑（遍历本地 rules.__cands）。
 * ─ 两 tab 仅差：规则展示名（图标 + 颜色，道具/装备双形 vs NPC 单形）与单位词（件 / 只）。
 *   均经参数注入；其余布局/文案/行为与原两文件等价。
 *
 * 参数：
 *   rooms        房列表（含 room_id/label/region/enabled）
 *   rules        本地规则编辑态（含 __cands）
 *   ruleLabel(r) 规则纯文本展示名（用于 hits key 回退）
 *   unitWord     单位词（'件' / '只'），用于「{unit}数 [min, max]」
 *   renderName(rule, fontSize)  渲染卡内规则名 <span>（含图标 + 实体专属配色）
 */
export default function RoomDerivedView({ rooms, rules, ruleLabel, unitWord, renderName }) {
  const [roomSearch, setRoomSearch] = useState('')
  const [selectedRoomId, setSelectedRoomId] = useState(null)

  const filteredRooms = rooms.filter((r) =>
    !roomSearch
    || (r.label || '').includes(roomSearch)
    || (r.region || '').includes(roomSearch)
    || String(r.room_id).includes(roomSearch),
  )

  return (
    <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>按房查看（只读）</div>
      <div style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>
        选一房，看它作为候选出现在哪些规则里。此处只读，编辑请回上方规则中心。
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>
        {/* 选房区 */}
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
          <input
            placeholder="搜索房名 / 区域 / 房号..."
            value={roomSearch}
            onChange={(e) => setRoomSearch(e.target.value)}
            style={{ ...INPUT, marginBottom: 8 }}
          />
          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filteredRooms.map((r) => {
              const sel = r.room_id === selectedRoomId
              return (
                <button
                  key={r.room_id}
                  onClick={() => setSelectedRoomId(r.room_id)}
                  style={{
                    textAlign: 'left', padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${sel ? C.accent : C.border}`,
                    background: sel ? 'rgba(88,166,255,0.12)' : 'transparent',
                    color: sel ? C.accent : C.text,
                    opacity: r.enabled === false ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{r.label || `#${r.room_id}`}</span>
                  {r.region && <span style={{ fontSize: 9, color: C.dim }}>· {r.region}</span>}
                  <span style={{ fontSize: 9, color: C.dim, fontFamily: 'monospace', marginLeft: 'auto' }}>#{r.room_id}</span>
                </button>
              )
            })}
            {filteredRooms.length === 0 && (
              <div style={{ textAlign: 'center', padding: 24, color: C.dim, fontSize: 12 }}>没有匹配的房间</div>
            )}
          </div>
        </div>

        {/* 派生只读列 */}
        <div>
          {selectedRoomId == null ? (
            <div style={{ textAlign: 'center', padding: 60, color: C.dim }}>请选择房间查看其作为候选的规则</div>
          ) : (() => {
            const sr = rooms.find((r) => r.room_id === selectedRoomId)
            // 该房作为候选的规则（遍历本地 rules.__cands）
            const hits = rules
              .map((rule) => {
                const c = (rule.__cands || []).find((c) => Number(c.br_room_id) === Number(selectedRoomId))
                return c ? { rule, weight: c.weight } : null
              })
              .filter(Boolean)
            return (
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 10 }}>
                  {sr?.label || `#${selectedRoomId}`}
                  {sr?.region && <span style={{ fontSize: 11, color: C.dim, fontWeight: 400 }}>（{sr.region}）</span>}
                  <span style={{ fontSize: 11, color: C.dim, fontWeight: 400, fontFamily: 'monospace', marginLeft: 6 }}>· #{selectedRoomId}</span>
                </div>
                {hits.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: C.dim, fontSize: 12, background: C.bg2, border: `1px dashed ${C.border}`, borderRadius: 8 }}>
                    该房不在任何规则候选中
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {hits.map(({ rule, weight }) => (
                      <div key={rule.id ?? ruleLabel(rule)} style={{
                        background: C.bg2, border: `1px solid ${C.border}`,
                        borderLeft: `3px solid ${rule.enabled ? C.green : C.dim2}`,
                        borderRadius: 8, padding: '10px 12px',
                        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                      }}>
                        {renderName(rule, 13)}
                        <span style={{ fontSize: 11, color: C.dim }}>{unitWord}数 [{rule.count_min}, {rule.count_max}]</span>
                        <span style={{ fontSize: 11, color: C.accent }}>本房权重 {weight}</span>
                        <span style={{ fontSize: 11, color: C.dim }}>
                          {Number(rule.spawn_phase_min) > 0 ? `${rule.spawn_phase_min} 禁后` : '开局可见'}
                        </span>
                        {rule.exclusion_group && <span style={{ fontSize: 10, color: C.cyan, border: `1px solid ${C.cyan}40`, borderRadius: 5, padding: '1px 6px' }}>互斥 {rule.exclusion_group}</span>}
                        {!rule.enabled && <span style={{ fontSize: 10, color: C.dim2 }}>（已禁用）</span>}
                      </div>
                    ))}
                    <div style={{ fontSize: 10, color: C.dim2, marginTop: 2 }}>共 {hits.length} 条规则把本房列为候选 · 去上方规则中心编辑</div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
