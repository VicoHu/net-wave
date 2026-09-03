import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export interface AppHandle {
  baseUrl: string
  wsUrl: string
  dataDir: string
  stop: () => Promise<void>
}

/**
 * 测试 harness：以随机端口 + 临时数据目录拉起真实服务实例（tsx server.ts），
 * 这是本仓库唯一的测试接缝——一切断言都通过 HTTP / WS 客户端从外部驱动。
 * 传入 dataDir 可在重启后复用同一数据目录（验证持久化）。
 */
export async function startApp(opts: { dataDir?: string } = {}): Promise<AppHandle> {
  const port = 20000 + Math.floor(Math.random() * 20000)
  const dataDir = opts.dataDir ?? mkdtempSync(join(tmpdir(), 'net-wave-test-'))
  const tsx = resolve(process.cwd(), 'node_modules/.bin/tsx')

  const child = spawn(tsx, ['server.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_ENV: 'development' },
    stdio: 'ignore',
  })

  const baseUrl = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 90_000
  for (;;) {
    if (Date.now() > deadline) {
      child.kill('SIGTERM')
      throw new Error(`服务实例启动超时: ${baseUrl}/api/health`)
    }
    try {
      const res = await fetch(`${baseUrl}/api/health`)
      if (res.ok) break
    } catch {
      // 尚未就绪，继续轮询
    }
    await new Promise((r) => setTimeout(r, 300))
  }

  return {
    baseUrl,
    wsUrl: `ws://127.0.0.1:${port}/ws`,
    dataDir,
    stop: async () => {
      child.kill('SIGTERM')
      await new Promise<void>((r) => child.once('exit', () => r()))
    },
  }
}
