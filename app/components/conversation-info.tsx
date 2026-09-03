'use client'

import { Badge } from '@components/ui/badge'
import { UserAvatar } from './user-avatar'
import { avatarColor } from '../message-view'
import type { ConversationSummary } from '../types'

/**
 * 右侧会话信息面板（对应 Discord 成员/资料栏）：展示当前会话的资料卡。
 * 仅 ≥ xl 屏显示，与截图右栏对位。
 */
export function ConversationInfo({ conversation }: { conversation: ConversationSummary }) {
  const isRoom = conversation.type === 'room'
  const name = isRoom
    ? (conversation.room?.name ?? '未知房间')
    : (conversation.peer?.name ?? '未知节点')
  const bannerColor = isRoom ? 'var(--primary)' : avatarColor(name)

  return (
    <aside
      aria-label="会话信息"
      className="hidden w-60 shrink-0 flex-col overflow-y-auto bg-sidebar xl:flex"
    >
      <div className="h-24 shrink-0" style={{ backgroundColor: bannerColor }} />
      <div className="-mt-10 flex flex-col gap-4 px-4 pb-6">
        <UserAvatar
          name={name}
          className="size-20 rounded-full border-[6px] border-sidebar"
          dotClassName="ring-sidebar"
        />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-bold">{name}</h2>
            <Badge variant="secondary" className="shrink-0 rounded-full">
              {isRoom ? '房间' : '私聊'}
            </Badge>
          </div>
          {isRoom && (
            <p className="text-sm text-muted-foreground">
              {conversation.room?.memberCount} 名成员 · 中心内公开可加入
            </p>
          )}
        </div>
        <div className="rounded-lg bg-rail p-3 text-xs/relaxed text-muted-foreground">
          {isRoom
            ? '房间持久存在，任意节点可自由加入；历史消息长期保留。'
            : '私聊仅限两名节点之间；消息经服务中心中转并持久保存。'}
        </div>
      </div>
    </aside>
  )
}
