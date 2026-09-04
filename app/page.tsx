'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeftIcon, HashIcon, WavesIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@components/ui/empty'
import { AppRail } from './components/app-rail'
import { AppSidebar } from './components/app-sidebar'
import { ChatInput } from './components/chat-input'
import { ConversationInfo } from './components/conversation-info'
import { CreateRoomDialog, QrDialog } from './components/dialogs'
import { MessageList } from './components/message-list'
import { UserAvatar } from './components/user-avatar'
import { cn } from '@lib/utils'
import { conversationName, type MessageRow } from './message-view'
import type { ConversationSummary, CenterInfo, Peer, RoomInfo } from './types'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return isMobile
}

export default function Home() {
  // useSearchParams 需 Suspense 包裹以满足 SSR 边界要求
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  )
}

function HomeInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isMobile = useIsMobile()
  const [me, setMe] = useState<Peer | null>(null)
  const [peers, setPeers] = useState<Peer[]>([])
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [rooms, setRooms] = useState<RoomInfo[]>([])
  const [unreadFlash, setUnreadFlash] = useState(false)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [centerInfo, setCenterInfo] = useState<CenterInfo | null>(null)
  const [qrVisible, setQrVisible] = useState(false)
  const [roomModalVisible, setRoomModalVisible] = useState(false)
  const [filter, setFilter] = useState('')
  const [loadingMessages, setLoadingMessages] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const activeIdRef = useRef<number | null>(null)
  const meRef = useRef<Peer | null>(null)
  meRef.current = me

  // 当前会话由 URL ?c=<id> 驱动：移动端单栏切换获得浏览器返回键支持，且可直达深链
  const activeParam = searchParams.get('c')
  const activeId = activeParam && /^\d+$/.test(activeParam) ? Number(activeParam) : null
  activeIdRef.current = activeId

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  )

  const loadConversations = useCallback(async () => {
    const res = await fetch('/api/conversations')
    if (!res.ok) return
    const body = (await res.json()) as { conversations: ConversationSummary[] }
    setConversations(body.conversations)
  }, [])

  const loadRooms = useCallback(async () => {
    const res = await fetch('/api/rooms')
    if (!res.ok) return
    const body = (await res.json()) as { rooms: RoomInfo[] }
    setRooms(body.rooms)
  }, [])

  const openConversation = useCallback(
    (id: number) => {
      router.push(`/?c=${id}`)
    },
    [router],
  )

  // 会话切换由 URL 驱动：进入即拉取该会话历史
  useEffect(() => {
    if (activeId == null) {
      setMessages([])
      return
    }
    let cancelled = false
    setLoadingMessages(true)
    void (async () => {
      const res = await fetch(`/api/conversations/${activeId}/messages`)
      if (!cancelled && res.ok) {
        const body = (await res.json()) as { messages: MessageRow[] }
        setMessages(body.messages)
      }
      if (!cancelled) setLoadingMessages(false)
    })()
    return () => {
      cancelled = true
    }
  }, [activeId])

  /** 重新拉取当前打开会话的消息（离线补投递：断线重连后新消息自动出现） */
  const refreshActiveMessages = useCallback(async () => {
    const current = activeIdRef.current
    if (current == null) return
    const res = await fetch(`/api/conversations/${current}/messages`)
    if (!res.ok) return
    const body = (await res.json()) as { messages: MessageRow[] }
    setMessages(body.messages)
  }, [])

  const connectWs = useCallback(() => {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${location.host}/ws`)
    wsRef.current = ws
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data as string)
      if (data.type === 'presence') {
        setPeers(data.peers as Peer[])
      } else if (data.type === 'message') {
        const message = data.message as MessageRow
        if (message.conversationId === activeIdRef.current) {
          setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]))
        }
        // 页面不可见时收到他人消息：标题闪烁直至回到页面
        if (message.senderId !== meRef.current?.id && document.hidden) {
          setUnreadFlash(true)
        }
        void loadConversations()
      } else if (data.type === 'conversations-updated') {
        void loadConversations()
        void refreshActiveMessages()
      } else if (data.type === 'rooms-updated') {
        void loadRooms()
      }
    }
    ws.onclose = () => {
      setTimeout(connectWs, 3000)
    }
  }, [loadConversations, loadRooms, refreshActiveMessages])

  // 页内提醒：离开页面期间的新消息让标题在「新消息」与原标题间交替，回到页面即恢复
  useEffect(() => {
    if (!unreadFlash) return
    let on = false
    const timer = setInterval(() => {
      on = !on
      document.title = on ? '【新消息】net-wave' : 'net-wave'
    }, 1000)
    const stop = () => setUnreadFlash(false)
    const onVisible = () => {
      if (!document.hidden) stop()
    }
    window.addEventListener('focus', stop)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.title = 'net-wave'
      window.removeEventListener('focus', stop)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [unreadFlash])

  useEffect(() => {
    void (async () => {
      const meRes = await fetch('/api/me')
      setMe((await meRes.json()) as Peer)
      connectWs()
      void loadConversations()
      void loadRooms()
      const infoRes = await fetch('/api/center-info')
      setCenterInfo((await infoRes.json()) as CenterInfo)
    })()
    return () => {
      wsRef.current?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startConversationWith = async (peerId: string) => {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ peerId }),
    })
    if (!res.ok) {
      toast.error('创建会话失败')
      return
    }
    const conversation = (await res.json()) as { id: number }
    await loadConversations()
    openConversation(conversation.id)
  }

  const createRoom = async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    if (!res.ok) {
      toast.error('创建房间失败（名称需 1-50 字符）')
      return
    }
    const room = (await res.json()) as RoomInfo
    setRoomModalVisible(false)
    await Promise.all([loadRooms(), loadConversations()])
    openConversation(room.conversationId)
  }

  const joinRoom = async (roomId: number) => {
    const res = await fetch(`/api/rooms/${roomId}/join`, { method: 'POST' })
    if (!res.ok) {
      toast.error('加入房间失败')
      return
    }
    const room = (await res.json()) as RoomInfo
    await Promise.all([loadRooms(), loadConversations()])
    openConversation(room.conversationId)
  }

  const rename = async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || !me) return
    const res = await fetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    if (res.ok) {
      setMe({ ...me, name: trimmed })
      toast.success('昵称已更新')
    } else {
      toast.error('昵称更新失败')
    }
  }

  const sendMessage = (payload: { text: string } | { fileId: string }) => {
    if (!activeId || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'send-message', conversationId: activeId, ...payload }))
  }

  const showList = !isMobile || activeId === null
  const showChat = !isMobile || activeId !== null

  return (
    <div className="flex h-dvh overflow-hidden">
      <AppRail onCreateRoom={() => setRoomModalVisible(true)} />

      <div className={cn('flex min-w-0 flex-1 md:flex-none', !showList && 'hidden')}>
        <AppSidebar
          me={me}
          conversations={conversations}
          rooms={rooms}
          peers={peers}
          activeId={activeId}
          filter={filter}
          onFilterChange={setFilter}
          onOpenConversation={(id) => void openConversation(id)}
          onJoinRoom={(id) => void joinRoom(id)}
          onStartConversation={(id) => void startConversationWith(id)}
          onCreateRoom={() => setRoomModalVisible(true)}
          onRename={(name) => void rename(name)}
          onShowQr={() => setQrVisible(true)}
        />
      </div>

      <main className={cn('flex min-w-0 flex-1 flex-col', !showChat && 'hidden')}>
        {activeConversation ? (
          <>
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 md:px-4">
              {isMobile && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="返回会话列表"
                  onClick={() => router.push('/')}
                >
                  <ArrowLeftIcon />
                </Button>
              )}
              {activeConversation.type === 'room' ? (
                <>
                  <HashIcon className="size-5 shrink-0 text-muted-foreground" />
                  <h1 className="truncate font-semibold">{conversationName(activeConversation)}</h1>
                  <span className="hidden shrink-0 text-sm text-muted-foreground sm:inline">
                    {activeConversation.room?.memberCount} 名成员
                  </span>
                </>
              ) : (
                <>
                  <UserAvatar
                    name={conversationName(activeConversation)}
                    className="size-6"
                    dotClassName="ring-chat"
                  />
                  <h1 className="truncate font-semibold">{conversationName(activeConversation)}</h1>
                </>
              )}
            </header>
            <MessageList
              messages={messages}
              loading={loadingMessages}
              emptyContent={
                <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
                  还没有消息，打个招呼吧
                </div>
              }
            />
            <ChatInput
              placeholder={
                activeConversation.type === 'room'
                  ? `发送消息到 ${conversationName(activeConversation)}`
                  : `发送消息给 ${conversationName(activeConversation)}`
              }
              onSendText={(text) => sendMessage({ text })}
              onSendFile={(fileId) => sendMessage({ fileId })}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <Empty className="border-none">
              <EmptyHeader>
                <EmptyMedia
                  variant="icon"
                  className="size-16 rounded-2xl bg-primary text-white [&_svg:not([class*='size-'])]:size-8"
                >
                  <WavesIcon />
                </EmptyMedia>
                <EmptyTitle>欢迎来到 net-wave</EmptyTitle>
                <EmptyDescription>
                  从左侧选择一个会话，或在「在线节点」里发起私聊；也可以创建一个房间招呼大家。
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <div className="flex justify-center gap-2">
                  <Button onClick={() => setRoomModalVisible(true)}>创建房间</Button>
                  <Button variant="secondary" onClick={() => setQrVisible(true)}>
                    扫码加入
                  </Button>
                </div>
              </EmptyContent>
            </Empty>
          </div>
        )}
      </main>

      {activeConversation && <ConversationInfo conversation={activeConversation} />}

      <CreateRoomDialog
        visible={roomModalVisible}
        onOpenChange={setRoomModalVisible}
        onSubmit={(name) => void createRoom(name)}
      />
      <QrDialog visible={qrVisible} onOpenChange={setQrVisible} centerInfo={centerInfo} />
    </div>
  )
}
