import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { canAccessConversation, findConversation } from '@/chat'
import { findFile, readFileStream } from '@/files'
import { findPeer } from '@/peers'
import { openDb } from '@/db'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const jar = await cookies()
  const peerId = jar.get('nw_peer')?.value
  if (!peerId || !findPeer(peerId)) {
    return NextResponse.json({ error: '未识别的节点身份' }, { status: 401 })
  }

  const { id } = await params
  const file = findFile(id)
  if (!file) {
    return NextResponse.json({ error: '文件不存在' }, { status: 404 })
  }
  if (file.deleted) {
    return NextResponse.json({ error: '文件已被删除' }, { status: 410 })
  }

  // 已进入会话的文件按会话可见性校验；尚未随消息发送的文件仅上传者可访问
  const db = openDb()
  const ref = db.prepare('SELECT conversation_id FROM messages WHERE file_id = ? LIMIT 1').get(id) as { conversation_id: number } | undefined
  if (ref) {
    const conversation = findConversation(ref.conversation_id)
    if (!conversation || !canAccessConversation(conversation, peerId)) {
      return NextResponse.json({ error: '无权访问该文件' }, { status: 403 })
    }
  } else if (file.uploadedBy !== peerId) {
    return NextResponse.json({ error: '无权访问该文件' }, { status: 403 })
  }

  // 图片 inline 供消息内联展示，其余文件作为附件下载
  const disposition = file.kind === 'image' ? 'inline' : 'attachment'
  return new Response(readFileStream(file.id) as unknown as ReadableStream<Uint8Array>, {
    headers: {
      'Content-Type': file.mime,
      'Content-Length': String(file.size),
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    },
  })
}
