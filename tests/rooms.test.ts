import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startApp, type AppHandle } from './helpers/startApp'
import { connectWs, createPeer, sendWs } from './helpers/clients'

let app: AppHandle

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
  lastMessage: { text: string | null; kind: string } | null
}

async function createRoom(peerId: string, name: string): Promise<RoomInfo> {
  const res = await fetch(`${app.baseUrl}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `nw_peer=${peerId}` },
    body: JSON.stringify({ name }),
  })
  expect(res.status).toBe(200)
  return (await res.json()) as RoomInfo
}

async function joinRoom(peerId: string, roomId: number) {
  const res = await fetch(`${app.baseUrl}/api/rooms/${roomId}/join`, {
    method: 'POST',
    headers: { Cookie: `nw_peer=${peerId}` },
  })
  expect(res.status).toBe(200)
}

async function listRooms(peerId: string): Promise<RoomInfo[]> {
  const res = await fetch(`${app.baseUrl}/api/rooms`, { headers: { Cookie: `nw_peer=${peerId}` } })
  expect(res.status).toBe(200)
  return ((await res.json()) as { rooms: RoomInfo[] }).rooms
}

beforeAll(async () => {
  app = await startApp()
})

afterAll(async () => {
  await app.stop()
})

describe('多人房间', () => {
  it('创建房间：出现在公开列表且建房者自动加入', async () => {
    const owner = await createPeer(app.baseUrl)
    const room = await createRoom(owner, '项目讨论组')
    expect(room.name).toBe('项目讨论组')
    expect(room.memberCount).toBe(1)
    expect(room.conversationId).toBeGreaterThan(0)

    const rooms = await listRooms(await createPeer(app.baseUrl))
    const listed = rooms.find((r) => r.id === room.id)
    expect(listed?.name).toBe('项目讨论组')
    expect(listed?.memberCount).toBe(1)
  })

  it('建房校验：空名/超长名被拒绝', async () => {
    const owner = await createPeer(app.baseUrl)
    const bad = await fetch(`${app.baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `nw_peer=${owner}` },
      body: JSON.stringify({ name: '  ' }),
    })
    expect(bad.status).toBe(400)

    const tooLong = await fetch(`${app.baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `nw_peer=${owner}` },
      body: JSON.stringify({ name: 'x'.repeat(51) }),
    })
    expect(tooLong.status).toBe(400)
  })

  it('三人群聊：加入后消息全员实时到达', async () => {
    const owner = await createPeer(app.baseUrl)
    const room = await createRoom(owner, '三人群')
    const p2 = await createPeer(app.baseUrl)
    const p3 = await createPeer(app.baseUrl)
    await joinRoom(p2, room.id)
    await joinRoom(p3, room.id)

    const a = await connectWs(app, owner)
    await a.wait('presence')
    const b = await connectWs(app, p2)
    await b.wait('presence')
    const c = await connectWs(app, p3)
    await c.wait('presence')

    const gotA = a.wait('message')
    const gotB = b.wait('message')
    const gotC = c.wait('message')
    sendWs(b.ws, { type: 'send-message', conversationId: room.conversationId, text: '大家好' })

    const results = (await Promise.all([gotA, gotB, gotC])) as { message: { text: string; senderId: string } }[]
    for (const got of results) {
      expect(got.message.text).toBe('大家好')
      expect(got.message.senderId).toBe(p2)
    }
    a.ws.close()
    b.ws.close()
    c.ws.close()
  })

  it('非成员：不可发言也不可拉取历史，加入后可拉取', async () => {
    const owner = await createPeer(app.baseUrl)
    const room = await createRoom(owner, '私有视角')
    const member = await createPeer(app.baseUrl)
    await joinRoom(member, room.id)
    const outsider = await createPeer(app.baseUrl)

    const m = await connectWs(app, member)
    await m.wait('presence')
    sendWs(m.ws, { type: 'send-message', conversationId: room.conversationId, text: '房间内部消息' })
    await m.wait('message')
    m.ws.close()

    const o = await connectWs(app, outsider)
    await o.wait('presence')
    sendWs(o.ws, { type: 'send-message', conversationId: room.conversationId, text: '闯入' })
    const err = await o.wait('error')
    expect(err.message).toContain('无权')
    o.ws.close()

    const denied = await fetch(`${app.baseUrl}/api/conversations/${room.conversationId}/messages`, {
      headers: { Cookie: `nw_peer=${outsider}` },
    })
    expect(denied.status).toBe(403)

    const allowed = await fetch(`${app.baseUrl}/api/conversations/${room.conversationId}/messages`, {
      headers: { Cookie: `nw_peer=${member}` },
    })
    expect(allowed.status).toBe(200)
    const body = (await allowed.json()) as { messages: { text: string | null }[] }
    expect(body.messages.map((msg) => msg.text)).toContain('房间内部消息')
  })

  it('会话列表：房间与私聊混合展示，含人数与最后一条消息', async () => {
    const owner = await createPeer(app.baseUrl)
    const other = await createPeer(app.baseUrl)
    // 私聊
    const convRes = await fetch(`${app.baseUrl}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `nw_peer=${owner}` },
      body: JSON.stringify({ peerId: other }),
    })
    expect(convRes.status).toBe(200)
    // 房间 + 一条消息
    const room = await createRoom(owner, '混合列表群')
    const wsOwner = await connectWs(app, owner)
    await wsOwner.wait('presence')
    sendWs(wsOwner.ws, { type: 'send-message', conversationId: room.conversationId, text: '群里第一条' })
    await wsOwner.wait('message')
    wsOwner.ws.close()

    const res = await fetch(`${app.baseUrl}/api/conversations`, { headers: { Cookie: `nw_peer=${owner}` } })
    const { conversations } = (await res.json()) as { conversations: ConversationSummary[] }
    const direct = conversations.find((c) => c.type === 'direct')
    expect(direct?.peer?.id).toBe(other)
    const roomConv = conversations.find((c) => c.type === 'room')
    expect(roomConv?.room?.name).toBe('混合列表群')
    expect(roomConv?.room?.memberCount).toBe(1)
    expect(roomConv?.lastMessage?.text).toBe('群里第一条')
  })

  it('房间事件：建房与加入时在线节点收到 rooms-updated', async () => {
    const watcher = await connectWs(app, await createPeer(app.baseUrl))
    await watcher.wait('presence')

    const creator = await createPeer(app.baseUrl)
    const room = await createRoom(creator, '广播测试群')
    await watcher.wait('rooms-updated')

    const joiner = await createPeer(app.baseUrl)
    await joinRoom(joiner, room.id)
    await watcher.wait('rooms-updated')

    const rooms = await listRooms(creator)
    expect(rooms.find((r) => r.id === room.id)?.memberCount).toBe(2)
    watcher.ws.close()
  })

  it('持久化：重启后房间列表、成员与历史完整', async () => {
    const owner = await createPeer(app.baseUrl)
    const room = await createRoom(owner, '重启群')
    const member = await createPeer(app.baseUrl)
    await joinRoom(member, room.id)
    const m = await connectWs(app, member)
    await m.wait('presence')
    sendWs(m.ws, { type: 'send-message', conversationId: room.conversationId, text: '重启前的房间消息' })
    await m.wait('message')
    m.ws.close()
    await app.stop()

    app = await startApp({ dataDir: app.dataDir })
    const rooms = await listRooms(owner)
    expect(rooms.find((r) => r.id === room.id)?.memberCount).toBe(2)

    const res = await fetch(`${app.baseUrl}/api/conversations/${room.conversationId}/messages`, {
      headers: { Cookie: `nw_peer=${member}` },
    })
    const body = (await res.json()) as { messages: { text: string | null }[] }
    expect(body.messages.map((msg) => msg.text)).toContain('重启前的房间消息')
  })
})
