'use client'

import { cn } from '@lib/utils'
import { avatarColor } from '../message-view'

interface UserAvatarProps {
  name: string
  /** 在线状态点（在线节点 / 底部节点面板使用） */
  online?: boolean
  /** 状态点描边颜色需与所在面板底色一致，默认 sidebar */
  dotClassName?: string
  className?: string
}

/** Discord 式圆形首字头像：按名字确定性取色，可选在线状态点 */
export function UserAvatar({ name, online, dotClassName = 'ring-sidebar', className }: UserAvatarProps) {
  const initial = name.trim().slice(0, 1).toUpperCase() || '?'
  return (
    <div className={cn('relative shrink-0', className)}>
      <div
        className="flex size-full items-center justify-center rounded-full font-semibold text-white select-none"
        style={{ backgroundColor: avatarColor(name) }}
        aria-hidden
      >
        {initial}
      </div>
      {online && (
        <span
          className={cn(
            'absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-online ring-[3px]',
            dotClassName,
          )}
          title="在线"
        />
      )}
    </div>
  )
}
