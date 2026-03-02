'use client'
/**
 * src/app/game/[id]/page.js
 *
 * 战斗核心逻辑全部通过引擎计算：
 *  - joinRoom       → getInitPlayerStats(rules)
 *  - searchMap      → getSearchChances(rules, weather) + item_pool + npc_pool
 *  - attackPlayer   → calcDamage() + triggerPassives() + 装备属性合并
 *  - useItem        → calcItemEffect() + applyBuff()
 *  - 每回合开始      → processBuffs() + tickPassiveCooldowns()
 *  - 天气           → map_config.weather 传入所有引擎函数
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../../layout'
import {
  loadGameRules,
  loadBuffPool,
  clearRulesCache,
  getRule,
  calcDamage,
  calcItemEffect,
  processBuffs,
  applyBuff,
  getSearchChances,
  getInitPlayerStats,
} from '@/lib/gameEngine'
import {
  calcEquippedStats,
  triggerPassives,
  tickPassiveCooldowns,
  consumeDurability,
  RARITY_META,
  ELEMENT_META,
} from '@/lib/equipmentEngine'

/* ══════════════════════════════════════════════
   상수 & 헬퍼
══════════════════════════════════════════════ */
const WEATHER_DISPLAY = {
  clear:  { label: '晴天',   icon: '☀️' },
  rain:   { label: '雨天',   icon: '🌧️' },
  fog:    { label: '大雾',   icon: '🌫️' },
  storm:  { label: '暴风雨', icon: '⛈️' },
  night:  { label: '黑夜',   icon: '🌑' },
  snow:   { label: '暴雪',   icon: '❄️' },
}

const GAMETYPE_LABEL = { 0: '自由模式', 1: '吃鸡', 2: '团队', 3: '限时' }

function hpColor(hp, maxHp) {
  const r = hp / maxHp
  if (r > 0.6) return '#3fb950'
  if (r > 0.3) return '#d29922'
  return '#f85149'
}

/* ══════════════════════════════════════════════
   UI 子组件
══════════════════════════════════════════════ */
function HpBar({ hp, maxHp, showText = true }) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100))
  const color = hpColor(hp, maxHp)
  return (
    <div>
      <div style={{ height: 6, borderRadius: 3, background: '#21262d', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.4s ease, background 0.3s' }} />
      </div>
      {showText && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 11, color: '#8b949e' }}>
          <span style={{ color, fontFamily: 'monospace', fontWeight: 700 }}>{hp}</span>
          <span>{maxHp}</span>
        </div>
      )}
    </div>
  )
}

function BuffTag({ buffDef, remaining }) {
  if (!buffDef) return null
  const color = buffDef.is_debuff ? '#f85149' : '#3fb950'
  return (
    <div title={`${buffDef.name}（剩余 ${remaining} 回合）`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 7px', borderRadius: 8, fontSize: 10,
      background: `${color}15`, border: `1px solid ${color}30`, color,
    }}>
      {buffDef.icon} {buffDef.name}
      <span style={{ opacity: 0.6 }}>{remaining}</span>
    </div>
  )
}

function LogLine({ entry }) {
  const color =
    entry.type === 'damage'  ? '#f85149' :
    entry.type === 'heal'    ? '#3fb950' :
    entry.type === 'crit'    ? '#d29922' :
    entry.type === 'buff'    ? '#bc8cff' :
    entry.type === 'system'  ? '#58a6ff' :
    entry.type === 'death'   ? '#f85149' :
    '#8b949e'

  return (
    <div style={{ padding: '4px 0', borderBottom: '1px solid #21262d', fontSize: 12, color, lineHeight: 1.5 }}>
      <span style={{ color: '#484f58', marginRight: 6, fontFamily: 'monospace', fontSize: 10 }}>
        {entry.time}
      </span>
      {entry.text}
    </div>
  )
}

/* ══════════════════════════════════════════════
   메인 페이지
══════════════════════════════════════════════ */
export default function GamePage() {
  const { id: roomId } = useParams()
  const { user } = useAuth()
  const router = useRouter()

  /* ── 游戏核心状态 ── */
  const [room, setRoom]           = useState(null)
  const [gamevars, setGamevars]   = useState(null)
  const [mapConfig, setMapConfig] = useState(null)
  const [loading, setLoading]     = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  /* ── 引擎缓存（本地，不进 state）── */
  const rulesRef    = useRef(null)   // game_rules 对象
  const buffPoolRef = useRef(null)   // buff_pool 数组
  const itemPoolRef = useRef(null)   // item_pool 数组（按当前地图筛选）
  const npcPoolRef  = useRef(null)   // npc_pool 数组（按当前地图筛选）
  const equipsRef   = useRef([])     // 玩家 equipment_instances（含 tier join）

  /* ── UI 状态 ── */
  const [logs, setLogs]           = useState([])
  const [panel, setPanel]         = useState('action') // action | inventory | equip | map
  const [battleState, setBattle]  = useState(null)     // 当前战斗（null=无战斗）
  // battleState = { npc: {...}, npcHp, turn, log: [] }

  const logRef = useRef(null)

  /* ══════════════════════════════════════════════
     初始化加载
  ══════════════════════════════════════════════ */
  const initialize = useCallback(async () => {
    if (!user) return
    setLoading(true)

    // 1. 加载规则 & Buff池（房间级别缓存）
    const [rules, buffPool] = await Promise.all([
      loadGameRules(),
      loadBuffPool(),
    ])
    rulesRef.current    = rules
    buffPoolRef.current = buffPool

    // 2. 加载房间数据
    const { data: roomData } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single()

    if (!roomData) { router.push('/'); return }
    setRoom(roomData)

    // 3. 加载地图配置（获取天气）
    const { data: mapData } = await supabase
      .from('map_config')
      .select('*')
      .eq('map_id', roomData.current_map || 1)
      .single()
    setMapConfig(mapData)

    // 4. 加载道具池 & NPC池（按当前地图过滤）
    const mapId = roomData.current_map || 1
    const [{ data: items }, { data: npcs }] = await Promise.all([
      supabase.from('item_pool').select('*').contains('maps', [mapId]),
      supabase.from('npc_pool').select('*').contains('maps', [mapId]),
    ])
    itemPoolRef.current = items || []
    npcPoolRef.current  = npcs  || []

    // 5. 加载玩家装备实例（含 tier & passive join）
    if (user) {
      const { data: equips } = await supabase
        .from('equipment_instances')
        .select(`
          *,
          tier:equipment_tiers(
            *,
            passive:passive_skills(*)
          )
        `)
        .eq('owner_id', user.id)
        .eq('room_id', roomId)
        .eq('is_equipped', true)
      equipsRef.current = equips || []
    }

    // 6. 加载 gamevars
    const gv = roomData.gamevars || {}
    setGamevars(gv)

    setLoading(false)
  }, [user, roomId])

  useEffect(() => { initialize() }, [initialize])

  // Supabase Realtime 订阅
  useEffect(() => {
    const channel = supabase
      .channel(`room-${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}`,
      }, payload => {
        setRoom(payload.new)
        setGamevars(payload.new.gamevars || {})
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [roomId])

  // 自动滚动战斗日志
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  /* ══════════════════════════════════════════════
     辅助：写日志
  ══════════════════════════════════════════════ */
  function addLog(text, type = 'info') {
    const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setLogs(prev => [...prev.slice(-200), { text, type, time }])
  }

  /* ══════════════════════════════════════════════
     辅助：保存 gamevars 到数据库
  ══════════════════════════════════════════════ */
  async function saveGamevars(newGv) {
    setGamevars(newGv)
    await supabase.from('rooms').update({ gamevars: newGv }).eq('id', roomId)
  }

  /* ══════════════════════════════════════════════
     辅助：获取当前玩家对象（含装备属性合并）
  ══════════════════════════════════════════════ */
  function getMyPlayer(gv) {
    const uid = user?.id
    const base = gv?.players?.[uid]
    if (!base) return null

    // 合并已装备装备的属性
    const equipStats = calcEquippedStats(equipsRef.current)

    return {
      ...base,
      atk: (base.atk || 0) + equipStats.totalAtk,
      def: (base.def || 0) + equipStats.totalDef,
      // HP加成体现在 maxHp 上（已在 joinRoom 时计入，这里只是备用）
      _equipAtk: equipStats.totalAtk,
      _equipDef: equipStats.totalDef,
      _passives: equipsRef.current
        .map(e => e.tier?.passive)
        .filter(Boolean),
      _equippedElements: equipStats.elements,
    }
  }

  /* ══════════════════════════════════════════════
     辅助：回合开始处理（Buff tick + 冷却）
     在任何"行动"开始前调用一次，更新 players 状态
  ══════════════════════════════════════════════ */
  function processTurnStart(gv) {
    const buffPool = buffPoolRef.current || []
    const newPlayers = { ...gv.players }
    const turnLogs = []

    for (const [uid, player] of Object.entries(newPlayers)) {
      if (!player.alive) continue

      // 1. Buff 效果结算
      const { updatedPlayer, logEntries } = processBuffs(player, buffPool)
      turnLogs.push(...logEntries)

      // 2. 被动冷却倒计时
      const afterCooldown = tickPassiveCooldowns(updatedPlayer)

      newPlayers[uid] = afterCooldown
    }

    return { gv: { ...gv, players: newPlayers }, turnLogs }
  }

  /* ══════════════════════════════════════════════
     核心行动：加入游戏 / 初始化玩家
  ══════════════════════════════════════════════ */
  async function joinRoom() {
    if (!user || !gamevars) return
    const uid = user.id
    if (gamevars.players?.[uid]) { addLog('你已在游戏中', 'system'); return }

    setActionLoading(true)
    clearRulesCache()
    const rules = await loadGameRules()
    rulesRef.current = rules

    const initStats = getInitPlayerStats(rules)

    const newGv = {
      ...gamevars,
      players: {
        ...gamevars.players,
        [uid]: {
          uid,
          name: user.user_metadata?.name || user.email?.split('@')[0] || '玩家',
          ...initStats,           // hp, maxHp, atk, def（从 game_rules 读取）
          alive: true,
          inventory: [],          // 消耗品/材料字符串数组
          buffs: [],
          passiveCooldowns: {},
          kills: 0,
          position: null,
        },
      },
    }

    await saveGamevars(newGv)
    addLog(`✅ 你以 HP:${initStats.hp} ATK:${initStats.atk} DEF:${initStats.def} 加入游戏`, 'system')
    setActionLoading(false)
  }

  /* ══════════════════════════════════════════════
     核心行动：搜索地图
  ══════════════════════════════════════════════ */
  async function searchMap() {
    const uid = user?.id
    if (!gamevars?.players?.[uid]?.alive) return
    setActionLoading(true)

    const rules   = rulesRef.current
    const weather = mapConfig?.weather || 'clear'

    // ① 回合开始处理（Buff结算）
    const { gv: gvAfterTurn, turnLogs } = processTurnStart(gamevars)
    turnLogs.forEach(t => addLog(t, t.includes('损失') ? 'damage' : 'heal'))

    // 如果 Buff 把自己打死了
    if (!gvAfterTurn.players?.[uid]?.alive) {
      await saveGamevars(gvAfterTurn)
      addLog('💀 你在回合开始时因持续伤害倒下', 'death')
      setActionLoading(false)
      return
    }

    // ② 读取天气修正后的搜索概率
    const { itemChance, npcChance } = getSearchChances(rules, weather)
    const roll = Math.random()

    const weatherInfo = WEATHER_DISPLAY[weather]
    addLog(`${weatherInfo?.icon} ${weatherInfo?.label} · 你开始搜索区域...`, 'info')

    // ③ 概率分支
    if (roll < npcChance) {
      // 遭遇 NPC
      const npcPool = npcPoolRef.current || []
      if (npcPool.length === 0) {
        addLog('🔍 区域安静，什么都没有', 'info')
      } else {
        const npc = npcPool[Math.floor(Math.random() * npcPool.length)]
        addLog(`⚠️ 遭遇了【${npc.name}】！进入战斗！`, 'damage')

        // 进入 NPC 战斗状态（单独处理，不写进 gamevars，只在本地运行）
        setBattle({
          npc: { ...npc },
          npcHp: npc.hp,
          npcMaxHp: npc.hp,
          turn: 1,
          log: [`回合1：与【${npc.name}】的战斗开始！`],
        })
        await saveGamevars(gvAfterTurn)
        setActionLoading(false)
        return
      }
    } else if (roll < npcChance + itemChance) {
      // 找到道具
      const itemPool = itemPoolRef.current || []
      if (itemPool.length > 0) {
        // 按 amount 权重随机抽取
        const totalWeight = itemPool.reduce((s, i) => s + (i.amount || 1), 0)
        let r = Math.random() * totalWeight
        let found = itemPool[0]
        for (const item of itemPool) {
          r -= item.amount || 1
          if (r <= 0) { found = item; break }
        }

        // 把道具名加入背包（字符串）
        const gvWithItem = {
          ...gvAfterTurn,
          players: {
            ...gvAfterTurn.players,
            [uid]: {
              ...gvAfterTurn.players[uid],
              inventory: [...(gvAfterTurn.players[uid].inventory || []), found.name],
            },
          },
        }

        await saveGamevars(gvWithItem)
        const rarityLabel = found.rarity ? `[${found.rarity}] ` : ''
        addLog(`📦 找到了 ${rarityLabel}【${found.name}】！${found.description ? `（${found.description}）` : ''}`, 'heal')
      } else {
        addLog('🔍 翻了翻，什么有用的都没找到', 'info')
        await saveGamevars(gvAfterTurn)
      }
    } else {
      // 什么都没有
      addLog('🔍 这片区域已被搜刮一空', 'info')
      await saveGamevars(gvAfterTurn)
    }

    setActionLoading(false)
  }

  /* ══════════════════════════════════════════════
     核心行动：NPC 战斗循环
  ══════════════════════════════════════════════ */
  async function attackNpc() {
    if (!battleState) return
    setActionLoading(true)

    const uid    = user?.id
    const rules  = rulesRef.current
    const weather = mapConfig?.weather || 'clear'
    const buffPool = buffPoolRef.current || []

    let myPlayer = getMyPlayer(gamevars)
    let { npc, npcHp, npcMaxHp, turn } = battleState
    const newBattleLog = [...battleState.log]

    // ── 玩家攻击 NPC ──
    // 获取装备的武器子类型（取第一件已装备武器）
    const weapon = equipsRef.current.find(e => e.tier?.series?.slot === 'weapon')
    const weaponSubKind = weapon?.tier?.sub_kind || ''

    const dmgToNpc = calcDamage(myPlayer, { ...npc, hp: npcHp, maxHp: npcMaxHp }, rules, weaponSubKind, weather)

    // 触发攻击被动
    const { attackerUpdated: afterAtk, logs: passiveLogs } = triggerPassives(
      'on_attack', myPlayer, { ...npc, hp: npcHp }, myPlayer._passives || [], buffPool
    )
    myPlayer = afterAtk
    passiveLogs.forEach(l => { addLog(l, 'buff'); newBattleLog.push(l) })

    const newNpcHp = Math.max(0, npcHp - dmgToNpc)
    const isCrit = dmgToNpc > calcDamage(myPlayer, { ...npc, hp: npcHp, maxHp: npcMaxHp }, rules, weaponSubKind, weather) * 1.3
    const atkMsg = `🗡️ 你攻击了【${npc.name}】，造成 ${dmgToNpc} 伤害${isCrit ? '（暴击！）' : ''}`
    addLog(atkMsg, dmgToNpc > 20 ? 'crit' : 'damage')
    newBattleLog.push(atkMsg)

    // ── NPC 死亡判定 ──
    if (newNpcHp <= 0) {
      addLog(`🏆 击败了【${npc.name}】！获得 ${npc.exp || 0} 经验`, 'heal')
      newBattleLog.push(`【${npc.name}】被击败！`)

      // 击杀被动
      const { attackerUpdated: afterKill } = triggerPassives(
        'on_kill', myPlayer, null, myPlayer._passives || [], buffPool
      )
      myPlayer = afterKill

      // 更新 gamevars
      const newGv = {
        ...gamevars,
        players: {
          ...gamevars.players,
          [uid]: {
            ...gamevars.players[uid],
            hp:   myPlayer.hp,
            atk:  myPlayer.atk - (myPlayer._equipAtk || 0),  // 存储不含装备的基础值
            def:  myPlayer.def - (myPlayer._equipDef || 0),
            buffs: myPlayer.buffs || [],
            passiveCooldowns: myPlayer.passiveCooldowns || {},
            kills: (gamevars.players[uid].kills || 0) + 1,
          },
        },
      }
      await saveGamevars(newGv)
      await consumeDurability(uid, roomId, 1)  // 战斗消耗耐久

      setBattle(null)
      setActionLoading(false)
      return
    }

    // ── NPC 反击 ──
    const dmgFromNpc = calcDamage(
      { atk: npc.atk, def: npc.def, hp: npcHp, maxHp: npcMaxHp },
      myPlayer,
      rules,
      '',
      weather
    )

    // 被攻击被动
    const { attackerUpdated: afterDefend, defenderUpdated: afterHit } = triggerPassives(
      'on_defend',
      myPlayer,
      { atk: npc.atk, def: npc.def, hp: npcHp, maxHp: npcMaxHp },
      myPlayer._passives || [],
      buffPool
    )
    myPlayer = afterDefend

    const newMyHp = Math.max(0, myPlayer.hp - dmgFromNpc)
    myPlayer = { ...myPlayer, hp: newMyHp, alive: newMyHp > 0 }

    const defMsg = `💥 【${npc.name}】反击，你受到 ${dmgFromNpc} 伤害（剩余 HP: ${newMyHp}）`
    addLog(defMsg, 'damage')
    newBattleLog.push(defMsg)

    // HP < 30% 被动
    if (newMyHp > 0 && newMyHp / (myPlayer.maxHp) < 0.3) {
      const { attackerUpdated: afterLow } = triggerPassives(
        'on_hp_below_30', myPlayer, null, myPlayer._passives || [], buffPool
      )
      myPlayer = afterLow
    }

    // ── 玩家死亡判定 ──
    if (newMyHp <= 0) {
      addLog(`💀 你在与【${npc.name}】的战斗中倒下`, 'death')

      const newGv = {
        ...gamevars,
        players: {
          ...gamevars.players,
          [uid]: { ...gamevars.players[uid], hp: 0, alive: false, buffs: [] },
        },
      }
      await saveGamevars(newGv)
      setBattle(null)
      setActionLoading(false)
      return
    }

    // ── 继续战斗 ──
    await saveGamevars({
      ...gamevars,
      players: {
        ...gamevars.players,
        [uid]: {
          ...gamevars.players[uid],
          hp:   newMyHp,
          buffs: myPlayer.buffs || [],
          passiveCooldowns: myPlayer.passiveCooldowns || {},
        },
      },
    })

    setBattle({
      ...battleState,
      npcHp: newNpcHp,
      turn: turn + 1,
      log: newBattleLog,
    })

    setActionLoading(false)
  }

  /* ══════════════════════════════════════════════
     核心行动：逃跑（NPC战斗）
  ══════════════════════════════════════════════ */
  async function fleeFromNpc() {
    if (!battleState) return
    setActionLoading(true)
    // 逃跑成功率 60%（可后续配置进 game_rules）
    const rules   = rulesRef.current
    const fleeRate = getRule(rules, 'flee_success_rate', 0.6)

    if (Math.random() < fleeRate) {
      addLog('🏃 成功逃脱！', 'system')
      setBattle(null)
    } else {
      // 逃跑失败，NPC 打一次
      const uid = user?.id
      const myPlayer = getMyPlayer(gamevars)
      const weather = mapConfig?.weather || 'clear'
      const { npc, npcHp, npcMaxHp } = battleState

      const dmg = calcDamage(
        { atk: npc.atk, def: npc.def, hp: npcHp, maxHp: npcMaxHp },
        myPlayer, rulesRef.current, '', weather
      )
      const newHp = Math.max(0, myPlayer.hp - dmg)

      addLog(`❌ 逃跑失败！【${battleState.npc.name}】趁机造成 ${dmg} 伤害`, 'damage')

      const newGv = {
        ...gamevars,
        players: {
          ...gamevars.players,
          [uid]: { ...gamevars.players[uid], hp: newHp, alive: newHp > 0 },
        },
      }
      await saveGamevars(newGv)
      if (newHp <= 0) { addLog('💀 你倒在了逃跑途中', 'death'); setBattle(null) }
    }
    setActionLoading(false)
  }

  /* ══════════════════════════════════════════════
     核心行动：攻击玩家（PvP）
  ══════════════════════════════════════════════ */
  async function attackPlayer(targetUid) {
    const uid = user?.id
    if (!uid || !gamevars?.players?.[uid]?.alive) return
    if (targetUid === uid) { addLog('你不能攻击自己', 'system'); return }
    setActionLoading(true)

    const rules   = rulesRef.current
    const weather = mapConfig?.weather || 'clear'
    const buffPool = buffPoolRef.current || []

    // 回合开始处理
    const { gv: gvAfterTurn, turnLogs } = processTurnStart(gamevars)
    turnLogs.forEach(t => addLog(t, t.includes('损失') ? 'damage' : 'heal'))

    let myPlayer     = getMyPlayer(gvAfterTurn)
    let targetPlayer = { ...gvAfterTurn.players[targetUid] }

    if (!myPlayer?.alive) {
      await saveGamevars(gvAfterTurn)
      addLog('💀 你在回合开始就倒下了', 'death')
      setActionLoading(false)
      return
    }
    if (!targetPlayer?.alive) {
      addLog(`${targetPlayer?.name} 已经倒下了`, 'system')
      setActionLoading(false)
      return
    }

    // 武器信息
    const weapon = equipsRef.current.find(e => e.tier?.series?.slot === 'weapon')
    const weaponSubKind = weapon?.tier?.sub_kind || ''

    // 计算伤害
    const dmg = calcDamage(myPlayer, targetPlayer, rules, weaponSubKind, weather)

    // 攻击被动
    const { attackerUpdated: afterAtk, defenderUpdated: defAfterPassive, logs: passiveLogs } = triggerPassives(
      'on_attack', myPlayer, targetPlayer, myPlayer._passives || [], buffPool
    )
    myPlayer = afterAtk
    if (defAfterPassive) targetPlayer = defAfterPassive
    passiveLogs.forEach(l => addLog(l, 'buff'))

    // 被攻击被动（防守方）
    const targetPassives = equipsRef.current
      .filter(e => e.owner_id === targetUid && e.is_equipped)
      .map(e => e.tier?.passive).filter(Boolean)
    const { attackerUpdated: defAfterDefPassive } = triggerPassives(
      'on_defend', targetPlayer, myPlayer, targetPassives, buffPool
    )
    targetPlayer = defAfterDefPassive

    // 应用伤害
    const newTargetHp = Math.max(0, (targetPlayer.hp || 0) - dmg)
    targetPlayer = { ...targetPlayer, hp: newTargetHp, alive: newTargetHp > 0 }

    addLog(`⚔️ 你攻击了 ${targetPlayer.name}，造成 ${dmg} 伤害（对方剩余 HP: ${newTargetHp}）`, 'damage')

    let newGv = {
      ...gvAfterTurn,
      players: {
        ...gvAfterTurn.players,
        [uid]: {
          ...gvAfterTurn.players[uid],
          hp:   myPlayer.hp,
          buffs: myPlayer.buffs || [],
          passiveCooldowns: myPlayer.passiveCooldowns || {},
        },
        [targetUid]: {
          ...gvAfterTurn.players[targetUid],
          hp:    newTargetHp,
          alive: newTargetHp > 0,
          buffs: targetPlayer.buffs || [],
        },
      },
    }

    // 击杀判定
    if (newTargetHp <= 0) {
      addLog(`🏆 你击败了 ${targetPlayer.name}！`, 'crit')
      const { attackerUpdated: afterKill } = triggerPassives(
        'on_kill', myPlayer, null, myPlayer._passives || [], buffPool
      )
      myPlayer = afterKill
      newGv.players[uid] = {
        ...newGv.players[uid],
        hp: myPlayer.hp,
        buffs: myPlayer.buffs || [],
        kills: (newGv.players[uid].kills || 0) + 1,
      }
    }

    await saveGamevars(newGv)
    await consumeDurability(uid, roomId, 1)
    setActionLoading(false)
  }

  /* ══════════════════════════════════════════════
     核心行动：使用道具
  ══════════════════════════════════════════════ */
  async function useItem(itemName) {
    const uid = user?.id
    if (!gamevars?.players?.[uid]?.alive) return
    setActionLoading(true)

    const rules    = rulesRef.current
    const buffPool = buffPoolRef.current || []
    const myPlayer = getMyPlayer(gamevars)

    // 从 item_pool 取道具定义
    const allItems = itemPoolRef.current || []
    const itemDef  = allItems.find(i => i.name === itemName)

    if (!itemDef) {
      addLog(`❓ 未知道具：${itemName}`, 'system')
      setActionLoading(false)
      return
    }

    // 引擎计算效果
    const effect = calcItemEffect(itemDef, myPlayer, rules)

    let newPlayer = { ...gamevars.players[uid] }

    // HP 变化
    if (effect.hpDelta !== 0) {
      const newHp = Math.max(0, Math.min(myPlayer.maxHp, (newPlayer.hp || 0) + effect.hpDelta))
      newPlayer.hp = newHp
      newPlayer.alive = newHp > 0
      if (effect.hpDelta > 0) addLog(`💊 使用【${itemName}】，恢复了 ${effect.hpDelta} HP（当前: ${newHp}）`, 'heal')
      else addLog(`☠️ 使用【${itemName}】，HP 减少 ${-effect.hpDelta}`, 'damage')
    }

    // ATK 变化（装备类）
    if (effect.atkDelta !== 0) {
      newPlayer.atk = Math.max(0, (newPlayer.atk || 0) + effect.atkDelta)
      addLog(`⚔️ 装备【${itemName}】，ATK +${effect.atkDelta}（当前: ${newPlayer.atk}）`, 'heal')
    }

    // DEF 变化
    if (effect.defDelta !== 0) {
      newPlayer.def = Math.max(0, (newPlayer.def || 0) + effect.defDelta)
      addLog(`🛡️ 装备【${itemName}】，DEF +${effect.defDelta}（当前: ${newPlayer.def}）`, 'heal')
    }

    // Buff 触发
    for (const buffId of effect.newBuffIds || []) {
      const buffDef = buffPool.find(b => b.id === buffId)
      if (buffDef) {
        newPlayer = applyBuff(newPlayer, buffId, buffDef)
        addLog(`${buffDef.icon} 【${itemName}】触发效果：${buffDef.name}`, 'buff')
      }
    }

    if (effect.hpDelta === 0 && effect.atkDelta === 0 && effect.defDelta === 0 && effect.newBuffIds.length === 0) {
      addLog(`🤔 使用了【${itemName}】，但没有任何效果`, 'system')
    }

    // 从背包移除
    const inv = [...(gamevars.players[uid].inventory || [])]
    const idx = inv.indexOf(itemName)
    if (idx !== -1) inv.splice(idx, 1)

    const newGv = {
      ...gamevars,
      players: { ...gamevars.players, [uid]: { ...newPlayer, inventory: inv } },
    }
    await saveGamevars(newGv)
    setActionLoading(false)
  }

  /* ══════════════════════════════════════════════
     渲染
  ══════════════════════════════════════════════ */
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0d1117', color: '#8b949e', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 36, height: 36, border: '3px solid #30363d', borderTopColor: '#58a6ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ fontSize: 13 }}>载入游戏中...</div>
    </div>
  )

  if (!room) return null

  const uid        = user?.id
  const myPlayer   = getMyPlayer(gamevars)
  const allPlayers = Object.values(gamevars?.players || {})
  const alivePlayers = allPlayers.filter(p => p.alive && p.uid !== uid)
  const weather    = mapConfig?.weather || 'clear'
  const weatherInfo = WEATHER_DISPLAY[weather] || WEATHER_DISPLAY.clear
  const buffPool   = buffPoolRef.current || []
  const isInGame   = !!myPlayer

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#e6edf3', display: 'flex', flexDirection: 'column' }}>

      {/* ── 顶部状态栏 ── */}
      <div style={{
        background: '#161b22', borderBottom: '1px solid #21262d',
        padding: '10px 20px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            {GAMETYPE_LABEL[room.gametype] || '游戏'} #{room.id}
          </span>
          <span style={{ fontSize: 12, color: '#8b949e' }}>
            {weatherInfo.icon} {weatherInfo.label}
          </span>
          <span style={{ fontSize: 12, color: '#58a6ff' }}>
            存活 {allPlayers.filter(p => p.alive).length}/{allPlayers.length}
          </span>
        </div>
        {myPlayer && (
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: '#8b949e' }}>
              <span style={{ color: '#f85149', marginRight: 8 }}>ATK {myPlayer.atk}</span>
              <span style={{ color: '#58a6ff' }}>DEF {myPlayer.def}</span>
              {myPlayer._equipAtk > 0 && <span style={{ color: '#8b949e', fontSize: 10, marginLeft: 4 }}>(+{myPlayer._equipAtk}⚔️)</span>}
            </div>
            <div style={{ minWidth: 120 }}>
              <HpBar hp={myPlayer.hp} maxHp={myPlayer.maxHp} />
            </div>
          </div>
        )}
      </div>

      {/* ── 主体三栏 ── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '280px 1fr 280px', gap: 0, overflow: 'hidden', maxHeight: 'calc(100vh - 56px)' }}>

        {/* 左栏：玩家列表 */}
        <div style={{ background: '#161b22', borderRight: '1px solid #21262d', overflowY: 'auto', padding: 16 }}>
          <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
            场上玩家 ({allPlayers.length})
          </div>
          {allPlayers.map(p => {
            const isMe = p.uid === uid
            const pBuffs = (p.buffs || []).slice(0, 3)
            const equipStats = isMe ? { totalAtk: myPlayer?._equipAtk || 0, totalDef: myPlayer?._equipDef || 0 } : { totalAtk: 0, totalDef: 0 }
            return (
              <div key={p.uid} style={{
                padding: '10px 12px', borderRadius: 10, marginBottom: 8,
                background: isMe ? 'rgba(88,166,255,0.08)' : '#1c2129',
                border: `1px solid ${isMe ? '#58a6ff30' : '#30363d'}`,
                opacity: p.alive ? 1 : 0.45,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>
                    {isMe ? '👤 ' : ''}{p.name}
                    {!p.alive && <span style={{ color: '#f85149', fontSize: 10, marginLeft: 6 }}>†</span>}
                  </span>
                  {p.alive && !isMe && (
                    <button onClick={() => attackPlayer(p.uid)}
                      disabled={actionLoading || battleState !== null}
                      style={{
                        padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(248,81,73,0.3)',
                        background: 'rgba(248,81,73,0.1)', color: '#f85149', fontSize: 11, cursor: 'pointer',
                      }}>攻击</button>
                  )}
                </div>
                <HpBar hp={p.hp || 0} maxHp={p.maxHp || 100} />
                <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 10, color: '#8b949e' }}>
                  <span>ATK {p.atk}</span>
                  <span>DEF {p.def}</span>
                  <span>击杀 {p.kills || 0}</span>
                </div>
                {pBuffs.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 6 }}>
                    {pBuffs.map((b, i) => {
                      const def_ = buffPool.find(x => x.id === b.buffId)
                      return <BuffTag key={i} buffDef={def_} remaining={b.remainingTurns} />
                    })}
                  </div>
                )}
              </div>
            )
          })}
          {allPlayers.length === 0 && (
            <div style={{ textAlign: 'center', color: '#484f58', fontSize: 12, marginTop: 20 }}>暂无玩家</div>
          )}
        </div>

        {/* 中栏：行动区 + 战斗 + 日志 */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* 行动区 */}
          <div style={{ padding: 20, borderBottom: '1px solid #21262d', background: '#13171f' }}>
            {!isInGame ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: '#8b949e', marginBottom: 14 }}>你还没有加入游戏</div>
                <button onClick={joinRoom} disabled={actionLoading}
                  style={{ padding: '12px 32px', borderRadius: 10, background: '#58a6ff', color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                  加入游戏
                </button>
              </div>
            ) : battleState ? (
              /* NPC 战斗面板 */
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#f85149' }}>
                    ⚔️ 战斗中：【{battleState.npc.name}】
                  </div>
                  <div style={{ fontSize: 11, color: '#8b949e' }}>第 {battleState.turn} 回合</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'center', marginBottom: 14 }}>
                  {/* 我方 */}
                  <div>
                    <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 4 }}>{myPlayer?.name}</div>
                    <HpBar hp={myPlayer?.hp || 0} maxHp={myPlayer?.maxHp || 100} />
                    <div style={{ fontSize: 11, color: '#8b949e', marginTop: 3 }}>ATK {myPlayer?.atk} DEF {myPlayer?.def}</div>
                  </div>
                  <div style={{ fontSize: 20 }}>VS</div>
                  {/* NPC */}
                  <div>
                    <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 4 }}>{battleState.npc.name}</div>
                    <HpBar hp={battleState.npcHp} maxHp={battleState.npcMaxHp} />
                    <div style={{ fontSize: 11, color: '#8b949e', marginTop: 3 }}>
                      ATK {battleState.npc.atk} DEF {battleState.npc.def}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={attackNpc} disabled={actionLoading}
                    style={{ flex: 2, padding: '10px 0', borderRadius: 8, background: '#f85149', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                    {actionLoading ? '攻击中...' : '⚔️ 攻击'}
                  </button>
                  <button onClick={fleeFromNpc} disabled={actionLoading}
                    style={{ flex: 1, padding: '10px 0', borderRadius: 8, background: 'transparent', color: '#8b949e', border: '1px solid #30363d', fontSize: 13, cursor: 'pointer' }}>
                    🏃 逃跑
                  </button>
                </div>
              </div>
            ) : (
              /* 平时行动按钮 */
              <div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                  <button onClick={searchMap} disabled={actionLoading || !myPlayer?.alive}
                    style={{
                      flex: 1, padding: '12px 0', borderRadius: 8,
                      background: myPlayer?.alive ? '#58a6ff' : '#21262d',
                      color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                    }}>
                    {actionLoading ? '搜索中...' : '🔍 搜索区域'}
                  </button>
                </div>
                {/* 当前 Buff 状态 */}
                {(myPlayer?.buffs || []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, color: '#8b949e', alignSelf: 'center' }}>状态：</span>
                    {(myPlayer.buffs || []).map((b, i) => {
                      const def_ = buffPool.find(x => x.id === b.buffId)
                      return <BuffTag key={i} buffDef={def_} remaining={b.remainingTurns} />
                    })}
                  </div>
                )}
                {!myPlayer?.alive && (
                  <div style={{ textAlign: 'center', color: '#f85149', fontSize: 13 }}>💀 你已阵亡，只能观战</div>
                )}
              </div>
            )}
          </div>

          {/* 子导航：背包/装备 */}
          <div style={{ display: 'flex', gap: 0, background: '#161b22', borderBottom: '1px solid #21262d' }}>
            {[
              { key: 'action', label: '📋 日志' },
              { key: 'inventory', label: `🎒 背包${isInGame ? ` (${(myPlayer?.inventory || []).length})` : ''}` },
              { key: 'equip', label: `⚔️ 装备 (${equipsRef.current.length})` },
            ].map(t => (
              <button key={t.key} onClick={() => setPanel(t.key)} style={{
                flex: 1, padding: '10px 0', border: 'none', background: 'transparent',
                borderBottom: `2px solid ${panel === t.key ? '#58a6ff' : 'transparent'}`,
                color: panel === t.key ? '#58a6ff' : '#8b949e',
                fontSize: 12, fontWeight: panel === t.key ? 700 : 400, cursor: 'pointer',
              }}>{t.label}</button>
            ))}
          </div>

          {/* 日志面板 */}
          {panel === 'action' && (
            <div ref={logRef} style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {logs.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#484f58', marginTop: 30, fontSize: 13 }}>
                  等待行动...
                </div>
              ) : (
                logs.slice().reverse().map((l, i) => <LogLine key={i} entry={l} />)
              )}
            </div>
          )}

          {/* 背包面板 */}
          {panel === 'inventory' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {!isInGame ? (
                <div style={{ textAlign: 'center', color: '#484f58', marginTop: 30, fontSize: 13 }}>加入游戏后显示背包</div>
              ) : (myPlayer?.inventory || []).length === 0 ? (
                <div style={{ textAlign: 'center', color: '#484f58', marginTop: 30, fontSize: 13 }}>背包空空如也</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* 对同名道具计数 */}
                  {Object.entries(
                    (myPlayer?.inventory || []).reduce((acc, name) => {
                      acc[name] = (acc[name] || 0) + 1; return acc
                    }, {})
                  ).map(([name, count]) => {
                    const itemDef = itemPoolRef.current?.find(i => i.name === name)
                    return (
                      <div key={name} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 14px', borderRadius: 9, background: '#1c2129', border: '1px solid #30363d',
                      }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{name}
                            {count > 1 && <span style={{ color: '#8b949e', fontSize: 11, marginLeft: 6 }}>×{count}</span>}
                          </div>
                          {itemDef?.description && (
                            <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>{itemDef.description}</div>
                          )}
                          {itemDef && (
                            <div style={{ fontSize: 10, color: '#484f58', marginTop: 2 }}>
                              {itemDef.heal > 0 && <span style={{ color: '#3fb950', marginRight: 8 }}>HEAL {itemDef.heal}</span>}
                              {itemDef.atk > 0 && <span style={{ color: '#f85149', marginRight: 8 }}>ATK +{itemDef.atk}</span>}
                              {itemDef.def > 0 && <span style={{ color: '#58a6ff', marginRight: 8 }}>DEF +{itemDef.def}</span>}
                            </div>
                          )}
                        </div>
                        {myPlayer?.alive && itemDef && (
                          <button onClick={() => useItem(name)} disabled={actionLoading}
                            style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #30363d', background: '#21262d', color: '#e6edf3', fontSize: 12, cursor: 'pointer' }}>
                            使用
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* 装备面板 */}
          {panel === 'equip' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {equipsRef.current.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#484f58', marginTop: 30, fontSize: 13 }}>尚无装备</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {equipsRef.current.map(inst => {
                    const tier = inst.tier
                    if (!tier) return null
                    const rarity = RARITY_META[tier.rarity] || RARITY_META.common
                    const element = ELEMENT_META[tier.element] || ELEMENT_META.none
                    const durPct = tier.durability_max > 0 ? (inst.durability_current / tier.durability_max * 100) : 100
                    return (
                      <div key={inst.id} style={{
                        padding: '12px 14px', borderRadius: 10, background: '#1c2129',
                        border: `1px solid ${rarity.color}30`,
                        boxShadow: `0 0 8px ${rarity.glow || 'transparent'}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <div>
                            <span style={{ fontWeight: 700, color: rarity.color, fontSize: 13 }}>{tier.name}</span>
                            <span style={{ marginLeft: 8, fontSize: 10, color: '#8b949e' }}>{element.icon} {element.label}</span>
                          </div>
                          <span style={{ fontSize: 10, color: rarity.color, background: `${rarity.color}15`, padding: '1px 8px', borderRadius: 8 }}>
                            {rarity.label}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#8b949e', marginBottom: 6 }}>
                          {tier.base_atk > 0 && <span style={{ color: '#f85149' }}>ATK +{tier.base_atk + (inst.bonus_atk || 0)}</span>}
                          {tier.base_def > 0 && <span style={{ color: '#58a6ff' }}>DEF +{tier.base_def + (inst.bonus_def || 0)}</span>}
                          {tier.base_hp  > 0 && <span style={{ color: '#3fb950' }}>HP +{tier.base_hp}</span>}
                        </div>
                        {tier.passive && (
                          <div style={{ fontSize: 11, color: '#bc8cff', marginBottom: 6 }}>
                            {tier.passive.icon} {tier.passive.name}
                            <span style={{ color: '#8b949e', marginLeft: 4 }}>({Math.round(tier.passive.trigger_chance * 100)}%触发)</span>
                          </div>
                        )}
                        {tier.durability_max > 0 && (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8b949e', marginBottom: 3 }}>
                              <span>耐久度</span>
                              <span>{inst.durability_current}/{tier.durability_max}</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: '#21262d' }}>
                              <div style={{ height: '100%', borderRadius: 2, width: `${durPct}%`, background: durPct > 50 ? '#3fb950' : durPct > 25 ? '#d29922' : '#f85149', transition: 'width 0.4s' }} />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 右栏：地图信息 + 战斗日志 */}
        <div style={{ background: '#161b22', borderLeft: '1px solid #21262d', overflowY: 'auto', padding: 16 }}>
          {/* 地图信息 */}
          {mapConfig && (
            <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, background: '#1c2129', border: '1px solid #30363d' }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                {weatherInfo.icon} {mapConfig.name || '当前区域'}
              </div>
              <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#8b949e' }}>
                <span>天气 {weatherInfo.label}</span>
                {mapConfig.danger_level && (
                  <span style={{ color: mapConfig.danger_level >= 4 ? '#f85149' : mapConfig.danger_level >= 3 ? '#d29922' : '#3fb950' }}>
                    危险度 {'★'.repeat(mapConfig.danger_level)}
                  </span>
                )}
              </div>
              {/* 天气影响提示 */}
              <div style={{ marginTop: 8, fontSize: 10, color: '#484f58', lineHeight: 1.7 }}>
                {weather === 'rain'  && '🌧️ 射击/投掷武器命中率降低'}
                {weather === 'fog'   && '🌫️ 搜索道具概率减半'}
                {weather === 'storm' && '⛈️ 全属性微弱削弱，NPC遭遇率上升'}
                {weather === 'night' && '🌑 道具搜索率降低，NPC更活跃'}
              </div>
            </div>
          )}

          {/* 战斗历史（NPC战斗） */}
          {battleState && battleState.log.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>战斗记录</div>
              {battleState.log.map((l, i) => (
                <div key={i} style={{ fontSize: 11, color: '#8b949e', padding: '3px 0', borderBottom: '1px solid #21262d' }}>{l}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
