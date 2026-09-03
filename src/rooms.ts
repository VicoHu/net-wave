import { openDb } from './db'
import { findPeer } from './peers'

export interface RoomInfo {
  id: number
  name: string
  memberCount: number
  conversationId: number
}

export function createRoom(peerId: string, name: string): RoomInfo | null {
  const trimmed = name.trim()
  if (trimmed.length < 1 || trimmed.length > 50) return null
  if (!findPeer(peerId)) return null
  const db = openDb()
  const now = Date.now()
  const room = db.prepare('INSERT INTO rooms (name, created_at) VALUES (?, ?)').run(trimmed, now)
  const roomId = Number(room.lastInsertRowid)
  const conversation = db
    .prepare("INSERT INTO conversations (type, room_id, created_at) VALUES ('room', ?, ?)")
    .run(roomId, now)
  const conversationId = Number(conversation.lastInsertRowid)
  db.prepare('INSERT OR IGNORE INTO room_members (room_id, peer_id, joined_at) VALUES (?, ?, ?)').run(roomId, peerId, now)
  return { id: roomId, name: trimmed, memberCount: 1, conversationId }
}

export function listRooms(): RoomInfo[] {
  const db = openDb()
  const rows = db
    .prepare(`
      SELECT r.id, r.name,
             (SELECT COUNT(*) FROM room_members m WHERE m.room_id = r.id) AS memberCount,
             c.id AS conversationId
      FROM rooms r JOIN conversations c ON c.room_id = r.id
      ORDER BY r.id DESC
    `)
    .all() as RoomInfo[]
  return rows
}

export function findRoom(roomId: number): RoomInfo | null {
  const db = openDb()
  const row = db
    .prepare(`
      SELECT r.id, r.name,
             (SELECT COUNT(*) FROM room_members m WHERE m.room_id = r.id) AS memberCount,
             c.id AS conversationId
      FROM rooms r JOIN conversations c ON c.room_id = r.id
      WHERE r.id = ?
    `)
    .get(roomId) as RoomInfo | undefined
  return row ?? null
}

export function joinRoom(peerId: string, roomId: number): RoomInfo | null {
  const room = findRoom(roomId)
  if (!room || !findPeer(peerId)) return null
  const db = openDb()
  db.prepare('INSERT OR IGNORE INTO room_members (room_id, peer_id, joined_at) VALUES (?, ?, ?)').run(roomId, peerId, Date.now())
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM room_members WHERE room_id = ?').get(roomId) as { n: number }
  return { ...room, memberCount: n }
}

export function isRoomMember(roomId: number, peerId: string): boolean {
  const db = openDb()
  return db.prepare('SELECT 1 FROM room_members WHERE room_id = ? AND peer_id = ?').get(roomId, peerId) != null
}

export function roomMemberIds(roomId: number): string[] {
  const db = openDb()
  return (db.prepare('SELECT peer_id FROM room_members WHERE room_id = ?').all(roomId) as { peer_id: string }[]).map(
    (r) => r.peer_id,
  )
}
