'use client'
import { useState, useEffect, useRef, use } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../../layout'
import { MAP_LIST } from '@/lib/constants'
import { useRouter } from 'next/navigation'

export default function GameRoom({ params }) {
  const { id: roomId } = use(params)
  const { user } = useAuth()
  const router = useRouter()
  const [room, setRoom] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionMsg, setActionMsg] = useState('')
  const logRef = useRef(null)

  async function loadRoom() {
    const { data } = await supabase.from('rooms').select('*').eq('id', roomId).single()
    setRoom(data)
    setLoading(false)
  }

  useEffect(() => {
    loadRoom()
    const channel = supabase.channel(`room-${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
        setRoom(payload.new)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [roomId])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [room?.gamevars?.log])

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#8b949e' }}>加载中...</div>
  if (!room) return <div style={{ textAlign: 'center', padding: 60, color: '#f85149' }}>房间不存在</div>
  if (!user) return <div style={{ textAlign: 'center', padding: 60, color: '#8b949e' }}>请先登录</div>

  const gv = room.gamevars || { players: {}, log: [] }
  const me = gv.players?.[user.id]
  const isSpectator = !me
  const isWaiting = room.gamestate === 0
  const isActive = room.gamestate === 1
  const isEnded = room.gamestate === 2
  const players = Object.values(gv.players || {})
  const log = gv.log || []
  const currentMap = MAP_LIST.find(m => m.id === me?.map) || MAP_LIST[0]

  // 获取同地图的其他玩家
  const nearbyPlayers = players.filter(p => p.id !== user.id && p.map === me?.map && p.alive)

  async function updateGame(newGv) {
    await supabase.from('rooms').update({ gamevars: newGv }).eq('id', roomId)
  }

  // 移动到相邻地图
  async function moveMap(targetMapId) {
    if (!me || !me.alive || !isActive) return
    const newGv = { ...gv }
    const oldMap = MAP_LIST.find(m => m.id === me.map)
    const newMap = MAP_LIST.find(m => m.id === targetMapId)
    newGv.players[user.id] = { ...me, map: targetMapId }
    newGv.log = [...log, `🚶 ${me.name} 从 ${oldMap?.name} 移动到 ${newMap?.name}`]
    await updateGame(newGv)
    setActionMsg(`移动到了 ${newMap?.name}`)
    setTimeout(() => setActionMsg(''), 2000)
  }

  // 搜索当前地图
  async function searchMap() {
    if (!me || !me.alive || !isActive) return
    const newGv = { ...gv }
    const roll = Math.random()
    let msg = ''

    if (roll < 0.4) {
      // 找到物品
      const itemNames = ['木刀', '铁剑', '绷带', '急救包', '布甲', '手枪', '望远镜', '止痛药']
      const found = itemNames[Math.floor(Math.random() * itemNames.length)]
      newGv.players[user.id] = { ...me, inventory: [...me.inventory, found] }
      msg = `🔍 ${me.name} 搜索了 ${currentMap.name}，找到了【${found}】！`
    } else if (roll < 0.65) {
      // 遭遇NPC
      const npcNames = ['野狗', '流氓', '武装士兵']
      const npc = npcNames[Math.floor(Math.random() * npcNames.length)]
      const dmg = Math.floor(Math.random() * 15) + 5
      const newHp = Math.max(0, me.hp - dmg)
      newGv.players[user.id] = { ...me, hp: newHp, alive: newHp > 0 }
      if (newHp <= 0) {
        msg = `⚔️ ${me.name} 遭遇了 ${npc}，受到 ${dmg} 伤害，不幸阵亡！💀`
      } else {
        msg = `⚔️ ${me.name} 遭遇了 ${npc}，击退了敌人但受到 ${dmg} 伤害 (HP: ${newHp})`
      }
    } else {
      msg = `🔍 ${me.name} 搜索了 ${currentMap.name}，什么也没找到...`
    }

    newGv.log = [...log, msg]
    newGv.turn = (newGv.turn || 0) + 1
    await updateGame(newGv)
    setActionMsg(msg.replace(/.*?  /, ''))
    setTimeout(() => setActionMsg(''), 3000)
  }

  // 攻击其他玩家
  async function attackPlayer(targetId) {
    if (!me || !me.alive || !isActive) return
    const target = gv.players[targetId]
    if (!target || !target.alive) return

    const newGv = { ...gv }
    const myAtk = me.atk + Math.floor(Math.random() * 8)
    const targetDef = Math.floor(target.def * Math.random())
    const dmg = Math.max(1, myAtk - targetDef)
    const newTargetHp = Math.max(0, target.hp - dmg)

    newGv.players[targetId] = { ...target, hp: newTargetHp, alive: newTargetHp > 0 }

    let msg
    if (newTargetHp <= 0) {
      newGv.players[user.id] = { ...me, kills: (me.kills || 0) + 1 }
      msg = `⚔️ ${me.name} 对 ${target.name} 造成 ${dmg} 伤害，${target.name} 被击杀了！💀`
    } else {
      msg = `⚔️ ${me.name} 攻击了 ${target.name}，造成 ${dmg} 伤害 (${target.name} HP: ${newTargetHp})`
    }

    newGv.log = [...log, msg]

    // 检查胜利条件
    const alivePlayers = Object.values(newGv.players).filter(p => p.alive)
    if (alivePlayers.length <= 1 && players.length > 1) {
      const winner = alivePlayers[0]
      if (winner) {
        newGv.log = [...newGv.log, `🏆 ${winner.name} 获得了最终胜利！`]
      }
      await supabase.from('rooms').update({ gamevars: newGv, gamestate: 2, winner: winner?.name || '', alivenum: alivePlayers.length, deathnum: players.length - alivePlayers.length }).eq('id', roomId)
    } else {
      const aliveCount = Object.values(newGv.players).filter(p => p.alive).length
      const deadCount = players.length - aliveCount
      await supabase.from('rooms').update({ gamevars: newGv, alivenum: aliveCount, deathnum: deadCount }).eq('id', roomId)
    }

    setActionMsg(msg.replace(/.*? /, ''))
    setTimeout(() => setActionMsg(''), 3000)
  }

  // 使用物品
  async function useItem(index) {
    if (!me || !me.alive || !isActive) return
    const item = me.inventory[index]
    if (!item) return

    const newGv = { ...gv }
    const newInv = [...me.inventory]
    newInv.splice(index, 1)

    let msg = ''
    const healItems = { '绷带': 15, '急救包': 30, '止痛药': 50 }

    if (healItems[item]) {
      const heal = healItems[item]
      const newHp = Math.min(me.maxHp, me.hp + heal)
      newGv.players[user.id] = { ...me, hp: newHp, inventory: newInv }
      msg = `💊 ${me.name} 使用了【${item}】，恢复了 ${heal} HP (HP: ${newHp})`
    } else {
      // 武器/防具 - 提升属性
      const atkItems = { '木刀': 5, '铁剑': 10, '手枪': 15 }
      const defItems = { '布甲': 5, '皮甲': 10 }
      if (atkItems[item]) {
        newGv.players[user.id] = { ...me, atk: me.atk + atkItems[item], inventory: newInv }
        msg = `⚔️ ${me.name} 装备了【${item}】，ATK +${atkItems[item]}`
      } else if (defItems[item]) {
        newGv.players[user.id] = { ...me, def: me.def + defItems[item], inventory: newInv }
        msg = `🛡️ ${me.name} 装备了【${item}】，DEF +${defItems[item]}`
      } else {
        newGv.players[user.id] = { ...me, inventory: newInv }
        msg = `✨ ${me.name} 使用了【${item}】`
      }
    }

    newGv.log = [...log, msg]
    await updateGame(newGv)
    setActionMsg(msg.replace(/.*? /, ''))
    setTimeout(() => setActionMsg(''), 2500)
  }

  // 离开房间
  async function leaveRoom() {
    if (isActive && me?.alive) {
      if (!confirm('游戏进行中，离开将视为死亡，确定？')) return
      const newGv = { ...gv }
      newGv.players[user.id] = { ...me, alive: false }
      newGv.log = [...log, `🚪 ${me.name} 退出了游戏`]
      const aliveCount = Object.values(newGv.players).filter(p => p.alive).length
      await supabase.from('rooms').update({ gamevars: newGv, alivenum: aliveCount, deathnum: players.length - aliveCount }).eq('id', roomId)
    }
    await supabase.from('profiles').update({ roomid: 0 }).eq('id', user.id)
    router.push('/rooms')
  }

  // 获取可移动的地图（当前地图 ±3）
  const movableMaps = MAP_LIST.filter(m => {
    const diff = Math.abs(m.id - (me?.map || 0))
    return diff > 0 && diff <= 3
  })

  // ─── 属性条组件 ───
  const Bar = ({ value, max, color, label }) => (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: '#8b949e' }}>{label}</span>
        <span style={{ color, fontFamily: "'JetBrains Mono'", fontWeight: 600 }}>{value}{max ? `/${max}` : ''}</span>
      </div>
      {max && (
        <div style={{ height: 4, borderRadius: 2, background: `${color}20` }}>
          <div style={{ height: '100%', borderRadius: 2, background: color, width: `${Math.min(100, value / max * 100)}%`, transition: 'width 0.5s' }} />
        </div>
      )}
    </div>
  )

  return (
    <div className="animate-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>⚔️ 房间 #{roomId}</h2>
          <span style={{
            padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: isEnded ? 'rgba(72,79,88,0.3)' : isActive ? 'rgba(63,185,80,0.12)' : 'rgba(210,153,34,0.12)',
            color: isEnded ? '#8b949e' : isActive ? '#3fb950' : '#d29922',
          }}>{isEnded ? '已结束' : isActive ? '进行中' : '等待中'}</span>
          {isSpectator && <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(188,140,255,0.12)', color: '#bc8cff' }}>观战模式</span>}
        </div>
        <button onClick={leaveRoom} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #30363d', background: 'transparent', color: '#8b949e', fontSize: 12, cursor: 'pointer' }}>🚪 离开</button>
      </div>

      {/* Action message toast */}
      {actionMsg && (
        <div className="toast-in" style={{
          padding: '10px 18px', borderRadius: 10, marginBottom: 16,
          background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.2)',
          color: '#58a6ff', fontSize: 13, textAlign: 'center',
        }}>{actionMsg}</div>
      )}

      {/* Winner banner */}
      {isEnded && room.winner && (
        <div style={{
          padding: '20px', borderRadius: 12, marginBottom: 20, textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(210,153,34,0.1), rgba(188,140,255,0.1))',
          border: '1px solid rgba(210,153,34,0.3)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#d29922' }}>{room.winner} 获胜！</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: me ? '280px 1fr 260px' : '1fr 300px', gap: 16 }}>
        {/* Left: My Status */}
        {me && (
          <div>
            {/* Status card */}
            <div style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 22 }}>{me.alive ? '👤' : '💀'}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{me.name}</div>
                  <div style={{ fontSize: 11, color: me.alive ? '#3fb950' : '#f85149' }}>{me.alive ? '存活' : '已阵亡'}</div>
                </div>
              </div>
              <Bar value={me.hp} max={me.maxHp} color="#3fb950" label="HP" />
              <Bar value={me.atk} max={60} color="#f85149" label="ATK" />
              <Bar value={me.def} max={40} color="#58a6ff" label="DEF" />
              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 8 }}>
                击杀: <span style={{ color: '#f85149', fontWeight: 600 }}>{me.kills || 0}</span>
              </div>
            </div>

            {/* Current location */}
            <div style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>当前位置</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>📍 {currentMap.name}</div>
              <div style={{ fontSize: 11, color: '#484f58' }}>区域 #{me.map}</div>
              {nearbyPlayers.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#d29922' }}>
                  ⚠️ 附近有 {nearbyPlayers.length} 名玩家！
                </div>
              )}
            </div>

            {/* Inventory */}
            <div style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: 16 }}>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                背包 ({me.inventory.length})
              </div>
              {me.inventory.length === 0 ? (
                <div style={{ fontSize: 12, color: '#484f58', textAlign: 'center', padding: 12 }}>空</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {me.inventory.map((item, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 10px', borderRadius: 8, background: 'rgba(88,166,255,0.05)',
                      border: '1px solid rgba(88,166,255,0.1)',
                    }}>
                      <span style={{ fontSize: 12 }}>{item}</span>
                      {me.alive && isActive && (
                        <button onClick={() => useItem(i)} style={{
                          padding: '2px 10px', borderRadius: 6, border: 'none',
                          background: 'rgba(63,185,80,0.15)', color: '#3fb950',
                          fontSize: 10, cursor: 'pointer', fontWeight: 600,
                        }}>使用</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Center: Actions & Map */}
        <div>
          {/* Actions */}
          {me?.alive && isActive && (
            <div style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>操作</div>

              {/* Search */}
              <button onClick={searchMap} style={{
                width: '100%', padding: '12px', borderRadius: 8, border: 'none',
                background: 'rgba(88,166,255,0.1)', color: '#58a6ff',
                fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 10,
              }}>🔍 搜索 {currentMap.name}</button>

              {/* Attack nearby players */}
              {nearbyPlayers.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: '#f85149', marginBottom: 6, fontWeight: 600 }}>⚔️ 攻击附近玩家</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {nearbyPlayers.map(p => (
                      <button key={p.id} onClick={() => attackPlayer(p.id)} style={{
                        padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(248,81,73,0.2)',
                        background: 'rgba(248,81,73,0.06)', color: '#e6edf3',
                        fontSize: 12, cursor: 'pointer', textAlign: 'left',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <span>⚔️ {p.name}</span>
                        <span style={{ fontSize: 11, color: '#3fb950' }}>HP {p.hp}/{p.maxHp}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Move */}
              <div>
                <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 6, fontWeight: 600 }}>🚶 移动到...</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                  {movableMaps.map(m => (
                    <button key={m.id} onClick={() => moveMap(m.id)} style={{
                      padding: '8px 12px', borderRadius: 8, border: '1px solid #30363d',
                      background: '#161b22', color: '#8b949e', fontSize: 11, cursor: 'pointer',
                      textAlign: 'left', transition: 'all 0.2s',
                    }}
                      onMouseEnter={e => { e.target.style.borderColor = '#58a6ff'; e.target.style.color = '#58a6ff' }}
                      onMouseLeave={e => { e.target.style.borderColor = '#30363d'; e.target.style.color = '#8b949e' }}>
                      #{m.id} {m.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Dead message */}
          {me && !me.alive && (
            <div style={{
              padding: 24, borderRadius: 12, textAlign: 'center', marginBottom: 12,
              background: 'rgba(248,81,73,0.06)', border: '1px solid rgba(248,81,73,0.2)',
            }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>💀</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#f85149' }}>你已阵亡</div>
              <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>可以继续观战</div>
            </div>
          )}

          {/* Waiting state */}
          {isWaiting && (
            <div style={{
              padding: 32, borderRadius: 12, textAlign: 'center', marginBottom: 12,
              background: '#1c2129', border: '1px solid #30363d',
            }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>⏳</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#d29922' }}>等待更多玩家加入</div>
              <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>当前 {players.length} 名玩家</div>
            </div>
          )}

          {/* Game log */}
          <div style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: 16 }}>
            <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>游戏日志</div>
            <div ref={logRef} style={{
              maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
            }}>
              {log.length === 0 ? (
                <div style={{ color: '#484f58', textAlign: 'center', padding: 20 }}>暂无日志</div>
              ) : (
                log.map((entry, i) => (
                  <div key={i} style={{ padding: '4px 8px', borderRadius: 6, background: i === log.length - 1 ? 'rgba(88,166,255,0.06)' : 'transparent', color: '#8b949e' }}>
                    <span style={{ color: '#484f58', marginRight: 6 }}>[{i + 1}]</span>{entry}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: Player list */}
        <div style={{ background: '#1c2129', borderRadius: 12, border: '1px solid #30363d', padding: 16, height: 'fit-content' }}>
          <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            玩家 ({players.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {players.sort((a, b) => b.alive - a.alive || b.kills - a.kills).map(p => (
              <div key={p.id} style={{
                padding: '10px 12px', borderRadius: 8,
                background: p.id === user.id ? 'rgba(88,166,255,0.06)' : p.alive ? 'rgba(63,185,80,0.04)' : 'rgba(248,81,73,0.04)',
                border: `1px solid ${p.id === user.id ? 'rgba(88,166,255,0.15)' : 'transparent'}`,
                opacity: p.alive ? 1 : 0.5,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14 }}>{p.alive ? '👤' : '💀'}</span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                    {p.id === user.id && <span style={{ fontSize: 9, color: '#58a6ff' }}>(你)</span>}
                  </div>
                  {p.kills > 0 && <span style={{ fontSize: 10, color: '#f85149' }}>🗡️{p.kills}</span>}
                </div>
                <div style={{ height: 3, borderRadius: 2, background: 'rgba(63,185,80,0.15)' }}>
                  <div style={{
                    height: '100%', borderRadius: 2, transition: 'width 0.5s',
                    background: p.hp > 50 ? '#3fb950' : p.hp > 20 ? '#d29922' : '#f85149',
                    width: `${Math.min(100, p.hp / p.maxHp * 100)}%`,
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#484f58', marginTop: 3 }}>
                  <span>HP {p.hp}/{p.maxHp}</span>
                  <span>📍 {MAP_LIST.find(m => m.id === p.map)?.name || '未知'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
