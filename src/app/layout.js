// 根布局 —— Server Component。
// 之所以是服务端组件：Next 14 App Router 只有 Server Component 能 `export const viewport / metadata`，
//   client 组件不行。客户端逻辑（鉴权上下文/导航/副作用）移到 ./_shell/RootShell（'use client'）。
//   useAuth 定义在 RootShell，各页直接从 '@/app/_shell/RootShell' 导入（server 组件不能 re-export client hook）。

import './globals.css'
import { DM_Sans, JetBrains_Mono, Noto_Sans_SC } from 'next/font/google'
import { headers } from 'next/headers'
import RootShell from './_shell/RootShell'
import DevSourceJump from './_dev/DevSourceJump'

const dmSans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-dm-sans',
  weight: ['400', '500', '600', '700'],
})

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
  weight: ['400', '500', '700'],
})

const notoSansSc = Noto_Sans_SC({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-noto-sans-sc',
  weight: ['400', '500', '700'],
})

export async function generateMetadata() {
  const requestHeaders = await headers()
  const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host')
  const protocol = requestHeaders.get('x-forwarded-proto') || 'https'
  const origin = host ? `${protocol}://${host}` : 'https://dtsv.vercel.app'
  const imageUrl = new URL('/og.png', origin).toString()

  return {
    title: '远星',
    description: '远星：多人搜寻撤离',
    openGraph: {
      title: '远星',
      description: '远星：多人搜寻撤离',
      images: [{ url: imageUrl, width: 1536, height: 1024, alt: '远星' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: '远星',
      description: '远星：多人搜寻撤离',
      images: [imageUrl],
    },
  }
}

// 移动地基 (P1)：viewport-fit=cover 让内容延伸到刘海/圆角屏边缘（配合 globals.css 的 safe-area 工具类）；
//   不锁 maximumScale/userScalable —— 保留捏合缩放，无障碍友好。themeColor 让移动端浏览器 UI 同色。
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0e1117',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh">
      <body className={`${dmSans.variable} ${jetBrainsMono.variable} ${notoSansSc.variable}`}>
        <DevSourceJump />
        <RootShell>{children}</RootShell>
      </body>
    </html>
  )
}
