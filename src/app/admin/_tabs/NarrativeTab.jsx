'use client'
import { useState } from 'react'
import ContractsTab from './ContractsTab'
import EventsTab    from './EventsTab'
import BranchesTab  from './BranchesTab'
import EndingsTab   from './EndingsTab'

export default function NarrativeTab({ toast }) {
  const [section, setSection] = useState('contracts')
  const sections = [
    { key: 'contracts', label: '📜 合同' },
    { key: 'events',    label: '🎲 事件' },
    { key: 'branches',  label: '🌿 分支' },
    { key: 'endings',   label: '🎬 结局' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {sections.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)} style={{
            padding: '8px 18px', borderRadius: 8,
            border: `1px solid ${section === s.key ? '#58a6ff' : '#30363d'}`,
            background: section === s.key ? 'rgba(88,166,255,0.12)' : 'transparent',
            color: section === s.key ? '#58a6ff' : '#8b949e',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>{s.label}</button>
        ))}
      </div>
      {section === 'contracts' && <ContractsTab toast={toast} />}
      {section === 'events'    && <EventsTab    toast={toast} />}
      {section === 'branches'  && <BranchesTab  toast={toast} />}
      {section === 'endings'   && <EndingsTab   toast={toast} />}
    </div>
  )
}
