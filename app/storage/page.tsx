'use client'

import { useCallback, useEffect, useState } from 'react'
import { Avatar, Button, Empty, Popconfirm, Table, Tag, Toast, Typography } from '@douyinfe/semi-ui'
import { IconServer, IconDelete } from '@douyinfe/semi-icons'

interface StorageFile {
  id: string
  name: string
  size: number
  mime: string
  kind: 'image' | 'file'
  createdAt: number
}

function formatSize(size: number): string {
  if (size >= 1024 ** 3) return `${(size / 1024 ** 3).toFixed(2)} GB`
  if (size >= 1024 ** 2) return `${(size / 1024 ** 2).toFixed(1)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${size} B`
}

export default function StoragePage() {
  const [files, setFiles] = useState<StorageFile[]>([])
  const [totalSize, setTotalSize] = useState(0)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/storage')
    if (!res.ok) return
    const body = (await res.json()) as { files: StorageFile[]; totalSize: number }
    setFiles(body.files)
    setTotalSize(body.totalSize)
    setLoaded(true)
  }, [])

  useEffect(() => {
    void (async () => {
      // 确保节点身份就绪（与主页面一致的免登录建立方式）
      await fetch('/api/me')
      void load()
    })()
  }, [load])

  const remove = async (id: string) => {
    const res = await fetch(`/api/files/${id}`, { method: 'DELETE' })
    if (res.ok) {
      Toast.success('已删除')
      await load()
    } else {
      Toast.error('删除失败')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--semi-color-bg-0)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 20px',
          background: 'var(--semi-color-bg-1)',
          borderBottom: '1px solid var(--semi-color-border)',
        }}
      >
        <IconServer size="large" />
        <Typography.Title heading={5} style={{ margin: 0 }}>
          存储管理
        </Typography.Title>
        <div style={{ flex: 1 }} />
        <Tag color="blue" size="large">
          总占用 {formatSize(totalSize)}
        </Tag>
        <Button onClick={() => history.back()}>返回</Button>
      </header>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
        <Table<StorageFile>
          dataSource={files}
          loading={!loaded}
          emptyContent={<Empty description="暂无文件" />}
          pagination={{ pageSize: 20 }}
          columns={[
            {
              title: '文件名',
              dataIndex: 'name',
              render: (name: string, row) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar size="extra-small" color={row.kind === 'image' ? 'green' : 'blue'}>
                    {row.kind === 'image' ? '图' : '件'}
                  </Avatar>
                  <span style={{ wordBreak: 'break-all' }}>{name}</span>
                </div>
              ),
            },
            { title: '大小', dataIndex: 'size', width: 110, render: (size: number) => formatSize(size) },
            {
              title: '时间',
              dataIndex: 'createdAt',
              width: 180,
              render: (t: number) => new Date(t).toLocaleString('zh-CN', { hour12: false }),
            },
            {
              title: '',
              width: 90,
              render: (_: unknown, row: StorageFile) => (
                <Popconfirm title="确认删除？" content="删除后历史消息中的下载入口将失效" onConfirm={() => void remove(row.id)}>
                  <Button type="danger" theme="light" icon={<IconDelete />} size="small" />
                </Popconfirm>
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}
