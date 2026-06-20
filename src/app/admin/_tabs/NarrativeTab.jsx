'use client'
import ContractsTab from './ContractsTab'
import EventsTab    from './EventsTab'
import BranchesTab  from './BranchesTab'
import EndingsTab   from './EndingsTab'
import { SegTabs, useUrlSection } from '../_shared/ui'

export default function NarrativeTab({ toast }) {
  const [section, setSection] = useUrlSection(['contracts', 'events', 'branches', 'endings'], 'contracts')
  const sections = [
    { key: 'contracts', label: '📜 合同' },
    { key: 'events',    label: '🎲 事件' },
    { key: 'branches',  label: '🌿 分支' },
    { key: 'endings',   label: '🎬 结局' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SegTabs sections={sections} active={section} onChange={setSection} wrap />
      {section === 'contracts' && <ContractsTab toast={toast} />}
      {section === 'events'    && <EventsTab    toast={toast} />}
      {section === 'branches'  && <BranchesTab  toast={toast} />}
      {section === 'endings'   && <EndingsTab   toast={toast} />}
    </div>
  )
}
