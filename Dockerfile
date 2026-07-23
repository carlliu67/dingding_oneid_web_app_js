# 第一阶段：构建前端应用
FROM node:18-alpine AS frontend-builder

WORKDIR /app

# 复制package.json和package-lock.json（单独复制以利用docker层缓存，依赖不变时跳过安装）
COPY package*.json ./

# 安装依赖并清理npm缓存（合并为一层，减少镜像体积与inode占用）
RUN npm ci && npm cache clean --force

# 复制前端源代码
COPY src/ ./src/
COPY public/ ./public/
COPY .env ./

# 构建前端应用
RUN npm run build

# 第二阶段：运行后端应用（同时托管前端静态文件）
FROM node:18-alpine

WORKDIR /app

# 复制package.json和package-lock.json
COPY package*.json ./

# 安装生产依赖并清理npm缓存（npm ci 基于lockfile，--omit=dev 跳过开发依赖）
RUN npm ci --omit=dev && npm cache clean --force

# 复制后端源代码
COPY server/ ./server/

# 复制配置文件（确保配置文件被正确拷贝到容器中）
COPY server/config/ ./server/config/
COPY src/config/ ./src/config/

# 复制环境变量文件
COPY .env ./

# 复制构建好的前端应用
COPY --from=frontend-builder /app/build ./build

# 暴露端口（前后端同端口）
EXPOSE 7000

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=7000

# 启动命令：后端服务同时托管前端静态文件，前后端复用同一端口
CMD ["node", "./server/server.js"]
