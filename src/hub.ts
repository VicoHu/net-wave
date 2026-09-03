import type { WebSocket } from 'ws'
import { getPeers, type Peer } from './peers'

interface OnlinePeer extends Peer {
  connections: number
}

/**
 * 服务中心的实时中枢：维护 WS 连接与在线节点，广播 presence。
 * 以 globalThis 单例存在，保证 server.ts 与 Next route handlers（同进程、
 * 不同模块系统）拿到同一实例。
 */
export interface Hub {
  add(ws: WebSocket, peerId: string): void
  remove(ws: WebSocket): void
  broadcast(type: string, payload: Record<string, unknown>): void
  sendToPeer(peerId: string, type: string, payload: Record<string, unknown>): void
  notifyPresenceChanged(): void
}

function createHub(): Hub {
  // 每个连接记录其节点身份；同节点多标签页为多条连接
  const connections = new Map<WebSocket, string>()

  /** 在线节点及其连接数（重连/多标签页时 connections > 1） */
  function peersWithConnections(): OnlinePeer[] {
    const counts = new Map<string, number>()
    for (const peerId of connections.values()) {
      counts.set(peerId, (counts.get(peerId) ?? 0) + 1)
    }
    return getPeers([...counts.keys()]).map((p) => ({ ...p, connections: counts.get(p.id) ?? 0 }))
  }

  const hub: Hub = {
    add(ws, peerId) {
      connections.set(ws, peerId)
      hub.notifyPresenceChanged()
    },
    remove(ws) {
      connections.delete(ws)
      hub.notifyPresenceChanged()
    },
    broadcast(type, payload) {
      const data = JSON.stringify({ type, ...payload })
      for (const ws of connections.keys()) {
        if (ws.readyState === ws.OPEN) ws.send(data)
      }
    },
    sendToPeer(peerId, type, payload) {
      const data = JSON.stringify({ type, ...payload })
      for (const [ws, id] of connections) {
        if (id === peerId && ws.readyState === ws.OPEN) ws.send(data)
      }
    },
    notifyPresenceChanged() {
      hub.broadcast('presence', { peers: peersWithConnections() })
    },
  }
  return hub
}

const globalForHub = globalThis as typeof globalThis & { __nwHub?: Hub }

export function getHub(): Hub {
  if (!globalForHub.__nwHub) globalForHub.__nwHub = createHub()
  return globalForHub.__nwHub
}
