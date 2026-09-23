import { execFile } from 'node:child_process'
import type { IncomingHttpHeaders } from 'node:http'
import { promisify } from 'node:util'

const exec = promisify(execFile)

/** IPv6 映射的 IPv4（::ffff:192.168.1.5）与 loopback 统一为直观形式 */
export function normalizeIp(raw: string): string {
  let ip = raw.trim().toLowerCase()
  if (ip.startsWith('::ffff:')) ip = ip.slice(7)
  if (ip === '::1') ip = '127.0.0.1'
  return ip
}

/**
 * 推导节点真实来源地址：反向代理（nginx/caddy 等部署在宿主机）注入的
 * X-Forwarded-For 首项 / X-Real-IP 优先；无代理头时回退 socket 对端地址
 * （容器桥接网络下为网关地址，属平台 NAT 限制，见 README「部署与客户端 IP」）。
 */
export function clientIpFromRequest(headers: IncomingHttpHeaders, socketAddress: string): string {
  const forwarded = headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim() !== '') {
    const first = normalizeIp(forwarded.split(',')[0])
    if (first) return first
  }
  const realIp = headers['x-real-ip']
  if (typeof realIp === 'string' && realIp.trim() !== '') {
    const real = normalizeIp(realIp)
    if (real) return real
  }
  return normalizeIp(socketAddress)
}

const MAC_PATTERN = /^([0-9a-fA-F]{2}[:\-]){5}[0-9a-fA-F]{2}$/
const MAC_CACHE_TTL_MS = 60_000
const macCache = new Map<string, { mac: string | null; at: number }>()

/**
 * 取宿主机网关注入的节点 MAC（lan-gateway 在 WS 升级时按宿主 ARP 表写入
 * x-nw-client-mac；NAT 虚拟化环境下容器内查不到局域网 MAC，只能由网关代查）。
 * 格式非法返回 null，交由调用方回退本地 ARP 解析。
 */
export function clientMacFromRequest(headers: IncomingHttpHeaders): string | null {
  const raw = headers['x-nw-client-mac']
  if (typeof raw !== 'string' || !MAC_PATTERN.test(raw.trim())) return null
  return raw.trim().toLowerCase().replace(/-/g, ':')
}

function isLoopback(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip.startsWith('127.')
}

/**
 * 通过服务中心的 ARP 缓存解析局域网节点的 MAC 地址。
 * MAC 属于链路层信息，跨网段不可得，因此仅在同网段（服务中心视角）有效；
 * 解析不到返回 null（前端显示为未知）。结果按 IP 短缓存，避免频繁起进程。
 */
export async function lookupMac(ip: string): Promise<string | null> {
  if (isLoopback(ip) || ip.includes(':')) return null
  const cached = macCache.get(ip)
  if (cached && Date.now() - cached.at < MAC_CACHE_TTL_MS) return cached.mac

  let mac: string | null = null
  try {
    const { stdout } = await exec('arp', ['-a'], { timeout: 1500 })
    // 精确匹配行内的该 IP（避免 192.168.1.1 误配 192.168.1.10），macOS/Linux/Windows 输出格式各异
    const ipPattern = new RegExp(`(^|[^0-9.])${ip.replace(/\./g, '\\.')}([^0-9.]|$)`)
    const line = stdout.split('\n').find((l) => ipPattern.test(l))
    const match = line?.match(MAC_PATTERN)
    if (match) mac = match[0].toLowerCase().replace(/-/g, ':')
  } catch {
    mac = null
  }
  macCache.set(ip, { mac, at: Date.now() })
  return mac
}
