'use client'
import EquipmentSeriesSection   from './EquipmentSeriesSection'
import EquipmentPassivesSection from './EquipmentPassivesSection'
import { SegTabs, useUrlSection } from '../_shared/ui'

export default function EquipmentTab({ toast }) {
  const [section, setSection] = useUrlSection(['series', 'passives'], 'series')

  const sections = [
    { key: 'series',   label: '🗡️ 系列 & 升阶树' },
    { key: 'passives', label: '⚡ 被动技能' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SegTabs sections={sections} active={section} onChange={setSection} />
      {section === 'series'   && <EquipmentSeriesSection   toast={toast} />}
      {section === 'passives' && <EquipmentPassivesSection toast={toast} />}
    </div>
  )
}
