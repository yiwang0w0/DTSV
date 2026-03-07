'use client'
import { useState } from 'react'
import EquipmentSeriesSection   from './EquipmentSeriesSection'
import EquipmentPassivesSection from './EquipmentPassivesSection'

export default function EquipmentTab({ toast }) {
  const [section, setSection] = useState('series')

  const sections = [
    { key: 'series',   label: '🗡️ 系列 & 升阶树' },
    { key: 'passives', label: '⚡ 被动技能' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 6 }}>
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
      {section === 'series'   && <EquipmentSeriesSection   toast={toast} />}
      {section === 'passives' && <EquipmentPassivesSection toast={toast} />}
    </div>
  )
}
