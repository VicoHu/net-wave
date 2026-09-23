# syntax=docker/dockerfile:1

# ---------- 依赖安装：带原生模块编译工具链（better-sqlite3） ----------
FROM node:24-alpine AS deps
RUN apk add --no-cache python3 make g++ && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# onlyBuiltDependencies 已在 package.json 放行 better-sqlite3 的安装期构建
RUN pnpm install --frozen-lockfile

# ---------- 构建：产出 .next ----------
FROM deps AS build
COPY . .
RUN pnpm build && pnpm prune --prod

# ---------- 运行时：不含编译工具链，仅保留生产依赖 ----------
FROM node:24-alpine AS runner
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000
WORKDIR /app
# 生产 node_modules（含已编译的 better-sqlite3）与运行所需源文件；
# app/ 已编译进 .next，无需复制
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/next.config.ts ./next.config.ts
COPY --from=build --chown=node:node /app/server.ts ./server.ts
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/tsconfig.json ./tsconfig.json
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
CMD ["node_modules/.bin/tsx", "server.ts"]
