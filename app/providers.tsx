'use client'

import type { ReactNode } from 'react'
import { TooltipProvider } from '@components/ui/tooltip'
import { Toaster } from '@components/ui/sonner'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={200}>
      {children}
      <Toaster position="top-center" />
    </TooltipProvider>
  )
}
