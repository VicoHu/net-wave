import { NextResponse } from 'next/server'
import { requireAdminSessionToken, requirePeerId } from '@/api-auth'
import { listStorageFiles } from '@/files'

/** 存储管理双视角：管理员会话 → 全量治理；普通节点 → 仅自己上传的文件（只读）。
 * min_size / before 为批量删除的条件筛选参数（AND 组合），供「预览」请求复用。 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const parseNumber = (key: string): number | undefined => {
    const raw = url.searchParams.get(key)
    if (raw == null || raw === '') return undefined
    const value = Number(raw)
    return Number.isFinite(value) && value >= 0 ? value : undefined
  }
  const filter = { minSize: parseNumber('min_size'), before: parseNumber('before') }

  if (await requireAdminSessionToken()) {
    return NextResponse.json({ scope: 'admin', ...listStorageFiles(filter) })
  }
  const peerId = await requirePeerId()
  if (!peerId) {
    return NextResponse.json({ error: '未识别的节点身份' }, { status: 401 })
  }
  return NextResponse.json({ scope: 'mine', ...listStorageFiles({ ...filter, uploadedBy: peerId }) })
}
