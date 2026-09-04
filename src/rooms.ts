import { openDb } from './db'
import { findPeer } from './peers'
import { getHub } from './hub'

/** 房间被删除后通知全员刷新会话与公开房间两类列表（创建者/管理员删除共用） */
export function notifyRoomDeleted(): void {
  getHub().broadcast('conversations-updated', {})
  getHub().broadcast('rooms-updated', {})
}

export interface RoomInfo {
  id: number
  name: string
  createdBy: string | null
  memberCount: number
  conversationId: number
}

const ROOM_SELECT = `
  SELECT r.id, r.name, r.created_by AS createdBy,
         (SELECT COUNT(*) FROM room_members m WHERE m.room_id = r.id) AS memberCount,
         c.id AS conversationId
  FROM rooms r JOIN conversations c ON c.room_id = r.id
`

export function createRoom(peerId: string, name: string): RoomInfo | null {
  const trimmed = name.trim()
  if (trimmed.length < 1 || trimmed.length > 50) return null
  if (!findPeer(peerId)) return null
  const db = openDb()
  const now = Date.now()
  const room = db.prepare('INSERT INTO rooms (name, created_by, created_at) VALUES (?, ?, ?)').run(trimmed, peerId, now)
  const roomId = Number(room.lastInsertRowid)
  const conversation = db
    .prepare("INSERT INTO conversations (type, room_id, created_at) VALUES ('room', ?, ?)")
    .run(roomId, now)
  const conversationId = Number(conversation.lastInsertRowid)
  db.prepare('INSERT OR IGNORE INTO room_members (room_id, peer_id, joined_at) VALUES (?, ?, ?)').run(roomId, peerId, now)
  return { id: roomId, name: trimmed, createdBy: peerId, memberCount: 1, conversationId }
}

export function listRooms(): RoomInfo[] {
  const db = openDb()
  return db.prepare(`${ROOM_SELECT} ORDER BY r.id DESC`).all() as RoomInfo[]
}

/** 管理端房间列表：附带创建者昵称、消息数与创建时间 */
export function listRoomsForAdmin(): (RoomInfo & { creatorName: string | null; messageCount: number; createdAt: number })[] {
  const db = openDb()
  return db
    .prepare(`
      SELECT r.id, r.name, r.created_by AS createdBy, r.created_at AS createdAt,
             (SELECT COUNT(*) FROM room_members m WHERE m.room_id = r.id) AS memberCount,
             (SELECT COUNT(*) FROM messages msg JOIN conversations c ON msg.conversation_id = c.id WHERE c.room_id = r.id) AS messageCount,
             c.id AS conversationId,
             p.name AS creatorName
      FROM rooms r
      JOIN conversations c ON c.room_id = r.id
      LEFT JOIN peers p ON r.created_by = p.id
      ORDER BY r.id DESC
    `)
    .all() as (RoomInfo & { creatorName: string | null; messageCount: number; createdAt: number })[]
}

function findRoom(roomId: number): RoomInfo | null {
  const db = openDb()
  const row = db.prepare(`${ROOM_SELECT} WHERE r.id = ?`).get(roomId) as RoomInfo | undefined
  return row ?? null
}

export type RoomDeletion = { ok: true } | { ok: false; reason: 'not-found' | 'forbidden' }

/**
 * 删除房间及其全部关联数据（成员、会话与历史消息）。
 * 仅创建者本人或已认证的管理员可删；旧数据中 created_by 为空时只有管理员可删。
 */
export function deleteRoom(roomId: number, actor: { byPeerId?: string; isAdmin?: boolean }): RoomDeletion {
  const db = openDb()
  const room = db
    .prepare('SELECT id, created_by AS createdBy FROM rooms WHERE id = ?')
    .get(roomId) as { id: number; createdBy: string | null } | undefined
  if (!room) return { ok: false, reason: 'not-found' }
  const allowed = actor.isAdmin === true || (actor.byPeerId != null && room.createdBy === actor.byPeerId)
  if (!allowed) return { ok: false, reason: 'forbidden' }

  db.transaction(() => {
    db.prepare('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE room_id = ?)').run(roomId)
    db.prepare('DELETE FROM conversations WHERE room_id = ?').run(roomId)
    db.prepare('DELETE FROM room_members WHERE room_id = ?').run(roomId)
    db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId)
  })()
  return { ok: true }
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
