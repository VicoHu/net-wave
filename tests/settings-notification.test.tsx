import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NotificationSettingsSection } from '../app/components/settings-dialog'
import type { DisplaySettings } from '../app/components/settings-dialog'

// 通知设置节的三态/降级渲染：renderToStaticMarkup 不执行 useEffect，
// notifSupported 即传入值，恰好可逐态断言（浏览器判定逻辑在 effect 内）。

const noop = () => {}

const settings = (overrides: Partial<DisplaySettings> = {}): DisplaySettings => ({
  showIp: true,
  showMac: true,
  safeMode: true,
  blurStrength: 8,
  pageNotification: false,
  systemNotification: false,
  ...overrides,
})

function renderSection(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(NotificationSettingsSection, {
      settings: settings(),
      onChange: noop,
      notifSupported: true,
      permission: 'granted',
      requesting: false,
      onRequestPermission: noop,
      ...overrides,
    }),
  )
}

describe('通知设置节渲染', () => {
  it('页内通知开关始终渲染，描述说明无需授权', () => {
    const html = renderSection()
    expect(html).toContain('页内通知')
    expect(html).toContain('无需浏览器授权')
    expect(html).toContain('aria-label="页内通知"')
  })

  it('首帧未判定（notifSupported=null）：系统通知开关以禁用态占位', () => {
    const html = renderSection({ notifSupported: null, permission: null })
    expect(html).toContain('aria-label="系统通知"')
    expect(html).toContain('data-disabled')
  })

  it('非 secure context：不渲染开关，显示 HTTP 降级提示', () => {
    const html = renderSection({ notifSupported: false })
    expect(html).toContain('当前通过 HTTP 访问')
    expect(html).toContain('localhost 或 HTTPS')
    expect(html).not.toContain('aria-label="系统通知"')
  })

  it('权限 default：开关可点，描述说明会请求授权', () => {
    const html = renderSection({ permission: 'default' })
    expect(html).toContain('aria-label="系统通知"')
    expect(html).toContain('开启时会请求浏览器授权')
    expect(html).not.toContain('data-disabled')
  })

  it('权限 granted：开关可点，描述为后台提醒文案', () => {
    const html = renderSection({ permission: 'granted' })
    expect(html).toContain('aria-label="系统通知"')
    expect(html).toContain('页面切到后台时')
    expect(html).not.toContain('data-disabled')
  })

  it('权限 denied：开关禁用恒关，显示恢复路径提示', () => {
    const html = renderSection({ permission: 'denied' })
    expect(html).toContain('aria-label="系统通知"')
    expect(html).toContain('data-disabled')
    expect(html).toContain('通知权限已被浏览器拒绝')
    expect(html).toContain('网站设置')
  })
})
