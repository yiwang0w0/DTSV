'use client'
/**
 * ItemsHub — 道具一站式（池 / 系列标签 / 合成配方）。
 * 把原本拆成 3 个侧栏入口（items / itemtags / itemrecipe）的「同域功能」收进一个壳 tab，
 * 用共享 <SegTabs> 子导航切换。叶子内容零改动：道具池仍是 ItemsTab，标签/合成仍走内容引擎。
 */
import ItemsTab from './ItemsTab'
import ContentEngine from '../_engine/ContentEngine'
import itemTag from '../_engine/schemas/itemTag'
import itemRecipe from '../_engine/schemas/itemRecipe'
import { SegTabs, useUrlSection } from '../_shared/ui'

export default function ItemsHub({ items, buffPool, onRefresh, toast }) {
  const [section, setSection] = useUrlSection(['pool', 'tags', 'recipes'], 'pool')
  const sections = [
    { key: 'pool',    label: '🔮 道具池', count: items.length },
    { key: 'tags',    label: '🏷️ 系列标签' },
    { key: 'recipes', label: '🧪 合成配方' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SegTabs sections={sections} active={section} onChange={setSection} />
      {section === 'pool'    && <ItemsTab items={items} buffPool={buffPool} onRefresh={onRefresh} toast={toast} />}
      {section === 'tags'    && <ContentEngine schema={itemTag} toast={toast} />}
      {section === 'recipes' && <ContentEngine schema={itemRecipe} toast={toast} />}
    </div>
  )
}
