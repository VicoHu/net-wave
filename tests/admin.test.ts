import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startApp, type AppHandle } from './helpers/startApp'
import { connectWs, createPeer, sendWs } from './helpers/clients'

const ADMIN_PASSWORD = 'correct-horse-battery'

let app: AppHandle

beforeAll(async () => {
  app = await startApp({ env: { ADMIN_PASSWORD } })
})

afterAll(async () => {
  await app.stop()
})

async function login(password: string): Promise<Response> {
  return fetch(`${app.baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
}

/** 从响应中提取管理员会话 cookie */
function adminCookie(res: Response): string {
  return (res.headers.get('set-cookie') ?? '').match(/nw_admin=([^;]+)/)?.[0] ?? ''
}

describe('管理中心', () => {
  it('未登录访问管理 API 被拒绝', async () => {
    const rooms = await fetch(`${app.baseUrl}/api/admin/rooms`)
    expect(rooms.status).toBe(401)
    const del = await fetch(`${app.baseUrl}/api/admin/rooms/1`, { method: 'DELETE' })
    expect(del.status).toBe(401)
  })

  it('正确密码登录：获得会话并可查询', async () => {
    const res = await login(ADMIN_PASSWORD)
    expect(res.status).toBe(200)
    const cookie = adminCookie(res)
    expect(cookie).toContain('nw_admin=')

    const session = await fetch(`${app.baseUrl}/api/admin/session`, { headers: { Cookie: cookie } })
    expect(((await session.json()) as { authenticated: boolean }).authenticated).toBe(true)

    const rooms = await fetch(`${app.baseUrl}/api/admin/rooms`, { headers: { Cookie: cookie } })
    expect(rooms.status).toBe(200)
    const body = (await rooms.json()) as { rooms: { id: number }[] }
    expect(Array.isArray(body.rooms)).toBe(true)
  })

  it('管理员可删除任意房间（含其他节点创建的）', async () => {
    const owner = await createPeer(app.baseUrl)
    const roomRes = await fetch(`${app.baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `nw_peer=${owner}` },
      body: JSON.stringify({ name: '管理员删除测试' }),
    })
    const room = (await roomRes.json()) as { id: number }

    const loginRes = await login(ADMIN_PASSWORD)
    const cookie = adminCookie(loginRes)
    const del = await fetch(`${app.baseUrl}/api/admin/rooms/${room.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    })
    expect(del.status).toBe(200)

    const listRes = await fetch(`${app.baseUrl}/api/rooms`, { headers: { Cookie: `nw_peer=${owner}` } })
    const { rooms } = (await listRes.json()) as { rooms: { id: number }[] }
    expect(rooms.find((r) => r.id === room.id)).toBeUndefined()
  })

  it('退出登录后会话失效', async () => {
    const loginRes = await login(ADMIN_PASSWORD)
    const cookie = adminCookie(loginRes)
    await fetch(`${app.baseUrl}/api/admin/logout`, { method: 'POST', headers: { Cookie: cookie } })
    const session = await fetch(`${app.baseUrl}/api/admin/session`, { headers: { Cookie: cookie } })
    expect(((await session.json()) as { authenticated: boolean }).authenticated).toBe(false)
  })

  it('消息携带发送者来源 IP（WS 连接时回填）', async () => {
    const owner = await createPeer(app.baseUrl)
    const roomRes = await fetch(`${app.baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `nw_peer=${owner}` },
      body: JSON.stringify({ name: 'IP 展示测试' }),
    })
    const room = (await roomRes.json()) as { conversationId: number }
    const ws = await connectWs(app, owner)
    await ws.wait('presence')
    sendWs(ws.ws, { type: 'send-message', conversationId: room.conversationId, text: '带 IP 的消息' })
    const got = (await ws.wait('message')) as { message: { senderIp: string | null } }
    expect(got.message.senderIp).toBe('127.0.0.1')
    ws.ws.close()
  })

  it('错误密码触发限流：连续失败后返回 429（放在最后，锁定状态不干扰其他用例）', async () => {
    // 前 3 次失败自由重试，第 4 次失败后进入 5 秒锁定
    for (let i = 0; i < 4; i++) {
      const res = await login('wrong-password')
      expect(res.status).toBe(401)
    }
    const locked = await login('wrong-password')
    expect(locked.status).toBe(429)
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0)
    // 锁定期间连正确密码也被拒绝
    const correct = await login(ADMIN_PASSWORD)
    expect(correct.status).toBe(429)
  })
})
