'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../layout'
import { isAdmin } from '@/lib/auth'
import { useToast, Spinner } from './_shared/ui'
import OverviewTab  from './_tabs/OverviewTab'
import ItemsTab     from './_tabs/ItemsTab'
import NpcsTab      from './_tabs/NpcsTab'
import RoomsTab     from './_tabs/RoomsTab'
import RulesTab     from './_tabs/RulesTab'
import EquipmentTab  from './_tabs/EquipmentTab'
import UsersTab      from './_tabs/UsersTab'
import FragmentsTab  from './_tabs/FragmentsTab'
import FragmentCombosTab from './_tabs/FragmentCombosTab'
import ChambersTab   from './_tabs/ChambersTab'
import ShopTab       from './_tabs/ShopTab'
import PointsConfigTab from './_tabs/PointsConfigTab'
import ClassesTab    from './_tabs/ClassesTab'
import PortraitsTab  from './_tabs/PortraitsTab'
import DbConsoleTab  from './_tabs/DbConsoleTab'
import RoomsEditorTab from './_tabs/RoomsEditorTab'
import AnalyticsTab  from './_tabs/AnalyticsTab'
import NarrativeTab  from './_tabs/NarrativeTab'

const TABS = [
  { key: 'overview',  label: '📊 概览' },
  { key: 'items',     label: '🔮 道具池',  dataKey: 'items' },
  { key: 'npcs',      label: '👻 实体',      dataKey: 'npcs' },
  { key: 'rooms',     label: '🌀 对局',      dataKey: 'rooms' },
  { key: 'roomsedit', label: '🧭 房间编辑器' },
  { key: 'users',     label: '👥 用户权限' },
  { key: 'rules',     label: '⚙️ 战斗规则' },
  { key: 'equipment', label: '🗡️ 装备引擎' },
  { key: 'narrative', label: '📜 叙事配置' },
  { key: 'fragments', label: '📡 残片' },
  { key: 'combos',    label: '🔗 残片合成' },
  { key: 'chambers',  label: '🏛 chamber' },
  { key: 'shop',      label: '🛒 商店目录' },
  { key: 'points',    label: '💱 点数 / 兑换' },
  { key: 'classes',   label: '✦ 职业' },
  { key: 'portraits', label: '🎴 立绘审核' },
  { key: 'analytics', label: '📈 数据' },
  { key: 'db',        label: '🗄️ DB 控制台' },
]

export default function AdminPage() {
  const { user } = useAuth()
  const router   = useRouter()
  const { show: toast, Container: ToastContainer } = useToast()

  const [tab,      setTab]      = useState('overview')
  const [loading,  setLoading]  = useState(true)
  const [items,    setItems]    = useState([])
  const [npcs,     setNpcs]     = useState([])
  const [maps,     setMaps]     = useState([])
  const [rooms,    setRooms]    = useState([])
  const [buffPool, setBuffPool] = useState([])

  useEffect(() => {
    if (user !== undefined && (!user || !isAdmin(user))) router.replace('/')
  }, [router, user])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [r1, r2, r3, r4, r5] = await Promise.all([
        supabase.from('item_pool').select('*').order('kind'),
        supabase.from('npc_pool').select('*').order('level'),
        supabase.from('map_config').select('*').order('map_id'),
        supabase.from('rooms')
          .select('id,gamenum,gametype,gamestate,validnum,alivenum,deathnum,winner,created_at,started_at')
          .order('created_at', { ascending: false }).limit(200),
        supabase.from('buff_pool').select('id,name,icon,is_debuff').order('id'),
      ])
      setItems(r1.data || []); setNpcs(r2.data || []); setMaps(r3.data || [])
      setRooms(r4.data || []); setBuffPool(r5.data || [])
      const firstError = [r1, r2, r3, r4, r5].find(r => r.error)
      if (firstError) toast(firstError.error.message || '部分数据加载失败', 'error')
    } catch (error) {
      toast(error.message || '数据加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { loadAll() }, [loadAll])

  async function refresh(which) {
    if (which === 'items') {
      const { data } = await supabase.from('item_pool').select('*').order('kind')
      setItems(data || [])
    } else if (which === 'npcs') {
      const { data } = await supabase.from('npc_pool').select('*').order('level')
      setNpcs(data || [])
    } else if (which === 'rooms') {
      const { data } = await supabase.from('rooms')
        .select('id,gamenum,gametype,gamestate,validnum,alivenum,deathnum,winner,created_at,started_at')
        .order('created_at', { ascending: false }).limit(200)
      setRooms(data || [])
    }
  }

  if (!user) return <div style={{ textAlign: 'center', padding: 60, color: '#8b949e' }}>请先登录</div>
  if (loading) return <Spinner />

  return (
    <div className="animate-in">
      <ToastContainer />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>⚙️ 管理后台</h2>
        <nav style={{ display: 'flex', gap: 3, background: '#161b22', borderRadius: 10, padding: 4, border: '1px solid #30363d', flexWrap: 'wrap' }}>
          {TABS.map(t => {
            const count = t.dataKey === 'items' ? items.length : t.dataKey === 'npcs' ? npcs.length : t.dataKey === 'maps' ? maps.length : t.dataKey === 'rooms' ? rooms.length : undefined
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', background: tab === t.key ? '#58a6ff' : 'transparent', color: tab === t.key ? '#fff' : '#8b949e', transition: 'background .15s, color .15s' }}>
                {t.label}
                {count !== undefined && <span style={{ fontSize: 11, opacity: .65, marginLeft: 4 }}>({count})</span>}
              </button>
            )
          })}
        </nav>
      </div>

      {tab === 'overview'  && <OverviewTab  items={items} npcs={npcs} maps={maps} rooms={rooms} />}
      {tab === 'items'     && <ItemsTab     items={items} buffPool={buffPool} onRefresh={refresh} toast={toast} />}
      {tab === 'npcs'      && <NpcsTab      npcs={npcs} onRefresh={refresh} toast={toast} />}
      {tab === 'rooms'     && <RoomsTab     rooms={rooms} onRefresh={refresh} toast={toast} />}
      {tab === 'roomsedit' && <RoomsEditorTab toast={toast} />}
      {tab === 'users'     && <UsersTab     toast={toast} />}
      {tab === 'rules'     && <RulesTab     toast={toast} />}
      {tab === 'equipment' && <EquipmentTab toast={toast} />}
      {tab === 'narrative' && <NarrativeTab toast={toast} />}
      {tab === 'fragments' && <FragmentsTab toast={toast} />}
      {tab === 'combos'    && <FragmentCombosTab toast={toast} />}
      {tab === 'chambers'  && <ChambersTab toast={toast} />}
      {tab === 'shop'      && <ShopTab toast={toast} />}
      {tab === 'points'    && <PointsConfigTab toast={toast} />}
      {tab === 'classes'   && <ClassesTab toast={toast} />}
      {tab === 'portraits' && <PortraitsTab toast={toast} />}
      {tab === 'analytics' && <AnalyticsTab toast={toast} />}
      {tab === 'db'        && <DbConsoleTab toast={toast} />}
    </div>
  )
}
