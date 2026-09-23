import { describe, expect, it } from 'vitest'
import { clientIpFromRequest, clientMacFromRequest, normalizeIp } from '../src/net-info'

describe('客户端来源 IP 推导', () => {
  it('X-Forwarded-For 优先，多级代理取最左侧（真实客户端）', () => {
    const ip = clientIpFromRequest(
      { 'x-forwarded-for': '192.168.100.23, 10.0.0.1' },
      '172.17.0.1',
    )
    expect(ip).toBe('192.168.100.23')
  })

  it('XFF 中的 IPv6 映射形式被归一化为 IPv4', () => {
    const ip = clientIpFromRequest({ 'x-forwarded-for': '::ffff:192.168.100.23' }, '172.17.0.1')
    expect(ip).toBe('192.168.100.23')
  })

  it('无 XFF 时回退 X-Real-IP', () => {
    const ip = clientIpFromRequest({ 'x-real-ip': '192.168.100.24' }, '172.17.0.1')
    expect(ip).toBe('192.168.100.24')
  })

  it('无代理头时回退 socket 对端地址（含归一化）', () => {
    expect(clientIpFromRequest({}, '::ffff:192.168.100.25')).toBe('192.168.100.25')
    expect(clientIpFromRequest({}, '::1')).toBe('127.0.0.1')
  })

  it('XFF 为空白项时不采用，继续走回退链', () => {
    const ip = clientIpFromRequest({ 'x-forwarded-for': ' , ' , 'x-real-ip': '192.168.100.26' }, '172.17.0.1')
    expect(ip).toBe('192.168.100.26')
  })
})

describe('normalizeIp', () => {
  it('剥离 ::ffff: 前缀并归一化 loopback', () => {
    expect(normalizeIp('::ffff:10.1.2.3')).toBe('10.1.2.3')
    expect(normalizeIp('::1')).toBe('127.0.0.1')
    expect(normalizeIp(' 192.168.1.2 ')).toBe('192.168.1.2')
  })
})

describe('网关注入的节点 MAC 解析', () => {
  it('合法冒号格式归一化为小写', () => {
    expect(clientMacFromRequest({ 'x-nw-client-mac': 'AA:BB:CC:DD:EE:FF' })).toBe('aa:bb:cc:dd:ee:ff')
  })

  it('横线分隔格式转换为冒号', () => {
    expect(clientMacFromRequest({ 'x-nw-client-mac': 'aa-bb-cc-dd-ee-ff' })).toBe('aa:bb:cc:dd:ee:ff')
  })

  it('格式非法或缺失返回 null（回退本地 ARP 解析）', () => {
    expect(clientMacFromRequest({ 'x-nw-client-mac': 'aa:bb:cc:dd:ee' })).toBeNull()
    expect(clientMacFromRequest({ 'x-nw-client-mac': '不是MAC' })).toBeNull()
    expect(clientMacFromRequest({})).toBeNull()
  })
})
