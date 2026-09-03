import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { startApp, type AppHandle } from './helpers/startApp'
import { watchMessages, type WsWaiter } from './helpers/wsEvents'

let app: AppHandle

interface ChatMessageRow {
  id: number
  conversationId: number
  senderId: string
  kind: string
  text: string | null
  createdAt: number
}

async function createPeer(): Promise<string> {
  const res = await fetch(`${app.baseUrl}/api/me`)
  return ((res.headers.get('set-cookie') ?? '').match(/nw_peer=([^;]+)/) ?? [])[1]
}

function connectWs(peerId: string): Promise<{ ws: WebSocket; wait: WsWaiter }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(app.wsUrl, { headers: { Cookie: `nw_peer=${peerId}` } })
    ws.once('open', () => resolve({ ws, wait: watchMessages(ws) }))
    ws.once('error', reject)
  })
}

function sendWs(ws: WebSocket, payload: unknown) {
  ws.send(JSON.stringify(payload))
}

/** 建立两人私聊所需的全部前置：身份 + WS + 会话 */
async function setupDirectConversation() {
  const peerA = await createPeer()
  const peerB = await createPeer()
  const a = await connectWs(peerA)
  await a.wait('presence')
  const b = await connectWs(peerB)
  // 用"包含双方"而非绝对数量断言：不依赖其他测试遗留连接的清理时序
  const hasBoth = (d: { peers: { id: string }[] }) =>
    d.peers.some((p) => p.id === peerA) && d.peers.some((p) => p.id === peerB)
  await Promise.all([a.wait('presence', hasBoth), b.wait('presence', hasBoth)])

  const convRes = await fetch(`${app.baseUrl}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `nw_peer=${peerA}` },
    body: JSON.stringify({ peerId: peerB }),
  })
  expect(convRes.status).toBe(200)
  const conversation = (await convRes.json()) as { id: number }
  return { peerA, peerB, a, b, conversationId: conversation.id }
}

beforeAll(async () => {
  app = await startApp()
})

afterAll(async () => {
  await app.stop()
})

describe('点对点文本私聊', () => {
  it('发送文本：双方实时收到 message 事件', async () => {
    const { peerA, a, b, conversationId } = await setupDirectConversation()

    const aPromise = a.wait('message')
    const bPromise = b.wait('message')
    sendWs(a.ws, { type: 'send-message', conversationId, text: '验证码 830291' })

    const [aGot, bGot] = await Promise.all([aPromise, bPromise])
    expect(aGot.message.text).toBe('验证码 830291')
    expect(aGot.message.senderId).toBe(peerA)
    expect(bGot.message.text).toBe('验证码 830291')
    expect(bGot.message.senderId).toBe(peerA)
    a.ws.close()
    b.ws.close()
  })

  it('历史拉取：GET messages 返回已发送消息', async () => {
    const { peerB, a, conversationId } = await setupDirectConversation()
    sendWs(a.ws, { type: 'send-message', conversationId, text: '历史消息测试' })
    await a.wait('message')
    a.ws.close()

    const res = await fetch(`${app.baseUrl}/api/conversations/${conversationId}/messages`, {
      headers: { Cookie: `nw_peer=${peerB}` },
    })
    expect(res.status).toBe(200)
    const messages = (await res.json()) as { messages: ChatMessageRow[] }
    expect(messages.messages.map((m) => m.text)).toContain('历史消息测试')
  })

  it('非会话方的拉取被拒绝', async () => {
    const outsider = await createPeer()
    const { conversationId } = await setupDirectConversation()
    const res = await fetch(`${app.baseUrl}/api/conversations/${conversationId}/messages`, {
      headers: { Cookie: `nw_peer=${outsider}` },
    })
    expect(res.status).toBe(403)
  })

  it('会话列表：包含对方信息与最后一条消息', async () => {
    const { peerA, peerB, a, conversationId } = await setupDirectConversation()
    sendWs(a.ws, { type: 'send-message', conversationId, text: '最后一条预览' })
    await a.wait('message')
    a.ws.close()

    const res = await fetch(`${app.baseUrl}/api/conversations`, { headers: { Cookie: `nw_peer=${peerB}` } })
    const body = (await res.json()) as {
      conversations: { id: number; peer: { id: string }; lastMessage: { text: string | null } | null }[]
    }
    const conv = body.conversations.find((c) => c.id === conversationId)
    expect(conv?.peer.id).toBe(peerA)
    expect(conv?.lastMessage?.text).toBe('最后一条预览')
  })

  it('持久化：服务中心重启后历史完整', async () => {
    const { peerA, peerB, a, conversationId } = await setupDirectConversation()
    sendWs(a.ws, { type: 'send-message', conversationId, text: '重启前的消息' })
    await a.wait('message')
    a.ws.close()
    await app.stop()

    // 同一数据目录重启实例
    app = await startApp({ dataDir: app.dataDir })
    const res = await fetch(`${app.baseUrl}/api/conversations/${conversationId}/messages`, {
      headers: { Cookie: `nw_peer=${peerB}` },
    })
    const messages = (await res.json()) as { messages: ChatMessageRow[] }
    expect(messages.messages.map((m) => m.text)).toContain('重启前的消息')
  })

  it('离线补投递：对方上线后收到通知并拉到新消息', async () => {
    const { peerA, peerB, a, b, conversationId } = await setupDirectConversation()
    // B 下线后 A 发消息
    b.ws.close()
    await new Promise((r) => setTimeout(r, 200))
    sendWs(a.ws, { type: 'send-message', conversationId, text: '离线期间的消息' })
    await a.wait('message')

    // B 重新上线
    const b2 = await connectWs(peerB)
    await b2.wait('conversations-updated')
    const res = await fetch(`${app.baseUrl}/api/conversations/${conversationId}/messages`, {
      headers: { Cookie: `nw_peer=${peerB}` },
    })
    const messages = (await res.json()) as { messages: ChatMessageRow[] }
    expect(messages.messages.map((m) => m.text)).toContain('离线期间的消息')
    a.ws.close()
    b2.ws.close()
  })
})
