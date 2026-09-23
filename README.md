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

### 客户端 IP 与 MAC（部署方式的影响）

默认桥接网络下，发布端口经 Docker NAT 中转，服务中心看到的来源地址是容器网桥网关——所有节点会显示同一个 IP（如 `192.168.117.1`），MAC 也无法解析。这是 Docker 桥接网络的平台限制，OrbStack / Docker Desktop 同样如此且无配置可绕（参考 [orbstack/orbstack#710](https://github.com/orbstack/orbstack/issues/710)）。

**Linux 宿主机（推荐）**——用 host 网络模式，IP 与 MAC 均可正确获取：

```bash
docker compose -f docker-compose.yml -f docker-compose.hostnet.yml up -d --build
```

此时服务中心直接监听宿主端口（`.env` 中 `PORT` 可覆盖，如 `PORT=3800`），浏览器访问 `http://<宿主机IP>:3800`。

**macOS（OrbStack / Docker Desktop）**——虚拟机网络无法保留局域网来源地址，改用「宿主机网关」部署：网关（`scripts/lan-gateway.mjs`，零依赖 Node 脚本）作为唯一对外入口，把真实 IP 与 MAC 以请求头注入给服务中心，容器照常运行。

1. 容器改为只监听宿主机 loopback（部署与升级都用这一条命令）：

   ```bash
   ./scripts/deploy-gateway.sh
   ```

2. 安装网关为 launchd 服务（开机自启、崩溃自动拉起）：

   ```bash
   cp scripts/com.net-wave.lan-gateway.plist ~/Library/LaunchAgents/
   # 编辑 plist，把 lan-gateway.mjs 的路径改成本机仓库的绝对路径
   launchctl load ~/Library/LaunchAgents/com.net-wave.lan-gateway.plist
   ```

3. 局域网照常访问 `http://<Mac的IP>:3800`（对外端口在 plist 的 `NW_GATEWAY_LISTEN` 与根目录 `.env` 的 `PORT` 中保持一致）。

此部署下 IP 与 MAC 均正确；不想加宿主进程的话，退路是在本机直接运行（`pnpm build && pnpm start`），同样两者皆准。

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
