import { randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { PassThrough, type Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { openDb } from './db'

export interface FileMeta {
  id: string
  name: string
  size: number
  mime: string
  kind: 'image' | 'file'
  uploadedBy: string
  createdAt: number
  deleted: boolean
}

function filesRoot(): string {
  return join(process.env.DATA_DIR ?? './data', 'files')
}

export function filePath(id: string): string {
  // id 由中心生成的 UUID，不接受调用方拼接路径
  return join(filesRoot(), id)
}

function rowToMeta(row: Record<string, unknown>): FileMeta {
  const mime = row.mime as string
  return {
    id: row.id as string,
    name: row.name as string,
    size: row.size as number,
    mime,
    kind: mime.startsWith('image/') ? 'image' : 'file',
    uploadedBy: row.uploaded_by as string,
    createdAt: row.created_at as number,
    deleted: row.deleted_at != null,
  }
}

/** 流式落盘并记录元数据：全程 pipe，不在内存中缓冲文件内容 */
export async function saveFileStream(source: Readable, name: string, mime: string, uploadedBy: string): Promise<FileMeta> {
  const id = randomUUID()
  mkdirSync(filesRoot(), { recursive: true })
  let size = 0
  const counter = new PassThrough({
    transform(chunk, _enc, cb) {
      size += chunk.length
      cb(null, chunk)
    },
  })
  await pipeline(source, counter, createWriteStream(filePath(id)))

  const createdAt = Date.now()
  const db = openDb()
  db.prepare('INSERT INTO files (id, name, size, mime, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, name, size, mime, uploadedBy, createdAt)
  return { id, name, size, mime, kind: mime.startsWith('image/') ? 'image' : 'file', uploadedBy, createdAt, deleted: false }
}

export function findFile(id: string): FileMeta | null {
  const db = openDb()
  const row = db.prepare('SELECT * FROM files WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? rowToMeta(row) : null
}

/** 落盘文件读取流（下载用）；调用方需先确认文件存在且未删除 */
export function readFileStream(id: string): Readable {
  return createReadStream(filePath(id))
}

/** 删除文件：磁盘释放 + 标记 deleted_at，历史消息保留元数据但不可再下载 */
export function deleteFile(id: string): boolean {
  const db = openDb()
  const row = db.prepare('SELECT id FROM files WHERE id = ?').get(id)
  if (!row) return false
  db.prepare('UPDATE files SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').run(Date.now(), id)
  try {
    unlinkSync(filePath(id))
  } catch {
    // 磁盘上已无该文件时视为幂等成功
  }
  return true
}

/** 存储管理：当前落盘的全部文件与总占用 */
export function listFiles(): { files: FileMeta[]; totalSize: number } {
  const db = openDb()
  const rows = db
    .prepare('SELECT * FROM files WHERE deleted_at IS NULL ORDER BY created_at DESC')
    .all() as Record<string, unknown>[]
  const files = rows.map(rowToMeta)
  return { files, totalSize: files.reduce((sum, f) => sum + f.size, 0) }
}
