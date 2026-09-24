import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TooltipProvider } from '@components/ui/tooltip'
import { AppSidebar } from '../app/components/app-sidebar'
import type { ConversationSummary, Peer } from '../app/types'

// 回归背景：私信某个在线节点后，该节点从「在线节点」区消失，且私信头像
// 不显示右下角在线绿点——UI 上再也看不出对方是否在线。

const noop = () => {}

function renderSidebar(conversations: ConversationSummary[], peers: Peer[]) {
  return renderToStaticMarkup(
    createElement(
      TooltipProvider,
      null,
      createElement(AppSidebar, {
      me: { id: 'me', name: '我自己' },
      conversations,
      rooms: [],
      peers,
      activeId: null,
      filter: '',
      onFilterChange: noop,
      onOpenConversation: noop,
      onJoinRoom: noop,
      onStartConversation: noop,
      onCreateRoom: noop,
      onRename: noop,
      onShowQr: noop,
      onShowSettings: noop,
      onDeleteRoom: noop,
      onCloseConversation: noop,
      })
    ),
  )
}

const directWith = (peer: Peer): ConversationSummary => ({
  id: 1,
  type: 'direct',
  peer: { id: peer.id, name: peer.name },
  lastMessage: null,
})

/** 截取「私信」区段的 HTML，避免断言被在线节点区/底部自身头像干扰 */
function dmSection(html: string) {
  return html.split('私信')[1]?.split('房间')[0] ?? ''
}

describe('侧栏在线状态', () => {
  it('已私信的在线节点仍显示在「在线节点」区', () => {
    const peer: Peer = { id: 'p1', name: '阿汤' }
    const html = renderSidebar([directWith(peer)], [peer])
    const onlineSection = html.split('在线节点')[1] ?? ''
    expect(onlineSection).toContain('阿汤')
  })

  it('对方在线时私信头像显示在线绿点', () => {
    const peer: Peer = { id: 'p1', name: '阿汤' }
    const html = renderSidebar([directWith(peer)], [peer])
    expect(dmSection(html)).toContain('title="在线"')
  })

  it('对方离线时私信头像不显示在线绿点', () => {
    const peer: Peer = { id: 'p1', name: '阿汤' }
    const html = renderSidebar([directWith(peer)], [])
    expect(dmSection(html)).not.toContain('title="在线"')
  })

  it('私信行渲染常显的关闭按钮（关闭私信 阿汤）', () => {
    const peer: Peer = { id: 'p1', name: '阿汤' }
    const html = renderSidebar([directWith(peer)], [])
    // 不能用 dmSection：aria-label 中的「私信」会被 split 切断，改在完整 HTML 上断言
    // （该 aria-label 全页唯一，房间行为「删除房间 …」，无歧义）
    expect(html).toContain('aria-label="关闭私信 阿汤"')
  })
})
