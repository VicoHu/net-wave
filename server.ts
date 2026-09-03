import { createServer } from 'node:http'
import next from 'next'
import { WebSocketServer } from 'ws'
import { openDb } from './src/db'
import { findPeer } from './src/peers'
import { getHub } from './src/hub'

const dev = process.env.NODE_ENV !== 'production'
const port = Number(process.env.PORT ?? 3000)
const dataDir = process.env.DATA_DIR ?? './data'

// 启动即建库：确保数据目录与 SQLite 就绪
openDb(dataDir)

const hub = getHub()
const app = next({ dev })
const handle = app.getRequestHandler()

await app.prepare()

const server = createServer((req, res) => {
  void handle(req, res)
})

const wss = new WebSocketServer({ noServer: true })
hub.wss = wss

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
  ws.send(JSON.stringify({ type: 'connected' }))
  hub.add(ws, peerId)
  ws.on('close', () => hub.remove(ws))
  ws.on('error', () => hub.remove(ws))
})

server.listen(port, () => {
  console.log(`net-wave 服务中心已启动: http://localhost:${port} (dev=${dev}, data=${dataDir})`)
})
