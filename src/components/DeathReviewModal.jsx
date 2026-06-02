'use client'

/**
 * DeathReviewModal — 📜 死亡复盘（Phase 22 / research 2026-05-28-D）
 *
 * 玩家阵亡时弹出，把死亡因果可识别化（避免 Returnal 式"不知道怎么死的"反模式）。
 * 数据来源 = player_death_log 最新一行（cause_category / survived_seconds /
 * chamber_depth / reason_text / context），由 GameClientPage 在检测到 alive→false
 * 时拉取并组装为 review 对象传入；缺字段由调用方用客户端状态兜底。
 *
 * Props:
 *   review   — { causeCategory, causeText, survivedSeconds, chamberDepth,
 *               chamberName, lostFragments[] } | null
 *   onClose()
 */

import { T } from '@/app/game/[id]/gameUi'

const CAUSE_META = {
  pvp:                { icon: '⚔️', label: '玩家交战致死', color: T.red },
  npc_counter:        { icon: '👾', label: '实体反击致命', color: T.orange },
  omega_timeout:      { icon: '⏳', label: 'Ω-段倒计时归零', color: T.purple },
  pollution_meltdown: { icon: '☢',  label: '污染崩溃', color: T.yellow },
  // 缩圈致死：所在扇区被收缩为禁区，被时空边界吞没（BR 大时钟 wall-clock 权威致死）。
  contraction:        { icon: '🌀', label: '被收缩边界吞没', color: T.red },
  other:              { icon: '❔', label: '未知原因', color: T.dim },
}

function formatSurvived(sec) {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return null
  if (sec < 60) return `${sec} 秒`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分`
}

function Row({ label, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '11px 0', borderBottom: `1px solid ${T.border}`,
    }}>
      <span style={{ flex: '0 0 72px', fontSize: 12, color: T.dim, paddingTop: 1 }}>{label}</span>
      <div style={{ flex: 1, fontSize: 13, color: T.text }}>{children}</div>
    </div>
  )
}

export default function DeathReviewModal({ review, onClose }) {
  if (!review) return null

  const meta = CAUSE_META[review.causeCategory] || CAUSE_META.other
  const survivedText = formatSurvived(review.survivedSeconds)
  const depth = Number.isFinite(review.chamberDepth) && review.chamberDepth > 0 ? review.chamberDepth : null
  const lost = Array.isArray(review.lostFragments) ? review.lostFragments : []

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div style={{
        background: T.bg1, borderRadius: 14, border: `1px solid ${T.border}`,
        width: '92%', maxWidth: 480,
        boxShadow: `0 0 60px rgba(0,0,0,0.7), 0 0 2px ${meta.color}40`,
        overflow: 'hidden',
      }}>
        {/* 顶栏 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: `1px solid ${T.border}`,
          background: `linear-gradient(180deg, ${meta.color}12, transparent)`,
        }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text }}>
            📜 死亡复盘
          </h3>
          <button
            onClick={onClose}
            style={{
              background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 6,
              padding: '4px 10px', color: T.dim, cursor: 'pointer', fontSize: 15,
            }}
          >✕</button>
        </div>

        <div style={{ padding: '6px 20px 20px' }}>
          {/* 死因横幅 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px', borderRadius: 10, marginTop: 14, marginBottom: 8,
            background: `${meta.color}12`,
            border: `1px solid ${meta.color}40`,
            borderLeft: `3px solid ${meta.color}`,
          }}>
            <span style={{ fontSize: 26, lineHeight: 1 }}>{meta.icon}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: meta.color }}>{meta.label}</div>
              {review.causeText && (
                <div style={{ fontSize: 11, color: T.dimB, marginTop: 3 }}>{review.causeText}</div>
              )}
            </div>
          </div>

          <Row label="存活时长">
            {survivedText
              ? <span style={{ color: T.cyan, fontWeight: 600 }}>{survivedText}</span>
              : <span style={{ color: T.dim }}>—</span>}
          </Row>

          <Row label="探索深度">
            {depth
              ? <span><span style={{ color: T.purple, fontWeight: 600 }}>第 {depth} 段</span>{review.chamberName ? <span style={{ color: T.dimB }}>　{review.chamberName}</span> : null}</span>
              : <span style={{ color: T.dim }}>—</span>}
          </Row>

          <Row label="残片">
            {lost.length > 0
              ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {lost.map((name, i) => (
                    <span key={i} style={{
                      padding: '2px 8px', borderRadius: 6, fontSize: 11,
                      background: `${T.red}15`, color: T.red, border: `1px solid ${T.red}40`,
                    }}>📡 {name}</span>
                  ))}
                </div>
              )
              : <span style={{ color: T.green, fontSize: 12 }}>✓ 已发现残片永久归档，不因阵亡丢失</span>}
          </Row>

          <button
            onClick={onClose}
            style={{
              width: '100%', marginTop: 18, padding: '10px 0', borderRadius: 8,
              border: `1px solid ${T.border}`, background: T.bg2,
              color: T.text, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            知道了，继续观战
          </button>
        </div>
      </div>
    </div>
  )
}
