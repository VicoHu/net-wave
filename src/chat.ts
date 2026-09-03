import { openDb } from './db'
import { findFile, type FileMeta } from './files'
import { findPeer, type Peer } from './peers'
import { isRoomMember } from './rooms'

export interface Conversation {
  id: number
  type: 'direct' | 'room'
  peerA: string | null
  peerB: string | null
  roomId: number | null
  createdAt: number
}

export interface MessageRow {
  id: number
  conversationId: number
  senderId: string
  senderName: string
  kind: 'text' | 'image' | 'file'
  text: string | null
  fileId: string | null
  file: Omit<FileMeta, 'uploadedBy'> | null
  createdAt: number
}

/** 私聊会话摘要（type=direct） */
export interface DirectSummary extends Conversation {
  type: 'direct'
  peer: Peer
  lastMessage: MessageRow | null
}

/** 房间会话摘要（type=room） */
export interface RoomSummary extends Conversation {
  type: 'room'
  room: { id: number; name: string; memberCount: number }
  lastMessage: MessageRow | null
}

export type ConversationSummary = DirectSummary | RoomSummary

/** 两节点间会话唯一化：peer_id 按字典序固定为 (peerA, peerB) */
export function createOrGetConversation(me: string, other: string): Conversation | null {
  if (me === other) return null
  if (!findPeer(me) || !findPeer(other)) return null
  const [a, b] = me < other ? [me, other] : [other, me]
  const db = openDb()
  db.prepare("INSERT OR IGNORE INTO conversations (type, peer_a, peer_b, created_at) VALUES ('direct', ?, ?, ?)").run(a, b, Date.now())
  const row = db.prepare('SELECT * FROM conversations WHERE peer_a = ? AND peer_b = ?').get(a, b) as Record<string, unknown> | undefined
  return row ? rowToConversation(row) : null
}

function rowToConversation(row: Record<string, unknown>): Conversation {
  return {
    id: row.id as number,
    type: row.type as Conversation['type'],
    peerA: (row.peer_a as string | null) ?? null,
    peerB: (row.peer_b as string | null) ?? null,
    roomId: (row.room_id as number | null) ?? null,
    createdAt: row.created_at as number,
  }
}

export function findConversation(id: number): Conversation | null {
  const db = openDb()
  const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? rowToConversation(row) : null
}

export function isParticipant(conversation: Conversation, peerId: string): boolean {
  return conversation.peerA === peerId || conversation.peerB === peerId
}

/** 会话可见性：私聊看双方，房间看成员 */
export function canAccessConversation(conversation: Conversation, peerId: string): boolean {
  if (conversation.type === 'room') {
    return conversation.roomId != null && isRoomMember(conversation.roomId, peerId)
  }
  return isParticipant(conversation, peerId)
}

export function otherPeerOf(conversation: Conversation, peerId: string): string | null {
  if (conversation.peerA === peerId) return conversation.peerB
  if (conversation.peerB === peerId) return conversation.peerA
  return null
}

/** 消息统一带文件元数据（LEFT JOIN：文件被删除后仍保留标记为不可下载的元数据）与发送者昵称 */
const MESSAGE_SELECT = `
  SELECT m.id, m.conversation_id, m.sender_id, m.kind, m.text, m.created_at, m.file_id,
         f.id AS f_id, f.name AS f_name, f.size AS f_size, f.mime AS f_mime,
         f.created_at AS f_created_at, f.deleted_at AS f_deleted_at,
         p.name AS sender_name
  FROM messages m
  LEFT JOIN files f ON m.file_id = f.id
  LEFT JOIN peers p ON m.sender_id = p.id
`

function rowToMessage(row: Record<string, unknown>): MessageRow {
  const file =
    row.f_id != null
      ? {
          id: row.f_id as string,
          name: row.f_name as string,
          size: row.f_size as number,
          mime: row.f_mime as string,
          kind: ((row.f_mime as string).startsWith('image/') ? 'image' : 'file') as FileMeta['kind'],
          createdAt: row.f_created_at as number,
          deleted: row.f_deleted_at != null,
        }
      : null
  return {
    id: row.id as number,
    conversationId: row.conversation_id as number,
    senderId: row.sender_id as string,
    senderName: (row.sender_name as string | null) ?? '已离开的节点',
    kind: row.kind as MessageRow['kind'],
    text: (row.text as string | null) ?? null,
    fileId: (row.file_id as string | null) ?? null,
    file,
    createdAt: row.created_at as number,
  }
}

export function listConversations(peerId: string): ConversationSummary[] {
  const db = openDb()
  const lastOf = (conversationId: number): MessageRow | null => {
    const row = db
      .prepare(`${MESSAGE_SELECT} WHERE m.conversation_id = ? ORDER BY m.id DESC LIMIT 1`)
      .get(conversationId) as Record<string, unknown> | undefined
    return row ? rowToMessage(row) : null
  }

  const directRows = db
    .prepare("SELECT * FROM conversations WHERE type = 'direct' AND (peer_a = ? OR peer_b = ?) ORDER BY id DESC")
    .all(peerId, peerId) as Record<string, unknown>[]
  const directs: DirectSummary[] = directRows.map((row) => {
    const conv = rowToConversation(row)
    const otherId = otherPeerOf(conv, peerId) ?? ''
    return {
      ...conv,
      type: 'direct',
      peer: findPeer(otherId) ?? { id: otherId, name: '已离开的节点' },
      lastMessage: lastOf(conv.id),
    }
  })

  const roomRows = db
    .prepare(`
      SELECT c.*, r.name AS room_name,
             (SELECT COUNT(*) FROM room_members m WHERE m.room_id = r.id) AS member_count
      FROM conversations c
      JOIN rooms r ON c.room_id = r.id
      JOIN room_members mem ON mem.room_id = r.id AND mem.peer_id = ?
      WHERE c.type = 'room'
      ORDER BY c.id DESC
    `)
    .all(peerId) as Record<string, unknown>[]
  const rooms: RoomSummary[] = roomRows.map((row) => ({
    ...rowToConversation(row),
    type: 'room',
    room: { id: row.room_id as number, name: row.room_name as string, memberCount: row.member_count as number },
    lastMessage: lastOf(row.id as number),
  }))

  return [...directs, ...rooms].sort((a, b) => b.id - a.id)
}

export function listMessages(conversationId: number, before?: number, limit = 50): MessageRow[] {
  const db = openDb()
  const rows = before
    ? db.prepare(`${MESSAGE_SELECT} WHERE m.conversation_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?`).all(conversationId, before, limit)
    : db.prepare(`${MESSAGE_SELECT} WHERE m.conversation_id = ? ORDER BY m.id DESC LIMIT ?`).all(conversationId, limit)
  return (rows as Record<string, unknown>[]).map(rowToMessage).reverse()
}

export function addMessage(conversationId: number, senderId: string, text: string): MessageRow {
  const db = openDb()
  const now = Date.now()
  const result = db
    .prepare('INSERT INTO messages (conversation_id, sender_id, kind, text, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(conversationId, senderId, 'text', text, now)
  return {
    id: Number(result.lastInsertRowid),
    conversationId,
    senderId,
    senderName: findPeer(senderId)?.name ?? '已离开的节点',
    kind: 'text',
    text,
    fileId: null,
    file: null,
    createdAt: now,
  }
}

/** 文件消息：kind 由文件 mime 推导（图片内联展示，其余为文件卡片） */
export function addFileMessage(conversationId: number, senderId: string, fileId: string): MessageRow | null {
  const file = findFile(fileId)
  if (!file || file.deleted) return null
  const db = openDb()
  const now = Date.now()
  const result = db
    .prepare('INSERT INTO messages (conversation_id, sender_id, kind, file_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(conversationId, senderId, file.kind, fileId, now)
  return {
    id: Number(result.lastInsertRowid),
    conversationId,
    senderId,
    senderName: findPeer(senderId)?.name ?? '已离开的节点',
    kind: file.kind,
    text: null,
    fileId,
    file,
    createdAt: now,
  }
}
