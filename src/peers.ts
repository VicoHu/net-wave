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
}

export function randomPeerName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  return `${adj}${noun}`
}

export function createPeer(): Peer {
  const db = openDb()
  const peer: Peer = { id: randomUUID(), name: randomPeerName(), ip: null, mac: null }
  db.prepare('INSERT INTO peers (id, name, created_at) VALUES (?, ?, ?)').run(peer.id, peer.name, Date.now())
  return peer
}

export function findPeer(id: string): Peer | null {
  const db = openDb()
  const row = db.prepare('SELECT id, name, ip, mac FROM peers WHERE id = ?').get(id) as Peer | undefined
  return row ?? null
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
  const rows = db.prepare(`SELECT id, name, ip, mac FROM peers WHERE id IN (${placeholders})`).all(...ids) as Peer[]
  return rows
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
