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

/** 读取指定节点视角的会话列表（统一走 GET /api/conversations 公共接口断言） */
async function listConversations(peerId: string): Promise<{ id: number; lastMessage: { text: string | null } | null }[]> {
  const res = await fetch(`${app.baseUrl}/api/conversations`, { headers: { Cookie: `nw_peer=${peerId}` } })
  expect(res.status).toBe(200)
  const body = (await res.json()) as { conversations: { id: number; lastMessage: { text: string | null } | null }[] }
  return body.conversations
}

/** 以指定节点身份对会话执行「关闭私信」（DELETE） */
function hideConversation(peerId: string, conversationId: number): Promise<Response> {
  return fetch(`${app.baseUrl}/api/conversations/${conversationId}`, {
    method: 'DELETE',
    headers: { Cookie: `nw_peer=${peerId}` },
  })
}

describe('私信隐藏（从列表移除）', () => {
  it('关闭后私信从本人列表消失，对方列表保留', async () => {
    const { peerA, peerB, a, b, conversationId } = await setupDirectConversation(app)

    const res = await hideConversation(peerA, conversationId)
    expect(res.status).toBe(200)

    const mine = await listConversations(peerA)
    expect(mine.map((c) => c.id)).not.toContain(conversationId)
    const theirs = await listConversations(peerB)
    expect(theirs.map((c) => c.id)).toContain(conversationId)
    a.ws.close()
    b.ws.close()
  })

  it('对方再来新消息时，隐藏的会话带新消息重新出现并广播刷新', async () => {
    const { peerA, peerB, a, b, conversationId } = await setupDirectConversation(app)

    const hideRes = await hideConversation(peerA, conversationId)
    expect(hideRes.status).toBe(200)
    expect((await listConversations(peerA)).map((c) => c.id)).not.toContain(conversationId)

    // B 发新消息：A 的隐藏记录应被清除，并收到 conversations-updated 广播触发列表刷新
    sendWs(b.ws, { type: 'send-message', conversationId, text: '重现触发消息' })
    await b.wait('message')
    await a.wait('conversations-updated')

    const mine = await listConversations(peerA)
    const conv = mine.find((c) => c.id === conversationId)
    expect(conv).toBeDefined()
    expect(conv?.lastMessage?.text).toBe('重现触发消息')
    a.ws.close()
    b.ws.close()
  })

  it('非会话方无法隐藏该会话', async () => {
    const outsider = await createPeer(app.baseUrl)
    const { a, b, conversationId } = await setupDirectConversation(app)

    const res = await hideConversation(outsider, conversationId)
    expect(res.status).toBe(403)
    a.ws.close()
    b.ws.close()
  })

  it('本人再次发起私聊后，隐藏的会话仅对本人恢复显示（不动对方的隐藏）', async () => {
    const { peerA, peerB, a, b, conversationId } = await setupDirectConversation(app)
    // 双方各自隐藏同一会话
    expect((await hideConversation(peerA, conversationId)).status).toBe(200)
    expect((await hideConversation(peerB, conversationId)).status).toBe(200)
    expect((await listConversations(peerA)).map((c) => c.id)).not.toContain(conversationId)

    // A 从「在线节点」再次发起私聊（复用同一会话行）
    const res = await fetch(`${app.baseUrl}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `nw_peer=${peerA}` },
      body: JSON.stringify({ peerId: peerB }),
    })
    expect(res.status).toBe(200)
    const conversation = (await res.json()) as { id: number }
    expect(conversation.id).toBe(conversationId)

    // A 的列表恢复显示；B 的隐藏不受影响
    expect((await listConversations(peerA)).map((c) => c.id)).toContain(conversationId)
    expect((await listConversations(peerB)).map((c) => c.id)).not.toContain(conversationId)
    a.ws.close()
    b.ws.close()
  })

  it('房间会话不可隐藏：DELETE 返回 404 且会话仍在列表', async () => {
    const { peerA, a, b } = await setupDirectConversation(app)
    const roomRes = await fetch(`${app.baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `nw_peer=${peerA}` },
      body: JSON.stringify({ name: '不可隐藏' }),
    })
    expect(roomRes.status).toBe(200)
    const room = (await roomRes.json()) as { conversationId: number }

    const res = await hideConversation(peerA, room.conversationId)
    expect(res.status).toBe(404)
    expect((await listConversations(peerA)).map((c) => c.id)).toContain(room.conversationId)
    a.ws.close()
    b.ws.close()
  })
})
