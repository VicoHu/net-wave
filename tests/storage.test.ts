import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startApp, type AppHandle } from './helpers/startApp'
import { createPeer, sendWs, setupDirectConversation } from './helpers/clients'

const ADMIN_PASSWORD = 'storage-admin-pass'

let app: AppHandle

/** 存储条目：FileMeta + 管理员视角的治理信息（上传者昵称 / 所属会话 / 访问统计） */
interface StorageFile {
  id: string
  name: string
  size: number
  mime: string
  createdAt: number
  uploadedBy: string
  uploaderName: string
  conversationLabel: string | null
  accessCount: number
  lastAccessAt: number | null
}

interface StorageResponse {
  files: StorageFile[]
  totalSize: number
  scope: 'admin' | 'mine'
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

async function getStorage(cookie: string, query = ''): Promise<StorageResponse> {
  const res = await fetch(`${app.baseUrl}/api/storage${query}`, { headers: { Cookie: cookie } })
  expect(res.status).toBe(200)
  return (await res.json()) as StorageResponse
}

async function adminLogin(): Promise<string> {
  const res = await fetch(`${app.baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  })
  expect(res.status).toBe(200)
  return (res.headers.get('set-cookie') ?? '').match(/nw_admin=([^;]+)/)?.[0] ?? ''
}

/** 设定节点昵称（私聊会话标签断言用） */
async function renamePeer(peerId: string, name: string): Promise<void> {
  const res = await fetch(`${app.baseUrl}/api/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: `nw_peer=${peerId}` },
    body: JSON.stringify({ name }),
  })
  expect(res.status).toBe(200)
}

beforeAll(async () => {
  app = await startApp({ env: { ADMIN_PASSWORD } })
})

afterAll(async () => {
  await app.stop()
})

describe('存储管理：双视角', () => {
  it('普通节点：仅见自己上传的文件，看不到他人文件名（scope=mine）', async () => {
    const peerA = await createPeer(app.baseUrl)
    const peerB = await createPeer(app.baseUrl)
    const a = await upload(peerA, randomBytes(100), '甲的机密.bin', 'application/octet-stream')
    const b = await upload(peerB, randomBytes(200), '乙的文件.bin', 'application/octet-stream')

    const storage = await getStorage(`nw_peer=${peerB}`)
    expect(storage.scope).toBe('mine')
    expect(storage.files.some((f) => f.id === b)).toBe(true)
    expect(storage.files.some((f) => f.id === a)).toBe(false)

    const mine = storage.files.find((f) => f.id === b)
    expect(mine?.uploaderName).toBeTruthy()
  })

  it('管理员：全量文件 + 上传者昵称 + 所属会话标签（scope=admin）', async () => {
    const { peerA, peerB, a, conversationId } = await setupDirectConversation(app)
    await renamePeer(peerA, '甲')
    await renamePeer(peerB, '乙')
    const directFile = await upload(peerA, randomBytes(120), '私聊文件.txt', 'text/plain')
    sendWs(a.ws, { type: 'send-message', conversationId, fileId: directFile })
    await a.wait('message')

    const roomRes = await fetch(`${app.baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `nw_peer=${peerA}` },
      body: JSON.stringify({ name: '项目讨论' }),
    })
    const room = (await roomRes.json()) as { id: number }
    const convRes = await fetch(`${app.baseUrl}/api/conversations`, { headers: { Cookie: `nw_peer=${peerA}` } })
    const { conversations } = (await convRes.json()) as { conversations: { id: number; type: string; room: { id: number } }[] }
    const roomConversation = conversations.find((c) => c.type === 'room' && c.room.id === room.id)
    expect(roomConversation).toBeTruthy()
    const roomFile = await upload(peerA, randomBytes(80), '房间文件.txt', 'text/plain')
    sendWs(a.ws, { type: 'send-message', conversationId: roomConversation!.id, fileId: roomFile })
    await a.wait('message')

    const looseFile = await upload(peerA, randomBytes(40), '未发送文件.txt', 'text/plain')

    const admin = await adminLogin()
    const storage = await getStorage(admin)
    expect(storage.scope).toBe('admin')
    const all = storage.files
    expect(all.some((f) => f.id === directFile)).toBe(true)

    const direct = all.find((f) => f.id === directFile)
    expect(direct?.uploaderName).toBe('甲')
    // 私聊标签含双方昵称；双方顺序由会话存储顺序决定，测试不耦合
    expect(direct?.conversationLabel).toContain('甲')
    expect(direct?.conversationLabel).toContain('乙')
    expect(direct?.conversationLabel).toContain('私聊')

    const inRoom = all.find((f) => f.id === roomFile)
    expect(inRoom?.conversationLabel).toBe('项目讨论')

    const loose = all.find((f) => f.id === looseFile)
    expect(loose?.conversationLabel).toBeNull()
    a.ws.close()
  })

  it('未识别身份访问存储列表返回 401', async () => {
    expect((await fetch(`${app.baseUrl}/api/storage`)).status).toBe(401)
  })
})

describe('存储管理：删除权限（仅管理员）', () => {
  it('普通节点删除任意文件返回 403，文件保留', async () => {
    const peerA = await createPeer(app.baseUrl)
    const peerB = await createPeer(app.baseUrl)
    const id = await upload(peerA, randomBytes(300), '受保护.bin', 'application/octet-stream')

    const del = await fetch(`${app.baseUrl}/api/files/${id}`, {
      method: 'DELETE',
      headers: { Cookie: `nw_peer=${peerB}` },
    })
    expect(del.status).toBe(403)

    const admin = await adminLogin()
    const storage = await getStorage(admin)
    expect(storage.files.some((f) => f.id === id)).toBe(true)
  })

  it('管理员删除：列表与占用即时更新，重复删除幂等，不存在的文件 404', async () => {
    const peer = await createPeer(app.baseUrl)
    const id = await upload(peer, randomBytes(500), '待删.bin', 'application/octet-stream')
    const admin = await adminLogin()

    const before = await getStorage(admin)
    const del = await fetch(`${app.baseUrl}/api/files/${id}`, { method: 'DELETE', headers: { Cookie: admin } })
    expect(del.status).toBe(200)

    const after = await getStorage(admin)
    expect(after.files.some((f) => f.id === id)).toBe(false)
    expect(after.totalSize).toBe(before.totalSize - 500)

    // 幂等：再次删除仍 200（磁盘文件已不存在）
    const again = await fetch(`${app.baseUrl}/api/files/${id}`, { method: 'DELETE', headers: { Cookie: admin } })
    expect(again.status).toBe(200)

    const notFound = await fetch(`${app.baseUrl}/api/files/00000000-0000-4000-8000-000000000000`, {
      method: 'DELETE',
      headers: { Cookie: admin },
    })
    expect(notFound.status).toBe(404)
  })

  it('被删文件：历史消息保留元数据并标记不可下载，下载端点返回 410', async () => {
    const { peerA, a, conversationId } = await setupDirectConversation(app)
    const fileId = await upload(peerA, randomBytes(200), '历史文件.txt', 'text/plain')
    sendWs(a.ws, { type: 'send-message', conversationId, fileId })
    await a.wait('message')

    const admin = await adminLogin()
    const del = await fetch(`${app.baseUrl}/api/files/${fileId}`, { method: 'DELETE', headers: { Cookie: admin } })
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

describe('存储管理：批量删除', () => {
  it('无管理员会话调用批量删除返回 401', async () => {
    const res = await fetch(`${app.baseUrl}/api/admin/storage/batch-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [] }),
    })
    expect(res.status).toBe(401)
  })

  it('预览筛选：min_size 与 before 组合（AND）过滤命中文件，大小阈值不含等于', async () => {
    const peer = await createPeer(app.baseUrl)
    const small = await upload(peer, randomBytes(100), '小文件.bin', 'application/octet-stream')
    const exact = await upload(peer, randomBytes(1024), '恰好一千.bin', 'application/octet-stream')
    const big = await upload(peer, randomBytes(5 * 1024), '大文件.bin', 'application/octet-stream')
    const admin = await adminLogin()
    const now = Date.now()

    // 大小过滤：> 1KB 只剩大文件（等于阈值的「恰好一千」不命中）
    const bySize = await getStorage(admin, `?min_size=${1024}`)
    expect(bySize.files.some((f) => f.id === big)).toBe(true)
    expect(bySize.files.some((f) => f.id === exact)).toBe(false)
    expect(bySize.files.some((f) => f.id === small)).toBe(false)

    // 时间过滤：早于 1 小时前 → 无命中；晚于（未来时间戳）→ 全命中
    expect((await getStorage(admin, `?before=${now - 3600_000}`)).files.length).toBe(0)
    const all = await getStorage(admin, `?before=${now + 3600_000}&min_size=${1024}`)
    expect(all.files.some((f) => f.id === big)).toBe(true)
    expect(all.files.some((f) => f.id === small)).toBe(false)
  })

  it('批量删除：按最终勾选 id 执行，返回删除数与释放空间，未勾选的保留', async () => {
    const peer = await createPeer(app.baseUrl)
    const a = await upload(peer, randomBytes(100), '批删-甲.bin', 'application/octet-stream')
    const b = await upload(peer, randomBytes(300), '批删-乙.bin', 'application/octet-stream')
    const admin = await adminLogin()

    const res = await fetch(`${app.baseUrl}/api/admin/storage/batch-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: admin },
      body: JSON.stringify({ ids: [a] }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { deleted: number; freedSize: number }
    expect(body.deleted).toBe(1)
    expect(body.freedSize).toBe(100)

    const storage = await getStorage(admin)
    expect(storage.files.some((f) => f.id === a)).toBe(false)
    expect(storage.files.some((f) => f.id === b)).toBe(true)
  })
})

describe('存储管理：访问统计（统一口径）', () => {
  it('下载累计访问次数并记录最后访问时间；内联与附件不区分', async () => {
    const { peerA, peerB, a, conversationId } = await setupDirectConversation(app)
    const fileId = await upload(peerA, randomBytes(64), '访问统计.png', 'image/png')
    sendWs(a.ws, { type: 'send-message', conversationId, fileId })
    await a.wait('message')

    for (const _ of [1, 2]) {
      const dl = await fetch(`${app.baseUrl}/api/files/${fileId}`, { headers: { Cookie: `nw_peer=${peerB}` } })
      expect(dl.status).toBe(200)
    }

    const admin = await adminLogin()
    const storage = await getStorage(admin)
    const file = storage.files.find((f) => f.id === fileId)
    expect(file?.accessCount).toBe(2)
    expect(file?.lastAccessAt).not.toBeNull()
    expect(file?.lastAccessAt as number).toBeGreaterThan(0)
    a.ws.close()
  })

  it('管理员可下载非本人会话的文件（治理需要），且同样计入访问', async () => {
    const { peerA, a, conversationId } = await setupDirectConversation(app)
    const fileId = await upload(peerA, randomBytes(32), '治理下载.txt', 'text/plain')
    sendWs(a.ws, { type: 'send-message', conversationId, fileId })
    await a.wait('message')

    const admin = await adminLogin()
    const dl = await fetch(`${app.baseUrl}/api/files/${fileId}`, { headers: { Cookie: admin } })
    expect(dl.status).toBe(200)

    const storage = await getStorage(admin)
    const file = storage.files.find((f) => f.id === fileId)
    expect(file?.accessCount).toBe(1)
    a.ws.close()
  })
})
