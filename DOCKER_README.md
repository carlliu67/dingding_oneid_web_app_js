# Docker 部署说明

本项目支持通过 Docker 进行部署，提供三种启动模式：front-end、back-end 和 webhook。

## 快速开始

### 1. 构建镜像

```bash
npm run docker:build
```

或者直接使用 Docker 命令：

```bash
docker build --tag dingding-oneid .
```

### 2. 配置文件

确保 `server/config/server_config.js` 文件存在并正确配置。可以从 `server_config_sample.js` 复制：

```bash
cp server/config/server_config_sample.js server/config/server_config.js
# 然后编辑配置文件，填入相关参数
```

### 3. 启动服务

#### 前端模式 (front-end)
仅启动 React 前端服务，端口 7000

```bash
npm run docker:run-front-end
```

#### 后端模式 (back-end)
仅启动后端服务，端口 7001，serverMode 设置为 "back-end"

```bash
npm run docker:run-back-end
```

#### Webhook 模式 (webhook)
仅启动 Webhook 服务，端口 7002，serverMode 设置为 "webhook"

```bash
npm run docker:run-webhook
```

#### 完整模式 (full)
同时启动前后端和 Webhook 服务，serverMode 设置为 "full"

```bash
npm run docker:run-full
```

## 管理命令

### 查看日志

```bash
npm run docker:logs
```

### 停止服务

```bash
npm run docker:stop
```

### 清理容器和镜像

```bash
npm run docker:clean
```

## 直接使用 Docker 命令

### 构建并运行指定模式

```bash
# 构建镜像
docker build --tag dingding-oneid .

# 运行前端模式
docker run -d -p 7000:7000 --name dingding-front-end dingding-oneid front-end

# 运行后端模式
docker run -d -p 7001:7001 --name dingding-back-end dingding-oneid back-end

# 运行 webhook 模式
docker run -d -p 7002:7002 -e PORT=7002 --name dingding-webhook dingding-oneid webhook

# 运行完整模式
docker run -d -p 7000:7000 -p 7001:7001 --name dingding-full dingding-oneid full
```

## 本地开发启动脚本

项目还提供了本地启动脚本 `start.sh`，支持相同的模式切换：

```bash
# 给脚本执行权限
chmod +x start.sh

# 启动不同模式
./start.sh front-end    # 前端模式
./start.sh back-end     # 后端模式
./start.sh webhook      # Webhook 模式
./start.sh full         # 完整模式（默认）
./start.sh help         # 查看帮助
```

## 端口说明

- **7000**: React 前端服务端口
- **7001**: 后端 API 服务端口
- **7002**: Webhook 服务端口（独立部署时，内部和外部都使用7002）

## 注意事项

1. 确保 `server_config.js` 中的配置正确
2. 生产环境建议使用环境变量或配置管理工具管理敏感信息
3. 数据库文件和日志文件建议挂载到宿主机以保证数据持久化
4. 使用 docker-compose profiles 可以灵活控制启动的服务组合

## 环境变量

可以通过环境变量覆盖默认配置：

```bash
# 设置端口
docker run -e PORT=7001 dingding-oneid back-end

# 设置 Node.js 环境
docker run -e NODE_ENV=production dingding-oneid full
```