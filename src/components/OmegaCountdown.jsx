'use client'

import { useEffect, useRef } from 'react'

// Ω-段倒计时分层预警（research-2026-05-27-v2 P0）
// 回合制 turns ≈ 时间分层。3+ 信息 / 3 注意 / 2 警示 / 1 紧急。
// 0 由 server 端 tickOmegaCountdown 触发强制退避，badge 自动消失。

const COLORS = {
  purple: '#b47dff',
  yellow: '#ffc740',
  orange: '#ff8c42',
  red:    '#ff4455',
}

const TIER_STYLE = {
  normal:   { color: COLORS.purple, label: '',  anim: null,                pulse: false },
  caution:  { color: COLORS.yellow, label: '⚠', anim: null,                pulse: false },
  warning:  { color: COLORS.orange, label: '⚠', anim: 'omega-pulse-slow',  pulse: true  },
  critical: { color: COLORS.red,    label: '⚠', anim: 'omega-pulse-fast',  pulse: true  },
}

function getTier(n) {
  if (n === null || n === undefined) return null
  if (n >= 4) return 'normal'
  if (n === 3) return 'caution'
  if (n === 2) return 'warning'
  return 'critical' // 1 (0 已被 server 清成 null)
}

let _ctx = null
function getAudio() {
  if (typeof window === 'undefined') return null
  if (!_ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    try { _ctx = new AC() } catch { return null }
  }
  if (_ctx.state === 'suspended') {
    try { _ctx.resume() } catch {}
  }
  return _ctx
}

function beep(freq, duration = 0.11, gain = 0.045) {
  const c = getAudio()
  if (!c) return
  try {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const t0 = c.currentTime
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01)
    g.gain.linearRampToValueAtTime(0, t0 + duration)
    osc.connect(g)
    g.connect(c.destination)
    osc.start(t0)
    osc.stop(t0 + duration + 0.02)
  } catch {}
}

function playTier(tier) {
  if (tier === 'caution')      { beep(523) }                                                    // 单短音
  else if (tier === 'warning') { beep(659); setTimeout(() => beep(659), 140) }                  // 双短音
  else if (tier === 'critical') {                                                                // 三急音
    beep(880)
    setTimeout(() => beep(880),  110)
    setTimeout(() => beep(1109), 230)
  }
}

export default function OmegaCountdown({ value }) {
  const prev = useRef(value)
  useEffect(() => {
    const newTier = getTier(value)
    const oldTier = getTier(prev.current)
    if (newTier && newTier !== 'normal' && newTier !== oldTier) {
      playTier(newTier)
    }
    prev.current = value
  }, [value])

  if (value === null || value === undefined) return null
  const tier = getTier(value)
  const s = TIER_STYLE[tier] || TIER_STYLE.normal
  return (
    <span
      title={tier === 'critical'
        ? `Ω-段倒计时 ${value} 回合 — 紧急！下回合归零强制退避`
        : tier === 'warning'
          ? `Ω-段倒计时 ${value} 回合 — 警示`
          : `Ω-段倒计时 ${value} 回合`}
      style={{
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 12,
        background: `${s.color}18`,
        color: s.color,
        border: `1px solid ${s.color}40`,
        fontWeight: 700,
        animation: s.anim ? `${s.anim} ${tier === 'critical' ? '0.8s' : '1.6s'} ease-in-out infinite` : undefined,
        boxShadow: tier === 'critical' ? `0 0 8px ${s.color}88` : undefined,
        display: 'inline-block',
      }}
    >
      Ω{s.label} {value}
    </span>
  )
}
