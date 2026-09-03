import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 家目录存在其他 lockfile 时避免 Next 推断错误的 workspace root
  outputFileTracingRoot: import.meta.dirname,
  transpilePackages: ['@douyinfe/semi-ui', '@douyinfe/semi-icons', '@douyinfe/semi-illustrations'],
}

export default nextConfig
