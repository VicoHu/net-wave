import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

let db: Database.Database | null = null

/** 会话表结构：私聊（peer_a/peer_b）与房间（room_id）共用一张表，type 区分 */
const CONVERSATIONS_SCHEMA = `
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'direct' CHECK (type IN ('direct', 'room')),
  peer_a TEXT,
  peer_b TEXT,
  room_id INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(peer_a, peer_b)
`

/** 打开（并复用）数据中心目录下的 SQLite 数据库，执行轻量迁移 */
export function openDb(dataDir = process.env.DATA_DIR ?? './data'): Database.Database {
  if (db) return db
  mkdirSync(dataDir, { recursive: true })
  db = new Database(join(dataDir, 'net-wave.db'))
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS peers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversations (
      ${CONVERSATIONS_SCHEMA}
    );
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_by TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS room_members (
      room_id INTEGER NOT NULL,
      peer_id TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (room_id, peer_id)
    );
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      size INTEGER NOT NULL,
      mime TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      sender_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'text',
      text TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, id);
  `)
  // 增量迁移：既有库的 messages 增加 file_id（SQLite 无 ADD COLUMN IF NOT EXISTS）
  const messageColumns = db.prepare('PRAGMA table_info(messages)').all() as { name: string }[]
  if (!messageColumns.some((c) => c.name === 'file_id')) {
    db.exec('ALTER TABLE messages ADD COLUMN file_id TEXT')
  }
  // 增量迁移：既有库的 rooms 增加 created_by（创建者可删除房间）
  const roomColumns = db.prepare('PRAGMA table_info(rooms)').all() as { name: string }[]
  if (!roomColumns.some((c) => c.name === 'created_by')) {
    db.exec('ALTER TABLE rooms ADD COLUMN created_by TEXT')
  }
  // 增量迁移：既有库的 peers 增加 ip/mac（消息区展示节点网络信息）
  const peerColumns = db.prepare('PRAGMA table_info(peers)').all() as { name: string }[]
  for (const column of ['ip', 'mac']) {
    if (!peerColumns.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE peers ADD COLUMN ${column} TEXT`)
    }
  }
  // 增量迁移：conversations 增加 type/room_id（旧结构为 peer_a/peer_b NOT NULL，需重建表）
  const convColumns = db.prepare('PRAGMA table_info(conversations)').all() as { name: string }[]
  if (!convColumns.some((c) => c.name === 'type')) {
    db.exec('BEGIN')
    try {
      db.exec(`
        CREATE TABLE conversations_migrated (${CONVERSATIONS_SCHEMA});
        INSERT INTO conversations_migrated (id, type, peer_a, peer_b, created_at)
          SELECT id, 'direct', peer_a, peer_b, created_at FROM conversations;
        DROP TABLE conversations;
        ALTER TABLE conversations_migrated RENAME TO conversations;
      `)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }
  return db
}
