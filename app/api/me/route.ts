import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getHub } from '@/hub'
import { createPeer, findPeer, renamePeer, setPeerPrivacy } from '@/peers'

export async function GET() {
  const jar = await cookies()
  const existingId = jar.get('nw_peer')?.value
  const existing = existingId ? findPeer(existingId) : null
  const peer = existing ?? createPeer()

  // hideIp/hideMac 供本机初始化「显示 IP/MAC」开关（该偏好在服务端持久，为唯一数据源）
  const res = NextResponse.json({ id: peer.id, name: peer.name, hideIp: peer.hideIp, hideMac: peer.hideMac })
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

  const body = (await request.json().catch(() => null)) as { name?: unknown; hideIp?: unknown; hideMac?: unknown } | null
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const hideIp = typeof body?.hideIp === 'boolean' ? body.hideIp : null
  const hideMac = typeof body?.hideMac === 'boolean' ? body.hideMac : null
  if (name === '' && hideIp == null && hideMac == null) {
    return NextResponse.json({ error: '需提供 name 或 hideIp/hideMac' }, { status: 400 })
  }

  let peer = findPeer(peerId)
  if (name !== '') {
    if (name.length > 20) {
      return NextResponse.json({ error: '昵称长度需在 1-20 个字符之间' }, { status: 400 })
    }
    peer = renamePeer(peerId, name)
  }
  if (hideIp != null || hideMac != null) {
    peer = setPeerPrivacy(peerId, { hideIp: hideIp ?? undefined, hideMac: hideMac ?? undefined })
  }
  if (!peer) {
    return NextResponse.json({ error: '节点不存在' }, { status: 404 })
  }
  getHub().notifyPresenceChanged()
  return NextResponse.json(peer)
}
