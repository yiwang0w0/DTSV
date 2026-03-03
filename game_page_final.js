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
  consumeDurability, RARITY_META, ELEMENT_META,
  checkCanCraft, executeCraft,
} from '@/lib/equipmentEngine'

/* ─────────────────────────────────────────────
   디자인 토큰
───────────────────────────────────────────── */
const T = {
  bg0:    '#07090f',
  bg1:    '#0c1018',
  bg2:    '#111827',
  bg3:    '#1a2335',
  border: '#1f2d42',
  borderB:'#2a3f5f',
  text:   '#d4e4f7',
  dim:    '#4a6a8a',
  dimB:   '#6a8aaa',
  cyan:   '#00d4ff',
  cyanD:  '#0099cc',
  green:  '#00e676',
  red:    '#ff4455',
  yellow: '#ffc740',
  purple: '#b47dff',
  orange: '#ff8c42',
}

/* ─────────────────────────────────────────────
   상수
───────────────────────────────────────────── */
const WEATHER = {
  clear:  { label:'晴天',   icon:'☀️',  mod:'' },
  rain:   { label:'暴雨',   icon:'🌧️',  mod:'射击命中-10%' },
  fog:    { label:'大雾',   icon:'🌫️',  mod:'搜索率减半' },
  storm:  { label:'暴风雨', icon:'⛈️',  mod:'全属性-5%' },
  night:  { label:'黑夜',   icon:'🌑',  mod:'搜索率-15%' },
  snow:   { label:'暴雪',   icon:'❄️',  mod:'行动受限' },
}

const SLOTS = [
  { key:'weapon',    label:'远程兵器' },
  { key:'armor',     label:'身体装备' },
  { key:'helmet',    label:'头部装备' },
  { key:'gloves',    label:'手臂装备' },
  { key:'boots',     label:'腿部装备' },
  { key:'accessory', label:'饰　　物' },
]

/* ─────────────────────────────────────────────
   작은 컴포넌트
───────────────────────────────────────────── */
function HpBar({ hp, max, h = 6 }) {
  const pct  = Math.max(0, Math.min(100, (hp / max) * 100))
  const color = pct > 60 ? T.green : pct > 30 ? T.yellow : T.red
  return (
    <div style={{ height: h, background: T.bg0, borderRadius: 3, overflow: 'hidden', border: `1px solid ${T.border}` }}>
      <div style={{ height:'100%', width:`${pct}%`, background:color,
        boxShadow:`0 0 6px ${color}80`, transition:'width .4s ease, background .3s', borderRadius:3 }} />
    </div>
  )
}

function StatRow({ label, value, color = T.text, mono = false }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'4px 0', borderBottom:`1px solid ${T.border}` }}>
      <span style={{ color: T.dim, fontSize: 11 }}>{label}</span>
      <span style={{ color, fontSize: 12, fontFamily: mono ? 'monospace' : 'inherit', fontWeight: mono ? 700 : 400 }}>
        {value}
      </span>
    </div>
  )
}

function Tag({ children, color = T.cyan }) {
  return (
    <span style={{
      fontSize: 9, padding: '1px 6px', borderRadius: 3,
      background: `${color}18`, border: `1px solid ${color}30`, color,
      letterSpacing: '.3px',
    }}>{children}</span>
  )
}

function PanelTitle({ children, right }) {
  return (
    <div style={{
      display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'6px 12px', borderBottom:`1px solid ${T.border}`,
      background: T.bg3, flexShrink: 0,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: T.dimB, textTransform:'uppercase', letterSpacing:'1px' }}>
        {children}
      </span>
      {right}
    </div>
  )
}

function Btn({ children, onClick, disabled, variant = 'default', size = 'md', style: sx = {} }) {
  const colors = {
    default: { bg: T.bg2, border: T.borderB, color: T.text },
    primary: { bg: `${T.cyan}18`,   border: T.cyan,   color: T.cyan },
    danger:  { bg: `${T.red}18`,    border: T.red,    color: T.red  },
    success: { bg: `${T.green}18`,  border: T.green,  color: T.green },
    warn:    { bg: `${T.yellow}18`, border: T.yellow, color: T.yellow },
  }
  const c = colors[variant]
  const pad = size === 'sm' ? '4px 10px' : size === 'lg' ? '10px 20px' : '6px 14px'
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? T.bg1 : c.bg,
      border: `1px solid ${disabled ? T.border : c.border}`,
      color: disabled ? T.dim : c.color,
      padding: pad, borderRadius: 4, fontSize: size === 'sm' ? 11 : 12,
      fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: 'inherit', transition: 'all .12s',
      opacity: disabled ? .5 : 1,
      ...sx,
    }}>{children}</button>
  )
}

/* ─────────────────────────────────────────────
   합성 드로어
───────────────────────────────────────────── */
function CraftDrawer({ open, onClose, uid, roomId, gamevars, onGamevarsChange, toast }) {
  const [trees, setTrees]       = useState([])
  const [loading, setLoading]   = useState(false)
  const [craftingId, setCraftId] = useState(null)
  const [instances, setInst]    = useState([])

  useEffect(() => {
    if (!open) return
    ;(async () => {
      setLoading(true)
      // 加载所有 tier + 配方
      const [{ data: tiers }, { data: recipes }] = await Promise.all([
        supabase.from('equipment_tiers').select(`
          id, name, tier, rarity, base_atk, base_def, base_hp, element, series_id,
          passive:passive_skills(id,name,icon),
          series:equipment_series(id,name,slot)
        `).order('series_id').order('tier'),
        supabase.from('tier_recipes').select(`
          *, ingredients:recipe_ingredients(
            *, item:item_pool(id,name), equipment:equipment_tiers(id,name)
          )
        `),
      ])

      // 加载玩家装备实例
      const { data: inst } = await supabase
        .from('equipment_instances').select('*')
        .eq('owner_id', uid).eq('room_id', roomId)
      setInst(inst || [])

      const recipeMap = {}
      for (const r of recipes || []) recipeMap[r.result_tier_id] = r

      const tierMap = {}
      for (const t of tiers || []) tierMap[t.id] = { ...t, recipe: recipeMap[t.id] || null }

      const craftable = (tiers || [])
        .filter(t => recipeMap[t.id])
        .map(t => {
          const recipe = recipeMap[t.id]
          // 前置名
          let prevName = null
          if (recipe.requires_prev_tier_id) prevName = tierMap[recipe.requires_prev_tier_id]?.name
          return { ...tierMap[t.id], recipe: { ...recipe, prevTierName: prevName } }
        })
        .sort((a, b) => (a.series_id - b.series_id) || (a.tier - b.tier))

      setTrees(craftable)
      setLoading(false)
    })()
  }, [open, uid, roomId])

  const inventory = gamevars?.players?.[uid]?.inventory || []

  async function doCraft(node) {
    setCraftId(node.id)
    try {
      const result = await executeCraft(node.id, uid, roomId, gamevars)
      if (result.success) {
        toast(`✨ 合成成功：【${node.name}】`)
        if (result.gamevars) await onGamevarsChange(result.gamevars)
        // 刷新实例
        const { data: inst } = await supabase.from('equipment_instances').select('*').eq('owner_id', uid).eq('room_id', roomId)
        setInst(inst || [])
      } else {
        toast('合成失败', 'error')
        if (result.gamevars) await onGamevarsChange(result.gamevars)
      }
    } catch(e) { toast(e.message, 'error') }
    setCraftId(null)
  }

  // 按系列分组
  const bySeies = {}
  for (const node of trees) {
    const k = node.series?.name || '其他'
    if (!bySeies[k]) bySeies[k] = []
    bySeies[k].push(node)
  }

  if (!open) return null

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:800, background:'rgba(0,0,0,.55)', backdropFilter:'blur(2px)' }} />
      <div style={{
        position:'fixed', right:0, top:0, bottom:0, zIndex:900,
        width: 480, maxWidth: '95vw',
        background: T.bg1, borderLeft: `1px solid ${T.borderB}`,
        display:'flex', flexDirection:'column',
        boxShadow: `-16px 0 48px rgba(0,0,0,.7)`,
        animation: 'slideIn .2s cubic-bezier(.16,1,.3,1)',
      }}>
        <style>{`@keyframes slideIn{from{transform:translateX(40px);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>

        <PanelTitle right={
          <button onClick={onClose} style={{ background:'none', border:'none', color:T.dim, cursor:'pointer', fontSize:18, lineHeight:1, padding:'0 4px' }}>✕</button>
        }>🔨 道具合成</PanelTitle>

        <div style={{ flex:1, overflowY:'auto', padding:12 }}>
          {loading ? (
            <div style={{ textAlign:'center', padding:40, color:T.dim }}>加载中...</div>
          ) : trees.length === 0 ? (
            <div style={{ textAlign:'center', padding:40, color:T.dim }}>暂无可合成装备</div>
          ) : (
            Object.entries(bySeies).map(([seriesName, nodes]) => (
              <div key={seriesName} style={{ marginBottom: 20 }}>
                <div style={{ fontSize:10, color:T.dimB, fontWeight:700, textTransform:'uppercase',
                  letterSpacing:'1px', marginBottom:8, paddingBottom:5, borderBottom:`1px solid ${T.border}` }}>
                  ⚔️ {seriesName}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {nodes.map(node => {
                    const rarity = RARITY_META[node.rarity] || RARITY_META.common
                    const recipe = node.recipe
                    const isCrafting = craftingId === node.id

                    // 检查材料
                    const ingOk = (recipe.ingredients || []).every(ing => {
                      const name = ing.item?.name || ing.equipment?.name || ''
                      return (inventory.filter(x => x === name).length) >= ing.quantity
                    })
                    const prevOk = !recipe.requires_prev_tier_id ||
                      instances.some(i => i.tier_id === recipe.requires_prev_tier_id)
                    const canCraft = ingOk && prevOk

                    return (
                      <div key={node.id} style={{
                        background: T.bg2, borderRadius:8,
                        border: `1px solid ${canCraft ? rarity.color+'50' : T.border}`,
                        padding:'12px 14px',
                        boxShadow: canCraft ? `0 0 12px ${rarity.color}12` : 'none',
                      }}>
                        {/* 名称 + 稀有度 */}
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontWeight:700, fontSize:14, color:rarity.color }}>{node.name}</span>
                            <Tag color={rarity.color}>T{node.tier} {rarity.label}</Tag>
                          </div>
                          <Btn variant={canCraft ? 'warn' : 'default'} size="sm"
                            disabled={!canCraft || isCrafting}
                            onClick={() => doCraft(node)}>
                            {isCrafting ? '合成中...' : canCraft ? '🔨 合成' : '🔒 合成'}
                          </Btn>
                        </div>

                        {/* 属性 */}
                        <div style={{ display:'flex', gap:12, fontSize:11, color:T.dim, marginBottom:8 }}>
                          {node.base_atk > 0 && <span style={{ color:T.red }}>ATK +{node.base_atk}</span>}
                          {node.base_def > 0 && <span style={{ color:T.cyan }}>DEF +{node.base_def}</span>}
                          {node.base_hp  > 0 && <span style={{ color:T.green }}>HP +{node.base_hp}</span>}
                          {node.passive  && <span style={{ color:T.purple }}>{node.passive.icon} {node.passive.name}</span>}
                        </div>

                        {/* 配方 */}
                        <div style={{ fontSize:11 }}>
                          {recipe.requires_prev_tier_id && (
                            <div style={{ marginBottom:5, display:'flex', alignItems:'center', gap:6 }}>
                              <span style={{ color:T.yellow }}>↑ 前置装备：</span>
                              <span style={{ color: prevOk ? T.green : T.red }}>
                                {recipe.prevTierName || `#${recipe.requires_prev_tier_id}`}
                                {prevOk ? ' ✓' : ' ✗ (未持有)'}
                              </span>
                            </div>
                          )}
                          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                            {(recipe.ingredients || []).map((ing, i) => {
                              const name = ing.item?.name || ing.equipment?.name || '?'
                              const need = ing.quantity
                              const have = inventory.filter(x => x === name).length
                              const ok   = have >= need
                              return (
                                <span key={i} style={{
                                  fontSize:10, padding:'2px 8px', borderRadius:4,
                                  background: ok ? `${T.green}12` : `${T.red}10`,
                                  border: `1px solid ${ok ? T.green+'30' : T.red+'25'}`,
                                  color: ok ? T.green : T.red,
                                }}>{name} {have}/{need}</span>
                              )
                            })}
                          </div>
                          {recipe.success_rate < 1 && (
                            <div style={{ marginTop:5, fontSize:10, color:T.yellow }}>
                              ⚠ 成功率 {Math.round(recipe.success_rate*100)}%
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}

/* ─────────────────────────────────────────────
   메인 페이지
───────────────────────────────────────────── */
export default function GamePage() {
  const { id: roomId } = useParams()
  const { user }       = useAuth()
  const router         = useRouter()

  const [room, setRoom]           = useState(null)
  const [gamevars, setGamevars]   = useState(null)
  const [mapConfig, setMapConfig] = useState(null)
  const [loading, setLoading]     = useState(true)
  const [busy, setBusy]           = useState(false)

  const rulesRef    = useRef(null)
  const buffPoolRef = useRef(null)
  const itemPoolRef = useRef(null)
  const npcPoolRef  = useRef(null)
  const equipsRef   = useRef([])

  const [logs, setLogs]         = useState([])
  const [battle, setBattle]     = useState(null)
  const [craftOpen, setCraft]   = useState(false)
  const logRef = useRef(null)

  /* ── 初始化 ── */
  const init = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [rules, bp] = await Promise.all([loadGameRules(), loadBuffPool()])
    rulesRef.current    = rules
    buffPoolRef.current = bp

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
    itemPoolRef.current = items || []
    npcPoolRef.current  = npcs  || []

    const { data: eq } = await supabase
      .from('equipment_instances')
      .select('*, tier:equipment_tiers(*, passive:passive_skills(*), series:equipment_series(slot,name))')
      .eq('owner_id', user.id).eq('room_id', roomId).eq('is_equipped', true)
    equipsRef.current = eq || []

    setGamevars(rm.gamevars || {})
    setLoading(false)
  }, [user, roomId])

  useEffect(() => { init() }, [init])

  useEffect(() => {
    const ch = supabase.channel(`room-${roomId}`)
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'rooms', filter:`id=eq.${roomId}` },
        p => { setRoom(p.new); setGamevars(p.new.gamevars || {}) })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [roomId])

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [logs])

  function log(text, type = 'info') {
    const time = new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
    setLogs(p => [...p.slice(-400), { text, type, time }])
  }

  function toast(msg, type = 'success') { log(msg, type === 'error' ? 'red' : 'system') }

  async function save(gv) {
    setGamevars(gv)
    await supabase.from('rooms').update({ gamevars: gv }).eq('id', roomId)
  }

  function myPlayer(gv) {
    const uid  = user?.id
    const base = gv?.players?.[uid]
    if (!base) return null
    const eq = calcEquippedStats(equipsRef.current)
    return {
      ...base,
      atk: (base.atk || 0) + eq.totalAtk,
      def: (base.def || 0) + eq.totalDef,
      _eAtk: eq.totalAtk, _eDef: eq.totalDef,
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

  /* ── 加入游戏 ── */
  async function joinGame() {
    if (!user || !gamevars) return
    const uid = user.id
    if (gamevars.players?.[uid]) return
    setBusy(true); clearRulesCache()
    const rules = await loadGameRules(); rulesRef.current = rules
    const s = getInitPlayerStats(rules)
    await save({
      ...gamevars,
      players: {
        ...gamevars.players,
        [uid]: {
          uid, name: user.user_metadata?.name || user.email?.split('@')[0] || '玩家',
          ...s, alive:true, inventory:[], buffs:[], passiveCooldowns:{},
          kills:0, exp:0, level:1, gold:20,
        },
      },
    })
    log(`【系统】游戏开始！(${new Date().toLocaleTimeString('zh-CN')})`, 'system')
    setBusy(false)
  }

  /* ── 搜索 ── */
  async function doSearch() {
    const uid = user?.id
    if (!gamevars?.players?.[uid]?.alive) return
    setBusy(true)
    const { gv, tl } = tickTurn(gamevars); tl.forEach(t => log(t, 'buff'))
    if (!gv.players?.[uid]?.alive) { await save(gv); log('【系统】回合开始时倒下', 'death'); setBusy(false); return }
    const weather = mapConfig?.weather || 'clear'
    const { itemChance, npcChance } = getSearchChances(rulesRef.current, weather)
    const roll = Math.random()
    const w = WEATHER[weather]
    log(`【搜索】${w?.icon} ${w?.label} · 搜索区域中...`, 'dim')
    if (roll < npcChance) {
      const pool = npcPoolRef.current || []
      if (pool.length > 0) {
        const npc = pool[Math.floor(Math.random() * pool.length)]
        log(`【遭遇】发现了【${npc.name}】！准备战斗！`, 'red')
        setBattle({ npc, npcHp: npc.hp, npcMaxHp: npc.hp, turn: 1 })
        await save(gv); setBusy(false); return
      }
    } else if (roll < npcChance + itemChance) {
      const pool = itemPoolRef.current || []
      if (pool.length > 0) {
        const tw = pool.reduce((s, i) => s + (i.amount || 1), 0)
        let r = Math.random() * tw, found = pool[0]
        for (const it of pool) { r -= it.amount || 1; if (r <= 0) { found = it; break } }
        await save({ ...gv, players: { ...gv.players, [uid]: { ...gv.players[uid], inventory: [...(gv.players[uid].inventory || []), found.name] } } })
        log(`【获得】【${found.name}】${found.description ? ' · ' + found.description : ''}`, 'item')
        setBusy(false); return
      }
    }
    log('【搜索】什么都没找到', 'dim')
    await save(gv); setBusy(false)
  }

  /* ── NPC战斗 ── */
  async function atkNpc() {
    if (!battle) return
    setBusy(true)
    const uid = user?.id; const bp = buffPoolRef.current || []
    const weather = mapConfig?.weather || 'clear'
    let me = myPlayer(gamevars)
    const { npc, npcHp, npcMaxHp, turn } = battle
    const weapon = equipsRef.current.find(e => e.tier?.series?.slot === 'weapon')
    const dmg = calcDamage(me, { ...npc, hp:npcHp, maxHp:npcMaxHp }, rulesRef.current, weapon?.tier?.sub_kind || '', weather)
    const { attackerUpdated: me2, logs: pl } = triggerPassives('on_attack', me, { ...npc, hp:npcHp }, me._pass || [], bp)
    me = me2; pl.forEach(l => log(l, 'buff'))
    const newNpcHp = Math.max(0, npcHp - dmg)
    log(`【攻击】→ 【${npc.name}】${dmg} 伤害`, 'attack')
    if (newNpcHp <= 0) {
      log(`【击杀】击败了【${npc.name}】！+${npc.exp || 0} EXP`, 'kill')
      const { attackerUpdated: me3 } = triggerPassives('on_kill', me, null, me._pass || [], bp); me = me3
      await save({ ...gamevars, players: { ...gamevars.players, [uid]: {
        ...gamevars.players[uid], hp:me.hp, buffs:me.buffs||[], passiveCooldowns:me.passiveCooldowns||{},
        kills:(gamevars.players[uid].kills||0)+1, exp:(gamevars.players[uid].exp||0)+(npc.exp||0),
      }}})
      await consumeDurability(user.id, roomId, 1)
      setBattle(null); setBusy(false); return
    }
    const dmgB = calcDamage({ atk:npc.atk, def:npc.def, hp:npcHp, maxHp:npcMaxHp }, me, rulesRef.current, '', weather)
    const { attackerUpdated: me4 } = triggerPassives('on_defend', me, { atk:npc.atk }, me._pass || [], bp); me = me4
    const newHp = Math.max(0, me.hp - dmgB)
    log(`【反击】【${npc.name}】→ 你 ${dmgB} 伤害（剩余 ${newHp} HP）`, 'damage')
    if (newHp <= 0) {
      log('【阵亡】你在战斗中倒下了', 'death')
      await save({ ...gamevars, players: { ...gamevars.players, [uid]: { ...gamevars.players[uid], hp:0, alive:false } } })
      setBattle(null); setBusy(false); return
    }
    if (newHp / (me.maxHp||100) < .3) {
      const { attackerUpdated: me5 } = triggerPassives('on_hp_below_30', { ...me, hp:newHp }, null, me._pass||[], bp); me = me5
    }
    await save({ ...gamevars, players: { ...gamevars.players, [uid]: { ...gamevars.players[uid], hp:newHp, buffs:me.buffs||[], passiveCooldowns:me.passiveCooldowns||{} } } })
    setBattle({ ...battle, npcHp:newNpcHp, turn:turn+1 })
    setBusy(false)
  }

  async function fleeNpc() {
    setBusy(true)
    if (Math.random() < getRule(rulesRef.current, 'flee_success_rate', .6)) {
      log('【逃跑】成功逃脱！', 'system'); setBattle(null)
    } else {
      const uid = user?.id; const me = myPlayer(gamevars)
      const dmg = calcDamage({ atk:battle.npc.atk, def:battle.npc.def, hp:battle.npcHp, maxHp:battle.npcMaxHp }, me, rulesRef.current, '', mapConfig?.weather||'clear')
      const newHp = Math.max(0, me.hp - dmg)
      log(`【逃跑】失败！受到 ${dmg} 伤害`, 'damage')
      await save({ ...gamevars, players: { ...gamevars.players, [uid]: { ...gamevars.players[uid], hp:newHp, alive:newHp>0 } } })
      if (newHp <= 0) { log('【阵亡】逃跑途中倒下了', 'death'); setBattle(null) }
    }
    setBusy(false)
  }

  /* ── PvP ── */
  async function atkPlayer(targetUid) {
    const uid = user?.id
    if (!uid || !gamevars?.players?.[uid]?.alive || targetUid === uid) return
    setBusy(true)
    const bp = buffPoolRef.current || []; const weather = mapConfig?.weather || 'clear'
    const { gv, tl } = tickTurn(gamevars); tl.forEach(t => log(t, 'buff'))
    let me = myPlayer(gv); let tgt = { ...gv.players[targetUid] }
    if (!me?.alive || !tgt?.alive) { setBusy(false); return }
    const weapon = equipsRef.current.find(e => e.tier?.series?.slot === 'weapon')
    const dmg = calcDamage(me, tgt, rulesRef.current, weapon?.tier?.sub_kind||'', weather)
    const { attackerUpdated:me2, defenderUpdated:tgt2, logs:pl } = triggerPassives('on_attack', me, tgt, me._pass||[], bp)
    me = me2; if (tgt2) tgt = tgt2; pl.forEach(l => log(l,'buff'))
    const newTHp = Math.max(0, (tgt.hp||0) - dmg)
    log(`【攻击】→ ${tgt.name} ${dmg} 伤害`, 'attack')
    let ngv = { ...gv, players: { ...gv.players,
      [uid]: { ...gv.players[uid], hp:me.hp, buffs:me.buffs||[], passiveCooldowns:me.passiveCooldowns||{} },
      [targetUid]: { ...gv.players[targetUid], hp:newTHp, alive:newTHp>0 },
    }}
    if (newTHp <= 0) {
      log(`【击杀】击倒了 ${tgt.name}！`, 'kill')
      const { attackerUpdated:me3 } = triggerPassives('on_kill', me, null, me._pass||[], bp)
      ngv.players[uid] = { ...ngv.players[uid], hp:me3.hp, buffs:me3.buffs||[], kills:(ngv.players[uid].kills||0)+1 }
    }
    await save(ngv); await consumeDurability(uid, roomId, 1); setBusy(false)
  }

  /* ── 使用道具 ── */
  async function useItem(name) {
    const uid = user?.id
    if (!gamevars?.players?.[uid]?.alive) return
    setBusy(true)
    const bp = buffPoolRef.current || []; const me = myPlayer(gamevars)
    const def = (itemPoolRef.current||[]).find(i => i.name === name)
    if (!def) { log(`未知道具：${name}`, 'dim'); setBusy(false); return }
    const fx = calcItemEffect(def, me, rulesRef.current || {})
    let np = { ...gamevars.players[uid] }
    if (fx.hpDelta)  { np.hp = Math.max(0, Math.min(me.maxHp, np.hp+fx.hpDelta)); np.alive = np.hp>0; log(`【使用】${name} HP ${fx.hpDelta>0?'+':''}${fx.hpDelta} → ${np.hp}`, fx.hpDelta>0?'heal':'damage') }
    if (fx.atkDelta) { np.atk = Math.max(0, np.atk+fx.atkDelta); log(`【使用】${name} ATK +${fx.atkDelta}`, 'buff') }
    if (fx.defDelta) { np.def = Math.max(0, np.def+fx.defDelta); log(`【使用】${name} DEF +${fx.defDelta}`, 'buff') }
    for (const bid of fx.newBuffIds||[]) {
      const bd = bp.find(b => b.id===bid)
      if (bd) { np = applyBuff(np, bid, bd); log(`【效果】${bd.icon} ${bd.name}`, 'buff') }
    }
    const inv = [...(np.inventory||[])]; inv.splice(inv.indexOf(name), 1); np.inventory = inv
    await save({ ...gamevars, players: { ...gamevars.players, [uid]: np } }); setBusy(false)
  }

  /* ── 卸下装备 ── */
  async function unequip(instId, tierName) {
    await supabase.from('equipment_instances').update({ is_equipped:false, equipped_slot:null }).eq('id', instId)
    log(`【装备】卸下了【${tierName}】`, 'dim')
    await init()
  }

  /* ═══════════════════════════════════════════
     렌더링
  ═══════════════════════════════════════════ */
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh',
      background:T.bg0, color:T.dim, flexDirection:'column', gap:14 }}>
      <div style={{ width:32, height:32, border:`3px solid ${T.border}`, borderTopColor:T.cyan,
        borderRadius:'50%', animation:'spin .7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <span style={{ fontFamily:'monospace', letterSpacing:2, fontSize:12 }}>LOADING...</span>
    </div>
  )
  if (!room) return null

  const uid       = user?.id
  const me        = myPlayer(gamevars)
  const allP      = Object.values(gamevars?.players || {})
  const otherP    = allP.filter(p => p.uid !== uid)
  const weather   = mapConfig?.weather || 'clear'
  const w         = WEATHER[weather] || WEATHER.clear
  const bp        = buffPoolRef.current || []
  const inGame    = !!me

  const eqMap = {}
  for (const inst of equipsRef.current) {
    const slot = inst.tier?.series?.slot
    if (slot) eqMap[slot] = inst
  }

  const invCounts = (me?.inventory || []).reduce((a, n) => { a[n]=(a[n]||0)+1; return a }, {})
  const itemPool  = itemPoolRef.current || []

  const logColors = {
    damage:'#ff6655', heal:T.green, kill:T.yellow, attack:T.orange,
    item:T.purple, buff:'#aa88ff', death:T.red, system:T.cyan, dim:T.dim, red:T.red,
  }

  return (
    <div style={{ height:'100vh', background:T.bg0, color:T.text, display:'flex', flexDirection:'column',
      fontFamily:'"Noto Sans SC",system-ui,sans-serif', fontSize:13, overflow:'hidden' }}>

      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:${T.bg0}}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:2px}
        .hov:hover:not(:disabled){filter:brightness(1.25)}
        select,input{outline:none;font-family:inherit}
      `}</style>

      {/* ══ 顶部标题栏 ══ */}
      <div style={{
        background:`linear-gradient(90deg, ${T.bg2} 0%, ${T.bg3} 50%, ${T.bg2} 100%)`,
        borderBottom:`1px solid ${T.borderB}`,
        padding:'0 20px', height:44, flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <div style={{ fontSize:18, fontWeight:900, color:T.cyan, letterSpacing:3,
          textShadow:`0 0 20px ${T.cyan}80` }}>
          ACFUN 大逃杀
        </div>
        <div style={{ display:'flex', gap:20, fontSize:12, color:T.dim, alignItems:'center' }}>
          <span>{mapConfig?.name || '未知区域'}</span>
          <span style={{ color:w.icon ? T.text : T.dim }}>{w.icon} {w.label}{w.mod && <span style={{ color:T.yellow, marginLeft:4, fontSize:10 }}>({w.mod})</span>}</span>
          <span>{new Date().toLocaleString('zh-CN',{month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit'})}</span>
          {allP.filter(p=>p.alive).length > 0 && (
            <span style={{ color:T.red, fontWeight:700 }}>剩余 {allP.filter(p=>p.alive).length} 人</span>
          )}
        </div>
      </div>

      {/* ══ 主体三栏 ══ */}
      <div style={{ flex:1, display:'grid', gridTemplateColumns:'300px 1fr 280px', overflow:'hidden' }}>

        {/* ═══ 左栏 ═══ */}
        <div style={{ borderRight:`1px solid ${T.border}`, display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* 玩家信息 */}
          <div style={{ background:T.bg1, borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
            <PanelTitle>👤 参展者 {inGame ? me.name : '—'}</PanelTitle>
            <div style={{ padding:'10px 12px' }}>
              {!inGame ? (
                <div style={{ textAlign:'center', padding:'16px 0' }}>
                  <div style={{ color:T.dim, fontSize:12, marginBottom:12 }}>你还没有加入游戏</div>
                  <Btn variant="primary" size="lg" onClick={joinGame} disabled={busy}>加入游戏</Btn>
                </div>
              ) : (
                <>
                  {/* HP 条 */}
                  <div style={{ marginBottom:10 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:11 }}>
                      <span style={{ color:T.dim }}>生命值</span>
                      <span style={{ color: me.hp/me.maxHp > .6 ? T.green : me.hp/me.maxHp > .3 ? T.yellow : T.red, fontFamily:'monospace', fontWeight:700 }}>
                        {me.hp} / {me.maxHp}
                      </span>
                    </div>
                    <HpBar hp={me.hp} max={me.maxHp} h={10} />
                  </div>

                  {/* 属性网格 */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px' }}>
                    <StatRow label="等级"   value={`Lv.${me.level||1}`}   color={T.yellow} />
                    <StatRow label="经验值" value={`${me.exp||0}/${(me.level||1)*9}`} />
                    <StatRow label="攻击力" value={`${(me.atk||0)-(me._eAtk||0)}${me._eAtk>0?` +${me._eAtk}`:''}`} color={T.orange} mono />
                    <StatRow label="防御力" value={`${(me.def||0)-(me._eDef||0)}${me._eDef>0?` +${me._eDef}`:''}`} color={T.cyan} mono />
                    <StatRow label="金钱"   value={`${me.gold||0} 元`}    color={T.yellow} />
                    <StatRow label="击杀数" value={me.kills||0}           color={T.red} />
                  </div>

                  {/* Buff 列表 */}
                  {(me.buffs||[]).length > 0 && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:8 }}>
                      {(me.buffs||[]).map((b,i) => {
                        const d = bp.find(x => x.id===b.buffId)
                        if (!d) return null
                        return <Tag key={i} color={d.is_debuff?T.red:T.green}>{d.icon} {d.name} {b.remainingTurns}</Tag>
                      })}
                    </div>
                  )}

                  {!me.alive && (
                    <div style={{ marginTop:10, textAlign:'center', color:T.red, fontWeight:700, letterSpacing:3, fontSize:13 }}>
                      † 已阵亡 †
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 装备槽 */}
          <div style={{ background:T.bg1, borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
            <PanelTitle>⚔️ 装备槽</PanelTitle>
            <div style={{ padding:'6px 8px', display:'flex', flexDirection:'column', gap:4 }}>
              {SLOTS.map(slot => {
                const inst = eqMap[slot.key]
                const tier = inst?.tier
                const rar  = tier ? RARITY_META[tier.rarity] : null
                return (
                  <div key={slot.key} style={{
                    display:'flex', alignItems:'center', gap:8, padding:'6px 8px',
                    background: tier ? T.bg2 : T.bg0,
                    borderRadius:5, border:`1px solid ${tier ? (rar?.color+'30'||T.border) : T.border}`,
                    minHeight:36,
                  }}>
                    <span style={{ fontSize:10, color:T.dim, width:52, flexShrink:0 }}>{slot.label}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      {tier ? (
                        <div>
                          <span style={{ fontWeight:600, fontSize:12, color:rar?.color }}>{tier.name}</span>
                          <div style={{ display:'flex', gap:6, marginTop:2, fontSize:10 }}>
                            {tier.base_atk > 0 && <span style={{ color:T.orange }}>ATK+{tier.base_atk+(inst.bonus_atk||0)}</span>}
                            {tier.base_def > 0 && <span style={{ color:T.cyan }}>DEF+{tier.base_def+(inst.bonus_def||0)}</span>}
                            {tier.durability_max > 0 && (
                              <span style={{ color: inst.durability_current/tier.durability_max < .25 ? T.red : T.dim }}>
                                耐久{inst.durability_current}/{tier.durability_max}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color:T.border, fontSize:11 }}>空槽</span>
                      )}
                    </div>
                    {tier && (
                      <Btn variant="danger" size="sm" onClick={() => unequip(inst.id, tier.name)}>卸下</Btn>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 消息日志 */}
          <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <PanelTitle>📋 消息日志</PanelTitle>
            <div ref={logRef} style={{ flex:1, overflowY:'auto', padding:'6px 10px', background:T.bg0 }}>
              {logs.length === 0
                ? <div style={{ color:T.border, fontSize:11, padding:'8px 0' }}>等待行动...</div>
                : [...logs].reverse().map((l,i) => (
                  <div key={i} style={{ color:logColors[l.type]||T.text, fontSize:11, padding:'2px 0',
                    borderBottom:`1px solid ${T.bg1}`, lineHeight:1.6 }}>
                    {l.time && <span style={{ color:T.border, marginRight:5, fontSize:9, fontFamily:'monospace' }}>{l.time}</span>}
                    {l.text}
                  </div>
                ))
              }
            </div>
          </div>
        </div>

        {/* ═══ 中栏 ═══ */}
        <div style={{ display:'flex', flexDirection:'column', overflow:'hidden', background:T.bg0 }}>

          {/* NPC 战斗 / 状态展示 */}
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:24, overflow:'hidden' }}>
            {battle ? (
              /* 战斗面板 */
              <div style={{
                background:T.bg1, border:`1px solid ${T.borderB}`, borderRadius:12,
                padding:28, width:'100%', maxWidth:440,
                boxShadow:`0 0 40px rgba(255,68,85,.12), 0 8px 32px rgba(0,0,0,.5)`,
              }}>
                <div style={{ textAlign:'center', marginBottom:20 }}>
                  <div style={{ fontSize:18, fontWeight:900, color:T.red, letterSpacing:3,
                    textShadow:`0 0 16px ${T.red}` }}>⚔  战斗中  ⚔</div>
                  <div style={{ color:T.dim, fontSize:12, marginTop:4 }}>第 {battle.turn} 回合</div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 40px 1fr', gap:12, alignItems:'center', marginBottom:20 }}>
                  {/* 我方 */}
                  <div style={{ background:T.bg0, borderRadius:8, padding:12, border:`1px solid ${T.border}` }}>
                    <div style={{ color:T.cyan, fontWeight:700, fontSize:13, marginBottom:8, textAlign:'center' }}>{me?.name}</div>
                    <HpBar hp={me?.hp||0} max={me?.maxHp||100} h={8} />
                    <div style={{ textAlign:'center', color:T.dim, fontSize:11, marginTop:5 }}>
                      {me?.hp} / {me?.maxHp}
                    </div>
                    <div style={{ display:'flex', justifyContent:'center', gap:10, fontSize:10, color:T.dim, marginTop:4 }}>
                      <span style={{ color:T.orange }}>ATK {me?.atk}</span>
                      <span style={{ color:T.cyan }}>DEF {me?.def}</span>
                    </div>
                  </div>

                  <div style={{ textAlign:'center', color:T.red, fontSize:16, fontWeight:900 }}>VS</div>

                  {/* NPC */}
                  <div style={{ background:T.bg0, borderRadius:8, padding:12, border:`1px solid ${T.border}` }}>
                    <div style={{ color:T.red, fontWeight:700, fontSize:13, marginBottom:8, textAlign:'center' }}>{battle.npc.name}</div>
                    <HpBar hp={battle.npcHp} max={battle.npcMaxHp} h={8} />
                    <div style={{ textAlign:'center', color:T.dim, fontSize:11, marginTop:5 }}>
                      {battle.npcHp} / {battle.npcMaxHp}
                    </div>
                    <div style={{ display:'flex', justifyContent:'center', gap:10, fontSize:10, color:T.dim, marginTop:4 }}>
                      <span style={{ color:T.orange }}>ATK {battle.npc.atk}</span>
                      <span style={{ color:T.cyan }}>DEF {battle.npc.def}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:10 }}>
                  <Btn variant="danger" size="lg" onClick={atkNpc} disabled={busy} sx={{ width:'100%', fontWeight:900, fontSize:15 }}>
                    {busy ? '攻击中...' : '⚔ 攻击'}
                  </Btn>
                  <Btn variant="default" onClick={fleeNpc} disabled={busy} sx={{ width:'100%' }}>
                    🏃 逃跑
                  </Btn>
                </div>
              </div>
            ) : inGame ? (
              /* 在游戏中：状态摘要 */
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:56, marginBottom:12, filter:`drop-shadow(0 0 20px ${me?.alive ? T.cyan : T.red}40)` }}>
                  {me?.alive ? '⚔' : '💀'}
                </div>
                <div style={{ fontSize:20, fontWeight:900, letterSpacing:4, color: me?.alive ? T.green : T.red,
                  textShadow:`0 0 20px ${me?.alive ? T.green : T.red}` }}>
                  {me?.alive
                    ? (me.hp/me.maxHp > .8 ? 'FINE' : me.hp/me.maxHp > .5 ? 'INJURED' : me.hp/me.maxHp > .2 ? 'CRITICAL' : 'DYING')
                    : 'DEAD'}
                </div>
                <div style={{ color:T.dim, fontSize:12, marginTop:8 }}>
                  {me?.alive ? '点击"搜索"开始行动' : '你已阵亡，只能观战'}
                </div>
              </div>
            ) : (
              /* 未加入 */
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:48, marginBottom:16 }}>🎮</div>
                <Btn variant="primary" size="lg" onClick={joinGame} disabled={busy}>加入游戏</Btn>
              </div>
            )}
          </div>

          {/* 其他玩家 */}
          {otherP.length > 0 && (
            <div style={{ borderTop:`1px solid ${T.border}`, padding:'10px 14px', flexShrink:0, background:T.bg1 }}>
              <div style={{ fontSize:10, color:T.dim, fontWeight:700, textTransform:'uppercase', letterSpacing:'1px', marginBottom:8 }}>
                在场玩家
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {allP.map(p => (
                  <div key={p.uid} style={{
                    display:'flex', alignItems:'center', gap:8, padding:'6px 10px',
                    background: p.uid===uid ? `${T.cyan}08` : T.bg2,
                    border:`1px solid ${p.uid===uid ? T.cyan+'30' : T.border}`,
                    borderRadius:6, opacity:p.alive?1:.4, minWidth:140,
                  }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:11, fontWeight:600, marginBottom:4,
                        color:p.uid===uid?T.cyan:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {p.uid===uid?'▶ ':''}{p.name}
                        {!p.alive && <span style={{ color:T.red, marginLeft:4 }}>†</span>}
                      </div>
                      <HpBar hp={p.hp||0} max={p.maxHp||100} h={4} />
                    </div>
                    {p.alive && p.uid!==uid && me?.alive && !battle && (
                      <Btn variant="danger" size="sm" onClick={() => atkPlayer(p.uid)} disabled={busy}>攻击</Btn>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ═══ 右栏 ═══ */}
        <div style={{ borderLeft:`1px solid ${T.border}`, display:'flex', flexDirection:'column', overflow:'hidden', background:T.bg1 }}>

          {/* 行动区 */}
          <div style={{ borderBottom:`1px solid ${T.border}`, padding:'10px 12px', flexShrink:0 }}>
            <div style={{ fontSize:10, color:T.dim, fontWeight:700, textTransform:'uppercase', letterSpacing:'1px', marginBottom:10 }}>
              行动
            </div>
            <Btn variant="primary" onClick={doSearch}
              disabled={busy || !inGame || !me?.alive || battle !== null}
              sx={{ width:'100%', marginBottom:8, fontSize:14, padding:'10px 0', fontWeight:700 }}>
              🔍 搜索区域
            </Btn>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
              <Btn disabled sx={{ width:'100%' }}>😴 睡眠</Btn>
              <Btn disabled sx={{ width:'100%' }}>💊 治疗</Btn>
              <Btn variant="warn" onClick={() => setCraft(true)} disabled={!inGame}
                sx={{ width:'100%' }}>🔨 道具合成</Btn>
              <Btn disabled sx={{ width:'100%' }}>⬆️ 升级技能</Btn>
            </div>
          </div>

          {/* 背包道具列表 */}
          <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <PanelTitle right={
              <span style={{ fontSize:10, color:T.dim }}>
                {(me?.inventory||[]).length} 件
              </span>
            }>🎒 背包</PanelTitle>
            <div style={{ flex:1, overflowY:'auto' }}>
              {Object.keys(invCounts).length === 0 ? (
                <div style={{ padding:'20px 12px', textAlign:'center', color:T.border, fontSize:12 }}>背包为空</div>
              ) : (
                Object.entries(invCounts).map(([name, count]) => {
                  const def = itemPool.find(i => i.name === name)
                  const isMat = def?.kind === 'material'
                  return (
                    <div key={name} style={{
                      display:'flex', alignItems:'center', gap:8, padding:'8px 12px',
                      borderBottom:`1px solid ${T.bg0}`,
                      transition:'background .1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = T.bg2}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {name}
                          {count > 1 && <span style={{ color:T.dim, fontWeight:400, marginLeft:5 }}>×{count}</span>}
                        </div>
                        <div style={{ display:'flex', gap:8, fontSize:10, color:T.dim, marginTop:2 }}>
                          {def?.heal > 0 && <span style={{ color:T.green }}>HEAL {def.heal}</span>}
                          {def?.atk  > 0 && <span style={{ color:T.orange }}>ATK+{def.atk}</span>}
                          {def?.def  > 0 && <span style={{ color:T.cyan }}>DEF+{def.def}</span>}
                          {isMat && <span style={{ color:T.yellow }}>合成材料</span>}
                          {def?.description && <span>{def.description}</span>}
                        </div>
                      </div>
                      {!isMat && (
                        <Btn variant="success" size="sm"
                          disabled={!me?.alive || busy}
                          onClick={() => useItem(name)}>使用</Btn>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 合成抽屉 */}
      <CraftDrawer
        open={craftOpen} onClose={() => setCraft(false)}
        uid={uid} roomId={roomId}
        gamevars={gamevars} onGamevarsChange={save}
        toast={toast}
      />
    </div>
  )
}
