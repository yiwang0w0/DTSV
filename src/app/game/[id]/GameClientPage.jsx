'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../../layout'
import { MAP_LIST } from '@/lib/constants'
import { loadBuffPool } from '@/lib/gameEngine'
import { calcEquippedStats, RARITY_META } from '@/lib/equipmentEngine'
import { normalizeGamevars } from '@/lib/roomState'
import { postGameApi } from '@/lib/gameApi'
import { useToast } from '../../admin/_shared/ui'
import CraftModal from './CraftModal'
import LootModal from './LootModal'
import {
  Btn,
  BuffTag,
  HpBar,
  LogLine,
  PanelTitle,
  SLOTS,
  T,
  WEATHER,
  hpColor,
} from './gameUi'

function buildPlayerView(player, equippedInstances) {
  if (!player) return null
  const equippedStats = calcEquippedStats(equippedInstances || [])
  const maxHp = (player.maxHp || 100) + (equippedStats.totalHp || 0)

  return {
    ...player,
    hp: Math.min(player.hp || 0, maxHp),
    maxHp,
    atk: (player.atk || 0) + equippedStats.totalAtk,
    def: (player.def || 0) + equippedStats.totalDef,
  }
}

export default function GameClientPage() {
  const { id: roomId } = useParams()
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const { show: toast, Container: ToastContainer } = useToast()

  const [room, setRoom] = useState(null)
  const [gamevars, setGamevars] = useState(null)
  const [mapConfig, setMapConfig] = useState(null)
  const [allItems, setAllItems] = useState([])
  const [buffPool, setBuffPool] = useState([])
  const [equipments, setEquipments] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [panel, setPanel] = useState('log')
  const [craftOpen, setCraftOpen] = useState(false)

  const mapIdRef = useRef(0)

  const loadMapData = useCallback(async (mapId) => {
    const [{ data: nextMap }, { data: nextAllItems }] = await Promise.all([
      supabase.from('map_config').select('*').eq('map_id', mapId).single(),
      supabase.from('item_pool').select('*'),
    ])

    setMapConfig(nextMap || null)
    setAllItems(nextAllItems || [])
  }, [])

  const loadEquipments = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('equipment_instances')
      .select('*, tier:equipment_tiers(*, passive:passive_skills(*), series:equipment_series(slot,name))')
      .eq('owner_id', user.id)
      .eq('room_id', roomId)
      .order('acquired_at', { ascending: false })

    setEquipments(data || [])
  }, [roomId, user])

  const hydrateRoom = useCallback(async (nextRoom, { refreshEquipment = false } = {}) => {
    const normalized = normalizeGamevars(nextRoom.gamevars || {})
    setRoom(nextRoom)
    setGamevars(normalized)

    const nextMapId = normalized.players?.[user?.id]?.map ?? 0
    if (mapIdRef.current !== nextMapId) {
      mapIdRef.current = nextMapId
    }
    await loadMapData(nextMapId)
    if (refreshEquipment) {
      await loadEquipments()
    }
  }, [loadEquipments, loadMapData, user?.id])

  const loadInitial = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }
    setLoading(true)

    const [{ data: roomData }, buffs] = await Promise.all([
      supabase.from('rooms').select('*').eq('id', roomId).single(),
      loadBuffPool(),
    ])

    if (!roomData) {
      router.replace('/rooms')
      setLoading(false)
      return
    }

    setBuffPool(buffs || [])
    await hydrateRoom(roomData, { refreshEquipment: true })
    setLoading(false)
  }, [hydrateRoom, roomId, router, user])

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  useEffect(() => {
    if (!user) return undefined
    const channel = supabase
      .channel(`room-${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, payload => {
        const nextRoom = payload.new
        const normalized = normalizeGamevars(nextRoom.gamevars || {})
        setRoom(nextRoom)
        setGamevars(normalized)

        const nextMapId = normalized.players?.[user.id]?.map ?? 0
        if (mapIdRef.current !== nextMapId) {
          mapIdRef.current = nextMapId
          loadMapData(nextMapId)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadMapData, roomId, user])

  const meBase = useMemo(() => gamevars?.players?.[user?.id] || null, [gamevars, user?.id])
  const equipped = useMemo(() => equipments.filter(item => item.is_equipped), [equipments])
  const bagEquipments = useMemo(() => equipments.filter(item => !item.is_equipped), [equipments])
  const me = useMemo(() => buildPlayerView(meBase, equipped), [equipped, meBase])
  const lootPrompt = meBase?.lootPrompt || null
  const logs = useMemo(() => (gamevars?.log || []).slice().reverse(), [gamevars?.log])
  const allPlayers = useMemo(() => Object.values(gamevars?.players || {}), [gamevars?.players])
  const eqMap = useMemo(
    () => Object.fromEntries(equipped.map(item => [item.equipped_slot || item.tier?.series?.slot, item]).filter(([slot]) => slot)),
    [equipped],
  )
  const invCount = useMemo(() => {
    const counts = {}
    for (const name of me?.inventory || []) {
      counts[name] = (counts[name] || 0) + 1
    }
    return counts
  }, [me?.inventory])
  const battle = meBase?.battle || null
  const inGame = !!meBase
  const weather = WEATHER[mapConfig?.weather || 'clear'] || WEATHER.clear
  const aliveCount = room?.alivenum ?? allPlayers.filter(player => player.alive).length
  const currentMapCorpseCount = useMemo(
    () => (gamevars?.corpses || []).filter(corpse => corpse.mapId === (meBase?.map ?? 0)).length,
    [gamevars?.corpses, meBase?.map],
  )
  const pvpTargets = useMemo(
    () => allPlayers.filter(player => (player.id || player.uid) !== user?.id && player.alive && (player.map ?? 0) === (meBase?.map ?? 0)),
    [allPlayers, meBase?.map, user?.id],
  )

  async function handleTakeLoot(option) {
    const nextRoom = await runGameAction('lootCorpse', {
      corpseId: lootPrompt?.corpseId,
      entryId: option.id,
    }, { refreshEquipment: true })

    if (nextRoom) {
      toast(`已带走 ${option.name}`, 'success')
    }
  }

  async function handleDismissLootPrompt() {
    await runGameAction('dismissLootPrompt')
  }

  async function runGameAction(action, payload = {}, options = {}) {
    setBusy(true)
    try {
      const { room: nextRoom } = await postGameApi('/api/game/actions', {
        roomId: Number(roomId),
        action,
        ...payload,
      })
      await hydrateRoom(nextRoom, options)
      return nextRoom
    } catch (error) {
      toast(error.message, 'error')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function runEquipmentAction(action, payload = {}) {
    setBusy(true)
    try {
      const result = await postGameApi('/api/game/equipment', {
        roomId: Number(roomId),
        action,
        ...payload,
      })
      await hydrateRoom(result.room, { refreshEquipment: true })
      return result
    } catch (error) {
      toast(error.message, 'error')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function handleCraft(resultTierId) {
    const result = await runEquipmentAction('craft', { resultTierId })
    if (!result) return { success: false }
    toast(result.success ? '合成成功' : '合成失败', result.success ? 'success' : 'error')
    return result
  }

  if (authLoading || loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: T.bg0, color: T.dim, flexDirection: 'column', gap: 14 }}>
        <div style={{ width: 32, height: 32, border: `3px solid ${T.border}`, borderTopColor: T.cyan, borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <span style={{ fontFamily: 'monospace', letterSpacing: 2, fontSize: 12 }}>LOADING...</span>
      </div>
    )
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg0, color: T.text }}>
        请先登录后再进入游戏页面。
      </div>
    )
  }

  if (!room) return null

  return (
    <div style={{ height: '100vh', background: T.bg0, color: T.text, display: 'flex', flexDirection: 'column', fontFamily: '"Noto Sans SC", system-ui, sans-serif', fontSize: 13, overflow: 'hidden' }}>
      <ToastContainer />
      <CraftModal
        open={craftOpen}
        onClose={() => setCraftOpen(false)}
        player={meBase}
        equipments={equipments}
        onCraft={handleCraft}
      />
      <LootModal
        open={!!lootPrompt}
        prompt={lootPrompt}
        busy={busy}
        onClose={handleDismissLootPrompt}
        onTake={handleTakeLoot}
      />

      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:${T.bg0}}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:2px}
        .hov:hover:not(:disabled){filter:brightness(1.15)}
        select,input{outline:none;font-family:inherit}
      `}</style>

      <div style={{ background: `linear-gradient(90deg,${T.bg2} 0%,${T.bg3} 50%,${T.bg2} 100%)`, borderBottom: `1px solid ${T.borderB}`, padding: '0 20px', height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: T.cyan, letterSpacing: 3, textShadow: `0 0 20px ${T.cyan}80` }}>DTS 大逃杀</div>
        <div style={{ display: 'flex', gap: 20, fontSize: 12, color: T.dim, alignItems: 'center' }}>
          <span>{mapConfig?.name || '未知区域'}</span>
          <span>{weather.icon} {weather.label}{weather.mod ? <span style={{ color: T.yellow, marginLeft: 4, fontSize: 10 }}>({weather.mod})</span> : null}</span>
          <span>{new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          <span style={{ color: room.gamestate === 2 ? T.yellow : T.red, fontWeight: 700 }}>
            {room.gamestate === 2 ? `胜者：${room.winner || '无人'}`
              : `剩余 ${aliveCount} 人`}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '300px 1fr 300px', overflow: 'hidden' }}>
        <div style={{ borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bg1 }}>
          <PanelTitle>👤 {me ? me.name : '未加入'}</PanelTitle>
          <div style={{ padding: '10px 12px', flex: 1, overflowY: 'auto' }}>
            {me ? (
              <>
                <HpBar hp={me.hp || 0} max={me.maxHp || 100} h={8} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11 }}>
                  <span style={{ color: hpColor(me.hp, me.maxHp), fontFamily: 'monospace', fontWeight: 700 }}>{me.hp}</span>
                  <span style={{ color: T.dim }}>{me.maxHp}</span>
                </div>
                <div style={{ marginTop: 6, display: 'flex', gap: 12, fontSize: 11 }}>
                  <span style={{ color: T.orange }}>ATK {me.atk}</span>
                  <span style={{ color: T.cyan }}>DEF {me.def}</span>
                  <span style={{ color: T.yellow }}>击杀 {me.kills || 0}</span>
                </div>
                {(me.buffs || []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                    {me.buffs.map((buff, index) => (
                      <BuffTag key={`${buff.buffId}-${index}`} buffDef={buffPool.find(item => item.id === buff.buffId)} remaining={buff.remainingTurns} />
                    ))}
                  </div>
                )}
                {!me.alive && <div style={{ marginTop: 8, textAlign: 'center', color: T.red, fontSize: 12 }}>你已阵亡，目前只能观战</div>}
              </>
            ) : (
              <div style={{ textAlign: 'center', color: T.dim, fontSize: 12, padding: '12px 0' }}>加入游戏后会显示你的状态</div>
            )}
          </div>

          <PanelTitle right={<span style={{ fontSize: 10, color: T.dim, fontWeight: 400 }}>同地图可攻击</span>}>⚔️ PvP</PanelTitle>
          <div style={{ padding: '10px 12px', maxHeight: 220, overflowY: 'auto' }}>
            {pvpTargets.length === 0 ? (
              <div style={{ color: T.dim, fontSize: 12 }}>当前地图没有可攻击玩家</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pvpTargets.map(target => (
                  <div key={target.id || target.uid} style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{target.name}</div>
                        <div style={{ fontSize: 11, color: T.dim, marginTop: 3 }}>
                          HP {target.hp}/{target.maxHp || 100} · 击杀 {target.kills || 0}
                        </div>
                      </div>
                      <Btn variant="danger" size="sm" disabled={busy || !me?.alive || room.gamestate === 2 || !!battle} onClick={() => runGameAction('attackPlayer', { targetUid: target.id || target.uid })}>
                        攻击
                      </Btn>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.border}`, background: T.bg1, flexShrink: 0 }}>
            {currentMapCorpseCount > 0 && (
              <div style={{ textAlign: 'center', color: T.dimB, fontSize: 11, marginBottom: 10 }}>
                当前地图有 {currentMapCorpseCount} 具尸体，搜索时可能发现可搜刮目标
              </div>
            )}
            {battle ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: T.red }}>⚔️ 战斗中：{battle.npc.name}</span>
                  <span style={{ fontSize: 11, color: T.dim }}>第 {battle.turn} 回合</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: T.dimB, marginBottom: 3 }}>{me?.name}</div>
                    <HpBar hp={me?.hp || 0} max={me?.maxHp || 100} />
                    <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>ATK {me?.atk} · DEF {me?.def}</div>
                  </div>
                  <div style={{ fontSize: 18, color: T.dim }}>VS</div>
                  <div>
                    <div style={{ fontSize: 11, color: T.dimB, marginBottom: 3 }}>{battle.npc.name}</div>
                    <HpBar hp={battle.npcHp} max={battle.npcMaxHp} />
                    <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>ATK {battle.npc.atk} · DEF {battle.npc.def}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn variant="danger" sx={{ flex: 2, padding: '10px 0', fontSize: 14, fontWeight: 700 }} onClick={() => runGameAction('attackNpc')} disabled={busy || room.gamestate === 2}>
                    {busy ? '攻击中...' : '攻击 NPC'}
                  </Btn>
                  <Btn variant="ghost" sx={{ flex: 1 }} onClick={() => runGameAction('flee')} disabled={busy || room.gamestate === 2}>逃跑</Btn>
                </div>
              </div>
            ) : !inGame ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: T.dim, marginBottom: 12 }}>你还没有加入这场游戏</div>
                <Btn variant="primary" size="lg" onClick={() => runGameAction('join')} disabled={busy || room.gamestate === 2}>加入游戏</Btn>
              </div>
            ) : (
              <div>
                <Btn variant="primary" sx={{ width: '100%', marginBottom: 8, fontSize: 14, padding: '10px 0', fontWeight: 700 }} onClick={() => runGameAction('search')} disabled={busy || !me?.alive || room.gamestate === 2 || !!battle}>
                  {busy ? '搜索中...' : '搜索区域'}
                </Btn>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Btn variant="warn" onClick={() => setCraftOpen(true)} sx={{ width: '100%' }} disabled={!me?.alive || room.gamestate === 2 || !!battle}>
                    装备合成
                  </Btn>
                </div>
                {!me?.alive && <div style={{ textAlign: 'center', color: T.red, fontSize: 12, marginTop: 8 }}>你已阵亡，只能查看战况与装备状态</div>}
                {room.gamestate === 2 && <div style={{ textAlign: 'center', color: T.yellow, fontSize: 12, marginTop: 8 }}>本局已结束，所有动作已锁定</div>}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', background: T.bg0, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            {[
              { key: 'log', label: '日志' },
              { key: 'bag', label: `背包${inGame ? ` (${(me?.inventory || []).length})` : ''}` },
              { key: 'equip', label: `装备 (${equipments.length})` },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setPanel(tab.key)}
                style={{
                  flex: 1,
                  padding: '9px 0',
                  border: 'none',
                  background: 'transparent',
                  borderBottom: `2px solid ${panel === tab.key ? T.cyan : 'transparent'}`,
                  color: panel === tab.key ? T.cyan : T.dim,
                  fontSize: 12,
                  fontWeight: panel === tab.key ? 700 : 400,
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            {panel === 'log' && (
              <div>
                {logs.length === 0
                  ? <div style={{ textAlign: 'center', color: T.dim, marginTop: 24, fontSize: 12 }}>等待事件发生...</div>
                  : logs.map((entry, index) => <LogLine key={`${entry.time}-${index}`} entry={entry} />)}
              </div>
            )}

            {panel === 'bag' && (
              <div>
                {!inGame && <div style={{ textAlign: 'center', color: T.dim, marginTop: 24, fontSize: 12 }}>加入游戏后显示背包</div>}
                {inGame && Object.keys(invCount).length === 0 && <div style={{ textAlign: 'center', color: T.dim, marginTop: 24, fontSize: 12 }}>背包空空如也</div>}
                {Object.entries(invCount).map(([name, count]) => {
                  const itemDef = allItems.find(item => item.name === name)
                  return (
                    <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: T.bg2, border: `1px solid ${T.border}`, marginBottom: 6 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>
                          {name}
                          {count > 1 && <span style={{ color: T.dim, fontSize: 11, marginLeft: 5 }}>x{count}</span>}
                        </div>
                        {itemDef?.description && <div style={{ fontSize: 11, color: T.dimB, marginTop: 2 }}>{itemDef.description}</div>}
                      </div>
                      {me?.alive && room.gamestate !== 2 && (
                        <Btn size="sm" onClick={() => runGameAction('useItem', { itemName: name })} disabled={busy || !!battle}>
                          使用
                        </Btn>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {panel === 'equip' && (
              <div>
                <div style={{ marginBottom: 12, fontSize: 11, color: T.dimB, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px' }}>已装备</div>
                {SLOTS.map(slot => {
                  const instance = eqMap[slot.key]
                  const tier = instance?.tier
                  const rarity = tier ? RARITY_META[tier.rarity] : null
                  return (
                    <div key={slot.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, marginBottom: 6, background: tier ? T.bg2 : T.bg0, border: `1px solid ${tier ? (rarity?.color || T.border) + '30' : T.border}` }}>
                      <span style={{ fontSize: 10, color: T.dim, width: 54, flexShrink: 0 }}>{slot.label}</span>
                      <div style={{ flex: 1 }}>
                        {tier ? (
                          <div>
                            <div style={{ fontWeight: 700, color: rarity?.color }}>{tier.name}</div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 3, fontSize: 10 }}>
                              {tier.base_atk > 0 && <span style={{ color: T.orange }}>ATK +{tier.base_atk + (instance.bonus_atk || 0)}</span>}
                              {tier.base_def > 0 && <span style={{ color: T.cyan }}>DEF +{tier.base_def + (instance.bonus_def || 0)}</span>}
                              {tier.durability_max > 0 && <span style={{ color: instance.durability_current / tier.durability_max < 0.25 ? T.red : T.dim }}>耐久 {instance.durability_current}/{tier.durability_max}</span>}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: T.border, fontSize: 11 }}>空槽</span>
                        )}
                      </div>
                      {tier && (
                        <Btn variant="danger" size="sm" disabled={busy || room.gamestate === 2} onClick={() => runEquipmentAction('unequip', { instanceId: instance.id })}>
                          卸下
                        </Btn>
                      )}
                    </div>
                  )
                })}

                <div style={{ margin: '18px 0 12px', fontSize: 11, color: T.dimB, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px' }}>未装备实例</div>
                {bagEquipments.length === 0 ? (
                  <div style={{ textAlign: 'center', color: T.dim, marginTop: 24, fontSize: 12 }}>暂无可穿戴装备，先通过合成获得吧</div>
                ) : (
                  bagEquipments.map(instance => {
                    const tier = instance.tier
                    const rarity = RARITY_META[tier?.rarity] || RARITY_META.common
                    return (
                      <div key={instance.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, background: T.bg2, border: `1px solid ${T.border}`, marginBottom: 8 }}>
                        <div>
                          <div style={{ fontWeight: 700, color: rarity.color }}>{tier?.name || '未知装备'}</div>
                          <div style={{ marginTop: 4, fontSize: 11, color: T.dim }}>
                            {(tier?.series?.slot || instance.equipped_slot || '未知槽位')} · 耐久 {instance.durability_current ?? 0}/{tier?.durability_max ?? 0}
                          </div>
                        </div>
                        <Btn variant="primary" size="sm" disabled={busy || room.gamestate === 2 || !me?.alive} onClick={() => runEquipmentAction('equip', { instanceId: instance.id })}>
                          穿戴
                        </Btn>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ borderLeft: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bg1 }}>
          {battle && (battle.log || []).length > 0 ? (
            <>
              <PanelTitle>战斗记录</PanelTitle>
              <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px' }}>
                {(battle.log || []).map((line, index) => (
                  <div key={`${line}-${index}`} style={{ fontSize: 11, color: T.dimB, padding: '3px 0', borderBottom: `1px solid ${T.border}` }}>{line}</div>
                ))}
              </div>
            </>
          ) : (
            <>
              <PanelTitle right={me?.alive ? <span style={{ fontSize: 10, color: T.dim, fontWeight: 400 }}>点击转移</span> : null}>地图</PanelTitle>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {MAP_LIST.map(map => {
                  const current = (meBase?.map ?? 0) === map.id
                  const canMove = me?.alive && !battle && !busy && !current && room.gamestate !== 2
                  return (
                    <div
                      key={map.id}
                      onClick={() => canMove && runGameAction('move', { mapId: map.id })}
                      style={{
                        padding: '8px 12px',
                        borderBottom: `1px solid ${T.border}`,
                        borderLeft: `3px solid ${current ? T.cyan : 'transparent'}`,
                        background: current ? `${T.cyan}10` : 'transparent',
                        cursor: canMove ? 'pointer' : 'default',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontSize: 12, color: current ? T.cyan : T.dimB, fontWeight: current ? 700 : 400 }}>{map.name}</span>
                      {current && <span style={{ fontSize: 10, color: T.cyan, opacity: 0.7 }}>当前</span>}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
