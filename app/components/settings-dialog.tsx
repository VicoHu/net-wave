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
import { currentNotificationPermission, type NotificationPermissionState } from '../notifications'
// 模糊强度预览样图：直接同名覆盖 app/components/blur-preview.jpg 即可替换
// （显示宽度 16rem，资源建议宽 ~512px 即 2x）；浮层高度按图片固有宽高比自适应，
// 若更换格式（png/webp 等）需同步修改下方 import 的扩展名
import blurPreview from './blur-preview.jpg'

/** 消息区显示偏好：仅影响本机视图（显示项默认开启，通知项默认关闭） */
export interface DisplaySettings {
  showIp: boolean
  showMac: boolean
  /** 安全模式：图片与视频封面默认高斯模糊 */
  safeMode: boolean
  /** 安全模式下的高斯模糊半径（px） */
  blurStrength: number
  /** 页内通知：他人来消息且当前不在该会话时弹横幅（无需权限） */
  pageNotification: boolean
  /** 系统通知：页面不可见时经操作系统提醒（需浏览器授权） */
  systemNotification: boolean
}

const IP_KEY = 'nw_show_ip'
const MAC_KEY = 'nw_show_mac'
const SAFE_MODE_KEY = 'nw_safe_mode'
const BLUR_STRENGTH_KEY = 'nw_blur_strength'
const PAGE_NOTIFICATION_KEY = 'nw_page_notification'
const SYSTEM_NOTIFICATION_KEY = 'nw_system_notification'

const BLUR_STRENGTH_DEFAULT = 8
const BLUR_STRENGTH_MAX = 24

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
    pageNotification: true,
    systemNotification: false,
  })

  useEffect(() => {
    setSettings({
      showIp: localStorage.getItem(IP_KEY) !== '0',
      showMac: localStorage.getItem(MAC_KEY) !== '0',
      safeMode: localStorage.getItem(SAFE_MODE_KEY) !== '0',
      blurStrength: readBlurStrength(),
      // 页内通知默认开（显式存过 '0' 才关，与显示项的 !== '0' 同构）；系统通知默认关（权限须用户主动授予）
      pageNotification: localStorage.getItem(PAGE_NOTIFICATION_KEY) !== '0',
      systemNotification: localStorage.getItem(SYSTEM_NOTIFICATION_KEY) === '1',
    })
  }, [])

  const update = (patch: Partial<DisplaySettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      if (patch.showIp != null) localStorage.setItem(IP_KEY, patch.showIp ? '1' : '0')
      if (patch.showMac != null) localStorage.setItem(MAC_KEY, patch.showMac ? '1' : '0')
      if (patch.safeMode != null) localStorage.setItem(SAFE_MODE_KEY, patch.safeMode ? '1' : '0')
      if (patch.blurStrength != null) localStorage.setItem(BLUR_STRENGTH_KEY, String(patch.blurStrength))
      if (patch.pageNotification != null) localStorage.setItem(PAGE_NOTIFICATION_KEY, patch.pageNotification ? '1' : '0')
      if (patch.systemNotification != null) localStorage.setItem(SYSTEM_NOTIFICATION_KEY, patch.systemNotification ? '1' : '0')
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
      <div className="w-64 overflow-hidden rounded-lg border bg-popover p-1 shadow-md">
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

interface NotificationSettingsSectionProps {
  settings: DisplaySettings
  onChange: (patch: Partial<DisplaySettings>) => void
  /** 系统 API 支持判定：null=尚未判定（首帧禁用占位）、false=非 secure 或无 API、true=按权限分态 */
  notifSupported: boolean | null
  permission: NotificationPermissionState | null
  /** 权限请求进行中：开关禁用防重复手势 */
  requesting: boolean
  /** 在用户手势内请求权限（仅 default 态的开启动作会触发） */
  onRequestPermission: () => void
}

/**
 * 通知设置节：页内通知（无需权限）+ 系统通知（secure context 三态 + 非 secure 降级）。
 * 导出供静态渲染测试逐态断言；真实 supported/permission 由 SettingsDialog 的 effect 判定。
 */
export function NotificationSettingsSection({
  settings,
  onChange,
  notifSupported,
  permission,
  requesting,
  onRequestPermission,
}: NotificationSettingsSectionProps) {
  // 系统通知描述随态变化：granted 后文案收敛为纯功能描述
  const systemDescription =
    permission === 'granted'
      ? '页面切到后台时，新消息经操作系统通知提醒，点击可跳回会话。'
      : '页面切到后台时，新消息经操作系统通知提醒，点击可跳回会话。开启时会请求浏览器授权。'

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">页内通知</p>
          <p className="text-xs text-muted-foreground">
            对方来消息而你没在看这个会话时，页面顶部弹出横幅提醒，点击可跳到该会话。无需浏览器授权。
          </p>
        </div>
        <Switch
          checked={settings.pageNotification}
          aria-label="页内通知"
          onCheckedChange={(checked) => onChange({ pageNotification: checked })}
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">系统通知</p>
          {notifSupported === false ? (
            // 非 secure context（默认 HTTP 局域网部署）：浏览器不暴露通知 API，纯文案降级（ADR 0003）
            <p className="text-xs text-muted-foreground">
              当前通过 HTTP 访问，浏览器不允许系统通知；需以 localhost 或 HTTPS 打开 net-wave 后再开启。
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{systemDescription}</p>
              {permission === 'denied' && (
                <p className="text-xs text-destructive">
                  通知权限已被浏览器拒绝：请点击地址栏左侧的网站设置图标，将「通知」改为「允许」，然后刷新本页重试。
                </p>
              )}
            </>
          )}
        </div>
        {notifSupported !== false && (
          <Switch
            checked={settings.systemNotification && permission === 'granted'}
            disabled={notifSupported == null || requesting || permission === 'denied'}
            aria-label="系统通知"
            onCheckedChange={(checked) => {
              if (!checked) {
                onChange({ systemNotification: false })
                return
              }
              // default 态的开启动作 = 用户手势，在此发起权限请求；denied 态已被 disabled 拦截
              if (permission === 'granted') onChange({ systemNotification: true })
              else onRequestPermission()
            }}
          />
        )}
      </div>
    </>
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
  // 系统通知能力判定：null=首帧未判定（禁用占位，一帧后校正，避免 SSR hydration 不一致）
  const [notifSupported, setNotifSupported] = useState<boolean | null>(null)
  const [permission, setPermission] = useState<NotificationPermissionState | null>(null)
  const [requesting, setRequesting] = useState(false)

  // Dialog open 时才挂载 Content，无 SSR 顾虑；isSecureContext 与 Notification 只在客户端可读
  useEffect(() => {
    const ok = typeof window !== 'undefined' && window.isSecureContext && 'Notification' in window
    setNotifSupported(ok)
    if (ok) setPermission(currentNotificationPermission())
  }, [])

  // 权限请求只在开关的用户手势内发起（浏览器要求）；被拒后落 denied 态显示恢复路径提示
  const requestSystemPermission = () => {
    setRequesting(true)
    Notification.requestPermission()
      .then((p) => {
        setPermission(p)
        onChange({ systemNotification: p === 'granted' })
      })
      .finally(() => setRequesting(false))
  }

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
          <NotificationSettingsSection
            settings={settings}
            onChange={onChange}
            notifSupported={notifSupported}
            permission={permission}
            requesting={requesting}
            onRequestPermission={requestSystemPermission}
          />
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
