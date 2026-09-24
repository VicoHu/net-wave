import { NextResponse } from 'next/server'
import { requirePeerId } from '@/api-auth'
import { clearConversationHideForPeer, createOrGetConversation, listConversations } from '@/chat'
import { findPeer } from '@/peers'

export async function GET() {
  const peerId = await requirePeerId()
  if (!peerId) return NextResponse.json({ error: '未识别的节点身份' }, { status: 401 })
  return NextResponse.json({ conversations: listConversations(peerId) })
}

export async function POST(request: Request) {
  const peerId = await requirePeerId()
  if (!peerId) return NextResponse.json({ error: '未识别的节点身份' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { peerId?: unknown } | null
  const otherId = typeof body?.peerId === 'string' ? body.peerId : ''
  if (!otherId || !findPeer(otherId)) {
    return NextResponse.json({ error: '对方节点不存在' }, { status: 400 })
  }

  const conversation = createOrGetConversation(peerId, otherId)
  if (!conversation) {
    return NextResponse.json({ error: '无法创建会话' }, { status: 400 })
  }
  // 本人再次发起私聊即解除本人对该会话的隐藏（CONTEXT.md「隐藏」词条：再次发起时恢复显示）
  clearConversationHideForPeer(conversation.id, peerId)
  return NextResponse.json(conversation)
}
