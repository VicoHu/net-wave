'use client'

import { useRef, useState } from 'react'
import { PlusIcon, SendHorizontalIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@components/ui/button'
import { Spinner } from '@components/ui/spinner'

interface UploadTask {
  key: number
  name: string
  progress: number
}

interface ChatInputProps {
  placeholder: string
  onSendText: (text: string) => void
  onSendFile: (fileId: string) => void
  /** 会话未就绪时禁用输入 */
  disabled?: boolean
}

/**
 * Discord 式输入条：+ 上传附件（XHR 实时进度，完成后立即作为消息发出）、
 * Enter 发送 / Shift+Enter 换行（兼容中文输入法组词态）、文本非空时出现发送按钮。
 */
export function ChatInput({ placeholder, onSendText, onSendFile, disabled }: ChatInputProps) {
  const [text, setText] = useState('')
  const [uploads, setUploads] = useState<UploadTask[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadKeyRef = useRef(0)

  const autoResize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 192)}px`
  }

  const send = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSendText(trimmed)
    setText('')
    requestAnimationFrame(autoResize)
  }

  const uploadFile = (file: File) => {
    const key = ++uploadKeyRef.current
    setUploads((prev) => [...prev, { key, name: file.name, progress: 0 }])
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/files')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100)
        setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, progress: percent } : u)))
      }
    }
    xhr.onload = () => {
      setUploads((prev) => prev.filter((u) => u.key !== key))
      if (xhr.status === 200) {
        try {
          const body = JSON.parse(xhr.responseText) as { fileId?: string }
          if (body.fileId) {
            onSendFile(body.fileId)
            return
          }
        } catch {
          // 响应非预期 JSON，落入下方失败提示
        }
      }
      toast.error(`「${file.name}」上传失败`)
    }
    xhr.onerror = () => {
      setUploads((prev) => prev.filter((u) => u.key !== key))
      toast.error(`「${file.name}」上传失败`)
    }
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  }

  const onPickFiles = (files: FileList | null) => {
    if (!files) return
    for (const file of files) uploadFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="px-4 pb-5">
      {uploads.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {uploads.map((u) => (
            <span
              key={u.key}
              className="inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5 text-xs text-secondary-foreground"
            >
              <Spinner className="size-3" />
              <span className="max-w-40 truncate">{u.name}</span>
              <span className="text-muted-foreground">{u.progress}%</span>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-1 rounded-3xl bg-secondary px-2 py-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full text-muted-foreground hover:text-foreground"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          aria-label="上传附件"
        >
          <PlusIcon />
        </Button>
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          aria-label="输入消息"
          className="max-h-48 flex-1 resize-none self-center bg-transparent px-1 py-1.5 text-[15px] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          onChange={(e) => {
            setText(e.target.value)
            autoResize()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
        />
        {text.trim() !== '' && (
          <Button
            size="icon-sm"
            className="mb-0.5 shrink-0 rounded-full"
            onClick={send}
            aria-label="发送"
          >
            <SendHorizontalIcon />
          </Button>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => onPickFiles(e.target.files)}
      />
    </div>
  )
}
