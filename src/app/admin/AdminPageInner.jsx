'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../layout'
import { isAdmin } from '@/lib/auth'
import { useToast, Spinner } from './_shared/ui'
import Sidebar from './_shared/Sidebar'
import { TAB_BY_KEY, DEFAULT_TAB, ALL_TAB_KEYS } from './_shared/adminNav'
import OverviewTab  from './_tabs/OverviewTab'
import ItemsHub     from './_tabs/ItemsHub'
import NpcsTab      from './_tabs/NpcsTab'
import RoomsTab     from './_tabs/RoomsTab'
import RulesTab     from './_tabs/RulesTab'
import EquipmentTab  from './_tabs/EquipmentTab'
import UsersTab      from './_tabs/UsersTab'
import FragmentsHub  from './_tabs/FragmentsHub'
import ChambersTab   from './_tabs/ChambersTab'
import EconomyHub    from './_tabs/EconomyHub'
import ClassesTab    from './_tabs/ClassesTab'
import PortraitsTab  from './_tabs/PortraitsTab'
import DbConsoleTab  from './_tabs/DbConsoleTab'
import RoomsEditorTab from './_tabs/RoomsEditorTab'
import PlacementsHub from './_tabs/PlacementsHub'
import AnalyticsTab  from './_tabs/AnalyticsTab'
import NarrativeTab  from './_tabs/NarrativeTab'
import ContentEngine from './_engine/ContentEngine'
import { ENGINE_TABS } from './_engine/schemas'

export default function AdminPageInner() {
  const { user, loading: authLoading } = useAuth()
  const router   = useRouter()
  const pathname = usePathname()
  const sp       = useSearchParams()
  const { show: toast, Container: ToastContainer } = useToast()

  // tab 以 URL ?tab= 为单一真源（刷新/深链/后退自动保持）；非法/缺省回落 DEFAULT_TAB。
  const urlTab = sp.get('tab')
  const tab    = urlTab && ALL_TAB_KEYS.has(urlTab) ? urlTab : DEFAULT_TAB
  const goTab  = useCallback((key) => {
    const next = new URLSearchParams(sp.toString())
    next.set('tab', key)
    next.delete('section')   // 切顶层 tab 时清掉上一个壳 tab 的 section
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }, [router, pathname, sp])

  const [loading,  setLoading]  = useState(true)
  const [items,    setItems]    = useState([])
  const [npcs,     setNpcs]     = useState([])
  const [maps,     setMaps]     = useState([])
  const [rooms,    setRooms]    = useState([])
  const [buffPool, setBuffPool] = useState([])

  // 等鉴权加载完成再判定（authLoading 期间不重定向）——否则硬加载/刷新/深链会在 session 水合前
  // 把 admin 误踢回首页（user 初值为 null 而非 undefined，旧的 `!== undefined` 守卫永远为真、首帧即踢）。
  useEffect(() => {
    if (!authLoading && (!user || !isAdmin(user))) router.replace('/')
  }, [router, user, authLoading])

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

  // 鉴权就绪且确为 admin 才拉数据（避免硬加载时 session 未水合的空查询）。
  useEffect(() => { if (!authLoading && user && isAdmin(user)) loadAll() }, [loadAll, user, authLoading])

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

  if (authLoading) return <Spinner />
  if (!user || !isAdmin(user)) return <div style={{ textAlign: 'center', padding: 60, color: '#8b949e' }}>请先登录</div>
  if (loading) return <Spinner />

  return (
    <div className="animate-in">
      <ToastContainer />

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <Sidebar active={tab} onChange={goTab} counts={{ items: items.length, npcs: npcs.length, rooms: rooms.length }} />

        {/* 内容区：minWidth:0 防宽内容(DB 控制台/图表/ContentEngine grid)撑爆 flex 子项 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 700 }}>{TAB_BY_KEY[tab]?.label || '⚙️ 管理后台'}</h2>

          {tab === 'overview'  && <OverviewTab  items={items} npcs={npcs} maps={maps} rooms={rooms} />}
          {tab === 'items'     && <ItemsHub     items={items} buffPool={buffPool} onRefresh={refresh} toast={toast} />}
          {tab === 'npcs'      && <NpcsTab      npcs={npcs} onRefresh={refresh} toast={toast} />}
          {tab === 'rooms'     && <RoomsTab     rooms={rooms} onRefresh={refresh} toast={toast} />}
          {tab === 'roomsedit' && <RoomsEditorTab toast={toast} />}
          {tab === 'placements' && <PlacementsHub toast={toast} />}
          {tab === 'users'     && <UsersTab     toast={toast} />}
          {tab === 'rules'     && <RulesTab     toast={toast} />}
          {tab === 'equipment' && <EquipmentTab toast={toast} />}
          {tab === 'narrative' && <NarrativeTab toast={toast} />}
          {tab === 'fragments' && <FragmentsHub toast={toast} />}
          {tab === 'chambers'  && <ChambersTab toast={toast} />}
          {tab === 'economy'   && <EconomyHub toast={toast} />}
          {tab === 'classes'   && <ClassesTab toast={toast} />}
          {tab === 'portraits' && <PortraitsTab toast={toast} />}
          {tab === 'analytics' && <AnalyticsTab toast={toast} />}
          {tab === 'db'        && <DbConsoleTab toast={toast} />}
          {/* engine 预览（已退役侧栏入口，仅深链 ?tab=engine）由注册表驱动 */}
          {ENGINE_TABS[tab] && <ContentEngine schema={ENGINE_TABS[tab]} toast={toast} />}
        </div>
      </div>
    </div>
  )
}
