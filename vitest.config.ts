import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // 测试拉起真实 Next 服务实例（dev 模式冷启动较慢），放宽超时
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
