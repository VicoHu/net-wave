import type { WebSocket } from 'ws'

export interface WsWaiter {
  (type: string, filter?: (data: any) => boolean, timeoutMs?: number): Promise<any>
}

/**
 * 带缓冲的 WS 消息观察器：连接建立后立即缓存全部消息，
 * 等待条件即使晚于消息到达也能命中（node ws 客户端同步连发场景下不丢事件）。
 */
export function watchMessages(ws: WebSocket): WsWaiter {
  const buffer: any[] = []
  ws.on('message', (raw) => {
    try {
      buffer.push(JSON.parse(String(raw)))
    } catch {
      // 忽略非 JSON 帧
    }
  })

  return (type, filter, timeoutMs = 30_000) =>
    new Promise((resolve, reject) => {
      const poll = setInterval(() => {
        const idx = buffer.findIndex((d) => d.type === type && (!filter || filter(d)))
        if (idx >= 0) {
          clearInterval(poll)
          clearTimeout(deadline)
          resolve(buffer.splice(idx, 1)[0])
        }
      }, 20)
      const deadline = setTimeout(() => {
        clearInterval(poll)
        reject(new Error(`等待 WS 事件 ${type} 超时（已缓冲: ${buffer.map((d) => d.type).join(',')}）`))
      }, timeoutMs)
    })
}
