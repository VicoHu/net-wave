'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon, FileIcon, ImageIcon, Trash2Icon, DownloadIcon, VideoIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@components/ui/alert-dialog'
import { Button } from '@components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@components/ui/empty'
import { Input } from '@components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@components/ui/table'
import { formatSize } from '../format'

interface StorageFile {
  id: string
  name: string
  size: number
  mime: string
  kind: 'image' | 'video' | 'file'
  createdAt: number
  uploadedBy: string
  uploaderName: string
  conversationLabel: string | null
  accessCount: number
  lastAccessAt: number | null
}

interface StorageResponse {
  files: StorageFile[]
  totalSize: number
  scope: 'admin' | 'mine'
}

function formatTime(ts: number | null): string {
  return ts == null ? '—' : new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

function KindIcon({ kind }: { kind: StorageFile['kind'] }) {
  if (kind === 'image') return <ImageIcon className="size-4 shrink-0 text-nw-magenta" />
  if (kind === 'video') return <VideoIcon className="size-4 shrink-0 text-nw-magenta" />
  return <FileIcon className="size-4 shrink-0 text-muted-foreground" />
}

function DownloadButton({ file }: { file: StorageFile }) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label={`下载 ${file.name}`} className="text-muted-foreground hover:text-foreground" asChild>
      <a href={`/api/files/${file.id}`} download={file.name}>
        <DownloadIcon />
      </a>
    </Button>
  )
}

/** 管理员视角：单文件删除（带确认） */
function DeleteButton({ file, onDeleted }: { file: StorageFile; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false)
  const remove = async () => {
    setDeleting(true)
    const res = await fetch(`/api/files/${file.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) {
      toast.success('已删除')
      onDeleted()
    } else {
      toast.error('删除失败')
    }
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`删除 ${file.name}`} className="text-muted-foreground hover:text-destructive">
          <Trash2Icon />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除「{file.name}」？</AlertDialogTitle>
          <AlertDialogDescription>
            删除后历史消息中的下载入口将失效，此操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction disabled={deleting} onClick={() => void remove()}>
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** 批量删除面板：填条件（AND 组合，可选填）→ 预览命中文件（可剔除）→ 确认执行 */
function BatchDeletePanel({ onDeleted }: { onDeleted: () => void }) {
  const [sizeValue, setSizeValue] = useState('')
  const [sizeUnit, setSizeUnit] = useState<'MB' | 'GB'>('MB')
  const [daysValue, setDaysValue] = useState('')
  const [preview, setPreview] = useState<StorageFile[] | null>(null)
  // 勾选状态：默认全选，确认时只删勾选项
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [running, setRunning] = useState(false)

  const hasCondition = sizeValue.trim() !== '' || daysValue.trim() !== ''

  const buildQuery = (): string => {
    const params = new URLSearchParams()
    const size = Number(sizeValue)
    if (sizeValue.trim() !== '' && Number.isFinite(size) && size > 0) {
      params.set('min_size', String(Math.round(size * (sizeUnit === 'GB' ? 1024 ** 3 : 1024 ** 2))))
    }
    const days = Number(daysValue)
    if (daysValue.trim() !== '' && Number.isFinite(days) && days > 0) {
      params.set('before', String(Date.now() - days * 86_400_000))
    }
    return params.size > 0 ? `?${params.toString()}` : ''
  }

  const runPreview = async () => {
    const res = await fetch(`/api/storage${buildQuery()}`)
    if (!res.ok) {
      toast.error('预览失败')
      return
    }
    const body = (await res.json()) as StorageResponse
    if (body.files.length === 0) {
      toast.info('没有符合条件的文件')
      setPreview(null)
      return
    }
    setPreview(body.files)
    setChecked(Object.fromEntries(body.files.map((f) => [f.id, true])))
  }

  const checkedFiles = preview?.filter((f) => checked[f.id]) ?? []
  const checkedSize = checkedFiles.reduce((sum, f) => sum + f.size, 0)

  const confirmDelete = async () => {
    setRunning(true)
    const res = await fetch('/api/admin/storage/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: checkedFiles.map((f) => f.id) }),
    })
    setRunning(false)
    if (!res.ok) {
      toast.error('批量删除失败')
      return
    }
    const body = (await res.json()) as { deleted: number; freedSize: number }
    toast.success(`已删除 ${body.deleted} 个文件，释放 ${formatSize(body.freedSize)}`)
    setPreview(null)
    onDeleted()
  }

  const cancelPreview = () => {
    setPreview(null)
    setChecked({})
  }

  if (preview) {
    const allChecked = checkedFiles.length === preview.length
    return (
      <section className="mb-4 rounded-xl border border-destructive/40 bg-sidebar p-4">
        <h2 className="font-semibold text-destructive">预览待删除文件</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          共 {preview.length} 个文件命中条件（{formatSize(preview.reduce((sum, f) => sum + f.size, 0))}），已勾选 {checkedFiles.length} 个（{formatSize(checkedSize)}）；取消勾选可保留个别文件。
        </p>
        <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-white/[0.06]">
          {preview.map((file) => (
            <label key={file.id} className="flex items-center gap-3 border-b border-white/[0.06] px-3 py-2 text-sm last:border-b-0">
              <input
                type="checkbox"
                checked={checked[file.id] ?? false}
                onChange={() => setChecked((prev) => ({ ...prev, [file.id]: !prev[file.id] }))}
                className="size-4 shrink-0 accent-primary"
                aria-label={`勾选 ${file.name}`}
              />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-muted-foreground">{formatSize(file.size)}</span>
              <span className="hidden shrink-0 text-muted-foreground md:inline">{formatTime(file.createdAt)}</span>
            </label>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setChecked(Object.fromEntries(preview.map((f) => [f.id, !allChecked])))}>
            {allChecked ? '全不选' : '全选'}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={cancelPreview} disabled={running}>
              取消
            </Button>
            <Button variant="destructive" size="sm" onClick={() => void confirmDelete()} disabled={running || checkedFiles.length === 0}>
              {running ? '删除中…' : `确认删除 ${checkedFiles.length} 个（${formatSize(checkedSize)}）`}
            </Button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="mb-4 rounded-xl bg-sidebar p-4">
      <h2 className="font-semibold">批量清理</h2>
      <p className="mt-1 text-sm text-muted-foreground">按条件筛选后先预览命中文件，确认后才删除；多个条件同时满足才命中。</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">大小大于</span>
          <Input
            value={sizeValue}
            onChange={(e) => setSizeValue(e.target.value)}
            inputMode="numeric"
            placeholder="如 2"
            className="h-8 w-20"
            aria-label="文件大小阈值"
          />
          <select
            value={sizeUnit}
            onChange={(e) => setSizeUnit(e.target.value as 'MB' | 'GB')}
            className="h-8 rounded-md border border-input bg-transparent px-1.5"
            aria-label="大小单位"
          >
            <option value="MB">MB</option>
            <option value="GB">GB</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">上传早于</span>
          <Input
            value={daysValue}
            onChange={(e) => setDaysValue(e.target.value)}
            inputMode="numeric"
            placeholder="如 30"
            className="h-8 w-20"
            aria-label="天数阈值"
          />
          <span className="text-muted-foreground">天前</span>
        </label>
        <Button size="sm" onClick={() => void runPreview()} disabled={!hasCondition}>
          预览
        </Button>
      </div>
    </section>
  )
}

export default function StoragePage() {
  const [files, setFiles] = useState<StorageFile[]>([])
  const [totalSize, setTotalSize] = useState(0)
  const [scope, setScope] = useState<'admin' | 'mine'>('mine')
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/storage')
    if (!res.ok) return
    const body = (await res.json()) as StorageResponse
    setFiles(body.files)
    setTotalSize(body.totalSize)
    setScope(body.scope)
    setLoaded(true)
  }, [])

  useEffect(() => {
    void (async () => {
      // 确保节点身份就绪（与主页面一致的免登录建立方式）
      await fetch('/api/me')
      void load()
    })()
  }, [load])

  const isAdmin = scope === 'admin'

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 md:px-4">
        <Button variant="ghost" size="icon-sm" aria-label="返回" asChild>
          <Link href="/">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <h1 className="font-semibold">存储管理</h1>
        {!isAdmin && loaded && (
          <span className="text-xs text-muted-foreground">仅显示你上传的文件，只读</span>
        )}
        <div className="flex-1" />
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
          总占用 {formatSize(totalSize)}
        </span>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto p-4 md:p-6">
        {isAdmin && <BatchDeletePanel onDeleted={() => void load()} />}
        {loaded && files.length === 0 ? (
          <Empty className="rounded-xl bg-sidebar">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileIcon />
              </EmptyMedia>
              <EmptyTitle>{isAdmin ? '还没有文件' : '你还没有上传过文件'}</EmptyTitle>
              <EmptyDescription>
                {isAdmin
                  ? '节点上传的图片与文件会集中保存在这里，可按条件批量清理。'
                  : '在会话中发送的图片与文件会出现在这里，供随时回看与下载。'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-sidebar">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>文件名</TableHead>
                  <TableHead className="w-24">大小</TableHead>
                  <TableHead className="w-44">上传时间</TableHead>
                  {isAdmin && <TableHead className="w-28">上传者</TableHead>}
                  {isAdmin && <TableHead className="w-40">所属会话</TableHead>}
                  <TableHead className="w-20">访问次数</TableHead>
                  <TableHead className="w-44">最后访问</TableHead>
                  <TableHead className="w-24">
                    <span className="sr-only">操作</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <KindIcon kind={file.kind} />
                        <span className="break-all">{file.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatSize(file.size)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatTime(file.createdAt)}</TableCell>
                    {isAdmin && <TableCell className="text-muted-foreground">{file.uploaderName}</TableCell>}
                    {isAdmin && (
                      <TableCell className="max-w-40 truncate text-muted-foreground">
                        {file.conversationLabel ?? '未发送'}
                      </TableCell>
                    )}
                    <TableCell className="text-muted-foreground">{file.accessCount}</TableCell>
                    <TableCell className="text-muted-foreground">{formatTime(file.lastAccessAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <DownloadButton file={file} />
                        {isAdmin && <DeleteButton file={file} onDeleted={() => void load()} />}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </div>
  )
}
