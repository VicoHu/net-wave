'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon, Loader2Icon, ShieldIcon, TrashIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Badge } from '@components/ui/badge'
import { Skeleton } from '@components/ui/skeleton'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@components/ui/table'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@components/ui/field'

interface AdminRoom {
  id: number
  name: string
  createdBy: string | null
  creatorName: string | null
  memberCount: number
  messageCount: number
  createdAt: number
}

function formatDateTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 管理员登录卡片：错误密码提示重试等待，被限流时展示剩余秒数 */
function LoginForm({ onLogin }: { onLogin: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || pending) return
    setPending(true)
    setError(null)
    try {
      await onLogin(password)
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm rounded-xl border bg-sidebar p-6">
      <div className="mb-4 flex flex-col items-center gap-2 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-white">
          <ShieldIcon className="size-6" />
        </div>
        <h1 className="text-lg font-bold">管理中心</h1>
        <p className="text-sm text-muted-foreground">
          输入服务中心管理员密码继续；初始密码见服务中心启动日志。
        </p>
      </div>
      <FieldGroup>
        <Field data-invalid={error != null || undefined}>
          <FieldLabel htmlFor="admin-password">管理员密码</FieldLabel>
          <Input
            id="admin-password"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? (
            <FieldDescription aria-live="polite">{error}</FieldDescription>
          ) : (
            <FieldDescription>连续失败会触发逐步加长的等待时间。</FieldDescription>
          )}
        </Field>
      </FieldGroup>
      <Button type="submit" className="mt-4 w-full" disabled={pending || !password}>
        {pending && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
        登录
      </Button>
    </form>
  )
}

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [rooms, setRooms] = useState<AdminRoom[] | null>(null)

  const loadRooms = useCallback(async () => {
    const res = await fetch('/api/admin/rooms')
    if (res.status === 401) {
      setAuthed(false)
      return
    }
    const body = (await res.json()) as { rooms: AdminRoom[] }
    setRooms(body.rooms)
  }, [])

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/admin/session')
      const body = (await res.json()) as { authenticated: boolean }
      setAuthed(body.authenticated)
      if (body.authenticated) void loadRooms()
    })()
  }, [loadRooms])

  const login = async (password: string) => {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      setAuthed(true)
      void loadRooms()
      return
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? '登录失败')
  }

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' })
    setAuthed(false)
    setRooms(null)
  }

  const deleteRoom = async (roomId: number, name: string) => {
    const res = await fetch(`/api/admin/rooms/${roomId}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error(`删除房间 ${name} 失败`)
      return
    }
    toast.success(`已删除房间 ${name}`)
    void loadRooms()
  }

  if (authed === null) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!authed) {
    return (
      <div className="flex h-dvh items-center justify-center bg-chat p-4">
        <LoginForm onLogin={login} />
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col bg-chat">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 md:px-4">
        <Button variant="ghost" size="icon-sm" aria-label="返回聊天" asChild>
          <Link href="/">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <ShieldIcon className="size-4 text-muted-foreground" />
        <h1 className="flex-1 truncate font-semibold">管理中心</h1>
        <Button variant="ghost" size="sm" onClick={() => void logout()}>
          退出登录
        </Button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">房间管理</h2>
            <span className="text-xs text-muted-foreground">删除房间会一并移除其成员与历史消息</span>
          </div>
          {rooms === null ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rooms.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">还没有房间</p>
          ) : (
            <div className="rounded-lg border bg-sidebar">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">名称</TableHead>
                    <TableHead>创建者</TableHead>
                    <TableHead>成员</TableHead>
                    <TableHead>消息数</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead className="pr-4 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rooms.map((room) => (
                    <TableRow key={room.id}>
                      <TableCell className="pl-4 font-medium">
                        <span className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">#</span>
                          {room.name}
                        </span>
                      </TableCell>
                      <TableCell>
                        {room.creatorName ? (
                          room.creatorName
                        ) : (
                          <Badge variant="secondary">未知</Badge>
                        )}
                      </TableCell>
                      <TableCell>{room.memberCount}</TableCell>
                      <TableCell>{room.messageCount}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(room.createdAt)}</TableCell>
                      <TableCell className="pr-4 text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`删除房间 ${room.name}`} className="text-muted-foreground hover:text-destructive">
                              <TrashIcon />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>删除房间 #{room.name}？</AlertDialogTitle>
                              <AlertDialogDescription>
                                将同时删除 {room.memberCount} 名成员的会话入口与 {room.messageCount} 条历史消息，操作不可撤销。
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction variant="destructive" onClick={() => void deleteRoom(room.id, room.name)}>
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
        </div>
      </main>
    </div>
  )
}
