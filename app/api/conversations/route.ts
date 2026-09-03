import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createOrGetConversation, listConversations } from '@/chat'
import { findPeer } from '@/peers'

async function requirePeerId(): Promise<string | null> {
  const jar = await cookies()
  const peerId = jar.get('nw_peer')?.value
  if (!peerId || !findPeer(peerId)) return null
  return peerId
}

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
  return NextResponse.json(conversation)
}
