import { NextResponse } from 'next/server'
import { requireAdminSessionToken } from '@/api-auth'

/** 前端据此决定渲染登录表单还是管理面板 */
export async function GET() {
  const token = await requireAdminSessionToken()
  return NextResponse.json({ authenticated: token != null })
}
