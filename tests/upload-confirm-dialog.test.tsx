import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { UploadConfirmBody, type PendingUpload } from '../app/components/upload-confirm-dialog'

// 上传确认弹窗主体的受控渲染：待发清单、默认全选的勾选框、汇总按钮文案。
// Radix Dialog 走 Portal 无法静态渲染，因此断言其内部的受控内容组件。

const noop = () => {}

function renderContent(pending: PendingUpload[], checked?: Record<number, boolean>) {
  return renderToStaticMarkup(
    createElement(UploadConfirmBody, {
      pending,
      checked: checked ?? Object.fromEntries(pending.map((p) => [p.key, true])),
      onToggle: noop,
      onConfirm: noop,
      onCancel: noop,
    }),
  )
}

function fixture(files: [string, number, string][]): PendingUpload[] {
  return files.map(([name, size, type], i) => ({ key: i + 1, file: new File([new Uint8Array(size)], name, { type }) }))
}

describe('上传确认弹窗渲染', () => {
  it('列出全部待发文件与大小，勾选框默认全选', () => {
    const html = renderContent(fixture([
      ['截图.png', 1024, 'image/png'],
      ['安装包.zip', 2048, 'application/zip'],
    ]))
    expect(html).toContain('截图.png')
    expect(html).toContain('安装包.zip')
    expect(html).toContain('1.0 KB')
    expect(html).toContain('2.0 KB')
    expect(html).toContain('发送 2 个')
    // 每个文件一枚勾选框且默认选中
    expect(html.match(/type="checkbox"/g)?.length).toBe(2)
    expect(html).toContain('checked')
  })

  it('剔除勾选后：按钮文案按剩余数量更新，全部剔除时禁用', () => {
    const two = fixture([
      ['截图.png', 1024, 'image/png'],
      ['安装包.zip', 2048, 'application/zip'],
    ])
    expect(renderContent(two, { 1: true, 2: false })).toContain('发送 1 个')
    expect(renderContent(two, { 1: false, 2: false })).toContain('disabled')
  })

  it('空清单：发送按钮禁用，不出现文件行', () => {
    const html = renderContent([])
    expect(html).not.toContain('type="checkbox"')
    expect(html).toContain('disabled')
  })
})
