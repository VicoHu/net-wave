import { openDb } from './db'
import { findFile, type FileMeta } from './files'
import { findPeer, type Peer } from './peers'

export interface Conversation {
  id: number
  peerA: string
  peerB: string
  createdAt: number
}

export interface MessageRow {
  id: number
  conversationId: number
  senderId: string
  kind: 'text' | 'image' | 'file'
  text: string | null
  fileId: string | null
  file: Omit<FileMeta, 'uploadedBy'> | null
  createdAt: number
}

export interface ConversationSummary extends Conversation {
  peer: Peer
  lastMessage: MessageRow | null
}

/** 两节点间会话唯一化：peer_id 按字典序固定为 (peerA, peerB) */
export function createOrGetConversation(me: string, other: string): Conversation | null {
  if (me === other) return null
  if (!findPeer(me) || !findPeer(other)) return null
  const [a, b] = me < other ? [me, other] : [other, me]
  const db = openDb()
  db.prepare('INSERT OR IGNORE INTO conversations (peer_a, peer_b, created_at) VALUES (?, ?, ?)').run(a, b, Date.now())
  const row = db.prepare('SELECT id, peer_a AS peerA, peer_b AS peerB, created_at AS createdAt FROM conversations WHERE peer_a = ? AND peer_b = ?').get(a, b) as Conversation
  return row ?? null
}

export function findConversation(id: number): Conversation | null {
  const db = openDb()
  const row = db.prepare('SELECT id, peer_a AS peerA, peer_b AS peerB, created_at AS createdAt FROM conversations WHERE id = ?').get(id) as Conversation | undefined
  return row ?? null
}

export function isParticipant(conversation: Conversation, peerId: string): boolean {
  return conversation.peerA === peerId || conversation.peerB === peerId
}

export function otherPeerOf(conversation: Conversation, peerId: string): string | null {
  if (conversation.peerA === peerId) return conversation.peerB
  if (conversation.peerB === peerId) return conversation.peerA
  return null
}

/** 消息统一带文件元数据（LEFT JOIN：文件被删除后仍保留标记为不可下载的元数据） */
const MESSAGE_SELECT = `
  SELECT m.id, m.conversation_id, m.sender_id, m.kind, m.text, m.created_at, m.file_id,
         f.id AS f_id, f.name AS f_name, f.size AS f_size, f.mime AS f_mime,
         f.created_at AS f_created_at, f.deleted_at AS f_deleted_at
  FROM messages m LEFT JOIN files f ON m.file_id = f.id
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
    kind: row.kind as MessageRow['kind'],
    text: (row.text as string | null) ?? null,
    fileId: (row.file_id as string | null) ?? null,
    file,
    createdAt: row.created_at as number,
  }
}

export function listConversations(peerId: string): ConversationSummary[] {
  const db = openDb()
  const rows = db
    .prepare('SELECT id, peer_a AS peerA, peer_b AS peerB, created_at AS createdAt FROM conversations WHERE peer_a = ? OR peer_b = ? ORDER BY id DESC')
    .all(peerId, peerId) as Conversation[]
  return rows.map((conv) => {
    const otherId = otherPeerOf(conv, peerId) ?? ''
    const peer = findPeer(otherId)
    const last = db
      .prepare(`${MESSAGE_SELECT} WHERE m.conversation_id = ? ORDER BY m.id DESC LIMIT 1`)
      .get(conv.id) as Record<string, unknown> | undefined
    return {
      ...conv,
      peer: peer ?? { id: otherId, name: '已离开的节点' },
      lastMessage: last ? rowToMessage(last) : null,
    }
  })
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
    kind: file.kind,
    text: null,
    fileId,
    file,
    createdAt: now,
  }
}
