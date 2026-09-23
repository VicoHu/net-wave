#!/usr/bin/env node
/**
 * net-wave 局域网网关（macOS / Docker Desktop 等 NAT 虚拟化环境专用）。
 *
 * 这类环境下容器发布端口经 NAT 中转，服务中心只能看到虚拟网关地址，
 * 且容器内 ARP 表没有局域网节点，导致节点 IP/MAC 无法识别。
 * 本脚本运行在宿主机上，作为唯一对外入口：
 *   浏览器 ──► 网关(:3800) ──► 容器(127.0.0.1:3801)
 * - HTTP/WS 全部透明转发（流式 pipe，支持大文件上传下载）
 * - 注入 X-Forwarded-For（服务中心据此记录真实节点 IP）
 * - WebSocket 升级时按宿主机 ARP 表注入 x-nw-client-mac（MAC 属链路层，仅宿主机可查）
 *
 * 零依赖，Node 18+。配置：
 *   NW_GATEWAY_LISTEN   对外监听端口，默认 3800
 *   NW_GATEWAY_UPSTREAM 上游（容器发布到宿主 loopback 的地址），默认 127.0.0.1:3801
 *
 * 部署方式见 README「macOS（OrbStack / Docker Desktop）」。
 */
import { createServer, request as httpRequest } from 'node:http'
import { execFile } from 'node:child_process'
import { connect as tcpConnect } from 'node:net'
import { promisify } from 'node:util'

const exec = promisify(execFile)

const LISTEN_PORT = Number(process.env.NW_GATEWAY_LISTEN ?? 3800)
const [UPSTREAM_HOST, UPSTREAM_PORT_RAW] = (process.env.NW_GATEWAY_UPSTREAM ?? '127.0.0.1:3801').split(':')
const UPSTREAM_PORT = Number(UPSTREAM_PORT_RAW)

/** 宿主机 ARP 表：macOS `arp -a` 形如 `? (192.168.100.5) at a1:b2:c3:d4:e5:f6 on en0 ...` */
const ARP_LINE = /\((\d{1,3}(?:\.\d{1,3}){3})\) at ([0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5})/
const ARP_TTL_MS = 30_000
let arpCache = { at: 0, map: new Map() }

async function arpTable() {
  if (Date.now() - arpCache.at < ARP_TTL_MS) return arpCache.map
  const map = new Map()
  try {
    const { stdout } = await exec('arp', ['-a'], { timeout: 2000 })
    for (const line of stdout.split('\n')) {
      const m = line.match(ARP_LINE)
      if (m) map.set(m[1], m[2].toLowerCase())
    }
  } catch {
    // 解析失败视为空表：IP 仍正确，MAC 留给服务中心显示未知
  }
  arpCache = { at: Date.now(), map }
  return map
}

/** 代理请求头：覆写（而非追加）来源相关头，防止客户端伪造 */
async function proxiedHeaders(req) {
  const ip = req.socket.remoteAddress?.replace(/^::ffff:/, '') ?? ''
  const headers = { ...req.headers, 'x-forwarded-for': ip }
  // MAC 属链路层信息，仅宿主机可查；在 WebSocket 升级时带上（服务中心只在建连时读取）。
  // 先删再按需补，杜绝直连伪造。
  delete headers['x-nw-client-mac']
  if (req.headers.upgrade) {
    const mac = (await arpTable()).get(ip)
    if (mac) headers['x-nw-client-mac'] = mac
  }
  return headers
}

const server = createServer(async (req, res) => {
  try {
    const headers = await proxiedHeaders(req)
    const upstream = httpRequest(
      { host: UPSTREAM_HOST, port: UPSTREAM_PORT, method: req.method, path: req.url, headers },
      (upRes) => {
        res.writeHead(upRes.statusCode ?? 502, upRes.headers)
        upRes.pipe(res)
      },
    )
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('net-wave 网关：无法连接上游服务（容器是否已启动？）')
    })
    req.pipe(upstream)
  } catch {
    res.destroy()
  }
})

server.on('upgrade', async (req, socket, head) => {
  try {
    const headers = await proxiedHeaders(req)
    const upstream = tcpConnect(UPSTREAM_PORT, UPSTREAM_HOST, () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`]
      for (const [key, value] of Object.entries(headers)) {
        if (value === undefined) continue
        for (const v of Array.isArray(value) ? value : [value]) lines.push(`${key}: ${v}`)
      }
      upstream.write(lines.join('\r\n') + '\r\n\r\n')
      if (head.length > 0) upstream.write(head)
      socket.pipe(upstream)
      upstream.pipe(socket)
    })
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
  } catch {
    socket.destroy()
  }
})

server.listen(LISTEN_PORT, () => {
  console.log(`net-wave 局域网网关已启动: 0.0.0.0:${LISTEN_PORT} → ${UPSTREAM_HOST}:${UPSTREAM_PORT}`)
})
