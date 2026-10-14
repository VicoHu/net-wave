'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DownloadIcon, EyeIcon, EyeOffIcon, FileIcon, Loader2Icon, Maximize2Icon, PlayIcon } from 'lucide-react'
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

/** 距底不超过该值视为「贴底」，新消息到达时自动跟随 */
const FOLLOW_THRESHOLD_PX = 24

/** 距顶不超过该值触发向上加载更早消息（留缓冲避免贴顶闪烁） */
const TOP_LOAD_THRESHOLD_PX = 80

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

/** XHR 拉取为 Blob（带进度回调），用于图片下载与视频「先下载后播放」 */
function fetchBlob(
  url: string,
  onProgress: (percent: number) => void,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url)
    xhr.responseType = 'blob'
    xhr.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status === 200) resolve(xhr.response as Blob)
      else if (xhr.status === 410) reject(new Error('文件已被删除，无法下载'))
      else reject(new Error('下载失败'))
    }
    xhr.onerror = () => reject(new Error('下载失败'))
    xhr.send()
  })
}

/** 触发浏览器保存一个 Blob（复用已下载内容，不二次请求） */
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** 文件消息卡片：XHR 下载以获得实时进度；被删除文件明确提示不可下载 */
function FileCard({ file }: { file: NonNullable<MessageRow['file']> }) {
  const [progress, setProgress] = useState<number | null>(null)

  const download = () => {
    setProgress(0)
    fetchBlob(`/api/files/${file.id}`, setProgress)
      .then((blob) => saveBlob(blob, file.name))
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setProgress(null))
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

/**
 * 视频消息：与图片同尺寸的大封面（preload=metadata 取首帧）+ 居中播放按钮，
 * 点击后完整下载（实时进度）并就地播放（原生控件含进度条与音量），右上角
 * 可展开到灯箱大图层，左上角眼睛按钮可恢复/取消安全模式模糊——弱网下
 * 完整下载后播放，不会边下边卡。
 */
function VideoCard({
  file,
  safeMode,
  blurStrength,
  onPlay,
}: {
  file: NonNullable<MessageRow['file']>
  safeMode: boolean
  blurStrength: number
  onPlay: (blob: Blob, name: string) => void
}) {
  const [progress, setProgress] = useState<number | null>(null)
  // 就地播放的 objectURL：组件卸载时回收；Blob 保留供展开灯箱复用（不二次下载）
  const [src, setSrc] = useState<string | null>(null)
  // 眼睛按钮的再模糊态：播放即主动查看默认清晰，可一键恢复模糊
  const [hidden, setHidden] = useState(false)
  const blobRef = useRef<Blob | null>(null)
  const srcRef = useRef<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => () => {
    if (srcRef.current) URL.revokeObjectURL(srcRef.current)
  }, [])

  const play = () => {
    if (progress != null || src) return
    setProgress(0)
    fetchBlob(`/api/files/${file.id}`, setProgress)
      .then((blob) => {
        blobRef.current = blob
        srcRef.current = URL.createObjectURL(blob)
        setSrc(srcRef.current)
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setProgress(null))
  }

  // 展开到灯箱前暂停原位播放：同一视频双路并行会双声道/双倍带宽
  const expand = () => {
    videoRef.current?.pause()
    if (blobRef.current) onPlay(blobRef.current, file.name)
  }

  // 已删除无封面可取：保留文件卡片样式仅作展示
  if (file.deleted) {
    return (
      <div className="flex max-w-md items-center gap-3 rounded-lg bg-sidebar p-3">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-rail">
          <FileIcon className="size-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{file.name}</div>
          <div className="text-xs text-muted-foreground">{formatSize(file.size)}</div>
        </div>
        <span className="shrink-0 rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-medium text-destructive">
          已删除
        </span>
      </div>
    )
  }

  if (src) {
    return (
      <div className={cn('relative w-fit', hidden && 'overflow-hidden rounded-lg')}>
        {/* 点击播放即主动查看：解除安全模式模糊；模糊时 scale+裁切防晕影，与封面同法 */}
        <video
          ref={videoRef}
          src={src}
          controls
          autoPlay
          playsInline
          className={cn('max-h-80 w-auto max-w-full rounded-lg', hidden && 'scale-110')}
          style={hidden ? { filter: `blur(${blurStrength}px)` } : undefined}
        />
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          aria-label={hidden ? '取消模糊' : '恢复模糊'}
          className="absolute top-2 left-2 rounded-full bg-black/60 text-white hover:bg-black/80"
          onClick={() => setHidden((v) => !v)}
        >
          {hidden ? <EyeIcon /> : <EyeOffIcon />}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          aria-label="展开到大图层播放"
          className="absolute top-2 right-2 rounded-full bg-black/60 text-white hover:bg-black/80"
          onClick={expand}
        >
          <Maximize2Icon />
        </Button>
      </div>
    )
  }

  return (
    <button
      type="button"
      aria-label={`播放视频 ${file.name}`}
      className="group relative block w-fit cursor-pointer overflow-hidden rounded-lg"
      onClick={play}
    >
      {/* 仅取首帧作封面（preload=metadata）；安全模式开启时加高斯模糊不直接清晰展示 */}
      <video
        src={`/api/files/${file.id}`}
        preload="metadata"
        muted
        playsInline
        aria-hidden
        className={cn('max-h-80 w-auto max-w-full', safeMode && 'scale-110')}
        style={safeMode ? { filter: `blur(${blurStrength}px)` } : undefined}
      />
      {progress != null ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-medium text-white">
          {progress}%
        </span>
      ) : (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-black/60 text-white transition-transform group-hover:scale-105">
            <PlayIcon className="size-6 fill-current" />
          </span>
        </span>
      )}
    </button>
  )
}

/** 单条消息正文：文本（含验证码复制 chip）/ 图片 / 视频 / 文件；图片与视频封面受安全模式与模糊强度控制 */
function MessageBody({
  message,
  safeMode,
  blurStrength,
  onPreviewImage,
  onPlayVideo,
}: {
  message: MessageRow
  safeMode: boolean
  blurStrength: number
  onPreviewImage: (url: string, name: string) => void
  onPlayVideo: (blob: Blob, name: string) => void
}) {
  if (message.kind === 'image' && message.file) {
    const file = message.file
    const url = `/api/files/${file.id}`
    return (
      <button
        type="button"
        aria-label={`查看图片 ${file.name}`}
        className="block w-fit cursor-zoom-in overflow-hidden rounded-lg"
        onClick={() => onPreviewImage(url, file.name)}
      >
        {/* 安全模式开启时高斯模糊，点击后在灯箱中清晰查看；模糊晕影由外层 overflow-hidden 裁在图片框内 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={file.name}
          className={cn('max-h-80 w-auto max-w-full', safeMode && 'scale-105')}
          style={safeMode ? { filter: `blur(${blurStrength}px)` } : undefined}
        />
      </button>
    )
  }
  if (message.kind === 'video' && message.file) {
    return <VideoCard file={message.file} safeMode={safeMode} blurStrength={blurStrength} onPlay={onPlayVideo} />
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
  onPlayVideo,
}: {
  message: MessageVM
  display: DisplaySettings
  onPreviewImage: (url: string, name: string) => void
  onPlayVideo: (blob: Blob, name: string) => void
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
          <MessageBody message={message} safeMode={display.safeMode} blurStrength={display.blurStrength} onPreviewImage={onPreviewImage} onPlayVideo={onPlayVideo} />
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
          <MessageBody message={message} safeMode={display.safeMode} blurStrength={display.blurStrength} onPreviewImage={onPreviewImage} onPlayVideo={onPlayVideo} />
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

interface MediaPreview {
  type: 'image' | 'video'
  /** 图片为原始 URL；视频为已下载 Blob 的 objectURL */
  url: string
  name: string
  /** 仅视频：保存下载时复用已下载的 Blob，避免二次请求 */
  blob?: Blob
}

/** 灯箱缩放上限与双击档位 */
const ZOOM_MAX = 8
const ZOOM_DOUBLE_TAP = 2.5

interface ZoomTransform {
  scale: number
  x: number
  y: number
}

/** 以容器内 (px,py) 为锚缩放：保持锚点下的内容不动；缩回 1x 时位移归零 */
function zoomAt(t: ZoomTransform, px: number, py: number, factor: number): ZoomTransform {
  const scale = Math.min(ZOOM_MAX, Math.max(1, t.scale * factor))
  if (scale === 1) return { scale: 1, x: 0, y: 0 }
  const k = scale / t.scale
  return { scale, x: px - k * (px - t.x), y: py - k * (py - t.y) }
}

/**
 * 灯箱缩放容器：滚轮/双指以指针为锚缩放，放大后拖拽平移，双击在 1x 与放大档间切换。
 * 外层固定不变换（锚点坐标基于其稳定 rect），内层整体 transform；
 * 拖拽超过阈值后吞掉紧随的 click，避免放大平移误触视频控件。
 */
function Zoomable({ children, className }: { children: React.ReactNode; className?: string }) {
  const [zoom, setZoom] = useState<ZoomTransform>({ scale: 1, x: 0, y: 0 })
  const outerRef = useRef<HTMLDivElement | null>(null)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const dragRef = useRef<{ px: number; py: number; baseX: number; baseY: number } | null>(null)
  const pinchRef = useRef<{ dist: number; base: ZoomTransform } | null>(null)
  const movedRef = useRef(false)

  // wheel 须 preventDefault（否则连滚带缩触发外层滚动/历史导航），React 合成事件是 passive，挂原生监听
  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      setZoom((t) => zoomAt(t, e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.2 : 1 / 1.2))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointersRef.current.size === 1 && zoom.scale > 1) {
      dragRef.current = { px: e.clientX, py: e.clientY, baseX: zoom.x, baseY: zoom.y }
      e.currentTarget.setPointerCapture(e.pointerId)
    } else if (pointersRef.current.size === 2) {
      const [p1, p2] = [...pointersRef.current.values()]
      pinchRef.current = { dist: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1, base: zoom }
      dragRef.current = null
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const rect = outerRef.current?.getBoundingClientRect()
    if (pinchRef.current && pointersRef.current.size >= 2 && rect) {
      const [p1, p2] = [...pointersRef.current.values()]
      const factor = Math.hypot(p1.x - p2.x, p1.y - p2.y) / pinchRef.current.dist
      setZoom(zoomAt(pinchRef.current.base, (p1.x + p2.x) / 2 - rect.left, (p1.y + p2.y) / 2 - rect.top, factor))
    } else if (dragRef.current) {
      const d = dragRef.current
      if (!movedRef.current && (Math.abs(e.clientX - d.px) > 3 || Math.abs(e.clientY - d.py) > 3)) {
        movedRef.current = true
      }
      setZoom((t) => ({ ...t, x: d.baseX + e.clientX - d.px, y: d.baseY + e.clientY - d.py }))
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
    dragRef.current = null
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    const rect = outerRef.current?.getBoundingClientRect()
    if (!rect) return
    setZoom((t) => zoomAt(t, e.clientX - rect.left, e.clientY - rect.top, t.scale === 1 ? ZOOM_DOUBLE_TAP : 1 / t.scale))
  }

  return (
    <div
      ref={outerRef}
      className={cn(
        'relative w-full touch-none select-none',
        zoom.scale > 1 ? 'cursor-grab' : 'cursor-zoom-in',
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onClickCapture={(e) => {
        if (movedRef.current) {
          e.preventDefault()
          e.stopPropagation()
          movedRef.current = false
        }
      }}
    >
      <div
        style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`, transformOrigin: '0 0' }}
      >
        {children}
      </div>
    </div>
  )
}

interface MessageListProps {
  messages: MessageRow[]
  loading?: boolean
  emptyContent?: React.ReactNode
  className?: string
  display: DisplaySettings
  /** 当前节点 id：自己发出的消息（含上传完成回显）即使正在上翻也强制回到底部 */
  selfId?: string | null
  /** 滚动接近顶部时请求加载更早消息（分页状态由调用方管理） */
  onLoadOlder?: () => void
  /** 正在加载更早消息：顶部显示指示器 */
  loadingOlder?: boolean
}

/**
 * Discord 式扁平消息流：日期分隔 + 同发送者折叠。
 * 贴底跟随由本组件自管（滚动原语的 follow 状态机在触摸过冲后无法恢复，
 * 这里以「距底 ≤ 阈值即贴底」的滚动位置判定替代）。
 * 更早消息在顶部前插：以首尾消息 id 是否同时变化区分「切换会话」与「头部前插」，
 * 前插时把 scrollTop 对位到锚点消息（视口首条可见项），视口停留在原消息上
 * （viewport 关闭原生 overflow-anchor，避免与手动锚定叠加双跳）。
 */
export function MessageList({
  messages,
  loading,
  emptyContent,
  className,
  display,
  selfId,
  onLoadOlder,
  loadingOlder,
}: MessageListProps) {
  const blocks = buildBlocks(messages)
  const [preview, setPreview] = useState<MediaPreview | null>(null)

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const followBottomRef = useRef(true)
  // 程序化贴底期间不更新贴底判定：content-visibility 的高度估算可能偏小，
  // 落点距底偏大，若据此刻 scroll 事件判定会误认为用户上翻而关闭跟随
  const programmaticScrollRef = useRef(false)
  const prevListRef = useRef<{ first: number | null; last: number | null }>({ first: null, last: null })
  // 头部前插的滚动锚点：触发加载时记录视口首条可见消息与其相对视口顶的偏移，
  // 前插后把 scrollTop 对位到该消息（content-visibility 的高度估算有偏差，
  // scrollHeight 差值补偿不够准，且渲染后高度收缩需二次修正）
  const anchorRef = useRef<{ el: HTMLElement; offsetInView: number } | null>(null)

  const scrollToBottom = () => {
    const el = viewportRef.current
    if (!el) return
    programmaticScrollRef.current = true
    el.scrollTop = el.scrollHeight
    // scroll 事件在下一帧派发，双 rAF 后复位标记
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false
      }),
    )
  }

  const handleScroll = () => {
    if (programmaticScrollRef.current) return
    const el = viewportRef.current
    if (!el) return
    followBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_THRESHOLD_PX
    // 接近顶部时请求更早消息；重复触发/翻尽与否由调用方状态机裁决
    if (onLoadOlder && el.scrollTop <= TOP_LOAD_THRESHOLD_PX) {
      const vpTop = el.getBoundingClientRect().top
      for (const item of el.querySelectorAll<HTMLElement>('[data-slot="message-scroller-item"]')) {
        if (item.getBoundingClientRect().bottom - vpTop > 4) {
          anchorRef.current = { el: item, offsetInView: item.getBoundingClientRect().top - vpTop }
          break
        }
      }
      onLoadOlder()
    }
  }

  // 会话切换重置为贴底；新消息追加时按贴底状态跟随；
  // 自己发出的消息（输入框发送或上传回显）总是回到最新处。
  // 仅以首尾消息 id 变化作判定，历史整体刷新（同 id 集合）不打扰当前滚动位置。
  // 首尾同时变化才算「切换会话」：头部前插更早消息只改首条 id，
  // 此时把 scrollTop 对位到锚点消息，让视口停留在触发加载的那条消息上。
  useLayoutEffect(() => {
    const first = messages[0]?.id ?? null
    const last = messages[messages.length - 1]?.id ?? null
    const prev = prevListRef.current
    prevListRef.current = { first, last }
    const switched = first !== prev.first && last !== prev.last
    const prepended = prev.first !== null && first !== null && first !== prev.first && last === prev.last
    const appended = last !== prev.last
    if (prepended) {
      const el = viewportRef.current
      const anchor = anchorRef.current
      const content = contentRef.current
      if (el && anchor?.el.isConnected && content) {
        // 锚点对位（目标：anchor 相对视口顶 == 触发加载时的偏移）。
        // content-visibility 未渲染项按 10rem 估算（约为真实行高 5 倍），prepend 后
        // 视口附近的项逐帧渲染、高度持续收缩，单次/固定帧数补偿都不收敛——
        // 以 ResizeObserver 事件驱动：内容尺寸每次变化就重新对位，直至稳定。
        let anchoring = true
        let expected: number | null = null
        const keepAnchor = () => {
          el.scrollTop += anchor.el.getBoundingClientRect().top - el.getBoundingClientRect().top - anchor.offsetInView
          expected = el.scrollTop
        }
        // 区分程序赋值与用户滚动：scrollTop 与期望不符即用户已滚，锚定让位
        const onScroll = () => {
          if (anchoring && expected !== null && Math.abs(el.scrollTop - expected) > 1) {
            anchoring = false
            teardown()
          }
        }
        const observer = new ResizeObserver(() => {
          if (!anchoring || !anchor.el.isConnected) {
            teardown()
            return
          }
          keepAnchor()
        })
        const teardown = () => {
          observer.disconnect()
          el.removeEventListener('scroll', onScroll)
          clearTimeout(timer)
        }
        const timer = setTimeout(teardown, 1200)
        el.addEventListener('scroll', onScroll, { passive: true })
        observer.observe(content)
        keepAnchor()
      }
    }
    if (switched) followBottomRef.current = true
    const fromSelf = selfId != null && messages[messages.length - 1]?.senderId === selfId
    if (appended && fromSelf) followBottomRef.current = true
    if ((switched || appended) && followBottomRef.current) scrollToBottom()
  }, [messages, selfId])

  // 内容高度变化（图片/视频封面加载完成、行高修正）时保持贴底
  useEffect(() => {
    const content = contentRef.current
    if (!content || typeof ResizeObserver === 'undefined') return
    let lastHeight = content.offsetHeight
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? lastHeight
      if (Math.abs(height - lastHeight) < 1) return
      lastHeight = height
      if (followBottomRef.current) scrollToBottom()
    })
    observer.observe(content)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closePreview = () => {
    if (preview?.type === 'video') URL.revokeObjectURL(preview.url)
    setPreview(null)
  }

  const playVideo = (blob: Blob, name: string) => {
    if (preview?.type === 'video') URL.revokeObjectURL(preview.url)
    setPreview({ type: 'video', url: URL.createObjectURL(blob), name, blob })
  }

  /** 图片清晰查看（灯箱内亦可下载） */
  const previewImage = (url: string, name: string) => {
    if (preview?.type === 'video') URL.revokeObjectURL(preview.url)
    setPreview({ type: 'image', url, name })
  }

  return (
    <>
      <MessageScrollerProvider defaultScrollPosition="end">
        <MessageScroller className={cn('min-h-0 flex-1', className)}>
          <MessageScrollerViewport
            aria-label="消息列表"
            className="[overflow-anchor:none]"
            ref={viewportRef}
            onScroll={handleScroll}
          >
            <MessageScrollerContent className="gap-0 pb-4" ref={contentRef}>
              {loading ? (
                <LoadingSkeleton />
              ) : blocks.length === 0 ? (
                (emptyContent ?? null)
              ) : (
                blocks.map((block) =>
                  block.type === 'date' ? (
                    <DateDivider key={block.key} label={block.label} />
                  ) : (
                    <MessageRowView
                      key={block.key}
                      message={block.message}
                      display={display}
                      onPreviewImage={previewImage}
                      onPlayVideo={playVideo}
                    />
                  ),
                )
              )}
            </MessageScrollerContent>
            <MessageScrollerButton direction="end" />
          </MessageScrollerViewport>
          {/* 加载指示器浮在列表顶部、脱离内容流：出现/消失不改变内容高度，不干扰滚动锚定 */}
          {loadingOlder && (
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center py-2"
              role="status"
              aria-label="正在加载更早的消息"
            >
              <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </MessageScroller>
      </MessageScrollerProvider>

      {/* 媒体预览：覆盖在消息流之上的灯箱，图片/视频均可缩放与下载 */}
      <Dialog open={preview !== null} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent className="max-w-3xl border-none bg-transparent p-0 [&>button]:-top-2 [&>button]:right-0 [&>button]:rounded-full [&>button]:bg-black/60">
          <DialogTitle className="sr-only">{preview?.type === 'video' ? '视频播放' : '图片预览'}</DialogTitle>
          {preview?.type === 'image' && (
            <Zoomable>
              {/* touchAction none：双指交给 Zoomable 捏合，而非浏览器页面缩放 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt="图片预览"
                style={{ touchAction: 'none' }}
                draggable={false}
                className="max-h-[80vh] w-full rounded-lg object-contain"
              />
            </Zoomable>
          )}
          {preview?.type === 'video' && (
            <Zoomable>
              <video
                src={preview.url}
                controls
                autoPlay
                playsInline
                style={{ touchAction: 'none' }}
                className="max-h-[80vh] w-full rounded-lg"
              />
            </Zoomable>
          )}
          {preview && <MediaSaveButton preview={preview} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** 灯箱下载按钮：视频直接保存已下载的 Blob；图片走 XHR 下载以显示进度 */
function MediaSaveButton({ preview }: { preview: MediaPreview }) {
  const [progress, setProgress] = useState<number | null>(null)

  const save = () => {
    if (preview.type === 'video' && preview.blob) {
      saveBlob(preview.blob, preview.name)
      return
    }
    setProgress(0)
    fetchBlob(preview.url, setProgress)
      .then((blob) => saveBlob(blob, preview.name))
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setProgress(null))
  }

  return (
    <div className="mt-3 flex justify-center">
      <Button size="sm" variant="secondary" disabled={progress != null} onClick={save} className="gap-1.5 bg-black/60">
        {progress != null ? (
          `${preview.type === 'video' ? '下载' : ''}${progress}%`
        ) : (
          <>
            <DownloadIcon data-icon="inline-start" />
            下载 {preview.name}
          </>
        )}
      </Button>
    </div>
  )
}
