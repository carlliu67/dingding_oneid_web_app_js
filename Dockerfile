# 第一阶段：构建前端应用
FROM node:18-alpine AS frontend-builder

WORKDIR /app

# 复制package.json和package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制前端源代码
COPY src/ ./src/
COPY public/ ./public/
COPY .env ./

# 构建前端应用
RUN npm run build

# 第二阶段：构建后端应用并运行
FROM node:18-alpine

WORKDIR /app

# 复制package.json和package-lock.json
COPY package*.json ./

# 安装生产依赖
RUN npm install --only=production

# 复制后端源代码
COPY server/ ./server/

# 复制配置文件（确保配置文件被正确拷贝到容器中）
COPY server/config/ ./server/config/
COPY src/config/ ./src/config/

# 复制环境变量文件
COPY .env ./

# 复制构建好的前端应用
COPY --from=frontend-builder /app/build ./build

# 暴露端口
EXPOSE 7000
EXPOSE 7001

# 设置环境变量
ENV NODE_ENV=production

# 启动命令
CMD ["sh", "-c", "npm run start:server & npx serve -s build -l 7000"]