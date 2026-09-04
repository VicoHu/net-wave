import { NextResponse } from 'next/server'
import { ADMIN_SESSION_COOKIE, revokeAdminSession } from '@/admin'
import { requireAdminSessionToken } from '@/api-auth'

export async function POST() {
  const token = await requireAdminSessionToken()
  revokeAdminSession(token ?? undefined)
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(ADMIN_SESSION_COOKIE)
  return res
}
