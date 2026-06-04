'use client'
import { BTN, INPUT, LABEL, C, NPC_LEVEL_META } from '../_shared/ui'
import CandidateRoomPicker from './CandidateRoomPicker'
import RoomDerivedView from './RoomDerivedView'
import { usePlacementRules } from './usePlacementRules'
import { supabase } from '@/lib/supabase'

/* Phase 38 敌人投放 tab —「NPC 为中心 · 全图分布」模型（克隆自 RoomItemsTab）
 * ─ 与房间投放(placement_rules)平行范式，但实体为 NPC 单形（无 item/equipment 双形）。
 * ─ 模型：一条规则 = 一个敌人(npc_pool) + 一组候选房（带权）+ 全图投放只数 [count_min, count_max]。
 *   分配在服务端 initBrRoomLayer 用确定性 PRNG(allocateRoomNpcs · hashSeed(seed,'npcplace:'+rule.id))
 *   从候选里加权无放回抽样 → gamevars.br.roomNpcs 快照（每房 [[npcId,revealPhase],…]）。
 * ─ 本 tab 两区：
 *   ① 规则中心（主）：列 npc_placement_rules，每条一卡 — 敌人按名 + 候选房多选(权重) +
 *      数量[min,max] + 几禁(越晚越肥) + 互斥组 + 启用 + 保存/删（候选不足黄字警告）。
 *   ② 按房只读派生（次）：选一房 → 派生「这房作为候选的规则」，只读，引导去规则中心编辑。
 * ─ CRUD + 候选同步逻辑与 ②区 复用共享件（usePlacementRules / RoomDerivedView，与 RoomItemsTab 共用）。
 *   直连 supabase CRUD（RLS 关·authenticated 全权）。写库严格符合 phase-38 CHECK：
 *   npc_id NOT NULL · count_min<=count_max · max_per_room>=1 ·
 *   spawn_phase_min>=0 · npc_placement_rule_rooms.weight>0。
 * ─ npc_pool 只读（仅选 npc_id，绝不 UPDATE）。
 * ─ 不碰 server/SQL/RoomItemsTab；CandidateRoomPicker 复用（NPC 候选房与道具完全一致）；page.js tab 已注册。
 */

const MAX_PHASE = 5        // = MAX_CLOSE_PHASE（src/lib/server/br/forbidden.js）；spawn_phase_min 下拉 0..5

// 一条规则在本地编辑态的空壳（__cands = [{br_room_id, weight}] 候选；__isNew 标未落库）
function emptyRule(npcPool) {
  return {
    id: null, __isNew: true, __dirty: true,
    npc_id: npcPool[0]?.id ?? null,
    count_min: 1, count_max: 1, max_per_room: 1,
    spawn_phase_min: 0,
    exclusion_group: null,
    enabled: true,
    notes: null,
    __cands: [],
  }
}

export default function NpcPlacementTab({ toast }) {
  const {
    rooms, rules, extra, loading,
    confirmDelId, setConfirmDelId,
    groupSuggestions,
    patchRule, addRule, saveRule, removeRule,
  } = usePlacementRules({
    toast,
    tableName: 'npc_placement_rules',
    candTableName: 'npc_placement_rule_rooms',
    loadExtra: [
      { key: 'npcPool', query: () => supabase.from('npc_pool').select('id,name,level,hp,atk,def').order('id') },
    ],
    makeEmptyRule: () => emptyRule(extra.npcPool || []),
    validate: (r) => (r.npc_id == null ? '请选择敌人' : null),
    buildPayload: (r) => ({ npc_id: Number(r.npc_id) }),
    missingTableMsg: '敌人投放规则表尚未建立（请先跑 phase-38 migration）',
    missingTableRe: /relation .* does not exist|npc_placement/i,
    loadFailMsg: '加载敌人投放规则失败: ',
  })

  const npcPool = extra.npcPool || []

  // 规则展示名（NPC 名）
  function ruleLabel(r) {
    return npcPool.find((n) => n.id === Number(r.npc_id))?.name ?? '（未选敌人）'
  }

  // 卡内规则名 <span>（NPC 单形 · 固定文本色）；规则中心卡头与 ②区只读派生共用
  function renderRuleName(r, fontSize) {
    return (
      <span style={{ fontSize, fontWeight: 700, color: C.text }}>
        👹 {ruleLabel(r)}
      </span>
    )
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.dim }}>加载中...</div>

  return (
    <div>
      {/* ── 标题区 ── */}
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: C.text }}>👹 敌人投放</h3>
        <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.6 }}>
          NPC 为中心 · 全图分布。每条规则 = 一个敌人 + 一组候选房（带权）+ 全图投放只数 [下界, 上界]。
          开局确定性分配（同对局 seed → 同结果），从候选里加权无放回抽样。互斥组保证同组敌人落到不同房。
        </div>
      </div>

      {/* ══════ ① 规则中心（主区）══════ */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>规则中心 <span style={{ fontSize: 11, color: C.dim, fontWeight: 400 }}>· {rules.length} 条</span></div>
        <button onClick={addRule} style={BTN('#58a6ff', '#fff')}>+ 新增规则</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rules.map((r, idx) => {
          const confKey = r.id ?? `new-${idx}`
          const isConf = confirmDelId === confKey
          // 欠铺警告：count_min > 有效候选数（weight>0）
          const validCandCount = (r.__cands || []).filter((c) => Number(c.weight) > 0).length
          const under = Math.max(0, Math.floor(Number(r.count_min) || 0)) > validCandCount
          return (
            <div
              key={confKey}
              style={{
                background: C.bg2, borderRadius: 10,
                border: `1px solid ${C.border}`,
                borderLeft: `3px solid ${r.__dirty ? C.yellow : (r.enabled ? C.green : C.dim2)}`,
                padding: 14,
              }}
            >
              {/* 卡头：展示名 + 启用 + 操作 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                {renderRuleName(r, 14)}
                {r.__isNew && <span style={{ fontSize: 10, color: C.yellow, border: `1px solid ${C.yellow}`, borderRadius: 5, padding: '1px 6px' }}>未保存</span>}
                {!r.enabled && <span style={{ fontSize: 10, color: C.dim2, border: `1px solid ${C.dim2}`, borderRadius: 5, padding: '1px 6px' }}>已禁用</span>}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.dim, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!r.enabled} onChange={(e) => patchRule(idx, { enabled: e.target.checked })} />
                    启用
                  </label>
                  <button onClick={() => saveRule(idx)} style={BTN('#58a6ff', '#fff', { fontSize: 11, padding: '6px 14px' })}>保存</button>
                  {isConf ? (
                    <>
                      <button onClick={() => removeRule(idx)} style={BTN('rgba(248,81,73,0.15)', '#f85149', { fontSize: 11, padding: '6px 10px', border: '1px solid rgba(248,81,73,0.3)' })}>确认</button>
                      <button onClick={() => setConfirmDelId(null)} style={BTN('transparent', '#8b949e', { fontSize: 11, padding: '6px 10px', border: '1px solid #30363d' })}>取消</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDelId(confKey)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.dim2, fontSize: 15, padding: '2px 4px' }}>🗑️</button>
                  )}
                </div>
              </div>

              {/* 配置行：敌人 / 数量 / 几禁 / 互斥组 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10, marginBottom: 12 }}>
                {/* 敌人（单形 · 按名）*/}
                <div style={{ flex: 1, minWidth: 240 }}>
                  <label style={{ ...LABEL, marginBottom: 3 }}>敌人</label>
                  <select
                    style={{ ...INPUT, padding: '6px 8px' }}
                    value={r.npc_id ?? ''}
                    onChange={(e) => patchRule(idx, { npc_id: Number(e.target.value) })}
                  >
                    {r.npc_id == null && <option value="">— 选择敌人 —</option>}
                    {npcPool.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}（{NPC_LEVEL_META[n.level]?.label ?? n.level}·HP{n.hp}/ATK{n.atk}/DEF{n.def}）
                      </option>
                    ))}
                  </select>
                </div>

                {/* 全图只数 min–max */}
                <div>
                  <label style={{ ...LABEL, marginBottom: 3 }}>全图只数<span style={{ color: C.dim2, marginLeft: 3 }}>[下界, 上界]</span></label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="number" min={0}
                      style={{ ...INPUT, width: 56, padding: '6px 8px' }}
                      value={r.count_min}
                      onChange={(e) => patchRule(idx, { count_min: Number(e.target.value) })}
                    />
                    <span style={{ color: C.dim, fontSize: 12 }}>–</span>
                    <input
                      type="number" min={0}
                      style={{ ...INPUT, width: 56, padding: '6px 8px' }}
                      value={r.count_max}
                      onChange={(e) => patchRule(idx, { count_max: Number(e.target.value) })}
                    />
                  </div>
                </div>

                {/* 几禁 */}
                <div>
                  <label style={{ ...LABEL, marginBottom: 3 }}>几禁<span style={{ color: C.dim2, marginLeft: 3 }}>越晚越肥</span></label>
                  <select
                    style={{ ...INPUT, width: 120, padding: '6px 8px' }}
                    value={r.spawn_phase_min ?? 0}
                    onChange={(e) => patchRule(idx, { spawn_phase_min: Number(e.target.value) })}
                  >
                    {Array.from({ length: MAX_PHASE + 1 }).map((_, p) => (
                      <option key={p} value={p}>{p === 0 ? '0（开局可见）' : `${p} 禁后`}</option>
                    ))}
                  </select>
                </div>

                {/* 互斥组 */}
                <div>
                  <label style={{ ...LABEL, marginBottom: 3 }}>互斥组<span style={{ color: C.dim2, marginLeft: 3 }}>空=不互斥</span></label>
                  <input
                    list="npc-placement-excl-groups"
                    style={{ ...INPUT, width: 140, padding: '6px 8px' }}
                    value={r.exclusion_group ?? ''}
                    onChange={(e) => patchRule(idx, { exclusion_group: e.target.value })}
                    placeholder="如 boss-core"
                  />
                </div>
              </div>

              {/* 欠铺警告 */}
              {under && (
                <div style={{
                  fontSize: 11, color: C.yellow, marginBottom: 10,
                  background: 'rgba(210,153,34,0.08)', border: `1px solid ${C.yellow}40`,
                  borderRadius: 6, padding: '6px 10px',
                }}>
                  ⚠ 候选不足：当前有效候选 {validCandCount} 房，最多铺 {validCandCount} 只 / 需 {Math.floor(Number(r.count_min) || 0)} 只（下界）。请增加候选房或调低只数。
                </div>
              )}

              {/* 候选房多选 + 权重 */}
              <div>
                <label style={{ ...LABEL, marginBottom: 6 }}>候选房（点格子或列表加入 · 每房可设权重）</label>
                <CandidateRoomPicker
                  rooms={rooms}
                  value={r.__cands || []}
                  onChange={(next) => patchRule(idx, { __cands: next })}
                />
              </div>
            </div>
          )
        })}

        {rules.length === 0 && (
          <div style={{ textAlign: 'center', padding: 36, color: C.dim, fontSize: 12, background: C.bg2, border: `1px dashed ${C.border}`, borderRadius: 10 }}>
            还没有敌人投放规则，点击「+ 新增规则」开始
          </div>
        )}
      </div>

      <datalist id="npc-placement-excl-groups">
        {groupSuggestions.map((g) => <option key={g} value={g} />)}
      </datalist>

      {/* ══════ ② 按房只读派生（次区）══════ */}
      <RoomDerivedView
        rooms={rooms}
        rules={rules}
        ruleLabel={ruleLabel}
        unitWord="只"
        renderName={renderRuleName}
      />
    </div>
  )
}
