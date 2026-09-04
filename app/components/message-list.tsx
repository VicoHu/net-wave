'use client'

import { useState } from 'react'
import { DownloadIcon, FileIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@components/ui/message-scroller'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { Skeleton } from '@components/ui/skeleton'
import { UserAvatar } from './user-avatar'
import { cn } from '@lib/utils'
import { formatSize } from '../format'
import {
  avatarColor,
  buildBlocks,
  extractCode,
  formatClock,
  formatTime,
  type MessageRow,
  type MessageVM,
} from '../message-view'
import type { DisplaySettings } from './settings-dialog'

/** 从文本中提取验证码：secure context 一键复制，否则降级为选中全文 */
async function copyCode(code: string, container: HTMLElement | null) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(code)
    toast.success(`已复制 ${code}`)
    return
  }
  if (container) {
    const range = document.createRange()
    range.selectNodeContents(container)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    toast.info('已全选，请长按/右键复制')
  }
}

/** 文件消息卡片：XHR 下载以获得实时进度；被删除文件明确提示不可下载 */
function FileCard({ file }: { file: NonNullable<MessageRow['file']> }) {
  const [progress, setProgress] = useState<number | null>(null)

  const download = () => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', `/api/files/${file.id}`)
    xhr.responseType = 'blob'
    xhr.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status === 200) {
        const url = URL.createObjectURL(xhr.response)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        a.click()
        URL.revokeObjectURL(url)
      } else if (xhr.status === 410) {
        toast.error('文件已被删除，无法下载')
      } else {
        toast.error('下载失败')
      }
      setProgress(null)
    }
    xhr.onerror = () => {
      toast.error('下载失败')
      setProgress(null)
    }
    xhr.send()
  }

  return (
    <div className="flex max-w-md items-center gap-3 rounded-lg bg-sidebar p-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-rail">
        <FileIcon className="size-5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{file.name}</div>
        <div className="text-xs text-muted-foreground">{formatSize(file.size)}</div>
      </div>
      {file.deleted ? (
        <span className="shrink-0 rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-medium text-destructive">
          已删除
        </span>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          disabled={progress != null}
          onClick={download}
          className="shrink-0 gap-1.5"
        >
          {progress != null ? (
            `${progress}%`
          ) : (
            <>
              <DownloadIcon data-icon="inline-start" />
              下载
            </>
          )}
        </Button>
      )}
    </div>
  )
}

/** 单条消息正文：文本（含验证码复制 chip）/ 图片（点击应用内预览）/ 文件 */
function MessageBody({ message, onPreviewImage }: { message: MessageRow; onPreviewImage: (url: string) => void }) {
  if (message.kind === 'image' && message.file) {
    const url = `/api/files/${message.file.id}`
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <button
        type="button"
        aria-label={`预览图片 ${message.file.name}`}
        className="block w-fit cursor-zoom-in"
        onClick={() => onPreviewImage(url)}
      >
        <img src={url} alt={message.file.name} className="max-h-80 w-auto max-w-full rounded-lg" />
      </button>
    )
  }
  if (message.kind === 'file' && message.file) {
    return <FileCard file={message.file} />
  }
  const code = message.text ? extractCode(message.text) : null
  return (
    <div>
      <span className="nw-message-text whitespace-pre-wrap">{message.text}</span>
      {code && (
        <button
          type="button"
          className="ml-2 inline-flex items-center rounded-full border border-primary/40 px-2.5 py-px align-middle text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          onClick={(e) => void copyCode(code, e.currentTarget.closest('.nw-message-text'))}
        >
          复制 {code}
        </button>
      )}
    </div>
  )
}

function DateDivider({ label }: { label: string }) {
  return (
    <div className="mx-4 my-4 flex items-center gap-2" role="separator" aria-label={label}>
      <div className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

function MessageRowView({
  message,
  display,
  onPreviewImage,
}: {
  message: MessageVM
  display: DisplaySettings
  onPreviewImage: (url: string) => void
}) {
  const hoverClock = (
    <div className="w-10 shrink-0 pt-0.5 text-right opacity-0 transition-opacity group-hover/row:opacity-100">
      <span className="text-[10px] text-muted-foreground">{formatClock(message.createdAt)}</span>
    </div>
  )

  if (message.grouped) {
    return (
      <MessageScrollerItem
        messageId={String(message.id)}
        className="group/row flex gap-4 px-4 py-0.5 hover:bg-white/[0.03]"
      >
        {hoverClock}
        <div className="min-w-0 flex-1">
          <MessageBody message={message} onPreviewImage={onPreviewImage} />
        </div>
      </MessageScrollerItem>
    )
  }

  const name = message.senderName || '未知节点'
  const hasPopover = display.showIp || display.showMac
  const avatar = (
    <UserAvatar name={name} className="mt-0.5 size-10" dotClassName="ring-chat" />
  )
  return (
    <MessageScrollerItem
      messageId={String(message.id)}
      className="group/row flex gap-4 px-4 pt-4 hover:bg-white/[0.03]"
    >
      {hasPopover ? (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" aria-label={`查看 ${name} 的资料`} className="cursor-pointer rounded-full outline-none">
              {avatar}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-0">
            <div className="h-16" style={{ backgroundColor: avatarColor(name) }} />
            <div className="flex flex-col gap-3 p-3">
              <p className="text-sm font-semibold" style={{ color: avatarColor(name) }}>
                {name}
              </p>
              {display.showIp && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-semibold tracking-wider text-muted-foreground">IP 地址</span>
                  <span className="font-mono text-xs">{message.senderIp ?? '未知'}</span>
                </div>
              )}
              {display.showMac && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-semibold tracking-wider text-muted-foreground">MAC 地址</span>
                  <span className="font-mono text-xs">{message.senderMac ?? '未知'}</span>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        avatar
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold" style={{ color: avatarColor(name) }}>
            {name}
          </span>
          {display.showIp && message.senderIp && (
            <span className="font-mono text-[11px] text-muted-foreground">{message.senderIp}</span>
          )}
          <span className="text-[11px] text-muted-foreground">{formatTime(message.createdAt)}</span>
        </div>
        <div className="text-[15px]/relaxed">
          <MessageBody message={message} onPreviewImage={onPreviewImage} />
        </div>
      </div>
    </MessageScrollerItem>
  )
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 pt-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-start gap-4">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

interface MessageListProps {
  messages: MessageRow[]
  loading?: boolean
  emptyContent?: React.ReactNode
  className?: string
  display: DisplaySettings
}

/**
 * Discord 式扁平消息流：日期分隔 + 同发送者折叠。
 * 滚动行为（贴底跟随、跳到最新）由 MessageScroller 原语负责。
 */
export function MessageList({ messages, loading, emptyContent, className, display }: MessageListProps) {
  const blocks = buildBlocks(messages)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  return (
    <>
      <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <MessageScroller className={cn('min-h-0 flex-1', className)}>
          <MessageScrollerViewport aria-label="消息列表">
            <MessageScrollerContent className="gap-0 pb-4">
              {loading ? (
                <LoadingSkeleton />
              ) : blocks.length === 0 ? (
                (emptyContent ?? null)
              ) : (
                blocks.map((block) =>
                  block.type === 'date' ? (
                    <DateDivider key={block.key} label={block.label} />
                  ) : (
                    <MessageRowView key={block.key} message={block.message} display={display} onPreviewImage={setPreviewUrl} />
                  ),
                )
              )}
            </MessageScrollerContent>
            <MessageScrollerButton direction="end" />
          </MessageScrollerViewport>
        </MessageScroller>
      </MessageScrollerProvider>

      {/* 图片应用内预览：覆盖在消息流之上的灯箱 */}
      <Dialog open={previewUrl !== null} onOpenChange={(open) => !open && setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl border-none bg-transparent p-0 [&>button]:-top-2 [&>button]:right-0 [&>button]:rounded-full [&>button]:bg-black/60">
          <DialogTitle className="sr-only">图片预览</DialogTitle>
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="图片预览" className="max-h-[80vh] w-full rounded-lg object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
