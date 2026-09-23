# syntax=docker/dockerfile:1

# ---------- 依赖安装：带原生模块编译工具链（better-sqlite3） ----------
FROM node:24-alpine AS deps
RUN apk add --no-cache python3 make g++ && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# onlyBuiltDependencies 已在 package.json 放行 better-sqlite3 的安装期构建
RUN pnpm install --frozen-lockfile

# ---------- 构建：产出 .next 并裁剪运行时不需要的依赖 ----------
FROM deps AS build
COPY . .
RUN pnpm build \
    # cache 是构建期增量缓存、trace 是构建追踪产物，运行镜像不需要
    && rm -rf .next/cache .next/trace \
    # 配置转译为 mjs：Next 启动期加载 .ts 配置会连带加载 SWC 与 typescript，
    # 换 .mjs 后两者皆可在运行镜像裁掉（已容器实测验证）；
    # esbuild 是 tsx 的传递依赖，经 .pnpm 虚拟store定位
    && ESBUILD=$(ls -d node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild | head -1) \
    && "$ESBUILD" next.config.ts --format=esm --outfile=next.config.mjs \
    && pnpm prune --prod \
    # 仅保留服务端实际需要的包。以下均为「删后容器冒烟（页面/静态资源/REST/WS/上传下载/管理登录）通过」的项：
    # - UI/客户端库：构建期已编译进 .next 产物
    # - @next/swc / typescript：仅 .ts 配置转译需要，已用 mjs 配置替代
    # - sharp：next/image 图片优化专用，本项目未使用
    # 注意 caniuse-lite 必须保留（Next 启动期 browserslist 依赖）
    && cd node_modules/.pnpm \
    && rm -rf @douyinfe+* lucide-react@* lottie-web@* date-fns@* date-fns-tz@* \
       @tiptap+* prosemirror-* @dnd-kit+* react-window@* prismjs@* lodash@* \
       @floating-ui+* micromark-* mdast-util-* qrcode@* \
       @next+swc-* sharp@* @img+* typescript@*

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
COPY --from=build --chown=node:node /app/next.config.mjs ./next.config.mjs
COPY --from=build --chown=node:node /app/server.ts ./server.ts
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/tsconfig.json ./tsconfig.json
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
CMD ["node_modules/.bin/tsx", "server.ts"]
