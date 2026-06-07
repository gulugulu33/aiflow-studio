# ============================================================
# FlowAI Studio Backend - Multi-stage Docker Build
# ============================================================
# Stage 1: Builder - 安装依赖 + 编译
# Stage 2: Runner - 精简运行镜像
#
# 竞品对标:
# - Dify: 多阶段构建，alpine 基础镜像
# - n8n: 多阶段构建，node:20-slim
# - FastGPT: 单阶段构建
# ============================================================

# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# 先复制依赖文件（利用 Docker 缓存层）
COPY package*.json ./
COPY prisma ./prisma/

# 安装所有依赖（包括 devDependencies）
RUN npm ci

# 复制源代码
COPY . .

# 生成 Prisma Client
RUN npx prisma generate

# 编译 TypeScript
RUN npm run build

# 移除 devDependencies
RUN npm prune --production

# Stage 2: Runner
FROM node:20-alpine AS runner

# 安装 dumb-init 用于正确处理信号
RUN apk add --no-cache dumb-init

WORKDIR /app

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# 从 builder 复制必要文件
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package*.json ./
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma

# 创建上传目录
RUN mkdir -p /app/uploads && chown nestjs:nodejs /app/uploads

# 切换到非 root 用户
USER nestjs

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# 使用 dumb-init 启动
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
