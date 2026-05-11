'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../../layout'
import { ENTITY_TYPE_META, POLLUTION_CONFIG, POLLUTION_TIER_META } from '@/lib/constants'
import { calcEffectivePollution } from '@/lib/pollution'
import { loadBuffPool } from '@/lib/gameEngine'
import { calcEquippedStats, RARITY_META } from '@/lib/equipmentEngine'
import { normalizeGamevars } from '@/lib/roomState'
import { postGameApi } from '@/lib/gameApi'
import { useToast } from '../../admin/_shared/ui'
import CraftModal from './CraftModal'
import LootModal from './LootModal'
import ExtractionModal from './ExtractionModal'
import LoadoutModal from '@/components/LoadoutModal'
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

// Phase 19.7: chamber 类型元数据（路径前进面板用）
const CHAMBER_TYPE_META = {
  scan_dense:     { label: '搜密', icon: '🔍', color: '#58a6ff' },
  combat_dense:   { label: '打密', icon: '⚔️', color: '#f85149' },
  fragment_dense: { label: '残密', icon: '📡', color: '#bc8cff' },
  hazard:         { label: '危险', icon: '☢',  color: '#d29922' },
  exit:           { label: '撤离', icon: '🚪', color: '#3fb950' },
  milestone:      { label: '里程碑 ⚠', icon: '🏆', color: '#ff8c42' },
}
function chamberTypeLabel(type) {
  return (CHAMBER_TYPE_META[type] || CHAMBER_TYPE_META.scan_dense).label
}

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
  const [tradeableNpcs, setTradeableNpcs] = useState([])
  const [buffPool, setBuffPool] = useState([])
  const [equipments, setEquipments] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [busyAction, setBusyAction] = useState(null)  // 追踪当前执行的动作名，用于精确显示 loading
  const [panel, setPanel] = useState('log')
  const [craftOpen, setCraftOpen] = useState(false)
  const [extractOpen, setExtractOpen] = useState(false)
  const [joinLoadoutOpen, setJoinLoadoutOpen] = useState(false)

  const mapIdRef = useRef(0)

  // Phase 19.7: chamber 模型 — mapId 现在是 chamber.templateId
  const loadMapData = useCallback(async (chamberTemplateId) => {
    const [{ data: nextAllItems }, { data: nextNpcs }] = await Promise.all([
      supabase.from('item_pool').select('*'),
      // chamber 内可交易非敌对实体（按 chamber_template_ids 过滤）
      supabase.from('npc_pool').select('id,name,entity_type,trade_wants,trade_offers,chamber_template_ids').eq('tradeable', true),
    ])

    setAllItems(nextAllItems || [])
    setTradeableNpcs((nextNpcs || []).filter(n => Array.isArray(n.chamber_template_ids) && n.chamber_template_ids.includes(chamberTemplateId)))
    // mapConfig 由 useMemo 从 gamevars 算（chamber 数据）
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
  // Phase 16: encounter（待袭击 NPC 实例）取代旧 battle 持续状态
  const encounterInstance = useMemo(() => {
    const instId = meBase?.encounter?.instanceId
    if (!instId) return null
    return (gamevars?.npcInstances || []).find(i => i.id === instId) || null
  }, [meBase?.encounter?.instanceId, gamevars?.npcInstances])
  // Phase 19.7: chamber 路径 — 当前 chamber + 下一段候选
  const raidPath = useMemo(() => gamevars?.raidPath || [], [gamevars?.raidPath])
  const currentChamberIdx = meBase?.chamberIndex ?? 0
  const currentChamber = useMemo(
    () => raidPath[currentChamberIdx] || null,
    [raidPath, currentChamberIdx],
  )
  const nextChamberOptions = useMemo(() => {
    if (!raidPath || raidPath.length === 0) return []
    const opts = []
    const nextIdx = currentChamberIdx + 1
    if (nextIdx >= raidPath.length) return opts
    // A = 真下一段；B/C = 装饰预览（取后续段，便于玩家看远景）
    const exitCount = currentChamber?.exitCount || 2
    for (let k = 0; k < exitCount; k++) {
      const idx = nextIdx + k
      if (idx < raidPath.length) {
        opts.push({
          ...raidPath[idx],
          optionLabel: String.fromCharCode(65 + k), // A/B/C
          isRealNext: k === 0,
          previewOnly: k !== 0,
        })
      }
    }
    return opts
  }, [raidPath, currentChamberIdx, currentChamber?.exitCount])
  const inGame = !!meBase
  // Phase 19.7: 用 currentChamber 替代 mapConfig（保留 mapConfig 变量名兼容旧引用）
  const effectiveMapConfig = currentChamber ? {
    name: currentChamber.name,
    description: currentChamber.description,
    weather: currentChamber.weather,
    is_exit: currentChamber.isExit,
    exit_cost: currentChamber.exitCost,
    adjacent_maps: [], // 新模型无邻接
  } : mapConfig
  const weather = WEATHER[effectiveMapConfig?.weather || 'clear'] || WEATHER.clear
  const aliveCount = room?.alivenum ?? allPlayers.filter(player => player.alive).length
  const currentMapCorpseCount = useMemo(
    () => (gamevars?.corpses || []).filter(corpse => corpse.mapId === (meBase?.map ?? 0)).length,
    [gamevars?.corpses, meBase?.map],
  )
  const pvpTargets = useMemo(
    () => allPlayers.filter(player => (player.id || player.uid) !== user?.id && player.alive && (player.map ?? 0) === (meBase?.map ?? 0)),
    [allPlayers, meBase?.map, user?.id],
  )

  // Phase 18.5: 区域评估 — 战斗强度 + 撤离成功率
  const regionAssessment = useMemo(() => {
    const mapId = meBase?.map ?? 0
    const liveNpcs = (gamevars?.npcInstances || []).filter(i => i.mapId === mapId && i.hp > 0)
    const totalHp = liveNpcs.reduce((sum, i) => sum + (i.hp || 0), 0)
    const maxAtk = liveNpcs.reduce((m, i) => Math.max(m, i.npc?.atk || 0), 0)
    // 战斗强度：HP 总和 + 最大 ATK 加权（粗略估算）
    let combatTier = 'safe'
    let combatLabel = '安全'
    let combatColor = T.green
    const threat = totalHp + maxAtk * 3
    if (liveNpcs.length === 0) {
      combatTier = 'clear'; combatLabel = '无威胁'; combatColor = T.dim
    } else if (threat >= 200) {
      combatTier = 'extreme'; combatLabel = '极危'; combatColor = T.red
    } else if (threat >= 100) {
      combatTier = 'high'; combatLabel = '高'; combatColor = T.red
    } else if (threat >= 50) {
      combatTier = 'medium'; combatLabel = '中'; combatColor = T.yellow
    } else {
      combatTier = 'low'; combatLabel = '低'; combatColor = T.green
    }
    // 撤离成功率：is_exit 地图 + exit_cost 是否满足 + 当前血量
    let extractTier = 'no_exit'
    let extractLabel = '非撤离点'
    let extractColor = T.dim
    let extractRate = 0
    if (effectiveMapConfig?.is_exit) {
      const cost = effectiveMapConfig?.exit_cost
      const need = cost?.qty || 0
      const item = cost?.item
      const have = item ? (meBase?.inventory || []).filter(it => it === item).length : Infinity
      if (!item || have >= need) {
        // 满足消耗 → 看血量
        const hpRatio = (meBase?.hp || 0) / (meBase?.maxHp || 100)
        if (hpRatio >= 0.5) {
          extractRate = 95; extractTier = 'good'; extractLabel = '可立即撤离'; extractColor = T.green
        } else if (hpRatio >= 0.2) {
          extractRate = 75; extractTier = 'caution'; extractLabel = '血量偏低，建议补血'; extractColor = T.yellow
        } else {
          extractRate = 50; extractTier = 'risk'; extractLabel = '血量危险'; extractColor = T.red
        }
      } else {
        extractRate = 0; extractTier = 'cost_unmet'; extractLabel = `缺 ${item} ×${need - have}`; extractColor = T.red
      }
    }
    return { combatTier, combatLabel, combatColor, npcCount: liveNpcs.length, totalHp, extractTier, extractLabel, extractColor, extractRate }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamevars?.npcInstances, meBase?.map, meBase?.hp, meBase?.maxHp, meBase?.inventory, mapConfig])

  // Phase 16: PvP 被攻击 toast — 检测 lastPvpHit.seq 变化
  const lastPvpSeqRef = useRef(0)
  const pvpHit = meBase?.lastPvpHit
  useEffect(() => {
    if (!pvpHit?.seq) return
    if (pvpHit.seq <= lastPvpSeqRef.current) return
    lastPvpSeqRef.current = pvpHit.seq
    if (pvpHit.countered && pvpHit.counterDmg > 0) {
      toast(`⚠ 被 ${pvpHit.fromName} 攻击造成 ${pvpHit.damage} 伤害；你的反击造成 ${pvpHit.counterDmg} 伤害`, 'error')
    } else {
      toast(`⚠ 被 ${pvpHit.fromName} 攻击，造成 ${pvpHit.damage} 伤害`, 'error')
    }
  }, [pvpHit, toast])

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

  // Phase 16.1: 加入对局走 LoadoutModal — 玩家先选 4 装备 + 4 消耗品再 join
  async function handleJoinWithLoadout(payload) {
    // payload = { loadout, consumables, items, equipmentInstanceIds } 由 LoadoutModal 给
    const next = await runGameAction('join', { loadout: payload }, { refreshEquipment: true })
    if (next) {
      toast('🎒 装载完成，已进入异常段', 'success')
    }
  }

  async function runGameAction(action, payload = {}, options = {}) {
    setBusy(true)
    setBusyAction(action)
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
      setBusyAction(null)
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

  async function handleExtract() {
    const next = await runGameAction('extract', {}, { refreshEquipment: true })
    if (next) {
      toast('🚪 已成功撤离，物资已入库', 'success')
      setExtractOpen(false)
    }
  }

  async function handleEmergencyRetreat() {
    if (!confirm('确认启用缝隙维护轨道？\n个人污染将 +' + POLLUTION_CONFIG.EMERGENCY_COST + '%')) return
    const next = await runGameAction('emergencyRetreat', {})
    if (next) {
      toast(`已传送至外环维护廊（个人污染 +${POLLUTION_CONFIG.EMERGENCY_COST}%）`, 'success')
    }
  }

  // Phase 18.4: 污染分阶段警报 — 70% 跨越时弹 toast；90% 弹强制撤离倒计时模态
  const POLLUTION_WARN_THRESHOLD = 70
  const POLLUTION_FORCE_THRESHOLD = 90
  const FORCE_RETREAT_SECONDS = 30
  const lastPollutionRef = useRef(0)
  const [forceRetreatActive, setForceRetreatActive] = useState(false)
  const [forceRetreatSeconds, setForceRetreatSeconds] = useState(FORCE_RETREAT_SECONDS)
  const forceTriggeredRef = useRef(false)

  const envPollutionLevel = gamevars?.envPollution || 0

  useEffect(() => {
    if (!inGame || meBase?.extracted || !me?.alive) return
    const prev = lastPollutionRef.current
    const cur = envPollutionLevel
    // 70% 跨越 → 弹 warning toast（仅向上跨越触发）
    if (prev < POLLUTION_WARN_THRESHOLD && cur >= POLLUTION_WARN_THRESHOLD && cur < POLLUTION_FORCE_THRESHOLD) {
      toast(`⚠ 张力警报：环境污染 ${cur}%，建议立即评估撤离路径`, 'error')
    }
    // 90% 跨越 → 触发强制撤离倒计时（一次性，不会重复触发）
    if (cur >= POLLUTION_FORCE_THRESHOLD && !forceTriggeredRef.current) {
      forceTriggeredRef.current = true
      setForceRetreatActive(true)
      setForceRetreatSeconds(FORCE_RETREAT_SECONDS)
    }
    // 跌回 80% 以下 → 解除强制撤离锁定（理论上不会发生，但防御性）
    if (cur < POLLUTION_FORCE_THRESHOLD - 10) {
      forceTriggeredRef.current = false
      setForceRetreatActive(false)
    }
    lastPollutionRef.current = cur
  }, [envPollutionLevel, inGame, me?.alive, meBase?.extracted, toast])

  // 90% 强制撤离倒计时 — 30s 后自动 emergencyRetreat
  useEffect(() => {
    if (!forceRetreatActive) return
    if (forceRetreatSeconds <= 0) {
      setForceRetreatActive(false)
      handleEmergencyRetreat()
      return
    }
    const timer = setTimeout(() => setForceRetreatSeconds(s => s - 1), 1000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceRetreatActive, forceRetreatSeconds])

  async function handleTradeNpc(npcId) {
    const next = await runGameAction('trade', { npcId })
    if (next) {
      toast('交易成功', 'success')
    }
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
    <div style={{ height: '100vh', background: T.bg0, color: T.text, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-noto-sans-sc), system-ui, sans-serif', fontSize: 13, overflow: 'hidden' }}>
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
      <ExtractionModal
        open={extractOpen}
        onClose={() => setExtractOpen(false)}
        onExtract={handleExtract}
        busy={busy}
        mapName={effectiveMapConfig?.name || `地图 ${meBase?.map ?? 0}`}
        mapDescription={effectiveMapConfig?.description || ''}
        exitCost={effectiveMapConfig?.exit_cost || null}
        inventory={meBase?.inventory || []}
        equippedCount={equipments.length}
      />
      <LoadoutModal
        open={joinLoadoutOpen}
        roomTitle={room ? `对局 #${room.gamenum || room.id}` : ''}
        onClose={() => setJoinLoadoutOpen(false)}
        onConfirm={handleJoinWithLoadout}
      />

      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:${T.bg0}}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:2px}
        .hov:hover:not(:disabled){filter:brightness(1.15)}
        select,input{outline:none;font-family:inherit}
        @keyframes btnLoadingFill{
          0%   { transform: scaleX(0);    opacity: .9 }
          70%  { transform: scaleX(0.9);  opacity: .8 }
          100% { transform: scaleX(1);    opacity: .55 }
        }
        .btn-loading-fill{animation:btnLoadingFill 1.1s cubic-bezier(.22,.61,.36,1) forwards;will-change:transform,opacity}
      `}</style>

      {/* Phase 18.4: 70% 张力警报横幅（持久显示，玩家可见即提醒） */}
      {inGame && me?.alive && !meBase?.extracted && envPollutionLevel >= POLLUTION_WARN_THRESHOLD && envPollutionLevel < POLLUTION_FORCE_THRESHOLD && (
        <div style={{
          background: `linear-gradient(90deg, ${T.yellow}25, ${T.yellow}10)`,
          borderBottom: `1px solid ${T.yellow}50`,
          padding: '6px 20px',
          fontSize: 11, color: T.yellow,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <span>⚠</span>
          <span>张力警报：环境污染 {envPollutionLevel}% — 结构应力接近临界值，建议立即评估撤离路径</span>
        </div>
      )}

      {/* Phase 18.4: 90% 强制撤离倒计时模态（不可关） */}
      {forceRetreatActive && me?.alive && !meBase?.extracted && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: T.bg1, border: `2px solid ${T.red}`,
            borderRadius: 12, padding: '28px 36px',
            maxWidth: 480, textAlign: 'center',
            boxShadow: `0 0 40px ${T.red}40`,
          }}>
            <div style={{ fontSize: 38, marginBottom: 12 }}>☢</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.red, marginBottom: 8 }}>
              结构应力超限，强制撤离协议触发
            </div>
            <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.7, marginBottom: 16 }}>
              环境污染 {envPollutionLevel}%，泡泡壳裂解临界。<br/>
              系统将在倒计时归零时自动启动缝隙维护轨道。
            </div>
            <div style={{
              fontSize: 42, fontWeight: 900,
              color: forceRetreatSeconds <= 10 ? T.red : T.yellow,
              fontFamily: 'monospace',
              marginBottom: 16,
              textShadow: `0 0 20px ${forceRetreatSeconds <= 10 ? T.red : T.yellow}40`,
            }}>
              {forceRetreatSeconds}s
            </div>
            <button
              onClick={() => {
                setForceRetreatActive(false)
                handleEmergencyRetreat()
              }}
              style={{
                padding: '10px 28px', borderRadius: 8,
                background: T.red, color: '#fff', border: 'none',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              ⚠ 立即启动缝隙维护轨道
            </button>
            <div style={{ fontSize: 10, color: T.dim2, marginTop: 10 }}>
              （个人污染将 +{POLLUTION_CONFIG.EMERGENCY_COST}%，传送至外环维护廊）
            </div>
          </div>
        </div>
      )}

      <div style={{ background: `linear-gradient(90deg,${T.bg2} 0%,${T.bg3} 50%,${T.bg2} 100%)`, borderBottom: `1px solid ${T.borderB}`, padding: '0 20px', height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: T.cyan, letterSpacing: 2, textShadow: `0 0 20px ${T.cyan}80` }}>
          远星函馆 · 17号异常段
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: T.dim, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: T.text, fontWeight: 700 }}>{effectiveMapConfig?.name || '未知区域'}</span>
          <span>{weather.icon} {weather.label}{weather.mod ? <span style={{ color: T.yellow, marginLeft: 4, fontSize: 10 }}>({weather.mod})</span> : null}</span>

          {/* 环境污染 */}
          <PollutionPill
            label="环境"
            value={gamevars?.envPollution || 0}
            color={T.red}
          />
          {/* 个人污染 */}
          <PollutionPill
            label="个人"
            value={meBase?.personalPollution || 0}
            color={T.purple}
          />
          {/* 有效污染等级 */}
          <EffectivePollutionTag
            envP={gamevars?.envPollution || 0}
            personalP={meBase?.personalPollution || 0}
          />
          {/* Ω 倒计时 */}
          {meBase?.omegaCountdown !== null && meBase?.omegaCountdown !== undefined && (
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 12,
              background: `${T.purple}18`, color: T.purple, border: `1px solid ${T.purple}40`,
              fontWeight: 700,
            }}>
              Ω {meBase.omegaCountdown}
            </span>
          )}

          <span style={{ color: room.gamestate === 2 ? T.yellow : T.green, fontWeight: 700 }}>
            {room.gamestate === 2
              ? (gamevars?.endingResult ? `结局：${gamevars.endingResult.name}` : `胜者：${room.winner || '无人'}`)
              : `存活 ${aliveCount}`}
          </span>
        </div>
      </div>

      {gamevars?.endingResult && (
        <div style={{
          background: `linear-gradient(135deg, ${T.purple}25 0%, ${T.cyan}15 50%, ${T.purple}25 100%)`,
          borderBottom: `2px solid ${T.purple}60`,
          padding: '16px 24px', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 18,
          boxShadow: `0 4px 20px ${T.purple}30 inset`,
        }}>
          <div style={{ fontSize: 32 }}>🎬</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: T.purple, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 4 }}>
              结局触发
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: T.text, marginBottom: 4 }}>
              {gamevars.endingResult.name}
            </div>
            {gamevars.endingResult.bannerText && (
              <div style={{ fontSize: 13, color: T.dimB, fontStyle: 'italic' }}>
                「{gamevars.endingResult.bannerText}」
              </div>
            )}
            {(gamevars.endingResult.rewardedItems || []).length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: T.dim }}>奖励：</span>
                {gamevars.endingResult.rewardedItems.map((it, i) => (
                  <span key={i} style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10,
                    background: `${T.yellow}18`, color: T.yellow, border: `1px solid ${T.yellow}40`,
                  }}>{it.name} ×{it.quantity}</span>
                ))}
                <span style={{ fontSize: 10, color: T.dim2 }}>
                  · 已发送给 {gamevars.endingResult.rewardedPlayerCount} 名存活玩家
                </span>
              </div>
            )}
            {/* Phase 18.2: 引导玩家去 Archive 查看本局贡献 */}
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
              <a
                href="/archive"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 11, color: T.cyan, textDecoration: 'none',
                  padding: '4px 10px', borderRadius: 6,
                  background: `${T.cyan}18`, border: `1px solid ${T.cyan}40`,
                }}
              >
                📡 在档案库查看本局贡献的残片 →
              </a>
            </div>
          </div>
        </div>
      )}

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

          {/* Phase 18.5: 区域评估小卡 — 战斗强度 + 撤离成功率 */}
          {inGame && me?.alive && !meBase?.extracted && (
            <>
              <PanelTitle right={<span style={{ fontSize: 10, color: T.dim, fontWeight: 400 }}>当前地图</span>}>📊 区域评估</PanelTitle>
              <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{
                  padding: '6px 10px', borderRadius: 6,
                  background: T.bg2, border: `1px solid ${regionAssessment.combatColor}40`,
                  borderLeft: `3px solid ${regionAssessment.combatColor}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 10, color: T.dimB }}>预计战斗强度</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: regionAssessment.combatColor, marginTop: 1 }}>
                      {regionAssessment.combatLabel}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: T.dim2 }}>实体 {regionAssessment.npcCount}</div>
                    <div style={{ fontSize: 10, color: T.dim2 }}>总 HP {regionAssessment.totalHp}</div>
                  </div>
                </div>
                <div style={{
                  padding: '6px 10px', borderRadius: 6,
                  background: T.bg2, border: `1px solid ${regionAssessment.extractColor}40`,
                  borderLeft: `3px solid ${regionAssessment.extractColor}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 10, color: T.dimB }}>撤离成功率</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: regionAssessment.extractColor, marginTop: 1 }}>
                      {regionAssessment.extractLabel}
                    </div>
                  </div>
                  {regionAssessment.extractRate > 0 && (
                    <div style={{ fontSize: 16, fontWeight: 900, color: regionAssessment.extractColor, fontFamily: 'monospace' }}>
                      {regionAssessment.extractRate}%
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

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
                      <Btn variant="danger" size="sm" disabled={busy || !me?.alive || room.gamestate === 2} onClick={() => runGameAction('attackPlayer', { targetUid: target.id || target.uid })}>
                        攻击
                      </Btn>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── 交易面板：当前地图的非敌对可交易实体 ── */}
          {tradeableNpcs.length > 0 && (
            <>
              <PanelTitle right={<span style={{ fontSize: 10, color: T.dim, fontWeight: 400 }}>非敌对实体</span>}>🌿 交易</PanelTitle>
              <div style={{ padding: '10px 12px', maxHeight: 220, overflowY: 'auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {tradeableNpcs.map(npc => {
                    const meta = ENTITY_TYPE_META[npc.entity_type] || ENTITY_TYPE_META.symbiote
                    const wants = npc.trade_wants
                    const offers = npc.trade_offers
                    const haveCount = wants?.item
                      ? (meBase?.inventory || []).filter(it => it === wants.item).length
                      : 0
                    const needQty = Number(wants?.qty) || 1
                    const canTrade = wants?.item && offers?.item && haveCount >= needQty
                      && me?.alive && room.gamestate !== 2 && !busy
                    return (
                      <div key={npc.id} style={{
                        background: T.bg2, border: `1px solid ${meta.color}30`,
                        borderLeft: `3px solid ${meta.color}`, borderRadius: 8, padding: '10px 12px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <span style={{ fontSize: 14 }}>{meta.icon}</span>
                          <span style={{ fontWeight: 700, color: meta.color, fontSize: 13 }}>{npc.name}</span>
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: `${meta.color}18`, color: meta.color, border: `1px solid ${meta.color}30` }}>{meta.label}</span>
                        </div>
                        {wants?.item && offers?.item && (
                          <div style={{ fontSize: 11, color: T.dim, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ color: haveCount >= needQty ? T.green : T.red }}>需 {wants.item} ×{needQty}</span>
                            <span style={{ color: T.dim2 }}>→</span>
                            <span style={{ color: T.yellow }}>得 {offers.item} ×{offers.qty || 1}</span>
                            <span style={{ color: T.dim2, fontSize: 10 }}>（你 {haveCount}/{needQty}）</span>
                          </div>
                        )}
                        <Btn
                          variant="primary"
                          size="sm"
                          disabled={!canTrade}
                          onClick={() => handleTradeNpc(npc.id)}
                          sx={{ width: '100%', background: canTrade ? `${meta.color}22` : T.bg0, color: canTrade ? meta.color : T.dim2, border: `1px solid ${canTrade ? `${meta.color}50` : T.border}` }}
                        >
                          {!wants?.item ? '配置无效' : haveCount < needQty ? '物品不足' : '🤝 交易'}
                        </Btn>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {/* Phase 17: 背包面板 — 从中央 tab 搬到左侧常驻 */}
          {inGame && (
            <>
              <PanelTitle right={<span style={{ fontSize: 10, color: T.dim, fontWeight: 400 }}>{(me?.inventory || []).length} 件</span>}>🎒 背包</PanelTitle>
              <div style={{ padding: '8px 12px', maxHeight: 320, overflowY: 'auto' }}>
                {Object.keys(invCount).length === 0 ? (
                  <div style={{ textAlign: 'center', color: T.dim, padding: '12px 0', fontSize: 11 }}>背包空空如也</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Object.entries(invCount).map(([name, count]) => {
                      const itemDef = allItems.find(item => item.name === name)
                      const mode = itemDef?.use_mode || 'consume'
                      const btnLabel = mode === 'inspect_keep' ? '查看'
                        : mode === 'inspect_consume' ? '查看（一次性）'
                        : '使用'
                      const btnVariant = mode === 'inspect_keep' ? 'ghost'
                        : mode === 'inspect_consume' ? 'warn'
                        : 'default'
                      return (
                        <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: T.bg2, border: `1px solid ${T.border}` }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 12, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {name}
                              {count > 1 && <span style={{ color: T.dim, fontSize: 10, marginLeft: 5 }}>×{count}</span>}
                            </div>
                            {itemDef?.description && (
                              <div style={{ fontSize: 10, color: T.dimB, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{itemDef.description}</div>
                            )}
                          </div>
                          {me?.alive && room.gamestate !== 2 && (
                            <Btn
                              size="sm"
                              variant={btnVariant}
                              onClick={() => runGameAction('useItem', { itemName: name })}
                              disabled={busy}
                              sx={{ flexShrink: 0, fontSize: 10, padding: '3px 8px' }}
                            >
                              {btnLabel}
                            </Btn>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.border}`, background: T.bg1, flexShrink: 0 }}>
            {currentMapCorpseCount > 0 && (
              <div style={{ textAlign: 'center', color: T.dimB, fontSize: 11, marginBottom: 10 }}>
                当前地图有 {currentMapCorpseCount} 具尸体，搜索时可能发现可搜刮目标
              </div>
            )}
            {!inGame ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: T.dim, marginBottom: 12 }}>你还没有加入这场游戏</div>
                <Btn variant="primary" size="lg" onClick={() => setJoinLoadoutOpen(true)} disabled={busy || room.gamestate === 2}>🎒 装载并加入</Btn>
              </div>
            ) : meBase?.extracted ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🚪</div>
                <div style={{ fontSize: 14, color: T.green, fontWeight: 700, marginBottom: 4 }}>
                  已成功撤离
                </div>
                <div style={{ fontSize: 11, color: T.dim }}>
                  物资已安全归档到账户库
                </div>
              </div>
            ) : (
              <div>
                {/* Phase 16: encounter 卡 — 待袭击 NPC 实例 */}
                {encounterInstance && (
                  <div style={{
                    background: T.bg0, borderRadius: 10,
                    border: `1px solid ${T.red}40`, borderLeft: `3px solid ${T.red}`,
                    padding: '14px 16px', marginBottom: 12,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 11, color: T.dimB, marginBottom: 2 }}>遭遇敌对实体</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.red }}>{encounterInstance.npc?.name || '未知实体'}</div>
                      </div>
                      <div style={{ fontSize: 10, color: T.dim, fontFamily: 'monospace' }}>
                        实例 #{encounterInstance.id?.slice(-6) || '????'}
                      </div>
                    </div>
                    <HpBar hp={encounterInstance.hp} max={encounterInstance.maxHp} h={8} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11 }}>
                      <span style={{ color: hpColor(encounterInstance.hp, encounterInstance.maxHp), fontFamily: 'monospace', fontWeight: 700 }}>
                        HP {encounterInstance.hp}/{encounterInstance.maxHp}
                      </span>
                      <span style={{ color: T.dim }}>
                        ATK {encounterInstance.npc?.atk ?? '?'} · DEF {encounterInstance.npc?.def ?? '?'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <Btn variant="danger" loading={busyAction === 'attackNpc'} loadingText="袭击中..." sx={{ flex: 2, padding: '10px 0', fontSize: 13, fontWeight: 700 }} onClick={() => runGameAction('attackNpc')} disabled={!me?.alive || room.gamestate === 2}>
                        ⚔️ 袭击（一次性）
                      </Btn>
                      <Btn variant="ghost" sx={{ flex: 1, padding: '10px 0' }} onClick={() => runGameAction('releaseEncounter')} disabled={busy || !me?.alive || room.gamestate === 2}>
                        放过
                      </Btn>
                    </div>
                    <div style={{ fontSize: 10, color: T.dim2, marginTop: 8, textAlign: 'center' }}>
                      袭击后实体会离开（无论是否击杀），其他动作 = 隐式放过
                    </div>
                  </div>
                )}

                <Btn variant="primary" loading={busyAction === 'search'} loadingText="搜索中..." sx={{ width: '100%', marginBottom: 8, fontSize: 14, padding: '12px 0', fontWeight: 700 }} onClick={() => runGameAction('search')} disabled={!me?.alive || room.gamestate === 2}>
                  搜索区域
                </Btn>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <Btn variant="warn" onClick={() => setCraftOpen(true)} sx={{ width: '100%' }} disabled={!me?.alive || room.gamestate === 2}>
                    装备合成
                  </Btn>
                </div>
                {effectiveMapConfig?.is_exit && (
                  <Btn
                    variant="ghost"
                    onClick={() => setExtractOpen(true)}
                    sx={{ width: '100%', borderColor: `${T.green}50`, color: T.green, fontSize: 13, fontWeight: 700, marginBottom: 6 }}
                    disabled={!me?.alive || room.gamestate === 2}
                  >
                    🚪 结构退避
                    {effectiveMapConfig?.exit_cost?.item && (
                      <span style={{ fontSize: 11, opacity: 0.8, marginLeft: 6 }}>
                        （需 {effectiveMapConfig?.exit_cost.item} ×{effectiveMapConfig?.exit_cost.qty || 1}）
                      </span>
                    )}
                  </Btn>
                )}
                {(gamevars?.envPollution || 0) >= POLLUTION_CONFIG.EMERGENCY_UNLOCK && (
                  <Btn
                    variant="ghost"
                    onClick={handleEmergencyRetreat}
                    sx={{ width: '100%', borderColor: `${T.yellow}50`, color: T.yellow, fontSize: 12 }}
                    disabled={!me?.alive || room.gamestate === 2}
                  >
                    ⚠ 缝隙维护轨道（个人污染 +{POLLUTION_CONFIG.EMERGENCY_COST}%）
                  </Btn>
                )}
                {!me?.alive && <div style={{ textAlign: 'center', color: T.red, fontSize: 12, marginTop: 8 }}>你已阵亡，只能查看战况与装备状态</div>}
                {room.gamestate === 2 && <div style={{ textAlign: 'center', color: T.yellow, fontSize: 12, marginTop: 8 }}>本局已结束，所有动作已锁定</div>}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', background: T.bg0, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            {[
              { key: 'log', label: '日志' },
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
          <PanelTitle right={
            raidPath.length > 0 ? (
              <span style={{ fontSize: 10, color: T.dim, fontWeight: 400 }}>
                {currentChamberIdx + 1} / {raidPath.length}
              </span>
            ) : null
          }>⏭ 路径前进</PanelTitle>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
            {/* 当前 chamber 卡 */}
            {currentChamber && (
              <div style={{
                padding: '10px 12px', marginBottom: 12,
                background: T.bg2, borderRadius: 8,
                borderLeft: `3px solid ${T.cyan}`, border: `1px solid ${T.cyan}30`,
              }}>
                <div style={{ fontSize: 10, color: T.dim2, marginBottom: 2 }}>当前 chamber</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.cyan }}>
                  {currentChamber.name}
                </div>
                <div style={{ fontSize: 10, color: T.dimB, marginTop: 4 }}>
                  {currentChamber.regionLabel || ''} · {chamberTypeLabel(currentChamber.type)}
                </div>
                {currentChamber.description && (
                  <div style={{ fontSize: 10, color: T.dim, marginTop: 6, fontStyle: 'italic', lineHeight: 1.4 }}>
                    「{currentChamber.description}」
                  </div>
                )}
              </div>
            )}
            {/* 下一段候选 */}
            {nextChamberOptions.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: T.dim2, marginBottom: 6, paddingLeft: 2 }}>
                  下一段（选择前进路径）
                </div>
                {nextChamberOptions.map((opt) => {
                  const canMove = me?.alive && !busy && !meBase?.extracted && room.gamestate !== 2
                  const typeMeta = CHAMBER_TYPE_META[opt.type] || CHAMBER_TYPE_META.scan_dense
                  return (
                    <div
                      key={`${opt.idx}-${opt.optionLabel}`}
                      onClick={() => canMove && runGameAction('move', { selection: opt.optionLabel })}
                      style={{
                        padding: '8px 12px', marginBottom: 6,
                        background: T.bg2, borderRadius: 8,
                        borderLeft: `3px solid ${typeMeta.color}`,
                        border: opt.isRealNext ? `1px solid ${typeMeta.color}50` : `1px solid ${T.border}`,
                        cursor: canMove ? 'pointer' : 'not-allowed',
                        opacity: canMove ? 1 : 0.5,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: typeMeta.color }}>
                          [{opt.optionLabel}] {opt.name}
                        </span>
                        <span style={{ fontSize: 9, color: T.dim2 }}>
                          {typeMeta.icon} {typeMeta.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: T.dim, marginTop: 3 }}>
                        {opt.regionLabel || ''} · 污染基线 {opt.pollutionBase || 0}%
                      </div>
                      {opt.previewOnly && (
                        <div style={{ fontSize: 9, color: T.dim2, marginTop: 3, fontStyle: 'italic' }}>
                          （远景预览 — 选此先经过 A）
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {nextChamberOptions.length === 0 && currentChamberIdx >= raidPath.length - 1 && raidPath.length > 0 && (
              <div style={{ textAlign: 'center', color: T.yellow, fontSize: 11, padding: '20px 0' }}>
                🏆 已到达路径终点 — 完成里程碑或撤离归档
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 远星函馆 UI 子组件 ───────────────────────────────────

function PollutionPill({ label, value, color }) {
  const bg = `${color}15`
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, padding: '2px 8px', borderRadius: 12,
      background: bg, color, border: `1px solid ${color}40`,
    }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <strong style={{ fontFamily: 'monospace' }}>{value}%</strong>
    </span>
  )
}

function EffectivePollutionTag({ envP, personalP }) {
  const { effective, tier } = calcEffectivePollution(envP, personalP)
  const meta = POLLUTION_TIER_META[tier] || POLLUTION_TIER_META.none
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, padding: '2px 8px', borderRadius: 12,
      background: `${meta.color}18`, color: meta.color,
      border: `1px solid ${meta.color}40`, fontWeight: 700,
    }}>
      {meta.icon} {meta.label} {effective}
    </span>
  )
}
