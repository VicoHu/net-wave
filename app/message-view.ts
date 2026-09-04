/**
 * 消息列表的视图模型：把扁平消息行转换为带日期分隔与分组标记的渲染块。
 * 纯函数，供页面渲染与单元测试共用（Discord 式消息流的核心规则集中于此）。
 */

export interface FileMeta {
  id: string
  name: string
  size: number
  mime: string
  kind: 'image' | 'file'
  deleted: boolean
}

export interface MessageRow {
  id: number
  conversationId: number
  senderId: string
  senderName: string
  kind: string
  text: string | null
  fileId: string | null
  file: FileMeta | null
  createdAt: number
}

/** 与上一条同发送者、同一天且间隔 ≤ 5 分钟的消息折叠为紧凑行 */
export const GROUP_WINDOW_MS = 5 * 60 * 1000

export interface MessageVM extends MessageRow {
  /** true = 渲染为紧凑行（不重复头像与昵称） */
  grouped: boolean
}

export type MessageBlock =
  | { type: 'date'; key: string; label: string }
  | { type: 'message'; key: string; message: MessageVM }

const dayKey = (t: number): number => {
  const d = new Date(t)
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

/** 日期分隔标签：今天 / 昨天 / 「YYYY年M月D日」 */
export function formatDayDivider(t: number, now: number): string {
  const startOfDay = (x: number) => {
    const d = new Date(x)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  const dayDiff = Math.round((startOfDay(now) - startOfDay(t)) / 86_400_000)
  if (dayDiff <= 0) return '今天'
  if (dayDiff === 1) return '昨天'
  const d = new Date(t)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

/** 会话显示名：房间名 / 对方节点名（信息缺失时兜底） */
export function conversationName(
  conv: Pick<import('./types').ConversationSummary, 'type'> & {
    peer?: { name: string } | null
    room?: { name: string } | null
  },
): string {
  if (conv.type === 'room') return conv.room?.name ?? '未知会话'
  return conv.peer?.name ?? '未知会话'
}

/** 消息时间戳：「YYYY/M/D HH:mm」24 小时制 */
export function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`
}

/** 紧凑时钟：「HH:mm」（折叠消息 hover 时显示） */
export function formatClock(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/** 从文本中提取验证码式数字串（4-8 位连续数字） */
export function extractCode(text: string): string | null {
  return text.match(/\d{4,8}/)?.[0] ?? null
}

/** 会话列表预览文案：文件类消息显示类型前缀 */
export function messagePreview(m: { kind: string; text: string | null; file?: { name: string } | null } | null): string {
  if (!m) return ''
  if (m.kind === 'image') return `[图片] ${m.file?.name ?? ''}`
  if (m.kind === 'file') return `[文件] ${m.file?.name ?? ''}`
  return m.text ?? ''
}

export function buildBlocks(messages: MessageRow[], now: number = Date.now()): MessageBlock[] {
  const blocks: MessageBlock[] = []
  let prev: MessageRow | null = null
  let prevDay = -1

  for (const m of messages) {
    const day = dayKey(m.createdAt)
    if (day !== prevDay) {
      blocks.push({ type: 'date', key: `d-${day}`, label: formatDayDivider(m.createdAt, now) })
      prevDay = day
      prev = null // 跨天不与上一条合并
    }
    const grouped =
      prev !== null &&
      prev.senderId === m.senderId &&
      m.createdAt - prev.createdAt <= GROUP_WINDOW_MS
    blocks.push({ type: 'message', key: `m-${m.id}`, message: { ...m, grouped } })
    prev = m
  }
  return blocks
}

/** 头像色板：Discord 品牌系（blurple / magenta / 绿 / 黄 / 红 / 蓝），按名字确定性取色 */
const AVATAR_COLORS = ['#5865f2', '#ec48bd', '#23a55a', '#f0b232', '#f23f43', '#00a8fc'] as const

export function avatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
