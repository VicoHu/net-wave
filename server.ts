import { createServer } from 'node:http'
import next from 'next'
import { WebSocketServer } from 'ws'
import { openDb } from './src/db'

const dev = process.env.NODE_ENV !== 'production'
const port = Number(process.env.PORT ?? 3000)
const dataDir = process.env.DATA_DIR ?? './data'

// 启动即建库：确保数据目录与 SQLite 就绪
openDb(dataDir)

const app = next({ dev })
const handle = app.getRequestHandler()

await app.prepare()

const server = createServer((req, res) => {
  void handle(req, res)
})

const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost')
  if (pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  } else {
    socket.destroy()
  }
})

wss.on('connection', (ws) => {
  // T1 仅握手确认；presence 与消息协议由后续 ticket 实现
  ws.send(JSON.stringify({ type: 'connected' }))
})

server.listen(port, () => {
  console.log(`net-wave 服务中心已启动: http://localhost:${port} (dev=${dev}, data=${dataDir})`)
})
