'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckIcon, HashIcon, PencilIcon, PlusIcon, QrCodeIcon, ServerIcon, SettingsIcon, TrashIcon } from 'lucide-react'
import { Input } from '@components/ui/input'
import { Button } from '@components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip'
import { UserAvatar } from './user-avatar'
import { cn } from '@lib/utils'
import { conversationName, messagePreview } from '../message-view'
import type { ConversationSummary, Peer, RoomInfo } from '../types'

interface AppSidebarProps {
  /** 桌面端侧栏宽度（px），由拖拽分隔条控制；缺省时使用默认宽度 md:w-[280px] */
  width?: number
  me: Peer | null
  conversations: ConversationSummary[]
  rooms: RoomInfo[]
  peers: Peer[]
  activeId: number | null
  filter: string
  onFilterChange: (value: string) => void
  onOpenConversation: (id: number) => void
  onJoinRoom: (roomId: number) => void
  onStartConversation: (peerId: string) => void
  onCreateRoom: () => void
  onRename: (name: string) => void
  onShowQr: () => void
  onShowSettings: () => void
  onDeleteRoom: (room: { id: number; name: string; conversationId: number }) => void
}

const matched = (name: string | undefined, filter: string) =>
  !filter || (name ?? '').toLowerCase().includes(filter.toLowerCase())

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center px-2 pt-4 pb-1">
      <span className="flex-1 text-xs font-semibold tracking-widest text-muted-foreground">
        {title}
      </span>
      {action}
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return <p className="px-2 py-1.5 text-xs text-muted-foreground">{text}</p>
}

const rowClass = (active?: boolean) =>
  cn(
    'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
    active ? 'bg-accent' : 'hover:bg-white/[0.04]',
  )

export function AppSidebar({
  width,
  me,
  conversations,
  rooms,
  peers,
  activeId,
  filter,
  onFilterChange,
  onOpenConversation,
  onJoinRoom,
  onStartConversation,
  onCreateRoom,
  onRename,
  onShowQr,
  onShowSettings,
  onDeleteRoom,
}: AppSidebarProps) {
  const [editingName, setEditingName] = useState<string | null>(null)

  const directChats = conversations.filter(
    (c) => c.type === 'direct' && matched(c.peer?.name, filter),
  )
  const joinedRooms = conversations.filter(
    (c) => c.type === 'room' && matched(c.room?.name, filter),
  )
  const joinedRoomIds = new Set(conversations.filter((c) => c.type === 'room').map((c) => c.room?.id))
  const joinableRooms = rooms.filter((r) => !joinedRoomIds.has(r.id) && matched(r.name, filter))
  const conversationPeerIds = new Set(
    conversations.filter((c) => c.type === 'direct').map((c) => c.peer?.id),
  )
  const startablePeers = peers.filter(
    (p) => p.id !== me?.id && !conversationPeerIds.has(p.id) && matched(p.name, filter),
  )

  const saveRename = () => {
    if (editingName !== null) onRename(editingName)
    setEditingName(null)
  }

  return (
    <aside
      className={cn('flex w-full min-w-0 flex-col bg-sidebar md:shrink-0', width == null && 'md:w-[280px]')}
      style={width != null ? { width } : undefined}
    >
      <div className="border-b border-white/[0.06] p-2.5">
        <Input
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="寻找或开始新的对话"
          aria-label="搜索会话、房间与节点"
          className="h-8 rounded-lg border-none bg-rail text-sm placeholder:text-muted-foreground"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <SectionHeader title="私信" />
        {directChats.length === 0 ? (
          <EmptyHint text="暂无私信，从下方在线节点发起" />
        ) : (
          directChats.map((conv) => {
            const name = conversationName(conv)
            const preview = messagePreview(conv.lastMessage)
            return (
              <button
                key={conv.id}
                type="button"
                className={rowClass(conv.id === activeId)}
                onClick={() => onOpenConversation(conv.id)}
              >
                <UserAvatar name={name} className="size-8" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{name}</span>
                  {preview && (
                    <span className="block truncate text-xs text-muted-foreground">{preview}</span>
                  )}
                </span>
              </button>
            )
          })
        )}

        <SectionHeader
          title="房间"
          action={
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="创建房间"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={onCreateRoom}
                >
                  <PlusIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>创建房间</TooltipContent>
            </Tooltip>
          }
        />
        {joinedRooms.length === 0 && joinableRooms.length === 0 ? (
          <EmptyHint text="暂无房间，点右上角 + 创建" />
        ) : (
          <>
            {joinedRooms.map((conv) => {
              const name = conversationName(conv)
              const owned = conv.room?.createdBy != null && conv.room.createdBy === me?.id
              return (
                <div key={conv.id} className="group/room relative">
                  <button
                    type="button"
                    className={cn(rowClass(conv.id === activeId), owned && 'pr-8')}
                    onClick={() => onOpenConversation(conv.id)}
                  >
                    <HashIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {conv.room?.memberCount} 人
                    </span>
                  </button>
                  {owned && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`删除房间 ${name}`}
                          className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            conv.room &&
                            onDeleteRoom({ id: conv.room.id, name, conversationId: conv.id })
                          }
                        >
                          <TrashIcon />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>删除房间</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )
            })}
            {joinableRooms.map((room) => (
              <button
                key={room.id}
                type="button"
                className={rowClass()}
                onClick={() => onJoinRoom(room.id)}
              >
                <HashIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">{room.name}</span>
                <span className="flex shrink-0 items-center gap-0.5 text-xs text-primary">
                  <PlusIcon className="size-3" />
                  加入
                </span>
              </button>
            ))}
          </>
        )}

        <SectionHeader title="在线节点" />
        {startablePeers.length === 0 ? (
          <EmptyHint text="等待其他节点加入…" />
        ) : (
          startablePeers.map((peer) => (
            <button
              key={peer.id}
              type="button"
              className={rowClass()}
              onClick={() => onStartConversation(peer.id)}
            >
              <UserAvatar name={peer.name} online className="size-8" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{peer.name}</span>
            </button>
          ))
        )}
      </div>

      <div className="flex h-[52px] shrink-0 items-center gap-2 bg-rail px-2.5">
        <UserAvatar name={me?.name ?? '?'} online className="size-8" dotClassName="ring-rail" />
        {editingName !== null ? (
          <>
            <Input
              autoFocus
              value={editingName}
              maxLength={20}
              aria-label="编辑昵称"
              className="h-7 min-w-0 flex-1 rounded-md border-none bg-sidebar text-sm"
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveRename()
              }}
            />
            <Button variant="ghost" size="icon-xs" aria-label="保存昵称" onClick={saveRename}>
              <CheckIcon />
            </Button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{me?.name ?? '…'}</span>
              <span className="block text-xs text-online">在线</span>
            </span>
            <div className="flex shrink-0 items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="编辑昵称"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setEditingName(me?.name ?? '')}
                  >
                    <PencilIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>编辑昵称</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="设置"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={onShowSettings}
                  >
                    <SettingsIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>设置</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="存储管理"
                    className="text-muted-foreground hover:text-foreground"
                    asChild
                  >
                    <Link href="/storage">
                      <ServerIcon />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>存储管理</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="扫码加入"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={onShowQr}
                  >
                    <QrCodeIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>扫码加入</TooltipContent>
              </Tooltip>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
