'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../layout'
import { isAdmin } from '@/lib/auth'
import { useToast, Spinner } from './_shared/ui'
import Sidebar from './_shared/Sidebar'
import { TAB_BY_KEY, DEFAULT_TAB } from './_shared/adminNav'
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
import RoomItemsTab  from './_tabs/RoomItemsTab'
import NpcPlacementTab from './_tabs/NpcPlacementTab'
import AnalyticsTab  from './_tabs/AnalyticsTab'
import NarrativeTab  from './_tabs/NarrativeTab'
import ContentEngine from './_engine/ContentEngine'
import { ENGINE_TABS } from './_engine/schemas'

export default function AdminPageInner() {
  const { user } = useAuth()
  const router   = useRouter()
  const { show: toast, Container: ToastContainer } = useToast()

  const [tab,      setTab]      = useState(DEFAULT_TAB)
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

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <Sidebar active={tab} onChange={setTab} counts={{ items: items.length, npcs: npcs.length, rooms: rooms.length }} />

        {/* 内容区：minWidth:0 防宽内容(DB 控制台/图表/ContentEngine grid)撑爆 flex 子项 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 700 }}>{TAB_BY_KEY[tab]?.label || '⚙️ 管理后台'}</h2>

          {tab === 'overview'  && <OverviewTab  items={items} npcs={npcs} maps={maps} rooms={rooms} />}
          {tab === 'items'     && <ItemsTab     items={items} buffPool={buffPool} onRefresh={refresh} toast={toast} />}
          {tab === 'npcs'      && <NpcsTab      npcs={npcs} onRefresh={refresh} toast={toast} />}
          {tab === 'rooms'     && <RoomsTab     rooms={rooms} onRefresh={refresh} toast={toast} />}
          {tab === 'roomsedit' && <RoomsEditorTab toast={toast} />}
          {tab === 'placements' && <RoomItemsTab toast={toast} />}
          {tab === 'npcplace'  && <NpcPlacementTab toast={toast} />}
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
          {/* 内容引擎 tab（itemtags/itemrecipe/engine）由注册表驱动 */}
          {ENGINE_TABS[tab] && <ContentEngine schema={ENGINE_TABS[tab]} toast={toast} />}
        </div>
      </div>
    </div>
  )
}
