'use client'
import { useState } from 'react'
import PlaytestTab        from './PlaytestTab'
import ProbeTelemetryTab  from './ProbeTelemetryTab'
import { SegTabs } from '../_shared/ui'

export default function AnalyticsTab({ toast }) {
  const [section, setSection] = useState('playtest')
  const sections = [
    { key: 'playtest', label: '📈 Playtest 总览' },
    { key: 'probes',   label: '🛰️ 探针遥测' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SegTabs sections={sections} active={section} onChange={setSection} />
      {section === 'playtest' && <PlaytestTab       toast={toast} />}
      {section === 'probes'   && <ProbeTelemetryTab toast={toast} />}
    </div>
  )
}
