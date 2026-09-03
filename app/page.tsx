'use client'

import { IconWifi } from '@douyinfe/semi-icons'
import { Layout, Tag, Typography } from '@douyinfe/semi-ui'

export default function Home() {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 24px',
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
      </Layout.Header>
      <Layout.Content style={{ padding: 24 }}>
        <Typography.Paragraph>局域网点对点聊天与文件传输 · 骨架已就绪。</Typography.Paragraph>
      </Layout.Content>
    </Layout>
  )
}
