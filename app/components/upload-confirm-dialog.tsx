'use client'

import { useEffect, useState } from 'react'
import { FileIcon, ImageIcon, VideoIcon } from 'lucide-react'
import { Button } from '@components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog'
import { formatSize } from '../format'

export interface PendingUpload {
  key: number
  file: File
}

/** 弹窗主体（受控、无 Radix 上下文依赖）：待发清单 + 勾选剔除 + 底部操作，抽出便于静态渲染测试 */
export function UploadConfirmBody({
  pending,
  thumbnails = {},
  checked,
  onToggle,
  onConfirm,
  onCancel,
}: {
  pending: PendingUpload[]
  thumbnails?: Record<number, string>
  checked: Record<number, boolean>
  onToggle: (key: number) => void
  onConfirm: (files: File[]) => void
  onCancel: () => void
}) {
  const checkedFiles = pending.filter((item) => checked[item.key]).map((item) => item.file)
  const checkedSize = checkedFiles.reduce((sum, file) => sum + file.size, 0)

  return (
    <>
      <div className="max-h-64 overflow-y-auto rounded-lg border border-white/[0.06]">
        {pending.map(({ key, file }) => (
          <label key={key} className="flex items-center gap-3 border-b border-white/[0.06] px-3 py-2 text-sm last:border-b-0">
            <input
              type="checkbox"
              checked={checked[key] ?? false}
              onChange={() => onToggle(key)}
              className="size-4 shrink-0 accent-primary"
              aria-label={`发送 ${file.name}`}
            />
            {thumbnails[key] ? (
              <img src={thumbnails[key]} alt="" className="size-8 shrink-0 rounded object-cover" />
            ) : file.type.startsWith('video/') ? (
              <VideoIcon className="size-4 shrink-0 text-nw-magenta" />
            ) : file.type.startsWith('image/') ? (
              <ImageIcon className="size-4 shrink-0 text-nw-magenta" />
            ) : (
              <FileIcon className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <span className="shrink-0 text-muted-foreground">{formatSize(file.size)}</span>
          </label>
        ))}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button onClick={() => onConfirm(checkedFiles)} disabled={checkedFiles.length === 0}>
          发送 {checkedFiles.length} 个（{formatSize(checkedSize)}）
        </Button>
      </div>
    </>
  )
}

/**
 * 上传确认（ADR-0004）：发送文件（含粘贴的图片/视频）前的二次确认弹窗。
 * 单弹窗汇总全部待发文件，勾选框默认全选、可剔除个别文件；始终启用，不提供「不再询问」。
 */
export function UploadConfirmDialog({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingUpload[]
  onConfirm: (files: File[]) => void
  onCancel: () => void
}) {
  // 图片缩略图 objectURL：清单变化时重建，卸载/清空时回收
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({})
  useEffect(() => {
    const urls: Record<number, string> = {}
    for (const item of pending) {
      if (item.file.type.startsWith('image/')) urls[item.key] = URL.createObjectURL(item.file)
    }
    setThumbnails(urls)
    return () => {
      for (const url of Object.values(urls)) URL.revokeObjectURL(url)
    }
  }, [pending])

  // 勾选状态：新加入的文件默认选中，已存在的保留原勾选
  const [checked, setChecked] = useState<Record<number, boolean>>({})
  useEffect(() => {
    setChecked((prev) => Object.fromEntries(pending.map((item) => [item.key, prev[item.key] ?? true])))
  }, [pending])

  return (
    <Dialog open={pending.length > 0} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>发送 {pending.length} 个文件？</DialogTitle>
          <DialogDescription>文件将上传并发送到当前会话；取消勾选可暂不发送个别文件。</DialogDescription>
        </DialogHeader>
        <UploadConfirmBody
          pending={pending}
          thumbnails={thumbnails}
          checked={checked}
          onToggle={(key) => setChecked((prev) => ({ ...prev, [key]: !prev[key] }))}
          onConfirm={(files) => onConfirm(files)}
          onCancel={onCancel}
        />
      </DialogContent>
    </Dialog>
  )
}
