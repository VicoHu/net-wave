import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getHub } from '@/hub'
import { createPeer, findPeer, renamePeer } from '@/peers'

export async function GET() {
  const jar = await cookies()
  const existingId = jar.get('nw_peer')?.value
  const existing = existingId ? findPeer(existingId) : null
  const peer = existing ?? createPeer()

  const res = NextResponse.json({ id: peer.id, name: peer.name })
  if (peer.id !== existingId) {
    res.cookies.set('nw_peer', peer.id, { httpOnly: true, sameSite: 'lax', path: '/' })
  }
  return res
}

export async function PATCH(request: Request) {
  const jar = await cookies()
  const peerId = jar.get('nw_peer')?.value
  if (!peerId || !findPeer(peerId)) {
    return NextResponse.json({ error: '未识别的节点身份' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { name?: unknown } | null
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (name.length < 1 || name.length > 20) {
    return NextResponse.json({ error: '昵称长度需在 1-20 个字符之间' }, { status: 400 })
  }

  const peer = renamePeer(peerId, name)
  if (!peer) {
    return NextResponse.json({ error: '节点不存在' }, { status: 404 })
  }
  getHub().notifyPresenceChanged()
  return NextResponse.json(peer)
}
