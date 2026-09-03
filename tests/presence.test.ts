import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { startApp, type AppHandle } from './helpers/startApp'

let app: AppHandle

/** 收集一个 WS 上指定类型的事件，直到满足条件或超时 */
function waitForEvent<T>(ws: WebSocket, type: string, filter?: (data: T) => boolean, timeoutMs = 10_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`等待 WS 事件 ${type} 超时`)), timeoutMs)
    ws.on('message', (raw) => {
      const data = JSON.parse(String(raw))
      if (data.type === type && (!filter || filter(data))) {
        clearTimeout(timer)
        resolve(data)
      }
    })
    ws.on('error', reject)
  })
}

/** 通过 REST 建立节点身份，返回 peerId（cookie 值） */
async function createPeer(): Promise<string> {
  const res = await fetch(`${app.baseUrl}/api/me`)
  expect(res.status).toBe(200)
  const setCookie = res.headers.get('set-cookie') ?? ''
  const match = setCookie.match(/nw_peer=([^;]+)/)
  if (!match) throw new Error('未收到 nw_peer cookie')
  return match[1]
}

function connectWs(peerId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(app.wsUrl, { headers: { Cookie: `nw_peer=${peerId}` } })
    ws.once('open', () => resolve(ws))
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

    const wsA = await connectWs(peerA)
    // A 上线：presence 只含 A
    const p1 = await waitForEvent<{ peers: { id: string }[] }>(wsA, 'presence', (d) => d.peers.length === 1)
    expect(p1.peers[0].id).toBe(peerA)

    const wsB = await connectWs(peerB)
    // B 上线：双方都应收到含两人的 presence
    const [aSees, bSees] = await Promise.all([
      waitForEvent<{ peers: { id: string }[] }>(wsA, 'presence', (d) => d.peers.length === 2),
      waitForEvent<{ peers: { id: string }[] }>(wsB, 'presence', (d) => d.peers.length === 2),
    ])
    expect(new Set(aSees.peers.map((p) => p.id))).toEqual(new Set([peerA, peerB]))
    expect(new Set(bSees.peers.map((p) => p.id))).toEqual(new Set([peerA, peerB]))

    // A 下线：B 收到只剩自己的 presence
    wsA.close()
    const p3 = await waitForEvent<{ peers: { id: string }[] }>(wsB, 'presence', (d) => d.peers.length === 1)
    expect(p3.peers[0].id).toBe(peerB)
    wsB.close()
  })

  it('修改昵称后 presence 广播新昵称', async () => {
    const peerA = await createPeer()
    const peerB = await createPeer()

    const wsA = await connectWs(peerA)
    await waitForEvent(wsA, 'presence')
    const wsB = await connectWs(peerB)
    await Promise.all([
      waitForEvent<{ peers: { id: string }[] }>(wsA, 'presence', (d) => d.peers.length === 2),
      waitForEvent<{ peers: { id: string }[] }>(wsB, 'presence', (d) => d.peers.length === 2),
    ])

    // 先注册等待再触发：WS 广播可能先于 HTTP 响应到达
    const updatedPromise = waitForEvent<{ peers: { id: string; name: string }[] }>(
      wsB,
      'presence',
      (d) => d.peers.some((p) => p.id === peerA && p.name === '改名后的A'),
    )
    const res = await fetch(`${app.baseUrl}/api/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `nw_peer=${peerA}` },
      body: JSON.stringify({ name: '改名后的A' }),
    })
    expect(res.status).toBe(200)

    const updated = await updatedPromise
    expect(updated.peers.find((p) => p.id === peerA)?.name).toBe('改名后的A')

    wsA.close()
    wsB.close()
  })

  it('中心信息端点返回局域网地址与二维码', async () => {
    const res = await fetch(`${app.baseUrl}/api/center-info`)
    expect(res.status).toBe(200)
    const info = (await res.json()) as { lanUrl: string; qrDataUrl: string }
    expect(info.lanUrl).toMatch(/^https?:\/\//)
    expect(info.qrDataUrl).toMatch(/^data:image\//)
  })
})
