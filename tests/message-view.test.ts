import { describe, expect, it } from 'vitest'
import {
  avatarColor,
  buildBlocks,
  conversationName,
  formatDayDivider,
  formatTime,
  type MessageRow,
} from '../app/message-view'

let seq = 0
function msg(partial: Partial<MessageRow>): MessageRow {
  return {
    id: ++seq,
    conversationId: 1,
    senderId: 'peer-a',
    senderName: '甲',
    senderIp: null,
    senderMac: null,
    kind: 'text',
    text: 'hello',
    fileId: null,
    file: null,
    createdAt: 0,
    ...partial,
  }
}

// 固定「今天」为 2026-09-04 12:00（本地时区），避免测试随运行日期漂移
const NOW = new Date(2026, 8, 4, 12, 0).getTime()
const at = (day: number, hour: number, minute: number) =>
  new Date(2026, 8, day, hour, minute).getTime()

const messagesOf = (blocks: ReturnType<typeof buildBlocks>) =>
  blocks.flatMap((b) => (b.type === 'message' ? [b.message] : []))

describe('buildBlocks：消息视图分组', () => {
  it('空列表返回空块', () => {
    expect(buildBlocks([], NOW)).toEqual([])
  })

  it('单条消息：先日期分隔，后未分组消息', () => {
    const blocks = buildBlocks([msg({ createdAt: at(4, 10, 0) })], NOW)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toEqual({ type: 'date', key: 'd-20260904', label: '今天' })
    expect(blocks[1]).toMatchObject({ type: 'message' })
    if (blocks[1].type === 'message') expect(blocks[1].message.grouped).toBe(false)
  })

  it('同发送者 5 分钟内连续消息：后一条 grouped', () => {
    const blocks = buildBlocks(
      [msg({ createdAt: at(4, 10, 0) }), msg({ createdAt: at(4, 10, 4) })],
      NOW,
    )
    const [a, b] = messagesOf(blocks)
    expect(a?.grouped).toBe(false)
    expect(b?.grouped).toBe(true)
  })

  it('同发送者超过 5 分钟：重新分组', () => {
    const blocks = buildBlocks(
      [msg({ createdAt: at(4, 10, 0) }), msg({ createdAt: at(4, 10, 6) })],
      NOW,
    )
    const [a, b] = messagesOf(blocks)
    expect(a?.grouped).toBe(false)
    expect(b?.grouped).toBe(false)
  })

  it('相邻不同发送者：不合并', () => {
    const blocks = buildBlocks(
      [
        msg({ createdAt: at(4, 10, 0) }),
        msg({ senderId: 'peer-b', senderName: '乙', createdAt: at(4, 10, 1) }),
      ],
      NOW,
    )
    const [, b] = messagesOf(blocks)
    expect(b?.grouped).toBe(false)
  })

  it('连续三条同发送者：仅后两条 grouped', () => {
    const blocks = buildBlocks(
      [
        msg({ createdAt: at(4, 10, 0) }),
        msg({ createdAt: at(4, 10, 1) }),
        msg({ createdAt: at(4, 10, 2) }),
      ],
      NOW,
    )
    const [, b, c] = messagesOf(blocks)
    expect(b?.grouped).toBe(true)
    expect(c?.grouped).toBe(true)
  })

  it('跨天（23:59 → 次日 00:01）：插入日期分隔且不合并', () => {
    const blocks = buildBlocks(
      [msg({ createdAt: at(3, 23, 59) }), msg({ createdAt: at(4, 0, 1) })],
      NOW,
    )
    expect(blocks).toHaveLength(4)
    expect(blocks[0]).toMatchObject({ type: 'date', label: '昨天' })
    expect(blocks[2]).toMatchObject({ type: 'date', label: '今天' })
    const [, b] = messagesOf(blocks)
    expect(b?.grouped).toBe(false)
  })

  it('3 天前的消息使用绝对日期标签', () => {
    const blocks = buildBlocks([msg({ createdAt: at(1, 9, 0) })], NOW)
    expect(blocks[0]).toMatchObject({ type: 'date', label: '2026年9月1日' })
  })

  it('乱序输入（乱序时间戳）不抛错且按输入顺序渲染', () => {
    const blocks = buildBlocks(
      [msg({ createdAt: at(4, 10, 0) }), msg({ createdAt: at(4, 9, 0) })],
      NOW,
    )
    expect(blocks).toHaveLength(3)
  })
})

describe('formatDayDivider', () => {
  it('今天', () => {
    expect(formatDayDivider(at(4, 0, 0), NOW)).toBe('今天')
  })
  it('昨天', () => {
    expect(formatDayDivider(at(3, 23, 0), NOW)).toBe('昨天')
  })
  it('更早用「YYYY年M月D日」', () => {
    expect(formatDayDivider(at(1, 8, 0), NOW)).toBe('2026年9月1日')
  })
})

describe('formatTime', () => {
  it('输出「YYYY/M/D HH:mm」24 小时制', () => {
    const t = at(4, 8, 5)
    expect(formatTime(t)).toMatch(/^\d{4}\/\d{1,2}\/\d{1,2} 08:05$/)
  })
})

describe('conversationName', () => {
  it('房间会话返回房间名', () => {
    expect(conversationName({ type: 'room', room: { name: '周末开黑' } })).toBe('周末开黑')
  })
  it('私聊会话返回对方节点名', () => {
    expect(conversationName({ type: 'direct', peer: { name: '安静的企鹅' } })).toBe('安静的企鹅')
  })
  it('信息缺失时给出兜底名', () => {
    expect(conversationName({ type: 'room' })).toBe('未知会话')
    expect(conversationName({ type: 'direct' })).toBe('未知会话')
  })
})

describe('avatarColor', () => {  it('同一名字始终返回同一颜色', () => {
    expect(avatarColor('安静的企鹅')).toBe(avatarColor('安静的企鹅'))
  })

  it('颜色来自预定义色板', () => {
    const palette = ['#5865f2', '#ec48bd', '#23a55a', '#f0b232', '#f23f43', '#00a8fc']
    for (const name of ['a', 'b', '甲', '乙', 'vicohu', 'Fullstack']) {
      expect(palette).toContain(avatarColor(name))
    }
  })

  it('一批名字能分布到多个颜色（避免千篇一律）', () => {
    const colors = new Set(Array.from({ length: 40 }, (_, i) => avatarColor(`节点-${i}`)))
    expect(colors.size).toBeGreaterThanOrEqual(4)
  })
})
