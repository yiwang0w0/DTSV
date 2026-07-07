'use client'

// 窄屏检测钩子（移动化 P2+）。SSR/首渲安全：初值 false ⇒ 服务端与客户端首渲一致（桌面态·无 hydration mismatch），
//   仅在 useEffect 内经 matchMedia 更新真值。断点默认 768（< 768 视为窄屏：手机 + 小平板竖屏）。
import { useState, useEffect } from 'react'

export function useIsNarrow(breakpoint = 768) {
  const [isNarrow, setIsNarrow] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const update = () => setIsNarrow(mq.matches)
    update()
    // Safari <14 用 addListener/removeListener 兜底
    if (mq.addEventListener) {
      mq.addEventListener('change', update)
      return () => mq.removeEventListener('change', update)
    }
    mq.addListener(update)
    return () => mq.removeListener(update)
  }, [breakpoint])
  return isNarrow
}
