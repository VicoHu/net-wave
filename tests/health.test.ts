import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { startApp, type AppHandle } from './helpers/startApp'

let app: AppHandle

beforeAll(async () => {
  app = await startApp()
})

afterAll(async () => {
  await app.stop()
})

describe('服务中心骨架', () => {
  it('健康检查端点返回 ok', async () => {
    const res = await fetch(`${app.baseUrl}/api/health`)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ status: 'ok' })
  })

  it('WS 握手成功并收到连接确认事件（携带节点身份）', async () => {
    // T3 起 WS 需先经 /api/me 建立节点身份
    const meRes = await fetch(`${app.baseUrl}/api/me`)
    const cookie = (meRes.headers.get('set-cookie') ?? '').split(';')[0]
    const ws = new WebSocket(app.wsUrl, { headers: { Cookie: cookie } })
    const opened = new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve())
      ws.once('error', reject)
    })
    const firstMessage = new Promise<unknown>((resolve) => {
      ws.once('message', (data) => resolve(JSON.parse(String(data))))
    })
    await opened
    expect(await firstMessage).toEqual({ type: 'connected' })
    ws.close()
  })

  it('启动时在数据目录创建 SQLite 数据库', () => {
    expect(existsSync(join(app.dataDir, 'net-wave.db'))).toBe(true)
  })
})
