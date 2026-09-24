import { NextResponse } from 'next/server'
import { requireAdminSessionToken } from '@/api-auth'
import { deleteFiles } from '@/files'
import { getHub } from '@/hub'

/** 批量删除（仅管理员）：按预览后最终勾选的文件 id 执行；
 * 条件过滤只在预览查询端做，执行端点不重算条件，避免预览与执行间的条件漂移 */
export async function POST(request: Request) {
  if (!(await requireAdminSessionToken())) {
    return NextResponse.json({ error: '未登录管理员' }, { status: 401 })
  }
  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === 'string') : []

  const { deleted, freedSize } = deleteFiles(ids)
  // 在线节点重拉历史，消息卡片即时呈现「已删除」标记
  getHub().broadcast('conversations-updated', {})
  return NextResponse.json({ ok: true, deleted, freedSize })
}
