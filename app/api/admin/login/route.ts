import { NextResponse } from 'next/server'
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_MS,
  createAdminSession,
  loginRetryAfterMs,
  recordLoginFailure,
  recordLoginSuccess,
  verifyAdminPassword,
} from '@/admin'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null
  const password = typeof body?.password === 'string' ? body.password : ''
  if (password === '') {
    return NextResponse.json({ error: '请输入密码' }, { status: 400 })
  }

  // 来源 IP 由 server.ts 注入（Next 侧拿不到 socket）；限流状态全局共享
  const ip = request.headers.get('x-nw-client-ip') ?? 'unknown'
  const retryAfterMs = loginRetryAfterMs(ip)
  if (retryAfterMs > 0) {
    return NextResponse.json(
      { error: `尝试过于频繁，请 ${Math.ceil(retryAfterMs / 1000)} 秒后再试` },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
    )
  }

  if (!verifyAdminPassword(password)) {
    recordLoginFailure(ip)
    return NextResponse.json({ error: '密码错误' }, { status: 401 })
  }

  recordLoginSuccess(ip)
  const token = createAdminSession()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
  })
  return res
}
