import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startApp, type AppHandle } from './helpers/startApp'
import { createPeer, sendWs, setupDirectConversation } from './helpers/clients'

let app: AppHandle

interface StorageFile {
  id: string
  name: string
  size: number
  mime: string
  createdAt: number
}

async function upload(peerId: string, bytes: Uint8Array, name: string, mime: string): Promise<string> {
  const form = new FormData()
  form.append('file', new Blob([bytes as BlobPart], { type: mime }), name)
  const res = await fetch(`${app.baseUrl}/api/files`, {
    method: 'POST',
    body: form,
    headers: { Cookie: `nw_peer=${peerId}` },
  })
  expect(res.status).toBe(200)
  return ((await res.json()) as { fileId: string }).fileId
}

async function getStorage(peerId: string): Promise<{ files: StorageFile[]; totalSize: number }> {
  const res = await fetch(`${app.baseUrl}/api/storage`, { headers: { Cookie: `nw_peer=${peerId}` } })
  expect(res.status).toBe(200)
  return (await res.json()) as { files: StorageFile[]; totalSize: number }
}

beforeAll(async () => {
  app = await startApp()
})

afterAll(async () => {
  await app.stop()
})

describe('存储管理', () => {
  it('文件列表：展示名称/大小/时间与总占用', async () => {
    const peer = await createPeer(app.baseUrl)
    const a = await upload(peer, randomBytes(100), '甲.bin', 'application/octet-stream')
    const b = await upload(peer, randomBytes(300), '乙.bin', 'application/octet-stream')

    const storage = await getStorage(peer)
    const ids = storage.files.map((f) => f.id)
    expect(ids).toContain(a)
    expect(ids).toContain(b)
    expect(storage.totalSize).toBeGreaterThanOrEqual(400)
    const fileA = storage.files.find((f) => f.id === a)
    expect(fileA?.name).toBe('甲.bin')
    expect(fileA?.size).toBe(100)
    expect(fileA?.createdAt).toBeGreaterThan(0)
  })

  it('删除文件：列表与占用即时更新，磁盘释放，重复删除幂等', async () => {
    const peer = await createPeer(app.baseUrl)
    const id = await upload(peer, randomBytes(500), '待删.bin', 'application/octet-stream')
    const before = await getStorage(peer)
    expect(before.files.some((f) => f.id === id)).toBe(true)

    const del = await fetch(`${app.baseUrl}/api/files/${id}`, {
      method: 'DELETE',
      headers: { Cookie: `nw_peer=${peer}` },
    })
    expect(del.status).toBe(200)

    const after = await getStorage(peer)
    expect(after.files.some((f) => f.id === id)).toBe(false)
    expect(after.totalSize).toBe(before.totalSize - 500)

    // 幂等：再次删除仍 200（磁盘文件已不存在）
    const again = await fetch(`${app.baseUrl}/api/files/${id}`, {
      method: 'DELETE',
      headers: { Cookie: `nw_peer=${peer}` },
    })
    expect(again.status).toBe(200)
  })

  it('删除不存在的文件返回 404；未识别身份 401', async () => {
    const peer = await createPeer(app.baseUrl)
    expect(
      (
        await fetch(`${app.baseUrl}/api/files/00000000-0000-4000-8000-000000000000`, {
          method: 'DELETE',
          headers: { Cookie: `nw_peer=${peer}` },
        })
      ).status,
    ).toBe(404)
    expect(
      (await fetch(`${app.baseUrl}/api/storage`)).status,
    ).toBe(401)
  })

  it('被删文件：历史消息保留元数据并标记不可下载，下载端点返回 410', async () => {
    const { peerA, a, conversationId } = await setupDirectConversation(app)
    const fileId = await upload(peerA, randomBytes(200), '历史文件.txt', 'text/plain')
    sendWs(a.ws, { type: 'send-message', conversationId, fileId })
    await a.wait('message')

    const del = await fetch(`${app.baseUrl}/api/files/${fileId}`, {
      method: 'DELETE',
      headers: { Cookie: `nw_peer=${peerA}` },
    })
    expect(del.status).toBe(200)

    const dl = await fetch(`${app.baseUrl}/api/files/${fileId}`, { headers: { Cookie: `nw_peer=${peerA}` } })
    expect(dl.status).toBe(410)

    const res = await fetch(`${app.baseUrl}/api/conversations/${conversationId}/messages`, {
      headers: { Cookie: `nw_peer=${peerA}` },
    })
    const { messages } = (await res.json()) as { messages: { fileId: string | null; file: { deleted: boolean } | null }[] }
    const target = messages.find((m) => m.fileId === fileId)
    expect(target).toBeTruthy()
    expect(target?.file?.deleted).toBe(true)
    a.ws.close()
  })
})
