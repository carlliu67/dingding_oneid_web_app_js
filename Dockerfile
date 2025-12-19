# 使用官方 Node.js 镜像作为基础镜像
FROM node:18-alpine

# 安装必要的工具
RUN apk add --no-cache sed

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json（如果存在）
COPY package*.json ./

# 安装依赖
RUN npm install --only=production

# 复制整个应用代码
COPY . .

# 创建必要的目录
RUN mkdir -p logs data

# 设置时区为中国时区
ENV TZ=Asia/Shanghai

# 创建启动脚本
RUN echo '#!/bin/sh' > /app/docker-entrypoint.sh && \
    echo '' >> /app/docker-entrypoint.sh && \
    echo '# 获取启动模式参数' >> /app/docker-entrypoint.sh && \
    echo 'MODE=${1:-"full"}' >> /app/docker-entrypoint.sh && \
    echo '' >> /app/docker-entrypoint.sh && \
    echo 'case "$MODE" in' >> /app/docker-entrypoint.sh && \
    echo '  "front-end")' >> /app/docker-entrypoint.sh && \
    echo '    echo "Starting in front-end mode..."' >> /app/docker-entrypoint.sh && \
    echo '    npm run start:web' >> /app/docker-entrypoint.sh && \
    echo '    ;;' >> /app/docker-entrypoint.sh && \
    echo '  "back-end")' >> /app/docker-entrypoint.sh && \
    echo '    echo "Starting in back-end mode..."' >> /app/docker-entrypoint.sh && \
    echo '    sed -i "s/serverMode: \".*\"/serverMode: \"back-end\"/" ./server/config/server_config.js' >> /app/docker-entrypoint.sh && \
    echo '    npm run start:server' >> /app/docker-entrypoint.sh && \
    echo '    ;;' >> /app/docker-entrypoint.sh && \
    echo '  "webhook")' >> /app/docker-entrypoint.sh && \
    echo '    echo "Starting in webhook mode..."' >> /app/docker-entrypoint.sh && \
    echo '    sed -i "s/serverMode: \".*\"/serverMode: \"webhook\"/" ./server/config/server_config.js' >> /app/docker-entrypoint.sh && \
    echo '    npm run start:server' >> /app/docker-entrypoint.sh && \
    echo '    ;;' >> /app/docker-entrypoint.sh && \
    echo '  "full"|*)' >> /app/docker-entrypoint.sh && \
    echo '    echo "Starting in full mode..."' >> /app/docker-entrypoint.sh && \
    echo '    sed -i "s/serverMode: \".*\"/serverMode: \"full\"/" ./server/config/server_config.js' >> /app/docker-entrypoint.sh && \
    echo '    npm run start' >> /app/docker-entrypoint.sh && \
    echo '    ;;' >> /app/docker-entrypoint.sh && \
    echo 'esac' >> /app/docker-entrypoint.sh

# 给启动脚本执行权限
RUN chmod +x /app/docker-entrypoint.sh

# 暴露端口
EXPOSE 7000 7001 7002

# 设置入口点
ENTRYPOINT ["/app/docker-entrypoint.sh"]