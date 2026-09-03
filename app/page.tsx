'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatBoxRenderConfig, Message } from '@douyinfe/semi-ui/lib/es/chat/interface'
import { Avatar, Button, Chat, Empty, Image, Input, List, Modal, Spin, Tag, Toast, Typography } from '@douyinfe/semi-ui'
import { IconDownload, IconEdit, IconFile, IconPlus, IconQrCode, IconWifi } from '@douyinfe/semi-icons'

interface Peer {
  id: string
  name: string
}

interface FileMeta {
  id: string
  name: string
  size: number
  mime: string
  kind: 'image' | 'file'
  deleted: boolean
}

interface MessageRow {
  id: number
  conversationId: number
  senderId: string
  senderName: string
  kind: string
  text: string | null
  fileId: string | null
  file: FileMeta | null
  createdAt: number
}

interface RoomInfo {
  id: number
  name: string
  memberCount: number
  conversationId: number
}

interface ConversationSummary {
  id: number
  type: 'direct' | 'room'
  peer?: { id: string; name: string }
  room?: { id: number; name: string; memberCount: number }
  lastMessage: MessageRow | null
}

interface CenterInfo {
  lanUrl: string
  qrDataUrl: string
}

/** 从文本中提取验证码式数字串（4-8 位连续数字） */
function extractCode(text: string): string | null {
  const match = text.match(/\d{4,8}/)
  return match?.[0] ?? null
}

function formatSize(size: number): string {
  if (size >= 1024 ** 3) return `${(size / 1024 ** 3).toFixed(2)} GB`
  if (size >= 1024 ** 2) return `${(size / 1024 ** 2).toFixed(1)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${size} B`
}

/** 会话列表预览文案：文件类消息显示类型前缀 */
function messagePreview(m: MessageRow | null): string {
  if (!m) return ''
  if (m.kind === 'image') return `[图片] ${m.file?.name ?? ''}`
  if (m.kind === 'file') return `[文件] ${m.file?.name ?? ''}`
  return m.text ?? ''
}

/** 文件消息卡片：XHR 下载以获得实时进度；被删除文件明确提示不可下载 */
function FileCard({ file }: { file: FileMeta }) {
  const [progress, setProgress] = useState<number | null>(null)

  const download = () => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', `/api/files/${file.id}`)
    xhr.responseType = 'blob'
    xhr.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status === 200) {
        const url = URL.createObjectURL(xhr.response)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        a.click()
        URL.revokeObjectURL(url)
      } else if (xhr.status === 410) {
        Toast.error('文件已被删除，无法下载')
      } else {
        Toast.error('下载失败')
      }
      setProgress(null)
    }
    xhr.onerror = () => {
      Toast.error('下载失败')
      setProgress(null)
    }
    xhr.send()
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        border: '1px solid var(--semi-color-border)',
        borderRadius: 8,
        minWidth: 220,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          background: 'var(--semi-color-primary-light-default)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <IconFile />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
        <Typography.Text type="tertiary" size="small">
          {formatSize(file.size)}
        </Typography.Text>
      </div>
      {file.deleted ? (
        <Tag color="red" size="small">
          已删除
        </Tag>
      ) : (
        <Button
          size="small"
          icon={<IconDownload />}
          loading={progress != null}
          onClick={download}
        >
          {progress != null ? `${progress}%` : '下载'}
        </Button>
      )}
    </div>
  )
}

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
  const isMobile = useIsMobile()
  const [me, setMe] = useState<Peer | null>(null)
  const [peers, setPeers] = useState<Peer[]>([])
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [rooms, setRooms] = useState<RoomInfo[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [centerInfo, setCenterInfo] = useState<CenterInfo | null>(null)
  const [qrVisible, setQrVisible] = useState(false)
  const [roomModalVisible, setRoomModalVisible] = useState(false)
  const [roomNameInput, setRoomNameInput] = useState('')
  const [editingName, setEditingName] = useState('')
  const [loadingMessages, setLoadingMessages] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const activeIdRef = useRef<number | null>(null)

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

  const openConversation = useCallback(async (id: number) => {
    setActiveId(id)
    activeIdRef.current = id
    setLoadingMessages(true)
    const res = await fetch(`/api/conversations/${id}/messages`)
    if (res.ok) {
      const body = (await res.json()) as { messages: MessageRow[] }
      setMessages(body.messages)
    }
    setLoadingMessages(false)
  }, [])

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
      Toast.error('创建会话失败')
      return
    }
    const conversation = (await res.json()) as { id: number }
    await loadConversations()
    await openConversation(conversation.id)
  }

  const createRoom = async () => {
    const name = roomNameInput.trim()
    if (!name) return
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) {
      Toast.error('创建房间失败（名称需 1-50 字符）')
      return
    }
    const room = (await res.json()) as RoomInfo
    setRoomModalVisible(false)
    setRoomNameInput('')
    await Promise.all([loadRooms(), loadConversations()])
    await openConversation(room.conversationId)
  }

  const joinRoom = async (roomId: number) => {
    const res = await fetch(`/api/rooms/${roomId}/join`, { method: 'POST' })
    if (!res.ok) {
      Toast.error('加入房间失败')
      return
    }
    const room = (await res.json()) as RoomInfo
    await Promise.all([loadRooms(), loadConversations()])
    await openConversation(room.conversationId)
  }

  const saveName = async () => {
    if (!editingName.trim() || !me) return
    const res = await fetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editingName.trim() }),
    })
    if (res.ok) {
      setMe({ ...me, name: editingName.trim() })
      setEditingName('')
      Toast.success('昵称已更新')
    } else {
      Toast.error('昵称更新失败')
    }
  }

  const sendMessage = (text: string, attachments: { status?: string; response?: unknown }[] = []) => {
    if (!activeId || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    // 文本与附件分条发送：每条消息在气泡流中独立呈现
    const trimmed = text.trim()
    if (trimmed) {
      wsRef.current.send(JSON.stringify({ type: 'send-message', conversationId: activeId, text: trimmed }))
    }
    for (const att of attachments) {
      let response = att.response
      if (typeof response === 'string') {
        try {
          response = JSON.parse(response)
        } catch {
          response = null
        }
      }
      const fileId = (response as { fileId?: string } | null)?.fileId
      if (att.status === 'success' && fileId) {
        wsRef.current.send(JSON.stringify({ type: 'send-message', conversationId: activeId, fileId }))
      }
    }
  }

  // 验证码复制辅助：secure context 一键复制，否则降级为选中全文
  const copyCode = async (code: string, container: HTMLElement | null) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(code)
      Toast.success(`已复制 ${code}`)
      return
    }
    if (container) {
      const range = document.createRange()
      range.selectNodeContents(container)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      Toast.info('已全选，请长按/右键复制')
    }
  }

  const chatBoxRenderConfig: ChatBoxRenderConfig = {
    // 房间多人会话下按消息显示发送者昵称（私聊与 roleConfig 一致）
    renderChatBoxTitle: ({ message, defaultTitle }) => ((message?.name as string | undefined) ?? defaultTitle) as React.ReactNode,
    renderChatBoxContent: ({
      message,
      defaultContent,
    }: {
      message?: Message
      defaultContent?: React.ReactNode
    }) => {
      const contents = message && Array.isArray(message.content) ? message.content : null
      const image = contents?.find((c: NonNullable<typeof contents>[number]) => c.type === 'image_url')
      const file = contents?.find((c: NonNullable<typeof contents>[number]) => c.type === 'file_url')
      if (image && image.type === 'image_url' && image.image_url) {
        // 内联缩略图；Semi Image 点击即弹出大图预览
        return (
          <Image
            src={image.image_url.url}
            alt={(message?.nwFile as FileMeta | undefined)?.name ?? '图片消息'}
            width={240}
            style={{ borderRadius: 8, maxWidth: '100%' }}
          />
        )
      }
      if (file && file.type === 'file_url' && message?.nwFile) {
        return <FileCard file={message.nwFile as FileMeta} />
      }
      const code = typeof message?.content === 'string' ? extractCode(message.content) : null
      return (
        <div>
          <span className="nw-message-text">{defaultContent}</span>
          {code && (
            <Button
              size="small"
              theme="borderless"
              style={{ marginLeft: 8, verticalAlign: 'middle' }}
              onClick={(e) => void copyCode(code, (e.currentTarget.closest('.nw-message-text') as HTMLElement) ?? null)}
            >
              复制 {code}
            </Button>
          )}
        </div>
      )
    },
  }

  const chats: Message[] = useMemo(
    () =>
      messages.map((m) => {
        const base = {
          role: m.senderId === me?.id ? 'user' : 'assistant',
          name: m.senderId === me?.id ? (me?.name ?? '我') : m.senderName,
          id: String(m.id),
          createAt: m.createdAt,
          // 附件元数据随消息传递，供自定义渲染使用
          nwFile: m.file,
        } as Message
        if (m.kind === 'image' && m.file) {
          return { ...base, content: [{ type: 'image_url', image_url: { url: `/api/files/${m.file.id}` } }] }
        }
        if (m.kind === 'file' && m.file) {
          return {
            ...base,
            content: [{ type: 'file_url', file_url: { url: `/api/files/${m.file.id}`, name: m.file.name, size: formatSize(m.file.size), type: m.file.mime } }],
          }
        }
        return { ...base, content: m.text ?? '' }
      }),
    [messages, me],
  )

  const conversationPeerIds = new Set(conversations.filter((c) => c.type === 'direct').map((c) => c.peer?.id))
  const joinedRoomIds = new Set(conversations.filter((c) => c.type === 'room').map((c) => c.room?.id))
  const startablePeers = peers.filter((p) => p.id !== me?.id && !conversationPeerIds.has(p.id))
  const joinableRooms = rooms.filter((r) => !joinedRoomIds.has(r.id))

  const showSidebar = !isMobile || activeId === null
  const showChat = !isMobile || activeId !== null

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--semi-color-bg-0)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 20px',
          background: 'var(--semi-color-bg-1)',
          borderBottom: '1px solid var(--semi-color-border)',
          flexShrink: 0,
        }}
      >
        {isMobile && activeId !== null && (
          <Button theme="borderless" onClick={() => setActiveId(null)}>
            返回
          </Button>
        )}
        <IconWifi size="large" />
        <Typography.Title heading={5} style={{ margin: 0 }}>
          net-wave
        </Typography.Title>
        <div style={{ flex: 1 }} />
        {me && !editingName && (
          <>
            <Typography.Text strong>{me.name}</Typography.Text>
            <Button icon={<IconEdit />} size="small" theme="borderless" onClick={() => setEditingName(me.name)} />
          </>
        )}
        {me && editingName !== '' && (
          <>
            <Input size="small" style={{ width: 140 }} value={editingName} onChange={setEditingName} maxLength={20} />
            <Button size="small" theme="solid" onClick={() => void saveName()}>
              保存
            </Button>
          </>
        )}
        <Button icon={<IconQrCode />} size="small" theme="borderless" onClick={() => setQrVisible(true)}>
          扫码加入
        </Button>
      </header>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {showSidebar && (
          <aside
            style={{
              width: isMobile ? '100%' : 280,
              borderRight: isMobile ? 'none' : '1px solid var(--semi-color-border)',
              overflowY: 'auto',
              background: 'var(--semi-color-bg-1)',
              padding: 12,
              boxSizing: 'border-box',
            }}
          >
            <Typography.Title heading={6} style={{ marginBottom: 8, display: 'flex', alignItems: 'center' }}>
              <span style={{ flex: 1 }}>会话</span>
              <Button size="small" theme="borderless" icon={<IconPlus />} onClick={() => setRoomModalVisible(true)}>
                建房
              </Button>
            </Typography.Title>
            <List
              dataSource={conversations}
              emptyContent={<Empty description="暂无会话，从下方房间或在线节点开始" />}
              renderItem={(conv) => (
                <List.Item
                  style={{
                    cursor: 'pointer',
                    borderRadius: 8,
                    background: conv.id === activeId ? 'var(--semi-color-primary-light-default)' : undefined,
                  }}
                  main={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }} onClick={() => void openConversation(conv.id)}>
                      {conv.type === 'room' ? (
                        <Avatar size="small" color="violet" style={{ flexShrink: 0 }}>
                          {conv.room?.name.slice(0, 1)}
                        </Avatar>
                      ) : (
                        <Avatar size="small" color="blue" style={{ flexShrink: 0 }}>
                          {conv.peer?.name.slice(-1)}
                        </Avatar>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {conv.type === 'room' ? conv.room?.name : conv.peer?.name}
                          </span>
                          {conv.type === 'room' && (
                            <Tag size="small" color="violet">
                              {conv.room?.memberCount} 人
                            </Tag>
                          )}
                        </div>
                        <Typography.Text type="tertiary" size="small" ellipsis={{ showTooltip: false }} style={{ maxWidth: 160 }}>
                          {messagePreview(conv.lastMessage)}
                        </Typography.Text>
                      </div>
                    </div>
                  }
                />
              )}
            />

            <Typography.Title heading={6} style={{ margin: '16px 0 8px' }}>
              房间
            </Typography.Title>
            <List
              dataSource={joinableRooms}
              emptyContent={<Typography.Text type="tertiary" size="small">暂无可加入的公开房间</Typography.Text>}
              renderItem={(room) => (
                <List.Item
                  style={{ cursor: 'pointer', borderRadius: 8 }}
                  main={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} onClick={() => void joinRoom(room.id)}>
                      <Avatar size="small" color="violet" style={{ flexShrink: 0 }}>
                        {room.name.slice(0, 1)}
                      </Avatar>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.name}</span>
                      <Tag size="small">{room.memberCount} 人</Tag>
                      <Tag size="small" color="cyan">
                        加入
                      </Tag>
                    </div>
                  }
                />
              )}
            />

            <Typography.Title heading={6} style={{ margin: '16px 0 8px' }}>
              在线节点
            </Typography.Title>
            <List
              dataSource={startablePeers}
              emptyContent={<Typography.Text type="tertiary" size="small">等待其他设备加入…</Typography.Text>}
              renderItem={(peer) => (
                <List.Item
                  style={{ cursor: 'pointer', borderRadius: 8 }}
                  main={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} onClick={() => void startConversationWith(peer.id)}>
                      <Avatar size="small" color="green">
                        {peer.name.slice(-1)}
                      </Avatar>
                      <span>{peer.name}</span>
                      <Tag size="small">发起私聊</Tag>
                    </div>
                  }
                />
              )}
            />
          </aside>
        )}

        {showChat && (
          <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {activeConversation ? (
              <>
                <div
                  style={{
                    padding: '10px 20px',
                    borderBottom: '1px solid var(--semi-color-border)',
                    background: 'var(--semi-color-bg-1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  {activeConversation.type === 'room' ? (
                    <>
                      <Avatar size="extra-small" color="violet">
                        {activeConversation.room?.name.slice(0, 1)}
                      </Avatar>
                      <Typography.Text strong>{activeConversation.room?.name}</Typography.Text>
                      <Typography.Text type="tertiary" size="small">
                        {activeConversation.room?.memberCount} 人
                      </Typography.Text>
                    </>
                  ) : (
                    <>
                      <Avatar size="extra-small" color="blue">
                        {activeConversation.peer?.name.slice(-1)}
                      </Avatar>
                      <Typography.Text strong>{activeConversation.peer?.name}</Typography.Text>
                    </>
                  )}
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <Chat
                    key={activeConversation.id}
                    chats={chats}
                    onMessageSend={(content: string, attachment: { status?: string; response?: unknown }[]) =>
                      sendMessage(content, attachment)
                    }
                    enableUpload
                    uploadProps={{ action: '/api/files', name: 'file' }}
                    roleConfig={{
                      user: {
                        name: me?.name ?? '我',
                        avatar: <Avatar color="amber">{me?.name.slice(-1) ?? '我'}</Avatar>,
                      },
                      assistant:
                        activeConversation.type === 'room'
                          ? {
                              name: activeConversation.room?.name ?? '房间',
                              avatar: <Avatar color="violet">{activeConversation.room?.name.slice(0, 1) ?? '房'}</Avatar>,
                            }
                          : {
                              name: activeConversation.peer?.name ?? '对方',
                              avatar: <Avatar color="blue">{activeConversation.peer?.name.slice(-1) ?? '?'}</Avatar>,
                            },
                    }}
                    chatBoxRenderConfig={chatBoxRenderConfig}
                    placeholder="输入消息，Enter 发送…"
                    style={{ height: '100%' }}
                  />
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Empty description="选择一个会话或从在线节点发起私聊" />
              </div>
            )}
            {loadingMessages && (
              <div style={{ position: 'absolute', top: 80, left: '50%' }}>
                <Spin />
              </div>
            )}
          </main>
        )}
      </div>

      <Modal
        title="创建房间"
        visible={roomModalVisible}
        onCancel={() => setRoomModalVisible(false)}
        onOk={() => void createRoom()}
        okText="创建并进入"
        centered
      >
        <Input
          placeholder="房间名称（1-50 字符）"
          value={roomNameInput}
          onChange={setRoomNameInput}
          maxLength={50}
          onEnterPress={() => void createRoom()}
          autoFocus
        />
      </Modal>

      <Modal
        title="手机扫码加入"
        visible={qrVisible}
        onCancel={() => setQrVisible(false)}
        footer={null}
        centered
      >
        {centerInfo && (
          <div style={{ textAlign: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={centerInfo.qrDataUrl} alt="服务中心二维码" style={{ width: 220, height: 220 }} />
            <Typography.Paragraph copyable style={{ marginTop: 8 }}>
              {centerInfo.lanUrl}
            </Typography.Paragraph>
          </div>
        )}
      </Modal>
    </div>
  )
}
