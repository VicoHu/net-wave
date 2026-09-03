import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // 每个测试文件拉起独立 Next dev 实例；串行执行避免多实例编译争抢 CPU 导致的时序抖动
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
