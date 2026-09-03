'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatBoxRenderConfig, Message } from '@douyinfe/semi-ui/lib/es/chat/interface'
import { Avatar, Button, Chat, Empty, Input, List, Modal, Spin, Tag, Toast, Typography } from '@douyinfe/semi-ui'
import { IconEdit, IconQrCode, IconWifi } from '@douyinfe/semi-icons'

interface Peer {
  id: string
  name: string
}

interface MessageRow {
  id: number
  conversationId: number
  senderId: string
  kind: string
  text: string | null
  createdAt: number
}

interface ConversationSummary {
  id: number
  peer: Peer
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
  const [activeId, setActiveId] = useState<number | null>(null)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [centerInfo, setCenterInfo] = useState<CenterInfo | null>(null)
  const [qrVisible, setQrVisible] = useState(false)
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
      }
    }
    ws.onclose = () => {
      setTimeout(connectWs, 3000)
    }
  }, [loadConversations, refreshActiveMessages])

  useEffect(() => {
    void (async () => {
      const meRes = await fetch('/api/me')
      setMe((await meRes.json()) as Peer)
      connectWs()
      void loadConversations()
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

  const sendMessage = (text: string) => {
    if (!activeId || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'send-message', conversationId: activeId, text }))
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
    renderChatBoxContent: ({
      message,
      defaultContent,
    }: {
      message?: Message
      defaultContent?: React.ReactNode
    }) => {
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
      messages.map((m) => ({
        role: m.senderId === me?.id ? 'user' : 'assistant',
        id: String(m.id),
        createAt: m.createdAt,
        content: m.text ?? '',
      })),
    [messages, me],
  )

  const conversationPeerIds = new Set(conversations.map((c) => c.peer.id))
  const startablePeers = peers.filter((p) => p.id !== me?.id && !conversationPeerIds.has(p.id))

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
            <Typography.Title heading={6} style={{ marginBottom: 8 }}>
              会话
            </Typography.Title>
            <List
              dataSource={conversations}
              emptyContent={<Empty description="暂无会话，从下方在线节点开始" />}
              renderItem={(conv) => (
                <List.Item
                  style={{
                    cursor: 'pointer',
                    borderRadius: 8,
                    background: conv.id === activeId ? 'var(--semi-color-primary-light-default)' : undefined,
                  }}
                  main={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }} onClick={() => void openConversation(conv.id)}>
                      <Avatar size="small" color="blue">
                        {conv.peer.name.slice(-1)}
                      </Avatar>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{conv.peer.name}</div>
                        <Typography.Text type="tertiary" size="small" ellipsis={{ showTooltip: false }} style={{ maxWidth: 160 }}>
                          {conv.lastMessage?.text ?? ''}
                        </Typography.Text>
                      </div>
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
                  <Avatar size="extra-small" color="blue">
                    {activeConversation.peer.name.slice(-1)}
                  </Avatar>
                  <Typography.Text strong>{activeConversation.peer.name}</Typography.Text>
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <Chat
                    key={activeConversation.id}
                    chats={chats}
                    onMessageSend={(content: string) => sendMessage(content)}
                    roleConfig={{
                      user: {
                        name: me?.name ?? '我',
                        avatar: <Avatar color="amber">{me?.name.slice(-1) ?? '我'}</Avatar>,
                      },
                      assistant: {
                        name: activeConversation.peer.name,
                        avatar: <Avatar color="blue">{activeConversation.peer.name.slice(-1)}</Avatar>,
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
