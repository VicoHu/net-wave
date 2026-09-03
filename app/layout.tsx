import type { Metadata, Viewport } from 'next'
import { Providers } from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'net-wave',
  description: '局域网点对点聊天与文件传输',
}

// Discord 原味深色：DESIGN.md 深靛蓝画布，Semi 变量在 globals.css 按 dark 模式映射
export const viewport: Viewport = {
  themeColor: '#0a0d3a',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      {/* theme-mode 挂 body：Semi 浅色变量全集声明在 body 上，dark 覆盖必须同级级联才生效 */}
      <body theme-mode="dark">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
