# net-wave

局域网内的轻量聊天与文件传输服务中心。在一台常开的设备（PC / Mac / NAS / 树莓派）上运行，局域网内的节点用浏览器直接访问即可私聊、建房间、传文件——免注册、免登录。

- **服务中心（Hub）**：运行 net-wave 的设备，中转并持久化所有消息与文件
- **节点（Peer）**：通过浏览器接入的设备，以可修改的随机昵称标识身份

## 特性

- 免登录即用：节点首次访问自动分配身份与昵称
- 私聊与房间：两人会话、全员可自由加入的多人房间，历史消息持久化
- 文件与图片传输：经服务中心中转存储，重启后仍可回看下载
- WebSocket 实时推送：上线自动补投递离线期间的消息
- 管理中心：房间管理、节点 IP/MAC 展示，密码登录（含防暴力破解限流）
- 数据自持：SQLite 单文件存储，无外部依赖，备份即拷贝

## 技术栈

Next.js 15（App Router + 自定义 server）· React 19 · TypeScript · Semi UI / shadcn · Tailwind CSS v4 · better-sqlite3 · ws

## 本地开发

要求：Node.js ≥ 20，pnpm 10（`corepack enable` 后由 `packageManager` 字段自动启用）。

```bash
pnpm install
pnpm dev        # 开发模式，http://localhost:3000
pnpm test       # vitest 单元测试
pnpm typecheck  # tsc 类型检查
```

生产模式本地运行：`pnpm build && pnpm start`（`start` 会先构建再以 `tsx server.ts` 启动）。

## 环境变量

均非必填，通过 `.env.local` 或容器环境变量注入：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 服务中心监听端口 |
| `DATA_DIR` | `./data` | SQLite 数据库与上传文件的存储目录 |
| `ADMIN_PASSWORD` | 随机生成 | 管理中心登录密码；设置后每次启动以它为准，改环境变量即改密码 |

未设置 `ADMIN_PASSWORD` 时，首次启动会生成随机密码并打印到控制台（只打印一次，之后持久保存，重启不变）。

## Docker 部署

```bash
docker compose up -d --build
```

- 访问 `http://<宿主机IP>:3000`（宿主机端口可在项目根目录 `.env` 中用 `PORT` 覆盖）
- 消息与文件落在命名卷 `net-wave-data`（容器内 `/data`），升级、重建容器数据不丢
- 容器内置健康检查（`/api/health`），`docker ps` 可见健康状态

**管理员密码**：未通过环境变量设置时，从首启日志获取：

```bash
docker compose logs net-wave | grep 初始密码
```

**升级**：

```bash
git pull
docker compose up -d --build
```

**备份**：数据即一个卷，停机后拷贝即可（或直接备份挂载目录）：

```bash
docker compose stop
docker run --rm -v net-wave-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/net-wave-data.tar.gz -C /data .
docker compose start
```

> 注：容器网络隔离，节点 MAC 地址解析（依赖宿主机 ARP 缓存）在 Docker 部署下不可用，管理中心中 MAC 显示为未知；如需该能力，请用本地进程方式部署。

## 项目结构

```
server.ts            # 自定义 server：HTTP + WebSocket 升级 + 启动期逻辑
app/                 # Next.js 页面、组件与 API 路由
components/          # shadcn/ui 基础组件
lib/                 # 通用工具函数
src/                 # 领域逻辑：db / chat / rooms / peers / files / hub / admin
data/                # 运行时数据（SQLite 与上传文件，已 gitignore）
tests/               # vitest 测试
```

## License

ISC
