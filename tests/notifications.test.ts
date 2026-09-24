import { describe, expect, it, vi } from 'vitest'
import {
  currentNotificationPermission,
  dispatchMessageNotification,
  notifyTitle,
  type NotifyContent,
} from '../app/notifications'
import type { MessageRow } from '../app/message-view'
import type { ConversationSummary } from '../app/types'

/** 伪造一条文本消息（默认他人发送、会话 #7） */
const msg = (overrides: Partial<MessageRow> = {}): MessageRow => ({
  id: 1,
  conversationId: 7,
  senderId: 'p1',
  senderName: '阿汤',
  senderIp: null,
  senderMac: null,
  kind: 'text',
  text: '你好',
  fileId: null,
  file: null,
  createdAt: 0,
  ...overrides,
})

const directConv: ConversationSummary = {
  id: 7,
  type: 'direct',
  peer: { id: 'p1', name: '阿汤' },
  lastMessage: null,
}

const roomConv: ConversationSummary = {
  id: 7,
  type: 'room',
  room: { id: 3, name: '摸鱼房', memberCount: 2, createdBy: 'p1' },
  lastMessage: null,
}

/** spy 双通道：记录 system/page 分发内容，返回分发类型 */
function spy() {
  const system: NotifyContent[] = []
  const page: NotifyContent[] = []
  const handlers = {
    system: (c: NotifyContent) => system.push(c),
    page: (c: NotifyContent) => page.push(c),
  }
  return { system, page, handlers }
}

/** 决策输入：默认「他人消息、页面可见、看别的会话、两开关全开、权限 granted」 */
const input = (overrides: Record<string, unknown> = {}) => ({
  message: msg(),
  conversation: directConv,
  selfId: 'me',
  activeConversationId: 1,
  documentHidden: false,
  pageNotification: true,
  systemNotification: true,
  permission: 'granted' as const,
  ...overrides,
})

describe('消息通知触发矩阵', () => {
  it('本人消息不打扰', () => {
    const s = spy()
    const kind = dispatchMessageNotification(input({ message: msg({ senderId: 'me' }) }), s.handlers)
    expect(kind).toBeNull()
    expect(s.system).toHaveLength(0)
    expect(s.page).toHaveLength(0)
  })

  it('页面不可见 + 系统通知开 + 权限 granted → 系统通知，标题为发送者昵称', () => {
    const s = spy()
    const kind = dispatchMessageNotification(input({ documentHidden: true }), s.handlers)
    expect(kind).toBe('system')
    expect(s.system).toHaveLength(1)
    expect(s.page).toHaveLength(0)
    expect(s.system[0].title).toBe('阿汤')
    expect(s.system[0].body).toBe('你好')
    expect(s.system[0].conversationId).toBe(7)
  })

  it('页面可见 + 页内通知开 + 看的不是该会话 → 页内通知', () => {
    const s = spy()
    const kind = dispatchMessageNotification(input(), s.handlers)
    expect(kind).toBe('page')
    expect(s.page).toHaveLength(1)
    expect(s.system).toHaveLength(0)
    expect(s.page[0].title).toBe('阿汤')
    expect(s.page[0].body).toBe('你好')
  })

  it('正在看的会话不打扰（页面可见且 conversationId 即当前会话）', () => {
    const s = spy()
    const kind = dispatchMessageNotification(input({ activeConversationId: 7 }), s.handlers)
    expect(kind).toBeNull()
  })

  it('页面不可见但系统通知开关关 → 不分发（即使权限 granted）', () => {
    const s = spy()
    const kind = dispatchMessageNotification(
      input({ documentHidden: true, systemNotification: false }),
      s.handlers,
    )
    expect(kind).toBeNull()
  })

  it('页面不可见但权限未授予（default）→ 不分发', () => {
    const s = spy()
    const kind = dispatchMessageNotification(
      input({ documentHidden: true, permission: 'default' }),
      s.handlers,
    )
    expect(kind).toBeNull()
  })

  it('页面可见但页内通知开关关 → 不分发', () => {
    const s = spy()
    const kind = dispatchMessageNotification(input({ pageNotification: false }), s.handlers)
    expect(kind).toBeNull()
  })

  it('系统与页内天然互斥：页面不可见时即使页内开关开也只走系统通知', () => {
    const s = spy()
    const kind = dispatchMessageNotification(input({ documentHidden: true }), s.handlers)
    expect(kind).toBe('system')
    expect(s.page).toHaveLength(0)
  })

  it('文件消息正文带类型前缀（messagePreview 复用）', () => {
    const s = spy()
    dispatchMessageNotification(
      input({ message: msg({ kind: 'file', text: null, file: { id: 'f1', name: 'a.pdf', size: 1, mime: 'application/pdf', kind: 'file', deleted: false } }) }),
      s.handlers,
    )
    expect(s.page[0].body).toBe('[文件] a.pdf')
  })

  it('房间消息标题 = 发送者 · #房间名', () => {
    expect(notifyTitle(msg(), roomConv)).toBe('阿汤 · #摸鱼房')
  })

  it('会话不在列表时标题降级为发送者昵称', () => {
    expect(notifyTitle(msg(), null)).toBe('阿汤')
  })
})

describe('currentNotificationPermission', () => {
  it('无 Notification API 时为 unsupported', () => {
    vi.stubGlobal('Notification', undefined)
    try {
      expect(currentNotificationPermission()).toBe('unsupported')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('有 Notification API 时透传其 permission', () => {
    vi.stubGlobal('Notification', { permission: 'granted' })
    try {
      expect(currentNotificationPermission()).toBe('granted')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
