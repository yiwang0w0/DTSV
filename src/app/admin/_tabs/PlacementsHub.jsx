'use client'
/**
 * PlacementsHub — 投放一站式（道具投放 / 敌人投放）。
 * 收编原 placements / npcplace 两个侧栏入口（二者本就都叫「投放」）。叶子零改动。
 */
import RoomItemsTab from './RoomItemsTab'
import NpcPlacementTab from './NpcPlacementTab'
import { SegTabs, useUrlSection } from '../_shared/ui'

export default function PlacementsHub({ toast }) {
  const [section, setSection] = useUrlSection(['items', 'npcs'], 'items')
  const sections = [
    { key: 'items', label: '🎯 道具投放' },
    { key: 'npcs',  label: '👹 敌人投放' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SegTabs sections={sections} active={section} onChange={setSection} />
      {section === 'items' && <RoomItemsTab toast={toast} />}
      {section === 'npcs'  && <NpcPlacementTab toast={toast} />}
    </div>
  )
}
