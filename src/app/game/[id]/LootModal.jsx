'use client'

import { RARITY_META } from '@/lib/equipmentEngine'
import { Btn, Modal, T } from './gameUi'

const SOURCE_TEXT = {
  kill: '击杀后战利品',
  search: '搜索发现敌人残骸',
}

function getOptionMeta(option) {
  if (option.type === 'item') {
    return { label: '道具', color: T.green }
  }

  if (option.type === 'equipment_instance') {
    return { label: '装备', color: RARITY_META[option.rarity]?.color || T.cyan }
  }

  if (option.type === 'equipment_tier') {
    return { label: '装备图纸', color: RARITY_META[option.rarity]?.color || T.yellow }
  }

  return { label: '战利品', color: T.dimB }
}

export default function LootModal({ open, prompt, busy, onClose, onTake }) {
  if (!prompt) return null

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="拾取战利品">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${T.border}`, background: T.bg2 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{prompt.corpseName}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: T.dimB }}>
            {SOURCE_TEXT[prompt.source] || '尸体搜刮'}，本次只能带走 1 件，剩余物品会继续留在尸体上。
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '52vh', overflowY: 'auto' }}>
          {prompt.options.map(option => {
            const meta = getOptionMeta(option)
            return (
              <div
                key={option.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: `1px solid ${T.border}`,
                  background: T.bg1,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 700,
                        color: meta.color,
                        background: `${meta.color}18`,
                        border: `1px solid ${meta.color}33`,
                        flexShrink: 0,
                      }}
                    >
                      {meta.label}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: meta.color }}>{option.name}</span>
                  </div>

                  <div style={{ marginTop: 6, fontSize: 12, color: T.dimB, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {option.slot && <span>槽位: {option.slot}</span>}
                    {option.rarity && <span>稀有度: {option.rarity}</span>}
                    {option.durabilityMax > 0 && (
                      <span>耐久: {option.durability ?? 0}/{option.durabilityMax}</span>
                    )}
                  </div>
                </div>

                <Btn variant="primary" size="sm" disabled={busy} onClick={() => onTake(option)}>
                  {busy ? '处理中...' : '带走'}
                </Btn>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Btn variant="ghost" disabled={busy} onClick={onClose}>先不拿</Btn>
        </div>
      </div>
    </Modal>
  )
}
