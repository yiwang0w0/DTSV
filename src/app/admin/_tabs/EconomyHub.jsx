'use client'
/**
 * EconomyHub — 经济一站式（商店目录 / 点数 · 兑换）。
 * 收编原 shop / points 两个侧栏入口。叶子零改动。
 */
import ShopTab from './ShopTab'
import PointsConfigTab from './PointsConfigTab'
import { SegTabs, useUrlSection } from '../_shared/ui'

export default function EconomyHub({ toast }) {
  const [section, setSection] = useUrlSection(['shop', 'points'], 'shop')
  const sections = [
    { key: 'shop',   label: '🛒 商店目录' },
    { key: 'points', label: '💱 点数 / 兑换' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SegTabs sections={sections} active={section} onChange={setSection} />
      {section === 'shop'   && <ShopTab toast={toast} />}
      {section === 'points' && <PointsConfigTab toast={toast} />}
    </div>
  )
}
