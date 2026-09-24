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
  kind: 'image' | 'video' | 'file'
  uploadedBy: string
  createdAt: number
  deleted: boolean
  accessCount: number
  lastAccessAt: number | null
}

/** 消息与文件统一的类型推导：图片内联展示，视频点击下载后播放，其余按文件卡片呈现 */
export function fileKind(mime: string): FileMeta['kind'] {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  return 'file'
}

function filesRoot(): string {
  return join(process.env.DATA_DIR ?? './data', 'files')
}

function filePath(id: string): string {
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
    kind: fileKind(mime),
    uploadedBy: row.uploaded_by as string,
    createdAt: row.created_at as number,
    deleted: row.deleted_at != null,
    accessCount: (row.access_count as number | null) ?? 0,
    lastAccessAt: (row.last_access_at as number | null) ?? null,
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
  return { id, name, size, mime, kind: fileKind(mime), uploadedBy, createdAt, deleted: false, accessCount: 0, lastAccessAt: null }
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

/** 访问计数：文件端点完整响应一次即计一次，内联预览与附件下载不区分（ADR-0005） */
export function recordAccess(id: string): void {
  openDb()
    .prepare('UPDATE files SET access_count = access_count + 1, last_access_at = ? WHERE id = ? AND deleted_at IS NULL')
    .run(Date.now(), id)
}

/** 批量删除：与单个删除同语义（软删 + 释放磁盘），返回删除数与释放空间 */
export function deleteFiles(ids: string[]): { deleted: number; freedSize: number } {
  if (ids.length === 0) return { deleted: 0, freedSize: 0 }
  const db = openDb()
  const rows = db
    .prepare(
      `UPDATE files SET deleted_at = ?
       WHERE deleted_at IS NULL AND id IN (${ids.map(() => '?').join(',')})
       RETURNING id, size`,
    )
    .all(Date.now(), ...ids) as { id: string; size: number }[]
  for (const row of rows) {
    try {
      unlinkSync(filePath(row.id))
    } catch {
      // 磁盘上已无该文件时视为幂等成功
    }
  }
  return { deleted: rows.length, freedSize: rows.reduce((sum, r) => sum + r.size, 0) }
}

/** 上传者已注销/不存在时的统一占位昵称 */
const DEPARTED_PEER_NAME = '已离开的节点'

/** 存储管理查询：范围（普通节点仅自己上传）与批量删除的条件筛选（AND 组合，均可选） */
export interface StorageQuery {
  uploadedBy?: string
  /** 文件大小大于该值（字节，不含等于） */
  minSize?: number
  /** 上传时间不晚于该时间戳 */
  before?: number
}

export interface StorageFileEntry extends FileMeta {
  uploaderName: string
  /** 所属会话标签：私聊为「甲 与 乙 的私聊」，房间为房间名；未随消息发送的文件为 null */
  conversationLabel: string | null
}

/** 存储管理列表：当前落盘文件 + 上传者昵称 + 所属会话标签 + 总占用 */
export function listStorageFiles(query: StorageQuery = {}): { files: StorageFileEntry[]; totalSize: number } {
  const db = openDb()
  const where: string[] = ['f.deleted_at IS NULL']
  const params: (string | number)[] = []
  if (query.uploadedBy) {
    where.push('f.uploaded_by = ?')
    params.push(query.uploadedBy)
  }
  if (query.minSize != null) {
    where.push('f.size > ?')
    params.push(query.minSize)
  }
  if (query.before != null) {
    where.push('f.created_at <= ?')
    params.push(query.before)
  }
  const rows = db
    .prepare(
      `SELECT f.*, p.name AS uploader_name,
              (SELECT m.conversation_id FROM messages m WHERE m.file_id = f.id LIMIT 1) AS conversation_id
       FROM files f
       LEFT JOIN peers p ON p.id = f.uploaded_by
       WHERE ${where.join(' AND ')}
       ORDER BY f.created_at DESC`,
    )
    .all(...params) as Record<string, unknown>[]

  // 会话标签按 conversation_id 批量补齐；同一文件只取最早一条消息定位会话
  const convIds = [...new Set(rows.map((row) => row.conversation_id).filter((v) => v != null))] as number[]
  const convRows = convIds.length
    ? (db
        .prepare(
          `SELECT c.id, c.type, c.peer_a, c.peer_b, r.name AS room_name
           FROM conversations c LEFT JOIN rooms r ON r.id = c.room_id
           WHERE c.id IN (${convIds.map(() => '?').join(',')})`,
        )
        .all(...convIds) as Record<string, unknown>[])
    : []
  const nameOf = (peerId: string | null): string => {
    if (!peerId) return DEPARTED_PEER_NAME
    const peer = db.prepare('SELECT name FROM peers WHERE id = ?').get(peerId) as { name: string } | undefined
    return peer?.name ?? DEPARTED_PEER_NAME
  }
  const labelOf = new Map<number, string>()
  for (const conv of convRows) {
    labelOf.set(
      conv.id as number,
      conv.type === 'room'
        ? ((conv.room_name as string | null) ?? '已删除的房间')
        : `${nameOf(conv.peer_a as string | null)} 与 ${nameOf(conv.peer_b as string | null)} 的私聊`,
    )
  }

  const files: StorageFileEntry[] = rows.map((row) => ({
    ...rowToMeta(row),
    uploaderName: (row.uploader_name as string | null) ?? DEPARTED_PEER_NAME,
    conversationLabel: row.conversation_id != null ? (labelOf.get(row.conversation_id as number) ?? null) : null,
  }))
  return { files, totalSize: files.reduce((sum, f) => sum + f.size, 0) }
}
