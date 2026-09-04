import { createServer } from 'node:http'
import next from 'next'
import { WebSocketServer } from 'ws'
import { openDb } from './src/db'
import { addFileMessage, addMessage, canAccessConversation, findConversation, type MessageRow } from './src/chat'
import { findPeer, updatePeerIp, updatePeerMac } from './src/peers'
import { roomMemberIds } from './src/rooms'
import { getHub } from './src/hub'
import { normalizeIp, lookupMac } from './src/net-info'
import { ensureAdminPassword } from './src/admin'

const dev = process.env.NODE_ENV !== 'production'
const port = Number(process.env.PORT ?? 3000)
const dataDir = process.env.DATA_DIR ?? './data'

// 启动即建库：确保数据目录与 SQLite 就绪
openDb(dataDir)
// 管理员密码：ADMIN_PASSWORD 环境变量优先，否则首启生成随机密码并打印
ensureAdminPassword()

const hub = getHub()
const app = next({ dev })
const handle = app.getRequestHandler()

await app.prepare()

const server = createServer((req, res) => {
  // Next route handlers 拿不到 socket，注入来源地址供登录限流等使用
  req.headers['x-nw-client-ip'] = normalizeIp(req.socket.remoteAddress ?? '')
  void handle(req, res)
})

const wss = new WebSocketServer({ noServer: true })

function parseCookie(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {}
  for (const part of header?.split(';') ?? []) {
    const idx = part.indexOf('=')
    if (idx > 0) result[part.slice(0, idx).trim()] = part.slice(idx + 1).trim()
  }
  return result
}

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost')
  if (pathname !== '/ws') {
    socket.destroy()
    return
  }
  const peerId = parseCookie(req.headers.cookie)['nw_peer']
  if (!peerId || !findPeer(peerId)) {
    // 身份需先经 REST(/api/me) 建立，浏览器客户端天然满足
    socket.destroy()
    return
  }
  ;(req as typeof req & { peerId: string }).peerId = peerId
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
})

wss.on('connection', (ws, req) => {
  const peerId = (req as typeof req & { peerId?: string }).peerId
  if (!peerId) {
    ws.close(4001, '未识别的节点身份')
    return
  }
  // 记录节点来源地址并异步解析 MAC（ARP 缓存可能尚未收录，解析失败保持 null）
  const ip = normalizeIp(req.socket.remoteAddress ?? '')
  updatePeerIp(peerId, ip)
  if (ip) {
    void lookupMac(ip).then((mac) => {
      if (mac) updatePeerMac(peerId, mac)
    })
  }
  ws.send(JSON.stringify({ type: 'connected' }))
  hub.add(ws, peerId)
  // 上线即提醒客户端刷新会话（离线期间的消息由此补投递）；
  // 挪到下一 tick，避免与 presence 同一同步批次连发被客户端漏收
  setTimeout(() => hub.sendToPeer(peerId, 'conversations-updated', {}), 0)
  ws.on('close', () => hub.remove(ws))
  ws.on('error', () => hub.remove(ws))
  ws.on('message', (raw) => {
    let data: { type?: unknown; conversationId?: unknown; text?: unknown; fileId?: unknown }
    try {
      data = JSON.parse(String(raw))
    } catch {
      return
    }
    if (data.type !== 'send-message') return

    const conversationId = Number(data.conversationId)
    const conversation = Number.isInteger(conversationId) ? findConversation(conversationId) : null
    if (!conversation || !canAccessConversation(conversation, peerId)) {
      ws.send(JSON.stringify({ type: 'error', message: '会话不存在或无权发送' }))
      return
    }

    // 文本与文件二选一：文件消息只携带上传后的 fileId，内容经 REST 流式传输
    const hasText = typeof data.text === 'string' && data.text.trim() !== ''
    const hasFile = typeof data.fileId === 'string' && data.fileId !== ''
    let message: MessageRow | null = null
    if (hasText && !hasFile) {
      const text = (data.text as string).trim()
      if (text.length > 5000) {
        ws.send(JSON.stringify({ type: 'error', message: '消息内容无效（1-5000 字符）' }))
        return
      }
      message = addMessage(conversation.id, peerId, text)
    } else if (hasFile && !hasText) {
      message = addFileMessage(conversation.id, peerId, data.fileId as string)
      if (!message) {
        ws.send(JSON.stringify({ type: 'error', message: '文件不存在或已被删除' }))
        return
      }
    } else {
      ws.send(JSON.stringify({ type: 'error', message: '消息需且仅需 text 或 fileId 之一' }))
      return
    }
    // 私聊投双方；房间投全体成员
    const recipients =
      conversation.type === 'room' && conversation.roomId != null
        ? roomMemberIds(conversation.roomId)
        : [conversation.peerA, conversation.peerB]
    for (const recipient of recipients) {
      if (recipient) hub.sendToPeer(recipient, 'message', { message })
    }
  })
})

server.listen(port, () => {
  console.log(`net-wave 服务中心已启动: http://localhost:${port} (dev=${dev}, data=${dataDir})`)
})
