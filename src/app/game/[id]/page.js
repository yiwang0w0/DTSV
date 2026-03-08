'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../../layout'
import {
  loadGameRules, loadBuffPool, clearRulesCache,
  getRule, calcDamage, calcItemEffect,
  processBuffs, applyBuff, getSearchChances, getInitPlayerStats,
} from '@/lib/gameEngine'
import {
  calcEquippedStats, triggerPassives, tickPassiveCooldowns,
  consumeDurability, RARITY_META,
} from '@/lib/equipmentEngine'

/* ─── 设计 Token ─── */
const T = {
  bg0:'#07090f', bg1:'#0c1018', bg2:'#111827', bg3:'#1a2335',
  border:'#1f2d42', borderB:'#2a3f5f',
  text:'#d4e4f7', dim:'#4a6a8a', dimB:'#6a8aaa',
  cyan:'#00d4ff', green:'#00e676', red:'#ff4455',
  yellow:'#ffc740', purple:'#b47dff', orange:'#ff8c42',
}

/* ─── 天气 ─── */
const WEATHER = {
  clear: { label:'晴天',   icon:'☀️',  mod:'' },
  rain:  { label:'暴雨',   icon:'🌧️',  mod:'射击命中-10%' },
  fog:   { label:'大雾',   icon:'🌫️',  mod:'搜索率减半' },
  storm: { label:'暴风雨', icon:'⛈️',  mod:'全属性-5%' },
  night: { label:'黑夜',   icon:'🌑',  mod:'搜索率-15%' },
  snow:  { label:'暴雪',   icon:'❄️',  mod:'行动受限' },
}

/* ─── 装备槽 ─── */
const SLOTS = [
  { key:'weapon',    label:'远程兵器' },
  { key:'armor',     label:'身体装备' },
  { key:'helmet',    label:'头部装备' },
  { key:'gloves',    label:'手臂装备' },
  { key:'boots',     label:'腿部装备' },
  { key:'accessory', label:'饰　　物' },
]

/* ════════════════════════════
   基础 UI 组件
════════════════════════════ */
function hpColor(hp, max) {
  const r = hp / max
  return r > 0.6 ? T.green : r > 0.3 ? T.yellow : T.red
}

function HpBar({ hp, max, h = 6 }) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100))
  const c   = hpColor(hp, max)
  return (
    <div style={{ height:h, background:T.bg0, borderRadius:3, overflow:'hidden', border:`1px solid ${T.border}` }}>
      <div style={{ height:'100%', width:`${pct}%`, background:c,
        boxShadow:`0 0 6px ${c}80`, transition:'width .4s, background .3s', borderRadius:3 }} />
    </div>
  )
}

function BuffTag({ buffDef, remaining }) {
  if (!buffDef) return null
  const c = buffDef.is_debuff ? T.red : T.green
  return (
    <div title={`${buffDef.name}（剩余 ${remaining} 回合）`}
      style={{ display:'inline-flex', alignItems:'center', gap:3,
        padding:'2px 7px', borderRadius:8, fontSize:10,
        background:`${c}15`, border:`1px solid ${c}30`, color:c }}>
      {buffDef.icon} {buffDef.name}
      <span style={{ opacity:0.6 }}>{remaining}</span>
    </div>
  )
}

function LogLine({ entry }) {
  const c = { damage:T.red, heal:T.green, crit:T.yellow, buff:T.purple,
               system:T.cyan, death:T.red, kill:T.yellow, attack:T.orange }[entry.type] || T.dimB
  return (
    <div style={{ padding:'4px 0', borderBottom:`1px solid ${T.border}`, fontSize:12, color:c, lineHeight:1.5 }}>
      <span style={{ color:T.dim, marginRight:6, fontFamily:'monospace', fontSize:10 }}>{entry.time}</span>
      {entry.text}
    </div>
  )
}

function PanelTitle({ children, right }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'8px 12px', borderBottom:`1px solid ${T.border}`,
      fontSize:11, fontWeight:700, color:T.dimB,
      textTransform:'uppercase', letterSpacing:'1px', flexShrink:0 }}>
      <span>{children}</span>
      {right && <span>{right}</span>}
    </div>
  )
}

function Btn({ children, variant='default', size='md', onClick, disabled, sx={} }) {
  const sizes   = { sm:{fontSize:11,padding:'4px 10px'}, md:{fontSize:13,padding:'8px 16px'}, lg:{fontSize:15,padding:'12px 24px'} }
  const variants = {
    default: { background:T.bg3,          color:T.text,   border:`1px solid ${T.border}` },
    primary: { background:T.cyan,          color:T.bg0 },
    danger:  { background:`${T.red}20`,    color:T.red,    border:`1px solid ${T.red}40` },
    warn:    { background:`${T.yellow}18`, color:T.yellow, border:`1px solid ${T.yellow}30` },
    ghost:   { background:'transparent',   color:T.dimB,   border:`1px solid ${T.border}` },
  }
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} className="hov"
      style={{ border:'none', cursor:disabled?'not-allowed':'pointer', borderRadius:6,
        fontWeight:600, fontFamily:'inherit', opacity:disabled?.45:1,
        display:'inline-flex', alignItems:'center', justifyContent:'center', gap:4,
        transition:'filter .15s, opacity .15s',
        ...sizes[size], ...variants[variant], ...sx }}>
      {children}
    </button>
  )
}

/* ════════════════════════════
   主页面
════════════════════════════ */
export default function GamePage() {
  const { id: roomId } = useParams()
  const { user }       = useAuth()
  const router         = useRouter()

  const [room,      setRoom]      = useState(null)
  const [gamevars,  setGamevars]  = useState(null)
  const [mapConfig, setMapConfig] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [busy,      setBusy]      = useState(false)
  const [logs,      setLogs]      = useState([])
  const [battle,    setBattle]    = useState(null)
  const [panel,     setPanel]     = useState('log')  // log | bag | equip
  const [craftOpen, setCraft]     = useState(false)

  const rulesRef    = useRef(null)
  const buffPoolRef = useRef(null)
  const itemPoolRef = useRef(null)
  const npcPoolRef  = useRef(null)
  const equipsRef   = useRef([])
  const logRef      = useRef(null)

  /* ── 初始化 ── */
  const init = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [rules, bp] = await Promise.all([loadGameRules(), loadBuffPool()])
    rulesRef.current = rules; buffPoolRef.current = bp

    const { data: rm } = await supabase.from('rooms').select('*').eq('id', roomId).single()
    if (!rm) { router.push('/'); return }
    setRoom(rm)

    const { data: mc } = await supabase.from('map_config').select('*').eq('map_id', rm.current_map || 1).single()
    setMapConfig(mc)

    const mid = rm.current_map || 1
    const [{ data: items }, { data: npcs }] = await Promise.all([
      supabase.from('item_pool').select('*').contains('maps', [mid]),
      supabase.from('npc_pool').select('*').contains('maps', [mid]),
    ])
    itemPoolRef.current = items || []; npcPoolRef.current = npcs || []

    const { data: eq } = await supabase
      .from('equipment_instances')
      .select('*, tier:equipment_tiers(*, passive:passive_skills(*), series:equipment_series(slot,name))')
      .eq('owner_id', user.id).eq('room_id', roomId).eq('is_equipped', true)
    equipsRef.current = eq || []

    setGamevars(rm.gamevars || {})
    setLoading(false)
  }, [user, roomId])

  useEffect(() => { init() }, [init])

  /* Realtime */
  useEffect(() => {
    const ch = supabase.channel(`room-${roomId}`)
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'rooms', filter:`id=eq.${roomId}` },
        p => { setRoom(p.new); setGamevars(p.new.gamevars || {}) })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [roomId])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  /* ── 辅助 ── */
  function log(text, type = 'info') {
    const time = new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
    setLogs(p => [...p.slice(-400), { text, type, time }])
  }

  async function save(gv) {
    setGamevars(gv)
    await supabase.from('rooms').update({ gamevars: gv }).eq('id', roomId)
  }

  function getMe(gv = gamevars) {
    const uid  = user?.id
    const base = gv?.players?.[uid]
    if (!base) return null
    const eq = calcEquippedStats(equipsRef.current)
    return {
      ...base,
      atk: (base.atk || 0) + eq.totalAtk,
      def: (base.def || 0) + eq.totalDef,
      _pass: equipsRef.current.map(e => e.tier?.passive).filter(Boolean),
    }
  }

  function tickTurn(gv) {
    const np = { ...gv.players }; const tl = []
    for (const [id, p] of Object.entries(np)) {
      if (!p.alive) continue
      const { updatedPlayer, logEntries } = processBuffs(p, buffPoolRef.current || [])
      tl.push(...logEntries)
      np[id] = tickPassiveCooldowns(updatedPlayer)
    }
    return { gv: { ...gv, players: np }, tl }
  }

  /* ════════════════════════════
     核心行动
  ════════════════════════════ */

  /* 加入游戏 */
  async function joinGame() {
    if (!user || !gamevars || gamevars.players?.[user.id]) return
    setBusy(true); clearRulesCache()
    const rules = await loadGameRules(); rulesRef.current = rules
    const s = getInitPlayerStats(rules)
    await save({
      ...gamevars,
      players: {
        ...gamevars.players,
        [user.id]: {
          uid: user.id,
          name: user.user_metadata?.name || user.email?.split('@')[0] || '玩家',
          ...s, alive:true, inventory:[], buffs:[], passiveCooldowns:{}, kills:0,
        },
      },
    })
    log(`✅ 加入游戏！HP:${s.hp} ATK:${s.atk} DEF:${s.def}`, 'system')
    setBusy(false)
  }

  /* 搜索区域 */
  async function doSearch() {
    const uid = user?.id
    if (!gamevars?.players?.[uid]?.alive) return
    setBusy(true)

    const { gv, tl } = tickTurn(gamevars)
    tl.forEach(t => log(t, t.includes('损失') ? 'damage' : 'heal'))

    if (!gv.players?.[uid]?.alive) {
      await save(gv); log('💀 Buff 效果让你倒下了', 'death'); setBusy(false); return
    }

    const weather = mapConfig?.weather || 'clear'
    const { itemChance, npcChance } = getSearchChances(rulesRef.current, weather)
    const roll = Math.random()
    const w = WEATHER[weather] || WEATHER.clear
    log(`${w.icon} ${w.label} · 搜索中...`, 'dim')

    if (roll < npcChance) {
      // 遭遇 NPC
      const pool = npcPoolRef.current || []
      if (pool.length > 0) {
        const npc = pool[Math.floor(Math.random() * pool.length)]
        setBattle({ npc, npcHp: npc.hp, npcMaxHp: npc.hp, turn: 1, log: [] })
        log(`⚠️ 遭遇了【${npc.name}】！HP:${npc.hp} ATK:${npc.atk} DEF:${npc.def}`, 'damage')
      } else {
        log('🔍 区域安静，什么都没有', 'dim')
      }
      await save(gv)

    } else if (roll < npcChance + itemChance) {
      // 找到道具（按 amount 权重抽取）
      const pool = itemPoolRef.current || []
      if (pool.length > 0) {
        const totalWeight = pool.reduce((s, i) => s + (i.amount || 1), 0)
        let r = Math.random() * totalWeight
        let found = pool[0]
        for (const item of pool) { r -= item.amount || 1; if (r <= 0) { found = item; break } }

        const newInv = [...(gv.players[uid].inventory || []), found.name]
        await save({ ...gv, players: { ...gv.players, [uid]: { ...gv.players[uid], inventory: newInv } } })
        const rar = found.rarity ? `[${found.rarity}] ` : ''
        log(`📦 找到了 ${rar}【${found.name}】！${found.description ? `（${found.description}）` : ''}`, 'heal')
      } else {
        log('🔍 翻了翻，什么有用的都没找到', 'dim')
        await save(gv)
      }

    } else {
      log('🔍 这片区域已被搜刮一空', 'dim')
      await save(gv)
    }

    setBusy(false)
  }

  /* 攻击 NPC */
  async function attackNpc() {
    if (!battle) return
    setBusy(true)
    const uid = user?.id
    const bp = buffPoolRef.current || []
    const weather = mapConfig?.weather || 'clear'
    let me = getMe()
    let { npc, npcHp, npcMaxHp, turn } = battle
    const bLog = [...battle.log]
    const weapon = equipsRef.current.find(e => e.tier?.series?.slot === 'weapon')
    const subKind = weapon?.tier?.sub_kind || ''

    // 玩家攻打 NPC
    const dmgOut = calcDamage(me, { ...npc, hp: npcHp, maxHp: npcMaxHp }, rulesRef.current, subKind, weather)
    const { attackerUpdated: me2, logs: pl } = triggerPassives('on_attack', me, { ...npc, hp: npcHp }, me._pass || [], bp)
    me = me2; pl.forEach(l => { log(l, 'buff'); bLog.push(l) })
    const newNpcHp = Math.max(0, npcHp - dmgOut)
    const msg1 = `🗡️ 攻击【${npc.name}】，造成 ${dmgOut} 伤害`
    log(msg1, 'damage'); bLog.push(msg1)

    if (newNpcHp <= 0) {
      log(`🏆 击败了【${npc.name}】！`, 'kill')
      const { attackerUpdated: me3 } = triggerPassives('on_kill', me, null, me._pass || [], bp)
      me = me3
      const drops = npc.drop_items || []
      const newInv = [...(gamevars.players[uid].inventory || []), ...drops]
      if (drops.length) log(`💰 获得：${drops.join('、')}`, 'heal')
      await save({ ...gamevars, players: { ...gamevars.players,
        [uid]: { ...gamevars.players[uid], hp: me.hp, buffs: me.buffs || [],
          passiveCooldowns: me.passiveCooldowns || {}, inventory: newInv,
          kills: (gamevars.players[uid].kills || 0) + 1 } } })
      await consumeDurability(uid, roomId, 1)
      setBattle(null); setBusy(false); return
    }

    // NPC 反击
    const dmgIn = calcDamage({ ...npc, hp: newNpcHp, maxHp: npcMaxHp }, me, rulesRef.current, '', weather)
    const newMyHp = Math.max(0, (me.hp || 0) - dmgIn)
    const msg2 = `💢 【${npc.name}】反击，造成 ${dmgIn} 伤害`
    log(msg2, 'damage'); bLog.push(msg2)

    await save({ ...gamevars, players: { ...gamevars.players,
      [uid]: { ...gamevars.players[uid], hp: newMyHp, alive: newMyHp > 0,
        buffs: me.buffs || [], passiveCooldowns: me.passiveCooldowns || {} } } })
    setBattle({ ...battle, npcHp: newNpcHp, turn: turn + 1, log: bLog })
    if (newMyHp <= 0) { log('💀 你在战斗中倒下了', 'death'); setBattle(null) }
    await consumeDurability(uid, roomId, 1)
    setBusy(false)
  }

  /* 逃跑 */
  async function fleeNpc() {
    if (!battle) return
    setBusy(true)
    const fleeRate = getRule(rulesRef.current, 'flee_success_rate', 0.6)
    if (Math.random() < fleeRate) {
      log('🏃 成功逃脱！', 'system'); setBattle(null)
    } else {
      const uid = user?.id
      const me = getMe()
      const weather = mapConfig?.weather || 'clear'
      const dmg = calcDamage({ ...battle.npc, hp: battle.npcHp, maxHp: battle.npcMaxHp }, me, rulesRef.current, '', weather)
      const newHp = Math.max(0, me.hp - dmg)
      log(`❌ 逃跑失败！【${battle.npc.name}】造成 ${dmg} 伤害`, 'damage')
      await save({ ...gamevars, players: { ...gamevars.players,
        [uid]: { ...gamevars.players[uid], hp: newHp, alive: newHp > 0 } } })
      if (newHp <= 0) { log('💀 你倒在了逃跑途中', 'death'); setBattle(null) }
    }
    setBusy(false)
  }

  /* 攻击玩家 PvP */
  async function atkPlayer(targetUid) {
    const uid = user?.id
    if (!uid || !gamevars?.players?.[uid]?.alive || targetUid === uid) return
    setBusy(true)
    const bp = buffPoolRef.current || []
    const weather = mapConfig?.weather || 'clear'
    const { gv, tl } = tickTurn(gamevars)
    tl.forEach(t => log(t, 'buff'))
    let me = getMe(gv); let tgt = { ...gv.players[targetUid] }
    if (!me?.alive || !tgt?.alive) { setBusy(false); return }
    const weapon = equipsRef.current.find(e => e.tier?.series?.slot === 'weapon')
    const dmg = calcDamage(me, tgt, rulesRef.current, weapon?.tier?.sub_kind || '', weather)
    const { attackerUpdated: me2, defenderUpdated: tgt2, logs: pl } = triggerPassives('on_attack', me, tgt, me._pass || [], bp)
    me = me2; if (tgt2) tgt = tgt2; pl.forEach(l => log(l, 'buff'))
    const newTHp = Math.max(0, (tgt.hp || 0) - dmg)
    log(`⚔️ 攻击 ${tgt.name}，造成 ${dmg} 伤害（对方剩余 HP: ${newTHp}）`, 'damage')
    let ngv = { ...gv, players: { ...gv.players,
      [uid]:       { ...gv.players[uid],       hp: me.hp,   buffs: me.buffs || [],  passiveCooldowns: me.passiveCooldowns || {} },
      [targetUid]: { ...gv.players[targetUid], hp: newTHp,  alive: newTHp > 0 },
    }}
    if (newTHp <= 0) {
      log(`🏆 击败了 ${tgt.name}！`, 'kill')
      const { attackerUpdated: me3 } = triggerPassives('on_kill', me, null, me._pass || [], bp)
      ngv.players[uid] = { ...ngv.players[uid], hp: me3.hp, buffs: me3.buffs || [],
        kills: (ngv.players[uid].kills || 0) + 1 }
    }
    await save(ngv); await consumeDurability(uid, roomId, 1); setBusy(false)
  }

  /* 使用道具 */
  async function useItem(name) {
    const uid = user?.id
    if (!gamevars?.players?.[uid]?.alive) return
    setBusy(true)
    const me = getMe()
    const def = (itemPoolRef.current || []).find(i => i.name === name)
    if (!def) { log(`未知道具：${name}`, 'dim'); setBusy(false); return }
    const fx = calcItemEffect(def, me, rulesRef.current || {})
    const bp = buffPoolRef.current || []
    let np = { ...gamevars.players[uid] }
    if (fx.hpDelta)  { np.hp = Math.max(0, Math.min(me.maxHp, np.hp + fx.hpDelta)); np.alive = np.hp > 0; log(`💊 ${name} HP${fx.hpDelta > 0 ? '+' : ''}${fx.hpDelta} → ${np.hp}`, fx.hpDelta > 0 ? 'heal' : 'damage') }
    if (fx.atkDelta) { np.atk = Math.max(0, np.atk + fx.atkDelta); log(`⚔️ ${name} ATK+${fx.atkDelta}`, 'buff') }
    if (fx.defDelta) { np.def = Math.max(0, np.def + fx.defDelta); log(`🛡️ ${name} DEF+${fx.defDelta}`, 'buff') }
    for (const bid of fx.newBuffIds || []) {
      const bd = bp.find(b => b.id === bid)
      if (bd) { np = applyBuff(np, bid, bd); log(`${bd.icon} 触发：${bd.name}`, 'buff') }
    }
    const inv = [...(np.inventory || [])]; inv.splice(inv.indexOf(name), 1); np.inventory = inv
    await save({ ...gamevars, players: { ...gamevars.players, [uid]: np } })
    setBusy(false)
  }

  /* 卸下装备 */
  async function unequip(instId, tierName) {
    await supabase.from('equipment_instances').update({ is_equipped: false, equipped_slot: null }).eq('id', instId)
    log(`卸下了【${tierName}】`, 'dim')
    await init()
  }

  /* ════════════════════════════
     派生状态
  ════════════════════════════ */
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', background:T.bg0, color:T.dim, flexDirection:'column', gap:14 }}>
      <div style={{ width:32, height:32, border:`3px solid ${T.border}`, borderTopColor:T.cyan,
        borderRadius:'50%', animation:'spin .7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <span style={{ fontFamily:'monospace', letterSpacing:2, fontSize:12 }}>LOADING...</span>
    </div>
  )
  if (!room) return null

  const uid      = user?.id
  const me       = getMe()
  const allP     = Object.values(gamevars?.players || {})
  const otherP   = allP.filter(p => p.uid !== uid)
  const inGame   = !!gamevars?.players?.[uid]
  const w        = WEATHER[mapConfig?.weather || 'clear'] || WEATHER.clear
  const bp       = buffPoolRef.current || []
  const eqMap    = Object.fromEntries(equipsRef.current.map(i => [i.tier?.series?.slot, i]).filter(([k]) => k))
  const invCount = (me?.inventory || []).reduce((a, n) => { a[n] = (a[n] || 0) + 1; return a }, {})

  /* ════════════════════════════
     渲染
  ════════════════════════════ */
  return (
    <div style={{ height:'100vh', background:T.bg0, color:T.text, display:'flex',
      flexDirection:'column', fontFamily:'"Noto Sans SC",system-ui,sans-serif',
      fontSize:13, overflow:'hidden' }}>

      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:${T.bg0}}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:2px}
        .hov:hover:not(:disabled){filter:brightness(1.2)}
        select,input{outline:none;font-family:inherit}
      `}</style>

      {/* ══ 顶栏 ══ */}
      <div style={{ background:`linear-gradient(90deg,${T.bg2} 0%,${T.bg3} 50%,${T.bg2} 100%)`,
        borderBottom:`1px solid ${T.borderB}`, padding:'0 20px', height:44, flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontSize:18, fontWeight:900, color:T.cyan, letterSpacing:3,
          textShadow:`0 0 20px ${T.cyan}80` }}>ACFUN 大逃杀</div>
        <div style={{ display:'flex', gap:20, fontSize:12, color:T.dim, alignItems:'center' }}>
          <span>{mapConfig?.name || '未知区域'}</span>
          <span>{w.icon} {w.label}{w.mod && <span style={{ color:T.yellow, marginLeft:4, fontSize:10 }}>({w.mod})</span>}</span>
          <span>{new Date().toLocaleString('zh-CN',{ month:'numeric', day:'numeric', weekday:'short', hour:'2-digit', minute:'2-digit' })}</span>
          {allP.filter(p => p.alive).length > 0 && (
            <span style={{ color:T.red, fontWeight:700 }}>剩余 {allP.filter(p => p.alive).length} 人</span>
          )}
        </div>
      </div>

      {/* ══ 三栏 ══ */}
      <div style={{ flex:1, display:'grid', gridTemplateColumns:'300px 1fr 280px', overflow:'hidden' }}>

        {/* ═ 左栏：玩家状态 ═ */}
        <div style={{ borderRight:`1px solid ${T.border}`, display:'flex', flexDirection:'column', overflow:'hidden', background:T.bg1 }}>

          {/* 我的状态 */}
          <PanelTitle>👤 {me ? me.name : '未加入'}</PanelTitle>
          <div style={{ padding:'10px 12px', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
            {me ? (
              <>
                <HpBar hp={me.hp || 0} max={me.maxHp || 100} h={8} />
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:4, fontSize:11 }}>
                  <span style={{ color:hpColor(me.hp, me.maxHp), fontFamily:'monospace', fontWeight:700 }}>{me.hp}</span>
                  <span style={{ color:T.dim }}>{me.maxHp}</span>
                </div>
                <div style={{ marginTop:6, display:'flex', gap:12, fontSize:11 }}>
                  <span style={{ color:T.orange }}>ATK {me.atk}</span>
                  <span style={{ color:T.cyan }}>DEF {me.def}</span>
                  <span style={{ color:T.yellow }}>击杀 {me.kills || 0}</span>
                </div>
                {(me.buffs || []).length > 0 && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:8 }}>
                    {me.buffs.map((b, i) => <BuffTag key={i} buffDef={bp.find(x => x.id === b.buffId)} remaining={b.remainingTurns} />)}
                  </div>
                )}
                {!me.alive && <div style={{ marginTop:8, textAlign:'center', color:T.red, fontSize:12 }}>💀 已阵亡，仅观战</div>}
              </>
            ) : (
              <div style={{ textAlign:'center', color:T.dim, fontSize:12, padding:'12px 0' }}>加入游戏后显示状态</div>
            )}
          </div>

          {/* 在场玩家 */}
          <PanelTitle>在场玩家 ({allP.filter(p => p.alive).length} 存活)</PanelTitle>
          <div style={{ flex:1, overflowY:'auto' }}>
            {allP.length === 0 && <div style={{ textAlign:'center', color:T.dim, fontSize:12, marginTop:20 }}>暂无玩家</div>}
            {allP.map(p => (
              <div key={p.uid} style={{ margin:'6px 8px', padding:'8px 10px', borderRadius:8,
                background: p.uid === uid ? `${T.cyan}08` : T.bg2,
                border:`1px solid ${p.uid === uid ? T.cyan + '30' : T.border}`,
                opacity: p.alive ? 1 : 0.45 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                  <span style={{ fontWeight:600, fontSize:12, color: p.uid === uid ? T.cyan : T.text }}>
                    {p.uid === uid ? '▶ ' : ''}{p.name}
                    {!p.alive && <span style={{ color:T.red, marginLeft:6, fontSize:10 }}>†</span>}
                  </span>
                  {p.alive && p.uid !== uid && me?.alive && !battle && (
                    <Btn variant="danger" size="sm" onClick={() => atkPlayer(p.uid)} disabled={busy}>攻击</Btn>
                  )}
                </div>
                <HpBar hp={p.hp || 0} max={p.maxHp || 100} h={4} />
                <div style={{ display:'flex', gap:8, marginTop:4, fontSize:10, color:T.dim }}>
                  <span>ATK {p.atk}</span><span>DEF {p.def}</span><span>击杀 {p.kills || 0}</span>
                </div>
                {(p.buffs || []).length > 0 && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:3, marginTop:5 }}>
                    {p.buffs.map((b, i) => <BuffTag key={i} buffDef={bp.find(x => x.id === b.buffId)} remaining={b.remainingTurns} />)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ═ 中栏：行动 + 日志/背包/装备 ═ */}
        <div style={{ display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* 行动区 */}
          <div style={{ padding:'12px 14px', borderBottom:`1px solid ${T.border}`, background:T.bg1, flexShrink:0 }}>
            {battle ? (
              /* NPC 战斗 */
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <span style={{ fontWeight:700, fontSize:14, color:T.red }}>⚔️ 战斗中：【{battle.npc.name}】</span>
                  <span style={{ fontSize:11, color:T.dim }}>第 {battle.turn} 回合</span>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:12, alignItems:'center', marginBottom:12 }}>
                  <div>
                    <div style={{ fontSize:11, color:T.dimB, marginBottom:3 }}>{me?.name}</div>
                    <HpBar hp={me?.hp || 0} max={me?.maxHp || 100} />
                    <div style={{ fontSize:10, color:T.dim, marginTop:2 }}>ATK {me?.atk}  DEF {me?.def}</div>
                  </div>
                  <div style={{ fontSize:18, color:T.dim }}>VS</div>
                  <div>
                    <div style={{ fontSize:11, color:T.dimB, marginBottom:3 }}>{battle.npc.name}</div>
                    <HpBar hp={battle.npcHp} max={battle.npcMaxHp} />
                    <div style={{ fontSize:10, color:T.dim, marginTop:2 }}>ATK {battle.npc.atk}  DEF {battle.npc.def}</div>
                  </div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <Btn variant="danger" sx={{ flex:2, padding:'10px 0', fontSize:14, fontWeight:700 }} onClick={attackNpc} disabled={busy}>
                    {busy ? '攻击中...' : '⚔️ 攻击'}
                  </Btn>
                  <Btn variant="ghost" sx={{ flex:1 }} onClick={fleeNpc} disabled={busy}>🏃 逃跑</Btn>
                </div>
              </div>
            ) : !inGame ? (
              /* 未加入 */
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:13, color:T.dim, marginBottom:12 }}>你还没有加入游戏</div>
                <Btn variant="primary" size="lg" onClick={joinGame} disabled={busy}>加入游戏</Btn>
              </div>
            ) : (
              /* 平时行动 */
              <div>
                <Btn variant="primary" sx={{ width:'100%', marginBottom:8, fontSize:14, padding:'10px 0', fontWeight:700 }}
                  onClick={doSearch} disabled={busy || !me?.alive}>
                  {busy ? '搜索中...' : '🔍 搜索区域'}
                </Btn>
                <div style={{ display:'flex', gap:6 }}>
                  <Btn variant="warn" onClick={() => setCraft(true)} sx={{ width:'100%' }}>🔨 道具合成</Btn>
                </div>
                {!me?.alive && <div style={{ textAlign:'center', color:T.red, fontSize:12, marginTop:8 }}>💀 你已阵亡，只能观战</div>}
              </div>
            )}
          </div>

          {/* Tab 导航 */}
          <div style={{ display:'flex', background:T.bg0, borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
            {[
              { key:'log',   label:'📋 日志' },
              { key:'bag',   label:`🎒 背包${inGame ? ` (${(me?.inventory || []).length})` : ''}` },
              { key:'equip', label:`⚔️ 装备 (${equipsRef.current.length})` },
            ].map(t => (
              <button key={t.key} onClick={() => setPanel(t.key)} style={{
                flex:1, padding:'9px 0', border:'none', background:'transparent',
                borderBottom:`2px solid ${panel === t.key ? T.cyan : 'transparent'}`,
                color: panel === t.key ? T.cyan : T.dim,
                fontSize:12, fontWeight: panel === t.key ? 700 : 400, cursor:'pointer',
              }}>{t.label}</button>
            ))}
          </div>

          {/* Tab 内容 */}
          <div style={{ flex:1, overflowY:'auto', padding:12 }}>

            {/* 日志 */}
            {panel === 'log' && (
              <div ref={logRef}>
                {logs.length === 0
                  ? <div style={{ textAlign:'center', color:T.dim, marginTop:24, fontSize:12 }}>等待行动...</div>
                  : logs.slice().reverse().map((l, i) => <LogLine key={i} entry={l} />)}
              </div>
            )}

            {/* 背包 */}
            {panel === 'bag' && (
              <div>
                {!inGame && <div style={{ textAlign:'center', color:T.dim, marginTop:24, fontSize:12 }}>加入游戏后显示背包</div>}
                {inGame && Object.keys(invCount).length === 0 && <div style={{ textAlign:'center', color:T.dim, marginTop:24, fontSize:12 }}>背包空空如也</div>}
                {inGame && Object.entries(invCount).map(([name, count]) => {
                  const def = (itemPoolRef.current || []).find(i => i.name === name)
                  return (
                    <div key={name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                      padding:'8px 10px', borderRadius:8, background:T.bg2,
                      border:`1px solid ${T.border}`, marginBottom:6 }}>
                      <div>
                        <div style={{ fontWeight:600, fontSize:12 }}>
                          {name}{count > 1 && <span style={{ color:T.dim, fontSize:11, marginLeft:5 }}>×{count}</span>}
                        </div>
                        {def?.description && <div style={{ fontSize:11, color:T.dimB, marginTop:2 }}>{def.description}</div>}
                        {def && (
                          <div style={{ fontSize:10, marginTop:2, display:'flex', gap:8 }}>
                            {def.heal > 0 && <span style={{ color:T.green }}>HEAL {def.heal}</span>}
                            {def.atk  > 0 && <span style={{ color:T.orange }}>ATK +{def.atk}</span>}
                            {def.def  > 0 && <span style={{ color:T.cyan }}>DEF +{def.def}</span>}
                          </div>
                        )}
                      </div>
                      {me?.alive && def && <Btn size="sm" onClick={() => useItem(name)} disabled={busy}>使用</Btn>}
                    </div>
                  )
                })}
              </div>
            )}

            {/* 装备槽 */}
            {panel === 'equip' && (
              <div>
                {equipsRef.current.length === 0 && <div style={{ textAlign:'center', color:T.dim, marginTop:24, fontSize:12 }}>暂无装备</div>}
                {SLOTS.map(slot => {
                  const inst = eqMap[slot.key]
                  const tier = inst?.tier
                  const rar  = tier ? RARITY_META[tier.rarity] : null
                  return (
                    <div key={slot.key} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px',
                      borderRadius:6, marginBottom:5,
                      background: tier ? T.bg2 : T.bg0,
                      border:`1px solid ${tier ? (rar?.color + '30' || T.border) : T.border}`,
                      minHeight:36 }}>
                      <span style={{ fontSize:10, color:T.dim, width:52, flexShrink:0 }}>{slot.label}</span>
                      <div style={{ flex:1 }}>
                        {tier ? (
                          <div>
                            <span style={{ fontWeight:600, fontSize:12, color:rar?.color }}>{tier.name}</span>
                            <div style={{ display:'flex', gap:6, marginTop:2, fontSize:10 }}>
                              {tier.base_atk > 0 && <span style={{ color:T.orange }}>ATK+{tier.base_atk + (inst.bonus_atk || 0)}</span>}
                              {tier.base_def > 0 && <span style={{ color:T.cyan }}>DEF+{tier.base_def + (inst.bonus_def || 0)}</span>}
                              {tier.durability_max > 0 && (
                                <span style={{ color: inst.durability_current / tier.durability_max < 0.25 ? T.red : T.dim }}>
                                  耐久{inst.durability_current}/{tier.durability_max}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color:T.border, fontSize:11 }}>空槽</span>
                        )}
                      </div>
                      {tier && <Btn variant="danger" size="sm" onClick={() => unequip(inst.id, tier.name)}>卸下</Btn>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ═ 右栏：地图 + 战斗记录 ═ */}
        <div style={{ borderLeft:`1px solid ${T.border}`, display:'flex', flexDirection:'column', overflow:'hidden', background:T.bg1 }}>
          <PanelTitle>🗺️ 当前区域</PanelTitle>
          <div style={{ padding:'10px 12px', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
            {mapConfig ? (
              <>
                <div style={{ fontWeight:700, fontSize:13, marginBottom:6 }}>{w.icon} {mapConfig.name || '未知区域'}</div>
                <div style={{ display:'flex', gap:10, fontSize:11, color:T.dimB, marginBottom:6 }}>
                  <span>天气：{w.label}</span>
                  {mapConfig.danger_level && (
                    <span style={{ color: mapConfig.danger_level >= 4 ? T.red : mapConfig.danger_level >= 3 ? T.yellow : T.green }}>
                      危险度 {'★'.repeat(mapConfig.danger_level)}
                    </span>
                  )}
                </div>
                {w.mod && (
                  <div style={{ fontSize:11, color:T.dim, padding:'5px 8px', background:T.bg0, borderRadius:5, border:`1px solid ${T.border}` }}>
                    {w.icon} {w.mod}
                  </div>
                )}
              </>
            ) : (
              <div style={{ color:T.dim, fontSize:12 }}>加载中...</div>
            )}
          </div>

          {battle && battle.log.length > 0 && (
            <>
              <PanelTitle>⚔️ 战斗记录</PanelTitle>
              <div style={{ flex:1, overflowY:'auto', padding:'6px 10px' }}>
                {battle.log.map((l, i) => (
                  <div key={i} style={{ fontSize:11, color:T.dimB, padding:'3px 0', borderBottom:`1px solid ${T.border}` }}>{l}</div>
                ))}
              </div>
            </>
          )}

          {(!battle || battle.log.length === 0) && (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <div style={{ textAlign:'center', color:T.dim, fontSize:12 }}>
                <div style={{ fontSize:32, marginBottom:8, opacity:0.3 }}>🗺️</div>
                搜索区域以探索地图
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
