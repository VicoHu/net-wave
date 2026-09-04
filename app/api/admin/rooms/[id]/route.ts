import { NextResponse } from 'next/server'
import { requireAdminSessionToken } from '@/api-auth'
import { deleteRoom, notifyRoomDeleted } from '@/rooms'

/** 管理员可删除任意房间（含旧数据中无创建者的房间） */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = await requireAdminSessionToken()
  if (!token) {
    return NextResponse.json({ error: '未登录或会话已过期' }, { status: 401 })
  }

  const { id } = await params
  const roomId = Number(id)
  const result = Number.isInteger(roomId) ? deleteRoom(roomId, { isAdmin: true }) : { ok: false as const, reason: 'not-found' as const }
  if (!result.ok) {
    return NextResponse.json({ error: '房间不存在' }, { status: 404 })
  }
  notifyRoomDeleted()
  return NextResponse.json({ ok: true })
}
