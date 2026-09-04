/** 前端共享类型：页面与组件共用（与后端 API 契约对应） */

import type { FileMeta, MessageRow } from './message-view'

export interface Peer {
  id: string
  name: string
}

export interface RoomInfo {
  id: number
  name: string
  memberCount: number
  conversationId: number
}

export interface ConversationSummary {
  id: number
  type: 'direct' | 'room'
  peer?: { id: string; name: string }
  room?: { id: number; name: string; memberCount: number }
  lastMessage: MessageRow | null
}

export interface CenterInfo {
  lanUrl: string
  qrDataUrl: string
}

export type { FileMeta }
