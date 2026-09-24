import { NextResponse } from 'next/server'
import { requirePeerId } from '@/api-auth'
import { hideConversationForPeer } from '@/chat'

/** 关闭私信：仅从当前节点的会话列表移除（聊天记录保留，对方不受影响） */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const peerId = await requirePeerId()
  if (!peerId) {
    return NextResponse.json({ error: '未识别的节点身份' }, { status: 401 })
  }

  const { id } = await params
  const conversationId = Number(id)
  const result = Number.isInteger(conversationId)
    ? hideConversationForPeer(conversationId, peerId)
    : ({ ok: false as const, reason: 'not-found' as const })
  if (!result.ok) {
    if (result.reason === 'forbidden') {
      return NextResponse.json({ error: '无权访问该会话' }, { status: 403 })
    }
    return NextResponse.json({ error: '会话不存在' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
