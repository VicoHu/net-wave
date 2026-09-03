import busboy from 'busboy'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web'
import { saveFileStream } from '@/files'
import { findPeer } from '@/peers'

/** 去路径、控制字符与过长部分，避免落库异常文件名 */
function sanitizeFilename(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? ''
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return cleaned.slice(0, 200) || '未命名文件'
}

export async function POST(request: Request) {
  const jar = await cookies()
  const peerId = jar.get('nw_peer')?.value
  if (!peerId || !findPeer(peerId)) {
    return NextResponse.json({ error: '未识别的节点身份' }, { status: 401 })
  }

  const bb = busboy({
    headers: { 'content-type': request.headers.get('content-type') ?? '' },
    defParamCharset: 'utf-8',
    limits: { files: 1 },
  })

  const part = new Promise<{ stream: Readable; name: string; mime: string } | null>((resolve, reject) => {
    let settled = false
    bb.on('file', (_field, stream, info) => {
      if (settled) {
        stream.resume()
        return
      }
      settled = true
      resolve({
        stream,
        name: sanitizeFilename(info.filename),
        mime: info.mimeType || 'application/octet-stream',
      })
    })
    bb.on('error', reject)
    const finishWithoutFile = () => {
      if (!settled) resolve(null)
    }
    bb.on('finish', finishWithoutFile)
    bb.on('close', finishWithoutFile)
  })

  Readable.fromWeb(request.body as unknown as NodeWebReadableStream).pipe(bb)

  const file = await part
  if (!file) {
    return NextResponse.json({ error: '缺少文件字段' }, { status: 400 })
  }
  try {
    const meta = await saveFileStream(file.stream, file.name, file.mime, peerId)
    return NextResponse.json({ fileId: meta.id, name: meta.name, size: meta.size, mime: meta.mime, kind: meta.kind })
  } catch (err) {
    console.error('文件保存失败', err)
    return NextResponse.json({ error: '文件保存失败' }, { status: 500 })
  }
}
