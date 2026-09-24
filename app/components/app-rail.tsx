'use client'

import Link from 'next/link'
import { PlusIcon, ShieldIcon, WavesIcon } from 'lucide-react'
import { Separator } from '@components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip'

/** lucide v1 已移除品牌图标，GitHub 标志以内联 SVG 提供 */
function GithubIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

interface AppRailProps {
  onCreateRoom: () => void
}

/**
 * 最左侧服务中心栏（Discord rail）：本中心只有一个「服务」，因此只承载
 * 品牌入口、创建房间与管理中心入口；存储 / 扫码 / 设置收在底部节点面板。
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
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/admin"
            aria-label="管理中心"
            className="flex size-12 items-center justify-center rounded-full text-muted-foreground transition-all hover:rounded-2xl hover:bg-primary hover:text-white"
          >
            <ShieldIcon className="size-6" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">管理中心</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href="https://github.com/VicoHu/net-wave"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub 开源仓库"
            className="mt-auto flex size-12 items-center justify-center rounded-full text-muted-foreground transition-all hover:rounded-2xl hover:bg-primary hover:text-white"
          >
            <GithubIcon className="size-6" />
          </a>
        </TooltipTrigger>
        <TooltipContent side="right">GitHub 开源仓库</TooltipContent>
      </Tooltip>
    </nav>
  )
}
