'use client'
import { useState } from 'react'
import PlaytestTab        from './PlaytestTab'
import ProbeTelemetryTab  from './ProbeTelemetryTab'

export default function AnalyticsTab({ toast }) {
  const [section, setSection] = useState('playtest')
  const sections = [
    { key: 'playtest', label: '📈 Playtest 总览' },
    { key: 'probes',   label: '🛰️ 探针遥测' },
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
      {section === 'playtest' && <PlaytestTab       toast={toast} />}
      {section === 'probes'   && <ProbeTelemetryTab toast={toast} />}
    </div>
  )
}
