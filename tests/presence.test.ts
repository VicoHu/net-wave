import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { startApp, type AppHandle } from './helpers/startApp'
import { watchMessages, type WsWaiter } from './helpers/wsEvents'

let app: AppHandle

/** 通过 REST 建立节点身份，返回 cookie 值 */
async function createPeer(): Promise<string> {
  const res = await fetch(`${app.baseUrl}/api/me`)
  expect(res.status).toBe(200)
  const setCookie = res.headers.get('set-cookie') ?? ''
  const match = setCookie.match(/nw_peer=([^;]+)/)
  if (!match) throw new Error('未收到 nw_peer cookie')
  return match[1]
}

/** 连接 WS 并在 open 同步挂上消息观察器（缓冲全部消息，等待不丢事件） */
function connectWs(peerId: string): Promise<{ ws: WebSocket; wait: WsWaiter }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(app.wsUrl, { headers: { Cookie: `nw_peer=${peerId}` } })
    ws.once('open', () => resolve({ ws, wait: watchMessages(ws) }))
    ws.once('error', reject)
  })
}

beforeAll(async () => {
  app = await startApp()
})

afterAll(async () => {
  await app.stop()
})

describe('节点身份与在线列表', () => {
  it('首次访问自动创建节点身份并获得随机昵称', async () => {
    const res = await fetch(`${app.baseUrl}/api/me`)
    expect(res.status).toBe(200)
    const me = (await res.json()) as { id: string; name: string }
    expect(me.id).toBeTruthy()
    expect(me.name.length).toBeGreaterThan(0)
  })

  it('携带 cookie 再次访问保持同一身份', async () => {
    const first = await fetch(`${app.baseUrl}/api/me`)
    const cookie = (first.headers.get('set-cookie') ?? '').split(';')[0]
    const second = await fetch(`${app.baseUrl}/api/me`, { headers: { Cookie: cookie } })
    const me = (await second.json()) as { id: string }
    const firstBody = (await first.json()) as { id: string }
    expect(me.id).toBe(firstBody.id)
  })

  it('两个 WS 客户端互见上线与下线（presence 事件）', async () => {
    const peerA = await createPeer()
    const peerB = await createPeer()

    const a = await connectWs(peerA)
    // A 上线：presence 包含 A
    const p1 = await a.wait('presence', (d: { peers: { id: string }[] }) => d.peers.some((p) => p.id === peerA))
    expect(p1.peers.some((p: { id: string }) => p.id === peerA)).toBe(true)

    const b = await connectWs(peerB)
    // B 上线：双方都收到包含两人的 presence（包含式断言，不依赖全局连接数）
    const hasBoth = (d: { peers: { id: string }[] }) =>
      d.peers.some((p) => p.id === peerA) && d.peers.some((p) => p.id === peerB)
    await Promise.all([a.wait('presence', hasBoth), b.wait('presence', hasBoth)])

    // A 下线：B 收到不再包含 A 的 presence
    a.ws.close()
    const p3 = await b.wait(
      'presence',
      (d: { peers: { id: string }[] }) => !d.peers.some((p) => p.id === peerA) && d.peers.some((p) => p.id === peerB),
    )
    expect(p3.peers.some((p: { id: string }) => p.id === peerA)).toBe(false)
    b.ws.close()
  })

  it('修改昵称后 presence 广播新昵称', async () => {
    const peerA = await createPeer()
    const peerB = await createPeer()

    const a = await connectWs(peerA)
    await a.wait('presence')
    const b = await connectWs(peerB)
    await Promise.all([
      a.wait('presence', (d: { peers: { id: string }[] }) => d.peers.some((p) => p.id === peerB)),
      b.wait('presence', (d: { peers: { id: string }[] }) => d.peers.some((p) => p.id === peerA)),
    ])

    // 先注册等待再触发：WS 广播可能先于 HTTP 响应到达
    const updatedPromise = b.wait(
      'presence',
      (d: { peers: { id: string; name: string }[] }) => d.peers.some((p) => p.id === peerA && p.name === '改名后的A'),
    )
    const res = await fetch(`${app.baseUrl}/api/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `nw_peer=${peerA}` },
      body: JSON.stringify({ name: '改名后的A' }),
    })
    expect(res.status).toBe(200)

    const updated = await updatedPromise
    expect(updated.peers.find((p: { id: string }) => p.id === peerA)?.name).toBe('改名后的A')

    a.ws.close()
    b.ws.close()
  })

  it('中心信息端点返回局域网地址与二维码', async () => {
    const res = await fetch(`${app.baseUrl}/api/center-info`)
    expect(res.status).toBe(200)
    const info = (await res.json()) as { lanUrl: string; qrDataUrl: string }
    expect(info.lanUrl).toMatch(/^https?:\/\//)
    expect(info.qrDataUrl).toMatch(/^data:image\//)
  })
})
