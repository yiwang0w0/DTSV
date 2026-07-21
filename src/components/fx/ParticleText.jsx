'use client'

/**
 * ParticleText.jsx — 5 种文本粒子方案（远星函馆 FX）
 *
 * 来源：claude.ai/design 远星函馆 FX 演示，设计稿 2026-05-10。
 * 与原型差异：
 *   - 改为 ES module，移除 window.ParticleText = ...
 *   - prefers-reduced-motion 时自动降级为静态文字
 *   - Decode/Scan 用 useReducedMotion 自动跳过动画
 *
 * 5 模式：
 *   assemble — Canvas 把文字栅格化为 ~600 个粒子，弹回目标
 *   decode   — 字符在 ◢◣ΩΨ01 池中乱滚后定格（纯 DOM，0 Canvas）
 *   glitch   — RGB 三层错位 + 周期性切片
 *   corrupt  — 高污染时逐字漂移、撕裂、被替换
 *   scan     — 一根扫描线划过，划到的字才上色
 *
 * Props：
 *   text          : string
 *   mode          : 'assemble' | 'decode' | 'glitch' | 'corrupt' | 'scan'
 *   pollution     : 0..1
 *   color/accent  : hex
 *   size          : px
 *   weight        : 400-900
 *   font          : CSS font family
 *   trigger       : 改变后重播（assemble/decode/scan 用）
 *   letterSpacing : px
 */

import { useEffect, useRef, useState } from 'react'

const DEFAULT_FONT = "var(--font-noto-sans-sc), 'PingFang SC', sans-serif"

function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = () => setReduced(mq.matches)
    handler()
    mq.addEventListener?.('change', handler)
    return () => mq.removeEventListener?.('change', handler)
  }, [])
  return reduced
}

export default function ParticleText({
  text = '远星',
  mode = 'decode',
  pollution = 0,
  color = '#bc8cff',
  accent = '#58a6ff',
  size = 48,
  weight = 800,
  font = DEFAULT_FONT,
  trigger = 0,
  letterSpacing = 6,
}) {
  const reduced = useReducedMotion()
  // reduced motion → 静态文字
  if (reduced) {
    return (
      <div style={{
        fontFamily: font, fontSize: size, fontWeight: weight, color, letterSpacing,
        textAlign: 'center', lineHeight: 1.2,
        textShadow: `0 0 28px ${color}80, 0 0 60px ${accent}40`,
      }}>{text}</div>
    )
  }
  const props = { text, pollution, color, accent, size, weight, font, trigger, letterSpacing }
  if (mode === 'assemble') return <Assemble {...props} />
  if (mode === 'decode')   return <Decode   {...props} />
  if (mode === 'glitch')   return <Glitch   {...props} />
  if (mode === 'corrupt')  return <Corrupt  {...props} />
  if (mode === 'scan')     return <Scan     {...props} />
  return null
}

export const PARTICLE_MODES = ['assemble', 'decode', 'glitch', 'corrupt', 'scan']

// ── 1. Assemble：canvas 把文字渲成像素 → 抽样 → 粒子飞入 ──
function Assemble({ text, pollution, color, accent, size, weight, font, trigger, letterSpacing }) {
  const ref = useRef(null)
  const polRef = useRef(pollution)
  polRef.current = pollution

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = canvas.clientWidth, H = canvas.clientHeight
    canvas.width = W * dpr; canvas.height = H * dpr; ctx.scale(dpr, dpr)

    const off = document.createElement('canvas')
    off.width = W; off.height = H
    const o = off.getContext('2d')
    o.fillStyle = '#fff'
    o.font = `${weight} ${size}px ${font}`
    o.textAlign = 'center'
    o.textBaseline = 'middle'
    let total = 0
    const widths = [...text].map(ch => { const w = o.measureText(ch).width; total += w; return w })
    total += letterSpacing * (text.length - 1)
    let xCursor = (W - total) / 2
    ;[...text].forEach((ch, i) => {
      o.fillText(ch, xCursor + widths[i] / 2, H / 2)
      xCursor += widths[i] + letterSpacing
    })
    const img = o.getImageData(0, 0, W, H).data
    const step = Math.max(2, Math.round(size / 40))
    const targets = []
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        const a = img[(y * W + x) * 4 + 3]
        if (a > 128) targets.push([x, y])
      }
    }
    const ps = targets.map(([tx, ty]) => ({
      tx, ty,
      x: tx + (Math.random() - 0.5) * W * 1.4,
      y: ty + (Math.random() - 0.5) * H * 2.2,
      vx: 0, vy: 0,
      delay: Math.random() * 0.6,
      hue: Math.random() < 0.5 ? color : accent,
    }))

    let raf, t0 = performance.now()
    function frame() {
      raf = requestAnimationFrame(frame)
      if (document.hidden) return
      const t = (performance.now() - t0) / 1000
      ctx.clearRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'lighter'
      const pol = polRef.current
      for (const p of ps) {
        const k = Math.max(0, t - p.delay)
        const ease = 1 - Math.pow(1 - Math.min(1, k * 0.9), 3)
        const dx = p.tx - p.x, dy = p.ty - p.y
        p.vx = (p.vx + dx * 0.012) * 0.86
        p.vy = (p.vy + dy * 0.012) * 0.86
        p.x += p.vx; p.y += p.vy
        const jitter = pol * 2.5
        const px = p.x + (Math.random() - 0.5) * jitter
        const py = p.y + (Math.random() - 0.5) * jitter
        ctx.fillStyle = p.hue
        ctx.globalAlpha = 0.55 + 0.45 * ease
        ctx.fillRect(px, py, 2, 2)
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }
    frame()
    return () => cancelAnimationFrame(raf)
  }, [text, trigger, size, weight, color, accent, font, letterSpacing])

  return <canvas ref={ref} style={{ width: '100%', height: size * 1.6, display: 'block' }} />
}

// ── 2. Decode：DOM 文字 + 字符不断洗牌后定格 ──
function Decode({ text, pollution, color, accent, size, weight, font, trigger, letterSpacing }) {
  const POOL = '◢◣◤◥▣▤▥▦▧▨▩░▒▓01ΩΨΣΦАБВГДΞΛΘ⌬⏣'
  const [chars, setChars] = useState(() => text.split(''))
  useEffect(() => {
    const N = text.length
    let frame = 0
    const settled = new Array(N).fill(false)
    const order = [...Array(N).keys()].sort(() => Math.random() - 0.5)
    const id = setInterval(() => {
      frame++
      if (frame % 2 === 0 && order.length) {
        const idx = order.shift()
        settled[idx] = true
      }
      const next = text.split('').map((c, i) =>
        settled[i] ? c : POOL[(Math.random() * POOL.length) | 0]
      )
      setChars(next)
      if (!order.length) clearInterval(id)
    }, 35)
    return () => clearInterval(id)
  }, [text, trigger])
  return (
    <div style={{
      fontFamily: font, fontSize: size, fontWeight: weight, color,
      letterSpacing, textAlign: 'center', lineHeight: 1.2,
      textShadow: `0 0 28px ${color}80, 0 0 60px ${accent}40`,
      filter: pollution > 0.6 ? `hue-rotate(${pollution * 40}deg)` : 'none',
    }}>{chars.join('')}</div>
  )
}

// ── 3. Glitch：3 层错位（PvP 警报 / 短暂使用）──
function Glitch({ text, pollution, color, accent, size, weight, font, letterSpacing }) {
  const [seed, setSeed] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSeed(s => s + 1), 80)
    return () => clearInterval(id)
  }, [])
  const sev = 0.4 + pollution * 1.2
  const dx1 = (Math.sin(seed * 1.3) * 4) * sev
  const dx2 = (Math.cos(seed * 0.7) * 4) * sev
  const slice = (seed % 8 === 0) ? Math.random() * 0.5 : 0
  const base = {
    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: font, fontSize: size, fontWeight: weight, letterSpacing, lineHeight: 1.2,
  }
  return (
    <div style={{ position: 'relative', height: size * 1.6 }}>
      {slice > 0 && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: `${20 + slice * 60}%`, height: `${slice * 30}px`,
          background: `linear-gradient(90deg, transparent, ${accent}30, transparent)`,
          mixBlendMode: 'screen',
        }} />
      )}
      <div style={{ ...base, color, textShadow: `0 0 24px ${color}80` }}>{text}</div>
      <div style={{ ...base, color: '#f85149', mixBlendMode: 'screen', transform: `translate(${dx1}px,0)`, opacity: 0.85 }}>{text}</div>
      <div style={{ ...base, color: accent, mixBlendMode: 'screen', transform: `translate(${-dx2}px,0)`, opacity: 0.85 }}>{text}</div>
    </div>
  )
}

// ── 4. Corrupt：每字独立位移 / 替换；污染越高越严重 ──
function Corrupt({ text, pollution, color, accent, size, weight, font, letterSpacing }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60)
    return () => clearInterval(id)
  }, [])
  const POOL = '#@%&*?!░▒▓ΩΨ◢◣'
  return (
    <div style={{
      fontFamily: font, fontSize: size, fontWeight: weight, letterSpacing,
      textAlign: 'center', lineHeight: 1.2,
    }}>
      {[...text].map((c, i) => {
        const seed = (tick * 7 + i * 13) % 100
        const corrupted = pollution > 0.4 && (seed / 100) < pollution * 0.5
        const ch = corrupted ? POOL[seed % POOL.length] : c
        const dy = corrupted ? (Math.sin(tick * 0.4 + i) * pollution * 8) : 0
        const blur = corrupted ? pollution * 2 : 0
        const hue = corrupted ? '#f85149' : color
        return (
          <span key={i} style={{
            display: 'inline-block',
            transform: `translateY(${dy}px)`,
            color: hue,
            filter: blur ? `blur(${blur}px)` : 'none',
            textShadow: `0 0 20px ${hue}80, 0 0 40px ${accent}30`,
            transition: 'color .2s',
          }}>{ch}</span>
        )
      })}
    </div>
  )
}

// ── 5. Scan：一根扫描线划过，扫到才显示 ──
function Scan({ text, pollution, color, accent, size, weight, font, trigger, letterSpacing }) {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    let raf, t0 = performance.now()
    function loop() {
      raf = requestAnimationFrame(loop)
      const t = (performance.now() - t0) / 1000
      setProgress(Math.min(1, t / 1.6))
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [trigger, text])
  return (
    <div style={{ position: 'relative', height: size * 1.6, overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: font, fontSize: size, fontWeight: weight, letterSpacing,
        color: 'transparent', WebkitTextStroke: `1px ${accent}40`,
      }}>{text}</div>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: font, fontSize: size, fontWeight: weight, letterSpacing,
        color, textShadow: `0 0 30px ${color}80, 0 0 60px ${accent}40`,
        clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)`,
        filter: pollution > 0.6 ? `hue-rotate(${pollution * 40}deg)` : 'none',
      }}>{text}</div>
      {progress < 1 && (
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `calc(${progress * 100}% - 1px)`, width: 2,
          background: `linear-gradient(180deg, transparent, ${accent}, transparent)`,
          boxShadow: `0 0 24px ${accent}, 0 0 6px ${accent}`,
        }} />
      )}
    </div>
  )
}
