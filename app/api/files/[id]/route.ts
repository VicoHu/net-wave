import { NextResponse } from 'next/server'
import { requireAdminSessionToken, requirePeerId } from '@/api-auth'
import { canAccessConversation, findConversationOfFile } from '@/chat'
import { deleteFile, findFile, recordAccess, readFileStream } from '@/files'
import { getHub } from '@/hub'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  // 管理员会话可访问任意文件（存储治理需要，ADR-0005：管理员下载同样计入访问）；
  // 其余身份按会话可见性校验：已进入会话的文件看会话，尚未随消息发送的文件仅上传者可访问
  const isAdmin = (await requireAdminSessionToken()) != null
  const peerId = await requirePeerId()
  if (!isAdmin && !peerId) {
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

  if (!isAdmin && peerId) {
    const conversation = findConversationOfFile(file.id)
    if (conversation) {
      if (!canAccessConversation(conversation, peerId)) {
        return NextResponse.json({ error: '无权访问该文件' }, { status: 403 })
      }
    } else if (file.uploadedBy !== peerId) {
      return NextResponse.json({ error: '无权访问该文件' }, { status: 403 })
    }
  }

  recordAccess(file.id)
  // 图片/视频 inline 供消息内联展示（模糊封面取首帧），其余文件作为附件下载
  const disposition = file.kind === 'file' ? 'attachment' : 'inline'
  return new Response(readFileStream(file.id) as unknown as ReadableStream<Uint8Array>, {
    headers: {
      'Content-Type': file.mime,
      'Content-Length': String(file.size),
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    },
  })
}

/** 存储管理：删除落盘文件并标记元数据（仅管理员，ADR-0004）；历史消息保留但下载入口失效 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdminSessionToken())) {
    return NextResponse.json({ error: '仅管理员可删除文件' }, { status: 403 })
  }

  const { id } = await params
  if (!deleteFile(id)) {
    return NextResponse.json({ error: '文件不存在' }, { status: 404 })
  }
  // 在线节点重拉历史，消息卡片即时呈现「已删除」标记
  getHub().broadcast('conversations-updated', {})
  return NextResponse.json({ ok: true })
}
