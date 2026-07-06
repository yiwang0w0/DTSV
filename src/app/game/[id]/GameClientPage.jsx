'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/_shell/RootShell'
import { ENTITY_TYPE_META, JUMP_CONFIG, POLLUTION_CONFIG, POLLUTION_TIER_META, RUN_GOALS, STAMINA_CONFIG } from '@/lib/constants'
import { runGoalRating } from '@/lib/server/runGoals'
import { calcEffectivePollution } from '@/lib/pollution'
import { loadBuffPool } from '@/lib/gameEngine'
import { calcEquippedStats, RARITY_META } from '@/lib/equipmentEngine'
import { normalizeGamevars, isKaleidoRoom } from '@/lib/roomState'
import { getGameApi, postGameApi } from '@/lib/gameApi'
import { useToast } from '../../admin/_shared/ui'
import CraftModal from './CraftModal'
import ItemCraftModal from './ItemCraftModal'
import LootModal from './LootModal'
import ExtractionModal from './ExtractionModal'
import PrepareModal from '@/components/PrepareModal'
import PortraitDisplay from '@/components/PortraitDisplay'
import OmegaCountdown from '@/components/OmegaCountdown'
import DeathReviewModal from '@/components/DeathReviewModal'
import {
  BrClockHud,
  BrGridPanel,
  Btn,
  BuffTag,
  HpBar,
  LogLine,
  PanelTitle,
  SLOTS,
  StaminaBar,
  T,
  cellStateFor,
  computeLocalClock,
  effectivePhase,
  fmtBrCountdown,
  hpColor,
  warnWindowSeconds,
} from './gameUi'
// Phase 31 BR：体力系统纯函数（前后端共用同一份算法，客户端仅做 UX 预览，
//   真正扣除/拦截以服务端 moveToRoom 为准 → 防本地时钟漂移作弊）。
import { dtSecSince, effectiveStamina, movePenaltyMultiplier, moveStaminaCost } from '@/lib/stamina'

// ════════════════════════════════════════════════════════════════════════
// BR 静态拓扑（网格房间布局 + chamber 模板元）—— 拉取 + 跨对局缓存 + 拓扑版本失效（§5）
//   契约 clientStrategy：拓扑/模板对所有对局相同（不含 seed），故从 gamevars.br 解耦，改
//   GET /api/br/topology 拉取缓存 → 不再每动作经 Supabase realtime 广播 18.7KB 拓扑 +
//   10.9KB templateMeta（收益所在）。
//   端点返回 { rooms:[{roomId,label,region,gridX,gridY,neighborIds}], templateMeta:{[tid]:行}, version }。
//   _brTopologyCache = 模块级（跨组件实例 / 跨对局复用）；localStorage 作冷启动持久层。
//   in-flight Promise 去重并发拉取。
//   ── 拓扑版本失效（§5）──：admin 改 br_rooms → 触发器 bump updated_at → 端点 version 变大。
//   调用方传 `gamevars.br.topoVersion`（在飞局冻结的期望版本）作 expectedVersion：
//     · 缓存 version === expectedVersion ⇒ 命中（在飞局凭自己快照锁定，永不被新编辑污染）。
//     · 不一致（或缓存缺失）⇒ 视为 miss，带 `?v=<expectedVersion>` 重拉（query 仅用于打破
//       HTTP 缓存，route 忽略其值；route 仍按当前 DB 算 version 回填）。
//     · expectedVersion 为 null（旧 gamevars 无 topoVersion）⇒ 不强制版本，沿用任意现有缓存
//       （拓扑仅供房间布局/标签；致死/着色走 closePhases 快照、与拓扑无关，不破红线①）。
//   LS key 升 v2：结构新增 version 字段，与旧 v1（无 version）不兼容，避免读到旧结构误判命中。
// ════════════════════════════════════════════════════════════════════════
const BR_TOPOLOGY_LS_KEY = 'br_topology_v2'
let _brTopologyCache = null
let _brTopologyInFlight = null

function readBrTopologyFromLS() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(BR_TOPOLOGY_LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // 结构性最小校验：rooms 必须为非空数组，否则当作未命中重新拉。
    if (parsed && Array.isArray(parsed.rooms) && parsed.rooms.length > 0) return parsed
  } catch {
    /* 损坏的缓存当作未命中 */
  }
  return null
}

// 缓存命中判定：expectedVersion 为 null/undefined（无快照版本）⇒ 任意现有缓存均算命中；
//   否则要求缓存 version 与期望逐位相等（admin 编辑后 version 变 ⇒ 旧缓存失配 ⇒ miss 重拉）。
function topoMatchesVersion(topo, expectedVersion) {
  if (!topo || !Array.isArray(topo.rooms) || topo.rooms.length === 0) return false
  if (!Number.isFinite(expectedVersion)) return true
  return Number(topo.version) === Number(expectedVersion)
}

async function loadBrTopology(expectedVersion = null) {
  // 模块缓存命中且版本匹配 → 直接复用（在飞局凭自己 topoVersion 锁定）。
  if (topoMatchesVersion(_brTopologyCache, expectedVersion)) return _brTopologyCache
  // 冷启动：吃 localStorage（命中且版本匹配即填模块缓存，免一次网络）。
  const fromLs = readBrTopologyFromLS()
  if (topoMatchesVersion(fromLs, expectedVersion)) {
    _brTopologyCache = fromLs
    return _brTopologyCache
  }
  // 版本失配 / 无缓存：丢弃陈旧模块缓存，重新拉（带 ?v= 打破 HTTP 缓存）。
  if (_brTopologyInFlight) return _brTopologyInFlight
  _brTopologyInFlight = (async () => {
    try {
      // ?v=<期望版本>：route 忽略该参，仅用于让浏览器/CDN 对不同版本走不同 HTTP 缓存条目。
      const vq = Number.isFinite(expectedVersion) ? Number(expectedVersion) : 0
      const data = await getGameApi('/api/br/topology?v=' + vq)
      const topo = {
        rooms: Array.isArray(data?.rooms) ? data.rooms : [],
        templateMeta: data?.templateMeta || {},
        version: Number.isFinite(data?.version) ? Number(data.version) : 0,
      }
      _brTopologyCache = topo
      if (typeof window !== 'undefined') {
        try { window.localStorage.setItem(BR_TOPOLOGY_LS_KEY, JSON.stringify(topo)) } catch { /* 配额/隐私模式：忽略 */ }
      }
      return topo
    } finally {
      _brTopologyInFlight = null
    }
  })()
  return _brTopologyInFlight
}

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
  const [itemCraftOpen, setItemCraftOpen] = useState(false)
  const [extractOpen, setExtractOpen] = useState(false)
  const [joinLoadoutOpen, setJoinLoadoutOpen] = useState(false)
  // Phase 22: 死亡复盘 — alive→false 时拉 player_death_log 弹一次
  const [deathReview, setDeathReview] = useState(null)
  const deathHandledRef = useRef(false)

  // Phase 30 BR：本地秒级时钟（大时钟倒计时自走，不等 realtime）
  const [nowMs, setNowMs] = useState(() => Date.now())

  const mapIdRef = useRef(0)
  const mapLoadedRef = useRef(false)  // 首次 hydrate 强制载入一次可交易 NPC（即便 chamberTemplateId 恰为 0）

  // 速度：item_pool 整局静态（不按 chamber 过滤）→ 只在 loadInitial 拉一次。
  //   旧实现把它塞在 loadMapData 里、每动作 hydrateRoom 都重拉整张表，是搜索/攻击体感卡顿的首要来源。
  const loadAllItems = useCallback(async () => {
    const { data } = await supabase.from('item_pool').select('*')
    setAllItems(data || [])
  }, [])

  // Phase 19.7: chamber 模型 — chamberTemplateId 决定本房可交易非敌对实体（按 chamber_template_ids 过滤）。
  //   仅在所在 chamber 变化时调（hydrateRoom / realtime 都加 mapId 守卫），不再每动作重拉。
  const loadTradeableNpcs = useCallback(async (chamberTemplateId) => {
    const { data: nextNpcs } = await supabase
      .from('npc_pool')
      .select('id,name,entity_type,trade_wants,trade_offers,chamber_template_ids')
      .eq('tradeable', true)
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

    // Phase 30 BR：当前房内容由 roomTemplates[player.roomId] 决定（player.map 已镜像该值，
    //   显式取以防镜像缺失）；旧 chamber 模式仍用 player.map（=chamber.templateId）。
    const player = normalized.players?.[user?.id]
    const nextMapId = normalized.br?.enabled && player?.roomId != null
      ? (normalized.br.roomTemplates?.[player.roomId] ?? player?.map ?? 0)
      : (player?.map ?? 0)
    // 速度：仅当所在 chamber 变化（或首次 hydrate）才重拉可交易 NPC；与下方 realtime handler 同款守卫。
    //   item_pool 整局静态 → 不在每次 hydrate 重拉（已由 loadInitial 一次性载入）。
    if (mapIdRef.current !== nextMapId || !mapLoadedRef.current) {
      mapIdRef.current = nextMapId
      mapLoadedRef.current = true
      await loadTradeableNpcs(nextMapId)
    }
    if (refreshEquipment) {
      await loadEquipments()
    }
  }, [loadEquipments, loadTradeableNpcs, user?.id])

  const loadInitial = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }
    setLoading(true)

    const [{ data: roomData }, buffs] = await Promise.all([
      supabase.from('rooms').select('*').eq('id', roomId).single(),
      loadBuffPool(),
      loadAllItems(),  // 速度：item_pool 整局一次性载入（与房/buff 并行），此后动作不再重拉整张表
    ])

    if (!roomData) {
      router.replace('/rooms')
      setLoading(false)
      return
    }

    setBuffPool(buffs || [])
    await hydrateRoom(roomData, { refreshEquipment: true })
    setLoading(false)
  }, [hydrateRoom, loadAllItems, roomId, router, user])

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  // KP0-C ②：kaleido 单人局判定（gametype===30 · isKaleidoRoom）。
  const isKaleido = isKaleidoRoom(room)

  useEffect(() => {
    if (!user) return undefined
    // kaleido 单人局不建 realtime 订阅（无多人同步需求，动作后用 API 返回值刷新）。
    //   多人局零回归：非 kaleido 时 isKaleido 恒 false ⇒ deps 稳定 ⇒ 本 effect 仍仅挂载时运行一次。
    if (isKaleido) return undefined
    const channel = supabase
      .channel(`room-${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, payload => {
        const nextRoom = payload.new
        const normalized = normalizeGamevars(nextRoom.gamevars || {})
        setRoom(nextRoom)
        setGamevars(normalized)

        const player = normalized.players?.[user.id]
        const nextMapId = normalized.br?.enabled && player?.roomId != null
          ? (normalized.br.roomTemplates?.[player.roomId] ?? player?.map ?? 0)
          : (player?.map ?? 0)
        if (mapIdRef.current !== nextMapId) {
          mapIdRef.current = nextMapId
          loadTradeableNpcs(nextMapId)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadTradeableNpcs, roomId, user, isKaleido])

  // Phase 30 BR：本地秒级时钟 tick（仅 BR 模式开，驱动大时钟倒计时 + 扇区即时着色；
  //   chamber 模式不开，避免无谓 1s 重渲染）。
  useEffect(() => {
    if (!gamevars?.br?.enabled) return undefined
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [gamevars?.br?.enabled])

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
  const rawCurrentChamber = useMemo(
    () => raidPath[currentChamberIdx] || null,
    [raidPath, currentChamberIdx],
  )

  // Phase 24a: per-player lore 可见性过滤 — 把当前玩家解码到 level=3 的残片 id 做成 Set，
  //   chamber.loreInjections 里 sourceFragmentId 命中该 Set 的条目才展示。
  //   旧 raidPath（无 loreInjections 字段）→ 数组为空，不影响 base description。
  const myDecodedIds = useMemo(
    () => new Set(meBase?.decodedFragmentIds || []),
    [meBase?.decodedFragmentIds],
  )
  function filterLore(chamber) {
    if (!chamber) return chamber
    const base = chamber.description || ''
    const visible = (chamber.loreInjections || [])
      .filter(inj => inj.sourceFragmentId == null || myDecodedIds.has(inj.sourceFragmentId))
      .map(inj => inj.text)
    if (visible.length === 0) return chamber
    const combined = base ? `${base}\n${visible.join('\n')}` : visible.join('\n')
    return { ...chamber, description: combined }
  }
  const currentChamber = useMemo(
    () => filterLore(rawCurrentChamber),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawCurrentChamber, myDecodedIds],
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
        // Phase 24a: 预览卡也按 lore 可见性过滤
        const filtered = filterLore(raidPath[idx])
        opts.push({
          ...filtered,
          optionLabel: String.fromCharCode(65 + k), // A/B/C
          isRealNext: k === 0,
          previewOnly: k !== 0,
        })
      }
    }
    return opts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raidPath, currentChamberIdx, currentChamber?.exitCount, myDecodedIds])
  // ════════════════════════════════════════════════════════════════════
  // Phase 30 BR — 100 房网格 + 大时钟派生（仅 gamevars.br.enabled 时有意义）
  //   契约 stateShape：客户端从 room + gamevars.br 派生 brClock/brGrid/myRoom/movable，
  //   不新增 fetch 端点、不下发 seed（closePhases 已是公开禁区表）。
  // ════════════════════════════════════════════════════════════════════
  const br = gamevars?.br || null
  const brEnabled = br?.enabled === true
  // 我的当前房（BR）
  const myRoomId = brEnabled ? (meBase?.roomId ?? null) : null

  // ── BR 静态拓扑：拉 /api/br/topology → 模块缓存（跨对局）+ state（触发重渲）+ 版本失效（§5）──
  //   契约 clientStrategy：网格「房间拓扑来源」从 gamevars.br.rooms 换成此静态拓扑。
  //   gamevars.br 保留 { closePhases, roomTemplates, gridW/gridH, topoVersion } 供着色/档位/网格/失效。
  //   期望版本 = gamevars.br.topoVersion（本局冻结）；缓存版本不匹配 ⇒ effect 重拉（admin 改拓扑后新局生效）。
  //   state 初值吃模块缓存（且版本匹配才用）⇒ 同会话内换房/重挂载立即有拓扑、无闪烁；不匹配则 effect 拉。
  const brTopoVersion = Number.isFinite(br?.topoVersion) ? br.topoVersion : null
  const [brTopology, setBrTopology] = useState(() =>
    topoMatchesVersion(_brTopologyCache, Number.isFinite(gamevars?.br?.topoVersion) ? gamevars.br.topoVersion : null)
      ? _brTopologyCache
      : null,
  )
  useEffect(() => {
    if (!brEnabled) return undefined
    // 已有拓扑且版本与本局快照匹配 → 不重复请求（在飞局凭自己 topoVersion 锁定，不被新编辑污染）。
    if (topoMatchesVersion(brTopology, brTopoVersion)) return undefined
    let cancelled = false
    loadBrTopology(brTopoVersion)
      .then(topo => { if (!cancelled) setBrTopology(topo) })
      .catch(() => { /* 拉取失败：网格优雅占位（loading），下次依赖变化再试 */ })
    return () => { cancelled = true }
  }, [brEnabled, brTopology, brTopoVersion])

  // ── Phase 31 BR：体力 + 移动惩罚倍率（客户端 UX 派生，服务端 moveToRoom 权威）──
  //   依赖 nowMs（BR 1s tick L194-198）⇒ 每秒重算，体力条平滑增长、消耗预览随等待时间下降。
  //   注意：刻意不放进 me useMemo（me 只依赖 [equipped, meBase]，不随 nowMs 变 ⇒ 放进去不会每秒刷新）。
  //   非 BR 模式下 nowMs 不 tick，这些值恒定为静态快照，开销可忽略。
  const staminaNow = brEnabled && meBase ? effectiveStamina(meBase, nowMs) : null
  const staminaMax = meBase?.maxStamina ?? STAMINA_CONFIG.MAX_STAMINA
  const moveDtSec = dtSecSince(meBase?.lastMoveAt ?? null, nowMs)
  const moveMult = movePenaltyMultiplier(moveDtSec)
  const moveCostPreview = moveStaminaCost(moveDtSec)
  // 本地预判：体力不足以再走一步（与服务端 no_stamina 双保险，仅做点击短路 + 着色，非安全边界）。
  const moveBlocked = staminaNow != null && staminaNow < moveCostPreview

  // ── Phase 31 BR：搜索 / 攻击「平消耗」预判（仅 UX 提示，服务端权威拦截 no_stamina）──
  //   平消耗 = 固定单价、不走移动惩罚倍率（与 move 的关键区别）。数值读 STAMINA_CONFIG，
  //   缺字段时退化到任务给定默认（搜索 5 / 攻击 8）⇒ 后端未上线该常量也不报错，纯加提示。
  const searchCost = Number.isFinite(STAMINA_CONFIG.SEARCH_COST) ? STAMINA_CONFIG.SEARCH_COST : 5
  const attackCost = Number.isFinite(STAMINA_CONFIG.ATTACK_COST) ? STAMINA_CONFIG.ATTACK_COST : 8
  // 体力不足以搜索 / 攻击（本地短路 + 灰显；非安全边界，服务端仍以 no_stamina 为准）。
  const searchBlocked = staminaNow != null && staminaNow < searchCost
  const attackBlocked = staminaNow != null && staminaNow < attackCost

  // 大时钟（本地推算，server started_at 为锚点；nowMs 每秒 tick 细化倒计时）
  const brClock = useMemo(() => {
    if (!brEnabled) return null
    return computeLocalClock({
      startedAtMs: room?.started_at ? Date.parse(room.started_at) : null,
      phaseSeconds: br?.phaseSeconds,
      maxPhase: br?.maxPhase,
      status: room?.gamestate === 1 ? 'active' : room?.gamestate === 2 ? 'ended' : 'lobby',
    }, nowMs)
  }, [brEnabled, room?.started_at, room?.gamestate, br?.phaseSeconds, br?.maxPhase, nowMs])

  const brWarnSecs = useMemo(() => warnWindowSeconds(br?.phaseSeconds), [br?.phaseSeconds])

  // ── Phase 33 BR：时序跃迁 / 深度 ──────────────────────────────────────────
  //   我的「时间层」深度（depth）+ 有效阶段 = min(maxPhase, realPhase + depth)。
  //   depth=0 的书写者 effPhase===realPhase（看真实世界层）；跃迁者 depth>0 看更深一层
  //   （网格更多禁区 + 更高物资档），由 br_jump 抬高。封顶 maxPhase。
  //   网格着色 / 物资档 / 赌命预判全部喂 myEffPhase（替代纯 realPhase），让「跳跃者与书写者
  //   读到不同世界层」。致死 sweep 服务端已按各玩家 effectivePhase 同口径裁定（一致性铁律）。
  const brMaxPhase = br?.maxPhase ?? 4
  const myDepth = Number.isFinite(meBase?.depth) ? meBase.depth : 0
  const myEffPhase = brEnabled ? effectivePhase(brClock?.realPhase ?? 0, myDepth, brMaxPhase) : 0

  // brGrid：每房显示态数据（静态拓扑 brTopology.rooms + 派生 closePhase/lootTier/templateId）
  //   brTopology.rooms（一次拉的静态端点）：[{ roomId, label, region, gridX, gridY, neighborIds }]
  //   br.closePhases / br.roomTemplates：仍读 gamevars.br（per-raid seed 派生·公开·随对局走 realtime）
  //   拓扑未加载（brTopology=null）⇒ rooms 空 ⇒ brGrid 空 ⇒ 网格优雅占位（loading）。
  const brGrid = useMemo(() => {
    if (!brEnabled) return []
    const rooms = brTopology?.rooms ?? []
    const closePhases = br?.closePhases || {}
    return rooms.map(r => ({
      ...r,
      closePhase: Number.isFinite(closePhases[r.roomId]) ? closePhases[r.roomId] : 5,
      // 物资档按「我的有效阶段」算（跃迁者看更高档）：myEffPhase+1，钳 1..5。
      lootTier: Math.max(1, Math.min(5, myEffPhase + 1)),
      templateId: br?.roomTemplates?.[r.roomId] ?? null,
    }))
  }, [brEnabled, brTopology, br?.closePhases, br?.roomTemplates, myEffPhase])

  // 网格按 gridX/gridY 摆位（10×10）
  const brCellByXY = useMemo(() => {
    const m = new Map()
    for (const r of brGrid) m.set(`${r.gridX},${r.gridY}`, r)
    return m
  }, [brGrid])

  // 每格是否有玩家（按 roomId 聚合存活玩家）
  const brRoomHasPlayer = useMemo(() => {
    const s = new Set()
    if (!brEnabled) return s
    for (const p of allPlayers) {
      if (p.roomId != null && p.alive !== false) s.add(p.roomId)
    }
    return s
  }, [brEnabled, allPlayers])

  const brMyRoom = useMemo(
    () => (myRoomId != null ? brGrid.find(r => r.roomId === myRoomId) : null),
    [brGrid, myRoomId],
  )

  // 本地时钟驱动的扇区显示态（注入 BrGridPanel）。
  //   按「我的有效阶段」myEffPhase 而非纯 realPhase 判定 open/warning/forbidden ⇒ 跃迁者
  //   （depth>0）网格立即渲染更深世界层（更多禁区）；书写者 depth=0 时 myEffPhase===realPhase，
  //   行为与改动前完全一致。预警窗 secondsToNextPhase 仍用真实时钟（下一阶段收缩的 wall-clock 倒计时）。
  const brComputeCellState = useCallback(
    (rm) => cellStateFor(rm, myEffPhase, brClock?.secondsToNextPhase ?? null, brWarnSecs),
    [myEffPhase, brClock?.secondsToNextPhase, brWarnSecs],
  )

  // 可移动目标集合（前端预判高亮；服务端 moveToRoom 再权威校验）：
  //   myRoom.neighborIds 中本地态非 forbidden 的房（预警仍可移入）。
  const canActBr = brEnabled && !!meBase && me?.alive && !meBase?.extracted && room?.gamestate === 1
  const brMovableRoomIds = useMemo(() => {
    const s = new Set()
    if (!canActBr || !brMyRoom || !Array.isArray(brMyRoom.neighborIds)) return s
    const byId = new Map(brGrid.map(r => [r.roomId, r]))
    for (const nid of brMyRoom.neighborIds) {
      const rm = byId.get(nid)
      if (!rm) continue
      if (brComputeCellState(rm) !== 'forbidden') s.add(nid)
    }
    return s
  }, [canActBr, brMyRoom, brGrid, brComputeCellState])

  // BR 扇区计数（本地态瞬时推算）
  const brZoneCounts = useMemo(() => {
    if (!brEnabled) return { open: 0, warning: 0, forbidden: 0 }
    let forbidden = 0
    let warning = 0
    for (const r of brGrid) {
      const st = brComputeCellState(r)
      if (st === 'forbidden') forbidden++
      else if (st === 'warning') warning++
    }
    return { open: brGrid.length - forbidden, warning, forbidden }
  }, [brEnabled, brGrid, brComputeCellState])

  const brIsFinalPhase = brEnabled && (brClock?.realPhase ?? 0) >= (br?.maxPhase ?? 4) && room?.gamestate === 1

  // ════════════════════════════════════════════════════════════════════
  // Phase 33 BR：时序跃迁按钮 + 赌命预判（客户端 UX；服务端 br_jump 权威校验/消耗/致死）
  //   跃迁 = 单向阶梯：消耗一枚 jump_charge>0 道具（时序跃迁器）→ depth+1 → 看更深时间层。
  //   代价 = 道具 + 冷却 + 赌命（跃迁后所在扇区在新有效阶段若为禁区 → 服务端 sweep 当场致死）。
  // ════════════════════════════════════════════════════════════════════
  // 速度：item 名→定义 Map（随 allItems 一次 O(n) 构建），替代各处 allItems.find(i=>i.name===name) 的 O(n) 线性扫。
  const itemsByName = useMemo(() => {
    const m = new Map()
    for (const it of allItems || []) m.set(it.name, it)
    return m
  }, [allItems])

  // 跃迁器数量：镜像背包体力剂徽标的查表模式 —— 累加 inventory 中 jump_charge>0 道具件数。
  const jumpItemCount = useMemo(() => {
    if (!brEnabled) return 0
    return Object.entries(invCount).reduce(
      (sum, [name, c]) => sum + (((itemsByName.get(name)?.jump_charge ?? 0) > 0) ? c : 0),
      0,
    )
  }, [brEnabled, invCount, itemsByName])
  // 跃迁冷却倒计时（复用 stamina 的 dtSecSince；lastJumpAt 缺失 ⇒ Infinity ⇒ 冷却 0，可跳）。
  //   依赖 nowMs（BR 1s tick）⇒ 每秒刷新。冷却时长读 JUMP_CONFIG.COOLDOWN_SEC（缺失兜底 60s）。
  const jumpCooldownSec = Number.isFinite(JUMP_CONFIG?.COOLDOWN_SEC) ? JUMP_CONFIG.COOLDOWN_SEC : 60
  const jumpDtSec = dtSecSince(meBase?.lastJumpAt ?? null, nowMs)
  const jumpCdLeft = Number.isFinite(jumpDtSec) ? Math.max(0, Math.ceil(jumpCooldownSec - jumpDtSec)) : 0
  // 跃迁后我的有效阶段（深一层）；与 myEffPhase 相等 ⇒ 已达最深层（depth+1 无增益），按钮禁用。
  const nextEff = brEnabled ? effectivePhase(brClock?.realPhase ?? 0, myDepth + 1, brMaxPhase) : 0
  const jumpCapped = brEnabled && nextEff === myEffPhase
  // 赌命预判：跃迁后所在扇区在「深一层」是否变禁区（nextEff >= 我所在扇区 closePhase）→ 即死。
  //   与服务端 forbidden(seed, effPhase, roomId)（phase>=closePhase 即禁）同口径。
  const jumpWouldKill = brEnabled && !!brMyRoom && Number.isFinite(brMyRoom.closePhase) && nextEff >= brMyRoom.closePhase
  // 可跳条件：能行动 + 不忙 + 有道具 + 不在冷却 + 未达最深层 + 非末路阶段。
  //   赌命（jumpWouldKill）刻意不禁用 —— 允许玩家故意跳死/战术弃局，仅红字警告 + 首点 confirm。
  const jumpDisabled = !canActBr || busy || jumpItemCount <= 0 || jumpCdLeft > 0 || jumpCapped || brIsFinalPhase
  // 已对此「赌命跳」确认过一次 → 避免每次点击重复弹 confirm（仅首点拦截）。
  const jumpKillConfirmedRef = useRef(false)
  useEffect(() => {
    // 离开赌命态（换房 / 阶段变化 / 已不致死）→ 复位，下次再进赌命态重新确认。
    if (!jumpWouldKill) jumpKillConfirmedRef.current = false
  }, [jumpWouldKill])

  async function handleBrJump() {
    if (jumpDisabled) {
      // 本地短路提示（与禁用态文案一致；服务端 br_jump 仍是权威拦截）。
      if (jumpItemCount <= 0) toast('没有可用的时序跃迁器', 'error')
      else if (jumpCdLeft > 0) toast(`跃迁冷却中（剩 ${jumpCdLeft}s）`, 'error')
      else if (jumpCapped) toast('已达最深时序层，无法继续跃迁', 'error')
      return
    }
    // 赌命跳：跃迁后所在扇区即禁区 → 首点弹 confirm（防误触），确认后本局该态内不再追问。
    if (jumpWouldKill && !jumpKillConfirmedRef.current) {
      if (!confirm('确认跃迁？\n你当前所在扇区在深一层为禁区，跃迁将立即致死。')) return
      jumpKillConfirmedRef.current = true
    }
    const next = await runGameAction('br_jump', {})
    if (next) toast(`🜂 已跃迁至深度 ${myDepth + 1}（有效阶段 ${nextEff}）`, 'success')
  }

  // ════════════════════════════════════════════════════════════════════
  // 缩圈致死·客户端（本期客户端实现）—— 契约 warning + br_tick 触发
  //   服务端仍是唯一权威：致死由每动作 sweep / br_tick re-validate（按 rooms.started_at
  //   wall-clock 重算 forbidden）裁定，客户端只做① 显著撤离警告 ② 我的扇区刚收缩时
  //   近实时催一次复核（br_tick）。本地时钟仅驱动 UX，不改变服务端判据。
  // ════════════════════════════════════════════════════════════════════
  const brMyCellState = brEnabled && brMyRoom ? brComputeCellState(brMyRoom) : null
  // 我的扇区「将于下阶段收缩且已进预警窗」（cellStateFor 返回 'warning'）→ 显著横幅 + 倒计时。
  const myWarning = canActBr && brMyCellState === 'warning'
  // 我的扇区按本地时钟已判定「收缩为禁区」→ 催一次 br_tick 让服务端权威复核致死。
  const myForbidden = brEnabled && me?.alive && !meBase?.extracted && room?.gamestate === 1 && brMyCellState === 'forbidden'

  // (1) 收缩预警 toast：仅在 myWarning 由 false→true 的边沿弹一次（防 1s tick 每秒重弹）。
  const warnEdgeRef = useRef(false)
  useEffect(() => {
    if (myWarning && !warnEdgeRef.current) {
      warnEdgeRef.current = true
      toast('⚠ 你所在扇区即将收缩 — 立即撤离至相邻开放扇区！', 'error')
    } else if (!myWarning) {
      // 离开预警态（已撤离 / 已收缩 / 阵亡）→ 复位，下次再进预警窗可再次提醒。
      warnEdgeRef.current = false
    }
  }, [myWarning, toast])

  // (2) br_tick 自触发：当我的扇区由「非 forbidden」翻「forbidden」的那一拍发一次 br_tick，
  //   让服务端按 wall-clock 近实时复核并致死（不信客户端：假触发会被服务端 forbidden 判 false、无副作用）。
  //   用 lastTickedPhaseRef 记「已就当前 realPhase 的收缩边沿触发过」⇒ 每个收缩阶段只发一次，不随 1s tick 刷。
  //   失败静默（best-effort 背景催办）：真正致死最终仍由下一次任意动作的全房 sweep + realtime alive=false 兜底。
  const lastTickedPhaseRef = useRef(null)
  useEffect(() => {
    const phase = brClock?.realPhase ?? null
    if (!myForbidden || phase == null) {
      // 我的扇区不再处于「刚收缩」态（换房到开放区 / 局结束）→ 复位，允许后续阶段再次触发。
      if (!myForbidden) lastTickedPhaseRef.current = null
      return
    }
    if (lastTickedPhaseRef.current === phase) return  // 当前阶段已催过 → 去抖
    lastTickedPhaseRef.current = phase
    // 直发 postGameApi（不走 runGameAction 的错误 toast）：br_tick 是背景复核，
    //   即便后端未上线该动作（返回错误）也不打扰玩家；成功则 hydrate 最新 room（带回 alive=false）。
    ;(async () => {
      try {
        const { room: nextRoom } = await postGameApi('/api/game/actions', {
          roomId: Number(roomId),
          action: 'br_tick',
        })
        if (nextRoom) await hydrateRoom(nextRoom)
      } catch {
        /* 静默：服务端会在下一次任意动作的全房 sweep / realtime 推送中权威致死 */
      }
    })()
  }, [myForbidden, brClock?.realPhase, hydrateRoom, roomId])

  const inGame = !!meBase
  // Phase 30 BR：当前房模板 id（roomTemplates[myRoomId]，与 meBase.map 镜像）+ templateMeta 行
  //   roomTemplates 仍读 gamevars.br（保留字段）；templateMeta 改查一次拉的静态 brTopology
  //   （拓扑未加载时为 null ⇒ effectiveMapConfig 回退 currentChamber/mapConfig，UX 不退化）。
  const brCurrentTemplateId = brEnabled && myRoomId != null
    ? (br?.roomTemplates?.[myRoomId] ?? meBase?.map ?? null)
    : null
  const brTemplateMeta = brCurrentTemplateId != null ? (brTopology?.templateMeta?.[brCurrentTemplateId] || null) : null
  // Phase 19.7: 用 currentChamber 替代 mapConfig（保留 mapConfig 变量名兼容旧引用）。
  // Phase 30 BR：currentChamber 为空（raidPath 空），改从 brTopology.templateMeta[当前房模板] 派生 mapConfig，
  //   驱动头部区域名 / 区域评估 is_exit / 「结构退避」撤离消耗。字段名对齐旧 chamber（snake_case）。
  const effectiveMapConfig = currentChamber ? {
    name: currentChamber.name,
    description: currentChamber.description,
    is_exit: currentChamber.isExit,
    exit_cost: currentChamber.exitCost,
    adjacent_maps: [], // 新模型无邻接
  } : brTemplateMeta ? {
    name: brMyRoom?.label ? `${brTemplateMeta.name}（${brMyRoom.label}）` : (brTemplateMeta.name || `扇区 ${myRoomId}`),
    description: brTemplateMeta.description || '',
    is_exit: brTemplateMeta.is_exit ?? brTemplateMeta.isExit ?? false,
    exit_cost: brTemplateMeta.exit_cost ?? brTemplateMeta.exitCost ?? null,
    adjacent_maps: [],
  } : mapConfig
  const aliveCount = room?.alivenum ?? allPlayers.filter(player => player.alive).length
  const currentMapCorpseCount = useMemo(
    () => (gamevars?.corpses || []).filter(corpse => corpse.mapId === (meBase?.map ?? 0)).length,
    [gamevars?.corpses, meBase?.map],
  )
  // Phase 30 BR：『同房』判定改用 roomId（不同 roomId 可能采样到同 templateId → 同 map 不等于同房，
  //   避免跨房误伤）；旧 chamber 模式仍用 player.map。
  const pvpTargets = useMemo(
    () => allPlayers.filter(player => {
      if ((player.id || player.uid) === user?.id || !player.alive) return false
      return brEnabled
        ? (player.roomId ?? null) === (meBase?.roomId ?? null) && meBase?.roomId != null
        : (player.map ?? 0) === (meBase?.map ?? 0)
    }),
    [allPlayers, brEnabled, meBase?.map, meBase?.roomId, user?.id],
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
  }, [gamevars?.npcInstances, meBase?.map, meBase?.roomId, meBase?.hp, meBase?.maxHp, meBase?.inventory, mapConfig])

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

  // 残片解码升级闪光 toast — 检测 lastFragmentLevelUp.seq 变化（升级反馈此前只在日志里不够突出）
  const lastFragSeqRef = useRef(0)
  const fragLevelUp = meBase?.lastFragmentLevelUp
  useEffect(() => {
    if (!fragLevelUp?.seq) return
    if (fragLevelUp.seq <= lastFragSeqRef.current) return
    lastFragSeqRef.current = fragLevelUp.seq
    toast(`🧬 残片【${fragLevelUp.name}】解码度提升至 ${fragLevelUp.level}/3`, 'levelup')
  }, [fragLevelUp, toast])

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

  // Phase 24b: 加入对局走 PrepareModal — 4 类点数 + 商店购买 + 兑换
  async function handleJoinWithLoadout(payload) {
    // Phase 24b payload = { classId, usedHighPt, catalogPurchases:[{catalogId,qty}], exchanges:[{rateId,times}] }
    //   research-2026-05-29-A: 当 RUN_GOALS.ENABLED 时 payload 还含 runGoal:{type,target}，
    //   join 控制流将其存 per-player gamevars.runGoal（Phase 24b 接入），结算时评估写 runGoalResult。
    const next = await runGameAction('join', { loadout: payload }, { refreshEquipment: true })
    if (next) {
      setJoinLoadoutOpen(false)   // 关键：加入成功后关闭入场准备模态，否则它始终盖在游戏画面上（zIndex 1000）= 看着「没反应」、再点又弹一次成功 toast
      toast('🎒 装载完成，已进入虚拟空间', 'success')
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

  // Phase 03/49: 局内道具合成 — 提交 craftItem，成功/失败的细节由服务端写进日志面板
  async function handleCraftItem(recipeId) {
    const next = await runGameAction('craftItem', { recipeId })
    if (next) toast('🧪 合成已执行 · 详见日志', 'success')
    return next
  }

  async function handleExtract(opts = {}) {
    const next = await runGameAction('extract', { leaveProbe: !!opts.leaveProbe }, { refreshEquipment: true })
    if (next) {
      toast(opts.leaveProbe ? '🚪 已撤离 · 残影已留存' : '🚪 已成功撤离，物资已入库', 'success')
      setExtractOpen(false)
    }
  }

  async function handleEmergencyRetreat() {
    if (!confirm('确认紧急撤离？\n个人污染将 +' + POLLUTION_CONFIG.EMERGENCY_COST + '%')) return
    const next = await runGameAction('emergencyRetreat', {})
    if (next) {
      toast(`已撤离至安全区（个人污染 +${POLLUTION_CONFIG.EMERGENCY_COST}%）`, 'success')
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

  // Phase 22: 死亡复盘 — 检测 alive→false，拉 player_death_log 最新一行组装 review（缺字段用客户端快照兜底）
  useEffect(() => {
    if (!inGame || !meBase || meBase.alive !== false) {
      deathHandledRef.current = false
      return undefined
    }
    if (deathHandledRef.current) return undefined
    deathHandledRef.current = true

    // 死亡当刻的客户端快照（DB 行缺字段时兜底）
    const startedAt = room?.started_at ? new Date(room.started_at).getTime() : null
    const fallbackSurvived = startedAt && !Number.isNaN(startedAt)
      ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : null
    const idx = meBase.chamberIndex ?? 0
    const fallbackDepth = Number.isFinite(idx) && idx >= 0 ? idx + 1 : null
    const fallbackChamberName = raidPath[idx]?.name || null

    let cancelled = false
    const assemble = (row) => {
      if (cancelled) return
      const ctx = row?.context || {}
      const lost = Array.isArray(ctx.lostFragments) ? ctx.lostFragments
        : Array.isArray(ctx.destroyedFragments) ? ctx.destroyedFragments : []
      setDeathReview({
        causeCategory: row?.cause_category || 'other',
        causeText: row?.reason_text || null,
        survivedSeconds: row?.survived_seconds ?? fallbackSurvived,
        chamberDepth: row?.chamber_depth ?? fallbackDepth,
        chamberName: fallbackChamberName,
        lostFragments: lost,
      })
    }
    const fetchRow = async () => {
      try {
        const { data } = await supabase
          .from('player_death_log')
          .select('reason_text, cause_category, survived_seconds, chamber_depth, context')
          .eq('user_id', user.id)
          .eq('room_id', Number(roomId))
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        return data || null
      } catch {
        return null
      }
    }
    ;(async () => {
      let row = await fetchRow()
      // 极少数情况下 realtime 早于 death_log commit 到达 → 600ms 后重试一次
      if (!row && !cancelled) {
        await new Promise(r => setTimeout(r, 600))
        if (!cancelled) row = await fetchRow()
      }
      assemble(row)
    })()

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inGame, meBase?.alive, roomId, user?.id])

  if (authLoading || loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: T.bg0, color: T.dim, flexDirection: 'column', gap: 14 }}>
        <div style={{ width: 32, height: 32, border: `3px solid ${T.border}`, borderTopColor: T.cyan, borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <span style={{ fontFamily: 'monospace', letterSpacing: 2, fontSize: 12 }}>LOADING...</span>
      </div>
    )
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg0, color: T.text }}>
        请先登录后再进入游戏页面。
      </div>
    )
  }

  if (!room) return null

  return (
    <div style={{ height: '100dvh', background: T.bg0, color: T.text, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-noto-sans-sc), system-ui, sans-serif', fontSize: 13, overflow: 'hidden' }}>
      <ToastContainer />
      <CraftModal
        open={craftOpen}
        onClose={() => setCraftOpen(false)}
        player={meBase}
        equipments={equipments}
        onCraft={handleCraft}
      />
      <ItemCraftModal
        open={itemCraftOpen}
        onClose={() => setItemCraftOpen(false)}
        player={meBase}
        onCraft={handleCraftItem}
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
        // Phase 21.2: 计算玩家持有的 platform_part 件数
        platformPartCount={(() => {
          const partNames = new Set((allItems || []).filter(i => i.kind === 'platform_part').map(i => i.name))
          return (meBase?.inventory || []).filter(name => partNames.has(name)).length
        })()}
      />
      <PrepareModal
        open={joinLoadoutOpen}
        roomTitle={room ? `对局 #${room.gamenum || room.id}` : ''}
        onClose={() => setJoinLoadoutOpen(false)}
        onConfirm={handleJoinWithLoadout}
      />
      <DeathReviewModal
        review={deathReview}
        onClose={() => setDeathReview(null)}
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
        @keyframes brPulse{0%,100%{opacity:1}50%{opacity:.45}}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      {/* Phase 18.4: 70% 张力警报横幅（持久显示，玩家可见即提醒）。
          BR 决策（用户定「移除前台横幅」）：brEnabled 时隐藏前台污染横幅，仿
          {!brEnabled && <OmegaCountdown/>} 模式条件渲染（服务端污染机制/字段不动，仅前台不渲染）。 */}
      {!brEnabled && inGame && me?.alive && !meBase?.extracted && envPollutionLevel >= POLLUTION_WARN_THRESHOLD && envPollutionLevel < POLLUTION_FORCE_THRESHOLD && (
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

      {/* 缩圈致死预警横幅：我的扇区将于下阶段收缩且已进预警窗（myWarning）→ 全宽红条 + 实时倒计时。
          比网格里的黄格更醒目（脉冲 + 红色 + 大倒计时），引导立即撤离。倒计时随 BR 1s tick 刷新。
          纯 UX 提示：真正致死仍由服务端 sweep / br_tick 按 wall-clock 权威裁定。 */}
      {myWarning && (
        <div style={{
          background: `linear-gradient(90deg, ${T.red}30, ${T.yellow}1a, ${T.red}30)`,
          borderBottom: `2px solid ${T.red}80`,
          padding: '9px 20px',
          fontSize: 13, fontWeight: 700, color: T.red,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          textShadow: `0 0 12px ${T.red}55`,
          animation: 'brPulse 1.2s ease-in-out infinite',
        }}>
          <span style={{ fontSize: 16 }}>⚠</span>
          <span>你所在扇区即将收缩，立即撤离！</span>
          <span style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 16, fontWeight: 900,
            color: T.yellow, letterSpacing: 1,
            padding: '1px 10px', borderRadius: 6,
            background: `${T.red}22`, border: `1px solid ${T.yellow}55`,
          }}>
            {fmtBrCountdown(brClock?.secondsToNextPhase)} 后致命
          </span>
        </div>
      )}

      {/* Phase 18.4: 90% 强制撤离倒计时模态（不可关）。
          BR 决策（用户定「移除前台横幅」）：brEnabled 时不渲染前台强制撤离模态（服务端机制不动）。 */}
      {!brEnabled && forceRetreatActive && me?.alive && !meBase?.extracted && (
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
              环境污染 {envPollutionLevel}%，结构裂解临界。<br/>
              系统将在倒计时归零时自动紧急撤离。
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
              ⚠ 立即紧急撤离
            </button>
            <div style={{ fontSize: 10, color: T.dim2, marginTop: 10 }}>
              （个人污染将 +{POLLUTION_CONFIG.EMERGENCY_COST}%，撤离至安全区）
            </div>
          </div>
        </div>
      )}

      <div style={{ background: `linear-gradient(90deg,${T.bg2} 0%,${T.bg3} 50%,${T.bg2} 100%)`, borderBottom: `1px solid ${T.borderB}`, padding: '0 20px', height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: T.cyan, letterSpacing: 2, textShadow: `0 0 20px ${T.cyan}80` }}>
          虚拟空间实例 #{room.gamenum || room.id}
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: T.dim, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: T.text, fontWeight: 700 }}>{effectiveMapConfig?.name || '未知区域'}</span>

          {/* 污染 pill（环境 / 个人 / 有效等级）：BR 决策（用户定「移除前台横幅」）下整组隐藏，
              仿 {!brEnabled && <OmegaCountdown/>} 条件渲染（服务端污染字段不动，仅前台不渲染）。 */}
          {!brEnabled && (
            <>
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
            </>
          )}
          {/* Ω 倒计时 — 分层预警（research-2026-05-27-v2 P0）。
              Phase 30 BR：大时钟成为唯一时间压力，Ω 倒计时 dormant 不渲染（与大时钟 HUD 不冲突）。 */}
          {!brEnabled && <OmegaCountdown value={meBase?.omegaCountdown} />}

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
            {/* Phase 20.6: 本局应用的解锁规则（残片对路径生成的影响） */}
            {Array.isArray(gamevars?.unlocksContributed) && gamevars.unlocksContributed.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 10, color: T.dim, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 4 }}>
                  ⚛️ 本局应用的残片解锁规则 ({gamevars.unlocksContributed.length})
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {gamevars.unlocksContributed.map((u, i) => (
                    <span key={u.id || i} style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 8,
                      background: `${T.purple}18`, color: T.purple, border: `1px solid ${T.purple}40`,
                    }}>
                      🔓 {u.name || `残片 #${u.id}`}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: T.dim2, marginTop: 4, fontStyle: 'italic' }}>
                  这些完全解码的残片影响了本局扇区抽取权重、叙事短句、物资掉落
                </div>
              </div>
            )}

            {/* research-2026-05-29-A: 本局目标 · 个人评级（个人化胜利）。RUN_GOALS.ENABLED 门控，
                meBase.runGoalResult 由 Phase 24b extract/结局评估（evaluateRunGoal 产物）写入。
                红线：评级仅叙事兑现，不附带任何点数 / 掉落 / power 收益。预埋不启用时不渲染。 */}
            {RUN_GOALS.ENABLED && meBase?.runGoalResult && (() => {
              const r = meBase.runGoalResult
              const rating = runGoalRating(r)
              if (!rating) return null
              const gradeColor = rating.grade === 'S' ? T.yellow
                : rating.grade === 'A' ? T.green
                : rating.grade === 'B' ? T.cyan : T.dim
              return (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 10, color: T.dim, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>
                    🎯 本局目标 · 个人评级
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 22, fontWeight: 900, color: gradeColor,
                      width: 38, height: 38, lineHeight: '38px', textAlign: 'center',
                      borderRadius: 8, border: `2px solid ${gradeColor}`, background: `${gradeColor}1a`,
                    }}>{rating.grade}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                        {r.icon} {r.label} — {rating.text}
                      </div>
                      <div style={{ fontSize: 11, color: r.achieved ? T.green : T.dim, fontFamily: 'monospace', marginTop: 2 }}>
                        进度 {r.progress} / {r.target} {r.achieved ? '✓' : ''}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Phase 18.2: 引导玩家去 Archive 查看本局贡献 */}
            {/* research-2026-05-29-A: 结局=房间级兑现，4 结局为"收集所有结局"replay 钩子，外显再出勤动机 */}
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${T.border}`, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a
                href="/rooms"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 11, color: T.purple, textDecoration: 'none',
                  padding: '4px 10px', borderRadius: 6,
                  background: `${T.purple}18`, border: `1px solid ${T.purple}40`,
                }}
              >
                🔁 返回大厅 · 收集其它结局 →
              </a>
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '300px 1fr 300px', overflow: 'hidden' }}>
        <div style={{ borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bg1 }}>
          {/* ① 常驻核心状态条：flexShrink:0 + 不内滚 ⇒ HP/体力/属性永远在视口内，
                不再被 flex:1 挤成小滚动区。高度由内容自然撑开（约 130-160px）。 */}
          <PanelTitle>👤 {me ? me.name : '未加入'}</PanelTitle>
          <div style={{ padding: '10px 12px', flexShrink: 0, borderBottom: `1px solid ${T.border}` }}>
            {me ? (
              <>
                <HpBar hp={me.hp || 0} max={me.maxHp || 100} h={8} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11 }}>
                  <span style={{ color: hpColor(me.hp, me.maxHp), fontFamily: 'monospace', fontWeight: 700 }}>{me.hp}</span>
                  <span style={{ color: T.dim }}>{me.maxHp}</span>
                </div>

                {/* 体力条（BR 专属）：紧跟 HP 下方，黄绿/cyan 系区别于 HP 红。
                    value=本地懒回复 effectiveStamina(nowMs)，复用 1s tick 平滑增长。 */}
                {brEnabled && staminaNow != null && (
                  <div style={{ marginTop: 8 }}>
                    <StaminaBar value={staminaNow} max={staminaMax} h={8} nextCost={moveCostPreview} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11 }}>
                      <span style={{ color: staminaNow < moveCostPreview ? T.red : T.cyan, fontFamily: 'monospace', fontWeight: 700 }}>
                        体力 {Math.floor(staminaNow)}
                      </span>
                      <span style={{ color: T.dim }}>{staminaMax}</span>
                    </div>
                    {/* 移动消耗预览：>1 倍率警示黄/红 + 「快速移动·体力惩罚」；1× 正常 dim。 */}
                    <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.4 }}>
                      {moveMult > 1 ? (
                        <span style={{ color: moveMult >= 3 ? T.red : T.yellow }}>
                          ⚡ 快速移动 · 体力惩罚 ×{moveMult.toFixed(1)}（约 {moveCostPreview} 体力）
                        </span>
                      ) : (
                        <span style={{ color: T.dim }}>移动消耗 {moveCostPreview} 体力（正常）</span>
                      )}
                      {moveBlocked && (
                        <span style={{ color: T.red, marginLeft: 6 }}>· 体力不足，需等待回复</span>
                      )}
                    </div>
                    {/* 消耗速查（小字）：搜索/攻击为平消耗（固定单价），移动随快速移动惩罚倍率浮动。 */}
                    <div style={{ marginTop: 4, fontSize: 9, color: T.dim2, lineHeight: 1.5 }}>
                      消耗：搜索 -{searchCost} · 攻击 -{attackCost} · 移动 -{STAMINA_CONFIG.MOVE_COST ?? 10}×倍率
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 8, display: 'flex', gap: 12, fontSize: 11 }}>
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

          {/* ② 角色立绘（纯展示，设置入口在 /profile）：flexShrink:0 + maxHeight 收敛，
                在 300px 栏内不喧宾夺主吃掉过多竖向空间。 */}
          <div style={{ flexShrink: 0, maxHeight: 220, overflow: 'hidden', display: 'flex', justifyContent: 'center', borderBottom: `1px solid ${T.border}` }}>
            <PortraitDisplay
              portraitUrl={meBase?.portraitUrl ?? null}
              dead={meBase && !meBase.alive}
            />
          </div>

          {/* ③ 统一向下滚动区：flex:1 + overflowY:auto + minHeight:0（关键：minHeight:0 让 flex 子级
                可被压缩并由自身滚动）。区域评估 / PvP / 交易 / 背包 全收进这一处，
                各块移除自身 maxHeight 内滚 ⇒ 消除嵌套滚动条。 */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {/* Phase 18.5: 区域评估小卡 — 战斗强度 + 撤离成功率 */}
          {inGame && me?.alive && !meBase?.extracted && (
            <>
              <PanelTitle right={<span style={{ fontSize: 10, color: T.dim, fontWeight: 400 }}>{brEnabled ? '当前扇区' : '当前区域'}</span>}>📊 区域评估</PanelTitle>
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

          <PanelTitle right={<span style={{ fontSize: 10, color: T.dim, fontWeight: 400 }}>{brEnabled ? '同扇区可攻击' : '同地图可攻击'}</span>}>⚔️ PvP</PanelTitle>
          <div style={{ padding: '10px 12px' }}>
            {pvpTargets.length === 0 ? (
              <div style={{ color: T.dim, fontSize: 12 }}>{brEnabled ? '当前扇区没有可攻击玩家' : '当前区域没有可攻击玩家'}</div>
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
                      <Btn
                        variant="danger"
                        size="sm"
                        disabled={busy || !me?.alive || room.gamestate === 2 || (brEnabled && attackBlocked)}
                        onClick={() => {
                          // 体力不足本地短路（服务端 no_stamina 权威拦截）。仅 BR 模式有体力。
                          if (brEnabled && attackBlocked) {
                            toast(`体力不足，无法攻击（需 ${attackCost} 体力）`, 'error')
                            return
                          }
                          runGameAction('attackPlayer', { targetUid: target.id || target.uid })
                        }}
                        sx={{ flexDirection: 'column', gap: 1 }}
                      >
                        攻击
                        {brEnabled && staminaNow != null && (
                          <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.85 }}>
                            {attackBlocked ? '体力不足' : `-${attackCost}`}
                          </span>
                        )}
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
              <div style={{ padding: '10px 12px' }}>
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
              <div style={{ padding: '8px 12px' }}>
                {Object.keys(invCount).length === 0 ? (
                  <div style={{ textAlign: 'center', color: T.dim, padding: '12px 0', fontSize: 11 }}>背包空空如也</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Object.entries(invCount).map(([name, count]) => {
                      const itemDef = itemsByName.get(name)
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
                            {/* 体力回复道具提示（绿字）：读后端 stamina_restore 字段，>0 才显示；
                                一份 = N 个同名道具，每次用 1 个 ⇒ count = 剩余可用次数（服务端权威结算）。 */}
                            {itemDef?.stamina_restore > 0 && (
                              <div style={{ fontSize: 10, color: T.green, marginTop: 2, fontWeight: 600 }}>
                                +{itemDef.stamina_restore} 体力 · 剩 {count} 次
                              </div>
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
          </div>{/* ③ 统一向下滚动区结束 */}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.border}`, background: T.bg1, flexShrink: 0 }}>
            {currentMapCorpseCount > 0 && (
              <div style={{ textAlign: 'center', color: T.dimB, fontSize: 11, marginBottom: 10 }}>
                {brEnabled ? '当前扇区' : '当前区域'}有 {currentMapCorpseCount} 具尸体，搜索时可能发现可搜刮目标
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
                {/* Phase 21.4: 探针遭遇卡 */}
                {meBase?.probeEncounter && (
                  <div style={{
                    background: T.bg0, borderRadius: 10,
                    border: `1px solid ${T.purple}50`, borderLeft: `3px solid ${T.purple}`,
                    padding: '14px 16px', marginBottom: 12,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 11, color: T.dimB, marginBottom: 2 }}>另一位玩家留下 · {meBase.probeEncounter.ownerPseudonym || '匿名观测者'}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.purple }}>🛰 残影{meBase.probeEncounter.fragmentCount > 0 ? ` · 携 ${meBase.probeEncounter.fragmentCount} 残片` : ''}</div>
                      </div>
                      <div style={{ fontSize: 10, color: T.dim, fontFamily: 'monospace' }}>
                        #{String(meBase.probeEncounter.probeId).slice(-6)}
                      </div>
                    </div>
                    <HpBar hp={meBase.probeEncounter.hp} max={meBase.probeEncounter.maxHp} h={8} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11 }}>
                      <span style={{ color: hpColor(meBase.probeEncounter.hp, meBase.probeEncounter.maxHp), fontFamily: 'monospace', fontWeight: 700 }}>
                        HP {meBase.probeEncounter.hp}/{meBase.probeEncounter.maxHp}
                      </span>
                      <span style={{ color: T.dim }}>
                        ATK {meBase.probeEncounter.atk} · DEF {meBase.probeEncounter.def}
                      </span>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 10, color: T.dim2 }}>
                      真实玩家的异步残影 · 非系统生成 · 属性已按你的实力校准
                    </div>
                    {meBase.probeEncounter.fragmentCount > 0 && (
                      <div style={{ marginTop: 8, fontSize: 11, color: T.purple, padding: '6px 8px', background: `${T.purple}10`, borderRadius: 6 }}>
                        🎁 携带 {meBase.probeEncounter.fragmentCount} 份残片 — 击败后可夺取 1 份
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <Btn variant="danger" loading={busyAction === 'probeAttack'} loadingText="交战中..." sx={{ flex: 2, padding: '10px 0', fontSize: 13, fontWeight: 700 }} onClick={() => runGameAction('probeAttack')} disabled={!me?.alive || room.gamestate === 2}>
                        ⚔️ 袭击残影
                      </Btn>
                      <Btn variant="ghost" sx={{ flex: 1, padding: '10px 0' }} onClick={() => runGameAction('probeIgnore')} disabled={busy || !me?.alive || room.gamestate === 2}>
                        放过
                      </Btn>
                    </div>
                  </div>
                )}

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
                      <Btn
                        variant="danger"
                        loading={busyAction === 'attackNpc'}
                        loadingText="袭击中..."
                        sx={{ flex: 2, padding: '10px 0', fontSize: 13, fontWeight: 700, flexDirection: 'column', gap: 2 }}
                        onClick={() => {
                          // 体力不足本地短路（服务端 no_stamina 权威拦截）。仅 BR 模式有体力。
                          if (brEnabled && attackBlocked) {
                            toast(`体力不足，无法攻击（需 ${attackCost} 体力）`, 'error')
                            return
                          }
                          runGameAction('attackNpc')
                        }}
                        disabled={!me?.alive || room.gamestate === 2 || (brEnabled && attackBlocked)}
                      >
                        ⚔️ 袭击（一次性）
                        {brEnabled && staminaNow != null && (
                          <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.85 }}>
                            {attackBlocked ? '体力不足' : `体力 -${attackCost}`}
                          </span>
                        )}
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

                <Btn
                  variant="primary"
                  loading={busyAction === 'search'}
                  loadingText="搜索中..."
                  sx={{ width: '100%', marginBottom: 8, fontSize: 14, padding: '12px 0', fontWeight: 700, flexDirection: 'column', gap: 2 }}
                  onClick={() => {
                    // 体力不足本地短路（省一次往返；服务端 no_stamina 仍是权威拦截）。仅 BR 模式有体力。
                    if (brEnabled && searchBlocked) {
                      toast(`体力不足，无法搜索（需 ${searchCost} 体力）`, 'error')
                      return
                    }
                    runGameAction('search')
                  }}
                  disabled={!me?.alive || room.gamestate === 2 || (brEnabled && searchBlocked)}
                >
                  搜索区域
                  {brEnabled && staminaNow != null && (
                    <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.85 }}>
                      {searchBlocked ? '体力不足' : `体力 -${searchCost}`}
                    </span>
                  )}
                </Btn>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <Btn variant="warn" onClick={() => setCraftOpen(true)} sx={{ width: '100%' }} disabled={!me?.alive || room.gamestate === 2}>
                    装备合成
                  </Btn>
                  <Btn variant="warn" onClick={() => setItemCraftOpen(true)} sx={{ width: '100%' }} disabled={!me?.alive || room.gamestate === 2}>
                    道具合成
                  </Btn>
                </div>
                {effectiveMapConfig?.is_exit && (
                  <Btn
                    variant="ghost"
                    onClick={() => setExtractOpen(true)}
                    sx={{ width: '100%', borderColor: `${T.green}50`, color: T.green, fontSize: 13, fontWeight: 700, marginBottom: 6 }}
                    disabled={!me?.alive || room.gamestate === 2}
                  >
                    🚪 撤离
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
                    ⚠ 紧急撤离（个人污染 +{POLLUTION_CONFIG.EMERGENCY_COST}%）
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

        {brEnabled ? (
          /* ════════════════════════════════════════════════════════════════
             Phase 30 BR：替换「路径前进 / 下一段 A-B / chamber」移动面板为
             100 房网格 + 大时钟 HUD。点相邻开放房 → runGameAction('move',{toRoomId})
             走现有 action 通道（dispatcher 已加 BR move 分支 → moveToRoom）。
             ════════════════════════════════════════════════════════════════ */
          <div style={{ borderLeft: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bg1 }}>
            <PanelTitle right={
              <span style={{ fontSize: 10, color: T.dim, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                {brMyRoom?.label || (myRoomId != null ? `#${myRoomId}` : '—')}
              </span>
            }>🛰 收缩边界 · 扇区图</PanelTitle>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* 大时钟 HUD */}
              <BrClockHud
                realPhase={brClock?.realPhase ?? 0}
                maxPhase={br?.maxPhase ?? 4}
                secondsToNextPhase={brClock?.secondsToNextPhase ?? null}
                status={room.gamestate === 1 ? 'active' : room.gamestate === 2 ? 'ended' : 'lobby'}
                isFinalPhase={brIsFinalPhase}
                warnSecs={brWarnSecs}
                openCount={brZoneCounts.open}
                warningCount={brZoneCounts.warning}
                forbiddenCount={brZoneCounts.forbidden}
                aliveCount={aliveCount}
                playerCount={allPlayers.length}
              />

              {/* Phase 33 BR：我的「时间层」徽标 + 时序跃迁入口。
                  大时钟主显「真实阶段」（全服统一），此处单独显「我的深度 / 有效阶段」（=真实+深度），
                  区分「世界真实时钟」vs「我读的层」。depth>0 时有效阶段高于真实阶段（看更深世界层）。 */}
              <div style={{
                background: myDepth > 0 ? `linear-gradient(180deg, ${T.purple}1a 0%, ${T.bg2} 100%)` : T.bg2,
                border: `1px solid ${myDepth > 0 ? `${T.purple}55` : T.border}`,
                borderRadius: 10, padding: '10px 12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  {/* 深度 + 有效阶段徽标 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ textAlign: 'center', minWidth: 54 }}>
                      <div style={{ fontSize: 9, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.5px' }}>深度</div>
                      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, color: myDepth > 0 ? T.purple : T.dimB, fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
                        {myDepth}
                      </div>
                    </div>
                    <div style={{ width: 1, height: 30, background: T.border }} />
                    <div style={{ textAlign: 'center', minWidth: 70 }}>
                      <div style={{ fontSize: 9, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.5px' }}>有效阶段</div>
                      <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2, color: myEffPhase > (brClock?.realPhase ?? 0) ? T.purple : T.text, fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
                        {myEffPhase} / {brMaxPhase}
                      </div>
                      <div style={{ fontSize: 8, color: T.dim2, marginTop: 1 }}>真实 {brClock?.realPhase ?? 0}</div>
                    </div>
                  </div>

                  {/* 跃迁按钮 + 赌命警告 */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <Btn
                      variant="default"
                      size="sm"
                      loading={busyAction === 'br_jump'}
                      loadingText="跃迁中…"
                      disabled={jumpDisabled}
                      onClick={handleBrJump}
                      sx={{
                        background: jumpDisabled ? T.bg0 : `${T.purple}22`,
                        color: jumpDisabled ? T.dim2 : T.purple,
                        border: `1px solid ${jumpDisabled ? T.border : `${T.purple}66`}`,
                        fontWeight: 700,
                      }}
                    >
                      🜂 {jumpItemCount <= 0
                        ? '无跃迁器'
                        : jumpCdLeft > 0
                          ? `冷却 ${jumpCdLeft}s`
                          : jumpCapped
                            ? '已达最深层'
                            : `跃迁深一层（×${jumpItemCount}）`}
                    </Btn>
                    {/* 赌命红字：跃迁后所在扇区即禁区 → 即死（按钮不禁用，允许故意赌命） */}
                    {jumpWouldKill && jumpItemCount > 0 && !jumpCapped && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: T.red, textShadow: `0 0 8px ${T.red}44`, textAlign: 'right', lineHeight: 1.3 }}>
                        ⚠ 跃迁后所在扇区即禁区 → 即死
                      </span>
                    )}
                  </div>
                </div>
                {/* 说明行：跃迁单向 + 不可逆，看更深层（更多禁区/更高物资档），代价道具+冷却+赌命 */}
                <div style={{ fontSize: 9, color: T.dim2, marginTop: 8, lineHeight: 1.5 }}>
                  时序跃迁：消耗一枚跃迁器 → 认知向更深时间层下潜一阶（不可逆）。看更多禁区与更高物资档，
                  但跃迁后所在扇区若在新阶段已收缩则当场致死。
                </div>
              </div>

              {/* 拓扑加载占位：一次拉的静态拓扑（brTopology）未到 ⇒ 网格无房可摆，提示加载中。
                  到达后 brGrid 填充、占位消失；着色/大时钟此刻已可正常工作（不依赖拓扑）。 */}
              {!brTopology && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  padding: '14px 12px', borderRadius: 10,
                  background: T.bg2, border: `1px solid ${T.border}`,
                  fontSize: 11, color: T.dim,
                }}>
                  <span style={{ width: 14, height: 14, border: `2px solid ${T.border}`, borderTopColor: T.cyan, borderRadius: '50%', display: 'inline-block', animation: 'spin .7s linear infinite' }} />
                  <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', letterSpacing: 1 }}>扇区拓扑加载中…</span>
                </div>
              )}

              {/* 100 房网格（点相邻开放房移动）。realPhase 传 myEffPhase ⇒ 网格标题「阶段 N 禁区图」
                  与着色同口径显示「我读的层」（跃迁者更深）；BrGridPanel 内部仅作展示标签。 */}
              <BrGridPanel
                cellByXY={brCellByXY}
                realPhase={myEffPhase}
                computeCellState={brComputeCellState}
                movableRoomIds={brMovableRoomIds}
                roomHasPlayer={brRoomHasPlayer}
                myRoomId={myRoomId}
                gridW={br?.gridW ?? 10}
                gridH={br?.gridH ?? 10}
                onMove={(toRoomId) => {
                  if (toRoomId == null || !canActBr || busy) return
                  // 体力不足本地短路：省一次往返（服务端 moveToRoom no_stamina 仍是权威拦截）。
                  if (moveBlocked) {
                    toast(`体力不足，需等待回复（移动需 ${moveCostPreview} 体力）`, 'error')
                    return
                  }
                  runGameAction('move', { toRoomId })
                }}
              />

              {/* 我的扇区 + 移动提示 */}
              <div style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: T.dim }}>所在扇区</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.cyan, fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
                    {brMyRoom?.label || (myRoomId != null ? `#${myRoomId}` : '—')}
                  </span>
                </div>
                {brMyRoom && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: T.dim }}>区段</span>
                    <span style={{ fontSize: 11, color: T.text }}>{brMyRoom.region || '—'}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: T.dim }}>扇区状态</span>
                  {brMyRoom ? (() => {
                    const st = brComputeCellState(brMyRoom)
                    return (
                      <span style={{ fontSize: 11, fontWeight: 700, color: st === 'forbidden' ? T.red : st === 'warning' ? T.yellow : T.green }}>
                        {st === 'forbidden' ? '禁区' : st === 'warning' ? `预警 · T${brMyRoom.lootTier}` : `开放 · T${brMyRoom.lootTier}`}
                      </span>
                    )
                  })() : (
                    <span style={{ fontSize: 11, color: T.dim }}>—</span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: T.dim2, marginTop: 8, lineHeight: 1.5 }}>
                  {!canActBr
                    ? !me?.alive
                      ? '已阵亡，无法移动。'
                      : meBase?.extracted
                        ? '已撤离，结构态锁定。'
                        : room.gamestate !== 1
                          ? '对局未进行中。'
                          : '等待进入对局…'
                    : '点击网格中虚线高亮的相邻开放扇区即可移动。「搜索区域」搜当前扇区。'}
                </div>
              </div>

              {/* 物理态 / 事件流：若已折叠进 gamevars.br.roomState 则展示（本期最小实现可无）*/}
              {Array.isArray(br?.events) && br.events.length > 0 && (
                <div style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
                  <PanelTitle right={<span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{br.events.length}</span>}>📡 扇区动态</PanelTitle>
                  <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                    {br.events.slice(-30).reverse().map((ev, i) => (
                      <div key={ev.id || i} style={{ padding: '6px 12px', borderBottom: `1px solid ${T.border}`, fontSize: 11, color: T.dimB, lineHeight: 1.4 }}>
                        {ev.text || `${ev.type || '事件'} · ${ev.roomLabel || (ev.roomId != null ? `#${ev.roomId}` : '')}`}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
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
                <div style={{ fontSize: 10, color: T.dim2, marginBottom: 2 }}>当前区块</div>
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
        )}
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
