'use client'
/**
 * FragmentsHub — 残片一站式（残片池 / 合成配方）。
 * 收编原 fragments / combos 两个侧栏入口。叶子零改动。
 */
import FragmentsTab from './FragmentsTab'
import FragmentCombosTab from './FragmentCombosTab'
import { SegTabs, useUrlSection } from '../_shared/ui'

export default function FragmentsHub({ toast }) {
  const [section, setSection] = useUrlSection(['pool', 'combos'], 'pool')
  const sections = [
    { key: 'pool',   label: '📡 残片池' },
    { key: 'combos', label: '🔗 合成配方' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SegTabs sections={sections} active={section} onChange={setSection} />
      {section === 'pool'   && <FragmentsTab toast={toast} />}
      {section === 'combos' && <FragmentCombosTab toast={toast} />}
    </div>
  )
}
