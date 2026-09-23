'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRightIcon, ShieldIcon } from 'lucide-react'
import { Button } from '@components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog'
import { Switch } from '@components/ui/switch'
import { Slider } from '@components/ui/slider'
import { Separator } from '@components/ui/separator'
// 模糊强度预览样图：直接同名覆盖 app/components/blur-preview.jpg 即可替换（建议宽 360px 左右），
// 浮层高度按图片固有宽高比自适应；若更换格式（png/webp 等）需同步修改下方 import 的扩展名
import blurPreview from './blur-preview.jpg'

/** 消息区显示偏好：仅影响本机视图，默认开启 */
export interface DisplaySettings {
  showIp: boolean
  showMac: boolean
  /** 安全模式：图片与视频封面默认高斯模糊 */
  safeMode: boolean
  /** 安全模式下的高斯模糊半径（px） */
  blurStrength: number
}

const IP_KEY = 'nw_show_ip'
const MAC_KEY = 'nw_show_mac'
const SAFE_MODE_KEY = 'nw_safe_mode'
const BLUR_STRENGTH_KEY = 'nw_blur_strength'

const BLUR_STRENGTH_DEFAULT = 16
const BLUR_STRENGTH_MAX = 40

const readBlurStrength = () => {
  const raw = localStorage.getItem(BLUR_STRENGTH_KEY)
  const value = raw == null ? NaN : Number(raw)
  return Number.isFinite(value) && value >= 0 && value <= BLUR_STRENGTH_MAX
    ? value
    : BLUR_STRENGTH_DEFAULT
}

export function useDisplaySettings(): [DisplaySettings, (patch: Partial<DisplaySettings>) => void] {
  const [settings, setSettings] = useState<DisplaySettings>({
    showIp: true,
    showMac: true,
    safeMode: true,
    blurStrength: BLUR_STRENGTH_DEFAULT,
  })

  useEffect(() => {
    setSettings({
      showIp: localStorage.getItem(IP_KEY) !== '0',
      showMac: localStorage.getItem(MAC_KEY) !== '0',
      safeMode: localStorage.getItem(SAFE_MODE_KEY) !== '0',
      blurStrength: readBlurStrength(),
    })
  }, [])

  const update = (patch: Partial<DisplaySettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      if (patch.showIp != null) localStorage.setItem(IP_KEY, patch.showIp ? '1' : '0')
      if (patch.showMac != null) localStorage.setItem(MAC_KEY, patch.showMac ? '1' : '0')
      if (patch.safeMode != null) localStorage.setItem(SAFE_MODE_KEY, patch.safeMode ? '1' : '0')
      if (patch.blurStrength != null) localStorage.setItem(BLUR_STRENGTH_KEY, String(patch.blurStrength))
      return next
    })
  }

  return [settings, update]
}

/** 滑块拖动时悬浮在滑块上方的实时预览浮层：绝对定位跟随拇指位置，pointer-events-none 防止干扰拖拽 */
function BlurPreview({ strength, percent }: { strength: number; percent: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-full z-50 mb-2 -translate-x-1/2"
      style={{ left: `${percent}%` }}
    >
      <div className="w-44 overflow-hidden rounded-lg border bg-popover p-1 shadow-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={blurPreview.src}
          alt=""
          className="w-full scale-105 rounded-md"
          style={{ filter: `blur(${strength}px)` }}
        />
        <p className="py-1 text-center text-xs tabular-nums text-muted-foreground">{strength}px</p>
      </div>
    </div>
  )
}

interface SettingsDialogProps {
  visible: boolean
  onOpenChange: (open: boolean) => void
  settings: DisplaySettings
  onChange: (patch: Partial<DisplaySettings>) => void
}

export function SettingsDialog({ visible, onOpenChange, settings, onChange }: SettingsDialogProps) {
  const [dragging, setDragging] = useState(false)

  // 拖动在窗口外松开也要收起预览，监听挂在 window 上
  useEffect(() => {
    if (!dragging) return
    const stop = () => setDragging(false)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [dragging])

  const percent = (settings.blurStrength / BLUR_STRENGTH_MAX) * 100

  return (
    <Dialog open={visible} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>偏好仅作用于本机视图。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">显示 IP 地址</p>
              <p className="text-xs text-muted-foreground">在消息中昵称旁小字展示。关闭后，任何节点的 IP 都不再对你显示。</p>
            </div>
            <Switch
              checked={settings.showIp}
              aria-label="显示 IP 地址"
              onCheckedChange={(checked) => onChange({ showIp: checked })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">显示 MAC 地址</p>
              <p className="text-xs text-muted-foreground">点击消息头像时在资料卡中展示。关闭后，任何节点的 MAC 都不再对你显示。</p>
            </div>
            <Switch
              checked={settings.showMac}
              aria-label="显示 MAC 地址"
              onCheckedChange={(checked) => onChange({ showMac: checked })}
            />
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">模糊强度</p>
                <p className="text-xs text-muted-foreground">安全模式下图片与视频封面的高斯模糊半径。</p>
              </div>
              <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{settings.blurStrength}px</span>
            </div>
            <div className="relative">
              {dragging && <BlurPreview strength={settings.blurStrength} percent={percent} />}
              <Slider
                value={[settings.blurStrength]}
                min={0}
                max={BLUR_STRENGTH_MAX}
                step={1}
                aria-label="模糊强度"
                onValueChange={([value]) => onChange({ blurStrength: value })}
                onPointerDown={() => setDragging(true)}
              />
            </div>
          </div>
          <Separator />
          <Button variant="ghost" className="justify-between px-2" asChild>
            <Link href="/admin" onClick={() => onOpenChange(false)}>
              <span className="flex items-center gap-2 text-sm">
                <ShieldIcon data-icon="inline-start" />
                管理中心
              </span>
              <ChevronRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
