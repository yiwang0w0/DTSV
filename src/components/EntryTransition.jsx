'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'

const Shader = dynamic(() => import('@/components/fx/Shader'), { ssr: false })
const GLYPHS = Array.from('01<>/\\[]{}#%&?*+-=░▒▓Ω∆※')

function scramble(target, resolved) {
  return Array.from(target, (char, index) => {
    if (char === ' ' || index < resolved) return char
    return GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
  }).join('')
}

export default function EntryTransition({ id, origin, variant = 'auth', onNavigate, onComplete }) {
  const target = variant === 'returning' ? '连接恢复' : '身份确认'
  const chars = useMemo(() => Array.from(target), [target])
  const [stage, setStage] = useState('seed')
  const [resolved, setResolved] = useState(0)
  const [display, setDisplay] = useState(() => scramble(target, 0))
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setReducedMotion(reduced)
    const timing = reduced
      ? { decodeStart: 0, decodeDuration: 0, blackout: 80, navigate: 100, exit: 160, complete: 260 }
      : variant === 'returning'
        ? { decodeStart: 80, decodeDuration: 340, blackout: 520, navigate: 650, exit: 880, complete: 1120 }
        : { decodeStart: 140, decodeDuration: 640, blackout: 940, navigate: 1080, exit: 1360, complete: 1640 }

    const timers = []
    const frame = window.requestAnimationFrame(() => setStage('open'))
    const startedAt = performance.now()

    if (reduced) {
      setResolved(chars.length)
      setDisplay(target)
    }

    const ticker = reduced ? null : window.setInterval(() => {
      const elapsed = performance.now() - startedAt
      const progress = Math.max(0, Math.min(1, (elapsed - timing.decodeStart) / timing.decodeDuration))
      const nextResolved = Math.min(chars.length, Math.floor(progress * (chars.length + 1)))
      setResolved(nextResolved)
      setDisplay(scramble(target, nextResolved))
      if (nextResolved >= chars.length) window.clearInterval(ticker)
    }, 42)

    timers.push(window.setTimeout(() => {
      setResolved(chars.length)
      setDisplay(target)
      setStage('blackout')
    }, timing.blackout))
    timers.push(window.setTimeout(onNavigate, timing.navigate))
    timers.push(window.setTimeout(() => setStage('exit'), timing.exit))
    timers.push(window.setTimeout(onComplete, timing.complete))

    return () => {
      window.cancelAnimationFrame(frame)
      if (ticker) window.clearInterval(ticker)
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [chars, id, onComplete, onNavigate, target, variant])

  const x = Number.isFinite(origin?.x) ? `${origin.x}px` : '50%'
  const y = Number.isFinite(origin?.y) ? `${origin.y}px` : '50%'
  const open = stage !== 'seed'
  const textVisible = stage === 'open'
  const settled = resolved >= chars.length

  return (
    <div
      role="status"
      aria-label={`${target}，远星函馆`}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        overflow: 'hidden', isolation: 'isolate', pointerEvents: 'all',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#020409',
        clipPath: open ? `circle(160vmax at ${x} ${y})` : `circle(0 at ${x} ${y})`,
        opacity: stage === 'seed' || stage === 'exit' ? 0 : 1,
        transition: reducedMotion
          ? 'opacity 80ms linear'
          : 'clip-path 720ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 240ms ease',
        willChange: 'clip-path, opacity',
      }}
    >
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        opacity: stage === 'open' ? 0.9 : 0,
        transition: 'opacity 260ms ease',
      }}>
        <Shader name="pollution_field" pollution={0.72} intensity={1} />
      </div>

      <div style={{
        position: 'absolute', inset: 0, zIndex: 1,
        background: 'radial-gradient(ellipse 64% 50% at 50% 50%, rgba(2,4,9,0.08), rgba(2,4,9,0.86))',
      }} />

      <div style={{
        position: 'relative', zIndex: 2, width: '100%', textAlign: 'center',
        opacity: textVisible ? 1 : 0,
        transform: textVisible ? 'translateY(0)' : 'translateY(6px)',
        transition: 'opacity 180ms ease, transform 260ms ease',
      }}>
        <div aria-hidden="true" style={{
          position: 'relative', display: 'inline-grid', placeItems: 'center',
          minWidth: '8em', minHeight: 40,
          fontFamily: 'var(--font-jetbrains-mono), monospace',
          fontSize: 24, fontWeight: 700, letterSpacing: 0,
        }}>
          {!settled && (
            <>
              <span style={{ gridArea: '1 / 1', color: '#f85149', opacity: 0.42, transform: 'translateX(-2px)' }}>{display}</span>
              <span style={{ gridArea: '1 / 1', color: '#58a6ff', opacity: 0.48, transform: 'translateX(2px)' }}>{display}</span>
            </>
          )}
          <span style={{ gridArea: '1 / 1', color: '#e6edf3', textShadow: '0 0 22px rgba(88,166,255,0.55)' }}>{display}</span>
        </div>
        <div style={{
          marginTop: 10, color: '#8b949e', fontSize: 11,
          fontFamily: 'var(--font-jetbrains-mono), monospace', letterSpacing: 0,
          opacity: settled ? 1 : 0.35, transition: 'opacity 180ms ease',
        }}>
          远星函馆
        </div>
      </div>
    </div>
  )
}
