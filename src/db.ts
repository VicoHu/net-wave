import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

let db: Database.Database | null = null

/** 打开（并复用）数据中心目录下的 SQLite 数据库 */
export function openDb(dataDir = process.env.DATA_DIR ?? './data'): Database.Database {
  if (db) return db
  mkdirSync(dataDir, { recursive: true })
  db = new Database(join(dataDir, 'net-wave.db'))
  db.pragma('journal_mode = WAL')
  return db
}
