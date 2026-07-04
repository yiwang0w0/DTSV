'use client'
import EventsTab    from './EventsTab'
import BranchesTab  from './BranchesTab'
import EndingsTab   from './EndingsTab'
import { SegTabs, useUrlSection } from '../_shared/ui'

export default function NarrativeTab({ toast }) {
  const [section, setSection] = useUrlSection(['events', 'branches', 'endings'], 'events')
  const sections = [
    { key: 'events',    label: '🎲 事件' },
    { key: 'branches',  label: '🌿 分支' },
    { key: 'endings',   label: '🎬 结局' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SegTabs sections={sections} active={section} onChange={setSection} wrap />
      {section === 'events'    && <EventsTab    toast={toast} />}
      {section === 'branches'  && <BranchesTab  toast={toast} />}
      {section === 'endings'   && <EndingsTab   toast={toast} />}
    </div>
  )
}
