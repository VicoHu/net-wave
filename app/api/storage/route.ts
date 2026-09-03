import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { listFiles } from '@/files'
import { findPeer } from '@/peers'

export async function GET() {
  const jar = await cookies()
  const peerId = jar.get('nw_peer')?.value
  if (!peerId || !findPeer(peerId)) {
    return NextResponse.json({ error: '未识别的节点身份' }, { status: 401 })
  }
  const { files, totalSize } = listFiles()
  return NextResponse.json({ files, totalSize })
}
