'use client'

// React 19 适配：必须在任何 Semi 组件渲染前执行（官方要求置于入口最顶部）
import '@douyinfe/semi-ui/react19-adapter'
import type { ReactNode } from 'react'

export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>
}
