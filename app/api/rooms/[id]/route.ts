import { NextResponse } from 'next/server'
import { requirePeerId } from '@/api-auth'
import { deleteRoom, notifyRoomDeleted } from '@/rooms'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const peerId = await requirePeerId()
  if (!peerId) {
    return NextResponse.json({ error: '未识别的节点身份' }, { status: 401 })
  }

  const { id } = await params
  const roomId = Number(id)
  const result = Number.isInteger(roomId) ? deleteRoom(roomId, { byPeerId: peerId }) : { ok: false as const, reason: 'not-found' as const }
  if (!result.ok) {
    if (result.reason === 'forbidden') {
      return NextResponse.json({ error: '只有房间创建者可以删除该房间' }, { status: 403 })
    }
    return NextResponse.json({ error: '房间不存在' }, { status: 404 })
  }
  // 房间与成员的会话列表都可能包含该房间：全员刷新两类列表
  notifyRoomDeleted()
  return NextResponse.json({ ok: true })
}
