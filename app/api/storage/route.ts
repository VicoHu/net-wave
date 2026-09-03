import { NextResponse } from 'next/server'
import { requirePeerId } from '@/api-auth'
import { listFiles } from '@/files'

export async function GET() {
  const peerId = await requirePeerId()
  if (!peerId) {
    return NextResponse.json({ error: '未识别的节点身份' }, { status: 401 })
  }
  const { files, totalSize } = listFiles()
  return NextResponse.json({ files, totalSize })
}
