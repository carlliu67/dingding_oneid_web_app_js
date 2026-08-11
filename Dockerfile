# 第一阶段：构建前端应用
FROM node:18-alpine AS frontend-builder

# 配置 Alpine 国内源（阿里云），加速系统包安装
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

WORKDIR /app

# 复制package.json和package-lock.json（单独复制以利用docker层缓存，依赖不变时跳过安装）
COPY package*.json ./

# 安装 sqlite3 原生模块编译所需的构建工具（prebuild 下载超时时回退到本地编译）
# py3-setuptools 提供 Python 3.12 移除的 distutils 模块（node-gyp 8.x 依赖）
# 同层安装并卸载，避免残留增大镜像体积
RUN apk add --no-cache python3 py3-setuptools make g++ \
    && export SETUPTOOLS_USE_DISTUTILS=local \
    && npm config set registry https://registry.npmmirror.com \
    && npm ci \
    && apk del python3 py3-setuptools make g++ \
    && npm cache clean --force

# 复制前端源代码
COPY src/ ./src/
COPY public/ ./public/
COPY .env ./

# 构建前端应用
RUN npm run build

# 第二阶段：运行后端应用（同时托管前端静态文件）
FROM node:18-alpine

# 配置 Alpine 国内源（阿里云），加速系统包安装
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

WORKDIR /app

# 复制package.json和package-lock.json
COPY package*.json ./

# 安装 sqlite3 原生模块编译所需的构建工具（prebuild 下载超时时回退到本地编译）
# py3-setuptools 提供 Python 3.12 移除的 distutils 模块（node-gyp 8.x 依赖）
# 同层安装并卸载，避免残留增大镜像体积
RUN apk add --no-cache python3 py3-setuptools make g++ \
    && export SETUPTOOLS_USE_DISTUTILS=local \
    && npm config set registry https://registry.npmmirror.com \
    && npm ci --omit=dev \
    && apk del python3 py3-setuptools make g++ \
    && npm cache clean --force

# 复制后端源代码
COPY server/ ./server/

# 复制配置文件（确保配置文件被正确拷贝到容器中）
COPY server/config/ ./server/config/
COPY src/config/ ./src/config/

# 注意：不将 .env 复制到最终镜像，避免敏感密钥（Client Secret、SecretKey、DB 密码等）固化进镜像层
# 后端环境变量通过 docker-compose.yml 的 env_file 在容器启动时注入（up -d 重建容器即生效）
# 前端构建所需的 REACT_APP_* 变量已在第一阶段（frontend-builder）使用，
# 该阶段的 .env 仅存在于中间层，不会进入最终镜像（多阶段构建天然隔离）

# 复制构建好的前端应用
COPY --from=frontend-builder /app/build ./build

# 暴露端口（前后端同端口）
EXPOSE 7000

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=7000

# 启动命令：后端服务同时托管前端静态文件，前后端复用同一端口
CMD ["node", "./server/server.js"]
