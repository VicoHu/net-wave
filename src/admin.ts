import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { openDb } from './db'

const PASSWORD_KEY = 'admin_password'
const SCRYPT_KEYLEN = 64

export const ADMIN_SESSION_COOKIE = 'nw_admin'
export const ADMIN_SESSION_TTL_MS = 24 * 60 * 60 * 1000

/* ---------------- 密码 ---------------- */

/** scrypt 是抗 GPU 的慢哈希，配合登录限流足以抵御局域网内的字典攻击 */
function hashPassword(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, SCRYPT_KEYLEN)
}

function storePassword(password: string): void {
  const salt = randomBytes(16)
  const hash = hashPassword(password, salt)
  const db = openDb()
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    PASSWORD_KEY,
    `${salt.toString('hex')}:${hash.toString('hex')}`,
  )
}

/**
 * 启动时确保存在管理员密码：
 * - 设置了 ADMIN_PASSWORD 环境变量时以它为准（每次启动重置，改环境变量即改密码）；
 * - 否则首次生成随机密码并打印到服务中心控制台，之后沿用。
 */
export function ensureAdminPassword(): void {
  const fromEnv = process.env.ADMIN_PASSWORD
  if (fromEnv && fromEnv.length > 0) {
    storePassword(fromEnv)
    return
  }
  const db = openDb()
  const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(PASSWORD_KEY) as
    | { value: string }
    | undefined
  if (existing) return
  const generated = randomBytes(9).toString('base64url')
  storePassword(generated)
  console.log(`[net-wave] 已生成管理中心初始密码: ${generated}`)
  console.log('[net-wave] 该密码持久保存，重启不变；如需自定义请设置 ADMIN_PASSWORD 环境变量后重启')
}

export function verifyAdminPassword(password: string): boolean {
  const db = openDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(PASSWORD_KEY) as
    | { value: string }
    | undefined
  if (!row) return false
  const [saltHex, hashHex] = row.value.split(':')
  if (!saltHex || !hashHex) return false
  try {
    const expected = Buffer.from(hashHex, 'hex')
    const actual = hashPassword(password, Buffer.from(saltHex, 'hex'))
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

/* ---------------- 登录限流（防暴力破解） ---------------- */

const FREE_FAILURES = 3
const BASE_LOCK_MS = 5_000
const MAX_LOCK_MS = 30 * 60_000

interface ThrottleState {
  failures: number
  lockedUntil: number
}

/** 失败次数越多锁定越久（指数退避，封顶 30 分钟），换 IP 也无法绕过单 IP 维度的累积 */
function lockDurationMs(failures: number): number {
  if (failures <= FREE_FAILURES) return 0
  return Math.min(2 ** (failures - FREE_FAILURES) * BASE_LOCK_MS, MAX_LOCK_MS)
}

// server.ts 与 Next route handlers 同进程但模块系统不同，限流状态放 globalThis 共享
const globalForAdmin = globalThis as typeof globalThis & {
  __nwLoginThrottle?: Map<string, ThrottleState>
  __nwAdminSessions?: Map<string, number>
}

const throttleMap = (globalForAdmin.__nwLoginThrottle ??= new Map())

/** 该 IP 当前是否允许尝试登录；被锁定时返回需等待的毫秒数 */
export function loginRetryAfterMs(ip: string): number {
  const state = throttleMap.get(ip)
  if (!state) return 0
  return Math.max(0, state.lockedUntil - Date.now())
}

export function recordLoginFailure(ip: string): void {
  const state = throttleMap.get(ip) ?? { failures: 0, lockedUntil: 0 }
  state.failures += 1
  state.lockedUntil = Date.now() + lockDurationMs(state.failures)
  throttleMap.set(ip, state)
}

export function recordLoginSuccess(ip: string): void {
  throttleMap.delete(ip)
}

/* ---------------- 会话 ---------------- */

const sessionMap = (globalForAdmin.__nwAdminSessions ??= new Map<string, number>())

/** 登录成功后签发会话令牌（存内存，服务中心重启后需重新登录） */
export function createAdminSession(): string {
  pruneSessions()
  const token = randomBytes(32).toString('hex')
  sessionMap.set(token, Date.now() + ADMIN_SESSION_TTL_MS)
  return token
}

export function isValidAdminSession(token: string | undefined): boolean {
  if (!token) return false
  const expiresAt = sessionMap.get(token)
  if (expiresAt == null) return false
  if (Date.now() > expiresAt) {
    sessionMap.delete(token)
    return false
  }
  return true
}

export function revokeAdminSession(token: string | undefined): void {
  if (token) sessionMap.delete(token)
}

function pruneSessions(): void {
  const now = Date.now()
  for (const [token, expiresAt] of sessionMap) {
    if (now > expiresAt) sessionMap.delete(token)
  }
}
