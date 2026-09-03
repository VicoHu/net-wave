'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Avatar, Button, Card, Input, List, Tag, Toast, Typography } from '@douyinfe/semi-ui'
import { IconEdit, IconWifi } from '@douyinfe/semi-icons'

interface Peer {
  id: string
  name: string
}

interface CenterInfo {
  lanUrl: string
  qrDataUrl: string
}

export default function Home() {
  const [me, setMe] = useState<Peer | null>(null)
  const [peers, setPeers] = useState<Peer[]>([])
  const [centerInfo, setCenterInfo] = useState<CenterInfo | null>(null)
  const [editingName, setEditingName] = useState('')
  const wsRef = useRef<WebSocket | null>(null)

  const connectWs = useCallback(() => {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${location.host}/ws`)
    wsRef.current = ws
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data as string)
      if (data.type === 'presence') setPeers(data.peers as Peer[])
    }
    ws.onclose = () => {
      // 简单重连：开发热重载与服务重启后自动恢复
      setTimeout(connectWs, 3000)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const meRes = await fetch('/api/me')
      const meData = (await meRes.json()) as Peer
      if (cancelled) return
      setMe(meData)
      connectWs()
      const infoRes = await fetch('/api/center-info')
      setCenterInfo((await infoRes.json()) as CenterInfo)
    })()
    return () => {
      cancelled = true
      wsRef.current?.close()
    }
  }, [connectWs])

  const saveName = async () => {
    if (!editingName.trim() || !me) return
    const res = await fetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editingName.trim() }),
    })
    if (res.ok) {
      setMe({ ...me, name: editingName.trim() })
      setEditingName('')
      Toast.success('昵称已更新')
    } else {
      Toast.error('昵称更新失败')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--semi-color-bg-0)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 24px',
          background: 'var(--semi-color-bg-1)',
          borderBottom: '1px solid var(--semi-color-border)',
        }}
      >
        <IconWifi size="large" />
        <Typography.Title heading={4} style={{ margin: 0 }}>
          net-wave
        </Typography.Title>
        <Tag size="small" color="green">
          服务中心
        </Tag>
        <div style={{ flex: 1 }} />
        {me && !editingName && (
          <>
            <Typography.Text strong>{me.name}</Typography.Text>
            <Button
              icon={<IconEdit />}
              size="small"
              theme="borderless"
              onClick={() => setEditingName(me.name)}
            />
          </>
        )}
        {me && editingName !== '' && (
          <>
            <Input
              size="small"
              style={{ width: 160 }}
              value={editingName}
              onChange={setEditingName}
              maxLength={20}
            />
            <Button size="small" theme="solid" onClick={() => void saveName()}>
              保存
            </Button>
          </>
        )}
      </header>

      <main
        style={{
          maxWidth: 960,
          margin: '0 auto',
          padding: 24,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 24,
        }}
      >
        {centerInfo && (
          <Card style={{ width: 280 }} title="手机扫码进入" bodyStyle={{ textAlign: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={centerInfo.qrDataUrl}
              alt="服务中心二维码"
              style={{ width: 220, height: 220 }}
            />
            <Typography.Paragraph copyable style={{ marginTop: 8 }}>
              {centerInfo.lanUrl}
            </Typography.Paragraph>
          </Card>
        )}

        <Card
          title={`在线节点（${peers.length}）`}
          style={{ flex: 1, minWidth: 300 }}
        >
          <List
            dataSource={peers}
            emptyContent={
              me ? <Typography.Text type="tertiary">等待其他设备加入…</Typography.Text> : null
            }
            renderItem={(peer) => (
              <List.Item
                main={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar size="small" color={peer.id === me?.id ? 'amber' : 'blue'}>
                      {peer.name.slice(-1)}
                    </Avatar>
                    <span>{peer.name}</span>
                    {peer.id === me?.id && (
                      <Tag size="small">
                        我
                      </Tag>
                    )}
                  </div>
                }
              />
            )}
          />
        </Card>
      </main>
    </div>
  )
}
