import type { Metadata, Viewport } from 'next'
import { Providers } from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'net-wave',
  description: '局域网点对点聊天与文件传输',
}

// 纯深色单主题：Discord onyx 外壳（app/globals.css :root 定义）
export const viewport: Viewport = {
  themeColor: '#1e1f22',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
