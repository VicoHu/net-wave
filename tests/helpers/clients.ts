import WebSocket from 'ws'
import type { AppHandle } from './startApp'
import { watchMessages, type WsWaiter } from './wsEvents'

/** 经 /api/me 建立节点身份，返回 nw_peer cookie 值 */
export async function createPeer(baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/me`)
  return ((res.headers.get('set-cookie') ?? '').match(/nw_peer=([^;]+)/) ?? [])[1]
}

export function connectWs(app: AppHandle, peerId: string): Promise<{ ws: WebSocket; wait: WsWaiter }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(app.wsUrl, { headers: { Cookie: `nw_peer=${peerId}` } })
    ws.once('open', () => resolve({ ws, wait: watchMessages(ws) }))
    ws.once('error', reject)
  })
}

export function sendWs(ws: WebSocket, payload: unknown) {
  ws.send(JSON.stringify(payload))
}

/** 两人私聊的前置：身份 + WS + 会话 */
export async function setupDirectConversation(app: AppHandle) {
  const peerA = await createPeer(app.baseUrl)
  const peerB = await createPeer(app.baseUrl)
  const a = await connectWs(app, peerA)
  await a.wait('presence')
  const b = await connectWs(app, peerB)
  // 用"包含双方"而非绝对数量断言：不依赖其他测试遗留连接的清理时序
  const hasBoth = (d: { peers: { id: string }[] }) =>
    d.peers.some((p) => p.id === peerA) && d.peers.some((p) => p.id === peerB)
  await Promise.all([a.wait('presence', hasBoth), b.wait('presence', hasBoth)])

  const convRes = await fetch(`${app.baseUrl}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `nw_peer=${peerA}` },
    body: JSON.stringify({ peerId: peerB }),
  })
  if (!convRes.ok) throw new Error(`创建会话失败: HTTP ${convRes.status}`)
  const conversation = (await convRes.json()) as { id: number }
  return { peerA, peerB, a, b, conversationId: conversation.id }
}
