#!/bin/zsh
# macOS 网关模式部署/升级：容器只绑定宿主机回环（默认 127.0.0.1:3801），
# 局域网流量统一经宿主机 lan-gateway 进入（真实 IP/MAC 由网关注入）。
# 前置：lan-gateway 已按 README 安装为 launchd 服务（对外 3800）。
set -euo pipefail
cd "$(dirname "$0")/.."
exec env NW_BIND=127.0.0.1 PORT="${GATEWAY_UPSTREAM_PORT:-3801}" docker compose up -d --build
