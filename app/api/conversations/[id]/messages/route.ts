import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { canAccessConversation, findConversation, listMessages } from '@/chat'
import { findPeer } from '@/peers'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const jar = await cookies()
  const peerId = jar.get('nw_peer')?.value
  if (!peerId || !findPeer(peerId)) {
    return NextResponse.json({ error: '未识别的节点身份' }, { status: 401 })
  }

  const { id } = await params
  const conversationId = Number(id)
  const conversation = Number.isInteger(conversationId) ? findConversation(conversationId) : null
  if (!conversation) {
    return NextResponse.json({ error: '会话不存在' }, { status: 404 })
  }
  if (!canAccessConversation(conversation, peerId)) {
    return NextResponse.json({ error: '无权访问该会话' }, { status: 403 })
  }

  const url = new URL(request.url)
  const beforeRaw = url.searchParams.get('before')
  const before = beforeRaw ? Number(beforeRaw) : undefined
  const messages = listMessages(conversationId, Number.isInteger(before) ? before : undefined)
  return NextResponse.json({ messages })
}
