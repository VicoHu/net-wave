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

  it('WS 握手成功并收到连接确认事件', async () => {
    const ws = new WebSocket(app.wsUrl)
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
