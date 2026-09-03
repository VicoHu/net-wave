# 默认 HTTP 运行，HTTPS 作为可选配置

手机浏览器访问 `http://192.168.x.x` 属于非 secure context，`navigator.clipboard`（一键复制验证码）与系统通知等 API 不可用，这是浏览器硬约束。权衡后：默认以 HTTP 运行（零部署负担），非 secure context 下复制操作降级（自动全选文本引导手动复制）；同时支持通过环境变量配置证书路径启用 HTTPS，README 提供 mkcert 指引，需要完整复制体验的用户自行开启。
