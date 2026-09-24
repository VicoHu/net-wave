/**
 * 消息通知的触发矩阵与内容构造：纯函数 + 注入式分发 handler，
 * 供 ws.onmessage 与单元测试共用（Notification 在测试环境不可用，故全部注入）。
 */
import { conversationName, messagePreview, type MessageRow } from './message-view'
import type { ConversationSummary } from './types'

/** 浏览器通知权限态（无 Notification API 时为 unsupported） */
export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported'

export interface NotifyContent {
  title: string
  body: string
  conversationId: number
}

export interface MessageNotifyInput {
  message: MessageRow
  /** 消息所属会话（取房间名用；会话尚未进列表时可缺省，标题降级只用发送者昵称） */
  conversation?: ConversationSummary | null
  selfId: string | null
  activeConversationId: number | null
  documentHidden: boolean
  pageNotification: boolean
  systemNotification: boolean
  permission: NotificationPermissionState
}

/** 通知标题：标题=发送者昵称，房间另加房间名 */
export function notifyTitle(message: MessageRow, conversation?: ConversationSummary | null): string {
  if (conversation?.type === 'room') {
    return `${message.senderName} · #${conversationName(conversation)}`
  }
  return message.senderName
}

/** 读取当前浏览器通知权限（无 Notification API 时为 unsupported） */
export function currentNotificationPermission(): NotificationPermissionState {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

/**
 * 触发矩阵（按可见性分级）：
 * - 本人消息不打扰；
 * - 页面不可见 → 系统通知（需开关开 + 权限 granted）；
 * - 页面可见但看的不是该会话 → 页内通知（需开关开）；
 * - 正在看的会话不打扰。
 * 两分支由 documentHidden 天然互斥，同一条消息最多出其一；
 * 返回实际分发类型（便于测试断言），未分发返回 null。
 */
export function dispatchMessageNotification(
  input: MessageNotifyInput,
  handlers: { system: (content: NotifyContent) => void; page: (content: NotifyContent) => void },
): 'system' | 'page' | null {
  if (input.message.senderId === input.selfId) return null
  const content: NotifyContent = {
    title: notifyTitle(input.message, input.conversation),
    body: messagePreview(input.message),
    conversationId: input.message.conversationId,
  }
  if (input.documentHidden) {
    if (input.systemNotification && input.permission === 'granted') {
      handlers.system(content)
      return 'system'
    }
    return null
  }
  if (input.pageNotification && input.message.conversationId !== input.activeConversationId) {
    handlers.page(content)
    return 'page'
  }
  return null
}
