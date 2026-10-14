import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startApp, type AppHandle } from './helpers/startApp'
import { connectWs, createPeer, sendWs, setupDirectConversation } from './helpers/clients'

let app: AppHandle

beforeAll(async () => {
  app = await startApp()
})

afterAll(async () => {
  await app.stop()
})

/** 以某节点身份 PATCH 隐私偏好 */
const patchPrivacy = (peerId: string, body: Record<string, unknown>) =>
  fetch(`${app.baseUrl}/api/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: `nw_peer=${peerId}` },
    body: JSON.stringify(body),
  })

interface MessagePayload {
  senderIp: string | null
  senderMac: string | null
}

describe('节点网络信息隐私（隐藏 IP/MAC）', () => {
  it('默认不隐藏：消息携带 senderIp（WS 连接回填的来源地址）', async () => {
    const { peerA, a, b, conversationId } = await setupDirectConversation(app)
    const bPromise = b.wait('message')
    sendWs(a.ws, { type: 'send-message', conversationId, text: '默认可见' })
    const bGot = await bPromise
    expect(bGot.message.senderId).toBe(peerA)
    expect(bGot.message.senderIp).not.toBeNull()
    a.ws.close()
    b.ws.close()
  })

  it('PATCH /api/me 关闭后：实时消息与历史消息的 senderIp/senderMac 均为 null', async () => {
    const { peerA, peerB, a, b, conversationId } = await setupDirectConversation(app)
    const res = await patchPrivacy(peerA, { hideIp: true, hideMac: true })
    expect(res.status).toBe(200)

    const bPromise = b.wait('message')
    sendWs(a.ws, { type: 'send-message', conversationId, text: '隐私测试' })
    const bGot = await bPromise
    expect(bGot.message.text).toBe('隐私测试')
    expect((bGot.message as MessagePayload).senderIp).toBeNull()
    expect((bGot.message as MessagePayload).senderMac).toBeNull()

    const hist = await fetch(`${app.baseUrl}/api/conversations/${conversationId}/messages`, {
      headers: { Cookie: `nw_peer=${peerB}` },
    })
    expect(hist.status).toBe(200)
    const body = (await hist.json()) as { messages: MessagePayload[] }
    const sent = body.messages.find((m) => (m as { text?: string | null }).text === '隐私测试')
    expect(sent?.senderIp).toBeNull()
    expect(sent?.senderMac).toBeNull()
    a.ws.close()
    b.ws.close()
  })

  it('GET /api/me 返回 hideIp/hideMac 供本机初始化开关', async () => {
    const peerId = await createPeer(app.baseUrl)
    await patchPrivacy(peerId, { hideMac: true })
    const res = await fetch(`${app.baseUrl}/api/me`, { headers: { Cookie: `nw_peer=${peerId}` } })
    const peer = (await res.json()) as { hideIp?: boolean; hideMac?: boolean }
    expect(peer.hideIp).toBe(false)
    expect(peer.hideMac).toBe(true)
  })

  it('关闭后 presence 广播中该节点的 ip/mac 为 null', async () => {
    const peerId = await createPeer(app.baseUrl)
    const observer = await connectWs(app, peerId)
    await observer.wait('presence')

    const hidden = await createPeer(app.baseUrl)
    await patchPrivacy(hidden, { hideIp: true, hideMac: true })
    const c = await connectWs(app, hidden)
    const got = await observer.wait('presence', (d: { peers: { id: string; ip?: string | null; mac?: string | null }[] }) =>
      d.peers.some((p) => p.id === hidden),
    )
    const entry = got.peers.find((p: { id: string }) => p.id === hidden)
    expect(entry?.ip).toBeNull()
    expect(entry?.mac).toBeNull()
    observer.ws.close()
    c.ws.close()
  })
})
