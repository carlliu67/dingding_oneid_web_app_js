# 使用官方 Node.js 镜像作为基础镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json（如果存在）
COPY package*.json ./

# 安装所有依赖（包括开发依赖，因为需要构建）
RUN npm install

# 安装 serve 包用于生产环境服务静态文件
RUN npm install --save-dev serve

# 复制整个应用代码
COPY . .

# 构建生产版本的前端
RUN npm run build

# 安装仅生产依赖（清理开发依赖）
RUN npm prune --production

# 创建必要的目录和配置文件备份
RUN mkdir -p logs data && \
    # 创建配置目录备份（用于后续挂载目录为空时恢复）
    cp -r /app/src/config /app/src/config.orig && \
    cp -r /app/server/config /app/server/config.orig

# 设置时区为中国时区
ENV TZ=Asia/Shanghai

# 创建启动脚本（仅支持 full 模式）
RUN echo '#!/bin/sh' > /app/docker-entrypoint.sh && \
    echo '' >> /app/docker-entrypoint.sh && \
    echo '# 检查服务器配置挂载目录是否为空' >> /app/docker-entrypoint.sh && \
    echo 'if [ -z "$(ls -A /app/server/config)" ]; then' >> /app/docker-entrypoint.sh && \
    echo '  echo "挂载的服务器配置目录为空，使用默认配置..."' >> /app/docker-entrypoint.sh && \
    echo '  cp -r /app/server/config.orig/* /app/server/config/ 2>/dev/null || true' >> /app/docker-entrypoint.sh && \
    echo 'fi' >> /app/docker-entrypoint.sh && \
    echo '# 检查前端配置挂载目录是否为空' >> /app/docker-entrypoint.sh && \
    echo 'if [ -z "$(ls -A /app/src/config)" ]; then' >> /app/docker-entrypoint.sh && \
    echo '  echo "挂载的前端配置目录为空，使用默认配置..."' >> /app/docker-entrypoint.sh && \
    echo '  cp -r /app/src/config.orig/* /app/src/config/ 2>/dev/null || true' >> /app/docker-entrypoint.sh && \
    echo 'fi' >> /app/docker-entrypoint.sh && \
    echo '' >> /app/docker-entrypoint.sh && \
    echo '# 启动完整服务' >> /app/docker-entrypoint.sh && \
    echo 'echo "Starting application..."' >> /app/docker-entrypoint.sh && \
    echo 'if [ "$NODE_ENV" = "production" ]; then' >> /app/docker-entrypoint.sh && \
    echo '  # 生产模式：后端 + 使用简单 HTTP 服务器的前端' >> /app/docker-entrypoint.sh && \
    echo '  echo "Using production build with simple HTTP server for frontend"' >> /app/docker-entrypoint.sh && \
    echo '  npm run start:server & npx serve -s build -l 7000' >> /app/docker-entrypoint.sh && \
    echo 'else' >> /app/docker-entrypoint.sh && \
    echo '  # 开发模式：使用 npm run start 启动完整服务' >> /app/docker-entrypoint.sh && \
    echo '  npm run start' >> /app/docker-entrypoint.sh && \
    echo 'fi' >> /app/docker-entrypoint.sh

# 给启动脚本执行权限
RUN chmod +x /app/docker-entrypoint.sh

# 暴露端口
EXPOSE 7000 7001 7002

# 设置入口点
ENTRYPOINT ["/app/docker-entrypoint.sh"]