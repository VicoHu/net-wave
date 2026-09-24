import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  // tsconfig 的 jsx: preserve 仅供 Next 读取；vitest(rolldown-vite) 转换 .tsx 需显式指定运行时
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      '@components': fileURLToPath(new URL('./components', import.meta.url)),
      '@lib': fileURLToPath(new URL('./lib', import.meta.url)),
      '@hooks': fileURLToPath(new URL('./hooks', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    // 每个测试文件拉起独立 Next dev 实例；串行执行避免多实例编译争抢 CPU 导致的时序抖动
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
