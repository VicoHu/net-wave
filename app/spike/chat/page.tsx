'use client'

// Semi 已从产品页移除，仅本 spike 页保留：自行引入 React19 适配器与 Semi 全量样式
// （semi 包 exports 未暴露 css 子路径，参照旧 globals.css 以相对路径引入）
import '@douyinfe/semi-ui/react19-adapter'
import '../../../node_modules/@douyinfe/semi-ui/dist/css/semi.min.css'
import { useCallback, useState, type ReactNode } from 'react'
import { Avatar, Chat, Typography } from '@douyinfe/semi-ui'
import type { ChatBoxRenderConfig, Message } from '@douyinfe/semi-ui/lib/es/chat/interface'

/**
 * T2 spike：验证 Semi Chat 组件用于 IM 场景的可行性（去 AI 化）。
 * 决策结论记录于 GitHub Issue #3。
 */

const DEMO_IMAGE = 'https://dummyimage.com/320x200/dedede/555555&text=net-wave'

const initialChats: Message[] = [
  {
    role: 'assistant',
    id: 'm1',
    createAt: Date.now() - 4000,
    content: '你好，我在',
  },
  {
    role: 'user',
    id: 'm2',
    createAt: Date.now() - 3000,
    content: '帮我记一下验证码：482913',
  },
  {
    role: 'assistant',
    id: 'm3',
    createAt: Date.now() - 2000,
    content: [
      { type: 'text', text: '收到，这是刚截的图：' },
      { type: 'image_url', image_url: { url: DEMO_IMAGE } },
    ],
  },
  {
    role: 'user',
    id: 'm4',
    createAt: Date.now() - 1000,
    content: [
      {
        type: 'file_url',
        file_url: {
          url: '#',
          name: '安装包.dmg',
          size: '412 MB',
          type: 'application/octet-stream',
        },
      },
    ],
  },
]

let nextId = 100

export default function ChatSpikePage() {
  const [chats, setChats] = useState<Message[]>(initialChats)

  const onMessageSend = useCallback((content: string) => {
    setChats((prev) => [
      ...prev,
      {
        role: 'user',
        id: `m${nextId++}`,
        createAt: Date.now(),
        content,
      },
    ])
  }, [])

  // 自定义内容区：file_url 渲染为文件卡片，其余走默认渲染
  const chatBoxRenderConfig: ChatBoxRenderConfig = {
    // RenderContentProps 未从包入口导出，此处内联等价类型
    renderChatBoxContent: ({
      message,
      defaultContent,
    }: {
      message?: Message
      defaultContent?: ReactNode
    }) => {
      const contents = message && Array.isArray(message.content) ? message.content : null
      const file = contents?.find((c: NonNullable<typeof contents>[number]) => c.type === 'file_url')
      if (file && file.type === 'file_url' && file.file_url) {
        const f = file.file_url
        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              border: '1px solid var(--semi-color-border)',
              borderRadius: 8,
              minWidth: 220,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: 'var(--semi-color-primary-light-default)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
              }}
            >
              📦
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>{f.name}</div>
              <Typography.Text type="tertiary" size="small">
                {f.size}
              </Typography.Text>
            </div>
          </div>
        )
      }
      return defaultContent
    },
  }

  return (
    <div style={{ padding: 24, maxWidth: 860, margin: '0 auto' }}>
      <Typography.Title heading={4}>Semi Chat 组件 spike（IM 化验证）</Typography.Title>
      <Typography.Paragraph type="tertiary">
        验证点：三类消息渲染 / 双侧昵称头像 / 无 AI 控件 / 输入区可发送
      </Typography.Paragraph>
      <Chat
        chats={chats}
        onChatsChange={(next) => setChats(next ?? [])}
        onMessageSend={onMessageSend}
        roleConfig={{
          user: { name: '我（敏捷的狐狸）', avatar: <Avatar color="amber">狐</Avatar> },
          assistant: { name: '安静的企鹅', avatar: <Avatar color="blue">企</Avatar> },
        }}
        chatBoxRenderConfig={chatBoxRenderConfig}
        placeholder="输入消息，Enter 发送…"
        style={{ height: 480 }}
      />
    </div>
  )
}
