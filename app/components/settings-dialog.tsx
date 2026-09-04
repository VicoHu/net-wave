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
import { Separator } from '@components/ui/separator'

/** 消息区网络信息的显示偏好：仅影响本机视图，默认开启 */
export interface DisplaySettings {
  showIp: boolean
  showMac: boolean
}

const IP_KEY = 'nw_show_ip'
const MAC_KEY = 'nw_show_mac'

export function useDisplaySettings(): [DisplaySettings, (patch: Partial<DisplaySettings>) => void] {
  const [settings, setSettings] = useState<DisplaySettings>({ showIp: true, showMac: true })

  useEffect(() => {
    setSettings({ showIp: localStorage.getItem(IP_KEY) !== '0', showMac: localStorage.getItem(MAC_KEY) !== '0' })
  }, [])

  const update = (patch: Partial<DisplaySettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      if (patch.showIp != null) localStorage.setItem(IP_KEY, patch.showIp ? '1' : '0')
      if (patch.showMac != null) localStorage.setItem(MAC_KEY, patch.showMac ? '1' : '0')
      return next
    })
  }

  return [settings, update]
}

interface SettingsDialogProps {
  visible: boolean
  onOpenChange: (open: boolean) => void
  settings: DisplaySettings
  onChange: (patch: Partial<DisplaySettings>) => void
}

export function SettingsDialog({ visible, onOpenChange, settings, onChange }: SettingsDialogProps) {
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
