import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

let db: Database.Database | null = null

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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      peer_a TEXT NOT NULL,
      peer_b TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(peer_a, peer_b)
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
  return db
}
