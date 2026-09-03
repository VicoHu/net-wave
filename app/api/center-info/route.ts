import { networkInterfaces } from 'node:os'
import { NextResponse } from 'next/server'
import QRCode from 'qrcode'

/** 取第一个非内部 IPv4 地址作为局域网地址 */
function lanAddress(): string {
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const iface of interfaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return '127.0.0.1'
}

export async function GET() {
  const port = process.env.PORT ?? '3000'
  const lanUrl = `http://${lanAddress()}:${port}`
  const qrDataUrl = await QRCode.toDataURL(lanUrl, { width: 240, margin: 1 })
  return NextResponse.json({ lanUrl, qrDataUrl })
}
