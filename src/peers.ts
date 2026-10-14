import { randomUUID } from 'node:crypto'
import { openDb } from './db'

const ADJECTIVES = [
  '敏捷的', '安静的', '热情的', '聪明的', '温柔的', '欢快的', '沉着的', '灵巧的',
  '勇敢的', '悠闲的', '认真的', '闪亮的', '自由的', '神秘的', '可靠的', '开朗的',
  '专注的', '活泼的', '大方的', '淡定的',
]
const NOUNS = [
  '狐狸', '企鹅', '海豚', '考拉', '水獭', '松鼠', '熊猫', '白鹭',
  '刺猬', '仓鼠', '猫头鹰', '小鹿', '柴犬', '布偶猫', '柯基', '海鸥',
  '章鱼', '鲸鱼', '雪豹', '浣熊',
]

export interface Peer {
  id: string
  name: string
  /** 最近一次 WS 连接的来源地址与 ARP 解析出的 MAC（未知时为 null） */
  ip: string | null
  mac: string | null
  /** 隐私偏好：隐藏后本人的 IP/MAC 不再随消息与 presence 下发给任何节点 */
  hideIp: boolean
  hideMac: boolean
}

export function randomPeerName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  return `${adj}${noun}`
}

function rowToPeer(row: Record<string, unknown>): Peer {
  return {
    id: row.id as string,
    name: row.name as string,
    ip: (row.ip as string | null) ?? null,
    mac: (row.mac as string | null) ?? null,
    hideIp: (row.hide_ip as number | null) === 1,
    hideMac: (row.hide_mac as number | null) === 1,
  }
}

export function createPeer(): Peer {
  const db = openDb()
  const peer: Peer = { id: randomUUID(), name: randomPeerName(), ip: null, mac: null, hideIp: false, hideMac: false }
  db.prepare('INSERT INTO peers (id, name, created_at) VALUES (?, ?, ?)').run(peer.id, peer.name, Date.now())
  return peer
}

export function findPeer(id: string): Peer | null {
  const db = openDb()
  const row = db.prepare('SELECT id, name, ip, mac, hide_ip, hide_mac FROM peers WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined
  return row ? rowToPeer(row) : null
}

export function renamePeer(id: string, name: string): Peer | null {
  const db = openDb()
  const result = db.prepare('UPDATE peers SET name = ? WHERE id = ?').run(name, id)
  if (result.changes === 0) return null
  return findPeer(id)
}

export function getPeers(ids: string[]): Peer[] {
  if (ids.length === 0) return []
  const db = openDb()
  const placeholders = ids.map(() => '?').join(',')
  const rows = db
    .prepare(`SELECT id, name, ip, mac, hide_ip, hide_mac FROM peers WHERE id IN (${placeholders})`)
    .all(...ids) as Record<string, unknown>[]
  return rows.map(rowToPeer)
}

/** 更新节点隐私偏好（仅传需变更的字段） */
export function setPeerPrivacy(id: string, privacy: { hideIp?: boolean; hideMac?: boolean }): Peer | null {
  const db = openDb()
  if (privacy.hideIp != null) {
    db.prepare('UPDATE peers SET hide_ip = ? WHERE id = ?').run(privacy.hideIp ? 1 : 0, id)
  }
  if (privacy.hideMac != null) {
    db.prepare('UPDATE peers SET hide_mac = ? WHERE id = ?').run(privacy.hideMac ? 1 : 0, id)
  }
  return findPeer(id)
}

/** 出网视角的节点：不含隐私偏好本身，且 IP/MAC 已按本人偏好抹除（服务端内部仍持原值） */
export type PublicPeer = Omit<Peer, 'hideIp' | 'hideMac'>

export function publicPeer(peer: Peer): PublicPeer {
  return {
    id: peer.id,
    name: peer.name,
    ip: peer.hideIp ? null : peer.ip,
    mac: peer.hideMac ? null : peer.mac,
  }
}

/** WS 连接时回填节点网络信息：IP 同步写入，MAC 由调用方异步解析后单独更新 */
export function updatePeerIp(peerId: string, ip: string): void {
  const db = openDb()
  db.prepare('UPDATE peers SET ip = ? WHERE id = ?').run(ip, peerId)
}

export function updatePeerMac(peerId: string, mac: string): void {
  const db = openDb()
  db.prepare('UPDATE peers SET mac = ? WHERE id = ?').run(mac, peerId)
}
