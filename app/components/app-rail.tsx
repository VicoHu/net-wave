'use client'

import { PlusIcon, WavesIcon } from 'lucide-react'
import { Separator } from '@components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip'

interface AppRailProps {
  onCreateRoom: () => void
}

/**
 * 最左侧服务中心栏（Discord rail）：本中心只有一个「服务」，因此只承载
 * 品牌入口与创建房间动作；存储 / 扫码收在底部节点面板。
 */
export function AppRail({ onCreateRoom }: AppRailProps) {
  return (
    <nav
      aria-label="主导航"
      className="hidden w-[72px] shrink-0 flex-col items-center gap-2 bg-rail py-3 md:flex"
    >
      <Tooltip>
        <TooltipTrigger
          className="flex size-12 items-center justify-center rounded-2xl bg-primary text-white transition-all hover:rounded-xl"
          aria-label="net-wave 首页"
        >
          <WavesIcon className="size-6" />
        </TooltipTrigger>
        <TooltipContent side="right">net-wave</TooltipContent>
      </Tooltip>
      <Separator className="w-8 bg-white/10" />
      <Tooltip>
        <TooltipTrigger
          className="flex size-12 items-center justify-center rounded-full text-online transition-all hover:rounded-2xl hover:bg-primary hover:text-white"
          onClick={onCreateRoom}
          aria-label="创建房间"
        >
          <PlusIcon className="size-6" />
        </TooltipTrigger>
        <TooltipContent side="right">创建房间</TooltipContent>
      </Tooltip>
    </nav>
  )
}
