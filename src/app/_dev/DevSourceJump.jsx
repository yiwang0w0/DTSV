'use client'

// 开发期「点元素跳源码」——仅 dev、零外部 runtime。
//
// 原理：next.config.js 里的 webpack pre-loader 会给每个 JSX 元素注入
//   data-source="<绝对路径>:<行>:<列>"（在 SWC 之前改源码，故 next/font 照常工作）。
// 本组件监听 Alt(Win)/⌥(mac)：
//   · 按住 Alt → 悬停时高亮元素并浮出「文件:行」标签；
//   · Alt + 点击 → 用 vscode://file/ 协议在 VS Code 打开那一行。
// 适合「改文本 / 小样式」：点 → 跳到源码那行 → 改 → 存 → HMR 秒更新。零 AI、零 token。
//
// 为什么不用 @locator/runtime：它的 React 识别只认 Babel 注入的 _debugSource / data-locatorjs-id，
//   而 Next 14 用 SWC（且 next/font 禁止切 Babel）两者都拿不到 → 它读不到源码。这里直接消费
//   loader 已注入好的 data-source，绕过 runtime，彻底规避该限制。
//
// 生产安全：process.env.NODE_ENV !== 'development' 直接返回；loader 在生产构建也不注入 data-source。
import { useEffect } from 'react'

export default function DevSourceJump() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return undefined

    let armed = false

    const box = document.createElement('div')
    box.style.cssText = [
      'position:fixed', 'z-index:2147483646', 'pointer-events:none',
      'border:1.5px solid #58a6ff', 'background:rgba(88,166,255,0.12)',
      'border-radius:4px', 'display:none',
    ].join(';')
    const label = document.createElement('div')
    label.style.cssText = [
      'position:fixed', 'z-index:2147483647', 'pointer-events:none',
      "font:600 11px/1.4 ui-monospace,'JetBrains Mono',monospace",
      'color:#fff', 'background:#1f6feb', 'padding:2px 6px', 'border-radius:4px',
      'display:none', 'white-space:nowrap', 'box-shadow:0 2px 8px rgba(0,0,0,.4)',
    ].join(';')
    document.body.appendChild(box)
    document.body.appendChild(label)

    const hide = () => { box.style.display = 'none'; label.style.display = 'none' }

    // "D:\...\src\app\layout.js:63:11" → "app/layout.js:63"
    const shorten = (s) => {
      const m = s.match(/([^\\/]+[\\/][^\\/]+):(\d+):\d+$/)
      return m ? `${m[1].replace(/\\/g, '/')}:${m[2]}` : s
    }

    const onMove = (e) => {
      if (!armed) return
      const el = e.target?.closest?.('[data-source]')
      if (!el) { hide(); return }
      const r = el.getBoundingClientRect()
      Object.assign(box.style, {
        display: 'block', left: `${r.left}px`, top: `${r.top}px`,
        width: `${r.width}px`, height: `${r.height}px`,
      })
      label.textContent = shorten(el.getAttribute('data-source') || '')
      Object.assign(label.style, {
        display: 'block', left: `${r.left}px`, top: `${Math.max(0, r.top - 20)}px`,
      })
    }

    const disarm = () => { armed = false; document.documentElement.style.cursor = ''; hide() }
    const onKeyDown = (e) => {
      if (e.key === 'Alt') { armed = true; document.documentElement.style.cursor = 'crosshair' }
    }
    const onKeyUp = (e) => { if (e.key === 'Alt') disarm() }

    const onClick = (e) => {
      if (!e.altKey) return
      const el = e.target?.closest?.('[data-source]')
      if (!el) return
      e.preventDefault()
      e.stopPropagation()
      const src = el.getAttribute('data-source') || ''
      if (!src) return
      const url = `vscode://file/${src.replace(/\\/g, '/')}`
      const a = document.createElement('a')
      a.href = url
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      a.remove()
      hide()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', disarm)
    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('click', onClick, true)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', disarm)
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('click', onClick, true)
      box.remove()
      label.remove()
      document.documentElement.style.cursor = ''
    }
  }, [])

  return null
}
