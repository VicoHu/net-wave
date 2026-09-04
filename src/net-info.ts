import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

/** IPv6 映射的 IPv4（::ffff:192.168.1.5）与 loopback 统一为直观形式 */
export function normalizeIp(raw: string): string {
  let ip = raw.trim().toLowerCase()
  if (ip.startsWith('::ffff:')) ip = ip.slice(7)
  if (ip === '::1') ip = '127.0.0.1'
  return ip
}

const MAC_PATTERN = /([0-9a-fA-F]{2}([:-]){5}[0-9a-fA-F]{2})/
const MAC_CACHE_TTL_MS = 60_000
const macCache = new Map<string, { mac: string | null; at: number }>()

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
    if (match) mac = match[1].toLowerCase().replace(/-/g, ':')
  } catch {
    mac = null
  }
  macCache.set(ip, { mac, at: Date.now() })
  return mac
}
