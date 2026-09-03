import { createHash, randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startApp, type AppHandle } from './helpers/startApp'
import { createPeer, sendWs, setupDirectConversation } from './helpers/clients'

let app: AppHandle

interface UploadResult {
  fileId: string
  name: string
  size: number
  mime: string
  kind: 'image' | 'file'
}

interface FileMeta {
  id: string
  name: string
  size: number
  mime: string
  kind: string
  deleted?: boolean
}

interface FileMessageRow {
  id: number
  conversationId: number
  senderId: string
  kind: string
  text: string | null
  fileId: string | null
  file: FileMeta | null
  createdAt: number
}

async function upload(peerId: string, bytes: Uint8Array, name: string, mime: string): Promise<UploadResult> {
  const form = new FormData()
  form.append('file', new Blob([bytes as BlobPart], { type: mime }), name)
  const res = await fetch(`${app.baseUrl}/api/files`, {
    method: 'POST',
    body: form,
    headers: { Cookie: `nw_peer=${peerId}` },
  })
  expect(res.status).toBe(200)
  return (await res.json()) as UploadResult
}

beforeAll(async () => {
  app = await startApp()
})

afterAll(async () => {
  await app.stop()
})

describe('图片与文件传输', () => {
  it('上传图片：返回元数据且 kind 为 image', async () => {
    const peer = await createPeer(app.baseUrl)
    const png = randomBytes(64)
    const meta = await upload(peer, png, '截图 最终版.png', 'image/png')
    expect(meta.name).toBe('截图 最终版.png')
    expect(meta.size).toBe(64)
    expect(meta.mime).toBe('image/png')
    expect(meta.kind).toBe('image')
  })

  it('上传普通文件：kind 为 file', async () => {
    const peer = await createPeer(app.baseUrl)
    const meta = await upload(peer, randomBytes(128), '安装包.zip', 'application/octet-stream')
    expect(meta.kind).toBe('file')
  })

  it('发送文件消息：双方收到含文件元数据的 message 事件', async () => {
    const { peerA, a, b, conversationId } = await setupDirectConversation(app)
    const meta = await upload(peerA, randomBytes(256), '会议纪要.txt', 'text/plain')

    const aPromise = a.wait('message')
    const bPromise = b.wait('message')
    sendWs(a.ws, { type: 'send-message', conversationId, fileId: meta.fileId })

    const [aGot, bGot] = (await Promise.all([aPromise, bPromise])) as { message: FileMessageRow }[]
    for (const got of [aGot, bGot]) {
      expect(got.message.kind).toBe('file')
      expect(got.message.fileId).toBe(meta.fileId)
      expect(got.message.file?.name).toBe('会议纪要.txt')
      expect(got.message.file?.size).toBe(256)
      expect(got.message.senderId).toBe(peerA)
    }
    a.ws.close()
    b.ws.close()
  })

  it('下载：字节与 Content-Type 一致', async () => {
    const { peerA, a, peerB, conversationId } = await setupDirectConversation(app)
    const bytes = randomBytes(1024)
    const meta = await upload(peerA, bytes, '数据.bin', 'application/octet-stream')
    sendWs(a.ws, { type: 'send-message', conversationId, fileId: meta.fileId })
    await a.wait('message')
    const res = await fetch(`${app.baseUrl}/api/files/${meta.fileId}`, {
      headers: { Cookie: `nw_peer=${peerB}` },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/octet-stream')
    expect(res.headers.get('content-length')).toBe(String(bytes.length))
    expect(Buffer.from(await res.arrayBuffer()).equals(Buffer.from(bytes))).toBe(true)
  })

  it('下载权限：非会话方 403，无身份 401，不存在的文件 404', async () => {
    const { peerA } = await setupDirectConversation(app)
    const meta = await upload(peerA, randomBytes(16), '私密.txt', 'text/plain')
    const outsider = await createPeer(app.baseUrl)

    expect(
      (await fetch(`${app.baseUrl}/api/files/${meta.fileId}`, { headers: { Cookie: `nw_peer=${outsider}` } })).status,
    ).toBe(403)
    expect((await fetch(`${app.baseUrl}/api/files/${meta.fileId}`)).status).toBe(401)
    expect(
      (await fetch(`${app.baseUrl}/api/files/00000000-0000-4000-8000-000000000000`, {
        headers: { Cookie: `nw_peer=${peerA}` },
      })).status,
    ).toBe(404)
  })

  it('非法发送：fileId 不存在 / text 与 fileId 并存，返回 error', async () => {
    const { a, conversationId } = await setupDirectConversation(app)
    sendWs(a.ws, { type: 'send-message', conversationId, fileId: '不存在' })
    const err1 = await a.wait('error')
    expect(err1.message).toBeTruthy()

    sendWs(a.ws, { type: 'send-message', conversationId, fileId: '也不存在', text: '同时发' })
    const err2 = await a.wait('error')
    expect(err2.message).toBeTruthy()
    a.ws.close()
  })

  it('持久化：重启后历史含文件元数据且可重新下载', async () => {
    const { peerA, peerB, a, conversationId } = await setupDirectConversation(app)
    const bytes = randomBytes(512)
    const meta = await upload(peerA, bytes, '重启测试.png', 'image/png')
    sendWs(a.ws, { type: 'send-message', conversationId, fileId: meta.fileId })
    await a.wait('message')
    a.ws.close()
    await app.stop()

    app = await startApp({ dataDir: app.dataDir })
    const res = await fetch(`${app.baseUrl}/api/conversations/${conversationId}/messages`, {
      headers: { Cookie: `nw_peer=${peerB}` },
    })
    const { messages } = (await res.json()) as { messages: FileMessageRow[] }
    const fileMessage = messages.find((m) => m.fileId === meta.fileId)
    expect(fileMessage?.kind).toBe('image')
    expect(fileMessage?.file?.name).toBe('重启测试.png')

    const dl = await fetch(`${app.baseUrl}/api/files/${meta.fileId}`, { headers: { Cookie: `nw_peer=${peerB}` } })
    expect(dl.status).toBe(200)
    expect(Buffer.from(await dl.arrayBuffer()).equals(Buffer.from(bytes))).toBe(true)
  })

  it('流式传输：64MB 文件上传后下载 sha256 一致', async () => {
    const { peerA, a, conversationId } = await setupDirectConversation(app)
    const big = randomBytes(64 * 1024 * 1024)
    const meta = await upload(peerA, big, '大文件.iso', 'application/octet-stream')
    sendWs(a.ws, { type: 'send-message', conversationId, fileId: meta.fileId })
    await a.wait('message')

    const res = await fetch(`${app.baseUrl}/api/files/${meta.fileId}`, { headers: { Cookie: `nw_peer=${peerA}` } })
    expect(res.status).toBe(200)
    const body = Buffer.from(await res.arrayBuffer())
    expect(body.length).toBe(big.length)
    expect(createHash('sha256').update(body).digest('hex')).toBe(createHash('sha256').update(big).digest('hex'))
  })
})
