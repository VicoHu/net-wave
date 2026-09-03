# 使用自定义 Node 服务器承载 Next.js（而非 next start）

实时在线列表与消息推送需要 WebSocket，而 Next.js App Router 不原生支持，因此以自定义 Node 服务器包装 Next.js 并在同端口挂载 WS。代价是放弃 `next start` 与 serverless / 边缘部署形态——net-wave 是长驻局域网进程，该代价无实际影响。
