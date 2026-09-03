import { NextResponse } from 'next/server'
import { getHub } from '@/hub'
import { requirePeerId } from '@/api-auth'
import { createRoom, listRooms } from '@/rooms'

export async function GET() {
  const peerId = await requirePeerId()
  if (!peerId) return NextResponse.json({ error: '未识别的节点身份' }, { status: 401 })
  return NextResponse.json({ rooms: listRooms() })
}

export async function POST(request: Request) {
  const peerId = await requirePeerId()
  if (!peerId) return NextResponse.json({ error: '未识别的节点身份' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { name?: unknown } | null
  const name = typeof body?.name === 'string' ? body.name : ''
  const room = createRoom(peerId, name)
  if (!room) {
    return NextResponse.json({ error: '房间名需在 1-50 个字符之间' }, { status: 400 })
  }
  // 建房即加入：自己的会话列表立即出现该房间
  getHub().sendToPeer(peerId, 'conversations-updated', {})
  getHub().broadcast('rooms-updated', {})
  return NextResponse.json(room)
}
