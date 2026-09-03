import { NextResponse } from 'next/server'
import { getHub } from '@/hub'
import { requirePeerId } from '@/api-auth'
import { joinRoom } from '@/rooms'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const peerId = await requirePeerId()
  if (!peerId) {
    return NextResponse.json({ error: '未识别的节点身份' }, { status: 401 })
  }

  const { id } = await params
  const roomId = Number(id)
  const room = Number.isInteger(roomId) ? joinRoom(peerId, roomId) : null
  if (!room) {
    return NextResponse.json({ error: '房间不存在' }, { status: 404 })
  }
  // 加入者本地会话列表更新；全员刷新公开房间列表的人数
  getHub().sendToPeer(peerId, 'conversations-updated', {})
  getHub().broadcast('rooms-updated', {})
  return NextResponse.json(room)
}
