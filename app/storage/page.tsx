'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon, FileIcon, ImageIcon, Trash2Icon } from 'lucide-react'
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
  kind: 'image' | 'file'
  createdAt: number
}

export default function StoragePage() {
  const [files, setFiles] = useState<StorageFile[]>([])
  const [totalSize, setTotalSize] = useState(0)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/storage')
    if (!res.ok) return
    const body = (await res.json()) as { files: StorageFile[]; totalSize: number }
    setFiles(body.files)
    setTotalSize(body.totalSize)
    setLoaded(true)
  }, [])

  useEffect(() => {
    void (async () => {
      // 确保节点身份就绪（与主页面一致的免登录建立方式）
      await fetch('/api/me')
      void load()
    })()
  }, [load])

  const remove = async (id: string) => {
    const res = await fetch(`/api/files/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('已删除')
      await load()
    } else {
      toast.error('删除失败')
    }
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 md:px-4">
        <Button variant="ghost" size="icon-sm" aria-label="返回" asChild>
          <Link href="/">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <h1 className="font-semibold">存储管理</h1>
        <div className="flex-1" />
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
          总占用 {formatSize(totalSize)}
        </span>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto p-4 md:p-6">
        {loaded && files.length === 0 ? (
          <Empty className="rounded-xl bg-sidebar">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileIcon />
              </EmptyMedia>
              <EmptyTitle>还没有文件</EmptyTitle>
              <EmptyDescription>在会话中发送的图片与文件会集中保存在这里，供随时回看与下载。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-xl bg-sidebar">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>文件名</TableHead>
                  <TableHead className="w-24">大小</TableHead>
                  <TableHead className="w-44">时间</TableHead>
                  <TableHead className="w-16">
                    <span className="sr-only">操作</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2.5">
                        {file.kind === 'image' ? (
                          <ImageIcon className="size-4 shrink-0 text-nw-magenta" />
                        ) : (
                          <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="break-all">{file.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatSize(file.size)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(file.createdAt).toLocaleString('zh-CN', { hour12: false })}
                    </TableCell>
                    <TableCell>
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
                            <AlertDialogAction onClick={() => void remove(file.id)}>
                              删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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
